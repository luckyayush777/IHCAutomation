# Hardware and Budget Guide

## 1. The Short Answer

The professor's revised requirement adds a dedicated Raspberry Pi computer and reception display to
the sensor system. The Pi is a separate central console; it does not replace the ESP32 at each room
or refrigerator.

The earlier ₹1–2 lakh figure was a broad allowance for an operational six-location installation. It included custom IoT electronics, protective enclosures, power supplies, backup power, calibration, installation, spares, and a separate professionally designed fire-detection system.

Use these figures when speaking to the institute:

| Version                                  | Sensible planning budget | What it means                                                                             |
| ---------------------------------------- | -----------------------: | ----------------------------------------------------------------------------------------- |
| Learning build                           |            ₹3,000–₹5,000 | One refrigerator node and one room node on a desk                                         |
| Complete software/hardware demonstration |          ₹15,000–₹25,000 | Two refrigerator nodes and four room nodes using prototype sensors                        |
| Better-built IoT pilot                   |          ₹30,000–₹50,000 | Six enclosed, powered nodes with better fridge probes, spares, and installation materials |
| Pi 5 console, reusing a monitor          |          ₹29,000–₹43,000 | 8 GB Pi, storage, cooling, power, cable, controls, and UPS allowance                      |
| Pi 5 console with a new monitor          |          ₹36,000–₹55,000 | Complete reception computer and display                                                   |
| Certified fire detection                 |    Separate vendor quote | Life-safety equipment, sounders, wiring, installation, and approval                       |

For the revised immediate prototype, request **₹55,000–₹80,000** for the Pi console plus the six
prototype sensor nodes, depending on whether the institute already has a suitable monitor and UPS.
Make it clear that this still excludes a certified fire-alarm installation.

Prices in this document are approximate Indian retail prices checked in August 2026. Shipping, GST treatment, stock, cable length, enclosure quality, and the exact sensor brand can change the final amount.

## 2. What Each Piece Does

### Microcontroller: ESP32

The ESP32 is the small computer inside each monitoring box. It reads sensors, activates a buzzer, connects to Wi-Fi, and sends readings to your API.

You do not need a Raspberry Pi beside every sensor. Use one central Pi information computer and one
ESP32 per refrigerator or room.

Approximate price: **₹500–₹800 per development board**.

### Central computer: Raspberry Pi 5

Use a Raspberry Pi 5 with 8 GB RAM as the professor requested a computer that can run the kiosk and
basic desktop applications. A 4 GB model is adequate if it will only run the Node.js service and
browser display.

| Pi console item                                   | Quantity | Planning allowance |
| ------------------------------------------------- | -------: | -----------------: |
| Raspberry Pi 5, 8 GB                              |        1 |    ₹19,000–₹23,000 |
| Official 27 W USB-C supply                        |        1 |      ₹1,200–₹1,800 |
| Official fan case or Active Cooler plus enclosure |        1 |      ₹1,000–₹2,000 |
| 128–256 GB endurance storage or NVMe storage/HAT  |        1 |      ₹2,000–₹5,000 |
| Micro-HDMI cable, keyboard, and mouse             |    1 set |      ₹1,500–₹3,000 |
| Small UPS/safe-shutdown hardware                  |        1 |      ₹3,000–₹7,000 |
| Optional 22–24 inch HDMI monitor                  |        1 |     ₹7,000–₹12,000 |

The official Pi 5 specification recommends a high-quality 5 V/5 A supply, specifically the 27 W
USB-C supply, and active cooling is appropriate for an enclosed always-on computer. Prefer an SSD
or high-endurance media over a basic microSD card for the operational installation.

### Refrigerator probe

The probe is the metal-tipped cable placed inside the refrigerator.

There are two practical choices:

| Probe                               |     Approximate price | Use                                                             |
| ----------------------------------- | --------------------: | --------------------------------------------------------------- |
| Waterproof DS18B20                  |              ₹60–₹300 | Cheap and easy for learning and demonstrations                  |
| PT100 probe plus MAX31865 interface | ₹1,200–₹2,000 per set | Better candidate for the operational pilot and calibration work |

The DS18B20 is ideal for getting the software and wiring working. Do not assume a cheap uncalibrated probe is accurate enough for medicine storage simply because it displays decimal places.

A PT100 is a resistance-based probe. The ESP32 cannot conveniently read it directly, so a MAX31865 interface board converts the probe signal into a digital temperature value and detects broken or shorted probe wiring.

### Room humidity and temperature sensor

Use one **SHT40** board in each room node. It reports both humidity and room temperature, so a separate room-temperature sensor is unnecessary.

Approximate price: **₹600–₹800 each** for a reputable breakout board. The manufacturer's typical specifications are approximately ±1.8% RH and ±0.2°C.

### Smoke sensor

For a desk prototype, an **MQ-2 module** can generate smoke/gas readings and help demonstrate the dashboard and alert logic.

Approximate price: **₹90–₹150 each**.

An MQ-2 is not a certified fire detector. It reacts to several gases, needs warm-up and calibration, and must not be the only device protecting occupied rooms.

For the operational system, a qualified vendor should select approved smoke/heat detectors and local sounders. Ideally, the vendor's system supplies a relay or dry-contact alarm output that the ESP32 reads. The approved detector triggers the local alarm; the ESP32 only reports that event to Supabase and remote users.

### Buzzer

A small 5 V active buzzer is enough for a desk demonstration. It shows that the ESP32 can react locally when a threshold is crossed.

The final fire sounder is different: it must be an approved, adequately loud device powered and supervised as part of the fire system. A ₹50 hobby buzzer is not a building fire alarm.

### Power, wiring, and enclosure

Each installed node also needs:

- a safe USB or regulated low-voltage power adapter;
- a cable and connectors;
- soldered perfboard or a small PCB;
- a protective enclosure with ventilation around the humidity sensor;
- strain relief for the refrigerator cable;
- labels and mounting hardware.

These ordinary items often cost more in total than the ESP32 itself. Breadboards and loose jumper wires are appropriate on your desk, not for permanent installation.

### Beginner electrical rules

- ESP32 input/output pins use 3.3 V logic and should not receive a 5 V signal directly.
- Many MQ-2 modules use a 5 V supply and may produce a signal above 3.3 V. Use a correctly calculated voltage divider, level shifter, or suitable interface before connecting the signal to an ESP32 pin.
- A DS18B20 data wire normally needs an approximately 4.7 kΩ pull-up resistor to 3.3 V.
- Connect the ground of low-voltage modules together unless an intentionally isolated interface is being used.
- Disconnect power before changing wires.
- Check the exact pin labels and datasheet for the particular board purchased; low-cost boards do not all use identical layouts.
- Do not use a breadboard connection for an installed alarm or long-term refrigerator monitor.

## 3. Simple System Layout

### Refrigerator node: two copies

```text
Temperature probe
       |
       v
ESP32 ----> local buzzer/status light
  |
  | Wi-Fi + HTTPS
  v
API ----> Supabase ----> dashboard and notifications
```

For a PT100 probe, the MAX31865 board sits between the probe and ESP32.

### Room node: four copies

```text
SHT40 humidity/temperature ----\
                                > ESP32 ----> Supabase
MQ-2 for desk prototype -------/

Approved smoke/heat detector ----> approved local sounder
                 |
                 `---- relay output ----> ESP32 for remote reporting
```

## 4. First Purchase: Learn Before Buying Six Sets

Buy enough to build one refrigerator node and one room node first.

| Item                                         | Quantity |         Allowance |
| -------------------------------------------- | -------: | ----------------: |
| ESP32 development boards                     |        2 |     ₹1,200–₹1,600 |
| Waterproof DS18B20 probe                     |        1 |         ₹100–₹300 |
| SHT40 breakout board                         |        1 |         ₹600–₹800 |
| MQ-2 module for simulation only              |        1 |         ₹100–₹150 |
| Active buzzers and LEDs                      |   2 sets |         ₹100–₹250 |
| Breadboards and jumper wires                 |   2 sets |         ₹400–₹700 |
| USB cables and 5 V adapters                  |   2 sets |       ₹600–₹1,000 |
| Resistors, connectors, and small spare parts |    1 set |         ₹300–₹500 |
| **Expected first purchase**                  |          | **₹3,400–₹5,300** |

Do not buy all six node assemblies until these two nodes can:

1. read stable values;
2. display values over the ESP32 serial monitor;
3. connect to the available Wi-Fi;
4. send an HTTPS reading to the ingestion API;
5. activate the local buzzer during a test alert;
6. reconnect and resume reporting after Wi-Fi or power interruption.

## 5. Complete Demonstration Bill of Materials

This version is suitable for demonstrating all six locations. It is not a certified fire system.

| Item                                              | Quantity |     Estimated total |
| ------------------------------------------------- | -------: | ------------------: |
| ESP32 development boards                          |        6 |       ₹3,600–₹4,800 |
| Spare ESP32 boards                                |        2 |       ₹1,200–₹1,600 |
| DS18B20 refrigerator probes                       |        2 |           ₹200–₹600 |
| SHT40 room sensors                                |        4 |       ₹2,400–₹3,200 |
| MQ-2 modules for demonstration                    |        4 |           ₹400–₹600 |
| Small buzzers, LEDs, buttons, and resistors       |   6 sets |         ₹600–₹1,200 |
| Breadboards/perfboards, connectors, and wiring    |   6 sets |       ₹2,000–₹3,500 |
| 5 V power adapters and USB cables                 |   6 sets |       ₹1,800–₹3,000 |
| Basic prototype enclosures and mounting materials |        6 |       ₹2,000–₹4,000 |
| Shipping and contingency                          |          |       ₹1,500–₹2,500 |
| **Estimated demonstration total**                 |          | **₹15,700–₹25,000** |

You may be able to spend less by reusing adapters and purchasing generic boards. The upper value is healthier for an institute budget because it leaves room for failed parts, shipping, and connectors that are easily forgotten.

## 6. Upgrading the Refrigerator Nodes

Once the DS18B20 version works, compare it against a trusted thermometer. For the operational pilot, replace each cheap probe if needed with:

| Upgrade item                               | Quantity |      Estimated total |
| ------------------------------------------ | -------: | -------------------: |
| Three-wire PT100 probe                     |        2 |        ₹1,800–₹3,000 |
| MAX31865 interface board                   |        2 |          ₹800–₹1,500 |
| Better cable connectors and probe mounting |   2 sets |          ₹500–₹1,500 |
| Calibration/reference check                | 2 probes | Obtain a local quote |

This upgrade is still measured in thousands of rupees, not lakhs. The cost becomes larger when traceable calibration, a commercial data logger, installation labour, annual recalibration, or formal compliance documentation is required.

Because the required refrigerator range is only 2–5°C, the institute must decide the acceptable measurement error. A sensor with ±0.5°C uncertainty consumes a significant part of that three-degree operating band.

## 7. What the Fire-System Quote Covers

The following items are not microcontroller costs:

- approved smoke and/or heat detectors for four rooms;
- a control panel or approved standalone interconnected arrangement;
- local sounders and visual indicators;
- backup battery and supervised power supply;
- manual call points if required by the fire-safety design;
- fire-resistant cabling, conduits, and mounting;
- detector placement and coverage design;
- installation, testing, commissioning, and documentation;
- periodic inspection and maintenance.

This is why the earlier operational allowance became large. Since there is no existing fire system, the institute should request a separate fire-safety quote. Do not hide that cost inside an “IoT sensors” budget, and do not promise that four MQ-2 boards replace it.

## 8. Recommended Budget Wording

Use wording similar to this in the next meeting:

> The revised prototype budget requested is ₹55,000–₹80,000. It covers a Raspberry Pi 5 information
> computer, reception kiosk accessories, two refrigerator monitoring prototypes, four room
> monitoring prototypes, spare controllers, power supplies, enclosures, and development materials.
> The lower end assumes an existing monitor can be reused. It does not include certified fire-alarm
> equipment or professional installation, which require a separate assessment and vendor quotation.

If they only approve a learning prototype, request **₹5,000 initially**, demonstrate one refrigerator and one room, and then request the remaining amount with evidence from the working build.

## 9. Beginner Build Order

1. Install the ESP32 development tools and run a basic LED example.
2. Connect the DS18B20 and print refrigerator temperature readings.
3. Connect the SHT40 to the second ESP32 and print humidity and temperature.
4. Connect the MQ-2 on the bench and observe how its reading changes after warm-up.
5. Add a buzzer and trigger it from a deliberately low test threshold.
6. Connect each ESP32 to Wi-Fi.
7. Send a fixed JSON test reading to the API.
8. Replace the fixed value with the real sensor value.
9. Disconnect Wi-Fi and power to test recovery behavior.
10. Only then duplicate the circuits for two refrigerators and four rooms.

Avoid working directly with 230 V mains wiring. Use certified plug-in low-voltage adapters, and leave fixed electrical and fire-alarm wiring to qualified personnel.

## 10. Questions Needed Before Final Procurement

- What measurement error will the institute accept for refrigerator temperature?
- Does the probe need a calibration certificate or only comparison against a trusted reference?
- How long may a refrigerator remain outside 2–5°C before alarming?
- Are plug sockets available near both refrigerators and in all four rooms?
- Is 2.4 GHz Wi-Fi available and reliable at all six positions?
- Does the institute already use a fire-safety vendor?
- Does the budget need to include installation labour and annual maintenance?
- Are SMS and WhatsApp running charges part of the same budget?
- Can the health centre reuse an HDMI monitor, keyboard, mouse, and UPS?
- Is Ethernet available at the reception display, and can the Pi receive a reserved LAN address?
- Who will maintain the approved doctor roster and public availability hours?

## 11. Price and Specification References

- Raspberry Pi 5 official specifications: <https://www.raspberrypi.com/products/raspberry-pi-5/>
- Raspberry Pi 5 8 GB India listing, checked August 2026 at approximately ₹19,618: <https://www.thingbits.in/products/raspberry-pi-5-computer>
- Raspberry Pi 5 8 GB starter kit India listing, checked August 2026 at approximately ₹27,024: <https://robocraze.com/products/official-raspberry-pi-5-8gb-starter-kit>
- Official 27 W supply India listing, checked August 2026 at approximately ₹1,204: <https://robocraze.com/products/raspberry-pi-5-27w-usb-c-power-supply-black-colour>
- Raspberry Pi power documentation: <https://www.raspberrypi.com/documentation/hardware/raspberrypi/power.html>
- ESP32 development-board example, approximately ₹706: <https://robu.in/product-category/smartelex-wifi-and-bluetooth-module/>
- DS18B20 probe example, approximately ₹64: <https://robocraze.com/products/ds18b20-waterproof-digital-thermometer-sensor-probe>
- Longer DS18B20 probe example, approximately ₹305: <https://robocraze.com/products/ds18b20-digital-temperature-sensor-probe-with-3m-waterproof-cable-7semi>
- SHT40 breakout example, approximately ₹695 including GST: <https://www.thingbits.in/products/adafruit-sht40-sensirion-temp-humidity-sensor-stemma-qt-qwiic>
- SHT40 manufacturer specifications: <https://sensirion.com/products/catalog/SHT40>
- MQ-2 module example, approximately ₹96: <https://robocraze.com/products/mq-2-gas-sensor-module>
- MAX31865 interface example, approximately ₹389: <https://probots.co.in/max31865-pt100-pt1000-rtd-platinum-resistance-temperature-detector-module-sensor-amplifier.html>
- PT100 probe example, approximately ₹890 in quantity: <https://staging.probots.co.in/pt100-rtd-temperature-sensor-probe-150mm-2m-cable-m8.html>
- MAX31865 manufacturer specifications: <https://www.analog.com/en/products/max31865.html>
