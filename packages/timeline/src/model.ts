import type { QueryResult } from '@ldforge/core';
export interface TimelineItem {
  id: string;
  label: string;
  start: Date;
  end?: Date;
  group?: string;
  link?: string;
  description?: string;
  image?: string;
}
export class TimelineDataError extends Error {
  constructor(readonly row: number) {
    super(`Invalid timeline binding at row ${row}.`);
  }
}
/** ISO year/month/day or a timezone-qualified dateTime; no locale-dependent Date parsing. */
export function parseTimelineDate(value: string): Date {
  const match =
    /^([+-]?\d{4,6})(?:-(\d{2})(?:-(\d{2})(T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?)?)?$/.exec(
      value.trim(),
    );
  if (!match) throw new Error('Expected ISO date.');
  const year = Number(match[1]),
    month = Number(match[2] ?? 1),
    day = Number(match[3] ?? 1);
  const calendar = new Date(0);
  calendar.setUTCFullYear(year, month - 1, day);
  calendar.setUTCHours(0, 0, 0, 0);
  if (
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() !== month - 1 ||
    calendar.getUTCDate() !== day
  )
    throw new Error('Invalid calendar date.');
  if (!match[4]) return calendar;
  const time = match[4];
  if (
    Number(time.slice(1, 3)) > 23 ||
    Number(time.slice(4, 6)) > 59 ||
    Number(time.slice(7, 9)) > 59
  )
    throw new Error('Invalid time.');
  const isoYear =
    year >= 0 && year <= 9999
      ? String(year).padStart(4, '0')
      : `${year < 0 ? '-' : '+'}${String(Math.abs(year)).padStart(6, '0')}`;
  const date = new Date(
    `${isoYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}${time}`,
  );
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid date.');
  return date;
}
export function buildTimelineModel(result: QueryResult): TimelineItem[] {
  if (result.kind !== 'bindings') return [];
  return result.bindings.map((row, index) => {
    try {
      const label = row.timelineLabel?.value;
      const start = row.timelineStart;
      const end = row.timelineEnd;
      if (
        !label?.trim() ||
        !start ||
        !['literal', 'typed-literal'].includes(start.type) ||
        (end && !['literal', 'typed-literal'].includes(end.type))
      )
        throw new Error('Missing date/label.');
      const date = parseTimelineDate(start.value);
      const endDate = end ? parseTimelineDate(end.value) : undefined;
      if (endDate && endDate < date) throw new Error('End before start.');
      return {
        id: String(index),
        label,
        start: date,
        ...(endDate ? { end: endDate } : {}),
        ...(row.timelineGroup?.value ? { group: row.timelineGroup.value } : {}),
        ...(row.timelineLink?.value ? { link: row.timelineLink.value } : {}),
        ...(row.timelineImage?.value ? { image: row.timelineImage.value } : {}),
        ...(row.timelineDescription?.value
          ? { description: row.timelineDescription.value }
          : {}),
      };
    } catch {
      throw new TimelineDataError(index + 1);
    }
  });
}
