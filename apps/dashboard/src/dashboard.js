import Chart from 'chart.js/auto';

import { buildDashboardModel, buildSafetyWheelModel, formatReading } from './dashboardData.js';
import './styles.css';

const apiUrl =
  import.meta.env.VITE_API_URL ??
  (window.location.port === '4000' ? window.location.origin : 'http://localhost:4000');
const dashboardEndpoint = `${apiUrl}/api/v1/dashboard`;
const refreshIntervalMs = 10_000;
const snapshotCacheKey = 'ihc-dashboard-snapshot-v1';
const elements = {
  activeAlerts: document.querySelector('[data-active-alerts]'),
  alertList: document.querySelector('[data-alert-list]'),
  customRangeForm: document.querySelector('[data-custom-range-form]'),
  detailSummary: document.querySelector('[data-detail-summary]'),
  detailTitle: document.querySelector('[data-detail-title]'),
  detailedView: document.querySelector('[data-detailed-view]'),
  detailToggle: document.querySelector('[data-detail-toggle]'),
  deviceGrid: document.querySelector('[data-device-grid]'),
  errorBanner: document.querySelector('[data-error-banner]'),
  lastUpdated: document.querySelector('[data-last-updated]'),
  loadingBanner: document.querySelector('[data-loading-banner]'),
  locationSelector: document.querySelector('[data-location-selector]'),
  offlineCount: document.querySelector('[data-offline-count]'),
  onlineCount: document.querySelector('[data-online-count]'),
  plainMetrics: document.querySelector('[data-plain-metrics]'),
  rangeControls: document.querySelector('.range-controls'),
  serviceState: document.querySelector('[data-service-state]'),
  safetyHeadline: document.querySelector('[data-safety-headline]'),
  safetyMessage: document.querySelector('[data-safety-message]'),
  safetyState: document.querySelector('[data-safety-state]'),
  consoleClock: document.querySelector('[data-console-clock]'),
  wheelCentre: document.querySelector('[data-wheel-centre]'),
  wheelCentreLabel: document.querySelector('[data-wheel-centre-label]'),
  wheelCentreLocation: document.querySelector('[data-wheel-centre-location]'),
  wheelDescription: document.querySelector('[data-wheel-description]'),
  wheelMarkers: document.querySelector('[data-wheel-markers]'),
  wheelTitle: document.querySelector('[data-wheel-title]'),
};
const chartContext = document.querySelector('#trend-chart');
let trendChart;
let overviewModel;
let latestSnapshot;
let selectedDeviceCode;
let selectedWheelDeviceCode = null;
let selectedRange = { hours: 24 };

function setText(element, value) {
  if (element) element.textContent = value;
}
function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character],
  );
}
function rangeQuery() {
  const params = new URLSearchParams();
  if (selectedRange.hours)
    params.set('from', new Date(Date.now() - selectedRange.hours * 3_600_000).toISOString());
  else {
    params.set('from', selectedRange.from);
    params.set('to', selectedRange.to);
  }
  return params;
}
async function fetchSnapshot(deviceCode) {
  const params = rangeQuery();
  if (deviceCode) params.set('deviceCode', deviceCode);
  const response = await fetch(`${dashboardEndpoint}?${params}`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Dashboard API returned ${response.status}`);
  const snapshot = await response.json();
  if (!deviceCode) localStorage.setItem(snapshotCacheKey, JSON.stringify(snapshot));
  return snapshot;
}
function cachedSnapshot() {
  try {
    return JSON.parse(localStorage.getItem(snapshotCacheKey));
  } catch {
    return null;
  }
}

const wheelMetricPositions = {
  temperature: { angle: -90, shortLabel: 'T' },
  humidity: { angle: 0, shortLabel: 'H' },
  smoke: { angle: 90, shortLabel: 'S' },
  connection: { angle: 180, shortLabel: 'C' },
};

function markerPosition(metric) {
  const position = wheelMetricPositions[metric.id];
  const radius = 55 + Math.max(0, Math.min(1, metric.risk)) * 110;
  const radians = (position.angle * Math.PI) / 180;
  return {
    ...position,
    x: 220 + Math.cos(radians) * radius,
    y: 220 + Math.sin(radians) * radius,
  };
}

function renderLocationSelector(devices) {
  if (!elements.locationSelector) return;
  const options = [{ device_code: '', name: 'Whole facility' }, ...devices];
  elements.locationSelector.innerHTML = options
    .map((device) => {
      const selected = (device.device_code || null) === selectedWheelDeviceCode;
      return `<button type="button" data-wheel-device="${escapeHtml(device.device_code)}" class="${selected ? 'is-selected' : ''}" aria-pressed="${selected}">${escapeHtml(device.name)}</button>`;
    })
    .join('');
}

function renderSafetyWheel(snapshot) {
  const model = buildSafetyWheelModel(snapshot, selectedWheelDeviceCode);
  const statusLabels = {
    safe: 'SAFE',
    caution: 'CAUTION',
    danger: model.metrics.some((metric) => metric.id === 'smoke' && metric.status === 'danger')
      ? 'ALARM'
      : 'CHECK',
    unknown: 'WAITING',
  };
  const readableStatus = {
    safe: 'Conditions normal',
    caution: 'Close to a limit',
    danger: 'Action required',
    unknown: 'Status unavailable',
  };

  setText(elements.wheelTitle, `${model.title}: ${readableStatus[model.status]}`);
  setText(elements.wheelDescription, model.message);
  setText(elements.wheelCentreLabel, statusLabels[model.status]);
  setText(elements.wheelCentreLocation, model.title);
  setText(elements.safetyState, readableStatus[model.status]);
  setText(elements.safetyHeadline, model.headline);
  setText(elements.safetyMessage, model.message);
  elements.wheelCentre.className = `wheel-centre is-${model.status}`;
  elements.safetyState.className = `safety-state is-${model.status}`;

  elements.wheelMarkers.innerHTML = model.metrics
    .map((metric) => {
      const position = markerPosition(metric);
      return `<g class="wheel-marker is-${escapeHtml(metric.status)}" transform="translate(${position.x.toFixed(1)} ${position.y.toFixed(1)})">
        <title>${escapeHtml(metric.label)}: ${escapeHtml(metric.reading)}, ${escapeHtml(metric.statusLabel)}</title>
        <circle r="17"></circle>
        <text y="1" text-anchor="middle" dominant-baseline="middle">${position.shortLabel}</text>
      </g>`;
    })
    .join('');

  elements.plainMetrics.innerHTML = model.metrics
    .map(
      (metric) => `<article class="plain-metric is-${escapeHtml(metric.status)}">
        <span class="plain-metric__dot" aria-hidden="true"></span>
        <div><strong>${escapeHtml(metric.label)}</strong><small>${escapeHtml(metric.source)}</small></div>
        <div class="plain-metric__reading"><strong>${escapeHtml(metric.reading)}</strong><small>${escapeHtml(metric.statusLabel)}</small></div>
      </article>`,
    )
    .join('');
}

function renderOverview(snapshot, isCached = false) {
  latestSnapshot = snapshot;
  overviewModel = buildDashboardModel(snapshot);
  selectedDeviceCode ??= overviewModel.devices[0]?.device_code;
  if (
    selectedWheelDeviceCode &&
    !overviewModel.devices.some((device) => device.device_code === selectedWheelDeviceCode)
  )
    selectedWheelDeviceCode = null;
  setText(elements.onlineCount, String(overviewModel.summary.online));
  setText(elements.offlineCount, String(overviewModel.summary.offline));
  setText(elements.activeAlerts, String(overviewModel.summary.activeAlerts));
  setText(
    elements.lastUpdated,
    `${isCached ? 'Offline copy from' : 'Updated'} ${overviewModel.refreshedLabel}`,
  );
  setText(
    elements.serviceState,
    isCached
      ? 'Offline copy'
      : overviewModel.summary.offline > 0 ||
          overviewModel.summary.alert > 0 ||
          overviewModel.summary.activeAlerts > 0
        ? 'Needs attention'
        : 'Monitoring live',
  );
  renderLocationSelector(overviewModel.devices);
  renderSafetyWheel(snapshot);
  renderDevices(overviewModel.devices);
}
function renderDevices(devices) {
  if (!elements.deviceGrid) return;
  if (!devices.length) {
    elements.deviceGrid.innerHTML = '<p class="empty-state">No devices are available.</p>';
    return;
  }
  elements.deviceGrid.innerHTML = devices
    .map(
      (device) => `
    <button class="device-card is-${device.statusKind} ${device.device_code === selectedDeviceCode ? 'is-selected' : ''}" data-device-code="${escapeHtml(device.device_code)}" type="button" aria-pressed="${device.device_code === selectedDeviceCode}">
      <span class="device-card__header"><span><strong>${escapeHtml(device.name)}</strong><small>${escapeHtml(device.location)}</small></span><span class="status-pill">${escapeHtml(device.statusLabel)}</span></span>
      <span class="primary-reading">${escapeHtml(device.primaryReading)}</span>
      <span class="device-card__meta"><span>${escapeHtml(device.secondaryReading)}</span><span>Last seen ${escapeHtml(device.lastSeenLabel)}</span></span>
      <span class="metric-list"><span><small>Temp</small><strong>${escapeHtml(formatReading(device.latest.temperature))}</strong></span><span><small>Humidity</small><strong>${escapeHtml(formatReading(device.latest.humidity))}</strong></span><span><small>Smoke</small><strong>${escapeHtml(formatReading(device.latest.smoke))}</strong></span><span><small>Alarm</small><strong>${escapeHtml(formatReading(device.latest.detector_alarm))}</strong></span></span>
    </button>`,
    )
    .join('');
}
function renderAlerts(alerts) {
  if (!elements.alertList) return;
  elements.alertList.innerHTML = alerts.length
    ? alerts
        .map(
          (alert) =>
            `<article class="alert-row"><div><strong>${escapeHtml(alert.message)}</strong><span>${escapeHtml(new Date(alert.triggered_at).toLocaleString())}</span></div><span>${escapeHtml(alert.status)}</span></article>`,
        )
        .join('')
    : '<p class="empty-state">No alerts for this device.</p>';
}
function readingStats(readings, metric) {
  const values = readings
    .filter((reading) => reading.metric === metric)
    .map((reading) => Number(reading.value));
  if (!values.length) return '--';
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return `${Math.min(...values).toFixed(1)} / ${average.toFixed(1)} / ${Math.max(...values).toFixed(1)}`;
}
function renderChart(readings) {
  if (!chartContext) return;
  const sorted = readings
    .filter((reading) => ['temperature', 'humidity'].includes(reading.metric))
    .slice()
    .sort((left, right) => Date.parse(left.recorded_at) - Date.parse(right.recorded_at));
  const labels = sorted.map((reading) =>
    new Date(reading.recorded_at).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
  );
  const valuesFor = (metric) =>
    sorted.map((reading) => (reading.metric === metric ? Number(reading.value) : null));
  const datasets = [
    {
      label: 'Temperature C',
      data: valuesFor('temperature'),
      borderColor: '#0f766e',
      backgroundColor: 'rgba(15, 118, 110, 0.12)',
      spanGaps: true,
      tension: 0.25,
    },
    {
      label: 'Humidity % RH',
      data: valuesFor('humidity'),
      borderColor: '#7c3aed',
      backgroundColor: 'rgba(124, 58, 237, 0.1)',
      spanGaps: true,
      tension: 0.25,
    },
  ];
  if (!trendChart)
    trendChart = new Chart(chartContext, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { boxWidth: 10, usePointStyle: true } } },
        scales: { x: { grid: { display: false } }, y: { beginAtZero: false } },
      },
    });
  else {
    trendChart.data.labels = labels;
    trendChart.data.datasets.forEach((dataset, index) => {
      dataset.data = datasets[index].data;
    });
    trendChart.update();
  }
}
function renderDetail(snapshot) {
  const model = buildDashboardModel(snapshot);
  const device = model.devices[0];
  if (!device) return;
  setText(elements.detailTitle, `${device.name} history`);
  const period = selectedRange.hours
    ? `Last ${selectedRange.hours === 168 ? '7 days' : `${selectedRange.hours} hour${selectedRange.hours === 1 ? '' : 's'}`}`
    : 'Custom period';
  elements.detailSummary.innerHTML = `<div><dt>Period</dt><dd>${period}</dd></div><div><dt>Current</dt><dd>${escapeHtml(device.primaryReading)}</dd></div><div><dt>Temperature min / avg / max</dt><dd>${readingStats(snapshot.readings, 'temperature')} C</dd></div><div><dt>${device.device_type === 'fridge_probe' ? 'Accepted range' : 'Humidity min / avg / max'}</dt><dd>${device.device_type === 'fridge_probe' ? '2.0 to 5.0 C' : `${readingStats(snapshot.readings, 'humidity')} % RH`}</dd></div>`;
  renderChart(snapshot.readings);
  renderAlerts(snapshot.alerts.filter((alert) => alert.device_id === device.id));
}
async function selectDevice(deviceCode) {
  selectedDeviceCode = deviceCode;
  renderDevices(overviewModel?.devices ?? []);
  try {
    renderDetail(await fetchSnapshot(deviceCode));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Dashboard detail refresh failed');
    setText(elements.serviceState, 'API unreachable');
  }
}
async function refreshDashboard() {
  elements.loadingBanner?.removeAttribute('hidden');
  try {
    renderOverview(await fetchSnapshot());
    elements.errorBanner?.setAttribute('hidden', '');
    if (!elements.detailedView?.hidden && selectedDeviceCode)
      await selectDevice(selectedDeviceCode);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Dashboard refresh failed');
    elements.errorBanner?.removeAttribute('hidden');
    const cached = cachedSnapshot();
    if (cached) renderOverview(cached, true);
    else setText(elements.serviceState, 'API unreachable');
  } finally {
    elements.loadingBanner?.setAttribute('hidden', '');
  }
}
elements.locationSelector?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-wheel-device]');
  if (!button || !latestSnapshot) return;
  selectedWheelDeviceCode = button.dataset.wheelDevice || null;
  if (selectedWheelDeviceCode) selectedDeviceCode = selectedWheelDeviceCode;
  renderLocationSelector(overviewModel?.devices ?? []);
  renderSafetyWheel(latestSnapshot);
  renderDevices(overviewModel?.devices ?? []);
});
elements.detailToggle?.addEventListener('click', () => {
  if (!elements.detailedView) return;
  const willOpen = elements.detailedView.hidden;
  elements.detailedView.hidden = !willOpen;
  elements.detailToggle.setAttribute('aria-expanded', String(willOpen));
  setText(elements.detailToggle, willOpen ? 'Hide detailed view' : 'Show detailed view');
  if (willOpen && selectedDeviceCode) void selectDevice(selectedDeviceCode);
});
elements.deviceGrid?.addEventListener('click', (event) => {
  const card = event.target.closest('[data-device-code]');
  if (card) {
    selectedWheelDeviceCode = card.dataset.deviceCode;
    if (latestSnapshot) {
      renderLocationSelector(overviewModel?.devices ?? []);
      renderSafetyWheel(latestSnapshot);
    }
    void selectDevice(card.dataset.deviceCode);
  }
});
elements.rangeControls?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-range-hours]');
  if (!button) return;
  selectedRange = { hours: Number(button.dataset.rangeHours) };
  elements.rangeControls
    .querySelectorAll('button')
    .forEach((item) => item.classList.toggle('is-selected', item === button));
  if (selectedDeviceCode) void selectDevice(selectedDeviceCode);
});
elements.customRangeForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  const form = new FormData(elements.customRangeForm);
  selectedRange = {
    from: new Date(form.get('from')).toISOString(),
    to: new Date(form.get('to')).toISOString(),
  };
  elements.rangeControls
    ?.querySelectorAll('button')
    .forEach((button) => button.classList.remove('is-selected'));
  if (selectedDeviceCode) void selectDevice(selectedDeviceCode);
});
function updateClock() {
  if (!elements.consoleClock) return;
  elements.consoleClock.dateTime = new Date().toISOString();
  elements.consoleClock.textContent = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date());
}
updateClock();
window.setInterval(updateClock, 1000);
void refreshDashboard();
window.setInterval(() => void refreshDashboard(), refreshIntervalMs);
