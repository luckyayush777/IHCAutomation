"""Convert the supplied weekly workbook to one CSV row per contiguous shift.

Uses only Python's standard library. The column boundaries describe this specific
reference workbook; a future admin import should use the documented CSV format.
"""

import csv
from pathlib import Path
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parent
NS = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
BOUNDARIES = [0, 60, 120, 180, 240, 300, 330, 360, 420, 480, 540, 600,
              660, 720, 780, 840, 900, 960, 1020, 1080, 1140, 1200,
              1260, 1290, 1380, 1440]
DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def extract_shifts(path):
    with zipfile.ZipFile(path) as workbook:
        strings = ["".join(node.itertext()) for node in
                   ET.fromstring(workbook.read("xl/sharedStrings.xml")).findall("s:si", NS)]
        sheet = ET.fromstring(workbook.read("xl/worksheets/sheet1.xml"))
    shifts = []
    day = None
    for row in sheet.findall("s:sheetData/s:row", NS):
        cells = {}
        for cell in row.findall("s:c", NS):
            value = cell.find("s:v", NS)
            if value is not None:
                column = "".join(c for c in cell.attrib["r"] if c.isalpha())
                cells[column] = strings[int(value.text)] if cell.get("t") == "s" else value.text
        if cells.get("A") in DAYS:
            day = cells["A"]
        if day is None:
            continue
        active, start = None, None
        for index in range(26):
            doctor = cells.get(chr(ord("B") + index)) if index < 25 else None
            if doctor != active:
                if active:
                    shifts.append({"day": day, "doctor_id": active,
                                   "start": f"{start // 60:02}:{start % 60:02}",
                                   "end": f"{BOUNDARIES[index] // 60:02}:{BOUNDARIES[index] % 60:02}"})
                active, start = doctor, BOUNDARIES[index]
    return sorted(shifts, key=lambda s: (DAYS.index(s["day"]), s["start"], s["doctor_id"]))


if __name__ == "__main__":
    records = extract_shifts(ROOT / "example_schedules" / "schedule-doc.xlsx")
    (ROOT / "data").mkdir(exist_ok=True)
    with (ROOT / "data" / "schedule.csv").open("w", newline="", encoding="utf-8") as output:
        writer = csv.DictWriter(output, fieldnames=["day", "doctor_id", "start", "end"])
        writer.writeheader()
        writer.writerows(records)
    print(f"Exported {len(records)} shifts to data/schedule.csv")
