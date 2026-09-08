IHC DOCTOR SCHEDULER AND PERSONNEL STATUS
INSTALLATION, HANDOVER AND OPERATIONS README
Prepared: 8 September 2026

======================================================================
1. PURPOSE AND CURRENT STATUS
======================================================================

This system publishes the Institute Health Centre's doctor schedule and
personnel In/Out status. It is independent of the environmental sensor
dashboard and Raspberry Pi services elsewhere in the repository.

The implementation is available for review and local demonstration.
All 36 Python tests passed after the preview fixes on 8 September 2026.
These use temporary databases and simulated Sheet responses; two tests
also run a temporary loopback HTTP server. They do not certify the
institute's Apache or cron setup.

The existing local roster cache was read on 8 September 2026 at
21:20:53 IST. It contains eight doctors and fifteen personnel in total.
Those counts describe that snapshot; they are not hardcoded limits.
A fresh live Google read was not performed during the handover review.

The institute installation has NOT been performed or verified by this
review. Server configuration, permissions, HTTPS, staff accounts and
scheduled execution must be completed and accepted on the target server.

Packaging note for the sender:
The existing storage/professor-handover.zip was found to contain older
copies of README.md, HANDOVER.md, personnel/handler.py and
tests/test_admin.py. It also omits dev.py. Regenerate and verify the
package from current source before sending it. Adding this README does
not update that ZIP. The current scheduler changes also need a reviewed
version-control checkpoint so the delivered version can be identified.

======================================================================
2. HOW THE SYSTEM WORKS
======================================================================

Schedule publication:

  Google Sheets -> Python builder -> Jinja HTML template -> index.html
                                                           |
                                                        Apache
                                                           |
                                                        Browser

Personnel updates:

  Staff form -> username/password verification -> SQLite status/history
                                                     |
                                          same Python builder
                                          using cached roster
                                                     |
                                                 index.html

Cron runs the builder every fifteen minutes. The builder reads the
Google workbook and creates a complete public HTML page. Apache serves
that file. There is no continuously running production application
server, public JavaScript, JSON polling or public schedule API.

The personnel form runs through Python CGI. A valid submission saves
status and audit history in SQLite, then regenerates the public page
without reading Google Sheets again.

An already open browser page does not update itself. Reload it to see
newly published information. The page shows its status date, roster-read
time and generation time in India Standard Time, UTC+05:30.

Scheduled duty is not confirmation that someone is physically present.
Presence is a separate staff-reported value. Yesterday's status is not
automatically used as today's status.

======================================================================
3. WHAT THE RECIPIENT NEEDS
======================================================================

A. Server and administrator access

  - A Linux server with Apache and an existing HTTPS virtual host.
  - An administrator able to install dependencies, configure Apache,
    set file permissions and install a crontab for the runtime account.
  - Python 3.10 or later, with SQLite and virtual-environment support.
  - Apache CGI support: mod_cgi or mod_cgid.
  - The supplied Apache example also uses alias, authorization and
    headers modules. Its DirectoryIndex directive needs the server's
    directory-index support, normally mod_dir.
  - Cron, or an administrator-approved equivalent configured to run
    the exact builder command every fifteen minutes.
  - Writable private storage and permission to replace the public HTML.
  - Correct server time. The application derives dates in IST.
  - Sufficient disk space for the database, logs and retained backups.

B. Python dependencies

  Install the versions in requirements.txt into the dedicated venv:

    google-auth[requests]==2.57.1
    Jinja2==3.1.6

  These are the two direct requirements. pip also installs their
  dependencies. SQLite is provided by the Python installation; it is
  not a separate pip requirement.

C. Google access

  - The correct Google spreadsheet ID.
  - A Google service-account JSON credential file.
  - Google Sheets API enabled for the service account's project.
  - The workbook shared with the service account's email as a reader.
  - Outbound HTTPS and DNS access from the server to Google Sheets and
    the authentication endpoints used by the credential library.
  - Internet/package-index access for installation, or an approved
    offline package installation process.

  This application reads the Sheet. It does not write to the workbook.

D. Decisions that must be recorded before installation

  Public HTTPS origin: ______________________________________________
  Public schedule URL: ______________________________________________
  Personnel form URL: _______________________________________________
  Apache/CGI operating-system account: ______________________________
  Cron operating-system account (must match CGI): ____________________
  Administrator responsible for server setup: _______________________
  Person responsible for Sheet content: _____________________________
  Person responsible for staff accounts: ____________________________
  Backup destination and retention policy: __________________________
  Person responsible for checking failed builds: ____________________
  Delivered source commit/version: __________________________________

  An operating-system account is different from a staff form account.
  Cron and CGI share one OS identity. Individual staff use separate
  usernames/passwords stored in the application database.

======================================================================
4. FILES TO HAND OVER
======================================================================

Use this package layout. The sender must assemble it from current files.

  src/
    README.txt
    README.md
    HANDOVER.md
    requirements.txt
    build_health_centre.py
    dev.py                     Local preview and loopback HTTP tests only
    liveihc-template.html
    settings.py
    roster.py
    sheets_client.py
    personnel/
      __init__.py
      form.html
      handler.py
      store.py
      users.py
    tests/
      test_admin.py
      test_roster.py
      test_static_build.py
      test_dev.py

  deploy/
    config.example.json
    apache.conf
    personnel.cgi
    cron.txt
    logrotate.conf

  review/
    index.html                 Generated snapshot for visual review

For an optional interactive LOCAL demonstration, run the included dev.py
beside build_health_centre.py in src/. It requires a generated private roster
cache, obtained by running the builder with authorized Sheet access.
The HTML review snapshot alone is not enough to run that demonstration.

The optional browser-static-check.js uses a separately launched Chrome
debugging session. It is a development check, not a production runtime
dependency. The Python suite needs no browser or npm installation.

Transfer the Google credential separately using the institute's secure
process. Do not place it in the general handover ZIP or public directory.

Do not include the local venv, local SQLite database, roster cache,
test/demo status, browser profiles, logs, passwords or private config.
Existing production data, if any, must be preserved through a separate
controlled backup/migration process.

The generated review page is a dated snapshot. It may reflect local
status values and must not be treated as production attendance data.
Generate a new page on the server using the intended production database.

======================================================================
5. SOURCE FILES VERSUS GENERATED FILES
======================================================================

Edit these when needed:

  liveihc-template.html
    Public layout, wording and CSS. Preserve Jinja substitutions,
    escaping, loops and conditional logic.

  personnel/form.html
    Staff form layout and wording. Preserve POST, input names and values.

  Google Sheet
    Names, profiles, categories and scheduled duty.

  /etc/ihc/config.json
    Server-specific paths, spreadsheet ID, form URL and HTTPS origin.

Change Python code only with appropriate review and regression checks.

Generated/private files:

  index.html             Generated public page; do not edit by hand.
  roster.json            Private cached normalized workbook data.
  sheets-attempt.txt     Private marker controlling Google-read retries.
  build.lock            OS-managed lock used during generation.
  attendance.sqlite     Accounts, status, history and attempt limiter.
  build.log             Scheduled build output and errors.

The database retains the historical filename attendance.sqlite and its
table names for compatibility. Do not rename it without a migration.
No public data.json, /api/schedule or separate login/session server is
required by this implementation.

======================================================================
6. PROPOSED PRODUCTION DIRECTORY LAYOUT
======================================================================

The supplied server reference shows /home/website/html/ihc/ and src/.
The remaining locations below are deployment choices that the institute
administrator must provision and confirm.

  /home/website/html/ihc/index.html
      Generated public HTML.

  /home/website/html/ihc/src/
      Source files from the package's src/ directory.
      HTTP access must be denied by Apache.

  /home/website/ihc-venv/
      Dedicated Python virtual environment.

  /home/website/ihc-cgi/personnel.cgi
      Executable CGI entry point, outside DocumentRoot.

  /home/website/ihc-private/
      SQLite database, roster cache, lock, attempt marker and build log.

  /etc/ihc/config.json
      Private runtime configuration.

  /etc/ihc/google-service-account.json
      Private Google credential.

If these paths change, update all affected locations together:
config.json, the CGI shebang and import path, Apache ScriptAlias and
Directory blocks, cron, logrotate and operator commands.

Do not simply put the whole repository under Apache's document root.

======================================================================
7. OWNERSHIP AND PERMISSIONS
======================================================================

Determine the actual account executing personnel.cgi. Ordinary CGI may
run as the Apache worker account; a suexec arrangement may use another
identity. Do not assume the shell account visible in a screenshot is the
CGI identity.

Install this feature's cron entry under that SAME identity. The builder
creates private cache files with mode 0600, so a shared group between
different cron and CGI users is insufficient.

The administrator must arrange the following:

  - Source, CGI wrapper, venv and configuration remain administrator-
    controlled and non-writable by the CGI account.
  - Runtime account can read required sources/configuration/credentials
    and traverse their parent directories.
  - Private data directory is writable by the runtime account and has
    mode 0700. Restrict database files and backups to authorized access.
  - Runtime account can create temporary files and atomically replace
    index.html in /home/website/html/ihc/.
  - Generated public HTML is readable by Apache; the builder uses 0644.
  - CGI wrapper has executable permission, conventionally mode 0755,
    and Unix LF line endings.

Directory write permission is necessary for atomic replacement; write
permission on index.html alone is insufficient. Because src/ is beneath
the publication directory in the proposed layout, the administrator must
also account for directory-entry replacement rights when protecting the
source tree. Review parent permissions/ACLs or adjust the layout and all
matching paths if needed. Do not use blanket world-writable permissions.

Apache must deny HTTP access to src/, old assets, private files, dotfiles
and temporary publication files. Verify the actual HTTP behavior after
configuration; filesystem placement alone is not access protection.

======================================================================
8. INSTALLATION PROCEDURE -- LINUX SERVER
======================================================================

Commands below use the proposed paths. Administrative operations must
be performed by the server administrator. Builder, account-management
and cron operations must use the selected runtime identity.

Step 1: Preserve the existing installation

Back up existing public HTML, source, configuration and any production
status database. Use SQLite's online backup API for an active database.
Identify and stop only this feature's old service/cron entry during
cutover. Keep unrelated sensor/dashboard services and cron jobs intact.
Do not replace production history with a local demonstration database.

Step 2: Confirm prerequisites and create directories

Verify the installed interpreter:

  /usr/bin/python3 --version
  /usr/bin/python3 -c "import sqlite3; print(sqlite3.sqlite_version)"

The Python version must be at least 3.10. If /usr/bin/python3 does not
exist, use the institute's actual Python executable to create the venv.
Provision the directories and ownership described in sections 6 and 7.

Step 3: Install source and dependencies

Copy the approved src/ contents to /home/website/html/ihc/src/.
Do not deploy dev.py as a production service.

  /usr/bin/python3 -m venv /home/website/ihc-venv
  /home/website/ihc-venv/bin/python -m pip install -r /home/website/html/ihc/src/requirements.txt
  /home/website/ihc-venv/bin/python -c "import sqlite3, jinja2, google.auth; print('Runtime imports OK')"

Step 4: Install Google credentials and configuration

Share the workbook with the service account as a reader and install the
JSON key at /etc/ihc/google-service-account.json with restricted access.
Copy deploy/config.example.json to /etc/ihc/config.json and edit it.

Example configuration, with the origin placeholder to be replaced:

  {
    "data_dir": "/home/website/ihc-private",
    "public_dir": "/home/website/html/ihc",
    "credentials": "/etc/ihc/google-service-account.json",
    "spreadsheet_id": "1ly7oTO9hWSTxfOr1di7H7LMHRgZutOsmfdxJQQhj-KA",
    "update_url": "/ihc/personnel.cgi",
    "origin": "https://REPLACE-WITH-INSTITUTE-HOST"
  }

Configuration meanings:

  data_dir: Absolute private directory outside every public document root.
  public_dir: Absolute directory receiving the generated index.html.
  credentials: Absolute path to the Google service-account JSON.
  spreadsheet_id: Workbook ID, not the entire Google Sheets URL.
  update_url: Local absolute URL path of the personnel CGI form.
  origin: Exact HTTPS origin staff use, such as https://institute.example.
          Include a non-default port if applicable. No path, trailing
          slash, query or fragment. Staff must use this hostname.

The form rejects submissions from other origins. Merely changing the
browser Host header does not change the configured allowed origin.
Use valid JSON: double quotes, no comments and no trailing commas.
Never put a password or the contents of the Google key in config.json.

Step 5: Run offline tests

Run from the source directory so the command also works in the package:

  cd /home/website/html/ihc/src
  /home/website/ihc-venv/bin/python -m unittest discover -s tests -p 'test_*.py' -v

Expected result for this source version: 36 tests, ending with OK.
Tests create temporary state and do not require Google credentials.
The preview tests require dev.py and permission to bind a loopback port.
They do not exercise Apache itself.

Step 6: Generate the first real page

As the CGI/cron runtime account, run:

  /home/website/ihc-venv/bin/python /home/website/html/ihc/src/build_health_centre.py --config /etc/ihc/config.json

Expected: exit status zero, a generation log message, private roster
cache/database files, and /home/website/html/ihc/index.html.
Confirm the page's dates and personnel against the intended workbook.
First-time installation requires a successful Google read; there is no
usable fallback cache before that read succeeds.

Step 7: Create staff accounts

See section 10. Create each approved account; no production accounts or
default passwords are supplied. Sheet UserIDs do not create accounts.

Step 8: Install and enable Apache CGI

Install deploy/personnel.cgi at:

  /home/website/ihc-cgi/personnel.cgi

Its first line must remain:

  #!/home/website/ihc-venv/bin/python

Its import path points to /home/website/html/ihc/src. Its default runtime
configuration is /etc/ihc/config.json; an Apache environment variable is
not required for this layout.

Add deploy/apache.conf inside the existing HTTPS virtual host. It maps
/ihc/personnel.cgi to the CGI file outside DocumentRoot and restricts
public access under /ihc/. The example assumes /home/website/html is the
document root. Review it alongside existing aliases and access rules.

Run the institute's Apache configuration test, then its approved reload
command. Command names differ by distribution and service setup; use
the commands already used to administer that server. Configure the
existing HTTP virtual host to redirect to HTTPS.

Step 9: Perform acceptance checks

Complete section 13 before considering the feature live.

Step 10: Install cron

Use crontab -e under the SAME OS identity that executes the CGI. Add this
single line, preserving unrelated entries:

  */15 * * * * /home/website/ihc-venv/bin/python /home/website/html/ihc/src/build_health_centre.py --config /etc/ihc/config.json >> /home/website/ihc-private/build.log 2>&1

Check crontab -l for duplicate or retired scheduler entries. Observe an
actual scheduled run at the next quarter-hour. Confirm both the log and
the generated page timestamps advance.

The command needs no activated venv, shell working directory or exported
Google credential variable. Do not add --cached to the cron command.

======================================================================
9. GOOGLE SHEET FORMAT AND EDITING RULES
======================================================================

Info tab:

The current layout uses these headers on the first row:

  IHC Personnel | UserID | Category | System | Qualification

The parser resolves the named columns. UserID is optional for parsing,
but should be populated if it is to appear in the staff table. Category,
System, Qualification and IHC Personnel headers are required in this
layout. Use Category Doctor for personnel who belong in the doctor
schedule. The update form also includes non-doctor personnel.

The legacy first-three-column layout is also supported:

  Medical Officer | System | Qualification

Names must be unique. Use the same exact name in profiles, dated schedule
JSON and Duty-List. Contact columns and unrelated helper columns are
discarded from normalized output. UserIDs appear in the staff form,
not the public schedule. The form is viewable without login, so do not
treat identifiers shown there as secrets.

Monthly tabs:

Use names such as Sep-2026 and Oct-2026. Row 3 must begin with:

  Date | Day | Schedule

Subsequent rows contain ISO dates, matching weekday abbreviations and
JSON mapping exact doctor names to lists of shifts. Example only:

  2026-09-08 | Tue | {"Dr. Example": ["0900-1300", "1700-1900"]}

Use actual names from Info; do not copy the example name into live data.
Weekday abbreviations are Mon, Tue, Wed, Thu, Fri, Sat and Sun.
An empty JSON object {} means the date is published with no scheduled
doctors. A missing date means its roster is not published. The system
does not fill missing dates by copying the standard weekly rotation.

Times support minutes. 2400 is a valid end-of-day value. An overnight
shift must be split between its two actual dates, for example 2200-2400
on the first date and 0000-0600 on the next date. End must follow start.
Dates and weekday values must match the containing month tab.

Duty-List tab:

The standard rotation is displayed separately from the dated schedule.
Its headers include Medical Officer, Day, Schedule Begin and Schedule
End. An optional Schedule column supports an Ad hoc label when both
time fields are blank. This tab is optional; if supplied, it must have
valid headers, known doctors and valid rows.

Unknown names, duplicate profiles, malformed JSON, invalid shifts and
date mismatches fail generation. The previous public HTML remains in
place. Because the builder validates the monthly tabs it reads, an error
in another recognized month can also prevent publication.

Publish dates ahead of time, including both months when the displayed
seven-day window crosses a month boundary. The first table starts with
today in IST and shows the next six dates. Each day's generation advances
the window, excluding past dates. Sunday follows actual data. The separate
standard rotation retains its Monday-Sunday order.

Renaming a person requires care: status records are keyed by name and
date. Changing a Sheet name does not rename existing database/history
records automatically. Plan name changes with the maintainer.

======================================================================
10. STAFF ACCOUNTS AND DAILY USE
======================================================================

Create or reset an account as the database-owning runtime identity:

  cd /home/website/html/ihc/src
  /home/website/ihc-venv/bin/python -m personnel.users staff01 --config /etc/ihc/config.json

Replace staff01 with the intended username. The command privately asks
for the password twice. Username rules: 1-64 letters, digits, dots,
underscores or hyphens. Password length: 12-256 characters.

Disable an account:

  /home/website/ihc-venv/bin/python -m personnel.users staff01 --config /etc/ihc/config.json --disable

Resetting a password also re-enables that account. Accounts use random
salts and PBKDF2-HMAC-SHA256 hashes with 600,000 iterations. Passwords
are not stored as plaintext. There is no password-recovery email flow.

The form's login field is labelled UserID, but authentication uses the
separately created local staff username. A UserID listed next to a Sheet
person is display data; it does not automatically authorize that person.
Administrators can choose matching identifiers when appropriate.

Every enabled staff account can update any listed personnel. There is
no per-person permission restriction or separate role hierarchy in this
version. Issue accounts only to staff authorized for that responsibility.

Daily workflow:

  1. Open the configured HTTPS /ihc/personnel.cgi page.
  2. Confirm the displayed date is today in IST.
  3. Tick the checkbox for each person who is In; leave it unticked for Out.
  4. Enter the assigned UserID and password below the table.
  5. Press Update once and read the response.
  6. Open/reload /ihc/ to confirm publication.

Checked means In. Unchecked means Out. Saved In values start checked;
saved Out values and personnel without a saved status start unchecked.
Saving updates EVERY listed person, including Out for unchecked boxes.
An all-unchecked submission is valid and saves everyone as Out. Unchecking
someone who was previously In saves Out. Consequently, an old open form
can overwrite another operator's more recent changes to those rows.
Reload before editing and coordinate simultaneous updates. There is no
stale-version conflict warning; the last committed submission wins for
each submitted person/date. Audit history records committed changes.

Viewing an unchecked default does not write a status record. Until the
first valid save for a person/date, the public page still says Not updated.
On a new date, checkboxes start unchecked; yesterday's In is not carried
forward. The form has no manual reset-to-unconfirmed operation.

Wrong credentials save no status changes. A form from yesterday is
rejected; reload it. No login session or cookie persists between saves.

The limiter allows at most five authentication attempts per remote
address and thirty total in five minutes. Successful submissions count
toward these limits. Staff sharing an address share its limit. Wait five
minutes after a throttle response. Behind a proxy, verify which address
Apache supplies as REMOTE_ADDR; the application does not infer it from
forwarded headers.

If the response says status was saved but publication failed, the data
is already in SQLite. Tell the administrator to restore publication and
reload the public page after the next successful build.

======================================================================
11. REFRESH, CACHING AND DATE BEHAVIOR
======================================================================

Normal builds make at most one Google-read attempt per quarter-hour
interval: minutes 00-14, 15-29, 30-44 and 45-59. Repeated successful
manual builds in the same interval reuse the cache. A failed attempt
also prevents another normal read in that interval.

For immediate template/status publication without Google access:

  /home/website/ihc-venv/bin/python /home/website/html/ihc/src/build_health_centre.py --config /etc/ihc/config.json --cached

Cached mode requires an existing usable roster cache for the configured
workbook. It cannot pick up new Sheet edits. A generated page displays a
delay notice when its roster-read timestamp is over thirty minutes old.

The notice is calculated at generation time. An untouched old HTML file
does not change its own notice, clock or date as time passes. Readers
must look at the displayed timestamps. Reloading an old file cannot make
it fresh if the server has not successfully generated a newer file.

At midnight IST, the next successful generation uses the new date and
only that date's status. Until generation occurs, the old public file
still honestly shows its old date. Cron's actual start time and builder
duration determine when the new dated page becomes available.

An OS lock serializes builds. HTML is fully rendered before publication,
written to a unique temporary file in the destination directory, flushed
and atomically replaced. A failed read/render/publication leaves the
previous public HTML intact. A terminated process releases the OS lock;
the existence of build.lock alone does not mean a process is stuck.

======================================================================
12. LOGS, BACKUPS AND RECOVERY
======================================================================

Cron log:

  /home/website/ihc-private/build.log

CGI errors:

  The existing HTTPS virtual host's configured Apache ErrorLog.
  Ask the administrator for the actual path; it varies by installation.

The builder reports generic exception classes and exits nonzero on
failure. Inspect the relevant configuration, permissions, Sheet and
dependencies to diagnose the cause. Do not enable logging of passwords,
raw POST bodies, key contents or complete private Google responses.

deploy/logrotate.conf is an optional weekly rotation example retaining
eight rotated logs. The administrator must review ownership and fit it
into the server's logrotate policy. Keep existing Apache log rotation.
No application alerting/email notification service is included; assign
someone to check freshness and failures or integrate institute monitoring.

Online database backup, from the source directory as runtime identity:

  /home/website/ihc-venv/bin/python -m personnel.users --config /etc/ihc/config.json --backup /home/website/ihc-private/status-backup-2026-09-08.sqlite

Choose a NEW dated filename each time. The parent directory must exist
and be writable. Existing backup files are deliberately not overwritten.
The destination must be private and separate from the active database.
The command uses SQLite's online backup API and applies mode 0600.

Backups include accounts/password hashes, status and history. Protect
them accordingly. Keep dated copies off-server according to institute
policy, together with the matching source version and private config.
Maintain a secure credential recovery process separately. A backup only
on the same server is not protection against loss of that server.

Restore procedure:

  1. Temporarily disable this CGI route and pause only this cron job.
  2. Confirm no scheduler write/build process remains active.
  3. Preserve the current database and relevant SQLite sidecar files
     before an administrator performs replacement/recovery.
  4. Restore the selected backup as the configured attendance.sqlite.
  5. Restore correct ownership and private access permissions.
  6. Run a cached build if a valid roster cache exists, otherwise a
     normal build with working Google access.
  7. Verify representative accounts, status dates and public output.
  8. Re-enable CGI and cron and observe a scheduled run.

Test restoration in a separate private test location before relying on
the backup process. Do not copy an actively written database blindly or
delete the last good HTML as a troubleshooting step.

======================================================================
13. TARGET-SERVER ACCEPTANCE CHECKLIST
======================================================================

Record who performed these checks and when. Local test success alone
does not complete this checklist. Use a staging installation or agreed
personnel values for tests that alter status. Avoid inventing live data.

  [ ] Delivered source version recorded; package matches that version.
  [ ] Private key/config/database absent from the general handover ZIP.
  [ ] Python version, SQLite and dependency imports verified.
  [ ] All 36 Python tests pass on the target interpreter, including the
      temporary loopback HTTP checks (dev.py must be present).
  [ ] Runtime account identified; CGI and cron use that same identity.
  [ ] File/directory permissions and parent-directory rights reviewed.
  [ ] Real HTTPS origin configured; HTTP redirects to HTTPS.
  [ ] Service account has reader access; first real build succeeds.
  [ ] Public page shows the intended workbook, date, week and personnel.
  [ ] /ihc/ loads as complete HTML with browser JavaScript disabled.
  [ ] /ihc/personnel.cgi executes and returns an HTML form, not source.
  [ ] /ihc/src/settings.py is denied to HTTP clients.
  [ ] /ihc/src/liveihc-template.html is denied to HTTP clients.
  [ ] Old/private paths and directory browsing are not exposed.
  [ ] Each authorized staff account created and credentials transferred.
  [ ] Valid update succeeds; public reload shows the intended value.
  [ ] Invalid password changes no personnel status.
  [ ] Disabled account cannot submit an update.
  [ ] Unticking a previously In person saves Out; all-unchecked save works.
  [ ] Staff understand whole-table overwrite and shared-address limits.
  [ ] Date rollover/stale-form rejection verified in controlled testing.
  [ ] Month-boundary and missing-roster behavior reviewed.
  [ ] Only one current scheduler cron entry exists.
  [ ] Actual quarter-hour cron run advances log and page timestamps.
  [ ] CGI errors and cron errors can be found by the responsible person.
  [ ] Backup created; controlled restore verified; off-server copy arranged.
  [ ] Recovery steps and operational ownership accepted.

The repository's handover notes report earlier browser checks at six
widths from 320 to 1440 pixels. Those visual checks were not rerun during
the 8 September status review. Check the delivered public page and form
in the institute's intended desktop/mobile browsers before acceptance.

Acceptance performed by: ____________________________________________
Date/time: _________________________________________________________
Source version: ____________________________________________________
Outstanding items and responsible person: ___________________________
____________________________________________________________________

======================================================================
14. TROUBLESHOOTING
======================================================================

Problem: CGI returns 503 / origin configuration message.
Check config.json exists, is readable, is valid JSON and has the actual
HTTPS origin. Verify runtime imports and the private cache. Consult the
Apache error log. Production does not enable dev.py's HTTP exception.

Problem: CGI returns 403 on submission.
Open the form through the configured HTTPS hostname. Check aliases,
ports, redirects and the configured origin. The request Origin must
match exactly. Inspect Apache access rules if GET is also forbidden.

Problem: CGI source downloads or displays as text.
Do not proceed with handoff acceptance. Correct ScriptAlias, CGI module
configuration and wrapper placement. Then verify source-denial rules.

Problem: CGI reports an internal server error before showing the form.
Check Apache ErrorLog, CGI execute permission, LF line endings, shebang,
venv path, source import path, traversal permissions and applicable
SELinux/AppArmor policy.

Problem: Incorrect username/password.
Use an account created with personnel.users. A Sheet UserID alone does
not create an account. Have the account administrator reset it if needed.

Problem: Too many attempts / HTTP 429.
Wait five minutes. Successful submissions also count. Consider whether
several staff share a network address or proxy. Avoid repeated retries.

Problem: All checkboxes are unticked.
This means everyone is Out in the form. Pressing Update with valid
credentials saves Out for everyone listed; no box needs to be checked.

Problem: Date changed / HTTP 409.
Reload the form and review today's values before submitting again.

Problem: Google build fails.
Check workbook sharing, service-account key path, Sheets API enablement,
network access and actual Sheet format. The normal retry is in the next
quarter-hour interval. Correct invalid rows rather than removing the
last good public file. Use --cached for publication during an outage
when an existing valid cache is available.

Problem: Sheet edit not immediately visible.
Normal builds share a quarter-hour cache. Wait for the next scheduled
read, inspect the roster-read timestamp, then reload the browser.
--cached deliberately cannot fetch the edit.

Problem: Status saved but public regeneration failed.
The database save already committed. Check destination-directory write
permission, disk space, template syntax and private state access, then
run --cached or wait for the next successful normal build.

Problem: Manual build works but cron fails.
Check cron identity, absolute paths, config/credential permissions and
build.log. Do not rely on the administrator's interactive environment.

Problem: Cron works but staff updates fail to publish.
Verify CGI and cron really use the same OS identity and that CGI can
write the database/private directory AND replace the public HTML.

Problem: All personnel show Not updated after the date changes.
This is expected until today's statuses are submitted. Yesterday's
values do not establish today's presence.

Problem: Another operator's status reverted after a save.
An older form saves the whole table, including unchecked Out values.
Reload before editing and coordinate updates. Use private audit history
for investigation; no audit-history browser interface is included.

======================================================================
15. OPTIONAL LOCAL PREVIEW -- WINDOWS
======================================================================

These instructions assume a current handover src/ directory that also
contains dev.py. Run commands from that src/ directory. When working
inside the full repository, use doctor_scheduler/ as that directory.

Create a local environment and install dependencies:

  python -m venv .venv
  .venv/Scripts/python.exe -m pip install -r requirements.txt

Set a credential path in PowerShell and generate a real local roster:

  $env:GOOGLE_APPLICATION_CREDENTIALS = 'C:\private\ihc-google-service-account.json'
  .venv/Scripts/python.exe build_health_centre.py

Without an explicit config, output is public/index.html and private
state is storage/ beside the source. An existing IHC_CONFIG environment
variable overrides those defaults; check it before using this workflow.

Run the interactive loopback-only preview:

  .venv/Scripts/python.exe dev.py

Open http://127.0.0.1:8082/ihc/personnel.cgi. The terminal prints username
tester and a freshly generated password. The public preview is
http://127.0.0.1:8082/ihc/. Keep the terminal running; Ctrl+C stops it.
Use dev.py --port 8083 if the default port is occupied.

This runner uses separate storage/browser-preview/ data. Its status
edits persist there across restarts; the tester password resets each
restart. To refresh its roster, rerun the normal builder and restart the
preview. Do not run the preview or use its test account as the production
service; the dev.py source may be retained for the loopback tests.
Restart the preview after changing Python source. A second launch on the
same port is rejected before it can reset the active tester password.
Use the password from the latest successful start. Both /ihc and /ihc/
reach the public schedule; the former redirects to the latter.

For a static-only preview:

  .venv/Scripts/python.exe -m http.server 8081 --bind 127.0.0.1 --directory public

Open http://127.0.0.1:8081/. This static server cannot execute CGI or save
form submissions. A supplied review/index.html may also be opened for
visual inspection; its form link requires an actual CGI installation.

Run the offline suite locally:

  .venv/Scripts/python.exe -m unittest discover -s tests -p 'test_*.py' -v

======================================================================
16. FINAL SENDER CHECK BEFORE TRANSFER
======================================================================

  [ ] Resolve/review the scheduler changes and record a source version.
  [ ] Build a fresh package; do not send the previously stale ZIP.
  [ ] Include this README.txt and all required source/deployment files.
  [ ] If documenting a local interactive demo, include current dev.py.
  [ ] Compare packaged source bytes with the approved working source.
  [ ] Extract the package separately and run its Python tests.
  [ ] Confirm CGI wrapper retains Unix line endings.
  [ ] Label review HTML clearly as a dated non-production snapshot.
  [ ] Exclude private keys, databases, caches, logs and demo credentials.
  [ ] Transfer Google credentials separately to the named administrator.
  [ ] Give the recipient the server acceptance checklist and ownership
      details, including every item still awaiting institute action.

The recipient should retain this file with the delivered source version
and record any deployment-specific path or configuration changes.
