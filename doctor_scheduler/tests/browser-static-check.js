// Optional visual smoke test: Chrome CDP on 9223, generated public/index.html.
// No server, Sheets request, or installed browser automation package is needed.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const form = process.argv.includes('--form');

const pages = await (await fetch('http://127.0.0.1:9223/json')).json();
const socket = new WebSocket(pages.find((page) => page.type === 'page').webSocketDebuggerUrl);
await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }));
let nextId = 0;
const pending = new Map();
socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data);
  if (!message.id) return;
  const request = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) request.reject(new Error(JSON.stringify(message.error)));
  else request.resolve(message.result);
});
function command(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await command('Runtime.evaluate', { expression, returnByValue: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
try {
  await command('Page.enable');
  await command('Page.navigate', {
    url: new URL(
      form ? '../.cache/personnel-form-preview.html' : '../public/index.html',
      import.meta.url,
    ).href,
  });
  const deadline = Date.now() + 10000;
  while (
    !(await evaluate(
      form
        ? "document.querySelectorAll('tbody tr').length > 0"
        : "document.querySelectorAll('.day').length === 7",
    ))
  ) {
    if (Date.now() > deadline) throw new Error('Static HTML did not load');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (form) {
    assert.deepEqual(
      await evaluate("Array.from(document.querySelectorAll('thead th'), n => n.textContent)"),
      ['IHC Personnel', 'UserID', 'Category', 'Status'],
    );
    assert.equal(await evaluate("document.querySelectorAll('input[type=password]').length"), 1);
    assert.equal(await evaluate("document.querySelector('form').method"), 'post');
    assert.equal(
      await evaluate("document.body.textContent.toLowerCase().includes('attendance')"),
      false,
    );
  } else {
    assert.ok(await evaluate("document.querySelectorAll('.directory .card').length > 0"));
  }
  assert.equal(await evaluate('document.scripts.length'), 0);
  await command('Emulation.setScriptExecutionDisabled', { value: true });
  await mkdir(new URL('../.cache/', import.meta.url), { recursive: true });
  for (const width of [1440, 1024, 768, 650, 390, 320]) {
    await command('Emulation.setDeviceMetricsOverride', {
      width,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: width < 651,
    });
    const size = await evaluate(
      '({page: document.documentElement.scrollWidth, viewport: innerWidth})',
    );
    assert.ok(size.page <= size.viewport, `Overflow at ${width}: ${JSON.stringify(size)}`);
    if (width === 1440 || width === 390) {
      const screenshot = await command('Page.captureScreenshot', { captureBeyondViewport: true });
      await writeFile(
        new URL(`../.cache/${form ? 'form' : 'static'}-${width}.png`, import.meta.url),
        Buffer.from(screenshot.data, 'base64'),
      );
    }
  }
  console.log(
    'PASS: complete static HTML, no page scripts, six viewport widths, desktop/mobile screenshots.',
  );
} finally {
  await command('Browser.close');
  socket.close();
}
