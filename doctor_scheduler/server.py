"""Serve the scheduler and refresh its shared Sheets snapshot every 120 seconds."""

import argparse
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import logging
from logging.handlers import RotatingFileHandler
import os
import threading
import time
from urllib.parse import urlsplit

from admin.service import AdminError, AdminService
from roster import fetch_roster
from sheets_client import ROOT, SPREADSHEET_ID, REFRESH_SECONDS, ReadCooldown, SheetsClient

IST = timezone(timedelta(hours=5, minutes=30))
PUBLIC_FILES = {
    "/": ("index.html", "text/html; charset=utf-8"),
    "/index.html": ("index.html", "text/html; charset=utf-8"),
    "/styles.css": ("styles.css", "text/css; charset=utf-8"),
    "/app.js": ("app.js", "text/javascript; charset=utf-8"),
    "/schedule.js": ("schedule.js", "text/javascript; charset=utf-8"),
    "/admin": ("admin/index.html", "text/html; charset=utf-8"),
    "/admin/": ("admin/index.html", "text/html; charset=utf-8"),
    "/admin/index.html": ("admin/index.html", "text/html; charset=utf-8"),
    "/admin/admin.css": ("admin/admin.css", "text/css; charset=utf-8"),
    "/admin/admin.js": ("admin/admin.js", "text/javascript; charset=utf-8"),
}


class RosterStore:
    def __init__(self, loader, cache_path=None):
        self.loader = loader
        self.cache_path = cache_path
        self.lock = threading.Lock()
        self.data = None
        self.updated_at = None
        self.failed = False
        self.refreshing = False
        self.next_refresh_at = time.time()
        if cache_path and cache_path.exists():
            try:
                cached = json.loads(cache_path.read_text(encoding="utf-8"))
                if cached["spreadsheet_id"] == SPREADSHEET_ID and cached["version"] == 1:
                    self.data = cached["data"]
                    self.updated_at = cached["updated_at"]
                    self.failed = True
            except (OSError, ValueError, KeyError):
                logging.warning("Ignoring unreadable roster cache")

    def refresh(self):
        started = time.time()
        retry_at = started + REFRESH_SECONDS
        with self.lock:
            self.refreshing = True
        try:
            data = self.loader()
            updated_at = datetime.now(timezone.utc).isoformat()
            with self.lock:
                self.data, self.updated_at, self.failed = data, updated_at, False
            if self.cache_path:
                try:
                    self.cache_path.parent.mkdir(exist_ok=True)
                    temporary = self.cache_path.with_suffix(".tmp")
                    temporary.write_text(json.dumps({"version": 1, "spreadsheet_id": SPREADSHEET_ID,
                        "data": data, "updated_at": updated_at}), encoding="utf-8")
                    temporary.replace(self.cache_path)
                except OSError:
                    logging.warning("Unable to save roster cache; in-memory data is available")
            logging.info("Roster refreshed: %d doctors, %d dates", len(data["doctors"]), len(data["schedule"]))
        except ReadCooldown as cooldown:
            retry_at = cooldown.retry_at
        except Exception as error:
            with self.lock:
                self.failed = True
            logging.warning("Roster refresh failed (%s); retaining last successful data", type(error).__name__)
        finally:
            with self.lock:
                self.refreshing = False
                self.next_refresh_at = max(retry_at, time.time() + 1)

    def run(self, stop):
        while not stop.is_set():
            self.refresh()
            stop.wait(max(0, self.next_refresh_at - time.time()))

    def snapshot(self):
        with self.lock:
            age = (datetime.now(timezone.utc) - datetime.fromisoformat(self.updated_at)).total_seconds() if self.updated_at else None
            stale = self.failed or (age is not None and age > REFRESH_SECONDS + 30)
            status = "stale" if self.data and stale else "ok" if self.data else "unavailable" if self.failed else "loading"
            now = datetime.now(IST)
            monday = now.date() - timedelta(days=now.weekday())
            week = [(monday + timedelta(days=i)).isoformat() for i in range(7)]
            data = {**self.data, "schedule": {day: self.data["schedule"][day] for day in week if day in self.data["schedule"]}} if self.data else {}
            return {**data, "staff": [], "status": status, "updated_at": self.updated_at,
                    "refreshing": self.refreshing, "refresh_seconds": REFRESH_SECONDS,
                    "next_refresh_at": self.next_refresh_at, "server_time": now.isoformat()}


class ScheduleHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        logging.info("%s %r", self.address_string(), format % args)

    def do_GET(self):
        self.respond()

    def do_HEAD(self):
        self.respond(head=True)

    def do_POST(self):
        path = urlsplit(self.path).path
        if path not in {"/api/admin/login", "/api/admin/logout", "/api/admin/attendance"}:
            self.send_json({"error": "Not found"}, 404)
            return
        try:
            if self.headers.get_content_type() != "application/json":
                raise AdminError(415, "Send JSON content.")
            if self.headers.get("Transfer-Encoding") or len(self.headers.get_all("Content-Length", [])) != 1:
                raise AdminError(400, "A single Content-Length header is required.")
            try:
                length = int(self.headers["Content-Length"])
            except ValueError:
                raise AdminError(400, "Invalid request length.") from None
            if not 0 < length <= 8192:
                raise AdminError(413, "Request is too large or empty.")
            self.connection.settimeout(5)
            raw = self.rfile.read(length)
            if len(raw) != length:
                raise AdminError(400, "Incomplete request.")
            try:
                payload = json.loads(raw.decode("utf-8"))
            except (ValueError, UnicodeError):
                raise AdminError(400, "Invalid JSON content.") from None
            result, headers = self.server.admin.post(path, self.headers, payload, self.client_address[0])
            self.send_json(result, headers=headers)
        except AdminError as error:
            self.send_json({"error": str(error)}, error.status)
        except TimeoutError:
            self.send_json({"error": "Request timed out."}, 408)
        except Exception as error:
            logging.error("Admin request failed (%s)", type(error).__name__)
            self.send_json({"error": "The request could not be completed. Please try again."}, 500)

    def send_json(self, payload, status=200, headers=(), head=False):
        self.send_content(json.dumps(payload).encode("utf-8"), status,
                          "application/json; charset=utf-8", headers, head)

    def respond(self, head=False):
        path = urlsplit(self.path).path
        if path.startswith("/api/admin/"):
            try:
                self.send_json(self.server.admin.get(path, self.headers.get("Cookie")), head=head)
            except AdminError as error:
                self.send_json({"error": str(error)}, error.status, head=head)
            except Exception as error:
                logging.error("Admin read failed (%s)", type(error).__name__)
                self.send_json({"error": "Attendance is temporarily unavailable."}, 500, head=head)
            return
        if path == "/api/schedule":
            payload = self.server.store.snapshot()
            try:
                payload["attendance"] = self.server.admin.public_attendance(payload)
            except Exception as error:
                logging.error("Public attendance read failed (%s)", type(error).__name__)
                payload["attendance"] = {"status": "unavailable", "records": []}
            body = json.dumps(payload).encode("utf-8")
            status = 200 if "doctors" in payload else 503
            mime = "application/json; charset=utf-8"
        elif path in PUBLIC_FILES:
            filename, mime = PUBLIC_FILES[path]
            body = (ROOT / filename).read_bytes()
            status = 200
        else:
            body, mime, status = b"Not found", "text/plain; charset=utf-8", 404
        self.send_content(body, status, mime, head=head)

    def send_content(self, body, status, mime, headers=(), head=False):
        self.send_response(status)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; object-src 'none'")
        for name, value in headers:
            self.send_header(name, value)
        self.end_headers()
        if not head:
            self.wfile.write(body)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8080")))
    args = parser.parse_args()
    username = os.environ.get("IHC_ADMIN_USERNAME", "user123")
    password = os.environ.get("IHC_ADMIN_PASSWORD", "1234")
    origin = os.environ.get("IHC_ADMIN_ORIGIN", "")
    secure_cookie = os.environ.get("IHC_COOKIE_SECURE", "").lower() == "true"
    if args.host not in {"127.0.0.1", "localhost", "::1"}:
        if len(password) < 12 or password == "1234" or not secure_cookie or not origin.startswith("https://"):
            parser.error("Non-local admin access requires a 12+ character IHC_ADMIN_PASSWORD, HTTPS IHC_ADMIN_ORIGIN, and IHC_COOKIE_SECURE=true.")
    log_dir = ROOT / "logs"
    log_dir.mkdir(exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(message)s",
        handlers=[
            RotatingFileHandler(log_dir / "server.log", maxBytes=2_000_000,
                                backupCount=3, encoding="utf-8"),
            logging.StreamHandler(),
        ],
    )
    client = SheetsClient()
    store = RosterStore(lambda: fetch_roster(client), ROOT / ".cache" / "roster.json")
    server = ThreadingHTTPServer((args.host, args.port), ScheduleHandler)
    server.store = store
    origins = [origin] if origin else [f"http://127.0.0.1:{args.port}", f"http://localhost:{args.port}"]
    server.admin = AdminService(ROOT / "storage" / "attendance.sqlite", store, origins,
                                username, password, secure_cookie)
    stop = threading.Event()
    worker = threading.Thread(target=store.run, args=(stop,), daemon=True)
    worker.start()
    logging.info("IHC schedule: http://%s:%s (Google Sheets refresh: 120 seconds)", args.host, args.port)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        stop.set()
        server.server_close()


if __name__ == "__main__":
    main()
