# Agent Handoff: IHC Automation

Last updated: 17 August 2026

## Read This First

This repository is an IoT environmental-monitoring project for an institute health centre. The
software prototype monitors two medicine refrigerators and four rooms, stores telemetry in
Supabase, displays it on a responsive dashboard, and generates persisted dashboard alerts.

Phases 1 through 5 are complete. The hosted Supabase project has the monitoring schema, seed
devices and rules, alert engine, and public read-only RLS boundary applied and verified. The
dashboard has a public overview and device-specific historical views; notifications remain a later
phase.

Do not reintroduce dashboard login in the prototype. The user explicitly removed that requirement.
The dashboard must be publicly readable without an account, while all browser-side writes remain
blocked.

## Confirmed Scope

- Operational target, not only a classroom demonstration.
- Sensor pilot target: 4 to 6 weeks.
- Two monitored refrigerators.
- Four monitored rooms for temperature, humidity, and fire-related signals.
- Refrigerator operating range: 2.0 to 5.0 degrees Celsius.
- Out-of-range persistence before an alert: 10 minutes.
- Device offline timeout: 5 minutes without a reading.
- Prototype detailed-reading retention: 90 days.
- Primary users: health-centre staff on a PC and professors on phones.
- Alert channels eventually include email, SMS, WhatsApp, and local buzzers.
- Alert acknowledgement is deferred.
- Maintenance is expected to be staff-owned after handover.

## Device Seed Names

Use these exact stable names/slugs unless the user changes them:

| Device slug          | Type                     |
| -------------------- | ------------------------ |
| `fridge_male_ward`   | Refrigerator monitor     |
| `fridge_female_ward` | Refrigerator monitor     |
| `doctors_room`       | Room environment monitor |
| `monitoring_room`    | Room environment monitor |
| `male_ward`          | Room environment monitor |
| `female_ward`        | Room environment monitor |

Human-readable labels can be title-cased from these slugs, but keep the slugs stable for simulator
configuration and API tests.

## Access Model

The prototype dashboard is public and requires no login.

- Anonymous clients may select the approved dashboard data: device identity/status, readings,
  configured ranges, and alert history.
- Anonymous clients must not insert, update, or delete any row.
- The public dashboard must not contain configuration or device-management controls.
- Device ingestion goes through the backend API and uses server-only credentials.
- Database administration and rule changes remain server-side or migration-driven.
- Supabase Row Level Security must be enabled on every exposed table.
- Authentication and staff roles may be added later, but are not part of Phase 2.
- Never store patient, medicine-recipient, clinical, or other personal data in this system.

## Supabase State

A hosted Supabase project has been created. The ignored root `.env` contains the required values.
Never print, commit, move into documentation, or send their values through chat.

Known configured variable names:

```text
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY
SUPABASE_JWKS_URL
SUPABASE_DB_PASSWORD
```

Connection and Phase 2 verification checks completed successfully:

- Project and Auth API are reachable.
- The publishable key is accepted and can anonymously read the approved monitoring tables.
- The hosted project has 6 seeded devices and 2 refrigerator alert rules.
- `devices`, `readings`, `alert_rules`, and `alerts` all have RLS enabled.
- Anonymous `select` returns HTTP 200 on all four exposed tables.
- Anonymous `insert`, `update`, and `delete` are blocked on all four exposed tables.
- The secret key is accepted when called with a server User-Agent.
- A temporary server-side secret-key insert/delete probe succeeded and cleaned itself up.
- The database password is present locally.

Important testing detail: Supabase intentionally returns HTTP 401 when an `sb_secret_...` key is
used with a browser-like User-Agent. Windows PowerShell's `Invoke-WebRequest` triggers that guard.
Use the Node backend, or set a clearly server-side User-Agent when performing a command-line secret
key connectivity test. A 401 from the default PowerShell User-Agent does not by itself mean the
secret is invalid.

The original template used the legacy-looking variable `SUPABASE_SERVICE_ROLE_KEY`. New code should
standardize on `SUPABASE_SECRET_KEY` and use the current `sb_secret_...` value only in the API.

Supabase CLI is installed as a project dev dependency:

```powershell
npx.cmd supabase --version
# 2.114.0
```

Use `npx.cmd`, not `npx`, in this PowerShell installation because script execution policy blocks
the `npx.ps1` shim.

The CLI may need permission to write `C:\Users\user\.supabase` for telemetry/settings. Direct
hosted database commands were run by constructing a Postgres URL in memory from `SUPABASE_URL` and
`SUPABASE_DB_PASSWORD`; do not print that URL because it contains the password.

## Current Architecture

This is an npm workspace with TypeScript services and a plain JavaScript dashboard:

```text
apps/dashboard     Plain HTML/CSS/JS + Chart.js public dashboard, served by Vite
apps/api           Express ingestion and alert-processing API
packages/shared    Shared TypeScript contracts
simulator          Node TypeScript sensor simulator
supabase            Migrations and development seed data
docs                Phase checklists
plans               Project and hardware planning documents (currently uncommitted move)
```

Local services:

| Service          | URL                                      |
| ---------------- | ---------------------------------------- |
| Dashboard        | `http://localhost:5173`                  |
| API health       | `http://localhost:4000/health`           |
| Dashboard API    | `http://localhost:4000/api/v1/dashboard` |
| Simulator health | `http://localhost:4100/health`           |

The simulator posts telemetry after startup when `SIMULATOR_DEVICE_KEY` is configured. Use the
dashboard through `http://localhost:5173` while the local `.env` allows that origin; `localhost`
and `127.0.0.1` are distinct browser origins for CORS.

## Phase 1 Verification

Phase 1 includes:

- npm workspace and shared TypeScript configuration;
- responsive public dashboard foundation without React;
- Express API health endpoint;
- simulator health endpoint;
- ESLint and Prettier;
- unit/integration tests for all packages;
- production builds and environment handling.

The last full verification after Phase 2 passed formatting, lint, type checking, tests, and all
production builds:

```powershell
npm.cmd run check
```

Use `npm.cmd`, not `npm`, in this PowerShell installation because script execution policy blocks
the `npm.ps1` shim.

Start all local services with:

```powershell
npm.cmd run dev
```

No development server was listening on ports 5173, 4000, or 4100 when this handoff was written.

## Repository And Git State

- GitHub remote: `https://github.com/luckyayush777/IHCAutomation.git`
- Branch: `main`, tracking `origin/main`.
- Latest observed commit: `24c6f3b Update project documentation to reflect public read-only access in Phase 2`.
- GitHub CLI is authenticated as `luckyayush777`.
- Portable GitHub CLI location:
  `C:\Users\user\AppData\Local\Programs\GitHubCLI\2.97.0\bin\gh.exe`.
- Stale global Git `http.proxy` and `https.proxy` values were removed. Do not restore the old
  `172.31.2.4:8080` proxy.

The worktree was already dirty before this handoff file was added:

```text
D  .env.example
D  HARDWARE_AND_BUDGET.md
D  PROJECT_PLAN.md
?? plans/
```

The planning documents now exist at `plans/PROJECT_PLAN.md` and
`plans/HARDWARE_AND_BUDGET.md`. Treat this as user work and do not move or revert it without an
explicit request. README links now point to the `plans/` paths. The root `.env.example` is still
deleted and was not found under `plans/`; determine whether that deletion was intentional before
committing.

Additional Phase 2 changes currently in the worktree:

- `supabase/config.toml` added with project and seed configuration.
- `supabase/migrations/20260816093000_initial_monitoring_schema.sql` added.
- `supabase/seed.sql` now idempotently seeds six devices and two refrigerator rules.
- `packages/shared/src/schema.test.ts` added for schema/RLS structure checks.
- `supabase` package dev dependency added in `package.json` / `package-lock.json`.
- `README.md`, `docs/PHASE_2_CHECKLIST.md`, and `plans/PROJECT_PLAN.md` updated for Phase 2.

## Phase 2 Completion Notes

Migration applied to the hosted Supabase project:

```powershell
npx.cmd supabase db push --db-url <constructed-in-memory-url> --include-all --yes
```

Seed applied and verified using the checked-in `supabase/seed.sql`. The seed file was rewritten as
one SQL statement because `npx.cmd supabase db query --file supabase\seed.sql` rejected multiple
commands in one prepared statement.

Final hosted counts:

| Table                      | Count |
| -------------------------- | ----: |
| `devices`                  |     6 |
| `alert_rules`              |     2 |
| `readings`                 |     0 |
| `alerts`                   |     0 |
| RLS-enabled exposed tables |     4 |

Anonymous REST verification:

- `select` on `devices`, `readings`, `alert_rules`, and `alerts`: HTTP 200.
- `insert`, `update`, and `delete` on all four tables: HTTP 401.

Server REST verification:

- `SUPABASE_SECRET_KEY` insert into `devices`: HTTP 201.
- Cleanup delete for the temporary probe row: HTTP 204.
- Phase 3 idempotency migration
  `supabase/migrations/20260816103000_add_reading_idempotency.sql` was applied to hosted Supabase.

## Phase 3 Status

Phase 3 is complete. Do not request staff emails or login requirements yet.

Completed in Phase 3:

- Shared ingestion contract and validator added in `packages/shared/src/index.ts`.
- API route `POST /api/v1/readings` added in `apps/api/src/app.ts`.
- Supabase REST persistence added in `apps/api/src/monitoringStore.ts` using
  `SUPABASE_SECRET_KEY` only on the server.
- Ingestion authentication uses `Authorization: Bearer <SIMULATOR_DEVICE_KEY>`.
- Valid readings are inserted into `readings`, and the device row is patched to `status = 'online'`
  with `last_seen_at = receivedAt`.
- API tests cover valid storage, missing/invalid auth, invalid metric/unit/value/timestamp payloads,
  unknown devices, and missing server config.
- Simulator deterministic normal readings added in `simulator/src/telemetry.ts`.
- Simulator startup now posts one normal tick immediately and then repeats at
  `SIMULATOR_INTERVAL_MS` when `SIMULATOR_DEVICE_KEY` is configured.
- Duplicate reading handling is explicit: `readings` has a unique `(device_id, metric,
recorded_at)` index, and the API uses Supabase REST `resolution=ignore-duplicates` for idempotent
  retries.
- Delayed queued readings are accepted up to 24 hours after `recordedAt`; older readings are
  rejected by the shared validator.
- Simulator scenarios are selected with `SIMULATOR_SCENARIO`: `normal`, `high_fridge`,
  `low_fridge`, `door_excursion`, `high_humidity`, `smoke_signal`, `invalid_sensor`, and
  `offline_device`.
- Simulator network retry attempts are controlled by `SIMULATOR_RETRY_ATTEMPTS`.
- Simulator tests cover normal fridge/room batch shapes, one POST per seeded device, token-only
  simulator auth, abnormal scenarios, offline-device skipping, and network retry.

Hosted integration probe completed:

- Started the Express app in-process with local `.env`.
- Posted one authenticated `fridge_male_ward` temperature reading through `/api/v1/readings`.
- API returned HTTP 202 with `accepted = 1`.
- Supabase contained exactly one probe row for the posted `recorded_at`.
- Cleanup deleted the probe reading with HTTP 204.
- Cleanup reset `fridge_male_ward` to `status = 'offline'`, `last_seen_at = null` with HTTP 204.
- Posted the same authenticated `fridge_male_ward` temperature reading twice through
  `/api/v1/readings` after the idempotency migration.
- Both API calls returned HTTP 202, Supabase contained exactly one matching probe row, and cleanup
  deleted that row and reset `fridge_male_ward` heartbeat state.

Post-Phase-3 follow-up:

- Physical devices may need per-device credentials instead of the single `SIMULATOR_DEVICE_KEY`.
  That decision belongs with hardware provisioning.
- A longer live simulator run against hosted Supabase can be done once the user wants retained
  sample telemetry for dashboard work.

Dashboard migration note:

- React was removed from `apps/dashboard`.
- The dashboard now uses `index.html`, `src/dashboard.js`, `src/dashboardData.js`, `src/styles.css`,
  and Chart.js.
- The browser polls `GET /api/v1/dashboard`; it does not talk directly to Supabase and exposes no
  write, acknowledgement, configuration, or login controls.
- Vite dev dependency optimization for Chart.js is disabled in `apps/dashboard/vite.config.ts`
  because the managed Windows filesystem blocked esbuild while pre-bundling Chart.js. Production
  builds pass with the current config.

## Phase 4 Status

Phase 4 is complete. The public dashboard remains read-only and has no login, configuration, or
device-management controls.

Completed in Phase 4:

- Device cards provide a live overview of all six seeded monitors, including current metrics,
  online/offline/attention status, active-alert count, and last-seen time.
- Selecting a device opens its focused detail view with a device-specific alert list, current
  reading, refrigerator range where applicable, and temperature/humidity min, average, and max.
- Historical chart periods can be selected as 1 hour, 24 hours, 7 days, or a custom start/end
  period.
- `GET /api/v1/dashboard` accepts optional `deviceCode`, `from`, and `to` parameters. The API
  validates time bounds and uses them to query device-specific, bounded reading history through
  its server-side Supabase store.
- The dashboard visibly handles loading, empty-device, stale/offline, and API-unreachable states.
- Targeted verification passed on 17 August 2026: 12 API tests, 2 dashboard tests, API and
  dashboard production builds, and lint/Prettier checks for changed application files.

Current local-development note:

- If `npm.cmd run dev` terminates immediately, check for an existing process already using port 4100. The simulator reports `EADDRINUSE`, and the root `concurrently --kill-others-on-fail`
  script then stops the API on port 4000 as well.

## Phase 5 Status

Phase 5 is complete and applied to hosted Supabase.

- `20260817120000_add_alert_engine.sql` adds private persisted condition state, recovery duration,
  hysteresis, and server-only threshold/offline evaluation functions.
- Each valid ingestion batch is evaluated after storage. Invalid readings never enter the alert
  path.
- The API runs offline evaluation at startup and every 30 seconds by default; override with
  `OFFLINE_CHECK_INTERVAL_MS` when needed.
- Seed data now includes 2 refrigerator-temperature rules, 4 room-humidity rules, 4 approved
  detector-alarm-state rules, and 6 heartbeat rules. No arbitrary smoke-PPM life-safety threshold
  was introduced.
- Hosted self-cleaning probes passed for threshold trigger/recovery and offline trigger/recovery.
- A separate testing UI is available at `http://localhost:5173/simulation.html`. Set
  `SIMULATOR_CONTROL_ENABLED=true` locally to enable start/stop/scenario controls. The public
  dashboard remains read-only, and the simulator still sends the ESP32-compatible ingestion
  contract through the API.

## Safety Boundary

The custom IoT room monitoring is not a certified fire-alarm replacement. The health centre has no
existing fire system, so detector selection, placement, local sounders, mains wiring, testing, and
certification require a qualified fire-safety vendor. The final local alarm must operate without
Wi-Fi, Supabase, the dashboard, or custom ESP32 code. Hobby MQ-series smoke modules are acceptable
only for workbench simulation and must not be represented as operational fire protection.

For hardware work, avoid direct 230 V mains wiring. Use certified low-voltage adapters and involve a
qualified technician for fixed wiring, installation, and calibration approval.

## Reference Documents

- `plans/PROJECT_PLAN.md`: detailed architecture, schema outline, phases, acceptance criteria, and
  safety requirements.
- `plans/HARDWARE_AND_BUDGET.md`: beginner hardware guide and provisional budget.
- `docs/PHASE_2_CHECKLIST.md`: Supabase setup and public read-only Phase 2 boundary.
- `README.md`: package layout, commands, and local development instructions.
