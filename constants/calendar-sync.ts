import Constants from 'expo-constants';

export interface CalendarSyncConfig {
  icsUrls: string[];
  monthsBack: number;
  monthsAhead: number;
}

const DEFAULT_CALENDAR_ICS_URLS = [
  'https://calendar.google.com/calendar/ical/ds0rvh3aca5an0945nvqch4bt8%40group.calendar.google.com/private-1e228a80bbab6e84f331a1ac8b50eddb/basic.ics',
  'https://calendar.google.com/calendar/ical/3a9a300d8b145bb1135f8b8f2fd3d0d9def28d964e0f160c8c3373d9e6ec6085%40group.calendar.google.com/private-9e760b5ca4490cf3a055ac64154a0a9c/basic.ics',
  'https://calendar.google.com/calendar/ical/ladyshytattoos%40gmail.com/private-01fdceb7fc4ea0c4375b1200604b389b/basic.ics',
] as const;

const extra = ((Constants.expoConfig?.extra ??
  Constants.manifest2?.extra ??
  {}) as {
  calendarIcsUrl?: string;
  calendarIcsUrls?: string[] | string;
  calendarMonthsBack?: number | string;
  calendarMonthsAhead?: number | string;
});

const envIcsUrl = typeof process !== 'undefined' ? process.env.EXPO_PUBLIC_CALENDAR_ICS_URL : undefined;
const envIcsUrls = typeof process !== 'undefined' ? process.env.EXPO_PUBLIC_CALENDAR_ICS_URLS : undefined;
const envMonthsBack =
  typeof process !== 'undefined' ? process.env.EXPO_PUBLIC_CALENDAR_MONTHS_BACK : undefined;
const envMonthsAhead =
  typeof process !== 'undefined' ? process.env.EXPO_PUBLIC_CALENDAR_MONTHS_AHEAD : undefined;

function parseCalendarUrlList(value: string[] | string | undefined): string[] {
  if (value == null) return [];
  const rawValues = Array.isArray(value) ? value : [value];
  const urls = rawValues
    .flatMap((item) => String(item).split(/[\n,;]+/g))
    .map((item) => item.trim())
    .filter(Boolean);
  return [...new Set(urls)];
}

function parsePositiveInt(value: string | number | undefined, fallback: number): number {
  if (value == null) return fallback;
  const n = Number.parseInt(String(value), 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

const configuredCalendarIcsUrls = [
  ...parseCalendarUrlList(extra.calendarIcsUrls),
  ...parseCalendarUrlList(extra.calendarIcsUrl),
  ...parseCalendarUrlList(envIcsUrls),
  ...parseCalendarUrlList(envIcsUrl),
].filter((url, index, all) => all.indexOf(url) === index);

export const CALENDAR_SYNC_CONFIG: CalendarSyncConfig = {
  icsUrls: configuredCalendarIcsUrls.length > 0 ? configuredCalendarIcsUrls : [...DEFAULT_CALENDAR_ICS_URLS],
  monthsBack: parsePositiveInt(extra.calendarMonthsBack ?? envMonthsBack, 12),
  monthsAhead: parsePositiveInt(extra.calendarMonthsAhead ?? envMonthsAhead, 12),
};

export function hasCalendarSyncConfig(config: CalendarSyncConfig = CALENDAR_SYNC_CONFIG): boolean {
  return config.icsUrls.length > 0;
}
