import { attendanceGroups, indiaClock } from './schedule.js';

const $ = (id) => document.getElementById(id);
const dateFormat = (date, options) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...options }).format(date);
const timeFormat = (minutes) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const timing = (shifts) =>
  shifts.map((shift) => `${timeFormat(shift.start)}–${timeFormat(shift.end)}`).join(', ');
const dateKey = (date) => date.toISOString().slice(0, 10);
let data;
let disconnected = false;
let loading = false;
let timer;
let clockOffset = 0;
let lastRender = '';

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function profile(doctor, className) {
  const card = element('div', className);
  const photo = element('span', 'photo');
  photo.setAttribute('aria-hidden', 'true');
  const bio = element('div', 'bio');
  bio.append(
    element('div', 'name', doctor.name),
    element('div', 'role', doctor.role),
    element('div', 'qual', doctor.qual),
  );
  card.append(photo, bio);
  return { card, bio };
}

function refreshStatus() {
  if (!data) return;
  const old = Date.now() + clockOffset - new Date(data.updated_at).getTime() > 150000;
  const stale = disconnected || data.status === 'stale' || old;
  const updated = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(data.updated_at));
  $('sync-status').textContent =
    `${stale ? 'Updates delayed — showing the last saved roster.' : 'Roster up to date.'} Last checked ${updated} IST.`;
  $('sync-status').classList.toggle('sync-warning', stale);
  $('retry').hidden = !stale;
}

function render(force = false) {
  if (!data) return;
  refreshStatus();
  const clock = indiaClock(new Date(Date.now() + clockOffset));
  const today = dateKey(clock.date);
  const renderKey = `${today}/${clock.time}/${data.updated_at}`;
  if (!force && renderKey === lastRender) return;
  lastRender = renderKey;
  const monday = new Date(clock.date);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const week = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(monday);
    date.setUTCDate(monday.getUTCDate() + i);
    return { date, key: dateKey(date), day: dateFormat(date, { weekday: 'short' }) };
  });
  const [hour, minute] = clock.time.split(':').map(Number);
  const now = hour * 60 + minute;
  const todayShifts = data.schedule[today];
  const active = (shift) => shift.start <= now && now < shift.end;
  const onDuty = new Set((todayShifts || []).filter(active).map((shift) => shift.name));
  $('duty-status').textContent = todayShifts
    ? `Doctors scheduled now: ${onDuty.size}`
    : 'Today’s roster not published';
  $('week-label').textContent =
    `${dateFormat(week[0].date, { day: 'numeric', month: 'short' })} – ${dateFormat(week[6].date, { day: 'numeric', month: 'short', year: 'numeric' })} · IST`;
  $('weekly').replaceChildren(
    ...week.map((day) => {
      const shifts = data.schedule[day.key];
      const column = element('div', `day${day.key === today ? ' today' : ''}`);
      const heading = element('div', 'day-name', day.day);
      heading.append(
        element('div', 'day-date', dateFormat(day.date, { day: '2-digit', month: 'short' })),
      );
      const body = element('div', 'day-body');
      for (const shift of shifts || []) {
        const block = element(
          'div',
          `shift${day.key === today && active(shift) ? ' active-shift' : ''}`,
        );
        block.append(element('strong', '', shift.name), element('time', '', timing([shift])));
        body.append(block);
      }
      if (!shifts?.length)
        body.append(
          element('p', 'empty-message', shifts ? 'No doctors scheduled' : 'Schedule not published'),
        );
      column.append(heading, body);
      return column;
    }),
  );
  $('today-title').textContent =
    `Today's Schedule • ${dateFormat(clock.date, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}`;
  const names = [...new Set((todayShifts || []).map((shift) => shift.name))];
  const doctors = names.map((name) => data.doctors.find((doctor) => doctor.name === name));
  const { available, groups } = attendanceGroups(
    data.doctors,
    todayShifts,
    data.attendance,
    today,
    disconnected,
  );
  $('current-doctors-title').textContent = "Today's doctor attendance";
  $('attendance-status').textContent = !available
    ? 'Attendance updates unavailable. Presence cannot currently be confirmed.'
    : todayShifts === undefined
      ? 'Today’s roster is not published. Staff reports cannot yet be matched to planned shifts.'
      : 'Presence is reported by staff for today. Shift times below are planned times.';
  $('attendance-status').classList.toggle('sync-warning', !available || todayShifts === undefined);
  $('current-doctors').replaceChildren();
  for (const [key, group] of Object.entries(groups)) {
    if (key !== 'confirmed' && !group.doctors.length) continue;
    const section = element('section', `attendance-group attendance-${key}`);
    section.append(element('h4', '', `${group.label} (${group.doctors.length})`));
    for (const doctor of group.doctors) {
      const { card, bio } = profile(doctor, 'person-current');
      if (doctor.shifts.length) bio.append(element('div', 'timing', timing(doctor.shifts)));
      if (doctor.reportedAt) {
        const reported = new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Asia/Kolkata',
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
        }).format(new Date(doctor.reportedAt));
        bio.append(element('div', 'qual', `Staff report: ${reported} IST`));
      }
      section.append(card);
    }
    if (!group.doctors.length)
      section.append(
        element('p', 'empty-message', 'No doctors confirmed by both the roster and staff yet.'),
      );
    $('current-doctors').append(section);
  }
  $('current-weekly').replaceChildren(
    ...doctors.map((doctor) => {
      const row = element('div', 'doctor-week');
      row.append(profile(doctor, 'doctor-info').card);
      const days = element('div', 'week-days');
      days.append(
        ...week.map((day) => {
          const shifts = data.schedule[day.key]?.filter((shift) => shift.name === doctor.name);
          const cell = element('div', `wday ${shifts?.length ? 'on' : 'off'}`);
          cell.append(
            element('b', '', day.day),
            document.createTextNode(
              shifts?.length ? timing(shifts) : shifts ? '—' : 'Not published',
            ),
          );
          return cell;
        }),
      );
      row.append(days);
      return row;
    }),
  );
  if (!doctors.length) {
    const message = todayShifts
      ? 'No doctors scheduled today.'
      : 'Today’s schedule has not been published.';
    if (available && !Object.values(groups).some((group) => group.doctors.length))
      $('current-doctors').append(element('p', 'empty-message', message));
    $('current-weekly').append(element('p', 'empty-message', message));
  }
  $('doctors-title').textContent = `Doctors (${data.doctors.length})`;
  $('doctors').replaceChildren(...data.doctors.map((doctor) => profile(doctor, 'card').card));
}

async function load() {
  if (loading) return;
  loading = true;
  clearTimeout(timer);
  let delay = 10000;
  try {
    const response = await fetch('/api/schedule', {
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    const next = await response.json();
    if (!response.ok) {
      if (next.status === 'loading' && !data) {
        $('sync-status').textContent = 'Connecting to the latest roster…';
        delay = 2000;
        return;
      }
      throw new Error('Schedule unavailable');
    }
    data = next;
    clockOffset = new Date(data.server_time).getTime() - Date.now();
    disconnected = false;
    $('loading').hidden = true;
    $('schedule-content').hidden = false;
    // Check saved attendance within 30 seconds; the server alone controls Google reads.
    delay = data.refreshing
      ? 2000
      : Math.max(
          2000,
          Math.min(30000, data.next_refresh_at * 1000 - (Date.now() + clockOffset) + 1000),
        );
    render(true);
  } catch {
    disconnected = true;
    if (data) render(true);
    else {
      $('loading').textContent =
        'The doctor schedule is temporarily unavailable. Retrying automatically.';
      $('sync-status').textContent = 'Could not load the roster.';
      $('retry').hidden = false;
    }
  } finally {
    loading = false;
    timer = setTimeout(load, delay);
  }
}

$('retry').addEventListener('click', load);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) load();
});
setInterval(render, 15000);
load();
