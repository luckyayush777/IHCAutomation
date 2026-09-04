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

function latestReadingsByDevice(readings) {
  const latestByDevice = new Map();

  for (const reading of readings) {
    const deviceMetrics = latestByDevice.get(reading.device_id) ?? {};

    if (!deviceMetrics[reading.metric]) {
      deviceMetrics[reading.metric] = reading;
    }

    latestByDevice.set(reading.device_id, deviceMetrics);
  }

  return latestByDevice;
}

function thresholdStatus(reading, rule) {
  if (!reading) return { risk: 0.12, status: 'unknown', statusLabel: 'No reading' };
  if (!rule) return { risk: 0.18, status: 'unknown', statusLabel: 'No limit set' };

  const value = Number(reading.value);
  const minimum = rule.minimum_value == null ? null : Number(rule.minimum_value);
  const maximum = rule.maximum_value == null ? null : Number(rule.maximum_value);
  const outsideMinimum = minimum != null && value < minimum;
  const outsideMaximum = maximum != null && value > maximum;

  if (outsideMinimum || outsideMaximum) {
    const reference =
      minimum != null && maximum != null
        ? Math.max(maximum - minimum, 1)
        : Math.max(Math.abs(outsideMinimum ? minimum : maximum), 1);
    const distance = outsideMinimum ? minimum - value : value - maximum;
    return {
      risk: Math.min(1, 0.8 + (distance / reference) * 0.2),
      status: 'danger',
      statusLabel: outsideMinimum ? 'Too low' : 'Too high',
    };
  }

  let closeness = 0;
  if (minimum != null && maximum != null && maximum > minimum) {
    const position = (value - minimum) / (maximum - minimum);
    closeness = Math.abs(position - 0.5) * 2;
  } else if (maximum != null && maximum !== 0) {
    closeness = Math.max(0, value / maximum);
  } else if (minimum != null && value !== 0) {
    closeness = Math.max(0, minimum / value);
  }

  if (closeness >= 0.8) {
    return {
      risk: 0.5 + (Math.min(closeness, 1) - 0.8) * 0.5,
      status: 'caution',
      statusLabel: 'Near limit',
    };
  }

  return {
    risk: 0.16 + Math.min(closeness, 0.8) * 0.16,
    status: 'safe',
    statusLabel: 'Safe',
  };
}

function ruleFor(snapshot, device, metric) {
  const configured = snapshot.alertRules.find(
    (rule) => rule.device_id === device.id && rule.metric === metric && rule.enabled !== false,
  );
  if (configured) return configured;

  if (metric === 'temperature' && device.device_type === 'fridge_probe') {
    return { minimum_value: FRIDGE_MIN_C, maximum_value: FRIDGE_MAX_C };
  }

  return null;
}

function metricModel(snapshot, device, metric, label, latest, activeRuleIds) {
  const rule = ruleFor(snapshot, device, metric);
  const result = thresholdStatus(latest[metric], rule);
  const activeForMetric = snapshot.alertRules.some(
    (candidate) =>
      candidate.device_id === device.id &&
      candidate.metric === metric &&
      activeRuleIds.has(candidate.id),
  );

  return {
    id: metric,
    label,
    reading: formatReading(latest[metric]),
    source: device.name,
    ...result,
    ...(activeForMetric ? { risk: 0.95, status: 'danger', statusLabel: 'Alert active' } : {}),
  };
}

function metricsForDevice(snapshot, device, latestByDevice, activeRuleIds) {
  const latest = latestByDevice.get(device.id) ?? {};
  const smokeAlarm = Number(latest.detector_alarm?.value) === 1;
  const detectorRuleActive = snapshot.alertRules.some(
    (rule) =>
      rule.device_id === device.id &&
      rule.metric === 'detector_alarm' &&
      activeRuleIds.has(rule.id),
  );
  const hasDetectorReading = latest.detector_alarm != null;
  const smokeReading = latest.smoke
    ? formatReading(latest.smoke)
    : hasDetectorReading
      ? 'Clear'
      : '--';
  const offline = isOffline(device, snapshot.generatedAt);

  return [
    metricModel(snapshot, device, 'temperature', 'Temperature', latest, activeRuleIds),
    metricModel(snapshot, device, 'humidity', 'Humidity', latest, activeRuleIds),
    {
      id: 'smoke',
      label: 'Smoke',
      reading: smokeAlarm ? 'Alarm' : smokeReading,
      source: device.name,
      risk: smokeAlarm || detectorRuleActive ? 0.98 : hasDetectorReading ? 0.25 : 0.12,
      status: smokeAlarm || detectorRuleActive ? 'danger' : hasDetectorReading ? 'safe' : 'unknown',
      statusLabel:
        smokeAlarm || detectorRuleActive
          ? 'Smoke alarm'
          : hasDetectorReading
            ? 'Clear'
            : 'No reading',
    },
    {
      id: 'connection',
      label: 'Connection',
      reading: offline ? 'Offline' : 'Online',
      source: device.name,
      risk: offline ? 0.9 : 0.22,
      status: offline ? 'danger' : 'safe',
      statusLabel: offline ? 'Check device' : 'Connected',
    },
  ];
}

const statusPriority = { unknown: 0, safe: 1, caution: 2, danger: 3 };

export function buildSafetyWheelModel(snapshot, deviceCode) {
  const dashboard = buildDashboardModel(snapshot);
  const selectedDevices = deviceCode
    ? dashboard.devices.filter((device) => device.device_code === deviceCode)
    : dashboard.devices;
  const activeRuleIds = new Set(
    snapshot.alerts.filter((alert) => alert.status === 'active').map((alert) => alert.rule_id),
  );
  const latestByDevice = latestReadingsByDevice(snapshot.readings);
  const deviceMetrics = selectedDevices.map((device) =>
    metricsForDevice(snapshot, device, latestByDevice, activeRuleIds),
  );
  const metricIds = ['temperature', 'humidity', 'smoke', 'connection'];
  const metrics = metricIds.map((metricId) => {
    const candidates = deviceMetrics.map((items) => items.find((item) => item.id === metricId));
    return candidates
      .filter(Boolean)
      .sort(
        (left, right) =>
          statusPriority[right.status] - statusPriority[left.status] || right.risk - left.risk,
      )[0];
  });
  const knownMetrics = metrics.filter(Boolean);
  const dangerMetric = knownMetrics.find((metric) => metric.status === 'danger');
  const cautionMetric = knownMetrics.find((metric) => metric.status === 'caution');
  const selectedDevice = selectedDevices[0];
  const title = selectedDevice?.name ?? 'Whole facility';

  let status = 'safe';
  let headline = 'All monitored conditions look normal';
  let message = deviceCode
    ? 'No configured limit has been crossed for this device.'
    : 'No configured limit has been crossed across the facility.';

  if (!knownMetrics.length) {
    status = 'unknown';
    headline = 'Waiting for sensor data';
    message = 'No devices are available yet.';
  } else if (dangerMetric) {
    status = 'danger';
    headline = dangerMetric.id === 'smoke' ? 'Smoke alarm — act immediately' : 'Attention needed';
    message = `${dangerMetric.label}: ${dangerMetric.statusLabel} at ${dangerMetric.source}.`;
  } else if (cautionMetric) {
    status = 'caution';
    headline = 'A reading is close to its limit';
    message = `${cautionMetric.label} is nearing its configured limit at ${cautionMetric.source}.`;
  }

  return { title, status, headline, message, metrics: knownMetrics };
}

export function formatReading(reading) {
  if (!reading) return '--';

  if (reading.metric === 'detector_alarm') {
    return Number(reading.value) === 1 ? 'Alarm' : 'Clear';
  }

  return `${Number(reading.value).toFixed(reading.metric === 'smoke' ? 0 : 1)} ${metricUnits[reading.metric]}`;
}

export function buildDashboardModel(snapshot) {
  const latestByDevice = latestReadingsByDevice(snapshot.readings);

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
