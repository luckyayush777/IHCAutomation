# Institute Health Centre Automation: Testing and Evaluation Plan

## Purpose

This plan verifies that the Institute Health Centre monitoring prototype records readings
correctly, presents useful information to staff, creates alerts for defined conditions, and
recovers predictably from common failures. Testing will begin with simulated data and bench-tested
hardware, then move to a limited live pilot only after the required checks pass.

The system is a monitoring and notification aid. Tests of the prototype fire input do not certify
or validate it as a fire-alarm system. Certified fire detection and local alarm operation require
separate testing and commissioning by a qualified fire-safety provider.

## Test approach

Testing is performed in four stages:

| Stage | Scope | Evidence produced |
| --- | --- | --- |
| 1. Software and simulator tests | API validation, database operations, alert rules, dashboard states, and failure scenarios using simulated readings | Automated test results and screenshots/logs |
| 2. Bench hardware tests | One refrigerator node and one room node connected to the local Pi system | Sensor comparison record, serial/API logs, and alert records |
| 3. Reliability tests | Wi-Fi loss, delayed uploads, power restart, device failure, and backup/restore exercises | Test record showing observed behaviour and recovery result |
| 4. Controlled pilot evaluation | Limited use with approved staff, configured rules, and real environmental readings | Staff feedback, uptime/alert summary, and acceptance checklist |

Each test record will include the test ID, date, tester, setup, input or fault introduced,
expected result, actual result, pass/fail result, and any follow-up action.

## Test cases

| ID | Area | Test method | Expected result | Acceptance criterion |
| --- | --- | --- | --- | --- |
| T1 | Sensor accuracy | Compare each refrigerator probe against a trusted reference thermometer at stable temperatures; compare the SHT40 with a reference instrument in a stable room. | Readings are stable and any difference is recorded. | Each installed sensor has a documented comparison result and is suitable for the approved pilot requirement. |
| T2 | Sensor placement and wiring | Check probe position, cable strain relief, enclosure, power supply, and sensor-node labels. | Components are secure and readings continue while cables are gently moved. | No loose breadboard/jumper-wire installation; each node and sensor is identifiable. |
| T3 | Valid ingestion | Send normal simulated and physical readings through the device API. | The API authenticates the device, validates the payload, stores readings, and updates device status. | Readings appear in the database and dashboard with the correct device, metric, value, and time. |
| T4 | Invalid and duplicate data | Send an invalid metric, out-of-range/impossible value, stale/future timestamp, unauthorised request, and a repeated reading. | Invalid or unauthorised data is rejected/flagged; duplicate retries do not create incorrect duplicate alert events. | API returns a clear response and the stored data remains consistent. |
| T5 | High and low temperature alerts | Use the simulator or a controlled bench condition to move a refrigerator value above and below the approved prototype limits. | An alert is created after the configured delay and shown on the dashboard; the local/email notification route is triggered where enabled. | One correct alert is recorded for each sustained test condition. |
| T6 | Short excursion and recovery | Simulate a short door-opening temperature excursion, then return the reading to normal. Also test a sustained condition returning to normal. | A short excursion does not create a false alert; a sustained alert resolves only after the configured recovery condition. | Alert delay, hysteresis, and resolution behaviour match the configured rule. |
| T7 | Humidity and room-temperature alerts | Simulate values above/below the approved room thresholds. | The dashboard displays the condition and creates the expected alert. | Each configured room rule produces the correct alert lifecycle. |
| T8 | Fire-input demonstration boundary | Trigger the prototype smoke/heat input or approved dry-contact test input in a controlled bench test. | The input is recorded and displayed as an alert/event. | Documentation and dashboard make clear that this test does not validate a certified fire alarm. |
| T9 | Offline-device detection | Stop a sensor node or simulator from reporting for longer than the configured heartbeat period. | The device becomes offline and an offline alert/status is displayed. | Offline condition is visible within the configured interval; normal status returns after reporting resumes. |
| T10 | Wi-Fi interruption and recovery | Disconnect the node from Wi-Fi, collect readings during the interruption if buffering is implemented, then reconnect. | Live status becomes stale/offline; queued readings are retried safely after reconnection. | No misleading claim that stale data is current; recovered readings retain their measurement and receipt times. |
| T11 | Pi restart and power interruption | Restart the Pi service and conduct a controlled power-interruption/safe-shutdown test. | The API, database, and kiosk recover automatically or through the documented procedure. | The dashboard resumes, recent stored data remains available, and no database corruption is observed. |
| T12 | Device and storage failure | Disconnect a sensor/probe and simulate unavailable storage or a failed microSD card using a controlled test setup. | The failure is detectable and the recovery procedure can be followed. | Staff can identify the affected component and restore service using the documented steps. |
| T13 | Backup and restoration | Create a local database backup, restore it to a separate test location, and verify readings, rules, devices, and alerts. | Restored data is readable and internally consistent. | A restoration test succeeds before pilot use and at the planned maintenance interval. |
| T14 | Dashboard usability | Ask representative Health Centre staff to locate current conditions, active alerts, device status, and recent history on the Pi kiosk and a phone/desktop view. | Staff can interpret normal, warning, offline, and stale states without technical assistance. | Most participants complete the core tasks; feedback and any usability issues are recorded. |
| T15 | Alert response drill | Give staff a controlled temperature, offline-device, and fire-input test alert. | Staff follow the agreed escalation/contact procedure and record the action taken. | Responsible person and backup contact can demonstrate the agreed response process. |
| T16 | Performance and soak test | Run the simulator and/or connected nodes continuously for at least 24 hours at the planned 30–60 second reading interval. | The dashboard remains responsive, readings continue to be stored, and no repeated alert storm occurs. | No unexplained service stop, unacceptable data loss, or duplicate-alert pattern is found in the review. |
| T17 | Security and access | Attempt unauthorised API requests and verify that dashboard/public-display content contains no patient or private staff information. | Unauthorised requests are denied and only approved public data is visible. | No credentials appear in logs or source code, and no private/clinical data is displayed. |

## Evaluation measures

The pilot will be evaluated using the following evidence:

| Measure | Method | Evaluation question |
| --- | --- | --- |
| Sensor agreement | Comparison records against a trusted reference | Are the readings credible enough for the approved prototype use? |
| Data completeness | Compare expected versus stored readings during the soak test and pilot | Does the system capture readings consistently? |
| Alert correctness | Compare configured rules and test conditions with alert history | Are alerts triggered, resolved, and de-duplicated correctly? |
| Alert delay | Measure time from sustained test condition to visible/local notification | Does the system meet the Health Centre's approved alert-delay requirement? |
| Recovery capability | Results from Wi-Fi, power, device, and restore tests | Can the system return to service without losing critical records? |
| Dashboard usability | Staff task completion and feedback | Can staff understand the current condition and required response? |
| Operational suitability | Weekly review of uptime, false alerts, missing readings, and staff feedback | Is the prototype reliable enough to continue as a controlled pilot? |

## Pilot entry and completion criteria

The controlled pilot may begin only when the following are complete:

1. The Health Centre has approved the refrigerator limits, alert delay, escalation contacts, and manual fallback procedure.
2. Sensor comparison checks, wiring/enclosure checks, and Wi-Fi/power checks have passed for installed locations.
3. The high/low threshold, offline-device, Wi-Fi-recovery, Pi-restart, and backup-restore tests have passed.
4. A named responsible staff member and backup contact have completed an alert-response drill.
5. The fire-monitoring boundary has been documented and accepted: the prototype is not a certified fire alarm.

The pilot will be considered successful when the test records show correct data ingestion and alert
behaviour, staff can use the dashboard and response procedure, backups can be restored, and no
unresolved critical defect remains. Any failed test must be corrected and repeated before the
related function is relied upon in the pilot.

## Reporting

At the end of testing, the project team will prepare a short evaluation report containing:

- completed test-case results and evidence;
- calibration/comparison records for installed sensors;
- alert and outage test results;
- backup-and-restore evidence;
- dashboard usability feedback;
- unresolved limitations and recommended next steps; and
- confirmation that fire-safety work remains a separate qualified-vendor responsibility.
