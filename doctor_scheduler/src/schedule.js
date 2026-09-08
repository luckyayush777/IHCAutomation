export function attendanceGroups(doctors, shifts, attendance, day, disconnected = false) {
  const available = !disconnected && attendance?.status === 'ok' && attendance.date === day;
  const records = new Map(
    (available ? attendance.records : []).map((record) => [record.name, record]),
  );
  const groups = {
    confirmed: { label: 'Scheduled and confirmed present', doctors: [] },
    absent: { label: 'Scheduled but not present', doctors: [] },
    unconfirmed: { label: 'Awaiting confirmation', doctors: [] },
    unscheduled: { label: 'Reported present, not scheduled', doctors: [] },
    unpublished: { label: 'Reported present, roster not published', doctors: [] },
  };
  for (const doctor of doctors) {
    const planned = (shifts || []).filter((shift) => shift.name === doctor.name);
    const record = records.get(doctor.name);
    let group;
    if (planned.length) {
      group =
        record?.state === 'present'
          ? 'confirmed'
          : record?.state === 'absent'
            ? 'absent'
            : 'unconfirmed';
    } else if (record?.state === 'present') {
      group = shifts === undefined ? 'unpublished' : 'unscheduled';
    }
    if (group)
      groups[group].doctors.push({ ...doctor, shifts: planned, reportedAt: record?.updated_at });
  }
  return { available, groups };
}

export function mergeActualSchedule(monthlySchedule = {}, admin = null) {
  const merged = Object.fromEntries(
    Object.entries(monthlySchedule).map(([day, shifts]) => [
      day,
      Array.isArray(shifts) ? shifts.map((shift) => ({ ...shift })) : shifts,
    ]),
  );
  const overrides = admin?.actual_schedule ?? admin?.schedule;
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) return merged;
  for (const [day, shifts] of Object.entries(overrides)) {
    if (shifts === null) delete merged[day];
    else if (Array.isArray(shifts)) merged[day] = shifts.map((shift) => ({ ...shift }));
  }
  return merged;
}

export function adminAttendanceGroups(doctors, admin, day, disconnected = false) {
  const available =
    !disconnected &&
    admin?.date === day &&
    (admin.status === undefined || admin.status === 'ok') &&
    Array.isArray(admin.records);
  const profiles = new Map(doctors.map((doctor) => [doctor.name, doctor]));
  const groups = {
    present: { label: 'Marked present', doctors: [] },
    absent: { label: 'Marked absent', doctors: [] },
    unconfirmed: { label: 'Awaiting confirmation', doctors: [] },
  };
  for (const record of available ? admin.records : []) {
    if (!record || typeof record.name !== 'string' || !record.name.trim()) continue;
    const profile = profiles.get(record.name) ?? {
      name: record.name,
      role: record.role ?? '',
      qual: record.qual ?? '',
    };
    const state =
      record.state === 'present' || record.state === 'absent' ? record.state : 'unconfirmed';
    groups[state].doctors.push({
      ...profile,
      shifts: Array.isArray(record.shifts) ? record.shifts : [],
      reportedAt: record.updated_at,
    });
  }
  return { available, groups };
}

export function indiaClock(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map(({ type, value }) => [type, value]),
  );
  return {
    day: parts.weekday,
    time: `${parts.hour}:${parts.minute}`,
    date: new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day))),
  };
}
