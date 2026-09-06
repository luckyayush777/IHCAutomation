# Raspberry Pi Information Console Deployment

## Deployment role

The Raspberry Pi is the health-centre's dedicated information computer and local application host.
It serves the built dashboard and API, drives the reception monitor, receives readings from ESP32
nodes over the local network, and stores approved monitoring data in its local SQLite database
through the ORM. The initial field design uses ESP32 nodes at each refrigerator or room. A sensor
connected directly to the Pi can instead use the common driver registry and polling collector; both
paths use the same validated ingestion operation.

The public console contains sensor and operational status only. Do not store patient names,
appointments, diagnoses, phone numbers, or other clinical information in this application.

## Recommended hardware

- Raspberry Pi 5, 8 GB preferred (4 GB is sufficient for a display-only pilot)
- official 27 W USB-C power supply
- actively cooled Pi 5 case or official Active Cooler plus enclosure
- 128 GB or larger high-endurance storage; an NVMe SSD and compatible HAT are preferred for an
  always-on installation
- micro-HDMI to HDMI cable
- existing HDMI monitor or a 22–24 inch monitor
- keyboard and mouse for setup and maintenance
- small UPS with safe shutdown support if outages are common
- wired Ethernet where possible; otherwise verified 2.4/5 GHz Wi-Fi coverage

Raspberry Pi recommends its 27 W supply for Pi 5 and active cooling for sustained workloads. The Pi
5 provides a real-time clock, but the optional RTC battery or reliable network time is needed to keep
schedule time accurate across disconnected power cycles.

## Operating-system preparation

1. Install current Raspberry Pi OS 64-bit Desktop with Raspberry Pi Imager.
2. Create a non-default administrator account and apply all OS updates.
3. Set the timezone to `Asia/Kolkata` and enable automatic time synchronization.
4. Install Node.js 22 LTS or newer, npm, Git, Chromium, and curl.
5. Create the service account and application location:

   ```bash
   sudo useradd --system --create-home --shell /usr/sbin/nologin ihc
   sudo mkdir -p /opt/ihc-automation/logs
   sudo chown -R ihc:ihc /opt/ihc-automation
   ```

6. Copy or clone this repository into `/opt/ihc-automation`, then install and build it:

   ```bash
   cd /opt/ihc-automation
   sudo -u ihc npm ci
   sudo -u ihc npm run build
   ```

## Service configuration

Copy the example environment file and fill in the real values locally. Never commit the completed
file or expose the device-ingestion or administrator credentials on the screen.

```bash
sudo cp deploy/raspberry-pi/ihc-console.env.example /etc/ihc-console.env
sudo chmod 600 /etc/ihc-console.env
sudoedit /etc/ihc-console.env
sudo cp deploy/raspberry-pi/ihc-console.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ihc-console.service
curl http://127.0.0.1:4000/health
```

The production API serves the compiled dashboard at `http://127.0.0.1:4000`. ESP32 nodes use the
Pi's reserved LAN address and `POST /api/v1/readings`; reserve that address in the router rather than
hard-coding an address that DHCP may change.

## Kiosk startup

Make the launcher executable and install the desktop autostart entry for the logged-in kiosk user:

```bash
sudo chmod 755 /opt/ihc-automation/deploy/raspberry-pi/launch-kiosk.sh
mkdir -p ~/.config/autostart
cp /opt/ihc-automation/deploy/raspberry-pi/ihc-kiosk.desktop ~/.config/autostart/
```

Configure Raspberry Pi OS to log into a dedicated unprivileged kiosk account, disable screen
blanking for that account, and reboot. Keep an administrator account separate for maintenance.

## Reliability and security checklist

- Use Ethernet or complete an on-site Wi-Fi test at all six sensor locations.
- Restrict port 4000 to the institute LAN with the host firewall; do not port-forward it publicly.
- Use a long unique `SIMULATOR_DEVICE_KEY` and rotate it if a device is lost.
- Keep `/etc/ihc-console.env` readable only by root and the service process.
- Enable unattended security updates and schedule monthly application/OS maintenance.
- Back up the local SQLite database to encrypted institute-controlled storage and test restoration.
- Test cold boot, loss of internet, loss of Wi-Fi, and restoration after power failure.
- Confirm that the cached screen is visibly labelled `Offline copy` when fresh data is unavailable.
- Arrange a manual reception fallback notice for extended downtime.

## Updating the application

Run updates during an announced maintenance window:

```bash
cd /opt/ihc-automation
sudo -u ihc git pull --ff-only
sudo -u ihc npm ci
sudo -u ihc npm run check
sudo systemctl restart ihc-console.service
```

After each update, verify `/health`, the public screen, one test sensor reading, and the offline cache
before returning the console to service.
