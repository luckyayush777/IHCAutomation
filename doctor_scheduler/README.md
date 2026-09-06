# IHC doctor schedule prototype

A separate, responsive website with a weekly timetable, currently scheduled
doctors, and currently scheduled staff. Plain HTML/CSS/JavaScript and a small
Python standard-library server; no package installation or build step required.

## Run

From the repository root:

```powershell
python doctor_scheduler/server.py
```

Open <http://127.0.0.1:8080>. To preview multiple doctors on duty, open
<http://127.0.0.1:8080/?day=Tue&time=18:30>. The yellow preview banner makes it
explicit that this is a simulated time. Prototype controls below the cards let
you change the day/time or return to the real clock.

For a phone on the same trusted network:

```powershell
python doctor_scheduler/server.py --host 0.0.0.0
```

Open `http://<your-PC-LAN-IP>:8080` on the phone. The computer's firewall must allow
the connection. This is a development server, not a production deployment.
Opening `index.html` directly does not work because data comes from the Python endpoint.

## Data and behavior

- `data/schedule.csv` is derived from `example_schedules/schedule-doc.xlsx`.
  Each row contains `day,doctor_id,start,end`, with a three-letter day and 24-hour
  times. `24:00` means the end of that day. The supplied reference is split at
  midnight; empty spreadsheet cells remain gaps. Multiple doctors can overlap.
- `data/profiles.json` maps the original doctor codes to illustrative specialties
  and fixed rooms. Full doctor names are still pending. **All staff names, roles,
  locations, shifts, and doctor specialties/rooms are sample data.**
- Portraits are local placeholders. Set a profile's `photo` to an image path or
  URL when actual photographs are available.
- All schedule comparisons use India time (`Asia/Kolkata`), regardless of the
  visitor's device timezone. Shifts include their start and exclude their end.
  The view checks the clock every 15 seconds and on returning to the tab.
- The week repeats. Holidays, leave, date-specific exceptions, and actual
  attendance are not implemented. “Available” means scheduled, not checked in.
- `/api/schedule` reads the CSV and profiles on each page load. Reload to see
  edited files. The footer reports the local data files' modification time.
- The mobile view stacks all seven days, with two shift cards per row. Desktop
  shows seven columns. Phone navigation jumps directly to current doctors or
  staff. Today is highlighted; preview mode highlights its chosen day.

Regenerate the CSV after editing the reference workbook:

```powershell
python doctor_scheduler/import_schedule.py
```

The importer is specific to the supplied workbook's time columns and sheet.
It is not a general Excel upload feature.

## Check schedule logic

With the repository's existing Node installation:

```powershell
node --test doctor_scheduler/schedule.test.js
```

`browser-check.js` is an optional smoke check using Node's native WebSocket and
Chrome's debugging protocol. With the Python server running and a dedicated
headless Chrome instance listening on port 9223, run
`node doctor_scheduler/browser-check.js`. It checks six screen widths, preview
controls, empty states, and failed-load recovery, saves desktop/mobile screenshots,
and closes that dedicated Chrome instance.

## Next integration

Google Sheets is the intended admin-maintained source; it is **not connected** in
this prototype. After the sheet structure and access method are supplied, the
Python endpoint can fetch and normalize it to the same response structure.
Then add refresh/error handling and a last-successful local snapshot. No admin
editing interface, authentication, or uploads are included in this layout phase.
