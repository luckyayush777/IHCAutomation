# IHC doctor scheduler

The public site is static. Apache serves one generated `index.html` plus separate
files under `src/`; it does not run Python for web requests. A cron job runs the
Python builder, reads Google Sheets and a private admin JSON file, then atomically
replaces the public `src/data.json` snapshot.

The page has three independent schedule views:

- **Actual Schedule** starts with dated monthly-sheet data. A date supplied in
  the admin JSON replaces that complete date, so admin data has priority.
- **Today's attendance** uses only admin JSON records. It may include visiting
  doctors that are not in the Sheet's `Info` tab.
- **Ideal Rotating Schedule** uses `Duty-List` and intentionally ignores leave
  and other dated corrections.

## Files

```text
doctor_scheduler/
|-- index.html                  generated Apache entry point
`-- src/
    |-- app.js                  browser rendering and static-data polling
    |-- schedule.js             merge and attendance rules
    |-- styles.css              public styles
    |-- data.json               generated public schedule snapshot
    |-- index.html              generated source-directory preview
    |-- liveihc-template.html   editable HTML source
    |-- build_health_centre.py  cron/build program
    `-- readme.txt              short operator note
```

The repository also retains the old `server.py` and `admin/` implementation for
local reference while the replacement admin source is being designed. Neither is
required by the public Apache site.

## Build locally

First-time setup from the repository root:

```powershell
python -m venv doctor_scheduler/.venv
doctor_scheduler/.venv/Scripts/python.exe -m pip install -r doctor_scheduler/requirements.txt
```

Keep the Google service-account file outside every public web directory. Set
`GOOGLE_APPLICATION_CREDENTIALS` to that file, or for local development keep the
single ignored key in `doctor_scheduler/keys/`.

The complete build reads the workbook and writes HTML plus `src/data.json`:

```powershell
doctor_scheduler/.venv/Scripts/python.exe doctor_scheduler/src/build_health_centre.py
```

To rebuild HTML after a design-only change without reading Sheets:

```powershell
doctor_scheduler/.venv/Scripts/python.exe doctor_scheduler/src/build_health_centre.py --assets-only
```

Preview through HTTP so browser modules and JSON load normally:

```powershell
python -m http.server 8081 --directory doctor_scheduler
```

Then open <http://127.0.0.1:8081>. No application server is involved.

## Admin JSON input

By default the builder reads ignored `storage/admin.json`. Production should set
`IHC_ADMIN_JSON` or pass `--admin-json` to a path outside Apache's document root.
Only public fields are copied to `src/data.json`; notes, account data, audit data,
and unknown fields are dropped.

```json
{
  "date": "2026-09-08",
  "status": "ok",
  "records": [
    {
      "name": "Dr. Example",
      "state": "present",
      "updated_at": "2026-09-08T09:15:00+05:30"
    }
  ],
  "schedule": {
    "2026-09-08": [{ "name": "Dr. Example", "start": 600, "end": 900 }]
  }
}
```

An admin `schedule` entry is authoritative for its date. An empty array publishes
that date with no doctors; `null` removes the date so the UI reports it as not
published. If the admin input file does not exist, the monthly actual schedule and
ideal rotation are still generated, while attendance is shown as unavailable.
Malformed input fails the cron build and leaves the previous public snapshot in
place.

## Apache and cron deployment

Apache runs on the university/server machine and serves its document directory,
for example `/var/www/html/ihc`. Cron runs on that same machine under a dedicated
account with read access to the credentials/admin input and write access only to
the generated public files.

Install the project and virtual environment, then use a crontab entry like:

```cron
*/2 * * * * GOOGLE_APPLICATION_CREDENTIALS=/etc/ihc/google-service-account.json IHC_ADMIN_JSON=/var/lib/ihc/admin.json flock -n /tmp/ihc-build.lock /var/www/html/ihc/.venv/bin/python /var/www/html/ihc/src/build_health_centre.py >>/var/log/ihc-build.log 2>&1
```

The service-account JSON and raw admin JSON must not be placed under
`/var/www/html`. Disable directory listing and deny direct requests for build
sources if the exact supplied directory layout must be retained:

```apache
<Directory /var/www/html/ihc>
    Options -Indexes
    Require all granted
</Directory>

<FilesMatch "(^liveihc-template\.html$|\.(py|txt)$)">
    Require all denied
</FilesMatch>
```

An even cleaner deployment copies only `index.html`, `src/app.js`,
`src/schedule.js`, `src/styles.css`, and `src/data.json` into the Apache document
root, while keeping the builder elsewhere. Both arrangements produce the same
site.

## Sheet structure

- `Info` supplies public doctor names, system/role, and qualification. Only rows
  whose `Category` is `Doctor` are included; user IDs and contacts stay private.
- Monthly tabs named like `Sep-2026` supply dated schedules in `Date`, `Day`, and
  `Schedule` columns. Schedule cells contain a JSON object mapping exact doctor
  names to shift strings.
- `Duty-List` supplies the weekday rotation shown in the bottom table.

The builder makes one `spreadsheets.get` request and validates headers, dates,
doctor names, and shifts before publishing. Its read limiter prevents more than
one attempt per two-minute interval. The browser only polls Apache's generated
`data.json`; page views never call Google Sheets.

## Verification

```powershell
doctor_scheduler/.venv/Scripts/python.exe -m unittest discover -s doctor_scheduler/tests -p 'test_*.py' -v
node --test doctor_scheduler/tests/schedule.test.js
```

`new_design/` contains the supplied design/reference material.
