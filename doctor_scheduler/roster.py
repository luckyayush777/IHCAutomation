"""Normalize dated sheet data independently of the website layout."""

from datetime import date
import json
import re

MONTH_TAB = re.compile(r"^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d{4}$")
DAYS = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")


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


def normalize(info, monthly):
    if not info or info[0][:3] != ["Medical Officer", "System", "Qualification"]:
        raise ValueError("Info headers must be Medical Officer, System, Qualification")
    profiles = {}
    for row in info[1:]:
        if not row or not str(row[0]).strip():
            continue
        name, role, qual = (list(row[:3]) + ["", "", ""])[:3]
        name = str(name).strip()
        if name in profiles:
            raise ValueError("Duplicate medical officer in Info")
        profiles[name] = {"name": name, "role": str(role).strip(), "qual": str(qual).strip()}
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
            if day.strftime("%b-%Y") != title or DAYS[day.weekday()] != row[1]:
                raise ValueError(f"{title}: date/day mismatch")
            key = day.isoformat()
            if key in schedule:
                raise ValueError("Duplicate roster date")
            people = json.loads(row[2])
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
    return {"doctors": sorted(profiles.values(), key=lambda doctor: doctor["name"]), "schedule": schedule}


def fetch_roster(client):
    workbook = client.read_workbook()
    tabs = {sheet["properties"]["title"]: sheet for sheet in workbook["sheets"]}
    if "Info" not in tabs:
        raise ValueError("The Info sheet is missing")
    months = sorted(title for title in tabs if MONTH_TAB.fullmatch(title))
    if not months:
        raise ValueError("No monthly roster tabs found")
    titles = ["Info", *months]
    # Other tabs and helper columns never become part of the public API payload.
    data = {}
    for title in titles:
        grids = tabs[title].get("data", [])
        rows = grids[0].get("rowData", []) if grids else []
        data[title] = [[cell.get("formattedValue", "") for cell in row.get("values", [])[:3]] for row in rows]
    result = normalize(data.pop("Info"), data)
    result["source_tabs"] = titles
    return result
