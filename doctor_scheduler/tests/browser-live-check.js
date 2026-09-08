// Live design smoke test. Start the scheduler on 8081 and dedicated Chrome CDP on 9223.
// Requests go to the local cache; mocked changes do not edit or reread Google Sheets.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.IHC_TEST_URL || 'http://127.0.0.1:8081';
const pages = await (await fetch('http://127.0.0.1:9223/json')).json();
const socket = new WebSocket(pages.find((page) => page.type === 'page').webSocketDebuggerUrl);
await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }));
let nextId = 0;
const pending = new Map();
const errors = [];
let mockResponse = null;
socket.addEventListener('message', async ({ data }) => {
  const message = JSON.parse(data);
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
  if (message.method === 'Fetch.requestPaused') {
    await command('Fetch.fulfillRequest', {
      requestId: message.params.requestId,
      responseCode: 200,
      responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
      body: Buffer.from(JSON.stringify(mockResponse)).toString('base64'),
    });
  }
  if (message.id) {
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  }
});
function command(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await command('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function waitFor(expression) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out: ${expression}`);
}

try {
  const live = await (await fetch(`${base}/api/schedule`)).json();
  const doctorCount = live.doctors.length;
  assert.ok(doctorCount > 0);
  assert.deepEqual(live.staff, []);
  assert.equal(live.refresh_seconds, 120);
  for (const path of [
    '/keys/ihcautomation-ab8088bef327.json',
    '/.cache/roster.json',
    '/server.py',
    '/new_design/index.html',
  ]) {
    assert.equal((await fetch(base + path)).status, 404);
  }
  await command('Runtime.enable');
  await command('Page.enable');
  await command('Network.enable');
  await command('Page.navigate', { url: base });
  await waitFor(`document.querySelectorAll('#doctors .card').length === ${doctorCount}`);
  assert.equal(await evaluate("document.querySelectorAll('#weekly .day').length"), 7);
  assert.equal(await evaluate("document.querySelectorAll('#staff .card').length"), 0);
  await mkdir(new URL('../.cache/', import.meta.url), { recursive: true });
  for (const width of [1440, 1024, 768, 650, 390, 320]) {
    await command('Emulation.setDeviceMetricsOverride', {
      width,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: width < 651,
    });
    const dimensions = await evaluate(
      '({page: document.documentElement.scrollWidth, viewport: innerWidth})',
    );
    assert.ok(
      dimensions.page <= dimensions.viewport,
      `Overflow at ${width}: ${JSON.stringify(dimensions)}`,
    );
    if (width === 1440 || width === 390) {
      const screenshot = await command('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: true,
      });
      await writeFile(
        new URL(`../.cache/live-${width}.png`, import.meta.url),
        Buffer.from(screenshot.data, 'base64'),
      );
    }
  }
  await command('Network.setBlockedURLs', { urls: ['*/api/schedule'] });
  await evaluate("document.getElementById('retry').click()");
  await waitFor("document.getElementById('sync-status').textContent.includes('Updates delayed')");
  assert.equal(await evaluate("document.querySelectorAll('#doctors .card').length"), doctorCount);
  await command('Network.setBlockedURLs', { urls: [] });
  await evaluate("document.getElementById('retry').click()");
  await waitFor("document.getElementById('sync-status').textContent.includes('Roster up to date')");

  const frozen = Date.parse('2026-09-08T18:30:00+05:30');
  mockResponse = {
    ...live,
    status: 'ok',
    server_time: new Date(frozen).toISOString(),
    updated_at: new Date(frozen).toISOString(),
    next_refresh_at: frozen / 1000 + 1,
    doctors: [{ name: 'Dr. Test <script>', role: 'Allopathy', qual: 'MBBS' }],
    schedule: { '2026-09-08': [{ name: 'Dr. Test <script>', start: 1080, end: 1140 }] },
    attendance: { date: '2026-09-08', status: 'ok', records: [] },
  };
  await command('Fetch.enable', { patterns: [{ urlPattern: '*/api/schedule' }] });
  await command('Page.reload');
  await waitFor(
    "document.getElementById('duty-status').textContent === 'Doctors scheduled now: 1'",
  );
  assert.equal(await evaluate("document.querySelectorAll('#doctors script').length"), 0);
  assert.match(
    await evaluate("document.getElementById('doctors').textContent"),
    /Dr\. Test <script>/,
  );
  await waitFor(
    "document.querySelectorAll('.attendance-unconfirmed .person-current').length === 1",
  );
  assert.equal(
    await evaluate("document.querySelectorAll('.attendance-confirmed .person-current').length"),
    0,
  );
  const sheetSections = await evaluate(
    "[document.getElementById('weekly').innerHTML, document.getElementById('current-weekly').innerHTML]",
  );
  const record = {
    name: 'Dr. Test <script>',
    state: 'present',
    updated_at: new Date(frozen).toISOString(),
  };
  mockResponse.attendance.records = [record];
  await waitFor("document.querySelectorAll('.attendance-confirmed .person-current').length === 1");
  assert.deepEqual(
    await evaluate(
      "[document.getElementById('weekly').innerHTML, document.getElementById('current-weekly').innerHTML]",
    ),
    sheetSections,
  );
  mockResponse.attendance.records = [{ ...record, state: 'absent' }];
  await waitFor("document.querySelectorAll('.attendance-absent .person-current').length === 1");
  assert.equal(
    await evaluate("document.querySelectorAll('.attendance-confirmed .person-current').length"),
    0,
  );
  assert.deepEqual(
    await evaluate(
      "[document.getElementById('weekly').innerHTML, document.getElementById('current-weekly').innerHTML]",
    ),
    sheetSections,
  );
  mockResponse.attendance.records = [record];
  mockResponse.schedule = { '2026-09-08': [] };
  await waitFor(
    "document.querySelectorAll('.attendance-unscheduled .person-current').length === 1",
  );
  mockResponse.schedule = {};
  await waitFor(
    "document.querySelectorAll('.attendance-unpublished .person-current').length === 1",
  );
  mockResponse.attendance.records = [];
  // The next automatic cache poll must update the screen without reload/click.
  mockResponse = {
    ...mockResponse,
    updated_at: new Date(frozen + 1000).toISOString(),
    schedule: { '2026-09-08': [] },
  };
  await waitFor(
    "document.getElementById('duty-status').textContent === 'Doctors scheduled now: 0'",
  );
  assert.match(
    await evaluate("document.getElementById('current-doctors').textContent"),
    /No doctors scheduled/,
  );
  mockResponse = {
    ...mockResponse,
    schedule: {},
    updated_at: new Date(frozen + 2000).toISOString(),
  };
  await waitFor("document.getElementById('duty-status').textContent.includes('not published')");
  await command('Fetch.disable');
  await command('Network.setBlockedURLs', { urls: ['*/api/schedule'] });
  await command('Page.reload');
  await waitFor(
    "document.getElementById('loading').textContent.includes('temporarily unavailable')",
  );
  await command('Network.setBlockedURLs', { urls: [] });
  await evaluate("document.getElementById('retry').click()");
  await waitFor(`document.querySelectorAll('#doctors .card').length === ${doctorCount}`);
  assert.equal(errors.length, 0, JSON.stringify(errors));
  console.log(
    'PASS: profiles, empty staff, 6 viewport widths, automatic attendance categories, unchanged weekly sections, empty/unpublished dates, offline recovery, safe text, and blocked private files.',
  );
} finally {
  await command('Browser.close');
  socket.close();
}
