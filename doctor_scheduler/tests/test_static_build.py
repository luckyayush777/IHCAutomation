import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from build_health_centre import public_admin


class StaticBuildTests(unittest.TestCase):
    def test_missing_admin_input_is_explicitly_unavailable(self):
        with tempfile.TemporaryDirectory() as directory:
            result = public_admin(Path(directory) / "missing.json", "2026-09-08")
        self.assertEqual(
            result,
            {
                "date": "2026-09-08",
                "status": "unavailable",
                "records": [],
                "schedule": {},
            },
        )

    def test_admin_input_is_sanitized_and_keeps_authoritative_schedule(self):
        value = {
            "date": "2026-09-08",
            "records": [
                {
                    "name": "Dr. Visitor",
                    "state": "present",
                    "role": "Visiting physician",
                    "updated_at": "2026-09-08T09:00:00+05:30",
                    "note": "private",
                    "updated_by": "private",
                }
            ],
            "actual_schedule": {
                "2026-09-08": [{"name": "Dr. Visitor", "start": 600, "end": 900}],
                "2026-09-09": [],
                "2026-09-10": None,
            },
            "private": "discard me",
        }
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "admin.json"
            source.write_text(json.dumps(value), encoding="utf-8")
            result = public_admin(source, "2026-09-08")
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["records"][0]["name"], "Dr. Visitor")
        self.assertNotIn("note", result["records"][0])
        self.assertNotIn("updated_by", result["records"][0])
        self.assertNotIn("private", result)
        self.assertEqual(result["schedule"]["2026-09-09"], [])
        self.assertIsNone(result["schedule"]["2026-09-10"])

    def test_invalid_admin_input_stops_publication(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "admin.json"
            source.write_text('{"records":[{"name":"Dr. A","state":"maybe"}]}', encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "state"):
                public_admin(source, "2026-09-08")


if __name__ == "__main__":
    unittest.main()
