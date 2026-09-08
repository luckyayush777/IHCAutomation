"""Run: .venv/Scripts/python -m unittest discover -s doctor_scheduler -p 'test_*.py'."""

from datetime import datetime, timezone
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

from roster import fetch_roster, normalize, parse_shift
from server import PUBLIC_FILES, REFRESH_SECONDS, RosterStore, ScheduleHandler
from sheets_client import ReadCooldown, ReadLimiter, SheetsClient

INFO = [["Medical Officer", "System", "Qualification"], ["Dr. Example", "Allopathy", "MBBS"]]


def month(*rows):
    return [["DOCTOR DUTY ROSTER"], [], ["Date", "Day", "Schedule"], *rows]


def sample():
    return normalize(INFO, {"Sep-2026": month(
        ["2026-09-08", "Tue", '{"Dr. Example":["2130–2400"]}'],
        ["2026-09-09", "Wed", '{"Dr. Example":["0000–0530","1600–2100"]}'],
    )})


class RosterTests(unittest.TestCase):
    def test_one_request_and_cooldown_survive_new_client_and_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "reads.sqlite"
            client = object.__new__(SheetsClient)
            client.base_url = "https://sheets.googleapis.com/v4/spreadsheets/test"
            client.limiter = ReadLimiter(path)
            client.session = Mock()
            client.session.get.side_effect = RuntimeError("network down")
            with patch("sheets_client.time.time", return_value=1000):
                with self.assertRaises(RuntimeError):
                    client.read_workbook()
            client.limiter = ReadLimiter(path)
            with patch("sheets_client.time.time", return_value=1119):
                with self.assertRaises(ReadCooldown):
                    client.read_workbook()
            self.assertEqual(client.session.get.call_count, 1)
            with patch("sheets_client.time.time", return_value=1120):
                with self.assertRaises(RuntimeError):
                    client.read_workbook()
            self.assertEqual(client.session.get.call_count, 2)

    def test_workbook_read_includes_profiles_and_months_in_one_call(self):
        def grid(title, rows):
            return {"properties": {"title": title}, "data": [{"rowData": [
                {"values": [{"formattedValue": value} for value in row]} for row in rows
            ]}]}
        client = Mock()
        client.read_workbook.return_value = {"sheets": [grid("Info", INFO), grid("Sep-2026", month(
            ["2026-09-08", "Tue", '{"Dr. Example":["2130–2400"]}'], ["", "", "{}"],
        )), grid("Updates", [["Not a public roster"]])]}
        data = fetch_roster(client)
        self.assertEqual(data["schedule"]["2026-09-08"][0]["end"], 1440)
        self.assertEqual(data["source_tabs"], ["Info", "Sep-2026"])
        client.read_workbook.assert_called_once_with()

    def test_shift_boundaries_and_sheet_numeric_format(self):
        self.assertEqual(parse_shift("2130–2400"), {"start": 1290, "end": 1440})
        self.assertEqual(parse_shift("500-1100"), {"start": 300, "end": 660})
        for invalid in ["2401-2500", "0600-0560", "2130-0530", "Leave", "0600-0600"]:
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                parse_shift(invalid)

    def test_dated_overrides_and_empty_day_are_preserved(self):
        data = normalize(INFO, {"Sep-2026": month(
            ["2026-09-08", "Tue", '{"Dr. Example":["1600–2100"]}'],
            ["2026-09-09", "Wed", '{}'], ["", "", "{}"],
        )})
        self.assertEqual(data["schedule"]["2026-09-08"][0]["start"], 960)
        self.assertEqual(data["schedule"]["2026-09-09"], [])
        self.assertNotIn("2026-09-15", data["schedule"])

    def test_invalid_rows_fail_instead_of_silently_hiding_shifts(self):
        for row in [["2026-09-08", "Mon", "{}"], ["2026-09-08", "Tue", "#ERROR!"],
                    ["2026-09-08", "Tue", '{"Unknown":["0600–1200"]}']]:
            with self.subTest(row=row), self.assertRaises(ValueError):
                normalize(INFO, {"Sep-2026": month(row)})

    def test_last_success_survives_failure_and_restart_then_recovers(self):
        with tempfile.TemporaryDirectory() as directory:
            cache = Path(directory) / "roster.json"
            loader = Mock(return_value=sample())
            store = RosterStore(loader, cache)
            self.assertEqual(store.snapshot()["status"], "loading")
            store.refresh()
            self.assertEqual(store.snapshot()["status"], "ok")
            saved_at = store.updated_at
            loader.side_effect = RuntimeError("offline")
            store.refresh()
            self.assertEqual(store.snapshot()["status"], "stale")
            self.assertEqual(store.updated_at, saved_at)
            self.assertEqual(store.data["doctors"], INFO_TO_DOCTORS)
            restarted = RosterStore(loader, cache)
            self.assertEqual(restarted.snapshot()["status"], "stale")
            loader.side_effect = None
            restarted.refresh()
            self.assertEqual(restarted.snapshot()["status"], "ok")

    def test_initial_failure_returns_unavailable(self):
        store = RosterStore(Mock(side_effect=RuntimeError("offline")))
        store.refresh()
        self.assertEqual(store.snapshot()["status"], "unavailable")
        self.assertNotIn("doctors", store.snapshot())

    def test_refresh_is_shared_and_worker_waits_two_minutes(self):
        loader = Mock(return_value=sample())
        store = RosterStore(loader)
        stop = Mock()
        stop.is_set.side_effect = [False, True]
        with patch("server.time.time", return_value=1000):
            store.run(stop)
            for _ in range(10):
                store.snapshot()
        self.assertEqual(loader.call_count, 1)
        stop.wait.assert_called_once_with(REFRESH_SECONDS)
        self.assertEqual(REFRESH_SECONDS, 120)

    def test_week_uses_india_date_across_month_boundary(self):
        class FixedTime(datetime):
            @classmethod
            def now(cls, tz=None):
                return datetime(2026, 9, 30, 19, 0, tzinfo=timezone.utc).astimezone(tz)
        store = RosterStore(Mock())
        store.data = {"doctors": [], "schedule": {"2026-09-28": [], "2026-10-01": [], "2026-10-04": [], "2026-10-05": []}}
        with patch("server.datetime", FixedTime):
            snapshot = store.snapshot()
        self.assertEqual(list(snapshot["schedule"]), ["2026-09-28", "2026-10-01", "2026-10-04"])
        self.assertEqual(snapshot["staff"], [])

    def test_http_never_serves_credentials_sources_or_directory_listings(self):
        for path in ["/keys/ihcautomation-ab8088bef327.json", "/keys/", "/.cache/roster.json", "/server.py", "/../.env", "/%2e%2e/.env", "/new_design/index.html"]:
            handler = object.__new__(ScheduleHandler)
            handler.path = path
            handler.wfile = io.BytesIO()
            handler.send_response = Mock()
            handler.send_header = Mock()
            handler.end_headers = Mock()
            handler.respond()
            handler.send_response.assert_called_once_with(404)
            self.assertEqual(handler.wfile.getvalue(), b"Not found")
        self.assertNotIn("/keys", PUBLIC_FILES)


INFO_TO_DOCTORS = [{"name": "Dr. Example", "role": "Allopathy", "qual": "MBBS"}]

if __name__ == "__main__":
    unittest.main()
