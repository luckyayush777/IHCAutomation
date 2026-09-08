"""Exercise browser-style navigation and checkbox submissions over real HTTP."""

from dataclasses import replace
from http.client import HTTPConnection
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from urllib.parse import urlencode

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from build_health_centre import build
from dev import PreviewHandler, PreviewServer
from personnel.store import read_day, set_user
from settings import Settings
from test_roster import sample
from test_static_build import Tags


class PreviewTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.settings = Settings(data_dir=root / "private", public_dir=root / "public")
        build(self.settings, loader=sample)
        set_user(self.settings.database, "tester", "preview test password")
        self.server = PreviewServer(("127.0.0.1", 0), PreviewHandler)
        self.addCleanup(self.server.server_close)
        self.port = self.server.server_address[1]
        self.settings = replace(self.settings, origin=f"http://127.0.0.1:{self.port}")
        self.server.settings = self.settings
        self.worker = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.worker.start()
        self.addCleanup(self.worker.join, 5)
        self.addCleanup(self.server.shutdown)

    def request(self, method, path, fields=None):
        connection = HTTPConnection("127.0.0.1", self.port, timeout=5)
        try:
            body = urlencode(fields) if fields is not None else None
            headers = {"Origin": self.settings.origin, "Content-Type": "application/x-www-form-urlencoded"}
            connection.request(method, path, body, headers)
            response = connection.getresponse()
            return response.status, dict(response.getheaders()), response.read().decode("utf-8")
        finally:
            connection.close()

    def test_navigation_and_checkbox_saves_survive_reload(self):
        status, headers, _ = self.request("GET", "/ihc")
        self.assertEqual((status, headers["Location"]), (308, "/ihc/"))
        status, _, page = self.request("GET", headers["Location"])
        self.assertEqual(status, 200)
        update_url = next(attrs["href"] for tag, attrs in Tags(page).tags
                          if tag == "a" and attrs.get("href", "").endswith("personnel.cgi"))
        status, _, form = self.request("GET", update_url)
        self.assertEqual(status, 200)
        tags = Tags(form).tags
        back_url = next(attrs["href"] for tag, attrs in tags if tag == "a")
        self.assertEqual(back_url, "/ihc/")
        self.assertEqual(self.request("GET", back_url)[0], 200)
        day = next(attrs["value"] for tag, attrs in tags if tag == "input" and attrs.get("name") == "date")
        checkbox = next(attrs["name"] for tag, attrs in tags
                        if tag == "input" and attrs.get("type") == "checkbox")
        fields = {"username": "tester", "password": "preview test password", "date": day, checkbox: "in"}
        status, _, form = self.request("POST", update_url, fields)
        self.assertEqual(status, 200)
        self.assertIn("Data updated.", form)
        self.assertIn('class="status-present">In', self.request("GET", back_url)[2])

        # Browsers send no person field when the sole checkbox is unticked.
        del fields[checkbox]
        status, _, form = self.request("POST", update_url, fields)
        self.assertEqual(status, 200)
        self.assertIn("Data updated.", form)
        for _ in range(2):
            status, headers, form = self.request("GET", update_url)
            self.assertEqual(status, 200)
            self.assertEqual(headers["Cache-Control"], "no-store")
            self.assertFalse(any("checked" in attrs for tag, attrs in Tags(form).tags
                                 if tag == "input" and attrs.get("type") == "checkbox"))
            status, _, public = self.request("GET", back_url)
            self.assertEqual(status, 200)
            self.assertIn('class="status-absent">Out', public)
            self.assertNotIn('class="status-present">In', public)
        self.assertEqual(read_day(self.settings.database, day)[checkbox[7:]]["state"], "absent")

        # A rejected attempt must not restore the submitted In value.
        fields.update({"password": "wrong", checkbox: "in"})
        self.assertEqual(self.request("POST", update_url, fields)[0], 401)
        self.assertEqual(read_day(self.settings.database, day)[checkbox[7:]]["state"], "absent")

    def test_second_preview_cannot_bind_the_running_port(self):
        with self.assertRaises(OSError):
            duplicate = PreviewServer(("127.0.0.1", self.port), PreviewHandler)
            duplicate.server_close()


if __name__ == "__main__":
    unittest.main()
