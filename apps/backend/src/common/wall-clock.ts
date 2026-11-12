export function toWallClock(date: Date, timeZone: string | null): Date {
  if (!timeZone) return date;

  const parts = Object.fromEntries(
    createFormatter(timeZone)
      .formatToParts(date)
      .map(part => [part.type, Number(part.value)]),
  );

  return new Date(
    Date.UTC(
      parts['year'],
      parts['month'] - 1,
      parts['day'],
      parts['hour'],
      parts['minute'],
      parts['second'],
      date.getUTCMilliseconds(),
    ),
  );
}

export function fromWallClock(wall: Date, timeZone: string | null): Date {
  if (!timeZone) return wall;

  const offsetAt = (date: Date) => toWallClock(date, timeZone).getTime() - date.getTime();
  const guess = new Date(wall.getTime() - offsetAt(wall));
  return new Date(wall.getTime() - offsetAt(guess));
}

function createFormatter(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  });
}
