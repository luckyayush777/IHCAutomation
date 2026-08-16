const FRIDGE_MIN_C = 2;
const FRIDGE_MAX_C = 5;
const OFFLINE_AFTER_MS = 5 * 60 * 1000;

const deviceOrder = [
  'fridge_male_ward',
  'fridge_female_ward',
  'doctors_room',
  'monitoring_room',
  'male_ward',
  'female_ward',
];

const metricUnits = {
  temperature: 'C',
  humidity: '% RH',
  smoke: 'ppm',
  detector_alarm: '',
};

function byDeviceOrder(left, right) {
  const leftIndex = deviceOrder.indexOf(left.device_code);
  const rightIndex = deviceOrder.indexOf(right.device_code);

  return (leftIndex === -1 ? 99 : leftIndex) - (rightIndex === -1 ? 99 : rightIndex);
}

function formatTime(value) {
  if (!value) return 'No readings yet';

  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));
}

function isOffline(device, generatedAt) {
  if (device.status !== 'online' || !device.last_seen_at) return true;

  return (
    new Date(generatedAt).getTime() - new Date(device.last_seen_at).getTime() > OFFLINE_AFTER_MS
  );
}

export function formatReading(reading) {
  if (!reading) return '--';

  if (reading.metric === 'detector_alarm') {
    return Number(reading.value) === 1 ? 'Alarm' : 'Clear';
  }

  return `${Number(reading.value).toFixed(reading.metric === 'smoke' ? 0 : 1)} ${metricUnits[reading.metric]}`;
}

export function buildDashboardModel(snapshot) {
  const latestByDevice = new Map();

  for (const reading of snapshot.readings) {
    const deviceMetrics = latestByDevice.get(reading.device_id) ?? {};

    if (!deviceMetrics[reading.metric]) {
      deviceMetrics[reading.metric] = reading;
    }

    latestByDevice.set(reading.device_id, deviceMetrics);
  }

  const activeAlerts = snapshot.alerts.filter((alert) => alert.status === 'active');
  const activeAlertDeviceIds = new Set(activeAlerts.map((alert) => alert.device_id));

  const devices = [...snapshot.devices].sort(byDeviceOrder).map((device) => {
    const latest = latestByDevice.get(device.id) ?? {};
    const offline = isOffline(device, snapshot.generatedAt);
    const fridgeTemperature = latest.temperature?.value;
    const fridgeOutOfRange =
      device.device_type === 'fridge_probe' &&
      typeof fridgeTemperature === 'number' &&
      (fridgeTemperature < FRIDGE_MIN_C || fridgeTemperature > FRIDGE_MAX_C);
    const hasAlert = activeAlertDeviceIds.has(device.id);

    let statusKind = 'online';
    let statusLabel = 'Normal';

    if (offline) {
      statusKind = 'offline';
      statusLabel = 'Offline';
    } else if (hasAlert || fridgeOutOfRange) {
      statusKind = 'alert';
      statusLabel = 'Attention';
    }

    return {
      ...device,
      latest,
      lastSeenLabel: formatTime(device.last_seen_at),
      primaryReading:
        device.device_type === 'fridge_probe'
          ? formatReading(latest.temperature)
          : formatReading(latest.temperature),
      secondaryReading:
        device.device_type === 'fridge_probe'
          ? 'Allowed 2.0 to 5.0 C'
          : `Humidity ${formatReading(latest.humidity)}`,
      statusKind,
      statusLabel,
    };
  });

  const trendReadings = snapshot.readings
    .filter((reading) => reading.metric === 'temperature' || reading.metric === 'humidity')
    .slice()
    .sort((left, right) => Date.parse(left.recorded_at) - Date.parse(right.recorded_at));

  return {
    generatedAt: snapshot.generatedAt,
    refreshedLabel: formatTime(snapshot.generatedAt),
    devices,
    activeAlerts,
    recentAlerts: snapshot.alerts.slice(0, 8),
    trendReadings,
    summary: {
      online: devices.filter((device) => device.statusKind === 'online').length,
      alert: devices.filter((device) => device.statusKind === 'alert').length,
      offline: devices.filter((device) => device.statusKind === 'offline').length,
      activeAlerts: activeAlerts.length,
    },
  };
}
