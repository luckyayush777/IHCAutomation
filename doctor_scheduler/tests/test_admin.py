from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
import io
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from urllib.parse import urlencode

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from personnel.handler import handle
from personnel.store import UpdateError, authenticate, connect, initialize, read_day, save, set_user
from build_health_centre import build
from settings import Settings
from test_roster import sample
from test_static_build import NOW, Tags

class AttendanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from personnel.store import hash_password
        cls.encoded = hash_password("long test password")

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.settings = Settings(data_dir=root / "private", public_dir=root / "public", origin="https://ihc.example")
        self.path = self.settings.database
        build(self.settings, now=NOW, loader=sample)
        with connect(self.path) as db:
            db.execute("INSERT INTO staff_users VALUES (?,?,1)", ("staff", self.encoded))

    def submit(self, pairs=None, env=None, raw=None):
        data = pairs if pairs is not None else {"username": "staff", "password": "long test password", "date": "2026-09-08", "person:Dr. Example": "in"}
        body = raw if raw is not None else urlencode(data).encode()
        environ = {"REQUEST_METHOD": "POST", "CONTENT_TYPE": "application/x-www-form-urlencoded", "CONTENT_LENGTH": str(len(body)), "HTTP_ORIGIN": self.settings.origin, "REMOTE_ADDR": "127.0.0.1"}
        environ.update(env or {})
        return handle(self.settings, environ, io.BytesIO(body), NOW)

    def test_valid_and_invalid_credentials_and_hashes(self):
        status, html = self.submit()
        self.assertEqual(status, 200)
        record = read_day(self.path, "2026-09-08")["Dr. Example"]
        self.assertEqual((record["state"], record["updated_by"], record["updated_at"]), ("present", "staff", NOW.isoformat()))
        for private in ("long test password", self.encoded):
            self.assertNotIn(private, html)
        self.assertIn('class="status-present">In', (self.settings.public_dir / "index.html").read_text(encoding="utf-8"))
        status, error_html = self.submit({"username": "staff", "password": "bad", "date": "2026-09-08"})
        self.assertEqual(status, 401)
        self.assertTrue(any(attrs.get("name") == "person:Dr. Example" and "checked" in attrs
                            for tag, attrs in Tags(error_html).tags if tag == "input"))
        self.assertEqual(read_day(self.path, "2026-09-08")["Dr. Example"]["state"], "present")
        set_user(self.path, "second", "long test password")
        with connect(self.path) as db:
            rows = db.execute("SELECT password_hash FROM staff_users").fetchall()
        self.assertNotEqual(rows[0][0], rows[1][0])
        self.assertTrue(all(row[0].startswith("pbkdf2_sha256$600000$") for row in rows))
        self.assertNotIn(b"long test password", self.path.read_bytes())

    def test_form_works_without_login_or_javascript(self):
        status, html = handle(self.settings, {"REQUEST_METHOD": "GET"}, io.BytesIO(), NOW)
        self.assertEqual(status, 200)
        tags = Tags(html).tags
        self.assertTrue(any(tag == "form" and attrs.get("method") == "post" for tag, attrs in tags))
        self.assertTrue(any(tag == "input" and attrs.get("type") == "password" and "value" not in attrs for tag, attrs in tags))
        self.assertNotIn("script", [tag for tag, _ in tags])
        self.assertNotIn("attendance", html.lower())
        for header in ("IHC Personnel", "UserID", "Category", "Status"):
            self.assertIn(f'>{header}</th>', html)
        self.assertLess(html.index('</table>'), html.index('type="password"'))
        checkboxes = [attrs for tag, attrs in tags if tag == "input" and attrs.get("type") == "checkbox"]
        self.assertTrue(checkboxes)
        self.assertTrue(all(attrs["value"] == "in" and "checked" not in attrs for attrs in checkboxes))
        self.assertNotIn("select", [tag for tag, _ in tags])
        self.assertEqual(read_day(self.path, "2026-09-08"), {})  # Viewing defaults does not save.

    def test_http_preview_exception_is_explicit_and_loopback_only(self):
        from dataclasses import replace
        settings = replace(self.settings, origin="http://127.0.0.1:8082")
        environ = {"REQUEST_METHOD": "GET", "REMOTE_ADDR": "127.0.0.1"}
        self.assertEqual(handle(settings, environ, io.BytesIO(), NOW)[0], 503)
        self.assertEqual(handle(settings, environ, io.BytesIO(), NOW, local_preview=True)[0], 200)
        environ["REMOTE_ADDR"] = "192.168.1.10"
        self.assertEqual(handle(settings, environ, io.BytesIO(), NOW, local_preview=True)[0], 503)

    def test_reference_layout_includes_paramedics_and_batch_needs_valid_password(self):
        cache = self.settings.data_dir / "roster.json"
        data = json.loads(cache.read_text(encoding="utf-8"))
        data["data"]["personnel"] = [
            {"name": "Dr. Example", "user_id": "doctor-id", "category": "Doctor"},
            {"name": "Nurse Example", "user_id": "nurse-id", "category": "Paramedic"},
        ]
        cache.write_text(json.dumps(data), encoding="utf-8")
        status, html = handle(self.settings, {"REQUEST_METHOD": "GET"}, io.BytesIO(), NOW)
        self.assertEqual(status, 200)
        for value in ("Nurse Example", "doctor-id", "nurse-id", "Paramedic"):
            self.assertIn(value, html)
        fields = {"username": "staff", "password": "wrong", "date": "2026-09-08",
                  "person:Dr. Example": "in"}  # Unchecked nurse is omitted by the browser.
        before = (self.settings.public_dir / "index.html").read_bytes()
        self.assertEqual(self.submit(fields)[0], 401)
        self.assertEqual(read_day(self.path, "2026-09-08"), {})
        self.assertEqual((self.settings.public_dir / "index.html").read_bytes(), before)
        fields["password"] = "long test password"
        self.assertEqual(self.submit(fields)[0], 200)
        rows = read_day(self.path, "2026-09-08")
        self.assertEqual(rows["Dr. Example"]["state"], "present")
        self.assertEqual(rows["Nurse Example"]["state"], "absent")
        public = (self.settings.public_dir / "index.html").read_text(encoding="utf-8")
        self.assertIn("Nurse Example", public)
        self.assertIn('class="status-absent">Out', public)
        self.assertNotIn("nurse-id", public)
        self.assertNotIn("attendance", public.lower())
        # Reload restores saved checks; unticking everyone must clear an earlier In.
        status, html = handle(self.settings, {"REQUEST_METHOD": "GET"}, io.BytesIO(), NOW)
        self.assertEqual(status, 200)
        checks = {attrs["name"]: "checked" in attrs for tag, attrs in Tags(html).tags
                  if tag == "input" and attrs.get("type") == "checkbox"}
        self.assertEqual(checks, {"person:Dr. Example": True, "person:Nurse Example": False})
        del fields["person:Dr. Example"]
        status, html = self.submit(fields)
        self.assertEqual(status, 200)
        self.assertTrue(all(row["state"] == "absent" for row in read_day(self.path, "2026-09-08").values()))
        self.assertFalse(any("checked" in attrs for tag, attrs in Tags(html).tags
                             if tag == "input" and attrs.get("type") == "checkbox"))
        public = (self.settings.public_dir / "index.html").read_text(encoding="utf-8")
        self.assertNotIn('class="status-present">In', public)
        self.assertEqual(public.count('class="status-absent">Out'), 2)
        with connect(self.path) as db:
            self.assertEqual(db.execute("SELECT count(*) FROM attendance_history").fetchone()[0], 4)

    def test_disabled_unknown_and_throttled_accounts(self):
        with connect(self.path) as db:
            db.execute("UPDATE staff_users SET enabled=0")
        for username in ["staff", "unknown", "staff", "unknown", "staff"]:
            with self.assertRaises(UpdateError) as caught:
                authenticate(self.path, username, "long test password", "peer")
            self.assertEqual(caught.exception.status, 401)
        # A separate request/connection sees the persisted attempt limit.
        with self.assertRaises(UpdateError) as caught:
            authenticate(self.path, "staff", "long test password", "peer")
        self.assertEqual(caught.exception.status, 429)
        import time
        with patch("personnel.store.time.time", return_value=time.time() + 301):
            with self.assertRaises(UpdateError) as caught:
                authenticate(self.path, "unknown", "bad", "peer")
            self.assertEqual(caught.exception.status, 401)

    def test_malformed_forms_and_cross_origin_do_not_change_records(self):
        base = [("username", "staff"), ("password", "long test password"), ("date", "2026-09-08")]
        cases = [base + [("person:Unknown", "present")], base + [("person:Dr. Example", "maybe")],
                 base + [("person:Dr. Example", "in"), ("person:Dr. Example", "out")],
                 base + [("updated_by", "forged")], base + [("person:Dr. Example", "")],
                 base + [("person:Dr. Example", "out")]]
        for pairs in cases:
            with self.subTest(pairs=pairs):
                self.assertEqual(self.submit(pairs)[0], 400)
        for env, expected in [({"HTTP_ORIGIN": "https://evil.example"}, 403), ({"HTTP_ORIGIN": ""}, 403),
                              ({"CONTENT_TYPE": "application/json"}, 415), ({"CONTENT_LENGTH": "90000"}, 413),
                              ({"CONTENT_LENGTH": "no"}, 400), ({"CONTENT_LENGTH": "5000"}, 400),
                              ({"QUERY_STRING": "password=secret"}, 400), ({"REQUEST_METHOD": "PUT"}, 405)]:
            self.assertEqual(self.submit(env=env)[0], expected)
        self.assertEqual(self.submit(raw=b"bad=%FF")[0], 400)
        self.assertEqual(read_day(self.path, "2026-09-08"), {})
        with connect(self.path) as db:
            self.assertEqual(db.execute("SELECT count(*) FROM attendance_history").fetchone()[0], 0)

    def test_yesterday_does_not_carry_and_stale_form_is_rejected(self):
        self.assertEqual(self.submit()[0], 200)
        tomorrow = NOW + timedelta(days=1)
        self.assertEqual(read_day(self.path, tomorrow.date().isoformat()), {})
        status, html = handle(self.settings, {"REQUEST_METHOD": "GET"}, io.BytesIO(), tomorrow)
        self.assertEqual(status, 200)
        self.assertFalse(any("checked" in attrs for tag, attrs in Tags(html).tags
                             if tag == "input" and attrs.get("type") == "checkbox"))
        with self.assertRaises(UpdateError) as caught:
            save(self.path, "staff", "long test password", "peer", "2026-09-08", {"Dr. Example": "absent"}, {"Dr. Example"}, tomorrow)
        self.assertEqual(caught.exception.status, 409)
        self.assertEqual(read_day(self.path, "2026-09-08")["Dr. Example"]["state"], "present")

    def test_simultaneous_repeated_submissions_are_atomic_and_audited(self):
        def update(i):
            save(self.path, "staff", "long test password", str(i), "2026-09-08",
                 {"Dr. Example": "present" if i % 2 else "absent"}, {"Dr. Example"}, NOW)
        with ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(update, range(8)))
        with connect(self.path) as db:
            self.assertEqual(db.execute("PRAGMA integrity_check").fetchone()[0], "ok")
            self.assertEqual(db.execute("SELECT count(*) FROM attendance").fetchone()[0], 1)
            self.assertEqual(db.execute("SELECT revision FROM attendance").fetchone()[0], 8)
            self.assertEqual(db.execute("SELECT count(*) FROM attendance_history").fetchone()[0], 8)

    def test_failed_publication_retains_saved_attendance(self):
        previous = (self.settings.public_dir / "index.html").read_bytes()
        with self.assertLogs(level="ERROR"), patch("personnel.handler.build", side_effect=OSError("private disk details")):
            status, html = self.submit()
        self.assertEqual(status, 200)
        self.assertIn("Status saved. Public page regeneration failed", html)
        self.assertNotIn("private disk details", html)
        self.assertEqual(read_day(self.path, "2026-09-08")["Dr. Example"]["state"], "present")
        self.assertEqual((self.settings.public_dir / "index.html").read_bytes(), previous)

    def test_existing_schema_records_survive_initialization(self):
        self.submit()
        initialize(self.path)
        self.assertEqual(read_day(self.path, "2026-09-08")["Dr. Example"]["state"], "present")
        with connect(self.path) as db:
            self.assertEqual(db.execute("SELECT count(*) FROM attendance_history").fetchone()[0], 1)

    def test_backup_cli_copies_accounts_and_attendance(self):
        self.submit()
        config = self.settings.data_dir / "config.json"
        config.write_text(json.dumps({"data_dir": str(self.settings.data_dir), "public_dir": str(self.settings.public_dir)}), encoding="utf-8")
        backup = self.settings.data_dir / "backup.sqlite"
        command = [sys.executable, "-m", "personnel.users", "--config", str(config), "--backup", str(backup)]
        result = subprocess.run(command, cwd=Path(__file__).resolve().parents[1], capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(read_day(backup, "2026-09-08")["Dr. Example"]["state"], "present")
        with connect(backup) as db:
            self.assertEqual(db.execute("SELECT password_hash FROM staff_users").fetchone()[0], self.encoded)
        again = subprocess.run(command, cwd=Path(__file__).resolve().parents[1], capture_output=True)
        self.assertNotEqual(again.returncode, 0)

    def test_cgi_subprocess_headers_and_escaped_profiles(self):
        cache = self.settings.data_dir / "roster.json"
        value = json.loads(cache.read_text(encoding="utf-8"))
        value["data"]["personnel"][0]["name"] = '<img src=x onerror="alert(1)">'
        cache.write_text(json.dumps(value), encoding="utf-8")
        config = self.settings.data_dir / "config.json"
        config.write_text(json.dumps({"data_dir": str(self.settings.data_dir), "public_dir": str(self.settings.public_dir), "origin": self.settings.origin}), encoding="utf-8")
        process = subprocess.run([sys.executable, "-m", "personnel.handler"], cwd=Path(__file__).resolve().parents[1],
                                 env={**os.environ, "IHC_CONFIG": str(config), "REQUEST_METHOD": "GET"}, input=b"", capture_output=True)
        self.assertEqual(process.returncode, 0, process.stderr)
        output = process.stdout.decode()
        self.assertTrue(output.startswith("Status: 200 OK"))
        self.assertIn("Cache-Control: no-store", output)
        self.assertIn("&lt;img", output)
        self.assertNotIn("<img", output)

if __name__ == "__main__":
    unittest.main()
