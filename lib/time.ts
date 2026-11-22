export type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: string;
};

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  let hour = Number(get("hour"));
  if (hour === 24) hour = 0;
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour,
    minute: Number(get("minute")),
    weekday: get("weekday"),
  };
}

export function zonedISODate(date: Date, timeZone: string): string {
  const parts = zonedParts(date, timeZone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

export function shiftZonedDate(
  parts: Pick<ZonedParts, "year" | "month" | "day">,
  days: number,
): Pick<ZonedParts, "year" | "month" | "day"> {
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

/** UTC instant whose wall clock in `timeZone` matches the given civil time. */
export function zonedDateTime(input: {
  timeZone: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}): Date {
  const asUtc = new Date(
    Date.UTC(input.year, input.month - 1, input.day, input.hour, input.minute, 0),
  );
  const observed = zonedParts(asUtc, input.timeZone);
  const observedAsUtc = Date.UTC(
    observed.year,
    observed.month - 1,
    observed.day,
    observed.hour,
    observed.minute,
    0,
  );
  const desiredAsUtc = Date.UTC(
    input.year,
    input.month - 1,
    input.day,
    input.hour,
    input.minute,
    0,
  );
  return new Date(asUtc.getTime() + (desiredAsUtc - observedAsUtc));
}

export function formatClock(date: Date, timeZone: string): string {
  const parts = zonedParts(date, timeZone);
  return `${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function formatDay(date: Date, timeZone: string, now: Date): string {
  const day = zonedISODate(date, timeZone);
  const today = zonedISODate(now, timeZone);
  const tomorrow = zonedISODate(
    zonedDateTime({
      timeZone,
      ...shiftZonedDate(zonedParts(now, timeZone), 1),
      hour: 12,
      minute: 0,
    }),
    timeZone,
  );
  if (day === today) return "today";
  if (day === tomorrow) return "tomorrow";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);
}

export function formatRange(
  startIso: string,
  endIso: string,
  timeZone: string,
  now: Date,
): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  return `${formatDay(start, timeZone, now)} ${formatClock(start, timeZone)}–${formatClock(end, timeZone)}`;
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const SHORT_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function parseWhen(
  text: string,
  now: Date,
  timeZone: string,
): { start: Date; end: Date } | null {
  const lower = text.toLowerCase();
  const parts = zonedParts(now, timeZone);
  let dayOffset: number | null = null;

  if (/\btoday\b/.test(lower)) dayOffset = 0;
  else if (/\btomorrow\b/.test(lower)) dayOffset = 1;
  else {
    for (let index = 0; index < WEEKDAYS.length; index += 1) {
      if (new RegExp(`\\b${WEEKDAYS[index]}\\b`).test(lower)) {
        const current = SHORT_WEEKDAYS.indexOf(parts.weekday);
        let delta = index - current;
        if (delta <= 0) delta += 7;
        dayOffset = delta;
        break;
      }
    }
  }

  const hasTime = /\bmorning\b|\bafternoon\b|\bevening\b|\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/.test(
    lower,
  );
  if (dayOffset === null && hasTime) dayOffset = 0;
  if (dayOffset === null) return null;

  let hour = 9;
  let minute = 0;
  const clock = lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (clock) {
    hour = Number(clock[1]) % 12;
    if (clock[3] === "pm") hour += 12;
    minute = clock[2] ? Number(clock[2]) : 0;
  } else if (/\bafternoon\b/.test(lower)) hour = 14;
  else if (/\bevening\b/.test(lower)) hour = 18;

  let durationMin = 60;
  const minutes = lower.match(/\b(\d+)\s*(?:minutes|minute|mins|min)\b/);
  const hours = lower.match(/\b(\d+(?:\.\d+)?)\s*(?:hours|hour|hrs|hr)\b/);
  if (minutes) durationMin = Number(minutes[1]);
  else if (hours) durationMin = Math.round(Number(hours[1]) * 60);
  if (!Number.isFinite(durationMin) || durationMin <= 0 || durationMin > 24 * 60) {
    durationMin = 60;
  }

  const day = shiftZonedDate(parts, dayOffset);
  const start = zonedDateTime({ timeZone, ...day, hour, minute });
  return { start, end: new Date(start.getTime() + durationMin * 60_000) };
}

export function dayBounds(
  now: Date,
  timeZone: string,
  offsetDays = 0,
): { start: Date; end: Date } {
  const day = shiftZonedDate(zonedParts(now, timeZone), offsetDays);
  const start = zonedDateTime({ timeZone, ...day, hour: 0, minute: 0 });
  const end = zonedDateTime({
    timeZone,
    ...shiftZonedDate(day, 1),
    hour: 0,
    minute: 0,
  });
  return { start, end };
}
