import json
import re
import os
from datetime import datetime, time
from jinja2 import Environment, FileSystemLoader

# 1. DOCTOR PROFILES & SCHEDULES
RAW_DOCTOR_PROFILES = """
Medical OfficerSystemQualificationContact
Dr. Adarsh DubeyAllopathyMBBS
Dr. A.K. SinghAllopathySurgery
Dr. Aman Dhar SrivastavaAllopathyMBBS
Dr. Avinash JaiswalAllopathyOrthopedic Surgeon
Dr. Kaushalesh DwivediAllopathyMBBS
Dr. K.S. PandeyHomeopathy
Dr. PritimaAllopathyOB/GYN
Dr. S.K. UpadhyayAllopathyMD (Gen. Medicine)
"""

RAW_DOCTOR_SCHEDULES = """
DateDaySchedule
2026-09-01Tue{"Dr. Adarsh Dubey":["2130–2400"],"Dr. A.K. Singh":["0600–1200"],"Dr. Kaushalesh Dwivedi":["1600–1800"],"Dr. K.S. Pandey":["1400–1600"],"Dr. Pritima":["1700–1900"],"Dr. S.K. Upadhyay":["1800–2100"]}
2026-09-02Wed{"Dr. Adarsh Dubey":["0000–0530","2130–2400"],"Dr. A.K. Singh":["0600–1200"],"Dr. Aman Dhar Srivastava":["1400–2000"],"Dr. Avinash Jaiswal":["1500–1700"],"Dr. S.K. Upadhyay":["1800–2100"]}
2026-09-03Thu{"Dr. Adarsh Dubey":["0000–0530","2130–2400"],"Dr. A.K. Singh":["0600–1200"],"Dr. Kaushalesh Dwivedi":["1600–1800"],"Dr. K.S. Pandey":["1400–1600"],"Dr. Pritima":["1700–1900"],"Dr. S.K. Upadhyay":["1800–2100"]}
2026-09-04Fri{"Dr. Adarsh Dubey":["0000–0530","2130–2400"],"Dr. A.K. Singh":["0600–1200"],"Dr. Aman Dhar Srivastava":["1400–2000"],"Dr. Avinash Jaiswal":["1500–1700"],"Dr. S.K. Upadhyay":["1800–2100"]}
2026-09-05Sat{"Dr. Adarsh Dubey":["0000–0530","2130–2400"],"Dr. A.K. Singh":["0600–1200"],"Dr. Aman Dhar Srivastava":["1400–2000"],"Dr. Kaushalesh Dwivedi":["1600–1800"],"Dr. Pritima":["1700–1900"],"Dr. S.K. Upadhyay":["1800–2100"]}
2026-09-06Sun{"Dr. Adarsh Dubey":["2130–2400","0000–0530"],"Dr. Aman Dhar Srivastava":["0800–2000"],"Dr. K.S. Pandey":["1400–1600"],"Dr. S.K. Upadhyay":["1000–1200"]}
2026-09-07Mon{"Dr. Adarsh Dubey":["0000–0530"],"Dr. A.K. Singh":["0600–1200"],"Dr. Aman Dhar Srivastava":["1400–2000"],"Dr. Avinash Jaiswal":["1500–1700"],"Dr. S.K. Upadhyay":["1800–2100"]}
"""

# 2. STAFF PROFILES & SCHEDULES (Tab or space separated)
RAW_STAFF_PROFILES = """
Staff Name\tQualification\tContact
Mr. Rajesh Kumar\tB.Sc. Nursing\t+91-9876543210
Ms. Pooja Singh\tB. Pharm\t+91-9876543211
Mr. Imran Ali\tDiploma in Lab Technology\t+91-9876543212
Ms. Anita Yadav\tDMLT\t+91-9876543213
Mr. Suresh Patel\tDiploma (Health Assistant)\t+91-9876543214
Ms. Farhana Khan\tGraduate\t+91-9876543215
"""

RAW_STAFF_SCHEDULES = """
DateDaySchedule
2026-09-01Tue{"Mr. Rajesh Kumar":["0900–1700"],"Ms. Pooja Singh":["0900–1700"],"Mr. Imran Ali":["0900–1700"]}
2026-09-02Wed{"Mr. Rajesh Kumar":["0900–1700"],"Ms. Pooja Singh":["0900–1700"],"Ms. Anita Yadav":["0900–1700"]}
2026-09-03Thu{"Mr. Rajesh Kumar":["0900–1700"],"Ms. Pooja Singh":["0900–1700"],"Mr. Suresh Patel":["0900–1700"]}
2026-09-04Fri{"Mr. Rajesh Kumar":["0900–1700"],"Ms. Pooja Singh":["0900–1700"],"Ms. Farhana Khan":["0900–1700"]}
2026-09-05Sat{"Mr. Rajesh Kumar":["0900–1400"],"Ms. Pooja Singh":["0900–1400"],"Mr. Imran Ali":["0900–1400"]}
2026-09-06Sun{"Mr. Suresh Patel":["0900–1300"]}
2026-09-07Mon{"Mr. Rajesh Kumar":["0900–1700"],"Ms. Pooja Singh":["0900–1700"],"Mr. Imran Ali":["0900–1700"]}
"""

# 3. ANNOUNCEMENTS & HELPLINE CONFIGURATION
RAW_ANNOUNCEMENTS = """
Free OPD consultation available for registered members
Emergency ambulance operational 24x7 via internal extension
Essential medicines dispensable through IHC Central Pharmacy
Please present institutional ID card at reception desk
Health Centre sanitization routine scheduled daily between 1300–1400
"""

RAW_CONTACTS = """
Helpline: Ext. 112 / +91-532-2922000
Ambulance: Ext. 108 / +91-9415000000
Pharmacy: Ext. 115
Location: Institute Health Centre, Prayagraj, Uttar Pradesh
"""


def parse_mil_time(t_str):
    t_str = t_str.strip()
    if t_str == "2400":
        return time(23, 59, 59)
    return datetime.strptime(t_str, "%H%M").time()


def format_shift(shift_str):
    start_str, end_str = re.split(r"[–-]", shift_str)
    return f"{start_str[:2]}:{start_str[2:]}–{end_str[:2]}:{end_str[2:]}"


def parse_doctor_profiles(raw_text):
    profiles = {}
    pattern = re.compile(r"^(Dr\.\s+[A-Za-z\.\s]+?)(Allopathy|Homeopathy|Ayurveda)(.*)$")
    for line in raw_text.strip().splitlines():
        line = line.strip()
        if not line or line.startswith("Medical Officer"):
            continue
        parts = [p.strip() for p in line.split("\t") if p.strip()]
        if len(parts) >= 3:
            profiles[parts[0]] = {"role": parts[1], "qual": parts[2], "contact": parts[3] if len(parts) > 3 else ""}
        else:
            match = pattern.match(line)
            if match:
                name, system, qual = match.groups()
                profiles[name.strip()] = {
                    "role": system.strip(),
                    "qual": qual.strip() if qual.strip() else system.strip(),
                    "contact": ""
                }
    return profiles


def parse_staff_profiles(raw_text):
    profiles = {}
    for line in raw_text.strip().splitlines():
        line = line.strip()
        if not line or line.startswith("Staff Name"):
            continue
        parts = [p.strip() for p in line.split("\t") if p.strip()]
        if len(parts) >= 2:
            name = parts[0]
            qual = parts[1]
            contact = parts[2] if len(parts) > 2 else ""
            profiles[name] = {"role": "Staff Member", "qual": qual, "contact": contact}
    return profiles


def parse_schedule_feed(raw_text):
    rows = []
    pattern = re.compile(r"^(\d{4}-\d{2}-\d{2})([A-Za-z]{3})(\{.*\})$")
    for line in raw_text.strip().splitlines():
        line = line.strip()
        if not line or line.startswith("DateDaySchedule"):
            continue
        match = pattern.match(line)
        if match:
            date_str, day_abbr, json_str = match.groups()
            rows.append({
                "date": datetime.strptime(date_str, "%Y-%m-%d"),
                "date_str": date_str,
                "day": day_abbr,
                "schedule": json.loads(json_str)
            })
    return rows


def find_today_row(rows, today):
    """Prefer the exact date; fall back to the weekday for partial feeds."""
    return (
        next((row for row in rows if row["date"].date() == today.date()), None)
        or next((row for row in rows if row["day"] == today.strftime("%a")), None)
    )


def get_profile(profiles, name, default_role):
    return profiles.get(
        name,
        {"role": default_role, "qual": "", "contact": ""},
    )


def build_week_grid(doc_schedules, staff_schedules, today):
    staff_by_day = {row["day"]: row["schedule"] for row in staff_schedules}
    today_code = today.strftime("%a")
    week_grid = []

    for row in doc_schedules:
        doctors = [
            {
                "name": name,
                "timing": ", ".join(format_shift(shift) for shift in shifts),
            }
            for name, shifts in row["schedule"].items()
        ]

        classes = []
        if row["day"] == today_code:
            classes.append("today")
        if not doctors:
            classes.append("closed")

        week_grid.append({
            "day": row["day"],
            "date": row["date"].strftime("%d %b"),
            "css_class": " ".join(classes),
            "doctors": doctors,
            "staff_count": len(staff_by_day.get(row["day"], {})),
        })

    return week_grid


def build_payload(
    doc_profiles,
    doc_schedules,
    staff_profiles,
    staff_schedules,
    now=None,
):
    now = now or datetime.now()
    today_code = now.strftime("%a")

    today_doc_row = find_today_row(doc_schedules, now)
    today_staff_row = find_today_row(staff_schedules, now)

    if today_doc_row is None:
        raise ValueError(
            f"No doctor schedule found for {today_code} ({now:%Y-%m-%d})."
        )

    today_shifts = []
    for shifts in today_doc_row["schedule"].values():
        for shift in shifts:
            start_raw, end_raw = re.split(r"[–-]", shift)
            today_shifts.append(
                (parse_mil_time(start_raw), parse_mil_time(end_raw))
            )

    if today_shifts:
        earliest = min(start for start, _ in today_shifts)
        latest = max(end for _, end in today_shifts)
        opd_timings = (
            f"{earliest.strftime('%I:%M %p')} – "
            f"{latest.strftime('%I:%M %p')}"
        )
        status = "Operational" if earliest <= now.time() <= latest else "Closed"
    else:
        opd_timings = "Closed"
        status = "Closed"

    duty_doctors = []
    for name, shifts in today_doc_row["schedule"].items():
        info = get_profile(doc_profiles, name, "Doctor")
        duty_doctors.append({
            "name": name,
            "role": info["role"],
            "qual": info["qual"],
            "contact": info["contact"],
            "timing": ", ".join(format_shift(shift) for shift in shifts),
        })

    duty_staff = []
    if today_staff_row:
        for name, shifts in today_staff_row["schedule"].items():
            info = get_profile(staff_profiles, name, "Staff Member")
            duty_staff.append({
                "name": name,
                "role": info["role"],
                "qual": info["qual"],
                "contact": info["contact"],
                "timing": ", ".join(format_shift(shift) for shift in shifts),
            })

    # The template calls for weekly availability of today's doctors.
    current_doctors = []
    for name in today_doc_row["schedule"]:
        info = get_profile(doc_profiles, name, "Doctor")
        week = []

        for row in doc_schedules:
            shifts = row["schedule"].get(name, [])
            week.append({
                "day": row["day"],
                "on": bool(shifts),
                "timing": ", ".join(format_shift(shift) for shift in shifts),
            })

        current_doctors.append({
            "name": name,
            "role": info["role"],
            "qual": info["qual"],
            "week": week,
        })

    all_doc_names = sorted({
        *doc_profiles,
        *(name for row in doc_schedules for name in row["schedule"]),
    })
    all_doctors = []

    for name in all_doc_names:
        info = get_profile(doc_profiles, name, "Doctor")
        all_doctors.append({
            "name": name,
            "role": info["role"],
            "qual": info["qual"],
        })

    all_staff = []
    for name, info in sorted(staff_profiles.items()):
        all_staff.append({
            "name": name,
            "role": info["role"],
            "qual": info["qual"],
        })

    announcements = [
        line.strip()
        for line in RAW_ANNOUNCEMENTS.strip().splitlines()
        if line.strip()
    ]

    contacts = {
        line.split(":", 1)[0].strip(): line.split(":", 1)[1].strip()
        for line in RAW_CONTACTS.strip().splitlines()
        if ":" in line
    }

    location = contacts.get(
        "Location",
        "Institute Health Centre, Prayagraj, Uttar Pradesh",
    )

    return {
        "announcements": announcements,
        "meta": {
            "title": "Institute Health Centre",
            "status": status,
            "opd_timings": opd_timings,
            "today_day": today_code,
            "today_date_str": today_doc_row["date"].strftime("%a, %d %b %Y"),
            "helpline": contacts.get("Helpline", "Ext. 112"),
            "ambulance": contacts.get("Ambulance", "Ext. 108"),
            "pharmacy": contacts.get("Pharmacy", "Ext. 115"),
            "location": location,
            "footer_left": location,
            "footer_right": (
                f"Helpline: {contacts.get('Helpline', 'Ext. 112')} | "
                f"Ambulance: {contacts.get('Ambulance', 'Ext. 108')}"
            ),
        },
        "week_grid": build_week_grid(doc_schedules, staff_schedules, now),
        "duty_doctors": duty_doctors,
        "duty_staff": duty_staff,
        "current_doctors": current_doctors,
        "all_doctors": all_doctors,
        "all_staff": all_staff,
    }


def main(template_dir=".", template_file="liveihc-template.html", output_file="index.html"):
    env = Environment(loader=FileSystemLoader(template_dir), autoescape=True)
    template = env.get_template(template_file)

    doc_profiles = parse_doctor_profiles(RAW_DOCTOR_PROFILES)
    doc_schedules = parse_schedule_feed(RAW_DOCTOR_SCHEDULES)
    staff_profiles = parse_staff_profiles(RAW_STAFF_PROFILES)
    staff_schedules = parse_schedule_feed(RAW_STAFF_SCHEDULES)

    payload = build_payload(doc_profiles, doc_schedules, staff_profiles, staff_schedules)
    rendered_html = template.render(payload)

    with open(output_file, "w", encoding="utf-8") as f:
        f.write(rendered_html)

    print(f"Generated static site: {output_file}")


if __name__ == "__main__":
    main()