"""Normalize dated sheet data independently of the website layout."""

from datetime import date
import json
import re

MONTH_TAB = re.compile(r"^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d{4}$")
DAYS = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
LEGACY_INFO_HEADERS = ("Medical Officer", "System", "Qualification")
PERSONNEL_INFO_HEADERS = ("IHC Personnel", "Category", "System", "Qualification")
DUTY_HEADERS = ("Medical Officer", "Day", "Schedule Begin", "Schedule End")


def minutes(value):
    value = str(value).strip().replace(":", "")
    if not re.fullmatch(r"\d{1,4}", value):
        raise ValueError("Invalid roster time")
    hours, mins = divmod(int(value), 100)
    if mins > 59 or hours > 24 or (hours == 24 and mins):
        raise ValueError("Invalid roster time")
    return hours * 60 + mins


def parse_shift(value):
    parts = re.split(r"[–—-]", str(value))
    if len(parts) != 2:
        raise ValueError("Invalid roster shift")
    start, end = map(minutes, parts)
    if start >= end:
        raise ValueError("Roster shifts must be split at midnight and end after they start")
    return {"start": start, "end": end}


def info_columns(info):
    if not info:
        raise ValueError("The Info sheet is empty")
    headers = [str(value).strip() for value in info[0]]
    if tuple(headers[:3]) == LEGACY_INFO_HEADERS:
        return {"name": 0, "category": None, "role": 1, "qual": 2, "user_id": None}
    missing = [header for header in PERSONNEL_INFO_HEADERS if header not in headers]
    if missing:
        raise ValueError(f"Info headers are missing: {', '.join(missing)}")
    return {
        "name": headers.index("IHC Personnel"),
        "category": headers.index("Category"),
        "role": headers.index("System"),
        "qual": headers.index("Qualification"),
        "user_id": headers.index("UserID") if "UserID" in headers else None,
    }


def normalize_ideal_schedule(rows, profiles):
    ideal = {day: [] for day in DAYS}
    if rows is None:
        return ideal
    if not rows:
        raise ValueError("The Duty-List sheet is empty")
    headers = [str(value).strip() for value in rows[0]]
    missing = [header for header in DUTY_HEADERS if header not in headers]
    if missing:
        raise ValueError(f"Duty-List headers are missing: {', '.join(missing)}")
    columns = {header: headers.index(header) for header in DUTY_HEADERS}
    schedule_column = headers.index("Schedule") if "Schedule" in headers else None

    def value(row, header):
        column = columns[header]
        return str(row[column]).strip() if column < len(row) else ""

    for row in rows[1:]:
        name = value(row, "Medical Officer")
        if not name:
            continue
        if name not in profiles:
            raise ValueError("Duty-List: scheduled doctor missing from Info")
        day = value(row, "Day")
        if day not in DAYS:
            raise ValueError("Duty-List: invalid day")
        begin = value(row, "Schedule Begin")
        end = value(row, "Schedule End")
        label = (
            str(row[schedule_column]).strip()
            if schedule_column is not None and schedule_column < len(row)
            else ""
        )
        if begin and end:
            ideal[day].append({"name": name, **parse_shift(f"{begin}-{end}")})
        elif label.casefold() == "ad hoc":
            ideal[day].append({"name": name, "label": "Ad hoc"})
        elif begin or end or label:
            raise ValueError("Duty-List: incomplete schedule")
    for shifts in ideal.values():
        shifts.sort(key=lambda shift: (shift.get("start", 1441), shift["name"]))
    return ideal


def unique_people(pairs):
    people = {}
    for name, shifts in pairs:
        if name in people:
            raise ValueError("Duplicate doctor in dated schedule")
        people[name] = shifts
    return people


def normalize(info, monthly, duty_rows=None):
    columns = info_columns(info)

    def value(row, column):
        return str(row[column]).strip() if column is not None and column < len(row) else ""

    profiles = {}
    personnel = []
    personnel_names = set()
    for row in info[1:]:
        name = value(row, columns["name"])
        if not name:
            continue
        category = value(row, columns["category"])
        if name in personnel_names:
            raise ValueError("Duplicate IHC personnel in Info")
        personnel_names.add(name)
        personnel.append({"name": name, "user_id": value(row, columns["user_id"]),
                          "category": category if columns["category"] is not None else "Doctor"})
        if columns["category"] is not None and category.casefold() != "doctor":
            continue
        if name in profiles:
            raise ValueError("Duplicate medical officer in Info")
        profiles[name] = {
            "name": name,
            "role": value(row, columns["role"]),
            "qual": value(row, columns["qual"]),
        }
    schedule = {}
    for title, rows in monthly.items():
        if len(rows) < 3 or rows[2][:3] != ["Date", "Day", "Schedule"]:
            raise ValueError(f"{title}: expected Date, Day, Schedule in row 3")
        for row in rows[3:]:
            if not row or not any(str(cell).strip() for cell in row):
                continue
            # The monthly formulas emit an empty JSON object for unused day 31.
            if row[:2] == ["", ""] and len(row) == 3 and row[2].strip() == "{}":
                continue
            if len(row) < 3 or not row[2]:
                raise ValueError(f"{title}: incomplete dated schedule")
            day = date.fromisoformat(str(row[0]))
            if f"{MONTHS[day.month - 1]}-{day.year}" != title or DAYS[day.weekday()] != row[1]:
                raise ValueError(f"{title}: date/day mismatch")
            key = day.isoformat()
            if key in schedule:
                raise ValueError("Duplicate roster date")
            people = json.loads(row[2], object_pairs_hook=unique_people)
            if not isinstance(people, dict):
                raise ValueError("Schedule must be a JSON object")
            shifts = []
            for name, times in people.items():
                if name not in profiles:
                    raise ValueError(f"{title}: scheduled doctor missing from Info")
                if not isinstance(times, list):
                    raise ValueError("Doctor schedule must be a list of shifts")
                for value in times:
                    shifts.append({"name": name, **parse_shift(value)})
            schedule[key] = sorted(shifts, key=lambda shift: (shift["start"], shift["name"]))
    if not profiles or not schedule:
        raise ValueError("No doctor profiles or dated rosters found")
    return {
        "doctors": sorted(profiles.values(), key=lambda doctor: doctor["name"]),
        "personnel": personnel,
        "schedule": schedule,
        "ideal_schedule": normalize_ideal_schedule(duty_rows, profiles),
    }


def fetch_roster(client):
    workbook = client.read_workbook()
    tabs = {sheet["properties"]["title"]: sheet for sheet in workbook["sheets"]}
    if "Info" not in tabs:
        raise ValueError("The Info sheet is missing")
    if "Duty-List" not in tabs:
        raise ValueError("The Duty-List sheet is missing")
    months = sorted(title for title in tabs if MONTH_TAB.fullmatch(title))
    if not months:
        raise ValueError("No monthly roster tabs found")
    titles = ["Info", "Duty-List", *months]
    # Other tabs and helper columns never become part of the public API payload.
    # Read every Info header so personnel columns may move. normalize() selects
    # public doctor fields plus the form's personnel directory. Contacts and
    # unrelated helper columns are discarded; UserID is only shown in the form.
    data = {}
    for title in titles:
        grids = tabs[title].get("data", [])
        rows = grids[0].get("rowData", []) if grids else []
        values = [[cell.get("formattedValue", "") for cell in row.get("values", [])] for row in rows]
        data[title] = values if title in {"Info", "Duty-List"} else [row[:3] for row in values]
    info = data.pop("Info")
    duty_rows = data.pop("Duty-List")
    result = normalize(info, data, duty_rows)
    result["source_tabs"] = titles
    return result
