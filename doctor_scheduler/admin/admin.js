const $ = (id) => document.getElementById(id);
const drafts = new Map();
let session;
let data;
let fetching = false;
let saving = false;

function node(tag, className, text) {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text !== undefined) item.textContent = text;
  return item;
}

function message(target, text, error = false) {
  target.textContent = text;
  target.classList.toggle('error', error);
}

async function api(path, body) {
  const headers = {};
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    headers['X-IHC-Request'] = '1';
    if (session?.csrf_token) headers['X-CSRF-Token'] = session.csrf_token;
  }
  const response = await fetch(`/api/admin/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error || 'Unable to complete the request.');
    error.status = response.status;
    throw error;
  }
  return result;
}

function showLogin(text = '') {
  session = null;
  data = null;
  drafts.clear();
  $('doctor-list').replaceChildren();
  $('login-panel').hidden = false;
  $('attendance-desk').hidden = true;
  $('logout').hidden = true;
  $('signed-in-user').hidden = true;
  $('initial-loading').hidden = true;
  message($('login-message'), text, Boolean(text));
}

function showDesk() {
  $('login-panel').hidden = true;
  $('attendance-desk').hidden = false;
  $('logout').hidden = false;
  $('signed-in-user').hidden = false;
  $('signed-in-user').textContent = session.username;
  $('initial-loading').hidden = true;
  $('demo-label').hidden = !session.demo;
}

const time = (minutes) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const formatDate = (value, options) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', ...options }).format(
    new Date(value),
  );

function difference(doctor) {
  if (!data.roster_published) return '';
  if (doctor.presence.state === 'present' && !doctor.shifts.length)
    return 'Present · no planned duty today';
  if (doctor.presence.state === 'absent' && doctor.shifts.length)
    return 'Scheduled · marked not present';
  return '';
}

function applyFilters() {
  if (!data) return;
  const query = $('doctor-search').value.trim().toLowerCase();
  const filter = $('doctor-filter').value;
  let visible = 0;
  [...$('doctor-list').children].forEach((card, index) => {
    const doctor = data.doctors[index];
    const match = `${doctor.name} ${doctor.role} ${doctor.qual}`.toLowerCase().includes(query);
    card.hidden =
      !match ||
      (filter === 'review'
        ? !difference(doctor)
        : filter !== 'all' && doctor.presence.state !== filter);
    if (!card.hidden) visible++;
  });
  $('no-results').hidden = visible > 0;
}

function render() {
  $('desk-date').textContent = formatDate(data.server_time, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  for (const state of ['present', 'absent', 'unconfirmed']) {
    $(`${state}-count`).textContent = data.doctors.filter(
      (doctor) => doctor.presence.state === state,
    ).length;
  }
  $('roster-message').textContent = !data.roster_published
    ? 'No planned roster is published for today. You can still record actual presence.'
    : data.roster_status === 'stale'
      ? 'Roster updates are delayed. Planned timings are from the last saved roster.'
      : 'Planned timings are from the published duty roster.';
  $('doctor-list').replaceChildren(
    ...data.doctors.map((doctor, index) => {
      const draft = drafts.get(doctor.name);
      const card = node('form', `attendance-card${draft ? ' dirty' : ''}`);
      card.dataset.doctor = doctor.name;
      const row = node('div', 'attendance-row');
      const info = node('div');
      info.append(
        node('h2', 'doctor-heading', doctor.name),
        node('p', 'doctor-description', [doctor.role, doctor.qual].filter(Boolean).join(' · ')),
      );
      const planned = node('div');
      planned.append(
        node('span', 'field-caption', 'PLANNED DUTY TODAY'),
        node(
          'p',
          'planned-time',
          doctor.shifts.length
            ? doctor.shifts.map((shift) => `${time(shift.start)}–${time(shift.end)}`).join(', ')
            : data.roster_published
              ? 'No planned duty'
              : 'Roster not published',
        ),
      );
      const comparison = difference(doctor);
      if (comparison) planned.append(node('span', 'comparison', comparison));
      const statusLabel = node('label', '', 'Reported presence');
      const select = node('select');
      select.id = `presence-${index}`;
      statusLabel.htmlFor = select.id;
      for (const [value, text] of [
        ['unconfirmed', 'Unconfirmed'],
        ['present', 'Present'],
        ['absent', 'Not present'],
      ]) {
        const option = node('option', '', text);
        option.value = value;
        select.append(option);
      }
      select.value = draft?.state || doctor.presence.state;
      statusLabel.append(select);
      row.append(info, planned, statusLabel);
      const bottom = node('div', 'attendance-bottom');
      const noteLabel = node('label', 'attendance-note', 'Operational note (optional, staff only)');
      const note = node('textarea');
      note.id = `note-${index}`;
      noteLabel.htmlFor = note.id;
      note.rows = 2;
      note.maxLength = 300;
      note.placeholder = 'A short update for the attendance desk';
      note.value = draft?.note ?? doctor.presence.note;
      noteLabel.append(note);
      const actions = node('div', 'save-area');
      actions.append(
        node(
          'p',
          '',
          doctor.presence.updated_at
            ? `Updated ${formatDate(doctor.presence.updated_at, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })} IST by ${doctor.presence.updated_by}`
            : 'No presence report today',
        ),
      );
      const save = node('button', 'primary-button', 'Save attendance');
      save.type = 'submit';
      const discard = node('button', 'discard-button', 'Discard changes');
      discard.type = 'button';
      discard.hidden = !draft;
      actions.append(save, discard);
      bottom.append(noteLabel, actions);
      const result = node('p', 'form-message');
      result.setAttribute('role', 'status');
      const expired = draft && draft.date !== data.date;
      save.disabled = !draft || expired || saving;
      select.disabled = Boolean(expired);
      note.disabled = Boolean(expired);
      if (expired)
        message(
          result,
          'This draft is from a previous date. Discard it before recording today’s presence.',
          true,
        );
      else if (draft?.error) message(result, draft.error, true);
      function changed() {
        const prior = drafts.get(doctor.name);
        if (
          select.value === doctor.presence.state &&
          note.value === doctor.presence.note &&
          !prior?.error
        )
          drafts.delete(doctor.name);
        else
          drafts.set(doctor.name, {
            date: prior?.date || data.date,
            state: select.value,
            note: note.value,
            revision: prior?.revision ?? doctor.presence.revision,
            error: prior?.error,
          });
        save.disabled = !drafts.has(doctor.name) || saving;
        discard.hidden = !drafts.has(doctor.name);
        card.classList.toggle('dirty', drafts.has(doctor.name));
        message($('desk-message'), drafts.size ? `${drafts.size} unsaved doctor update(s).` : '');
      }
      select.addEventListener('change', changed);
      note.addEventListener('input', changed);
      discard.addEventListener('click', () => {
        drafts.delete(doctor.name);
        load();
      });
      card.addEventListener('submit', async (event) => {
        event.preventDefault();
        const update = drafts.get(doctor.name);
        if (!update || saving) return;
        saving = true;
        save.disabled = true;
        select.disabled = true;
        note.disabled = true;
        discard.disabled = true;
        save.textContent = 'Saving…';
        try {
          data = await api('attendance', {
            date: update.date,
            doctor: doctor.name,
            state: update.state,
            note: update.note,
            revision: update.revision,
          });
          drafts.delete(doctor.name);
          message($('desk-message'), `Attendance saved for ${doctor.name}.`);
        } catch (error) {
          if (error.status === 401) {
            showLogin('Your session has expired. Please sign in again.');
            return;
          }
          update.error = error.message || 'Save failed. Your changes have not been confirmed.';
          message($('desk-message'), update.error, true);
        } finally {
          saving = false;
          if (data) render();
        }
      });
      card.append(row, bottom, result);
      return card;
    }),
  );
  applyFilters();
}

async function load() {
  if (fetching || saving || !session) return;
  const activeSession = session;
  fetching = true;
  $('refresh').disabled = true;
  try {
    const result = await api('attendance');
    if (session !== activeSession) return;
    data = result;
    render();
    message(
      $('desk-message'),
      drafts.size
        ? `${drafts.size} unsaved doctor update(s) kept. Discard a draft to use the saved record.`
        : '',
    );
  } catch (error) {
    if (error.status === 401) showLogin('Your session has expired. Please sign in again.');
    else
      message(
        $('desk-message'),
        error.message || 'Unable to load attendance. Try refreshing.',
        true,
      );
  } finally {
    fetching = false;
    $('refresh').disabled = false;
  }
}

$('login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  $('login-button').disabled = true;
  message($('login-message'), 'Signing in…');
  try {
    session = await api('login', { username: $('username').value, password: $('password').value });
    $('password').value = '';
    showDesk();
    await load();
  } catch (error) {
    message($('login-message'), error.message || 'Unable to sign in. Try again.', true);
  } finally {
    $('login-button').disabled = false;
  }
});
$('logout').addEventListener('click', async () => {
  if (
    saving ||
    (drafts.size && !window.confirm('Sign out and discard unsaved attendance changes?'))
  )
    return;
  try {
    await api('logout', {});
    showLogin();
  } catch (error) {
    if (error.status === 401) showLogin();
    else message($('desk-message'), 'Sign out failed. Please try again.', true);
  }
});
$('refresh').addEventListener('click', load);
$('doctor-search').addEventListener('input', applyFilters);
$('doctor-filter').addEventListener('change', applyFilters);
window.addEventListener('beforeunload', (event) => {
  if (drafts.size) {
    event.preventDefault();
    event.returnValue = '';
  }
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !drafts.size) load();
});
setInterval(() => {
  if (!document.hidden && !drafts.size) load();
}, 30000);

try {
  session = await api('session');
  $('demo-label').hidden = !session.demo;
  if (session.authenticated) {
    showDesk();
    await load();
  } else showLogin();
} catch {
  showLogin('Unable to reach the server. Try signing in again.');
}
