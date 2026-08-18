const FRIDGE_MIN_C = 2;
const FRIDGE_MAX_C = 5;
const OFFLINE_AFTER_MS = 5 * 60 * 1000;
const DISPLAY_TIME_ZONE = 'Asia/Kolkata';
const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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

function timeToMinutes(value) {
  const [hours = 0, minutes = 0] = String(value).split(':').map(Number);
  return hours * 60 + minutes;
}

function zonedDateParts(value) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: DISPLAY_TIME_ZONE,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const part = (type) => parts.find((item) => item.type === type)?.value;
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(part('weekday'));
  return {
    weekday,
    minutes: Number(part('hour')) * 60 + Number(part('minute')),
    date: `${part('year')}-${part('month')}-${part('day')}`,
  };
}

function isWithinValidity(slot, date) {
  return (
    (!slot.valid_from || slot.valid_from <= date) && (!slot.valid_until || slot.valid_until >= date)
  );
}

function formatSlotTime(value) {
  return String(value).slice(0, 5);
}

function nextAvailability(slots, now) {
  const candidates = slots.filter((slot) => slot.availability_type !== 'unavailable');
  for (let offset = 0; offset < 7; offset += 1) {
    const weekday = (now.weekday + offset) % 7;
    const slot = candidates
      .filter((candidate) => candidate.weekday === weekday)
      .sort((left, right) => timeToMinutes(left.start_time) - timeToMinutes(right.start_time))
      .find((candidate) => offset > 0 || timeToMinutes(candidate.start_time) > now.minutes);
    if (slot) {
      const dayLabel = offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : weekdayNames[weekday];
      return `${dayLabel}, ${formatSlotTime(slot.start_time)}`;
    }
  }
  return 'No upcoming hours';
}

export function buildDoctorAvailabilityModel(snapshot) {
  const doctors = snapshot.doctors ?? [];
  const availability = snapshot.doctorAvailability ?? [];
  const now = zonedDateParts(snapshot.generatedAt);

  return doctors
    .filter((doctor) => doctor.is_active !== false)
    .sort(
      (left, right) =>
        Number(left.display_order) - Number(right.display_order) ||
        left.display_name.localeCompare(right.display_name),
    )
    .map((doctor) => {
      const slots = availability.filter(
        (slot) => slot.doctor_id === doctor.id && isWithinValidity(slot, now.date),
      );
      const currentSlots = slots.filter(
        (slot) =>
          slot.weekday === now.weekday &&
          timeToMinutes(slot.start_time) <= now.minutes &&
          timeToMinutes(slot.end_time) > now.minutes,
      );
      const current =
        currentSlots.find((slot) => slot.availability_type === 'unavailable') ?? currentSlots[0];
      const statusByType = {
        available: ['available', 'Available now'],
        on_call: ['on-call', 'On call'],
        appointment_only: ['appointment', 'By appointment'],
        unavailable: ['unavailable', 'Unavailable'],
      };
      const [availabilityKind, availabilityLabel] = current
        ? statusByType[current.availability_type]
        : ['unavailable', 'Not available now'];

      return {
        ...doctor,
        availabilityKind,
        availabilityLabel,
        scheduleLabel: current
          ? `${formatSlotTime(current.start_time)}–${formatSlotTime(current.end_time)}`
          : `Next: ${nextAvailability(slots, now)}`,
        note: current?.note ?? '',
      };
    });
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

  const doctors = buildDoctorAvailabilityModel(snapshot);

  return {
    generatedAt: snapshot.generatedAt,
    refreshedLabel: formatTime(snapshot.generatedAt),
    devices,
    activeAlerts,
    recentAlerts: snapshot.alerts.slice(0, 8),
    trendReadings,
    doctors,
    summary: {
      online: devices.filter((device) => device.statusKind === 'online').length,
      alert: devices.filter((device) => device.statusKind === 'alert').length,
      offline: devices.filter((device) => device.statusKind === 'offline').length,
      activeAlerts: activeAlerts.length,
      doctorsAvailable: doctors.filter((doctor) => doctor.availabilityKind === 'available').length,
    },
  };
}
