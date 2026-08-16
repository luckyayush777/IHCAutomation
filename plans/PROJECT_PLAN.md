# Institute Health Centre IoT Monitoring System

## 1. Project Summary

Build an IoT monitoring system for an institute health centre. The system will collect environmental and equipment readings, store them in Supabase PostgreSQL, display current and historical conditions on a dashboard, and notify staff when configured safety limits are crossed.

The first version will use simulated sensor data. Real sensors can later replace the simulator without changing the database, dashboard, or alert model.

## 2. Project Goals

- Monitor two medicine refrigerators between the institute-provided limits of 2°C and 5°C, subject to written confirmation of the storage policy.
- Monitor humidity and room temperature in four rooms.
- Monitor four rooms for possible fire conditions using approved local detectors plus temperature and smoke/alarm-state inputs.
- Show live status and historical trends on a staff dashboard.
- Create and resolve alerts; staff acknowledgement is deferred from the first version.
- Record enough history for incident review and refrigerator compliance reporting.
- Continue collecting readings during temporary network failures once physical devices are introduced.

### Confirmed deployment profile

| Item                  | Current decision                                                              |
| --------------------- | ----------------------------------------------------------------------------- |
| Intended outcome      | Operational institute system, beginning with a controlled pilot               |
| Delivery target       | Sensor-equipped version in 4–6 weeks                                          |
| Refrigerator coverage | 2 refrigerators                                                               |
| Room coverage         | 4 rooms, each requiring humidity and fire monitoring                          |
| Refrigerator range    | 2–5°C, pending written policy confirmation                                    |
| Existing fire system  | None                                                                          |
| Alert channels        | Local buzzer, email, SMS, and WhatsApp where appropriate                      |
| Primary users         | Health-centre staff and office personnel; professors need phone access        |
| Dashboard targets     | Desktop and mobile are equally important                                      |
| Data hosting          | Supabase for the prototype; production hosting requires an institute decision |
| Maintenance owner     | Health-centre staff, with a named responsible person still to be assigned     |
| Connectivity          | Wi-Fi coverage and reliability still need an on-site survey                   |

## 3. Safety Boundary

The dashboard and custom IoT electronics are monitoring and notification aids, not a certified fire-alarm replacement.

Because the institute currently has no fire system, certified local fire detection is a separate required workstream. The final fire devices must activate local audible/visible alarms without depending on an ESP32, Wi-Fi, the database, or the dashboard. Detector selection, coverage, placement, wiring, testing, and escalation procedures must be designed or approved by a qualified fire-safety vendor and the institute. The IoT room nodes should read an approved relay/dry-contact output from that system where possible.

Medicine temperature limits must remain configurable and be based on manufacturer instructions and the health centre's approved storage policy. The supplied 2–5°C range will be used for the prototype only after it is recorded as a configurable rule; alert delay and recovery duration remain to be confirmed.

## 4. Initial Scope

### Included

- Simulated readings for:
  - two refrigerator temperature probes;
  - humidity and temperature in four rooms;
  - smoke level or approved detector alarm state in four rooms.
- Supabase PostgreSQL database.
- Secure ingestion API for sensor readings.
- Dashboard with current values, trends, device health, and active alerts.
- Configurable alert rules.
- Active and resolved alert history, with schema fields reserved for future acknowledgement.
- Simulation scenarios for normal operation and failures.
- Responsive desktop and mobile views.
- Email and local-buzzer alerting in the first hardware pilot.

### Deferred

- Purchasing and installing physical sensors.
- Certified fire-alarm integration.
- Staff acknowledgement workflow.
- SMS and WhatsApp if provider setup or institute approval cannot be completed within the initial schedule.
- Patient or clinical records.
- Multiple health-centre sites.
- Formal regulatory certification.

## 5. Proposed Architecture

```text
Simulator now / ESP32 gateway later
                 |
                 | HTTPS + device credential
                 v
          Reading ingestion API
                 |
                 v
       Supabase PostgreSQL database
          |              |
          v              v
      Dashboard      Alert processor
                         |
                         v
                  Email/SMS provider
```

Sensors must not connect directly to the database. They send readings to an ingestion API, which validates and stores the data. This avoids placing database credentials in device firmware and provides one stable interface for both simulated and physical devices.

## 6. Technology Choices

| Area              | Initial choice                                    | Reason                                                                           |
| ----------------- | ------------------------------------------------- | -------------------------------------------------------------------------------- |
| Database          | Supabase PostgreSQL                               | Managed SQL database with authentication and realtime support                    |
| Frontend          | Plain HTML, CSS, JavaScript, and Vite             | Lightweight public dashboard without a component framework                       |
| Charts            | Chart.js                                          | Straightforward time-series charts with minimal browser JavaScript               |
| Backend           | Node.js with Express and TypeScript               | Small ingestion and alert-processing API using the same language as the frontend |
| Simulator         | Node.js TypeScript script                         | Shares data types and validation rules with the backend                          |
| Live updates      | Short polling through the Express API             | Keeps dashboard readings current without exposing write credentials              |
| Local development | Supabase cloud project plus environment variables | Fastest prototype setup                                                          |
| Hosting           | Decide after the local prototype                  | Depends on institute policy and deployment preference                            |

## 7. Data Model

### `devices`

Stores each simulated or physical device.

| Column         | Type      | Notes                                                      |
| -------------- | --------- | ---------------------------------------------------------- |
| `id`           | UUID      | Primary key                                                |
| `device_code`  | Text      | Unique stable identifier such as `fridge-01`               |
| `name`         | Text      | Human-readable name                                        |
| `location`     | Text      | For example, `Pharmacy Refrigerator`                       |
| `device_type`  | Text      | `fridge_probe` or `room_monitor` for the initial six nodes |
| `status`       | Text      | `online`, `offline`, `maintenance`, or `disabled`          |
| `last_seen_at` | Timestamp | Used to detect offline devices                             |
| `created_at`   | Timestamp | Audit field                                                |

### `readings`

Stores all sensor measurements.

| Column        | Type        | Notes                                                  |
| ------------- | ----------- | ------------------------------------------------------ |
| `id`          | Big integer | Primary key                                            |
| `device_id`   | UUID        | Foreign key to `devices`                               |
| `metric`      | Text        | `temperature`, `humidity`, or `smoke`                  |
| `value`       | Numeric     | Measured value                                         |
| `unit`        | Text        | `celsius`, `percent_rh`, or device-specific smoke unit |
| `quality`     | Text        | `good`, `suspect`, or `invalid`                        |
| `recorded_at` | Timestamp   | Time measured by the device                            |
| `received_at` | Timestamp   | Time received by the server                            |

Create an index on `(device_id, metric, recorded_at desc)` for dashboard queries.

### `alert_rules`

Stores configurable thresholds rather than hard-coding them in the dashboard.

| Column             | Type    | Notes                                 |
| ------------------ | ------- | ------------------------------------- |
| `id`               | UUID    | Primary key                           |
| `name`             | Text    | Rule description                      |
| `device_id`        | UUID    | Device covered by the rule            |
| `metric`           | Text    | Metric being evaluated                |
| `minimum_value`    | Numeric | Optional lower limit                  |
| `maximum_value`    | Numeric | Optional upper limit                  |
| `duration_seconds` | Integer | Time outside range before alerting    |
| `severity`         | Text    | `warning`, `critical`, or `emergency` |
| `enabled`          | Boolean | Allows rules to be disabled safely    |

### `alerts`

Stores the complete alert lifecycle.

| Column            | Type      | Notes                                    |
| ----------------- | --------- | ---------------------------------------- |
| `id`              | UUID      | Primary key                              |
| `rule_id`         | UUID      | Rule that created the alert              |
| `device_id`       | UUID      | Affected device                          |
| `status`          | Text      | `active`, `acknowledged`, or `resolved`  |
| `message`         | Text      | Staff-facing description                 |
| `trigger_value`   | Numeric   | Reading that triggered the alert         |
| `triggered_at`    | Timestamp | When the condition began                 |
| `acknowledged_at` | Timestamp | When staff acknowledged it               |
| `acknowledged_by` | UUID      | Reserved for a future authenticated user |
| `resolved_at`     | Timestamp | When readings returned to normal         |

### Optional later tables

- `profiles` for staff names and roles.
- `notification_contacts` for escalation recipients.
- `notification_attempts` for delivery status and retries.
- `device_credentials` if device authentication is managed outside the API.
- `maintenance_events` for calibration and battery replacement records.

## 8. Reading API Contract

Initial endpoint:

```http
POST /api/v1/readings
Authorization: Bearer <device-token>
Content-Type: application/json
```

Example payload:

```json
{
  "deviceCode": "fridge-01",
  "readings": [
    {
      "metric": "temperature",
      "value": 4.2,
      "unit": "celsius",
      "recordedAt": "2026-08-16T10:30:00Z"
    }
  ]
}
```

The API must:

- authenticate the device;
- validate device, metric, unit, value, and timestamp;
- reject timestamps that are unreasonably old or in the future;
- record both measurement and server-receipt times;
- update the device's `last_seen_at` value;
- return a clear success or validation error response;
- avoid logging credentials.

## 9. Simulator Design

The simulator should generate a reading every 30 to 60 seconds and support deterministic scenarios.

### Normal scenario

- Refrigerator temperature changes gradually within its configured range.
- Humidity and room temperature vary slowly.
- Smoke remains at its normal baseline.

### Test scenarios

- Refrigerator temperature gradually rises above the configured maximum.
- Refrigerator temperature drops below the configured minimum.
- Refrigerator door event causes a short excursion that should not immediately alert.
- High humidity persists long enough to trigger a warning.
- Room temperature rises while smoke also increases.
- Smoke increases without a temperature rise.
- Sensor sends an impossible value and the API rejects or flags it.
- Device stops reporting and becomes offline.
- Network connection fails and queued readings are retried.

The simulator should accept a command or configuration option to activate each scenario. Random values alone are not sufficient because alert behavior must be repeatable during demonstrations and tests.

## 10. Alert Behaviour

- Alert rules are evaluated on the server after a valid reading is stored.
- A rule may require a condition to persist for a configured duration.
- A small recovery margin should be used to prevent repeated alert/resolution cycles near a threshold.
- Only one active alert should exist for the same device and rule.
- The first version does not require staff acknowledgement; adding it later must not resolve the underlying condition by itself.
- Resolution occurs when the reading has returned to the acceptable range for a configured period.
- Missing readings create a separate device-offline alert.
- Every transition is timestamped for audit history.

Fire monitoring should use a reviewed combination of smoke, temperature, and rate-of-rise conditions. It should not rely on an arbitrary dashboard threshold. The physical device's local alarm remains the primary safety mechanism.

## 11. Dashboard Requirements

### Overview

- Current status for refrigerator, humidity, room temperature, and smoke monitor.
- Clear normal, warning, critical, offline, and maintenance states.
- Active-alert count and latest update time.
- Device connectivity indicator based on `last_seen_at`.

### Device detail

- Current reading and configured acceptable range.
- Historical chart with 1-hour, 24-hour, 7-day, and custom ranges.
- Minimum, maximum, and average values for the selected period.
- Active and historical alerts.
- Data quality and missing-reading indicators.

### Alert management

- Active alerts ordered by severity and age.
- Resolution state and event timeline.
- Filters for severity, device, status, and date.
- Acknowledgement controls are planned for a later release and are not required for the first version.

### Administration (deferred)

- The public dashboard does not include administration controls.
- During the prototype, thresholds, device state, and rules are changed through reviewed database migrations or server-side tools.
- An authenticated administration area can be added later if routine in-app configuration becomes necessary.

The interface should be optimized for quick scanning on a health-centre computer and provide equal functional coverage on phones used by professors. Color must not be the only indication of an alert state. The prototype dashboard is public and does not require sign-in.

## 12. Security and Privacy

- Keep patient and clinical data out of this system.
- Allow anonymous, read-only access to the monitoring dashboard during the prototype.
- Do not expose configuration, acknowledgement, device-management, or database-write controls on the public dashboard.
- Treat device names, readings, and alert history as public to anyone who receives the dashboard URL.
- Enable Row Level Security on every exposed Supabase table.
- Add narrowly scoped `select` policies for the public dashboard and deny anonymous `insert`, `update`, and `delete` operations.
- Never expose a Supabase secret or service-role key in the browser or device firmware.
- Store secrets in environment variables and exclude them from Git.
- Give the ingestion API only the permissions it requires.
- Use HTTPS for all device and dashboard traffic.
- Rate-limit ingestion endpoints and reject unknown devices.
- Maintain an audit trail for rule changes and alert state changes; extend it to acknowledgements when that feature is added.
- Confirm hosting, retention, and access policies with institute IT before production use.

## 13. Reliability and Retention

- Treat all timestamps as UTC in the database and convert them for display.
- Physical gateways should queue readings locally during an internet outage and retry later.
- Display a visible stale-data state instead of showing an old value as current.
- Start with 30- to 60-second readings.
- Keep detailed readings for a policy-defined period, then aggregate or delete them.
- Export regular database backups during the prototype.
- Use automated backups and test restoration before production deployment.
- Monitor API failures, database failures, and notification delivery failures.

## 14. Implementation Phases

### Phase 1: Project foundation

**Status:** Completed on 16 August 2026. The npm workspace now contains independently runnable
dashboard, API, simulator, and shared-contract packages. Formatting, linting, type checking,
tests, production builds, environment templates, and local startup instructions are configured.

- Create the application repository structure.
- Create separate frontend, backend, and simulator packages.
- Configure linting, formatting, environment-variable examples, and basic tests.
- Document local startup commands.

**Completion criteria:** all three applications start locally and contain health-check endpoints or screens.

### Phase 2: Supabase setup

**Status:** Completed on 16 August 2026. The hosted Supabase project has the Phase 2 migration and
seed data applied. Public clients can read the approved dashboard tables and are blocked from
insert, update, and delete operations across the exposed monitoring tables. Server-side secret-key
access was verified with a temporary write/delete probe.

- Create a Supabase project.
- Add database migrations for core tables, constraints, and indexes.
- Add initial simulated devices.
- Enable Row Level Security and create access policies.
- Add anonymous read-only policies for dashboard data; defer staff authentication.

**Completion criteria:** migrations can create the database from scratch, anonymous clients can read dashboard data, and browser clients cannot create or modify telemetry.

### Phase 3: Ingestion API and simulator

**Status:** In progress on 16 August 2026. The shared ingestion contract, authenticated
`POST /api/v1/readings` API route, Supabase-backed reading storage, device heartbeat update, and
deterministic normal simulator batches have been added. A hosted integration probe successfully
stored one refrigerator reading through the API and cleaned it up afterward. Remaining Phase 3 work
includes broader live simulator soak testing, duplicate handling, delayed-reading behavior, and
abnormal scenario controls.

- Implement device authentication and reading validation.
- Store valid readings and update device heartbeat information.
- Implement normal and abnormal simulator scenarios.
- Add automated tests for valid, invalid, duplicate, and delayed readings.

**Completion criteria:** the simulator continuously populates Supabase and invalid readings are handled predictably.

### Phase 4: Dashboard

- Build the overview and device-detail screens.
- Add historical charts and time-range selection.
- Add loading, disconnected, stale, empty, and error states.
- Add live updates through Realtime or polling.

**Completion criteria:** staff can identify every device's current condition and inspect its recent history.

### Phase 5: Alert engine

- Evaluate configurable rules outside the frontend.
- Add duration and recovery behavior.
- Add offline-device detection.
- Add automatic resolution workflows and preserve the data model needed for future acknowledgement.
- Test alerts using deterministic simulator scenarios.

**Completion criteria:** each test scenario creates exactly the expected alert transitions without duplicate alert storms.

### Phase 6: Notifications and reporting

- Add email notifications and local buzzers first.
- Store notification attempts and delivery outcomes.
- Add SMS next, followed by WhatsApp after provider and institute account requirements are confirmed.
- Add escalation rules, retry behavior, and anti-spam limits.
- Add CSV refrigerator history export for a selected period; formatted PDF reports can follow if the institute requests them.

**Completion criteria:** a critical test alert reaches configured recipients and its delivery is recorded.

### Phase 7: Physical sensor pilot

- Confirm sensor types, accuracy, operating range, calibration requirements, and Wi-Fi coverage.
- Build two refrigerator nodes and four room nodes around ESP32-class Wi-Fi controllers using the existing API contract.
- Use PT100 Class A three-wire probes with an RTD interface as the initial refrigerator candidate, subject to calibration testing.
- Use SHT40-class digital humidity and temperature sensors as the initial room candidate.
- Obtain a qualified vendor design and quote for certified smoke/heat detection, local sounders, power backup, and dry-contact integration. Do not install hobby smoke sensors as life-safety devices.
- Add local buffering, retry logic, heartbeat reporting, and secure provisioning.
- Compare sensor readings with a trusted calibrated reference.
- Run simulated failures and network-outage tests.

**Completion criteria:** both refrigerator nodes and all four room nodes report reliably for an agreed pilot period, local alarms work without internet access, and refrigerator probes remain within the accepted measured accuracy.

### Phase 8: Production readiness

- Obtain institute IT and safety approval.
- Finalize operating procedures and escalation contacts.
- Configure production backups, monitoring, and credential rotation.
- Train staff to respond to alerts and offline devices using the institute's operating procedure.
- Document calibration, maintenance, and recovery procedures.
- Conduct a controlled acceptance test.

**Completion criteria:** the institute signs off on the technical setup, safety boundaries, alert procedure, and maintenance ownership.

## 15. Six-Week Delivery Schedule

The six-week version is the recommended plan. A four-week delivery is possible for a software prototype and limited bench hardware, but it should not be described as a fully validated six-location operational system.

| Week | Software work                                                         | Hardware and institute work                                                                        | Exit result                                    |
| ---- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 1    | Supabase schema, simulator, ingestion API foundation                  | Site survey, Wi-Fi test, confirm 2–5°C rule, request fire-system quotes, order parts               | Simulated readings stored; procurement started |
| 2    | Responsive overview, device pages, history charts, public read access | Bench-test ESP32, one SHT40, and one refrigerator probe                                            | Dashboard works on desktop and phone           |
| 3    | Alert engine, offline detection, email notifications, CSV export      | Build one complete fridge node and one room node; test local buzzer and buffering                  | End-to-end bench demonstration                 |
| 4    | Error handling, audit records, notification retries                   | Calibrate first probe; review fire-vendor proposal; confirm installation points                    | Pilot-ready design and first validated nodes   |
| 5    | SMS integration and operational polish                                | Assemble remaining nodes, install enclosures, test power and Wi-Fi at all six locations            | Two fridges and four rooms report data         |
| 6    | Bug fixes, backup procedure, final documentation                      | Soak test, outage drills, staff training, handover; add WhatsApp only if account approval is ready | Controlled operational pilot sign-off          |

Critical dependencies that must begin in Week 1:

- written confirmation of refrigerator range and alert delay;
- Wi-Fi and power survey at all six locations;
- delivery lead times for probes, enclosures, and power supplies;
- qualified fire-safety assessment and quote;
- institute approval for email, SMS, WhatsApp, and cloud accounts;
- availability of a calibrated reference thermometer or calibration service.

## 16. Provisional Hardware Design

### Refrigerator nodes: 2 required

- ESP32 development board for the pilot; use a production-ready assembled board or custom PCB after validation.
- PT100 Class A three-wire stainless probe.
- MAX31865-compatible RTD interface with lead-fault detection.
- Local buzzer and clear status indicator.
- Enclosure, regulated power supply, and cable strain relief.
- Local flash queue for readings during Wi-Fi loss.
- Optional refrigerator-door reed switch to help explain short temperature excursions.
- Calibration against a traceable reference before operational use.

### Room nodes: 4 required

- ESP32 development board.
- SHT40 humidity and temperature sensor.
- Electrically isolated dry-contact input from an approved fire detector or fire panel.
- Status indicator and connection to a local approved sounder/alarm arrangement.
- Enclosure, regulated power supply, and local flash queue.

An MQ-series hobby smoke sensor may be used on the workbench to exercise simulated values, but it must not be installed or represented as the operational fire detector.

### Spares and support equipment

- Two spare ESP32 boards and at least one spare room sensor.
- Breadboards and jumper wiring for development only.
- Soldered prototype boards or custom PCBs for installed nodes.
- Router UPS or other network power backup if the site survey shows a need.
- Multimeter and a calibrated reference thermometer/data logger.
- Labels, mounting hardware, protected cabling, and tamper-resistant enclosures.

## 17. Preliminary Budget

This is a planning allowance, not a purchasing quote. Prices and certified fire-system requirements must be confirmed with current supplier and installer quotations before the institute approves procurement.

| Budget area                                                                                         |                                                        Preliminary allowance |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------: |
| ESP32 boards, including two spares                                                                  |                                                                ₹3,000–₹8,000 |
| Two PT100 probe and RTD-interface assemblies                                                        |                                                               ₹4,000–₹10,000 |
| Four SHT40 room sensor assemblies plus a spare                                                      |                                                                ₹2,000–₹5,000 |
| Enclosures, isolated inputs, PCBs, wiring, power supplies, indicators, and IoT buzzers              |                                                              ₹15,000–₹30,000 |
| Local buffering, network/power backup, and installation consumables                                 |                                                               ₹6,000–₹15,000 |
| Reference thermometer, calibration, or calibration service                                          |                                                               ₹5,000–₹15,000 |
| **IoT monitoring subtotal**                                                                         |                                                          **₹35,000–₹83,000** |
| Certified fire detection, sounders, panel/relay interface, cabling, installation, and commissioning | **Vendor quote required; hold ₹40,000–₹1,00,000 as a provisional allowance** |

For the next meeting, present **₹1,00,000–₹2,00,000** as the early planning range for an operational six-location pilot, including contingency but excluding the developer's labour. The range should be replaced by a line-item bill of materials and at least one qualified fire-vendor quote after the site survey.

Recurring costs:

- Supabase Free is suitable during active development. The current Supabase Pro plan starts at USD 25 per month and includes automatic daily backups; confirm current pricing and tax before production approval.
- Application hosting may have a monthly fee depending on the selected provider or institute infrastructure.
- SMS and WhatsApp messages have provider and usage charges.
- Calibration, detector tests, battery replacement, and maintenance should receive an annual budget.

## 18. Suggested Future Repository Structure

```text
IHCAutomation/
|-- apps/
|   |-- dashboard/
|   `-- api/
|-- packages/
|   `-- shared/
|-- simulator/
|-- supabase/
|   |-- migrations/
|   `-- seed.sql
|-- docs/
|-- .env.example
|-- README.md
`-- PROJECT_PLAN.md
```

## 19. Testing Strategy

- Unit tests for validation and alert-rule evaluation.
- API tests for device authentication, ingestion, duplicate handling, and permissions.
- Database tests for constraints and Row Level Security.
- Dashboard tests for loading, offline, stale, warning, and critical states.
- End-to-end tests that activate simulator scenarios and verify alert history.
- Manual responsive checks on desktop and phone-sized screens.
- Later hardware tests for calibration, power loss, Wi-Fi loss, delayed uploads, and local fire-alarm operation.

## 20. Prototype Acceptance Criteria

The software prototype is complete when:

- simulated data for two refrigerators and four room monitors is stored in Supabase;
- the dashboard shows current values and historical charts;
- stale or offline devices are clearly identified;
- configurable out-of-range conditions create alerts;
- staff can review active and resolved alerts; acknowledgement remains a future feature;
- invalid readings are rejected or marked as suspect;
- public users can read monitoring data while Row Level Security blocks browser-side writes;
- the system can demonstrate normal, refrigerator excursion, humidity warning, possible fire, and offline-device scenarios;
- setup and demonstration steps are documented.

## 21. Immediate Next Actions

1. Create the Supabase project and save its URL and keys in local environment variables.
2. Ask the institute to confirm the 2–5°C range, alert delay, notification recipients, and escalation procedure in writing.
3. Survey Wi-Fi signal and power availability at both refrigerators and all four rooms.
4. Request a qualified quote for certified fire detection and local sounders in the four rooms.
5. Scaffold the frontend, API, and simulator applications using TypeScript.
6. Write the first database migration for `devices`, `readings`, `alert_rules`, and `alerts`.
7. Seed two refrigerator devices and four room devices.
8. Implement the normal simulator scenario and verify readings in Supabase.
9. Build the responsive dashboard overview using those readings.
10. Add deterministic alert scenarios and implement the alert engine.
11. Purchase one ESP32, one SHT40 board, and one PT100/MAX31865 assembly for the first bench test before ordering all units.

## 22. Decisions to Confirm Before the Pilot

- Written approval of the supplied 2–5°C refrigerator range, excursion duration, recovery margin, and escalation action.
- Approved room humidity limits.
- Fire-safety design, certification requirements, responsible authority, and approved installer.
- Named recipients for each alert severity and the required response time.
- Which channels are required for the first release: local buzzer and email are proposed as mandatory; SMS follows; WhatsApp depends on account approval.
- Required telemetry retention period.
- Whether cloud hosting is permitted by institute IT.
- Required report format and frequency; CSV export is proposed first.
- Named staff owner and schedule for calibration, detector testing, battery replacement, and offline-device response.
- Wi-Fi reliability, internet-outage behavior, and whether router power backup is required.

## 23. Reference Documentation

- Supabase database: <https://supabase.com/docs/guides/database/overview>
- Supabase Row Level Security: <https://supabase.com/docs/guides/database/postgres/row-level-security>
- Supabase Realtime: <https://supabase.com/docs/guides/realtime>
- Supabase backups: <https://supabase.com/docs/guides/platform/backups>
- Supabase pricing: <https://supabase.com/pricing>
- Espressif ESP32 documentation: <https://www.espressif.com/en/products/socs/esp32/documentation>
- Sensirion SHT40 specifications: <https://sensirion.com/products/catalog/SHT40>
- Analog Devices MAX31865 specifications: <https://www.analog.com/en/products/max31865.html>
- BIS fire detection and alarm control-equipment code of practice, IS 15908:2021: <https://services.bis.gov.in/php/BIS_2.0/bisconnect/standard_review/Standard_review/Isdetails?ID=MjU4MDA%3D>
