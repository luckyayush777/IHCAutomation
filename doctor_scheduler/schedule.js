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
