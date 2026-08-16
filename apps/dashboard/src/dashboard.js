import Chart from 'chart.js/auto';

import { buildDashboardModel, formatReading } from './dashboardData.js';
import './styles.css';

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
const dashboardEndpoint = `${apiUrl}/api/v1/dashboard`;
const refreshIntervalMs = 10_000;

const elements = {
  activeAlerts: document.querySelector('[data-active-alerts]'),
  alertList: document.querySelector('[data-alert-list]'),
  deviceGrid: document.querySelector('[data-device-grid]'),
  errorBanner: document.querySelector('[data-error-banner]'),
  lastUpdated: document.querySelector('[data-last-updated]'),
  onlineCount: document.querySelector('[data-online-count]'),
  offlineCount: document.querySelector('[data-offline-count]'),
  serviceState: document.querySelector('[data-service-state]'),
};

const chartContext = document.querySelector('#trend-chart');
let trendChart;

function setText(element, value) {
  if (element) element.textContent = value;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    const replacements = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };

    return replacements[character];
  });
}

function renderDevices(devices) {
  if (!elements.deviceGrid) return;

  elements.deviceGrid.innerHTML = devices
    .map(
      (device) => `
        <article class="device-card is-${device.statusKind}">
          <div class="device-card__header">
            <div>
              <h3>${escapeHtml(device.name)}</h3>
              <p>${escapeHtml(device.location)}</p>
            </div>
            <span class="status-pill">${escapeHtml(device.statusLabel)}</span>
          </div>
          <div class="primary-reading">${escapeHtml(device.primaryReading)}</div>
          <div class="device-card__meta">
            <span>${escapeHtml(device.secondaryReading)}</span>
            <span>Last seen ${escapeHtml(device.lastSeenLabel)}</span>
          </div>
          <dl class="metric-list">
            <div>
              <dt>Temp</dt>
              <dd>${escapeHtml(formatReading(device.latest.temperature))}</dd>
            </div>
            <div>
              <dt>Humidity</dt>
              <dd>${escapeHtml(formatReading(device.latest.humidity))}</dd>
            </div>
            <div>
              <dt>Smoke</dt>
              <dd>${escapeHtml(formatReading(device.latest.smoke))}</dd>
            </div>
            <div>
              <dt>Alarm</dt>
              <dd>${escapeHtml(formatReading(device.latest.detector_alarm))}</dd>
            </div>
          </dl>
        </article>
      `,
    )
    .join('');
}

function renderAlerts(alerts) {
  if (!elements.alertList) return;

  if (alerts.length === 0) {
    elements.alertList.innerHTML = '<p class="empty-state">No active alerts.</p>';
    return;
  }

  elements.alertList.innerHTML = alerts
    .map(
      (alert) => `
        <article class="alert-row">
          <div>
            <strong>${escapeHtml(alert.message)}</strong>
            <span>${escapeHtml(new Date(alert.triggered_at).toLocaleString())}</span>
          </div>
          <span>${escapeHtml(alert.status)}</span>
        </article>
      `,
    )
    .join('');
}

function renderChart(model) {
  if (!chartContext) return;

  const labels = model.trendReadings.map((reading) =>
    new Date(reading.recorded_at).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    }),
  );
  const temperature = model.trendReadings.map((reading) =>
    reading.metric === 'temperature' ? Number(reading.value) : null,
  );
  const humidity = model.trendReadings.map((reading) =>
    reading.metric === 'humidity' ? Number(reading.value) : null,
  );

  if (!trendChart) {
    trendChart = new Chart(chartContext, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Temperature C',
            data: temperature,
            borderColor: '#0f766e',
            backgroundColor: 'rgba(15, 118, 110, 0.12)',
            spanGaps: true,
            tension: 0.25,
          },
          {
            label: 'Humidity % RH',
            data: humidity,
            borderColor: '#7c3aed',
            backgroundColor: 'rgba(124, 58, 237, 0.1)',
            spanGaps: true,
            tension: 0.25,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: {
              boxWidth: 10,
              usePointStyle: true,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
          },
          y: {
            beginAtZero: false,
          },
        },
      },
    });
    return;
  }

  trendChart.data.labels = labels;
  trendChart.data.datasets[0].data = temperature;
  trendChart.data.datasets[1].data = humidity;
  trendChart.update();
}

function renderDashboard(snapshot) {
  const model = buildDashboardModel(snapshot);

  setText(elements.onlineCount, String(model.summary.online));
  setText(elements.offlineCount, String(model.summary.offline));
  setText(elements.activeAlerts, String(model.summary.activeAlerts));
  setText(elements.lastUpdated, `Updated ${model.refreshedLabel}`);
  setText(elements.serviceState, model.summary.offline > 0 ? 'Needs attention' : 'Monitoring live');

  renderDevices(model.devices);
  renderAlerts(model.activeAlerts);
  renderChart(model);
}

async function refreshDashboard() {
  try {
    const response = await fetch(dashboardEndpoint, { signal: AbortSignal.timeout(5000) });

    if (!response.ok) {
      throw new Error(`Dashboard API returned ${response.status}`);
    }

    renderDashboard(await response.json());
    elements.errorBanner?.setAttribute('hidden', '');
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Dashboard refresh failed');
    elements.errorBanner?.removeAttribute('hidden');
    setText(elements.serviceState, 'API unreachable');
  }
}

void refreshDashboard();
window.setInterval(() => void refreshDashboard(), refreshIntervalMs);
