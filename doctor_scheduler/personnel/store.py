"""SQLite personnel status and salted password hashes; no login sessions."""

from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import re
import secrets
import sqlite3
import time

IST = timezone(timedelta(hours=5, minutes=30))
STATES = {"present", "absent", "unconfirmed"}
ITERATIONS = 600_000


class UpdateError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


def hash_password(password):
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), ITERATIONS)
    return f"pbkdf2_sha256${ITERATIONS}${salt}${digest.hex()}"


def verify_password(password, encoded):
    algorithm, rounds, salt, expected = encoded.split("$")
    if algorithm != "pbkdf2_sha256" or int(rounds) != ITERATIONS:
        return False
    actual = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), int(rounds))
    return hmac.compare_digest(actual.hex(), expected)


@contextmanager
def connect(path):
    db = sqlite3.connect(path, timeout=30)
    db.row_factory = sqlite3.Row
    try:
        with db:
            yield db
    finally:
        db.close()


def initialize(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with connect(path) as db:
        # Keep the old personnel/history columns so existing records remain usable.
        db.executescript("""
            CREATE TABLE IF NOT EXISTS staff_users (
                username TEXT PRIMARY KEY, password_hash TEXT NOT NULL,
                enabled INTEGER NOT NULL CHECK(enabled IN (0,1)) DEFAULT 1
            );
            CREATE TABLE IF NOT EXISTS attendance (
                date TEXT NOT NULL, doctor TEXT NOT NULL,
                state TEXT NOT NULL CHECK(state IN ('present','absent','unconfirmed')),
                note TEXT NOT NULL DEFAULT '', updated_by TEXT NOT NULL,
                updated_at TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
                PRIMARY KEY(date, doctor)
            );
            CREATE TABLE IF NOT EXISTS attendance_history (
                id INTEGER PRIMARY KEY, date TEXT NOT NULL, doctor TEXT NOT NULL,
                previous_state TEXT NOT NULL, state TEXT NOT NULL, note TEXT NOT NULL,
                updated_by TEXT NOT NULL, updated_at TEXT NOT NULL, revision INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS auth_attempts (peer TEXT NOT NULL, attempted_at REAL NOT NULL);
        """)


def set_user(path, username, password):
    if not re.fullmatch(r"[A-Za-z0-9_.-]{1,64}", username):
        raise ValueError("Username: use 1-64 letters, digits, dots, underscores or hyphens")
    if not isinstance(password, str) or not 12 <= len(password) <= 256:
        raise ValueError("Use a password of 12-256 characters")
    initialize(path)
    encoded = hash_password(password)
    with connect(path) as db:
        db.execute("INSERT INTO staff_users VALUES (?,?,1) ON CONFLICT(username) DO UPDATE SET password_hash=excluded.password_hash, enabled=1", (username, encoded))


def authenticate(path, username, password, peer):
    if not isinstance(username, str) or not isinstance(password, str) or len(username) > 64 or len(password) > 256:
        raise UpdateError(400, "Invalid credentials format.")
    with connect(path) as db:
        db.execute("BEGIN IMMEDIATE")
        now = time.time()
        db.execute("DELETE FROM auth_attempts WHERE attempted_at <= ?", (now - 300,))
        total, personal = db.execute("SELECT count(*), coalesce(sum(peer = ?),0) FROM auth_attempts", (peer,)).fetchone()
        if total >= 30 or personal >= 5:
            raise UpdateError(429, "Too many attempts. Try again in five minutes.")
        db.execute("INSERT INTO auth_attempts VALUES (?,?)", (peer, now))
        row = db.execute("SELECT password_hash, enabled FROM staff_users WHERE username=?", (username,)).fetchone()
    # Unknown accounts cost the same hash work. Attempts persist across CGI processes.
    dummy = f"pbkdf2_sha256${ITERATIONS}${'00' * 16}${'00' * 32}"
    matches = verify_password(password, row["password_hash"] if row else dummy)
    if not matches or not row or not row["enabled"]:
        raise UpdateError(401, "Incorrect username or password.")


def read_day(path, day):
    with connect(path) as db:
        return {row["doctor"]: dict(row) for row in db.execute("SELECT * FROM attendance WHERE date=?", (day,))}


def save(path, username, password, peer, day, updates, doctor_names, now=None):
    now = (now or datetime.now(IST)).astimezone(IST)
    if day != now.date().isoformat():
        raise UpdateError(409, "The date has changed. Reload the form before saving.")
    if not isinstance(updates, dict) or not updates or len(updates) > len(doctor_names):
        raise UpdateError(400, "Choose at least one person to update.")
    if any(name not in doctor_names or not isinstance(state, str) or state not in STATES for name, state in updates.items()):
        raise UpdateError(400, "Invalid person or status.")
    authenticate(path, username, password, peer)
    with connect(path) as db:
        db.execute("BEGIN IMMEDIATE")
        # Recheck enabled state after authentication, in the write transaction.
        if not db.execute("SELECT 1 FROM staff_users WHERE username=? AND enabled=1", (username,)).fetchone():
            raise UpdateError(401, "Incorrect username or password.")
        for name, state in updates.items():
            previous = db.execute("SELECT state, revision FROM attendance WHERE date=? AND doctor=?", (day, name)).fetchone()
            revision = previous["revision"] + 1 if previous else 1
            db.execute("INSERT INTO attendance (date,doctor,state,note,updated_by,updated_at,revision) VALUES (?,?,?,'',?,?,?) ON CONFLICT(date,doctor) DO UPDATE SET state=excluded.state, updated_by=excluded.updated_by, updated_at=excluded.updated_at, revision=excluded.revision",
                       (day, name, state, username, now.isoformat(), revision))
            db.execute("INSERT INTO attendance_history (date,doctor,previous_state,state,note,updated_by,updated_at,revision) VALUES (?,?,?,?,'',?,?,?)",
                       (day, name, previous["state"] if previous else "unconfirmed", state, username, now.isoformat(), revision))
