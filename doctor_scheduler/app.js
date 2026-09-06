import { DAYS, indiaClock, isActive, nextShift } from './schedule.js';

const $ = (id) => document.getElementById(id);
const colors = {
  blue: '#6a95c8',
  purple: '#a494c5',
  teal: '#6eada8',
  orange: '#d6a576',
  pink: '#cb90a6',
};
const dateFormat = (date, options) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...options }).format(date);
let data;
let preview = null;
let lastRendered = '';

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function photo(profile, className) {
  const img = element('img', className);
  img.src = profile.photo || 'assets/portrait.svg';
  img.alt = profile.photo ? `Portrait of ${profile.name}` : 'Photo placeholder';
  img.addEventListener(
    'error',
    () => {
      img.src = 'assets/portrait.svg';
    },
    { once: true },
  );
  return img;
}

function empty(title, message) {
  const node = element('div', 'empty-state');
  const symbol = element('span', 'empty-symbol', '–');
  symbol.setAttribute('aria-hidden', 'true');
  node.append(symbol, element('h4', '', title), element('p', '', message));
  return node;
}

function renderWeek(context, clock) {
  const monday = new Date(clock.date);
  monday.setUTCDate(monday.getUTCDate() - DAYS.indexOf(clock.day));
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  $('week-label').textContent =
    `${dateFormat(monday, { day: 'numeric', month: 'short' })} – ${dateFormat(sunday, { day: 'numeric', month: 'short' })}`;
  $('week-grid').replaceChildren(
    ...DAYS.map((day, index) => {
      const selected = day === context.day;
      const date = new Date(monday);
      date.setUTCDate(date.getUTCDate() + index);
      const column = element('div', `day-column${selected ? ' is-today' : ''}`);
      const heading = element('div', 'day-heading');
      const title = element('div');
      title.append(
        element('span', 'day-name', day),
        element('span', 'day-date', dateFormat(date, { day: 'numeric', month: 'short' })),
      );
      heading.append(title);
      if (selected) heading.append(element('span', 'day-badge', preview ? 'Preview' : 'Today'));
      const shifts = element('div', 'day-shifts');
      for (const shift of data.shifts.filter((s) => s.day === day)) {
        const doctor = data.doctors.find((d) => d.id === shift.doctor_id);
        const active = selected && isActive(shift, context.day, context.time);
        const block = element('div', `shift${active ? ' is-active' : ''}`);
        block.style.setProperty('--doctor-color', colors[doctor?.color] || colors.blue);
        const top = element('div', 'shift-top');
        top.append(element('span', 'shift-name', doctor?.name || shift.doctor_id));
        if (active) {
          const dot = element('span', 'active-dot');
          dot.setAttribute('role', 'img');
          dot.setAttribute('aria-label', 'Scheduled now');
          top.append(dot);
        }
        block.append(top, element('span', 'shift-time', `${shift.start} – ${shift.end}`));
        shifts.append(block);
      }
      if (!shifts.childElementCount) shifts.append(element('p', 'specialty', 'No listed shifts'));
      column.append(heading, shifts);
      return column;
    }),
  );
}

function renderDoctors(context) {
  const active = data.shifts.filter((s) => isActive(s, context.day, context.time));
  const doctors = [...new Set(active.map((s) => s.doctor_id))];
  $('doctor-count').textContent = doctors.length;
  $('doctors').replaceChildren(
    ...doctors.map((id) => {
      const doctor = data.doctors.find((d) => d.id === id) || {
        name: id,
        specialization: 'Specialty pending',
        room: 'Pending',
      };
      const shift = active.find((s) => s.doctor_id === id);
      const card = element('article', 'doctor-card');
      const profile = element('div', 'doctor-profile');
      const bio = element('div');
      bio.append(
        element('h4', 'doctor-name', doctor.name),
        element('p', 'specialty', doctor.specialization),
        element('span', 'room', `Consultation room ${doctor.room}`),
      );
      profile.append(photo(doctor, 'portrait'), bio);
      const footer = element('div', 'doctor-card-footer');
      const status = element('span', 'available-label');
      status.append(element('span', 'live-dot'), document.createTextNode('Scheduled now'));
      footer.append(status, element('span', '', `Until ${shift.end}`));
      card.append(profile, footer);
      return card;
    }),
  );
  if (!doctors.length) {
    const next = nextShift(data.shifts, context.day, context.time);
    const name = data.doctors.find((d) => d.id === next?.doctor_id)?.name || next?.doctor_id;
    $('doctors').append(
      empty(
        'No doctors scheduled right now',
        next
          ? `Next: ${name} · ${next.day === context.day && next.offset < 1440 ? 'Today' : next.day}, ${next.start}`
          : 'No upcoming shifts have been added.',
      ),
    );
  }
}

function renderStaff(context) {
  const staff = data.staff.filter((person) => isActive(person, context.day, context.time));
  $('staff-count').textContent = staff.length;
  $('staff').replaceChildren(
    ...staff.map((person) => {
      const row = element('article', 'staff-row');
      const info = element('div', 'staff-info');
      info.append(
        element('h4', 'staff-name', person.name),
        element('p', 'staff-role', `${person.role} · ${person.location}`),
      );
      const time = element('div', 'staff-time');
      time.append(
        element('strong', '', `${person.start} – ${person.end}`),
        document.createTextNode('Scheduled now'),
      );
      row.append(photo(person, 'staff-portrait'), info, time);
      return row;
    }),
  );
  if (!staff.length)
    $('staff').append(
      empty(
        'No staff scheduled right now',
        'Sample staff shifts will appear during their listed hours.',
      ),
    );
}

function render(force = false) {
  const clock = indiaClock();
  $('current-date').textContent = dateFormat(clock.date, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  $('current-time').textContent = clock.time;
  if (!data) return;
  const context = preview || clock;
  const key = `${clock.date.toISOString()}/${context.day}/${context.time}/${!!preview}`;
  if (!force && key === lastRendered) return;
  lastRendered = key;
  $('now-label').textContent = `${preview ? 'Preview · ' : ''}${context.day}, ${context.time} IST`;
  let banner = $('preview-banner');
  if (!banner) {
    banner = element('div', 'preview-banner');
    banner.id = 'preview-banner';
    banner.setAttribute('role', 'status');
    $('schedule-content').prepend(banner);
  }
  banner.hidden = !preview;
  banner.textContent = preview
    ? `Preview mode: ${context.day} at ${context.time} IST. Availability below is simulated. Use “Use current time” in prototype controls to return to now.`
    : '';
  renderWeek(context, clock);
  renderDoctors(context);
  renderStaff(context);
}

async function load() {
  $('load-error').hidden = true;
  $('loading').hidden = false;
  try {
    const response = await fetch('/api/schedule', {
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error('Schedule unavailable');
    data = await response.json();
    $('schedule-content').hidden = false;
    const updated = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(data.updated_at));
    $('source-note').textContent = `Source: supplied timetable · Local data updated ${updated} IST`;
    render(true);
  } catch {
    $('load-error').hidden = false;
    $('schedule-content').hidden = true;
  } finally {
    $('loading').hidden = true;
  }
}

$('apply-preview').addEventListener('click', () => {
  if (!$('preview-time').reportValidity()) return;
  preview = { day: $('preview-day').value, time: $('preview-time').value };
  $('preview-status').textContent = `Previewing ${preview.day} at ${preview.time} IST.`;
  render(true);
});
$('reset-preview').addEventListener('click', () => {
  preview = null;
  $('preview-status').textContent = 'Showing the current time.';
  render(true);
});
$('retry').addEventListener('click', load);
const params = new URLSearchParams(window.location.search);
if (DAYS.includes(params.get('day')) && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(params.get('time'))) {
  preview = { day: params.get('day'), time: params.get('time') };
  $('preview-day').value = preview.day;
  $('preview-time').value = preview.time;
  $('preview-status').textContent = `Previewing ${preview.day} at ${preview.time} IST.`;
} else {
  $('preview-day').value = indiaClock().day;
}
render();
load();
setInterval(render, 15000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) render();
});
