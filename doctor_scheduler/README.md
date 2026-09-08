# IHC doctor schedule and status

This directory is independent of the sensor dashboard and Raspberry Pi services.
It needs Python 3.10+ with SQLite support, the two packages in requirements.txt,
cron, and Apache. There is no continuously running scheduler application server.

## How it works

```text
Google Sheets -- once per 15 minutes --> build_health_centre.py
                                             |
private roster cache + SQLite status + liveihc-template.html
                                             |
                                      Jinja renders HTML
                                             |
                                   atomic replace of index.html
                                             |
                                      Apache --> browser

Staff --> CGI form (username + password + doctor statuses in one POST)
          --> verify password hash --> SQLite update + audit record
          --> same generator, cached roster only --> index.html
```

The browser receives complete HTML, with inline CSS and no JavaScript or JSON
polling. Reload the public page to see updates. Every page states the status
date, roster-read time, and generation time in India Standard Time (UTC+05:30).
An already open page stays a dated snapshot until reloaded. Scheduled duty does
not imply confirmed presence. Status never carries into the next date.

## Source data and the template

The configured workbook is the existing shared IHC Google Sheet. Share it with
the service account as a reader and enable the Google Sheets API in its project.
The service-account JSON stays on the server, outside every Apache document root.

- `Info`: doctor profiles. The existing normalizer supports both the legacy
  `Medical Officer / System / Qualification` layout and the newer `IHC Personnel /
Category / System / Qualification` layout. The schedule uses Category Doctor. The update form includes all personnel,
  including paramedics, with UserID and Category from this tab. UserIDs appear
  only in the form; contact details and unrelated helper columns are discarded.
- Monthly tabs such as `Sep-2026`: row 3 is `Date / Day / Schedule`; subsequent
  rows contain ISO dates, weekday abbreviations, and JSON mapping exact doctor
  names to lists of shift strings. Empty `{}` means no scheduled doctors; an
  omitted date means not published. Dates are never filled from another week.
- `Duty-List`: the standard weekday rotation, with optional Ad hoc entries.
  This is displayed separately from dated changes in the actual schedule.

Shifts use minutes, including `2400` as the end of a day. Overnight shifts must
be split at midnight. Profile names must match exactly; unknown names, duplicate
profiles, invalid dates and invalid shifts fail the build instead of hiding data.
The displayed Monday-Sunday week may span two monthly tabs. Sunday follows the
actual roster. No doctor count limit, invented staff, or fake contact data is used.

`liveihc-template.html` is the editable source template requested by the professor.
It derives its layout/CSS from `new_design/liveihc-template.html`, which is kept as
an unchanged reference. Jinja substitutes escaped roster/status values into
the source. `index.html` is the resulting artifact and is never a source template.
The builder renders entirely before publishing with a unique temporary file in
the destination directory, fsync, then atomic replacement. An OS file lock prevents
overlapping cron/manual/CGI builds. Crashed processes release the lock automatically.

## Files to maintain

| File                                                                      | Purpose / safe edits                                                       |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `liveihc-template.html`                                                   | Public wording, layout, and CSS; preserve Jinja loops and escaping         |
| `personnel/form.html`                                                     | Staff form wording and styling; preserve POST and field names              |
| `build_health_centre.py`                                                  | Canonical rendering/publication; change with tests                         |
| `roster.py`, `sheets_client.py`                                           | Existing parsing and read-only authentication; change with tests           |
| `personnel/store.py`, `handler.py`, `users.py`                            | Database, CGI request handling, account/backup commands                    |
| `settings.py`                                                             | Shared configuration defaults and path checks                              |
| `deploy/`                                                                 | Reviewed deployment examples, including CGI entry script                   |
| `tests/`                                                                  | Offline behavior tests; no credentials needed                              |
| `new_design/`                                                             | Original design/professor references; not deployed                         |
| `public/index.html`                                                       | GENERATED local preview; do not edit                                       |
| `storage/roster.json`, `storage/sheets-attempt.txt`, `storage/build.lock` | GENERATED private state; do not edit in normal operation                   |
| `storage/attendance.sqlite`                                               | PRIVATE accounts, status and audit history; use tools, do not edit by hand |

Use the Sheet for schedule/profile edits and the personnel form for In/Out updates.
The form follows `new_design/references/form_ref.xlsx`: IHC Personnel, UserID,
Category and Status columns, followed by UserID/password fields and one Update
button. The XLSX is a layout reference; current rows come from the Info tab.
There is no public `data.json`, admin JSON override, login page, session service,
or `/api/schedule`. Old implementations are recoverable from Git checkpoint
`90d4d76` on `simplify-doctor-scheduler`; the earlier server is also in `a9f226f`.
The private database retains its legacy filename `storage/attendance.sqlite`
(and table names) to preserve existing records; these names never appear in the
form, public page or URL. Existing records are preserved: the new store uses
compatible personnel/history columns. Existing accounts were only in server
memory, so create each staff account again. Historical notes/revisions remain
private for compatibility; the simpler form does not collect notes.

## Local setup and real generation (Windows)

Run these commands from the repository root:

```powershell
python -m venv doctor_scheduler/.venv
doctor_scheduler/.venv/Scripts/python.exe -m pip install -r doctor_scheduler/requirements.txt
$env:GOOGLE_APPLICATION_CREDENTIALS = 'C:\private\ihc-google-service-account.json'
doctor_scheduler/.venv/Scripts/python.exe doctor_scheduler/build_health_centre.py
```

An existing single ignored JSON key under `doctor_scheduler/keys/` also works for
local development. Never copy that folder to Apache. With no `--config`, generated
HTML goes to `doctor_scheduler/public/index.html` and private data to
`doctor_scheduler/storage/`. The legacy root `index.html` has been retired.

### Run locally and use the form

From the repository root:

```powershell
doctor_scheduler/.venv/Scripts/python.exe doctor_scheduler/dev.py
```

Open http://127.0.0.1:8082/ihc/personnel.cgi. The terminal prints UserID `tester`
and a newly generated password. Select In/Out, enter those credentials, and press
Update. Open http://127.0.0.1:8082/ihc/ and reload to see the result. A wrong password
returns an error and saves nothing. Keep the terminal open; Ctrl+C stops it.
Use `--port 8083` if needed. Restarting prints a new password.

This development runner uses the actual form handler, password checks, SQLite,
and generator. It starts from the last generated roster cache and writes only to
`storage/browser-preview/`, leaving the main database/page unchanged. Status edits
persist in that preview directory across restarts. To refresh the roster, run the
normal builder and restart the preview. No test suite or npm command is required.

`dev.py` binds only to 127.0.0.1. Its explicit local HTTP allowance is not enabled
by the production CGI. Deploy the Apache CGI files described below; do not deploy
or run `dev.py` on the institute server. There are no new dependencies.

To view only the static public artifact instead:

```powershell
doctor_scheduler/.venv/Scripts/python.exe -m http.server 8081 --bind 127.0.0.1 --directory doctor_scheduler/public
```

That static-only server cannot save form submissions.

For template-only edits, or an immediate status refresh without Sheets:

```powershell
doctor_scheduler/.venv/Scripts/python.exe doctor_scheduler/build_health_centre.py --cached
```

Regular manual builds reuse a successful cache from the current quarter-hour
interval; a private attempt marker also prevents repeated failed Google reads
within that interval (minutes 0-14, 15-29, 30-44, 45-59).
Cached generation never calls Sheets and refuses to run without a usable cache.
Use `--config C:/absolute/path/config.json` or `IHC_CONFIG` to select a different
configuration. Production uses the explicit config file and no interactive shell
environment. Do not add credentials or a real config to Git.

## Institute deployment

The provided `new_design/references/dir_ref.jpg` confirms the directory
`/home/website/html/ihc/`, containing `index.html` and a `src/` directory. The
Downloads builder matches the historical hardcoded prototype. No Apache module
list, cron file, or confirmed Python interpreter path was provided. Python CGI
is the user's provisional choice, and must be enabled by the institute admin.
The following is the precise proposed layout, not a claim that it is installed:

```text
/home/website/html/ihc/index.html          generated public page
/home/website/html/ihc/src/                private-to-HTTP source files below
    build_health_centre.py
    liveihc-template.html
    roster.py
    sheets_client.py
    settings.py
    requirements.txt
    README.md
    personnel/{__init__.py,store.py,handler.py,users.py,form.html}
/home/website/ihc-venv/                    Python virtual environment
/home/website/ihc-cgi/personnel.cgi       executable CGI entry script
/home/website/ihc-private/                 SQLite, roster cache, lock and build.log
/etc/ihc/config.json                      private configuration
/etc/ihc/google-service-account.json       private Google key
```

1. Choose the OS account that Apache uses to execute this CGI. Install cron in
   that SAME account's crontab: atomic private files use mode 0600, so merely
   sharing a group between two accounts is insufficient. Ordinary mod_cgi uses
   Apache's worker account; an institute-approved suexec setup may use another.
   Do not assume the screenshot's `bss` shell user is also the CGI identity.
2. Back up existing public HTML, source, and status SQLite before replacing
   any server files. Stop the old scheduler service and remove its old cron entry
   for this feature only. Preserve existing status database/history. Do not
   copy ignored local demo status or local keys to production by accident.
3. Copy only the source files listed above into `src/`, not the entire repository.
   Keep sources, wrapper, configuration and virtual environment administrator-owned
   and non-writable by the CGI account. Grant that account read access and directory
   traversal. Give it write access to `/home/website/ihc-private` (mode 0700) and to
   the public `/home/website/html/ihc` directory for atomic replacement. Generated
   public HTML uses 0644. Use least-privilege ACLs for other necessary traversal.
4. Create `/home/website/ihc-venv` with the institute's installed Python 3.10+:

   ```sh
   /usr/bin/python3 -m venv /home/website/ihc-venv
   /home/website/ihc-venv/bin/python -m pip install -r /home/website/html/ihc/src/requirements.txt
   ```

   Verify `/usr/bin/python3` exists and its version first; the venv path above is
   the deliberately fixed path used by all runtime commands.

5. Copy `deploy/config.example.json` to `/etc/ihc/config.json`. Replace `origin`
   with the real HTTPS origin, e.g. `https://institute.example`, without a trailing
   slash or path. Verify the workbook ID. Install the Google key at the specified
   path and give only the CGI/cron identity and administrators read access. The
   source configuration contains paths, never embedded passwords/key contents.
6. Install `deploy/personnel.cgi` as `/home/website/ihc-cgi/personnel.cgi`, with
   Unix LF newlines and mode 0755. Its shebang points at the fixed venv interpreter.
   Its default config path is `/etc/ihc/config.json`; no Apache environment variable
   is required. The CGI is outside DocumentRoot and imports the protected sources.
7. Add `deploy/apache.conf` inside the existing HTTPS virtual host. It assumes
   `/home/website/html` is the document root and requires mod_cgi or mod_cgid,
   mod_alias, mod_authz_core and mod_headers. Sources, old assets and dotfiles under
   `/ihc/` are denied; only the public index and explicit CGI URL are allowed.
   Run the institute's Apache config test and reload command. Redirect HTTP to HTTPS
   in the existing vhost. Origin checking uses the configured hostname, not Host or
   forwarded headers; the limiter uses Apache's REMOTE_ADDR.
8. Generate the page, create staff accounts, and then install cron below. Test a
   valid save, invalid password, and midnight/date handling on the actual server.
   Check `/ihc/src/liveihc-template.html` and `/ihc/src/settings.py` are denied,
   `/ihc/` loads with JavaScript disabled, and `/ihc/personnel.cgi` returns HTML
   rather than Python source. Check filesystem permissions and SELinux/AppArmor
   policy if present. These server checks cannot be confirmed from the screenshot.

## Staff accounts and updates

Run account commands from `/home/website/html/ihc/src` as the database-owning
identity. Create/reset each of the K users (password is prompted, never a command
argument):

```sh
/home/website/ihc-venv/bin/python -m personnel.users staff01 --config /etc/ihc/config.json
/home/website/ihc-venv/bin/python -m personnel.users staff01 --config /etc/ihc/config.json --disable
```

On Windows, `cd doctor_scheduler` and use `.venv/Scripts/python.exe -m
personnel.users staff01`. Passwords must have 12-256 characters. Each gets a
random salt and PBKDF2-HMAC-SHA256 hash with 600,000 iterations. There are no default
accounts or plaintext passwords. Resetting a password re-enables the account.

Staff open `/ihc/personnel.cgi`, choose In or Out for personnel, enter their
UserID/password below the table, and press Update. The form starts with saved
values; rows still showing In/Out are left unchanged. Submitted In/Out values
are saved together only when the credentials are valid. Valid updates are committed together with server-derived actor/time
and audit history, then the public page is regenerated using the cached roster.
Invalid credentials change no personnel status records and do not regenerate the public page. The limiter permits at most
5 attempts per remote address and 30 total per five minutes (including successful
submissions), persisting across CGI processes. Shared-network staff share that
limit; wait five minutes when throttled. No cookies or sessions are used.

Requests must be form-encoded POSTs from the configured HTTPS origin. Credentials
in URLs are rejected. Duplicate/unknown fields, invalid statuses, stale dates,
oversized forms and unknown personnel are rejected before status writes. SQLite
transactions serialize updates. For two valid changes to the same doctor/date,
the last committed submission wins; both remain in private audit history.

## Manual generation, cron and logs

Exact production manual command, independent of current working directory:

```sh
/home/website/ihc-venv/bin/python /home/website/html/ihc/src/build_health_centre.py --config /etc/ihc/config.json
```

After the first successful build, open `crontab -e` as the CGI/database account.
Add or replace ONLY the scheduler entry; keep unrelated jobs. Exact entry:

```cron
*/15 * * * * /home/website/ihc-venv/bin/python /home/website/html/ihc/src/build_health_centre.py --config /etc/ihc/config.json >> /home/website/ihc-private/build.log 2>&1
```

`deploy/cron.txt` contains the same line. Check `crontab -l` for duplicate old jobs.
Cron runs at minutes 0, 15, 30 and 45; this frequency does not depend on cron's
local timezone. Python computes the page's dates in IST. The first manual build
shares the current quarter-hour cache; the next quarter-hour cron run reads again.
Interval boundaries tolerate small differences in cron start times. Cron does not need PATH, activated venv, working directory, or exported
Google variables. Cached mode is deliberately NOT used for cron.

Cron stdout/stderr goes to `/home/website/ihc-private/build.log`. CGI errors go to
the existing virtual host's Apache ErrorLog; inspect its actual configured path.
Raw POST bodies/passwords must not be enabled in request logging. The existing
Apache access log records request status. `deploy/logrotate.conf` is an optional
weekly rotation example for the build log; keep Apache's existing log rotation.

## Failure recovery and backups

A failed Sheets read, invalid roster, render error or failed atomic replacement
leaves the previous public index intact and produces a nonzero exit with a generic
error class in the build log. Check API availability, sharing, credential path,
file permissions, template syntax and disk space, then run the manual command or
wait for cron. Never delete the last good HTML to troubleshoot. After a failed
read, wait for the next quarter-hour interval before requesting Sheets again.

During an outage, a successful status POST still regenerates from the cached
roster. To roll the dated page forward or apply template edits manually offline:

```sh
/home/website/ihc-venv/bin/python /home/website/html/ihc/src/build_health_centre.py --config /etc/ihc/config.json --cached
```

This shows the last roster-read timestamp and a delay notice after 30 minutes.
An untouched last-good page continues to show its original date; it never relabels
old status as today's. On the very first deployment there is no fallback until
one Sheets generation succeeds. If a POST commits but rendering fails, its response
explicitly says status was saved and publication is pending. The next successful
build reads the saved SQLite state. No queue or separate rendering path is needed.

Back up accounts, status and history with SQLite's online backup API, never
copy an open database blindly. From the source directory, to an existing private
backup directory and a new filename:

```sh
/home/website/ihc-venv/bin/python -m personnel.users --config /etc/ihc/config.json --backup /home/website/ihc-private/status-backup.sqlite
```

Keep dated copies off-server under institute backup policy, including configuration
and the source version. Protect backups like password hashes. To restore, disable
this CGI route and pause only this cron job, preserve the damaged/current database,
replace it with the backup, restore ownership/0600 permissions, run `--cached`, and
re-enable the route/job. The private roster cache may be backed up too, or rebuilt
from Sheets. Do not remove any legacy `storage` data until its migration is checked.

## Tests and handover

From the repository root:

```powershell
doctor_scheduler/.venv/Scripts/python.exe -m unittest discover -s doctor_scheduler/tests -p 'test_*.py' -v
```

Tests exercise real SQLite transactions, CGI subprocess output, password validation,
malformed requests, escaping, IST dates, midnight/2400, month boundaries, published
versus missing dates, profile matching, simultaneous writes, last-good preservation,
and atomic replacement. They use temporary storage and fake Sheets reads only.

Hand the professor the source files listed in the deployment tree, `deploy/`, this
README, and the generated `public/index.html` as a review artifact. Specifically
include the root `liveihc-template.html` and `build_health_centre.py`. Transfer the
Google key separately through the institute's secure process. Do not hand over
`.venv`, keys in a public archive, local personnel/demo records, browser profiles,
logs, `new_design/index.html`, or the retired JSON/browser-server implementation.
The institute still needs to approve CGI, provision permissions/paths, set its real
HTTPS origin, install dependencies, create K accounts, enable the Apache config,
and install/test cron. Nothing has been deployed to that server by this change.

Reference: [Apache CGI documentation](https://httpd.apache.org/docs/2.4/howto/cgi.html)
and [OWASP password storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
