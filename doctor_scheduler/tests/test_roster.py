"""From the repository root: python -m unittest discover -s doctor_scheduler/tests."""

import json
from pathlib import Path
import sys
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from roster import fetch_roster, normalize, parse_shift
from sheets_client import SheetsClient

INFO = [["Medical Officer", "System", "Qualification"], ["Dr. Example", "Allopathy", "MBBS"]]
PERSONNEL_INFO = [
    ["IHC Personnel", "UserID", "Category", "System", "Qualification", "Contact",
     "", "Sch. Times", "Value", "", "DocIDs"],
    ["Dr. Example", "doctor-id", "Doctor", "Allopathy", "MBBS", "private-number",
     "", "Ad Hoc", "Leave", "", "Dr. Example"],
    ["Nurse Example", "nurse-id", "Staff", "Nursing", "GNM", "private-number",
     "", "0000", "0", "", "Dr. Example"],
    ["", "", "", "", "", "", "", "0015", "15", "", "Dr. Example"],
]
DUTY_LIST = [
    ["Medical Officer", "Day", "Schedule Begin", "Schedule End", "Schedule", "UserID"],
    ["Dr. Example", "Mon", "0600", "1200", "0600-1200", "doctor-id"],
    ["Dr. Example", "Tue", "", "", "Ad Hoc", "doctor-id"],
]


def month(*rows):
    return [["DOCTOR DUTY ROSTER"], [], ["Date", "Day", "Schedule"], *rows]


def sample():
    return normalize(INFO, {"Sep-2026": month(
        ["2026-09-08", "Tue", '{"Dr. Example":["2130–2400"]}'],
        ["2026-09-09", "Wed", '{"Dr. Example":["0000–0530","1600–2100"]}'],
    )})


class RosterTests(unittest.TestCase):
    def test_duplicate_names_and_month_date_mismatches_fail(self):
        for row in [["2026-09-08", "Tue", '{"Dr. Example":["0600-1200"],"Dr. Example":[]}'],
                    ["2026-10-08", "Thu", '{}']]:
            with self.subTest(row=row), self.assertRaises(ValueError):
                normalize(INFO, {"Sep-2026": month(row)})

    def test_adjacent_month_tabs_keep_exact_dates(self):
        data = normalize(INFO, {
            "Sep-2026": month(["2026-09-30", "Wed", '{"Dr. Example":["2100-2400"]}']),
            "Oct-2026": month(["2026-10-01", "Thu", '{"Dr. Example":["0000-0530"]}']),
        })
        self.assertEqual(list(data["schedule"]), ["2026-09-30", "2026-10-01"])
        self.assertEqual(data["schedule"]["2026-10-01"][0]["start"], 0)

    def test_sheets_client_uses_one_bounded_read_only_request(self):
        client = object.__new__(SheetsClient)
        client.base_url = "https://sheets.googleapis.com/v4/spreadsheets/test"
        client.session = Mock()
        client.session.get.return_value.json.return_value = {"sheets": []}
        self.assertEqual(client.read_workbook(), {"sheets": []})
        client.session.get.assert_called_once()
        self.assertEqual(client.session.get.call_args.kwargs["timeout"], 20)
        self.assertFalse(client.session.get.call_args.kwargs["allow_redirects"])

    def test_workbook_read_includes_profiles_and_months_in_one_call(self):
        def grid(title, rows):
            return {"properties": {"title": title}, "data": [{"rowData": [
                {"values": [{"formattedValue": value} for value in row]} for row in rows
            ]}]}
        client = Mock()
        client.read_workbook.return_value = {"sheets": [grid("Info", INFO), grid("Duty-List", DUTY_LIST), grid("Sep-2026", month(
            ["2026-09-08", "Tue", '{"Dr. Example":["2130–2400"]}'], ["", "", "{}"],
        )), grid("Updates", [["Not a public roster"]])]}
        data = fetch_roster(client)
        self.assertEqual(data["schedule"]["2026-09-08"][0]["end"], 1440)
        self.assertEqual(data["ideal_schedule"]["Mon"][0]["start"], 360)
        self.assertEqual(data["ideal_schedule"]["Tue"][0]["label"], "Ad hoc")
        self.assertEqual(data["source_tabs"], ["Info", "Duty-List", "Sep-2026"])
        client.read_workbook.assert_called_once_with()

    def test_duty_list_rejects_unknown_people(self):
        duty = [DUTY_LIST[0], ["Unknown", "Mon", "0600", "1200", "0600-1200"]]
        with self.assertRaises(ValueError):
            normalize(INFO, {"Sep-2026": month(
                ["2026-09-08", "Tue", '{"Dr. Example":["0600-1200"]}'],
            )}, duty)

    def test_new_personnel_info_filters_doctors_and_keeps_private_fields_out(self):
        data = normalize(PERSONNEL_INFO, {"Sep-2026": month(
            ["2026-09-08", "Tue", '{"Dr. Example":["0600-1200"]}'],
        )})
        self.assertEqual(data["doctors"], INFO_TO_DOCTORS)
        self.assertNotIn("user_id", data["doctors"][0])
        self.assertNotIn("contact", data["doctors"][0])
        self.assertEqual(data["personnel"], [
            {"name": "Dr. Example", "user_id": "doctor-id", "category": "Doctor"},
            {"name": "Nurse Example", "user_id": "nurse-id", "category": "Staff"},
        ])
        self.assertNotIn("private-number", json.dumps(data))

    def test_new_personnel_columns_are_resolved_by_header(self):
        info = [
            ["Category", "Qualification", "Contact", "IHC Personnel", "System", "UserID"],
            ["Doctor", "MBBS", "private-number", "Dr. Example", "Allopathy", "doctor-id"],
        ]
        data = normalize(info, {"Sep-2026": month(
            ["2026-09-08", "Tue", '{"Dr. Example":["0600-1200"]}'],
        )})
        self.assertEqual(data["doctors"], INFO_TO_DOCTORS)

    def test_new_personnel_info_requires_category(self):
        with self.assertRaisesRegex(ValueError, "Info headers are missing: Category"):
            normalize(
                [["IHC Personnel", "System", "Qualification"],
                 ["Dr. Example", "Allopathy", "MBBS"]],
                {"Sep-2026": month(["2026-09-08", "Tue", "{}"])},
            )

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



INFO_TO_DOCTORS = [{"name": "Dr. Example", "role": "Allopathy", "qual": "MBBS"}]

if __name__ == "__main__":
    unittest.main()
