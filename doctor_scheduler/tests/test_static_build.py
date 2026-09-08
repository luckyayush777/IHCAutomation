from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from personnel.store import IST, set_user, save
from build_health_centre import atomic_write, build, build_payload, template_environment
from settings import Settings
from test_roster import sample

NOW = datetime(2026, 9, 8, 10, 30, tzinfo=IST)

class Tags(HTMLParser):
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.tags = []
        self.feed(html)
    def handle_starttag(self, tag, attrs):
        self.tags.append((tag, dict(attrs)))

class StaticBuildTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.settings = Settings(data_dir=root / "private", public_dir=root / "public")

    def test_success_is_complete_html_without_browser_requests(self):
        output = build(self.settings, now=NOW, loader=sample)
        html = output.read_text(encoding="utf-8")
        tags = Tags(html).tags
        self.assertEqual(sum(tag == "html" for tag, _ in tags), 1)
        self.assertEqual(sum("data-date" in attrs for _, attrs in tags), 7)
        self.assertIn("Dr. Example", html)
        self.assertIn("21:30\u201324:00", html)
        self.assertIn("2026-09-08", html)
        for forbidden in ["<script", "fetch(", "/api/", "data.json", "{{", "Loading schedule", "Sun: Closed"]:
            self.assertNotIn(forbidden, html)
        self.assertEqual([p.name for p in self.settings.public_dir.iterdir()], ["index.html"])

    def test_failed_sheets_read_keeps_last_good_html_and_cache(self):
        output = build(self.settings, now=NOW, loader=sample)
        old = output.read_bytes()
        cache = (self.settings.data_dir / "roster.json").read_bytes()
        with self.assertRaises(RuntimeError):
            build(self.settings, now=NOW + timedelta(minutes=16), loader=Mock(side_effect=RuntimeError("offline")))
        self.assertEqual(output.read_bytes(), old)
        self.assertEqual((self.settings.data_dir / "roster.json").read_bytes(), cache)

    def test_first_failure_creates_no_public_page_and_throttles_retries(self):
        loader = Mock(side_effect=RuntimeError("offline"))
        for minute in (0, 1):
            with self.assertRaises(RuntimeError):
                build(self.settings, now=NOW + timedelta(minutes=minute), loader=loader)
        self.assertEqual(loader.call_count, 1)
        self.assertFalse((self.settings.public_dir / "index.html").exists())

    def test_cached_build_never_reads_sheets_and_reflects_attendance(self):
        output = build(self.settings, now=NOW, loader=sample)
        set_user(self.settings.database, "staff", "long test password")
        save(self.settings.database, "staff", "long test password", "peer", "2026-09-08",
             {"Dr. Example": "present"}, {"Dr. Example"}, NOW)
        with patch("build_health_centre.SheetsClient", side_effect=AssertionError("Must not read Sheets")):
            build(self.settings, cached=True, now=NOW)
        html = output.read_text(encoding="utf-8")
        self.assertIn('class="status-present">In', html)
        self.assertNotIn("long test password", html)
        self.assertNotIn('"updated_by"', html)
        build(self.settings, cached=True, now=NOW + timedelta(days=1))
        self.assertIn('class="status-unconfirmed">Not updated', output.read_text(encoding="utf-8"))
        self.assertNotIn('class="status-present">In', output.read_text(encoding="utf-8"))

    def test_render_failure_and_replace_failure_preserve_public_bytes(self):
        output = build(self.settings, now=NOW, loader=sample)
        old = output.read_bytes()
        with patch("build_health_centre.template_environment", side_effect=ValueError("bad template")):
            with self.assertRaises(ValueError):
                build(self.settings, cached=True, now=NOW)
        self.assertEqual(output.read_bytes(), old)
        with patch("build_health_centre.os.replace", side_effect=OSError("disk error")):
            with self.assertRaises(OSError):
                atomic_write(output, "replacement", public=True)
        self.assertEqual(output.read_bytes(), old)
        self.assertEqual(list(output.parent.glob("*.tmp")), [])

    def test_atomic_replace_occurs_after_complete_write_in_same_directory(self):
        output = self.settings.public_dir / "index.html"
        output.parent.mkdir()
        output.write_text("old")
        import os
        real_replace = os.replace
        def replace(source, destination):
            self.assertEqual(source.parent, destination.parent)
            self.assertEqual(destination.read_text(), "old")
            self.assertEqual(source.read_text(), "new complete document")
            return real_replace(source, destination)
        with patch("build_health_centre.os.replace", side_effect=replace):
            atomic_write(output, "new complete document", public=True)
        self.assertEqual(output.read_text(), "new complete document")

    def test_overlapping_builds_read_sheets_once(self):
        loader = Mock(side_effect=sample)
        with ThreadPoolExecutor(max_workers=3) as pool:
            results = list(pool.map(lambda _: build(self.settings, now=NOW, loader=loader), range(3)))
        self.assertEqual(loader.call_count, 1)
        self.assertTrue(all(path.read_text(encoding="utf-8").endswith("</html>") for path in results))

    def test_cron_jitter_does_not_skip_a_quarter_hour(self):
        loader = Mock(side_effect=sample)
        build(self.settings, now=NOW + timedelta(seconds=2), loader=loader)
        build(self.settings, now=NOW + timedelta(minutes=15, seconds=1), loader=loader)
        self.assertEqual(loader.call_count, 2)

    def test_config_rejects_private_paths_under_public_root(self):
        import json
        from settings import load_settings
        config = Path(self.temp.name) / "config.json"
        for values in [
            {"data_dir": "relative"},
            {"public_dir": str(self.settings.public_dir), "data_dir": str(self.settings.public_dir / "private")},
            {"public_dir": str(self.settings.public_dir), "credentials": str(self.settings.public_dir / "key.json")},
            {"update_url": "//evil.example"},
        ]:
            config.write_text(json.dumps(values), encoding="utf-8")
            with self.subTest(values=values), self.assertRaises(ValueError):
                load_settings(config)

    def test_india_week_crosses_month_and_missing_is_not_empty(self):
        roster = sample()
        roster["schedule"] = {"2026-09-30": [], "2026-10-04": [{"name": "Dr. Example", "start": 0, "end": 1440}]}
        # Consecutive generations straddle IST midnight and a month boundary.
        cases = [
            (datetime(2026, 9, 30, 18, 29, tzinfo=timezone.utc),
             ["2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06"],
             ["Wed", "Thu", "Fri", "Sat", "Sun", "Mon", "Tue"]),
            (datetime(2026, 9, 30, 18, 30, tzinfo=timezone.utc),
             ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07"],
             ["Thu", "Fri", "Sat", "Sun", "Mon", "Tue", "Wed"]),
            (datetime(2026, 12, 31, 18, 30, tzinfo=timezone.utc),
             ["2027-01-01", "2027-01-02", "2027-01-03", "2027-01-04", "2027-01-05", "2027-01-06", "2027-01-07"],
             ["Fri", "Sat", "Sun", "Mon", "Tue", "Wed", "Thu"]),
        ]
        for now, dates, weekdays in cases:
            with self.subTest(now=now):
                payload = build_payload(roster, {}, now, now.isoformat(), "/ihc/personnel.cgi")
                grid = payload["week_grid"]
                self.assertEqual(payload["meta"]["today"], dates[0])
                self.assertEqual(payload["meta"]["week_start"], dates[0])
                self.assertEqual(payload["meta"]["week_end"], dates[-1])
                self.assertEqual([day["date"] for day in grid], dates)
                self.assertEqual([day["day"] for day in grid], weekdays)
                self.assertEqual([day["css_class"] for day in grid], ["today"] + [""] * 6)
                html = template_environment().get_template("liveihc-template.html").render(payload)
                self.assertEqual([attrs["data-date"] for _, attrs in Tags(html).tags if "data-date" in attrs], dates)
                by_date = {day["date"]: day for day in grid}
                if "2026-09-30" in by_date:
                    self.assertTrue(by_date["2026-09-30"]["published"])
                    self.assertEqual(by_date["2026-09-30"]["doctors"], [])
                if "2026-10-01" in by_date:
                    self.assertFalse(by_date["2026-10-01"]["published"])
                    self.assertEqual(by_date["2026-10-04"]["doctors"][0]["timing"], "00:00\u201324:00")

    def test_all_doctors_and_untrusted_strings_are_escaped(self):
        name = '<script>alert("sheet")</script>'
        roster = sample()
        roster["doctors"] = [{"name": f"{name}{i}", "role": '<img src=x onerror="alert(1)">', "qual": "A&B"} for i in range(6)]
        roster["schedule"]["2026-09-08"] = [{"name": p["name"], "start": 0, "end": 1440} for p in roster["doctors"]]
        records = {p["name"]: {"date": "2026-09-08", "state": "present", "updated_at": '<svg onload="alert(1)">'} for p in roster["doctors"]}
        payload = build_payload(roster, records, NOW, NOW.isoformat(), "/ihc/personnel.cgi")
        html = template_environment().get_template("liveihc-template.html").render(payload)
        self.assertEqual(len(payload["week_grid"][0]["doctors"]), 6)
        for tag in ("script", "img", "svg"):
            self.assertNotIn(tag, [t for t, _ in Tags(html).tags])
        self.assertIn("&lt;script&gt;", html)
        self.assertIn("A&amp;B", html)
        self.assertIn("&lt;svg", html)

if __name__ == "__main__":
    unittest.main()
