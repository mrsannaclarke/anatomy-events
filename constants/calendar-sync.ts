import Constants from 'expo-constants';

export interface CalendarSyncConfig {
  icsUrl: string;
  monthsBack: number;
  monthsAhead: number;
}

const extra = ((Constants.expoConfig?.extra ??
  Constants.manifest2?.extra ??
  {}) as {
  calendarIcsUrl?: string;
  calendarMonthsBack?: number | string;
  calendarMonthsAhead?: number | string;
});

const envIcsUrl = typeof process !== 'undefined' ? process.env.EXPO_PUBLIC_CALENDAR_ICS_URL : undefined;
const envMonthsBack =
  typeof process !== 'undefined' ? process.env.EXPO_PUBLIC_CALENDAR_MONTHS_BACK : undefined;
const envMonthsAhead =
  typeof process !== 'undefined' ? process.env.EXPO_PUBLIC_CALENDAR_MONTHS_AHEAD : undefined;

function parsePositiveInt(value: string | number | undefined, fallback: number): number {
  if (value == null) return fallback;
  const n = Number.parseInt(String(value), 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

export const CALENDAR_SYNC_CONFIG: CalendarSyncConfig = {
  icsUrl: (
    extra.calendarIcsUrl ||
    envIcsUrl ||
    ''
  ).trim(),
  monthsBack: parsePositiveInt(extra.calendarMonthsBack ?? envMonthsBack, 6),
  monthsAhead: parsePositiveInt(extra.calendarMonthsAhead ?? envMonthsAhead, 9),
};

export function hasCalendarSyncConfig(config: CalendarSyncConfig = CALENDAR_SYNC_CONFIG): boolean {
  return config.icsUrl.length > 0;
}
