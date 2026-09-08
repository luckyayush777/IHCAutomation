"""Build the static Apache site and its public schedule snapshot."""

import argparse
from datetime import date, datetime, timedelta, timezone
import json
import os
from pathlib import Path
import sys

SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parent
sys.path.insert(0, str(ROOT))

from roster import fetch_roster  # noqa: E402
from sheets_client import REFRESH_SECONDS, SheetsClient  # noqa: E402

IST = timezone(timedelta(hours=5, minutes=30))


def atomic_write(path, content):
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(content, encoding="utf-8", newline="\n")
    temporary.replace(path)


def public_shift(value):
    if not isinstance(value, dict) or not isinstance(value.get("name"), str):
        raise ValueError("Admin schedule shifts require a doctor name")
    shift = {"name": value["name"].strip()}
    if not shift["name"]:
        raise ValueError("Admin schedule shifts require a doctor name")
    if "label" in value:
        if not isinstance(value["label"], str) or not value["label"].strip():
            raise ValueError("Admin shift labels must be non-empty text")
        shift["label"] = value["label"].strip()
        return shift
    start, end = value.get("start"), value.get("end")
    if type(start) is not int or type(end) is not int or not 0 <= start < end <= 1440:
        raise ValueError("Admin shift start/end must be valid minutes")
    shift.update(start=start, end=end)
    return shift


def public_admin(path, today):
    """Read and restrict the future admin JSON to fields safe for the public site."""
    if not path.is_file():
        return {"date": today, "status": "unavailable", "records": [], "schedule": {}}
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError("Admin JSON must contain one object")
    admin_date = value.get("date", today)
    try:
        date.fromisoformat(admin_date)
    except (TypeError, ValueError):
        raise ValueError("Admin JSON date must use YYYY-MM-DD") from None
    records = value.get("records", [])
    if not isinstance(records, list):
        raise ValueError("Admin JSON records must be a list")
    public_records = []
    for record in records:
        if not isinstance(record, dict) or not isinstance(record.get("name"), str):
            raise ValueError("Each admin attendance record requires a doctor name")
        state = record.get("state", "unconfirmed")
        if state not in {"present", "absent", "unconfirmed"}:
            raise ValueError("Admin attendance state is invalid")
        clean = {"name": record["name"].strip(), "state": state}
        if not clean["name"]:
            raise ValueError("Each admin attendance record requires a doctor name")
        for field in ("role", "qual", "updated_at"):
            if field in record and isinstance(record[field], str):
                clean[field] = record[field]
        if "shifts" in record:
            if not isinstance(record["shifts"], list):
                raise ValueError("Admin attendance shifts must be a list")
            clean["shifts"] = [public_shift(shift) for shift in record["shifts"]]
        public_records.append(clean)
    schedule = value.get("actual_schedule", value.get("schedule", {}))
    if not isinstance(schedule, dict):
        raise ValueError("Admin JSON schedule must be an object")
    public_schedule = {}
    for day, shifts in schedule.items():
        try:
            date.fromisoformat(day)
        except (TypeError, ValueError):
            raise ValueError("Admin schedule dates must use YYYY-MM-DD") from None
        if shifts is None:
            public_schedule[day] = None
        elif isinstance(shifts, list):
            public_schedule[day] = [public_shift(shift) for shift in shifts]
        else:
            raise ValueError("Each admin schedule date must contain a list or null")
    return {
        "date": admin_date,
        "status": value.get("status", "ok"),
        "records": public_records,
        "schedule": public_schedule,
    }


def build(include_data=True, admin_path=None):
    for asset in ("styles.css", "app.js", "schedule.js"):
        if not (SOURCE / asset).is_file():
            raise ValueError(f"Missing public source asset: {asset}")

    template = (SOURCE / "liveihc-template.html").read_text(encoding="utf-8")
    if 'href="styles.css"' not in template or 'src="app.js"' not in template:
        raise ValueError("The live template is missing an external asset marker")
    atomic_write(SOURCE / "index.html", template)
    root_output = template.replace('href="styles.css"', 'href="src/styles.css"').replace(
        'src="app.js"', 'src="src/app.js"'
    )
    atomic_write(ROOT / "index.html", root_output)

    if include_data:
        roster = fetch_roster(SheetsClient())
        generated = datetime.now(timezone.utc)
        admin_file = admin_path or Path(
            os.environ.get("IHC_ADMIN_JSON", ROOT / "storage" / "admin.json")
        )
        payload = {
            **roster,
            "staff": [],
            "status": "ok",
            "updated_at": generated.isoformat(),
            "refresh_seconds": REFRESH_SECONDS,
            "admin": public_admin(admin_file, generated.astimezone(IST).date().isoformat()),
        }
        atomic_write(
            SOURCE / "data.json",
            json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n",
        )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--assets-only", action="store_true", help="rebuild HTML without reading Sheets"
    )
    parser.add_argument("--admin-json", type=Path, help="path to the private admin input JSON")
    arguments = parser.parse_args()
    build(not arguments.assets_only, arguments.admin_json)
