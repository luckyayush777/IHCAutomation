import Chart from 'chart.js/auto';

import { buildDashboardModel, formatReading } from './dashboardData.js';
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
  doctorsAvailable: document.querySelector('[data-doctors-available]'),
  doctorGrid: document.querySelector('[data-doctor-grid]'),
  deviceGrid: document.querySelector('[data-device-grid]'),
  errorBanner: document.querySelector('[data-error-banner]'),
  lastUpdated: document.querySelector('[data-last-updated]'),
  loadingBanner: document.querySelector('[data-loading-banner]'),
  offlineCount: document.querySelector('[data-offline-count]'),
  onlineCount: document.querySelector('[data-online-count]'),
  rangeControls: document.querySelector('.range-controls'),
  serviceState: document.querySelector('[data-service-state]'),
  consoleClock: document.querySelector('[data-console-clock]'),
};
const chartContext = document.querySelector('#trend-chart');
let trendChart;
let overviewModel;
let selectedDeviceCode;
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
function renderDoctors(doctors) {
  if (!elements.doctorGrid) return;
  if (!doctors.length) {
    elements.doctorGrid.innerHTML =
      '<p class="empty-state">The public doctor roster has not been configured.</p>';
    return;
  }
  elements.doctorGrid.innerHTML = doctors
    .map(
      (doctor) => `
        <article class="doctor-card is-${escapeHtml(doctor.availabilityKind)}">
          <div class="doctor-card__status"><span class="availability-dot" aria-hidden="true"></span>${escapeHtml(doctor.availabilityLabel)}</div>
          <h3>${escapeHtml(doctor.display_name)}</h3>
          <p>${escapeHtml(doctor.role)}${doctor.department ? ` · ${escapeHtml(doctor.department)}` : ''}</p>
          <dl><div><dt>Location</dt><dd>${escapeHtml(doctor.room ?? 'Ask reception')}</dd></div><div><dt>Hours</dt><dd>${escapeHtml(doctor.scheduleLabel)}</dd></div></dl>
          ${doctor.note ? `<small>${escapeHtml(doctor.note)}</small>` : ''}
        </article>`,
    )
    .join('');
}
function renderOverview(snapshot, isCached = false) {
  overviewModel = buildDashboardModel(snapshot);
  selectedDeviceCode ??= overviewModel.devices[0]?.device_code;
  setText(elements.onlineCount, String(overviewModel.summary.online));
  setText(elements.offlineCount, String(overviewModel.summary.offline));
  setText(elements.activeAlerts, String(overviewModel.summary.activeAlerts));
  setText(elements.doctorsAvailable, String(overviewModel.summary.doctorsAvailable));
  setText(
    elements.lastUpdated,
    `${isCached ? 'Offline copy from' : 'Updated'} ${overviewModel.refreshedLabel}`,
  );
  setText(
    elements.serviceState,
    isCached
      ? 'Offline copy'
      : overviewModel.summary.offline > 0
        ? 'Needs attention'
        : 'Monitoring live',
  );
  renderDoctors(overviewModel.doctors);
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
    if (selectedDeviceCode) await selectDevice(selectedDeviceCode);
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
elements.deviceGrid?.addEventListener('click', (event) => {
  const card = event.target.closest('[data-device-code]');
  if (card) void selectDevice(card.dataset.deviceCode);
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
