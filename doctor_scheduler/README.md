# IHC doctor scheduler

The supplied design now displays live doctor profiles and dated schedules from
the [roster spreadsheet](https://docs.google.com/spreadsheets/d/1ly7oTO9hWSTxfOr1di7H7LMHRgZutOsmfdxJQQhj-KA/edit).
Staff lists are empty. Announcements, staff administration, and centre contact
management are reserved for the later controlled admin pages.

## Run locally

From the repository root, first-time setup:

```powershell
python -m venv doctor_scheduler/.venv
doctor_scheduler/.venv/Scripts/python.exe -m pip install -r doctor_scheduler/requirements.txt
```

Keep the service-account JSON in `doctor_scheduler/keys/`. If there are multiple
keys, set `GOOGLE_APPLICATION_CREDENTIALS` to the intended file's absolute path.
The spreadsheet is already shared with the supplied service account.

```powershell
doctor_scheduler/.venv/Scripts/python.exe doctor_scheduler/server.py --port 8081
```

Open <http://127.0.0.1:8081>. The Python server is required; opening the HTML file
directly cannot load the data. Add `--host 0.0.0.0` for access from the local network.

## Separation of data and design

- `index.html`: page structure and empty containers; no hardcoded doctor roster.
- `styles.css`: the professor's design, including its colour variables and
  responsive layouts.
- `app.js`: renders API data safely as text and updates the visible schedule.
- `sheets_client.py`: server-only Google authentication and rate-limited reads.
- `roster.py`: validates and converts spreadsheet values into plain roster data,
  independently of any HTML or styles.
- `server.py`: serves an explicit allowlist of public files and `/api/schedule`.
  Keys, Python sources, caches, and directory listings cannot be downloaded.
- `.cache/`: ignored local snapshot and SQLite read-attempt timestamp.

## Exactly one Sheets read per two-minute interval

One background worker reads Google Sheets no more frequently than once every
120 seconds. A single `spreadsheets.get` request returns the tab names and cell
values together. There are no separate per-tab reads or metadata lookups.
Google authentication tokens are managed separately by the authentication library.

Every browser uses the same server cache. Loading/reloading a page or pressing
Retry **does not call Google Sheets**. Browser polling follows the server's next
refresh time; it can check the local endpoint again while a refresh is finishing.
Shift indicators follow the clock every 15 seconds using cached data.

The limiter records each attempted read before the request, including failures.
It survives process restarts on the same filesystem and is shared across local
processes. API failures wait for the next permitted interval; automatic Sheets
request retries are disabled. Run one hosted instance: independent hosts with
independent disks would have independent limits.

A failed refresh retains the last successful roster and shows an "Updates
delayed" notice and last checked timestamp. Without a saved roster, the page
shows an unavailable state and retries the local endpoint. Saving a snapshot
allows local restarts to display the previous roster while waiting for Google.

## Spreadsheet structure and schedule behavior

- `Info`: row 1 contains `Medical Officer`, `System`, and `Qualification` in A:C.
  These fields populate the doctor directory and schedule cards.
- Monthly tabs named `Sep-2026`, `Oct-2026`, etc.: row 3 contains `Date`, `Day`,
  and `Schedule` in A:C. Dates are ISO `YYYY-MM-DD`; Schedule is a JSON object
  mapping a doctor's exact name to a list of shifts, e.g.
  `{"Dr. Example": ["0600–1200", "1800–2100"]}`.
- `Duty-List` and `Updates` feed the sheet's monthly formulas. The website reads
  the resulting dated rosters, so it does not apply leave or changes a second time.
- New monthly tabs using the same layout are discovered in the same single read.
- `2400` means the end of that date. Overnight duties are split at midnight in
  the sheet. Shift starts are inclusive and ends exclusive.
- The page uses India time, including date rollover and Monday–Sunday weeks.
  A week can span two monthly tabs. Only this week's schedule is sent to browsers.
- Missing dates show "Schedule not published"; `{}` means a published day with
  no doctor shifts. Old dates are never repeated as a fallback. Sunday follows
  the actual roster; the page does not claim the centre is closed.
- Today's cards show all doctors scheduled that day, with a separate "Scheduled
  now" indicator. This describes the roster, not attendance or check-in.
- All shifts are shown in the weekly grid; the old design's three-doctor limit
  has been removed.

The supplied sheet currently covers September–December 2026. Maintain/add future
monthly tabs in the sheet to extend the schedule. Invalid profiles, dates, or
shift JSON cause the refresh to fail rather than silently dropping duties.

## Free temporary hosting on Render

`render.yaml` describes a free Python web service in Singapore. It uses this
folder as the service root and runs the same server as the local preview.
No Firebase project or paid database is needed.

Once this version is in the GitHub repository:

1. In Render, connect the repository and create a Blueprint using
   `doctor_scheduler/render.yaml`. Alternatively create a free Python Web Service
   with root directory `doctor_scheduler`, build command
   `pip install -r requirements.txt`, and start command
   `python server.py --host 0.0.0.0`.
2. In the service's Environment settings, add a **Secret File** named
   `google-service-account.json`, using the contents of the existing key file.
   It is mounted at `/etc/secrets/google-service-account.json`. Never add the key
   to GitHub or a public/static directory.
3. Set `GOOGLE_APPLICATION_CREDENTIALS=/etc/secrets/google-service-account.json`
   and `IHC_SPREADSHEET_ID=1ly7oTO9hWSTxfOr1di7H7LMHRgZutOsmfdxJQQhj-KA` if using
   manual service setup. The Blueprint already sets these variables.
4. Deploy/redeploy after adding the secret. Render supplies an HTTPS URL.

The user accepted idle pauses for this temporary host. Render's free service
sleeps after 15 minutes without inbound traffic, so background polling pauses
then. A visitor wakes the service; startup can take about a minute. Free hosting
has an ephemeral filesystem, so redeploys/restarts can discard the local cache
and limiter timestamp. A new instance performs a fresh read and then enforces
the 120-second interval. Keep a single service instance.

The deployment configuration is prepared; no Render service has been created
or deployed from this workspace. Render account/repository access is still needed.

References: [Render free service limits](https://render.com/docs/free),
[Render secret files](https://render.com/docs/configure-environment-variables),
[Sheets read API](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/get).

## Verification

```powershell
doctor_scheduler/.venv/Scripts/python.exe -m unittest discover -s doctor_scheduler -p 'test_*.py' -v
node --test doctor_scheduler/schedule.test.js
```

`browser-live-check.js` checks the live page on port 8081 using a dedicated
headless Chrome instance with debugging port 9223. It checks six screen widths,
cache refreshes, offline recovery, empty/unpublished schedules, and blocked
private files. It uses mocked browser responses to simulate changes, without
editing the spreadsheet or causing extra Google reads. Screenshots go in `.cache/`.
It closes its dedicated Chrome instance after completion.

## Professor's source files and earlier prototype

`new_design/liveihc-template.html` is the original Jinja2 layout;
`new_design/build_health_centre.py` fills it using hardcoded sample data and
produces `new_design/index.html`. These supplied files remain as references.
The live website no longer uses that static generation step.

The previous CSV importer, sample data, and `browser-check.js` remain historical
prototype files. That old browser check does not apply to the live design.
