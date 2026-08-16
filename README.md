# IHC Automation

Environmental and medicine-fridge monitoring for the institute health centre. The first
software milestone provides three independently runnable TypeScript applications and a shared
health contract. Supabase storage and authentication are introduced in Phase 2.

## Phase 1 services

| Service   | Package          | Local address                  | Purpose in Phase 1                         |
| --------- | ---------------- | ------------------------------ | ------------------------------------------ |
| Dashboard | `@ihc/dashboard` | <http://localhost:5173>        | Shows local service readiness              |
| API       | `@ihc/api`       | <http://localhost:4000/health> | Exposes the ingestion service health check |
| Simulator | `@ihc/simulator` | <http://localhost:4100/health> | Exposes simulator process health           |

The simulator does not generate sensor readings yet. That begins after the Phase 2 database is
ready, so Phase 3 can send readings through the ingestion API.

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

Open <http://localhost:5173>. When all three processes are running, the dashboard changes both
service indicators to `online` automatically.

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
npm.cmd test
npm.cmd run build
```

Run every check in sequence with `npm.cmd run check`.

## Environment variables

Copy `.env.example` to `.env` for local values. The `.env` file and all other environment files
are ignored by Git. Never place the Supabase service-role key in dashboard source code, device
firmware, a commit, screenshot, or chat message.

The applications have safe local defaults for Phase 1. Supabase values remain placeholders
until Phase 2.

## Repository map

```text
IHCAutomation/
|-- apps/
|   |-- api/                 Express service
|   `-- dashboard/           React and Vite interface
|-- docs/                    Implementation checklists
|-- packages/
|   `-- shared/              Cross-service TypeScript contracts
|-- simulator/               Simulated sensor process
|-- supabase/
|   |-- migrations/          Phase 2 database migrations
|   `-- seed.sql             Phase 2 development devices and rules
|-- .env.example
|-- HARDWARE_AND_BUDGET.md
|-- PROJECT_PLAN.md
`-- README.md
```

## Project documents

- [Full project plan](PROJECT_PLAN.md)
- [Hardware and budget guide](HARDWARE_AND_BUDGET.md)
- [Phase 2 checklist](docs/PHASE_2_CHECKLIST.md)
