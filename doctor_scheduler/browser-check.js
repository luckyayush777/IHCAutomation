// Optional browser smoke check. Requires Chrome with --remote-debugging-port=9223
// and the Python server on port 8080. No browser automation package required.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

const pages = await (await fetch('http://127.0.0.1:9223/json')).json();
const socket = new WebSocket(pages.find((page) => page.type === 'page').webSocketDebuggerUrl);
await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }));
let nextId = 0;
const pending = new Map();
const errors = [];
socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data);
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
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
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw new Error(`Timed out waiting for ${expression}`);
}
async function screenshot(name) {
  const metrics = await command('Page.getLayoutMetrics');
  const result = await command('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    clip: {
      x: 0,
      y: 0,
      width: metrics.cssContentSize.width,
      height: metrics.cssContentSize.height,
      scale: 1,
    },
  });
  await writeFile(new URL(name, import.meta.url), Buffer.from(result.data, 'base64'));
}

try {
  await command('Runtime.enable');
  await command('Page.enable');
  await command('Network.enable');
  await command('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1100,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await command('Page.navigate', { url: 'http://127.0.0.1:8080/?day=Tue&time=18:30' });
  await waitFor("document.querySelectorAll('.shift').length === 41");
  assert.equal(await evaluate("document.querySelectorAll('.day-column').length"), 7);
  assert.equal(await evaluate("document.getElementById('doctor-count').textContent"), '2');
  assert.equal(await evaluate("document.getElementById('staff-count').textContent"), '3');
  assert.equal(await evaluate("document.querySelectorAll('.shift.is-active').length"), 2);
  for (const width of [1440, 1024, 768, 760, 390, 320]) {
    await command('Emulation.setDeviceMetricsOverride', {
      width,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: width < 761,
    });
    const dimensions = await evaluate(
      '({page: document.documentElement.scrollWidth, viewport: innerWidth})',
    );
    assert.ok(
      dimensions.page <= dimensions.viewport,
      `Horizontal overflow at ${width}: ${JSON.stringify(dimensions)}`,
    );
    const clipped = await evaluate(
      "[...document.querySelectorAll('.shift, .doctor-card, .staff-row')].filter(e => e.scrollWidth > e.clientWidth + 1).length",
    );
    assert.equal(clipped, 0, `Clipped card content at ${width}`);
    if (width === 1440) await screenshot('preview-desktop.png');
    if (width === 390) await screenshot('preview-mobile.png');
  }
  await evaluate(
    "document.getElementById('preview-day').value = 'Sun'; document.getElementById('preview-time').value = '21:00'; document.getElementById('apply-preview').click()",
  );
  assert.equal(await evaluate("document.getElementById('doctor-count').textContent"), '0');
  assert.equal(await evaluate("document.getElementById('staff-count').textContent"), '0');
  assert.match(await evaluate("document.getElementById('doctors').textContent"), /Mon, 00:00/);
  await evaluate("document.getElementById('reset-preview').click()");
  assert.equal(await evaluate("document.getElementById('preview-banner').hidden"), true);
  await command('Network.setBlockedURLs', { urls: ['*/api/schedule'] });
  await command('Page.reload');
  await waitFor(
    "document.getElementById('load-error') && !document.getElementById('load-error').hidden",
  );
  await command('Network.setBlockedURLs', { urls: [] });
  await evaluate("document.getElementById('retry').click()");
  await waitFor("!document.getElementById('schedule-content').hidden");
  assert.equal(errors.length, 0, JSON.stringify(errors));
  console.log(
    'Browser checks passed: 6 viewport widths, 41 shifts, current cards, empty states, preview reset, load failure/retry, and no JavaScript exceptions.',
  );
} finally {
  await command('Browser.close');
  socket.close();
}
