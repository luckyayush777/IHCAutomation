"""Admin API tests. --preview serves isolated sample records on port 8082, without Google reads."""

from datetime import datetime, timedelta
import http.client
from http.server import ThreadingHTTPServer
import json
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from admin.service import AdminService, IST, SESSION_SECONDS
from server import ScheduleHandler


class FixtureRoster:
    def __init__(self, now):
        self.now = now

    def snapshot(self):
        return {
            "doctors": [
                {"name": "Dr. Sample A", "role": "Allopathy", "qual": "MBBS"},
                {"name": "Dr. Sample B", "role": "Allopathy", "qual": "General Medicine"},
                {"name": "Dr. Sample C", "role": "Homeopathy", "qual": "BHMS"},
            ],
            "schedule": {self.now().date().isoformat(): [
                {"name": "Dr. Sample A", "start": 540, "end": 720},
                {"name": "Dr. Sample B", "start": 840, "end": 1020},
            ]},
            "staff": [], "status": "ok", "updated_at": self.now().isoformat(),
            "server_time": self.now().isoformat(), "refresh_seconds": 120,
            "refreshing": False, "next_refresh_at": self.now().timestamp() + 120,
        }


class QuietHandler(ScheduleHandler):
    def log_message(self, format, *args):
        pass


def make_server(path, port, now):
    server = ThreadingHTTPServer(("127.0.0.1", port), QuietHandler)
    origin = f"http://127.0.0.1:{server.server_port}"
    server.store = FixtureRoster(now)
    server.admin = AdminService(path, server.store, [origin], now=now)
    return server


class AdminTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = tempfile.TemporaryDirectory()
        cls.database = Path(cls.directory.name) / "attendance.sqlite"
        cls.clock = [datetime(2026, 9, 8, 10, 30, tzinfo=IST)]
        cls.server = make_server(cls.database, 0, lambda: cls.clock[0])
        cls.worker = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.worker.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.worker.join()
        cls.directory.cleanup()

    def setUp(self):
        self.clock[0] = datetime(2026, 9, 8, 10, 30, tzinfo=IST)
        self.server.admin.sessions.clear()
        self.server.admin.attempts.clear()
        with self.server.admin.connect() as db:
            db.execute("DELETE FROM attendance")
            db.execute("DELETE FROM attendance_history")
        self.cookie = ""
        self.csrf = ""

    def request(self, path, payload=None, headers=None, raw=None):
        method = "POST" if payload is not None or raw is not None else "GET"
        request_headers = {"Origin": f"http://127.0.0.1:{self.server.server_port}",
                           "X-IHC-Request": "1", "Cookie": self.cookie, "X-CSRF-Token": self.csrf}
        body = None
        if method == "POST":
            request_headers["Content-Type"] = "application/json"
            body = raw if raw is not None else json.dumps(payload).encode()
        request_headers.update(headers or {})
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=5)
        try:
            connection.request(method, path, body, request_headers)
            response = connection.getresponse()
            content = response.read()
            result = json.loads(content) if response.getheader("Content-Type", "").startswith("application/json") else content.decode()
            return response.status, result, dict(response.getheaders())
        finally:
            connection.close()

    def login(self):
        status, result, headers = self.request("/api/admin/login", {"username": "user123", "password": "1234"})
        self.assertEqual(status, 200)
        self.cookie = headers["Set-Cookie"].split(";", 1)[0]
        self.csrf = result["csrf_token"]
        return headers

    def update(self, **changes):
        return {"date": self.clock[0].date().isoformat(), "doctor": "Dr. Sample A", "state": "present",
                "note": "Arrived at reception", "revision": 0, **changes}

    def test_protected_records_and_private_files(self):
        self.assertEqual(self.request("/api/admin/attendance")[0], 401)
        self.assertEqual(self.request("/api/admin/attendance", self.update())[0], 401)
        for path in ["/storage/attendance.sqlite", "/admin/service.py", "/admin/__init__.py", "/logs/server.log"]:
            self.assertEqual(self.request(path)[0], 404)

    def test_login_cookie_csrf_and_logout(self):
        headers = self.login()
        self.assertIn("HttpOnly", headers["Set-Cookie"])
        self.assertIn("SameSite=Strict", headers["Set-Cookie"])
        self.assertEqual(self.request("/api/admin/session")[1]["authenticated"], True)
        self.assertEqual(self.request("/api/admin/attendance", self.update(), {"X-CSRF-Token": "wrong"})[0], 403)
        self.assertEqual(self.request("/api/admin/logout", {})[0], 200)
        self.assertEqual(self.request("/api/admin/attendance")[0], 401)

    def test_incorrect_login_and_throttle(self):
        for _ in range(5):
            self.assertEqual(self.request("/api/admin/login", {"username": "user123", "password": "bad"})[0], 401)
        self.assertEqual(self.request("/api/admin/login", {"username": "user123", "password": "1234"})[0], 429)

    def test_cross_site_and_bad_content_rejected(self):
        self.assertEqual(self.request("/api/admin/login", {"username": "user123", "password": "1234"}, {"Origin": "https://evil.example"})[0], 403)
        self.assertEqual(self.request("/api/admin/login", {}, {"Content-Type": "text/plain"})[0], 415)
        self.assertEqual(self.request("/api/admin/login", raw=b"{" )[0], 400)
        self.assertEqual(self.request("/api/admin/login", raw=b"a" * 9000)[0], 413)

    def test_saved_attendance_is_separate_and_audited(self):
        self.login()
        public_before = self.request("/api/schedule")[1]
        status, result, _ = self.request("/api/admin/attendance", self.update(note="<script>alert(1)</script>"))
        self.assertEqual(status, 200)
        record = result["doctors"][0]["presence"]
        self.assertEqual(record["state"], "present")
        self.assertEqual(record["updated_by"], "user123")
        self.assertEqual(record["revision"], 1)
        self.assertEqual(record["note"], "<script>alert(1)</script>")
        public_after = self.request("/api/schedule")[1]
        self.assertEqual(public_after["schedule"], public_before["schedule"])
        self.assertEqual(public_after["doctors"], public_before["doctors"])
        self.assertEqual(public_after["attendance"]["records"], [{
            "name": "Dr. Sample A", "state": "present", "updated_at": self.clock[0].isoformat()}])
        for private in ["note", "updated_by", "revision", "user123", "<script>"]:
            self.assertNotIn(private, json.dumps(public_after))
        self.assertEqual(self.request("/api/admin/attendance", self.update(state="absent", revision=1))[0], 200)
        with self.server.admin.connect() as db:
            events = db.execute("SELECT previous_state, state FROM attendance_history ORDER BY id").fetchall()
        self.assertEqual([tuple(event) for event in events], [("unconfirmed", "present"), ("present", "absent")])

    def test_conflicting_edit_does_not_overwrite(self):
        self.login()
        self.assertEqual(self.request("/api/admin/attendance", self.update())[0], 200)
        self.assertEqual(self.request("/api/admin/attendance", self.update(state="absent"))[0], 409)
        self.assertEqual(self.request("/api/admin/attendance")[1]["doctors"][0]["presence"]["state"], "present")

    def test_invalid_fields_doctor_and_note(self):
        self.login()
        for changes in [{"doctor": "Unknown"}, {"state": "yes"}, {"note": "x" * 301},
                        {"revision": True}, {"updated_by": "another-user"}]:
            self.assertEqual(self.request("/api/admin/attendance", self.update(**changes))[0], 400)

    def test_attendance_persists_and_expires_at_india_midnight(self):
        self.login()
        old = self.update()
        self.assertEqual(self.request("/api/admin/attendance", old)[0], 200)
        reopened = AdminService(self.database, self.server.store, [], now=lambda: self.clock[0])
        self.assertEqual(reopened.today()["doctors"][0]["presence"]["state"], "present")
        self.clock[0] += timedelta(days=1)
        self.assertEqual(reopened.today()["doctors"][0]["presence"]["state"], "unconfirmed")
        self.assertEqual(self.request("/api/admin/attendance", old)[0], 409)

    def test_expired_session_is_rejected(self):
        self.login()
        import time
        with patch("admin.service.time.time", return_value=time.time() + SESSION_SECONDS + 1):
            self.assertEqual(self.request("/api/admin/attendance")[0], 401)

    def test_public_attendance_resets_daily_and_filters_removed_doctors(self):
        self.login()
        self.request("/api/admin/attendance", self.update())
        self.cookie = ""
        self.assertEqual(len(self.request("/api/schedule")[1]["attendance"]["records"]), 1)
        snapshot = self.server.store.snapshot()
        snapshot["doctors"] = []
        self.assertEqual(self.server.admin.public_attendance(snapshot)["records"], [])
        self.clock[0] += timedelta(days=1)
        attendance = self.request("/api/schedule")[1]["attendance"]
        self.assertEqual(attendance["date"], self.clock[0].date().isoformat())
        self.assertEqual(attendance["records"], [])

    def test_attendance_failure_keeps_sheet_roster_available(self):
        with patch.object(self.server.admin, "connect", side_effect=RuntimeError("private database detail")):
            status, public, _ = self.request("/api/schedule")
        self.assertEqual(status, 200)
        self.assertEqual(len(public["doctors"]), 3)
        self.assertEqual(public["attendance"], {"status": "unavailable", "records": []})
        self.assertNotIn("private database detail", json.dumps(public))


if __name__ == "__main__":
    if "--preview" in sys.argv:
        with tempfile.TemporaryDirectory() as directory:
            preview = make_server(Path(directory) / "attendance.sqlite", 8082, lambda: datetime.now(IST))
            print("Isolated admin preview: http://127.0.0.1:8082/admin (sample data only)", flush=True)
            try:
                preview.serve_forever()
            except KeyboardInterrupt:
                pass
            finally:
                preview.server_close()
    else:
        unittest.main()
