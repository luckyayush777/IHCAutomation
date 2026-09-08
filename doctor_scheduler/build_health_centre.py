"""Render the public page atomically. Cron reads Sheets; CGI uses --cached."""

import argparse
from contextlib import contextmanager
from datetime import datetime, timedelta
import json
import logging
import os
from pathlib import Path
import tempfile

from jinja2 import Environment, FileSystemLoader, StrictUndefined

from personnel.store import IST, initialize, read_day
from roster import DAYS, fetch_roster
from settings import ROOT, load_settings
from sheets_client import SheetsClient

REFRESH_SECONDS = 900


@contextmanager
def build_lock(data_dir):
    """OS releases the cross-process lock even if a builder crashes."""
    data_dir.mkdir(parents=True, exist_ok=True)
    with (data_dir / "build.lock").open("a+b") as lock:
        if os.name == "nt":
            import msvcrt
            lock.seek(0)
            msvcrt.locking(lock.fileno(), msvcrt.LK_LOCK, 1)
        else:
            import fcntl
            fcntl.flock(lock, fcntl.LOCK_EX)
        try:
            yield
        finally:
            if os.name == "nt":
                lock.seek(0)
                msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(lock, fcntl.LOCK_UN)


def atomic_write(path, content, public=False):
    """Unique temporary file on the destination filesystem, then one replace."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", newline="\n",
                                         dir=path.parent, prefix=f".{path.name}.", suffix=".tmp",
                                         delete=False) as stream:
            temporary = Path(stream.name)
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        temporary.chmod(0o644 if public else 0o600)
        os.replace(temporary, path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def read_cache(settings):
    saved = json.loads((settings.data_dir / "roster.json").read_text(encoding="utf-8"))
    if saved["spreadsheet_id"] != settings.spreadsheet_id or saved["version"] != 1:
        raise ValueError("Roster cache belongs to another sheet or version")
    if datetime.fromisoformat(saved["updated_at"]).tzinfo is None:
        raise ValueError("Roster cache timestamp must include a timezone")
    return saved


def timing(shifts):
    def clock(value):
        return f"{value // 60:02}:{value % 60:02}"
    return ", ".join(shift.get("label") or f"{clock(shift['start'])}\u2013{clock(shift['end'])}" for shift in shifts)


def reported_time(value):
    if not value:
        return ""
    try:
        return datetime.fromisoformat(value).astimezone(IST).strftime("%Y-%m-%d %H:%M IST")
    except ValueError:
        return value  # Legacy text remains escaped by Jinja.


def build_payload(roster, status_records, now, checked_at, update_url):
    if now.tzinfo is None:
        raise ValueError("Generation time must include a timezone")
    now = now.astimezone(IST)
    today = now.date()
    week = []
    for offset in range(7):
        day = today + timedelta(days=offset)
        shifts = roster["schedule"].get(day.isoformat())
        names = dict.fromkeys(shift["name"] for shift in shifts or [])
        week.append({"day": DAYS[day.weekday()], "date": day.isoformat(),
                     "css_class": "today" if day == today else "",
                     "published": shifts is not None,
                     "doctors": [{"name": name, "timing": timing([s for s in shifts if s["name"] == name])} for name in names]})
    today_shifts = roster["schedule"].get(today.isoformat())
    people = []
    profiles = roster["doctors"] + [
        {"name": person["name"], "role": person["category"], "qual": ""}
        for person in roster.get("personnel", []) if person["category"].casefold() != "doctor"]
    doctor_names = {person["name"] for person in roster["doctors"]}
    for profile in profiles:
        shifts = [s for s in today_shifts or [] if s["name"] == profile["name"]]
        record = status_records.get(profile["name"], {})
        # Filter by date even if a caller accidentally passes yesterday's records.
        if record.get("date") != today.isoformat():
            record = {}
        people.append({**profile, "timing": "" if profile["name"] not in doctor_names else timing(shifts) if shifts else
                       ("No scheduled duty" if today_shifts is not None else "Roster not published"),
                       "state": record.get("state", "unconfirmed"),
                       "updated_at": reported_time(record.get("updated_at", ""))})
    ideal = []
    for profile in roster["doctors"]:
        ideal.append({**profile, "week": [{"day": day, "timing": timing([
            s for s in roster["ideal_schedule"].get(day, []) if s["name"] == profile["name"]])} for day in DAYS]})
    checked = datetime.fromisoformat(checked_at).astimezone(IST)
    return {"week_grid": week, "people": people, "ideal_doctors": ideal,
            "all_doctors": roster["doctors"], "update_url": update_url,
            "meta": {"title": "Institute Health Centre", "today": today.isoformat(),
                     "generated": now.strftime("%Y-%m-%d %H:%M:%S IST"),
                     "checked": checked.strftime("%Y-%m-%d %H:%M:%S IST"),
                     "stale": (now - checked).total_seconds() > REFRESH_SECONDS * 2,
                     "week_start": today.isoformat(), "week_end": (today + timedelta(days=6)).isoformat()}}


def template_environment():
    return Environment(loader=FileSystemLoader(ROOT), autoescape=True, undefined=StrictUndefined)


def build(settings, cached=False, now=None, loader=None):
    """The sole publishing path, shared by cron, manual builds, and personnel."""
    with build_lock(settings.data_dir):
        now = now or datetime.now(IST)
        if now.tzinfo is None:
            raise ValueError("Generation time must include a timezone")
        saved = None
        try:
            saved = read_cache(settings)
        except (OSError, ValueError, KeyError):
            if cached:
                raise
        interval = int(now.timestamp()) // REFRESH_SECONDS
        fresh = saved and int(datetime.fromisoformat(saved["updated_at"]).timestamp()) // REFRESH_SECONDS == interval
        if not cached and not fresh:
            # The attempt marker also bounds repeated failed/manual reads to 15 minutes.
            marker = settings.data_dir / "sheets-attempt.txt"
            if marker.exists() and int(float(marker.read_text())) // REFRESH_SECONDS >= interval:
                raise RuntimeError("Sheets read cooldown; retry at the next 15-minute interval")
            atomic_write(marker, str(now.timestamp()))
            roster = loader() if loader else fetch_roster(SheetsClient(settings.credentials, settings.spreadsheet_id))
            saved = {"version": 1, "spreadsheet_id": settings.spreadsheet_id,
                     "updated_at": now.isoformat(), "data": roster}
        initialize(settings.database)
        records = read_day(settings.database, now.astimezone(IST).date().isoformat())
        payload = build_payload(saved["data"], records, now, saved["updated_at"], settings.update_url)
        rendered = template_environment().get_template("liveihc-template.html").render(payload)
        # Rendering and all reads must succeed before either last-good file changes.
        atomic_write(settings.data_dir / "roster.json", json.dumps(saved, ensure_ascii=False))
        atomic_write(settings.public_dir / "index.html", rendered, public=True)
        logging.info("Generated index.html: %d doctors", len(saved["data"]["doctors"]))
        return settings.public_dir / "index.html"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path)
    parser.add_argument("--cached", action="store_true", help="regenerate using the last good roster without reading Sheets")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    try:
        build(load_settings(args.config), cached=args.cached)
        return 0
    except Exception as error:
        # Do not include API response bodies, credentials, or private cell values.
        logging.error("Generation failed (%s); last public page retained", type(error).__name__)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
