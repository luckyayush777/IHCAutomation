# Minimal Hardware Bill of Materials

## Purpose and Scope

This bill of materials covers a beginner-friendly IoT demonstration for six planned locations:

- two refrigerator-monitoring nodes; and
- four room-monitoring nodes.

Each location uses an ESP32 Wi-Fi controller to send readings to the application. The refrigerator nodes use a waterproof temperature probe. The room nodes use a combined temperature and humidity sensor.

This is an IoT monitoring prototype. It does **not** include a certified fire-detection system, fixed 230 V electrical work, or professional installation.

## Recommended Budget

Request **₹25,000** for the complete six-location IoT prototype. The expected parts and beginner-tool cost is about **₹21,000**; the remaining allowance covers price variation, delivery, failed parts, and small site-specific items.

| Item | Quantity | Estimated cost |
| --- | ---: | ---: |
| ESP32 Wi-Fi development boards | 8: six installed nodes plus two spares | ₹4,400 |
| Waterproof DS18B20 refrigerator probes | 3: two installed plus one spare | ₹300 |
| SHT40 temperature/humidity sensors | 5: four installed plus one spare | ₹3,500 |
| 5 V USB power adapters and quality USB cables | 7 | ₹2,800 |
| Active buzzers, LEDs, push-buttons, and resistors | 6 sets | ₹900 |
| Perfboard, terminal blocks, connectors, wire, and heat-shrink | 6 sets | ₹2,400 |
| Ventilated plastic enclosures, labels, cable glands, and mounting parts | 6 | ₹2,100 |
| Breadboard and jumper-wire kit for learning and testing | 1 kit | ₹800 |
| Basic soldering iron, solder, side cutter, and multimeter | 1 kit | ₹2,000 |
| Delivery, failed components, and miscellaneous contingency | — | ₹1,800 |
| **Expected total** |  | **₹21,000** |

## Why These Quantities

- **Six active ESP32 boards:** one for each refrigerator or room. The two additional boards prevent a failed board from stopping the demonstration.
- **Three refrigerator probes:** two are installed; one is retained as a spare for testing or replacement.
- **Five SHT40 sensors:** four are installed; one is retained as a spare.
- **Tools and a breadboard:** these are included because this is a first electronics build. They make it possible to learn and test before soldering the final nodes.
- **Enclosures and installation materials:** loose breadboards and jumper wires are suitable for learning only. Installed nodes need enclosed, labelled, strain-relieved wiring.

## Purchase in Two Stages

Do not buy and install all six nodes before proving one of each design.

### Stage 1: learning build — ₹6,000–₹7,000

Buy two ESP32 boards, one DS18B20 probe, one SHT40 sensor, two power supplies/cables, a breadboard/jumper kit, buzzer/LED parts, and the basic tools.

Build and test:

1. one refrigerator node;
2. one room node;
3. Wi-Fi connection and HTTPS upload to the ingestion API;
4. a local test alert; and
5. recovery after Wi-Fi or power loss.

### Stage 2: complete the six-location demonstration — about ₹14,000–₹15,000 more

Once the two learning nodes work reliably, purchase the remaining controllers, sensors, power supplies, enclosures, spare parts, and installation materials.

## Later Refrigerator Upgrade

The DS18B20 is appropriate for learning and demonstration. If the institute requires stronger temperature assurance for the 2–5°C refrigerator range, replace the two installed probes with three-wire PT100 probes and MAX31865 interface boards.

| Upgrade item | Quantity | Estimated additional cost |
| --- | ---: | ---: |
| Three-wire PT100 probes | 2 | ₹1,800–₹3,000 |
| MAX31865 interface boards | 2 | ₹800–₹1,500 |
| Better connectors, cable mounting, and strain relief | 2 sets | ₹500–₹1,500 |
| Calibration or comparison against a trusted reference | 2 probes | Obtain local quote |

Allow **₹4,500–₹6,500 plus calibration** for this upgrade. The resulting non-fire IoT pilot is expected to cost about **₹26,000–₹28,000**.

## Fire-Detection Boundary

Do not use an MQ-2 hobby gas/smoke module as operational fire protection. It may be used only on a desk to demonstrate an input and an alert.

Certified smoke/heat detectors, sounders, backup power, wiring, commissioning, and any relay/dry-contact integration must be designed and installed by a qualified fire-safety vendor. Keep this as a separate quote. A provisional allowance of **₹40,000–₹1,00,000** is appropriate until a site survey and vendor design are available.

## Reference Prices

The following listings informed the planning allowances; prices and availability will change:

- ESP32 example: ₹448 including GST: <https://stg.robu.in/product/black-diy-kit-electronic-esp32-devkitc-core-boardesp32-development-doard-esp32-wroom-32u-for-arduino%EF%BC%88esp32-wroom-32u%EF%BC%89/>
- DS18B20 waterproof probe example: ₹64: <https://robocraze.com/products/ds18b20-waterproof-digital-thermometer-sensor-probe>
- SHT40 breakout example: ₹695.02 including GST: <https://www.thingbits.in/products/adafruit-sht40-sensirion-temp-humidity-sensor-stemma-qt-qwiic>

