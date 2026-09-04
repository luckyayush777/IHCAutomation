# Institute Health Centre Automation: Proposal Checklist

Use this as the writing order for the full project proposal. Complete each section, then do a
final consistency check so that the hardware, budget, diagrams, and database design all describe
the same system.

1. **Title page**  
   Add the project title, name, roll number, supervisor, department, and submission date.

2. **Abstract / executive summary**  
   Summarise the problem, proposed monitoring system, main hardware, and expected outcome in one
   short paragraph.

3. **Problem statement**  
   Explain the risk of improper medicine storage and the absence of timely fire-related alerts.

4. **Proposed solution**  
   Describe the IoT monitoring system, dashboard, local alerts, and recorded history.

5. **Objectives**  
   State the temperature, humidity, fire-condition, alerting, and record-keeping objectives.

6. **Scope of the project**  
   Define what the prototype includes: sensors, ESP32 nodes, two Raspberry Pi 3 units, dashboard,
   local database, and alerts.

7. **Out-of-scope items**  
   Clearly exclude certified fire-alarm replacement, automatic fire suppression, medical records,
   refrigerator repair/control, and institute-wide deployment.

8. **Technology and hardware overview**  
   Briefly explain the Raspberry Pi 3, ESP32, PT100 with MAX31865, SHT40, local SQLite database,
   Prisma ORM, dashboard, and prototype fire-input component.

9. **Requirements**  
   Include functional requirements, hardware requirements, and non-functional requirements.

10. **System architecture diagram**  
    Show sensors connected to ESP32 nodes, the API/dashboard on the primary Pi, the local ORM and
    SQLite database, alerts, and the secondary Pi as a standby/recovery unit.

11. **DFD Level 0**  
    Show the system as one process interacting with sensor nodes, Health Centre staff, and the
    local database.

12. **DFD Level 1**  
    Break the system into data ingestion, validation/storage, rule evaluation/alerting, and
    dashboard display.

13. **Use cases / user stories**  
    Cover viewing current conditions, receiving an alert, reviewing history, configuring limits,
    and identifying an offline device.

14. **Class diagram**  
    Include `Device`, `Reading`, `AlertRule`, `Alert`, and `AlertEvaluationState` with their
    relationships.

15. **ER diagram and data design**  
    Show the local ORM database tables, primary/foreign-key relationships, key fields, and why
    readings, rules, and alerts are stored separately.

16. **Implementation plan**  
    Cover dashboard refinement, hardware setup, real-data integration, alert testing, reliability
    testing, performance/security testing, pilot feedback, and final installation cleanup.

17. **Testing and evaluation plan**  
    State how you will test sensor accuracy, dashboard usability, alert delay, Wi-Fi loss, power
    restart, device failure, backups, and response time.

18. **Budget / bill of materials**  
    Insert the prototype budget, include quantities and totals, state assumptions, and attach
    supplier-cart screenshots or quotations as annexures.

19. **Risks, limitations, deployment, and maintenance**  
    Address network failure, power loss, sensor calibration, false alerts, security, backup,
    responsible staff member, enclosure/cable installation, and the fire-safety boundary.

20. **Expected outcomes and references**  
    State the expected safety and monitoring improvements. Cite sensor datasheets, Raspberry Pi
    documentation, storage guidance used for thresholds, and supplier quotations. Append diagrams,
    bills, and quotations as annexures if required.

## Final consistency check

- Use **Raspberry Pi 3**, not Pi 5, everywhere.
- Use **SQLite through Prisma ORM** as the target database design; do not describe Supabase as the
  deployed database.
- Confirm whether the final sensor-node controller is **ESP32** or ESP8266 and use one name
  consistently.
- If PT100 probes are used, include one **MAX31865** module for each probe.
- Describe prototype smoke/gas monitoring as an input for monitoring and alerts only, not as a
  certified fire-alarm replacement.
