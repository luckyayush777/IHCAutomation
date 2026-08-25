# Phase 2: What You Need To Do

Phase 2 creates the local SQLite database, ORM schema and migrations, initial devices, and
API-mediated public read-only dashboard access. Staff login is intentionally deferred. The database
will reside on the Raspberry Pi and will not require a hosted database account.

## Before Phase 2 starts

### 1. Prepare local database storage

1. Reserve a protected application-data directory on the Raspberry Pi, for example
   `/var/lib/ihc-automation`.
2. Store the SQLite database on the Pi's SSD or high-endurance storage, not on removable temporary
   media.
3. Restrict the directory to the application service account and administrator.
4. Define an encrypted, institute-controlled backup location and a restoration procedure.

### 2. Put the database location in your local `.env`

```dotenv
DATABASE_URL="file:/var/lib/ihc-automation/ihc-monitoring.db"
```

The public dashboard must access data only through the Express API. The database file and its path
must not be exposed to the dashboard or physical devices.

### 3. Confirm the public prototype boundary

The first prototype will use this access model:

- no login is required to open the dashboard;
- anyone with the dashboard URL can view device names, readings, status, and alert history;
- public browser clients cannot insert, update, or delete database records;
- configuration changes remain server-side during the prototype;
- patient, clinical, recipient, and other personal data must not be stored in this system.

Authentication and staff roles can be added later without changing the sensor ingestion design.

### 4. Get four operating decisions in writing

Ask the health-centre owner or responsible staff member to confirm:

| Decision                        | Proposed prototype value    |
| ------------------------------- | --------------------------- |
| Fridge safe range               | 2.0 to 5.0 degrees Celsius  |
| Excursion delay before alert    | 10 minutes                  |
| Device considered offline after | 5 minutes without a reading |
| Data retention for the pilot    | 90 days                     |

These are software defaults for testing, not medical or regulatory advice. The responsible person
must approve or replace them before the monitored readings are used operationally.

### 5. Confirm the six monitored locations

Supply readable names for:

- Fridge 1;
- Fridge 2;
- Room 1;
- Room 2;
- Room 3;
- Room 4.

Examples are `Vaccine Refrigerator`, `Medicine Refrigerator`, `Consultation Room`, and
`Dispensary`. These names become the seeded device records shown to staff.

## What I will implement in Phase 2

Once the project exists and the local `.env` values are present, the repository work is:

- [ ] Prisma ORM configuration and repeatable local SQLite migrations;
- [ ] `devices`, `readings`, `alert_rules`, and `alerts` tables;
- [ ] data types, foreign keys, checks, uniqueness constraints, and query indexes;
- [ ] two refrigerator devices and four room devices in development seed data;
- [ ] API-only database access, with no direct browser or device connection;
- [ ] local migrations and seed data applied to the Raspberry Pi database;
- [ ] verify browser-side and device-side database writes are impossible;
- [ ] no login or account-management screens in the prototype;
- [ ] database tests proving the API can access the database while the dashboard and devices cannot;
- [ ] reset, backup, and restore instructions for the local database.

## Phase 2 completion check

Phase 2 is complete when a clean ORM migration creates the local schema, the six devices appear
after seeding, the dashboard can read approved data through the API, and neither the browser nor a
device can directly create or modify database records.

The next step is Phase 3: the simulator sends deterministic normal and abnormal readings to the API,
and the API validates and stores them in the local SQLite database through the ORM.
