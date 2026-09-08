# Doctor scheduler handover

Only `doctor_scheduler/` changed. Sensor/dashboard/Raspberry Pi files are untouched.
The old local work is preserved at commit `90d4d76`, branch
`simplify-doctor-scheduler`. The implementation changes are left for review.

## Result

```text
Google Sheets -- 15-minute cron --> Python + Jinja template --> index.html --> Apache
                                         ^
Staff form -- credentialed POST --> Python CGI --> SQLite
                                         |
                              regenerate from cached roster
```

One generated public file, no public JavaScript, no JSON polling, no app server.
Status updates use the same generator without reading Sheets. SQLite preserves
date, status, actor, timestamp, and history. Passwords are salted hashes; no default
accounts or login sessions. Sunday and missing dates follow the actual data.

## Files

- Added: `build_health_centre.py`, `liveihc-template.html`, `settings.py`,
  `personnel/{store.py,handler.py,users.py,form.html,__init__.py}`, `deploy/`,
  `.gitattributes`, this handover and `tests/browser-static-check.js`.
- Modified: `sheets_client.py`, `roster.py`, `requirements.txt`, `.gitignore`,
  `README.md`, and the three Python test files.
- Retired: `server.py`, `admin/`, the former browser build under `src/`, duplicate
  `styles.css`/`index.html`, and polling/session browser tests. They remain in Git.
- Generated: `public/index.html`, private cache/state under ignored `storage/`,
  and optional screenshots under ignored `.cache/`. Original `new_design/` is kept.

## Exact commands

From the repository root on this Windows machine, using the existing venv/key:

```powershell
doctor_scheduler/.venv/Scripts/python.exe doctor_scheduler/build_health_centre.py
doctor_scheduler/.venv/Scripts/python.exe -m http.server 8081 --bind 127.0.0.1 --directory doctor_scheduler/public
```

Static preview: http://127.0.0.1:8081/.
For interactive local form testing, run:

```powershell
doctor_scheduler/.venv/Scripts/python.exe doctor_scheduler/dev.py
```

Open http://127.0.0.1:8082/ihc/personnel.cgi and use `tester` with the generated
password printed in the terminal. This local-only runner uses separate preview
storage and is not part of the institute deployment.
Add `--cached` to the builder for offline/template/status regeneration.

Exact institute manual generation command for the proposed layout:

```sh
/home/website/ihc-venv/bin/python /home/website/html/ihc/src/build_health_centre.py --config /etc/ihc/config.json
```

Exact crontab entry, installed under the SAME OS identity that executes the CGI:

```cron
*/15 * * * * /home/website/ihc-venv/bin/python /home/website/html/ihc/src/build_health_centre.py --config /etc/ihc/config.json >> /home/website/ihc-private/build.log 2>&1
```

Create/reset each staff account from `/home/website/html/ihc/src`; password is
prompted privately:

```sh
/home/website/ihc-venv/bin/python -m personnel.users staff01 --config /etc/ihc/config.json
```

Staff open `/ihc/personnel.cgi`: the four-column table matches
`new_design/references/form_ref.xlsx`, including doctors and paramedics. Status
now uses checkboxes: checked means In, unchecked means Out. Saved In values are
checked; personnel without a saved value start unchecked. Enter UserID/password
underneath and press Update to save every listed person's status. Unchecking a
previously In person saves Out. Invalid credentials leave all data unchanged.
Reload before editing to avoid overwriting another operator's newer values. Successful saves regenerate
the public file immediately; existing public tabs need a reload. If regeneration
fails, the save persists and the response says publication is pending.

## Apache and server actions

The professor's screenshot confirms `/home/website/html/ihc/` and `src/`.
Python CGI is the user's provisional choice; module availability is unverified.
`deploy/apache.conf` contains the exact proposed configuration for the existing
HTTPS virtual host. It requires CGI/CGID, alias, authorization and headers modules,
serves the static index, denies source access, and maps `/ihc/personnel.cgi` to
the executable `/home/website/ihc-cgi/personnel.cgi` outside DocumentRoot.

The institute must provision Python 3.10+ at the documented venv path, configure
the real HTTPS origin in `/etc/ihc/config.json`, install the private Google key,
assign CGI/cron ownership and directory permissions, create K staff accounts,
validate/reload Apache, and install cron. Private data is at
`/home/website/ihc-private`; sources and credentials must not be writable by CGI.
No institute deployment or Apache runtime verification was performed here.

## What to give the professor

Hand over `storage/professor-handover.zip`: its `src/` contains the canonical
template, builder, supporting modules, requirements, README and tests; `deploy/`
contains the reviewed installation examples. `review/index.html` is a real local
Sheets-generated snapshot for review, using existing local personnel. Regenerate
on the institute server with its own database before going live. The archive
contains no service-account key, private database/cache, passwords, or venv.

Transfer the Google credential file separately through the institute's secure
process. The README covers installation, editable/generated files, logs, outages,
account disable/reset, online SQLite backup and restore.

## Verification

- 36 Python tests: parsing, profiles, IST/2400/month boundaries, missing dates,
  CGI form/protocol, valid/invalid credentials, hashing, malformed requests,
  throttling, concurrent SQLite writes, backup, escaping and atomic publication.
- Loopback HTTP tests cover public/form navigation, checkbox saves across reloads,
  and prevention of duplicate listeners. Include dev.py and tests/test_dev.py
  in the source/test package; dev.py is not the production web service.
- Live Google Sheets read produced eight doctor profiles and 15 form rows
  (eight doctors and seven paramedics).
- Chrome: six widths (320 to 1440), no page scripts, no horizontal overflow;
  desktop/mobile screenshots inspected.
- Scoped JavaScript lint and Git whitespace checks pass.

Run the offline suite from the repository root:

```powershell
doctor_scheduler/.venv/Scripts/python.exe -m unittest discover -s doctor_scheduler/tests -p 'test_*.py' -v
```
