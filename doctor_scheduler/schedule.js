export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function minutes(time) {
  const [hours, mins] = time.split(':').map(Number);
  return hours * 60 + mins;
}

// Start inclusive, end exclusive: a doctor leaves the current list at shift end.
// Overnight rows belong to their starting day; reference CSV splits at midnight.
export function isActive(shift, day, time) {
  const start = minutes(shift.start);
  const end = minutes(shift.end);
  const now = minutes(time);
  const days = shift.days ?? [shift.day];
  if (end > start) return days.includes(day) && now >= start && now < end;
  if (end === start) return false;
  const previousDay = DAYS[(DAYS.indexOf(day) + 6) % 7];
  return (days.includes(day) && now >= start) || (days.includes(previousDay) && now < end);
}

export function nextShift(shifts, day, time) {
  const now = minutes(time);
  const index = DAYS.indexOf(day);
  return (
    shifts
      .map((shift) => {
        let offset =
          ((DAYS.indexOf(shift.day) - index + 7) % 7) * 1440 + minutes(shift.start) - now;
        if (offset <= 0) offset += 7 * 1440;
        return { ...shift, offset };
      })
      .sort((a, b) => a.offset - b.offset)[0] ?? null
  );
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
