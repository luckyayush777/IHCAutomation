# IHC Automation

Raspberry Pi information console and environmental monitoring for the institute health centre. The
system displays an approved public doctor roster, collects sensor readings through the API, stores
them in Supabase Postgres, and presents live read-only status on a lightweight dashboard built with
plain HTML, CSS, JavaScript, and Chart.js.

## Local services

| Service   | Package          | Local address                  | Purpose                               |
| --------- | ---------------- | ------------------------------ | ------------------------------------- |
| Dashboard | `@ihc/dashboard` | <http://localhost:5173>        | Doctor availability and monitoring UI |
| API       | `@ihc/api`       | <http://localhost:4000/health> | Ingestion and dashboard data API      |
| Simulator | `@ihc/simulator` | <http://localhost:4100/health> | Simulated sensor process              |

The simulator generates deterministic normal and failure scenarios through the same authenticated
ingestion contract planned for the ESP32 devices.

## Requirements

- Node.js 22.12 or newer
- npm 10 or newer

This computer currently has Node.js 24 and npm 11. On Windows PowerShell, use `npm.cmd` if the
local execution policy blocks `npm.ps1`.

## Start locally

```powershell
npm.cmd install
Copy-Item .env.example .env
npm.cmd run dev
```

Open <http://localhost:5173>. The dashboard polls the API and shows doctor availability, device
status, recent readings, active alerts, and Chart.js trends. A cached snapshot remains visible and
is explicitly labelled when the API or internet connection is unavailable.

Run a single application when needed:

```powershell
npm.cmd run dev:dashboard
npm.cmd run dev:api
npm.cmd run dev:simulator
```

## Quality checks

```powershell
npm.cmd run format:check
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
```

Run every check in sequence with `npm.cmd run check`.

## Environment variables

Create a local `.env` for machine-specific values. The `.env` file and all other environment files
are ignored by Git. Never place the Supabase secret key in dashboard source code, device firmware, a
commit, screenshot, or chat message.

Known Supabase variables for Phase 2 are:

```dotenv
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-publishable-or-anon-key
SUPABASE_SECRET_KEY=your-server-only-secret-key
SUPABASE_JWKS_URL=https://your-project-ref.supabase.co/auth/v1/.well-known/jwks.json
SUPABASE_DB_PASSWORD=your-database-password
```

The publishable key is safe for the public dashboard only because Row Level Security grants
anonymous clients read-only access. `SUPABASE_SECRET_KEY` is server-only.

Set `ADMIN_API_KEY` to a separate long random value to enable the local roster editor at
`http://127.0.0.1:4000/admin.html`. The editor accepts requests only from the Pi itself and retains
the key only for the current browser tab. Do not reuse the device-ingestion token.

## Supabase setup

The phase 2 schema lives in `supabase/migrations/20260816093000_initial_monitoring_schema.sql`.
Development seed data lives in `supabase/seed.sql`.

With the Supabase CLI installed and linked to the hosted project, apply the schema and seeds with:

```powershell
npx.cmd supabase db push --include-seed
```

## Reading ingestion

The Phase 3 ingestion endpoint accepts simulator or device readings through the API only:

```http
POST /api/v1/readings
Authorization: Bearer <SIMULATOR_DEVICE_KEY>
Content-Type: application/json
```

Example payload:

```json
{
  "contractVersion": 1,
  "deviceCode": "fridge_male_ward",
  "readings": [
    {
      "metric": "temperature",
      "value": 4.2,
      "unit": "celsius",
      "quality": "good",
      "recordedAt": "2026-08-16T10:30:00.000Z"
    }
  ]
}
```

The API uses `SUPABASE_SECRET_KEY` server-side to store valid readings and update device heartbeat
state. The simulator uses `SIMULATOR_DEVICE_KEY`; it never needs Supabase database keys.

Simulator scenarios are controlled with:

```dotenv
SIMULATOR_SCENARIO=normal
SIMULATOR_RETRY_ATTEMPTS=1
```

Available scenarios are `normal`, `high_fridge`, `low_fridge`, `door_excursion`, `high_humidity`,
`smoke_signal`, `invalid_sensor`, and `offline_device`.

For local demonstrations, add this to `.env`:

```dotenv
SIMULATOR_CONTROL_ENABLED=true
```

Then open <http://localhost:5173/simulation.html> to start or stop a scenario and choose its send
interval. These controls are served separately from the public dashboard and return 404 unless the
flag is explicitly enabled. The simulator binds to `127.0.0.1` by default and retains the ingestion
credential; it is never exposed to the browser.

## Alert evaluation

Alert rules are evaluated server-side after valid readings are stored. Refrigerator and humidity
conditions must persist for the configured duration, recovery must remain inside a hysteresis
margin for its configured duration, and only one alert can remain open for a device/rule pair. The
API also checks heartbeats every 30 seconds and marks a device offline after five minutes without a
reading. Detector-alarm rules use the approved alarm-state signal rather than an arbitrary smoke
PPM threshold.

## Dashboard data

The browser reads from the API only:

```http
GET /api/v1/dashboard
```

The endpoint returns doctors, recurring availability slots, devices, recent readings, enabled alert
rules, and recent alerts as one compact snapshot. The public dashboard contains no write,
acknowledgement, configuration, patient, or login controls. Roster changes are made through an
localhost-only, token-protected roster editor, never through the public screen.

## Raspberry Pi deployment

The production build is designed to run as an always-on Raspberry Pi information console. The API
serves the compiled dashboard on port 4000, and Chromium opens it in kiosk mode after login. ESP32
nodes remain distributed at each refrigerator and room and send readings to the Pi over the local
network.

See [Raspberry Pi deployment](docs/RASPBERRY_PI_DEPLOYMENT.md) for hardware, systemd, kiosk,
security, reliability, and update instructions.

## Repository map

```text
IHCAutomation/
|-- apps/
|   |-- api/                 Express service
|   `-- dashboard/           Plain HTML/CSS/JS and Chart.js interface
|-- deploy/raspberry-pi/     systemd and kiosk deployment files
|-- docs/                    Implementation checklists
|-- packages/
|   `-- shared/              Cross-service TypeScript contracts
|-- simulator/               Simulated sensor process
|-- supabase/
|   |-- migrations/          Phase 2 database migrations
|   `-- seed.sql             Phase 2 development devices and rules
|-- plans/
|   |-- HARDWARE_AND_BUDGET.md
|   `-- PROJECT_PLAN.md
`-- README.md
```

## Project documents

- [Full project plan](plans/PROJECT_PLAN.md)
- [Hardware and budget guide](plans/HARDWARE_AND_BUDGET.md)
- [Raspberry Pi deployment guide](docs/RASPBERRY_PI_DEPLOYMENT.md)
- [Phase 2 checklist](docs/PHASE_2_CHECKLIST.md)
