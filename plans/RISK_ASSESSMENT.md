# Institute Health Centre Automation: Risk Assessment

## Purpose and scope

This assessment covers the proposed Institute Health Centre monitoring prototype: a Raspberry Pi
3 local console, Wi-Fi sensor nodes, refrigerator temperature monitoring, room temperature and
humidity monitoring, dashboard, local database, and alerts. It covers project delivery and
operational risks during a controlled pilot. It does not certify the system for medical-device,
refrigeration-control, or fire-alarm use.

## Risk register

| ID | Risk and consequence | Owner |
| --- | --- | --- |
| R2 | Prototype DS18B20 probes may be inaccurate, drift, be poorly placed, or have damaged cables, causing false readings. | Technical team |
| R3 | Wi-Fi failure, weak coverage, or an API outage may stop live readings and alerts. | Technical team / Institute IT |
| R4 | Power loss or an unsafe shutdown may corrupt data or stop the Pi kiosk/API. | Technical team |
| R5 | Failure of the Raspberry Pi, microSD card, sensor node, or power supply may interrupt monitoring. | Technical team |
| R6 | False alerts or short refrigerator-door excursions may cause unnecessary escalation and alert fatigue. | Health Centre in-charge / Technical team |
| R7 | Staff may not see, understand, or act on an alert, especially outside normal hours. | Health Centre administration |
| R8 | Hobby smoke/gas components may be mistaken for a certified fire-detection system, delaying proper fire-safety work. | Institute administration / Fire-safety vendor |
| R9 | Unauthorised access to the dashboard, API, device credentials, or local database may expose data or permit fake readings. | Technical team / Institute IT |
| R10 | Invalid values, duplicate uploads, incorrect timestamps, or clock errors may create misleading trends and alert decisions. | Technical team |
| R11 | Storage failure, accidental deletion, or an untested restoration process may cause loss of local SQLite data. | Technical team / Institute IT |
| R12 | The dashboard may expose unapproved doctor information or be visible to unauthorised visitors. | Health Centre administration |
| R13 | Loose wiring, 5 V/3.3 V incompatibility, condensation, or unprotected electronics may cause unreliable operation or electrical damage. | Technical team |
| R15 | Conflicting hardware or deployment assumptions in proposal documents may cause unsuitable procurement or reviewer confusion. | Project lead |
| R16 | Scope may expand to SMS/WhatsApp, full fire integration, all locations, or clinical records before the core pilot is reliable. | Project lead / Health Centre administration |
