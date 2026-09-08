"""Run the real form and generator on loopback for manual browser testing only."""

import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import logging
import os
import secrets
import socket
from urllib.parse import urlsplit

from build_health_centre import atomic_write, build, read_cache
from personnel.handler import handle
from personnel.store import set_user
from settings import ROOT, Settings, load_settings


class PreviewServer(ThreadingHTTPServer):
    # Windows address reuse can let a second preview bind the same port.
    allow_reuse_address = os.name != "nt"

    def server_bind(self):
        if os.name == "nt":
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


class PreviewHandler(BaseHTTPRequestHandler):
    def setup(self):
        super().setup()
        self.connection.settimeout(10)

    def respond(self):
        url = urlsplit(self.path)
        settings = self.server.settings
        if self.headers.get("Host") != urlsplit(settings.origin).netloc:
            self.send_error(403, "Open the printed 127.0.0.1 URL")
            return
        if self.command == "GET" and url.path == "/ihc":
            self.send_response(308)
            self.send_header("Location", "/ihc/")
            self.send_header("Content-Length", "0")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            return
        if url.path == settings.update_url:
            if self.headers.get("Transfer-Encoding") or (
                self.command == "POST" and len(self.headers.get_all("Content-Length", [])) != 1
            ):
                self.send_error(400, "A single Content-Length is required")
                return
            environ = {
                "REQUEST_METHOD": self.command,
                "QUERY_STRING": url.query,
                "CONTENT_TYPE": self.headers.get("Content-Type", ""),
                "CONTENT_LENGTH": self.headers.get("Content-Length", ""),
                "HTTP_ORIGIN": self.headers.get("Origin", ""),
                "REMOTE_ADDR": self.client_address[0],
            }
            status, html = handle(settings, environ, self.rfile, local_preview=True)
            body = html.encode("utf-8")
        elif self.command == "GET" and url.path in {"/", "/index.html", "/ihc/", "/ihc/index.html"}:
            status, body = 200, (settings.public_dir / "index.html").read_bytes()
        else:
            self.send_error(404)
            return
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'")
        self.end_headers()
        self.wfile.write(body)

    do_GET = respond
    do_POST = respond

    def log_message(self, format, *args):
        # Avoid logging URLs/query strings, form bodies or passwords.
        logging.info("Local preview request completed")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8082)
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error("Choose a port from 1024 to 65535")
    source = load_settings()
    try:
        cached = read_cache(source)
    except (OSError, KeyError, ValueError):
        parser.error("Generate the roster first: python doctor_scheduler/build_health_centre.py")
    preview = ROOT / "storage" / "browser-preview"
    settings = Settings(data_dir=preview / "private", public_dir=preview / "public",
                        spreadsheet_id=source.spreadsheet_id, origin=f"http://127.0.0.1:{args.port}")
    # Bind first so a second launch cannot reset the active preview's account.
    try:
        server = PreviewServer(("127.0.0.1", args.port), PreviewHandler)
    except OSError as error:
        parser.error(f"Cannot start preview on port {args.port}: {error}. Stop the existing preview or choose --port.")
    server.settings = settings
    try:
        atomic_write(settings.data_dir / "roster.json", json.dumps(cached))
        password = secrets.token_urlsafe(12)
        set_user(settings.database, "tester", password)
        build(settings, cached=True)
        print(f"\nForm:     {settings.origin}{settings.update_url}", flush=True)
        print(f"Schedule: {settings.origin}/ihc/", flush=True)
        print(f"UserID:   tester\nPassword: {password}", flush=True)
        print("\nLocal test data only. Password resets on restart. Ctrl+C stops the preview.\n", flush=True)
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
