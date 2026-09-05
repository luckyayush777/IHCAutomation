import { afterEach, expect, it, vi } from 'vitest';
import dashboardHtml from '../index.html?raw';

vi.mock('chart.js/auto', () => ({
  default: class {
    constructor(_context, config) {
      this.data = config.data;
    }
    update() {}
  },
}));

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
});

it('keeps the live wheel and current reading independent of historical controls', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-05T10:00:00.000Z'));
  document.documentElement.innerHTML = dashboardHtml;
  const calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url) => {
      const parsed = new URL(url);
      calls.push(parsed);
      const historical = parsed.searchParams.has('to');
      return {
        ok: true,
        json: async () => ({
          generatedAt: new Date().toISOString(),
          devices: [
            {
              id: 'd1',
              device_code: 'fridge_male_ward',
              name: 'Fridge',
              device_type: 'fridge_probe',
              status: 'online',
              last_seen_at: new Date().toISOString(),
            },
          ],
          readings: [
            {
              id: 1,
              device_id: 'd1',
              metric: 'temperature',
              unit: 'celsius',
              quality: 'good',
              value: historical ? 7 : 3.5,
              recorded_at: historical ? '2026-09-04T10:00:00.000Z' : new Date().toISOString(),
            },
          ],
          alertRules: [],
          alerts: [],
        }),
      };
    }),
  );
  await import('./dashboard.js');
  await vi.advanceTimersByTimeAsync(0);
  document.querySelector('[data-detail-toggle]').click();
  await vi.advanceTimersByTimeAsync(0);
  const form = document.querySelector('[data-custom-range-form]');
  form.querySelector('[name="from"]').value = '2026-09-04T00:00';
  form.querySelector('[name="to"]').value = '2026-09-04T23:59';
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.advanceTimersByTimeAsync(10_000);

  const overviewCalls = calls.filter((url) => !url.searchParams.has('deviceCode'));
  expect(overviewCalls.length).toBeGreaterThanOrEqual(2);
  expect(
    overviewCalls.every((url) => !url.searchParams.has('from') && !url.searchParams.has('to')),
  ).toBe(true);
  expect(
    calls.some((url) => url.searchParams.has('deviceCode') && url.searchParams.has('to')),
  ).toBe(true);
  expect(document.querySelector('[data-wheel-centre-label]').textContent).toBe('SAFE');
  expect(document.querySelector('[data-detail-summary]').textContent).toContain('Current3.5 C');
  expect(JSON.parse(localStorage.getItem('ihc-dashboard-snapshot-v1')).readings[0].value).toBe(3.5);
});
