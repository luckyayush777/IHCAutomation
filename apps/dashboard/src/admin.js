import './admin.css';

const apiUrl = window.location.port === '4000' ? window.location.origin : 'http://localhost:4000';
const rosterEndpoint = `${apiUrl}/api/v1/admin/roster`;
const tokenKey = 'ihc-roster-admin-token';
const elements = {
  editor: document.querySelector('[data-editor]'),
  error: document.querySelector('[data-admin-error]'),
  form: document.querySelector('[data-doctor-form]'),
  formTitle: document.querySelector('[data-form-title]'),
  list: document.querySelector('[data-doctor-list]'),
  login: document.querySelector('[data-login-form]'),
  newDoctor: document.querySelector('[data-new-doctor]'),
  saveState: document.querySelector('[data-save-state]'),
};
let roster;
let selectedCode;

function token() {
  return sessionStorage.getItem(tokenKey) ?? '';
}

function setError(message = '') {
  elements.error.textContent = message;
  elements.error.toggleAttribute('hidden', !message);
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      authorization: `Bearer ${token()}`,
      'content-type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      body.details?.join('; ') ?? body.error ?? `Request failed (${response.status})`,
    );
  return body;
}

function slotsFor(doctorId) {
  return roster.doctorAvailability
    .filter((slot) => slot.doctor_id === doctorId)
    .map((slot) => ({
      weekday: slot.weekday,
      startTime: slot.start_time.slice(0, 5),
      endTime: slot.end_time.slice(0, 5),
      availabilityType: slot.availability_type,
      note: slot.note ?? '',
      validFrom: slot.valid_from ?? '',
      validUntil: slot.valid_until ?? '',
    }));
}

function renderList() {
  elements.list.replaceChildren();
  for (const doctor of roster.doctors) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.doctorCode = doctor.doctor_code;
    button.classList.toggle('is-selected', doctor.doctor_code === selectedCode);
    const name = document.createElement('strong');
    name.textContent = doctor.display_name;
    const role = document.createElement('span');
    role.textContent = `${doctor.role}${doctor.is_active ? '' : ' · hidden'}`;
    button.append(name, role);
    elements.list.append(button);
  }
}

function editDoctor(doctorCode) {
  const doctor = roster.doctors.find((item) => item.doctor_code === doctorCode);
  if (!doctor) return;
  selectedCode = doctorCode;
  elements.formTitle.textContent = `Edit ${doctor.display_name}`;
  elements.form.elements.doctorCode.value = doctor.doctor_code;
  elements.form.elements.doctorCode.readOnly = true;
  elements.form.elements.displayName.value = doctor.display_name;
  elements.form.elements.role.value = doctor.role;
  elements.form.elements.department.value = doctor.department ?? '';
  elements.form.elements.room.value = doctor.room ?? '';
  elements.form.elements.displayOrder.value = doctor.display_order;
  elements.form.elements.isActive.checked = doctor.is_active;
  elements.form.elements.availability.value = JSON.stringify(slotsFor(doctor.id), null, 2);
  renderList();
}

function newDoctor() {
  selectedCode = undefined;
  elements.form.reset();
  elements.formTitle.textContent = 'Add doctor';
  elements.form.elements.doctorCode.readOnly = false;
  elements.form.elements.displayOrder.value = roster.doctors.length + 1;
  elements.form.elements.isActive.checked = true;
  elements.form.elements.availability.value = JSON.stringify(
    [
      {
        weekday: 1,
        startTime: '09:00',
        endTime: '17:00',
        availabilityType: 'available',
        note: '',
        validFrom: '',
        validUntil: '',
      },
    ],
    null,
    2,
  );
  renderList();
}

async function loadRoster() {
  roster = await apiRequest(rosterEndpoint);
  elements.login.setAttribute('hidden', '');
  elements.editor.removeAttribute('hidden');
  renderList();
  if (roster.doctors.length) editDoctor(selectedCode ?? roster.doctors[0].doctor_code);
  else newDoctor();
}

elements.login.addEventListener('submit', async (event) => {
  event.preventDefault();
  sessionStorage.setItem(tokenKey, new FormData(elements.login).get('token'));
  setError();
  try {
    await loadRoster();
  } catch (error) {
    sessionStorage.removeItem(tokenKey);
    setError(error.message);
  }
});

elements.list.addEventListener('click', (event) => {
  const button = event.target.closest('[data-doctor-code]');
  if (button) editDoctor(button.dataset.doctorCode);
});

elements.newDoctor.addEventListener('click', newDoctor);

elements.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  setError();
  elements.saveState.textContent = 'Saving…';
  try {
    const fields = new FormData(elements.form);
    const availability = JSON.parse(fields.get('availability'));
    const doctorCode = String(fields.get('doctorCode')).trim();
    await apiRequest(`${apiUrl}/api/v1/admin/doctors/${encodeURIComponent(doctorCode)}`, {
      method: 'PUT',
      body: JSON.stringify({
        displayName: fields.get('displayName'),
        role: fields.get('role'),
        department: fields.get('department'),
        room: fields.get('room'),
        displayOrder: Number(fields.get('displayOrder')),
        isActive: fields.get('isActive') === 'on',
        availability,
      }),
    });
    selectedCode = doctorCode;
    await loadRoster();
    elements.saveState.textContent = 'Saved';
  } catch (error) {
    elements.saveState.textContent = '';
    setError(error instanceof Error ? error.message : 'Unable to save roster entry');
  }
});

if (token()) loadRoster().catch((error) => setError(error.message));
