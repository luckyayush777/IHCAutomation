"""Serve the scheduler and refresh its shared Sheets snapshot every 120 seconds."""

import argparse
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import logging
import os
import threading
import time
from urllib.parse import urlsplit

from roster import fetch_roster
from sheets_client import ROOT, SPREADSHEET_ID, REFRESH_SECONDS, ReadCooldown, SheetsClient

IST = timezone(timedelta(hours=5, minutes=30))
PUBLIC_FILES = {
    "/": ("index.html", "text/html; charset=utf-8"),
    "/index.html": ("index.html", "text/html; charset=utf-8"),
    "/styles.css": ("styles.css", "text/css; charset=utf-8"),
    "/app.js": ("app.js", "text/javascript; charset=utf-8"),
    "/schedule.js": ("schedule.js", "text/javascript; charset=utf-8"),
    "/assets/portrait.svg": ("assets/portrait.svg", "image/svg+xml"),
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
    def do_GET(self):
        self.respond()

    def do_HEAD(self):
        self.respond(head=True)

    def respond(self, head=False):
        path = urlsplit(self.path).path
        if path == "/api/schedule":
            payload = self.server.store.snapshot()
            body = json.dumps(payload).encode("utf-8")
            status = 200 if "doctors" in payload else 503
            mime = "application/json; charset=utf-8"
        elif path in PUBLIC_FILES:
            filename, mime = PUBLIC_FILES[path]
            body = (ROOT / filename).read_bytes()
            status = 200
        else:
            body, mime, status = b"Not found", "text/plain; charset=utf-8", 404
        self.send_response(status)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'")
        self.end_headers()
        if not head:
            self.wfile.write(body)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8080")))
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
    client = SheetsClient()
    store = RosterStore(lambda: fetch_roster(client), ROOT / ".cache" / "roster.json")
    server = ThreadingHTTPServer((args.host, args.port), ScheduleHandler)
    server.store = store
    stop = threading.Event()
    worker = threading.Thread(target=store.run, args=(stop,), daemon=True)
    worker.start()
    print(f"IHC schedule: http://{args.host}:{args.port} (Google Sheets refresh: 120 seconds)", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        stop.set()
        server.server_close()


if __name__ == "__main__":
    main()
