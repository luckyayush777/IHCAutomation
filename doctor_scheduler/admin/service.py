"""Authenticated, date-scoped attendance records and their audit history."""

from datetime import datetime, timedelta, timezone
from contextlib import contextmanager
import hashlib
import hmac
from http.cookies import SimpleCookie, CookieError
import secrets
import sqlite3
import threading
import time

IST = timezone(timedelta(hours=5, minutes=30))
STATES = {"present", "absent", "unconfirmed"}
SESSION_SECONDS = 8 * 60 * 60
COOKIE_NAME = "ihc_admin_session"


class AdminError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


class AdminService:
    def __init__(self, database, roster, origins, username="user123", password="1234",
                 secure_cookie=False, now=None):
        self.database = database
        self.roster = roster
        self.origins = set(origins)
        self.username = username
        self.salt = secrets.token_bytes(16)
        self.password_hash = self.hash_password(password)
        self.secure_cookie = secure_cookie
        self.demo = username == "user123" and password == "1234"
        self.now = now or (lambda: datetime.now(IST))
        self.sessions = {}
        self.attempts = {}
        self.lock = threading.Lock()
        database.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS attendance (
                    date TEXT NOT NULL, doctor TEXT NOT NULL,
                    state TEXT NOT NULL CHECK(state IN ('present', 'absent', 'unconfirmed')),
                    note TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL,
                    revision INTEGER NOT NULL, PRIMARY KEY(date, doctor)
                );
                CREATE TABLE IF NOT EXISTS attendance_history (
                    id INTEGER PRIMARY KEY, date TEXT NOT NULL, doctor TEXT NOT NULL,
                    previous_state TEXT NOT NULL, state TEXT NOT NULL, note TEXT NOT NULL,
                    updated_by TEXT NOT NULL, updated_at TEXT NOT NULL, revision INTEGER NOT NULL
                );
            """)

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.database, timeout=5)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def hash_password(self, password):
        return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), self.salt, 600_000)

    def cookie(self, token="", clear=False):
        return (f"{COOKIE_NAME}={token}; Path=/api/admin; HttpOnly; SameSite=Strict; "
                f"Max-Age={0 if clear else SESSION_SECONDS}" + ("; Secure" if self.secure_cookie else ""))

    def session(self, cookie_header):
        cookie = SimpleCookie()
        try:
            cookie.load(cookie_header or "")
            token = cookie[COOKIE_NAME].value if COOKIE_NAME in cookie else ""
        except CookieError:
            token = ""
        with self.lock:
            self.sessions = {key: value for key, value in self.sessions.items() if value["expires"] > time.time()}
            return token, self.sessions.get(token)

    def require_session(self, cookie_header):
        token, session = self.session(cookie_header)
        if session is None:
            raise AdminError(401, "Please sign in again.")
        return token, session

    def get(self, path, cookie_header):
        if path == "/api/admin/session":
            _, session = self.session(cookie_header)
            if not session:
                return {"authenticated": False, "demo": self.demo}
            return {"authenticated": True, "username": self.username,
                    "csrf_token": session["csrf"], "demo": self.demo}
        if path == "/api/admin/attendance":
            self.require_session(cookie_header)
            return self.today()
        raise AdminError(404, "Not found")

    def post(self, path, headers, payload, peer):
        if headers.get("Origin") not in self.origins or headers.get("X-IHC-Request") != "1":
            raise AdminError(403, "Request origin could not be verified.")
        if not isinstance(payload, dict):
            raise AdminError(400, "Expected a JSON object.")
        if path == "/api/admin/login":
            return self.login(payload, peer, headers.get("Cookie"))
        token, session = self.require_session(headers.get("Cookie"))
        if not hmac.compare_digest(headers.get("X-CSRF-Token", "").encode("utf-8"), session["csrf"].encode("utf-8")):
            raise AdminError(403, "Session verification failed. Sign in again.")
        if path == "/api/admin/logout":
            with self.lock:
                self.sessions.pop(token, None)
            return {"authenticated": False}, [("Set-Cookie", self.cookie(clear=True))]
        if path == "/api/admin/attendance":
            self.save(payload)
            return self.today(), []
        raise AdminError(404, "Not found")

    def login(self, payload, peer, cookie_header):
        username, password = payload.get("username"), payload.get("password")
        if not isinstance(username, str) or not isinstance(password, str) or len(username) > 100 or len(password) > 256:
            raise AdminError(400, "Invalid sign-in details.")
        now = time.time()
        with self.lock:
            self.attempts = {key: [stamp for stamp in stamps if stamp > now - 300]
                             for key, stamps in self.attempts.items() if any(stamp > now - 300 for stamp in stamps)}
            # Count attempts before password hashing, and cap total work across peers.
            if len(self.attempts.get(peer, [])) >= 5 or sum(map(len, self.attempts.values())) >= 30:
                raise AdminError(429, "Too many sign-in attempts. Try again in five minutes.")
            self.attempts.setdefault(peer, []).append(now)
        password_matches = hmac.compare_digest(self.hash_password(password), self.password_hash)
        username_matches = hmac.compare_digest(username.encode("utf-8"), self.username.encode("utf-8"))
        if not (username_matches and password_matches):
            raise AdminError(401, "Incorrect username or password.")
        previous, _ = self.session(cookie_header)
        token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        with self.lock:
            if len(self.sessions) >= 100:
                raise AdminError(429, "Too many active sessions. Try again later.")
            self.sessions.pop(previous, None)
            self.sessions[token] = {"csrf": csrf, "expires": now + SESSION_SECONDS}
        return {"authenticated": True, "username": self.username, "csrf_token": csrf,
                "demo": self.demo}, [("Set-Cookie", self.cookie(token))]

    def public_attendance(self, roster):
        """Publish only today's presence; never expose notes, actors or history."""
        day = datetime.fromisoformat(roster["server_time"]).astimezone(IST).date().isoformat()
        names = {doctor["name"] for doctor in roster.get("doctors", [])}
        with self.connect() as db:
            records = [{"name": row["doctor"], "state": row["state"], "updated_at": row["updated_at"]}
                       for row in db.execute(
                           "SELECT doctor, state, updated_at FROM attendance WHERE date = ?", (day,))
                       if row["doctor"] in names]
        return {"date": day, "status": "ok", "records": records}

    def today(self):
        now = self.now().astimezone(IST)
        day = now.date().isoformat()
        roster = self.roster.snapshot()
        if "doctors" not in roster:
            raise AdminError(503, "Doctor profiles are not available yet. Try again shortly.")
        shifts = roster.get("schedule", {}).get(day)
        minutes = now.hour * 60 + now.minute
        with self.connect() as db:
            records = {row["doctor"]: dict(row) for row in db.execute("SELECT * FROM attendance WHERE date = ?", (day,))}
        doctors = []
        for profile in roster["doctors"]:
            planned = [shift for shift in shifts or [] if shift["name"] == profile["name"]]
            presence = records.get(profile["name"], {"state": "unconfirmed", "note": "", "revision": 0,
                                                     "updated_by": None, "updated_at": None})
            doctors.append({"name": profile["name"], "role": profile["role"], "qual": profile["qual"],
                            "shifts": [{"start": shift["start"], "end": shift["end"]} for shift in planned],
                            "scheduled_now": any(shift["start"] <= minutes < shift["end"] for shift in planned),
                            "presence": {key: presence[key] for key in ("state", "note", "revision", "updated_by", "updated_at")}})
        return {"date": day, "server_time": now.isoformat(), "doctors": doctors,
                "roster_published": shifts is not None, "roster_status": roster["status"],
                "roster_checked_at": roster.get("updated_at")}

    def save(self, payload):
        if set(payload) != {"date", "doctor", "state", "note", "revision"}:
            raise AdminError(400, "Invalid attendance fields.")
        doctor, state, note, revision = (payload[key] for key in ("doctor", "state", "note", "revision"))
        if not isinstance(doctor, str) or not isinstance(state, str) or state not in STATES:
            raise AdminError(400, "Choose a valid doctor and attendance status.")
        if not isinstance(note, str) or len(note) > 300 or any(ord(char) < 32 and char not in "\n\t" for char in note):
            raise AdminError(400, "Notes must be plain text, up to 300 characters.")
        if type(revision) is not int or revision < 0:
            raise AdminError(400, "Invalid record revision.")
        now = self.now().astimezone(IST)
        day = now.date().isoformat()
        if payload["date"] != day:
            raise AdminError(409, "The date has changed. Reload today's attendance before saving.")
        roster = self.roster.snapshot()
        if "doctors" not in roster:
            raise AdminError(503, "Doctor profiles are unavailable. Your change was not saved.")
        if doctor not in {profile["name"] for profile in roster["doctors"]}:
            raise AdminError(400, "Doctor is not in the current roster directory.")
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            previous = db.execute("SELECT * FROM attendance WHERE date = ? AND doctor = ?", (day, doctor)).fetchone()
            current_revision = previous["revision"] if previous else 0
            if revision != current_revision:
                raise AdminError(409, "Someone has updated this doctor. Reload and review their change before saving.")
            stamp = now.isoformat()
            db.execute("INSERT OR REPLACE INTO attendance VALUES (?, ?, ?, ?, ?, ?, ?)",
                       (day, doctor, state, note.strip(), self.username, stamp, revision + 1))
            db.execute("INSERT INTO attendance_history (date, doctor, previous_state, state, note, updated_by, updated_at, revision) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                       (day, doctor, previous["state"] if previous else "unconfirmed", state,
                        note.strip(), self.username, stamp, revision + 1))
