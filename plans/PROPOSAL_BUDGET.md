# Institute Health Centre Automation: Prototype Budget

## Purpose

This budget covers the first working prototype: two Raspberry Pi 3 units, two sensor-node
controllers, refrigerator temperature monitoring, room temperature/humidity monitoring, local
alerts, and the basic materials required to connect the setup to the existing dashboard.

It is intentionally a prototype budget. It does **not** include certified fire-alarm equipment,
fixed electrical work, professional installation, or a new display monitor.

## Raspberry Pi Console and Resilience Setup

| Item | Purpose | Quantity | Unit cost | Total |
| --- | --- | ---: | ---: | ---: |
| Raspberry Pi 3 Model B+ | Primary local console: dashboard, API, ORM, and SQLite database | 1 | ₹3,762 | ₹3,762 |
| Raspberry Pi 3 Model B+ | Secondary console for backup/recovery testing and display/standby use | 1 | ₹3,762 | ₹3,762 |
| 5 V / 2.5 A Pi power supply | Dedicated safe power supply for each Pi | 2 | ₹600* | ₹1,200 |
| Raspberry Pi 3 enclosure | Protects each Pi installation | 2 | ₹295* | ₹590 |
| 64 GB high-endurance microSD card | Operating system, application, and local data storage | 2 | ₹850* | ₹1,700 |
| HDMI cable, keyboard, and mouse | Shared setup and kiosk connection accessories | 1 set | ₹1,500* | ₹1,500 |
| Small UPS / safe-shutdown provision | Tests and mitigates short power interruptions | 1 | ₹3,500* | ₹3,500 |
| **Pi console subtotal** |  |  |  | **₹16,014** |

## Sensor-Node Prototype Parts

The following figures are taken from the current shopping list. They are sufficient for initial
bench testing of two refrigerator probes and two temperature/humidity sensors.

| Item | Purpose | Quantity | Unit cost | Total |
| --- | --- | ---: | ---: | ---: |
| GY-SHT40 temperature and humidity sensor | Room temperature and humidity monitoring | 2 | ₹219 | ₹438 |
| ESP8266 NodeMCU CP2102 board | Wi-Fi sensor-node prototype controller | 2 | ₹259 | ₹518 |
| DS18B20 waterproof temperature probe | Refrigerator temperature monitoring | 2 | ₹50 | ₹100 |
| MB102 power module, breadboard, and jumper-wire set | Bench prototyping | 1 | ₹269 | ₹269 |
| 5 V active buzzer | Local audible alert demonstration | 1 | ₹16 | ₹16 |
| 2N2222 NPN transistor | Buzzer/load switching | 50 | ₹2 | ₹100 |
| Assorted LED set | Status and alert indicators | 1 | ₹109 | ₹109 |
| Resistor kit | Pull-up, current limiting, and general prototyping | 1 | ₹299 | ₹299 |
| **Sensor-node subtotal** |  |  |  | **₹1,849** |

## Budget Summary

| Category | Amount |
| --- | ---: |
| Raspberry Pi console and resilience setup | ₹16,014 |
| Sensor-node prototype parts | ₹1,849 |
| Subtotal | ₹17,863 |
| Contingency (10%) | ₹1,786 |
| **Requested prototype budget** | **₹19,649** |

### Optional display provision

The budget assumes that the Health Centre's existing HDMI-compatible monitor will be reused. If a
new 22–24 inch monitor is needed, add an allowance of **₹8,000**, bringing the requested amount to
**₹27,649**.

## Important Procurement Notes

- The two Pi units are included deliberately: the first is the primary local system; the second is
  used for backup/recovery testing and can later act as a standby console. It is not intended that
  every sensor location receives a Raspberry Pi.
- The current cart has **ESP8266 NodeMCU** boards, while the technical design currently names
  **ESP32**. The NodeMCU boards are acceptable for early prototype work, but this choice must be
  made consistent before the final purchase and proposal submission. If ESP32 boards are selected,
  replace this line item with the final vendor quotation.
- A smoke/heat module and its wiring are not included in the present cart. A hobby module may be
  added only for demonstration of data ingestion and alerts; it must not be budgeted or described
  as a substitute for a certified fire-alarm system.
- The local SQLite database, Prisma ORM, API, and dashboard are software components and require no
  separate licence cost for this prototype.
- Prices are planning estimates. Obtain final supplier quotations before institute procurement.

## Price Basis

- Sensor-node items: current `plans/IHC_SHOPPING_LIST.csv` cart, total ₹1,849 before delivery or discounts.
- Raspberry Pi 3 Model B+: ₹3,762 including GST from the Robu product listing, checked August 2026.
- Pi case: ₹295 from a Raspberry Pi 3 Model B+ case listing. Other Pi accessories are conservative
  planning allowances and should be replaced with the selected vendor quotation.

## Exclusions and Future Cost

The following are outside this prototype request:

- certified smoke/heat detectors, control panel, sounders, backup battery, approved wiring, and
  professional commissioning;
- fixed 230 V electrical work and permanent installation labour;
- SMS/WhatsApp provider charges, if later required;
- traceable calibration or replacement of prototype DS18B20 probes with medical-grade or PT100
  probes; and
- expansion from the initial prototype to all six proposed monitoring locations.

