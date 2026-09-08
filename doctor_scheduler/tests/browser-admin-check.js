// Uses test_admin.py --preview on 8082 and dedicated Chrome CDP on 9223.
// Only temporary test records are written. Google Sheets is never accessed.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const base = 'http://127.0.0.1:8082';
const pages = await (await fetch('http://127.0.0.1:9223/json')).json();
const socket = new WebSocket(pages.find((page) => page.type === 'page').webSocketDebuggerUrl);
await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }));
let id = 0;
const pending = new Map();
const errors = [];
let onLoad;
socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data);
  if (message.method === 'Page.loadEventFired' && onLoad) {
    onLoad();
    onLoad = null;
  }
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
  if (message.id) {
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  }
});
function command(method, params = {}) {
  const next = ++id;
  return new Promise((resolve, reject) => {
    pending.set(next, { resolve, reject });
    socket.send(JSON.stringify({ id: next, method, params }));
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
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out: ${expression}`);
}
async function screenshot(name) {
  const result = await command('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
  });
  await writeFile(
    new URL(`../.cache/${name}.png`, import.meta.url),
    Buffer.from(result.data, 'base64'),
  );
}
async function login(password = '1234') {
  await evaluate(
    `document.getElementById('username').value = 'user123'; document.getElementById('password').value = ${JSON.stringify(password)}; document.getElementById('login-form').requestSubmit()`,
  );
}

async function reload() {
  const loaded = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Page reload timed out')), 10000);
    onLoad = () => {
      clearTimeout(timer);
      resolve();
    };
  });
  await command('Page.reload');
  await loaded;
}

try {
  await mkdir(new URL('../.cache/', import.meta.url), { recursive: true });
  await command('Runtime.enable');
  await command('Page.enable');
  await command('Network.enable');
  await command('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await command('Page.navigate', { url: `${base}/admin` });
  await waitFor(
    "document.getElementById('login-panel') && !document.getElementById('login-panel').hidden",
  );
  await screenshot('admin-login');
  await login('incorrect');
  await waitFor("document.getElementById('login-message').textContent.includes('Incorrect')");
  await login();
  await waitFor("document.querySelectorAll('.attendance-card').length === 3");
  assert.equal(await evaluate("document.getElementById('unconfirmed-count').textContent"), '3');
  assert.equal(await evaluate("document.cookie.includes('ihc_admin_session')"), false);
  for (const width of [1440, 1024, 768, 650, 390, 320]) {
    await command('Emulation.setDeviceMetricsOverride', {
      width,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: width < 651,
    });
    assert.equal(
      await evaluate('document.documentElement.scrollWidth <= innerWidth'),
      true,
      `Overflow at ${width}`,
    );
    if (width === 1440 || width === 390) await screenshot(`admin-${width}`);
  }
  await evaluate(
    "document.getElementById('presence-0').value='present'; document.getElementById('presence-0').dispatchEvent(new Event('change')); document.getElementById('note-0').value='<img src=x onerror=alert(1)>'; document.getElementById('note-0').dispatchEvent(new Event('input')); document.querySelector('.attendance-card').requestSubmit()",
  );
  await waitFor("document.getElementById('present-count').textContent === '1'");
  assert.equal(
    await evaluate("document.querySelectorAll('#doctor-list img, #doctor-list script').length"),
    0,
  );
  await reload();
  await waitFor(
    "document.getElementById('presence-0') && document.getElementById('presence-0').value === 'present'",
  );
  assert.equal(
    await evaluate("document.getElementById('note-0').value"),
    '<img src=x onerror=alert(1)>',
  );

  // A save on doctor A must preserve an unsaved draft for doctor B.
  await evaluate(
    "document.getElementById('presence-1').value='present'; document.getElementById('presence-1').dispatchEvent(new Event('change')); document.getElementById('presence-0').value='absent'; document.getElementById('presence-0').dispatchEvent(new Event('change')); document.querySelector('.attendance-card').requestSubmit()",
  );
  await waitFor("document.getElementById('absent-count').textContent === '1'");
  assert.equal(await evaluate("document.getElementById('presence-1').value"), 'present');
  assert.equal(
    await evaluate("document.querySelectorAll('.attendance-card')[1].classList.contains('dirty')"),
    true,
  );
  await evaluate("document.querySelectorAll('.attendance-card')[1].requestSubmit()");
  await waitFor("document.getElementById('present-count').textContent === '1'");
  assert.match(
    await evaluate("document.querySelector('.attendance-card .comparison').textContent"),
    /marked not present/,
  );

  // Simulate another session saving after this browser last loaded the record.
  await evaluate(
    "(async()=>{const s=await (await fetch('/api/admin/session')).json(); const a=await (await fetch('/api/admin/attendance')).json(); return fetch('/api/admin/attendance',{method:'POST',headers:{'Content-Type':'application/json','X-IHC-Request':'1','X-CSRF-Token':s.csrf_token},body:JSON.stringify({date:a.date,doctor:a.doctors[0].name,state:'present',note:'Saved elsewhere',revision:a.doctors[0].presence.revision})});})()",
  );
  await evaluate(
    "document.getElementById('note-0').value='Outdated draft'; document.getElementById('note-0').dispatchEvent(new Event('input')); document.querySelector('.attendance-card').requestSubmit()",
  );
  await waitFor(
    "document.querySelector('.attendance-card .form-message').textContent.includes('Someone has updated')",
  );
  await evaluate("document.querySelector('.discard-button').click()");
  await waitFor("document.getElementById('note-0').value === 'Saved elsewhere'");
  await command('Network.setBlockedURLs', { urls: ['*/api/admin/attendance'] });
  await evaluate("document.getElementById('refresh').click()");
  await waitFor("document.getElementById('desk-message').classList.contains('error')");
  assert.equal(await evaluate("document.querySelectorAll('.attendance-card').length"), 3);
  await command('Network.setBlockedURLs', { urls: [] });
  await evaluate("document.getElementById('logout').click()");
  await waitFor("!document.getElementById('login-panel').hidden");
  assert.equal(await evaluate("(async()=> (await fetch('/api/admin/attendance')).status)()"), 401);
  assert.equal(await evaluate("document.querySelectorAll('.attendance-card').length"), 0);
  assert.equal(errors.length, 0, JSON.stringify(errors));
  console.log(
    'PASS: login, 6 screen widths, authenticated saves, reload persistence, safe notes, preserved drafts, conflicting edits, offline reads, and logout.',
  );
} finally {
  await command('Browser.close');
  socket.close();
}
