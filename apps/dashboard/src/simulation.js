import './simulation.css';

const simulatorUrl = 'http://localhost:4100/api/v1/simulation';
const status = document.querySelector('[data-simulation-status]');
const form = document.querySelector('[data-simulation-form]');
const stopButton = document.querySelector('[data-stop-simulation]');

function renderState(state) {
  status.className = `simulation-status ${state.running ? 'is-running' : ''}`;
  status.textContent = state.running
    ? `Running “${state.scenario}” every ${state.intervalMs / 1000}s · ${state.tick} ticks sent`
    : 'Simulator is ready and stopped';
}

async function callSimulator(init) {
  const response = await fetch(simulatorUrl, init);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? 'Simulator request failed');
  renderState(body);
}

async function refresh() {
  try {
    await callSimulator();
  } catch (error) {
    status.className = 'simulation-status is-error';
    status.textContent = `${error.message}. Set SIMULATOR_CONTROL_ENABLED=true and start the simulator.`;
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  try {
    await callSimulator({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'start',
        scenario: data.get('scenario'),
        intervalMs: Number(data.get('intervalMs')),
      }),
    });
  } catch (error) {
    status.className = 'simulation-status is-error';
    status.textContent = error.message;
  }
});

stopButton.addEventListener('click', async () => {
  try {
    await callSimulator({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'stop' }),
    });
  } catch (error) {
    status.className = 'simulation-status is-error';
    status.textContent = error.message;
  }
});

void refresh();
setInterval(() => void refresh(), 3000);
