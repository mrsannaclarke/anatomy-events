import { ARTIST_PAY_SHEET_TABS } from '@/constants/pay-framework';
import { DEFAULT_WEB_APP_URL, type SheetSyncConfig } from '@/constants/sheets-sync';
import { computeEventTotals, parseMoney } from '@/lib/event-math';
import {
  buildPricingSchedulePayoutKey,
  type PricingSchedulePayoutMap,
} from '@/lib/pay-framework';
import {
  buildStaffTabPayoutOverrideKey,
  type StaffTabLinkIssue,
  type StaffTabOverrideDiagnostics,
  type StaffTabPayoutOverride,
  type StaffTabPayoutOverrideMap,
  type StaffTabPayoutOverridesSnapshot,
} from '@/lib/payout-overrides';
import { EMPTY_EVENT, type EventRecord } from '@/types/events';
import { Platform } from 'react-native';

type ApiEvent = Partial<EventRecord>;

interface ListEventsResponse {
  ok: boolean;
  error?: string;
  events?: ApiEvent[];
}

interface HealthResponse {
  ok: boolean;
  error?: string;
  version?: string;
  spreadsheetId?: string;
  sourceMode?: string;
  sheetStats?: {
    Events?: {
      rows?: number;
      columns?: number;
    };
  };
}

interface ListArtistsResponse {
  ok: boolean;
  error?: string;
  artists?: {
    name?: string;
    primaryName?: string;
    license?: string;
    assignment?: string;
  }[];
}

interface UpsertEventResponse {
  ok: boolean;
  error?: string;
  event?: ApiEvent;
}

interface CounterStaffChargeResponse {
  ok: boolean;
  error?: string;
  charge?: number | string;
}

interface DeleteEventResponse {
  ok: boolean;
  error?: string;
  deleted?: boolean;
  entryId?: string;
  sourceRow?: number | string;
}

interface GenerateByEntryResponse {
  ok: boolean;
  error?: string;
  entryId?: string;
  row?: number | string;
  kind?: string;
  contractUrl?: string;
  tflUrl?: string;
}

interface UploadArtImageResponse {
  ok: boolean;
  error?: string;
  entryId?: string;
  row?: number | string;
  fileId?: string;
  fileName?: string;
  artImageUrl?: string;
  event?: ApiEvent;
}

interface SheetTabsResponse {
  ok: boolean;
  error?: string;
  tabs?: {
    title?: string;
    lastRow?: number;
    lastColumn?: number;
  }[];
}

interface SheetTabRowsResponse {
  ok: boolean;
  error?: string;
  tabName?: string;
  header?: string[];
  rows?: {
    rowNumber?: number;
    cells?: string[];
  }[];
}

const FALLBACK_ARTIST_NAMES = [
  'Tomma',
  'Shy',
  'Megan',
  'Sisi',
  'Drew',
  'Agnes',
  'Lindsay',
  'Jayden',
  'Summer',
  'Anna',
  'Jake',
  'Lucky',
  'Anne',
  'Jazz',
];

const ARTIST_DISPLAY_ORDER = [
  'Tomma',
  'Shy',
  'Megan',
  'Sisi',
  'Drew',
  'Agnes',
  'Lindsay',
  'Jayden',
  'Summer',
  'Anna',
  'Jake',
  'Lucky',
  'Anne',
  'Jazz',
];

const ARTIST_ORDER_INDEX: Record<string, number> = ARTIST_DISPLAY_ORDER.reduce<Record<string, number>>(
  (acc, name, index) => {
    acc[name.toLowerCase()] = index;
    return acc;
  },
  {},
);

const STAFF_TAB_COL_ENTRY_ID = 0;
const STAFF_TAB_COL_EVENT_DATE = 2;
const STAFF_TAB_COL_CLIENT_NAME = 3;
const STAFF_TAB_COL_EVENT_ARTISTS = 4;
const STAFF_TAB_COL_ARTIST_EVENT_PAYOUT = 6;
const STAFF_TAB_COL_COUNTER_NAME = 8;
const STAFF_TAB_COL_ARTIST_COUNTER_PAYOUT = 9;
const STAFF_TAB_COL_ARTIST_TOTAL = 10;
const STAFF_TAB_COL_EVENT_COMPLETE_ROW_LINK = 25;

const STAFF_TAB_CACHE_TTL_MS = 1000 * 60 * 5;
const STAFF_TAB_DIAGNOSTIC_ISSUE_LIMIT = 40;
const PRICING_SCHEDULE_COL_PLAN_NAME = 0;
const PRICING_SCHEDULE_COL_ARTISTS = 1;
const PRICING_SCHEDULE_COL_RADIUS_ARTIST_SHARE = 6;
const PRICING_SCHEDULE_COL_EXTRA_HOURLY_ARTIST_SHARE = 8;
const PRICING_SCHEDULE_COL_CUSTOM_FLASH_ARTIST_BONUS = 10;
const PRICING_SCHEDULE_COL_BASE_PAY_PER_ARTIST = 19;
const EVENT_COMPLETE_COL_ENTRY_ID = 0;
const EVENT_COMPLETE_COL_ARTIST_NAMES = 4;
const EVENT_COMPLETE_COL_COUNTER_NAMES = 8;
const EVENT_COMPLETE_COL_ARTIST_PAY = 6;
const EVENT_COMPLETE_COL_COUNTER_FEE = 7;
const EVENT_COMPLETE_COL_OPTIONAL_FEE = 9;
const EVENT_COMPLETE_COL_RADIUS_FEE = 10;
const EVENT_COMPLETE_COL_RADIUS_SHOP = 12;
const EVENT_COMPLETE_COL_EXTRA_HOURLY_ARTIST = 15;
const EVENT_COMPLETE_COL_EXTRA_HOURLY_SHOP = 16;
const EVENT_COMPLETE_COL_CUSTOM_FLASH_FEE = 17;
const EVENT_COMPLETE_COL_CUSTOM_FLASH_SHOP = 19;
const EVENT_COMPLETE_COL_TEMP_TATTOO_FEE = 20;
const EVENT_COMPLETE_COL_TFL_FEE = 21;
const EVENT_COMPLETE_COL_TOTAL_FOR_EVENT = 22;
const EVENT_COMPLETE_COL_SHOP_PROFIT = 23;
const EVENT_DETAILS_COL_ENTRY_ID = 1;
const EVENT_DETAILS_COL_CONTRACT_URL = 32;
const EVENT_DETAILS_COL_TFL_URL = 35;
let cachedStaffTabOverrides: {
  configKey: string;
  fetchedAtMs: number;
  snapshot: StaffTabPayoutOverridesSnapshot;
} | null = null;

export type CompletedEventStaffAssignment = {
  artistNames: string;
  counterNames: string;
  artistPayTotal: number;
  counterFeeTotal: number;
  optionalFeeTotal: number;
  radiusFeeTotal: number;
  radiusShopTotal: number;
  extraHourlyArtistTotal: number;
  extraHourlyShopTotal: number;
  customFlashFeeTotal: number;
  customFlashShopTotal: number;
  temporaryTattooFeeTotal: number;
  tempFacilityLicenseFeeTotal: number;
  totalForEvent: number;
  shopProfit: number;
  hasTotalForEvent: boolean;
  hasShopProfit: boolean;
};

export type CompletedEventStaffAssignmentMap = Record<string, CompletedEventStaffAssignment>;

export interface SheetSyncHealthSnapshot {
  version: string;
  spreadsheetId: string;
  sourceMode: string;
  eventsRows: number;
}

function sortArtistNamesByPreferredOrder(names: string[]): string[] {
  return [...names].sort((a, b) => {
    const aIndex = ARTIST_ORDER_INDEX[a.toLowerCase()];
    const bIndex = ARTIST_ORDER_INDEX[b.toLowerCase()];
    const aKnown = aIndex != null;
    const bKnown = bIndex != null;

    if (aKnown && bKnown) return aIndex - bIndex;
    if (aKnown) return -1;
    if (bKnown) return 1;
    return a.localeCompare(b);
  });
}

const ARTIST_ALIAS_TO_ED_ENTRY: Record<string, string> = {
  tomma: 'Tomma',
  'tomma mueller': 'Tomma',
  lucky: 'Lucky',
  jessie: 'Lucky',
  jesse: 'Lucky',
  'jessie smith': 'Lucky',
  'jesse smith': 'Lucky',
  'jesse malony': 'Lucky',
  jake: 'Jake',
  'jacob tong': 'Jake',
  anna: 'Anna',
  'anna clarke': 'Anna',
  shy: 'Shy',
  'lady shy': 'Shy',
  'tylr cheyenne barnes': 'Shy',
  agnes: 'Agnes',
  agnus: 'Agnes',
  aggie: 'Agnes',
  'aggie q': 'Agnes',
  angie: 'Agnes',
  'agnes lauer': 'Agnes',
  drew: 'Drew',
  'drew linden': 'Drew',
  megan: 'Megan',
  meg: 'Megan',
  'megan echevarria': 'Megan',
  sisi: 'Sisi',
  sissy: 'Sisi',
  sis: 'Sisi',
  sisilia: 'Sisi',
  'sisilia husing': 'Sisi',
  lindsay: 'Lindsay',
  lindsey: 'Lindsay',
  linds: 'Lindsay',
  honeyandsass: 'Lindsay',
  'lindsay swing': 'Lindsay',
  summer: 'Summer',
  sumer: 'Summer',
  'summer ketchum': 'Summer',
  anne: 'Anne',
  'anne morando': 'Anne',
  jayden: 'Jayden',
  jaydan: 'Jayden',
  jay: 'Jayden',
  'baby j': 'Jayden',
  j: 'Jayden',
  'jayden mueller': 'Jayden',
  jazz: 'Jazz',
  jazzy: 'Jazz',
  'jazz stahr': 'Jazz',
};

function normalizeAliasKey(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeArtistNamesToEdEntry(value: string): string {
  const normalizedParts = value
    .split(/[,\n;/&]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const aliasKey = normalizeAliasKey(part);
      return ARTIST_ALIAS_TO_ED_ENTRY[aliasKey] || part;
    });

  const deduped: string[] = [];
  const seen = new Set<string>();
  normalizedParts.forEach((name) => {
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    deduped.push(name);
  });

  return deduped.join(', ');
}

function normalizeImportedTime(value: string): string {
  const raw = value.trim();
  if (!raw) return '';

  const meridiemMatch = raw.match(/^(\d{1,4})(?::(\d{2}))?(?::\d{2})?\s*([AaPp])(?:\.?\s*[Mm]\.?)?$/);
  if (meridiemMatch) {
    const digits = meridiemMatch[1];
    const meridiem = meridiemMatch[3].toUpperCase();
    let hour = 0;
    let minute = 0;

    if (meridiemMatch[2] != null) {
      hour = Number.parseInt(digits, 10);
      minute = Number.parseInt(meridiemMatch[2], 10);
    } else if (digits.length <= 2) {
      hour = Number.parseInt(digits, 10);
      minute = 0;
    } else if (digits.length === 3 || digits.length === 4) {
      hour = Number.parseInt(digits.slice(0, digits.length - 2), 10);
      minute = Number.parseInt(digits.slice(-2), 10);
    }

    if (hour >= 1 && hour <= 12 && minute >= 0 && minute <= 59) {
      return `${hour}:${String(minute).padStart(2, '0')} ${meridiem}M`;
    }
  }

  const twentyFourHourMatch = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (twentyFourHourMatch) {
    const h24 = Number.parseInt(twentyFourHourMatch[1], 10);
    const minute = Number.parseInt(twentyFourHourMatch[2], 10);
    if (h24 >= 0 && h24 <= 23 && minute >= 0 && minute <= 59) {
      const meridiem = h24 >= 12 ? 'PM' : 'AM';
      const h12 = h24 % 12 || 12;
      return `${h12}:${String(minute).padStart(2, '0')} ${meridiem}`;
    }
  }

  return raw;
}

function normalizeUnifiedStatus(status: string, payStatus: string): string {
  const primary = status.trim();
  const fallback = payStatus.trim();
  const raw = primary || fallback;
  if (!raw) return '';

  const normalized = raw.toLowerCase().replace(/\s+/g, ' ').trim();
  if (normalized === 'balance late') return 'Event Complete Balance Late';
  if (normalized === 'event complete - balance late') return 'Event Complete Balance Late';
  if (normalized === 'event complete balance late') return 'Event Complete Balance Late';
  if (normalized === 'event complete') return 'Event Complete';
  return raw;
}

function normalizeNameKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function parseNameList(value: string): string[] {
  return value
    .split(/[,\n;/&]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function listHasName(list: string[], name: string): boolean {
  const target = normalizeNameKey(name);
  if (!target) return false;
  return list.some((entry) => normalizeNameKey(entry) === target);
}

function normalizeCell(value: string | undefined): string {
  return String(value || '').trim();
}

function normalizeUrlCell(value: string | undefined): string {
  const normalized = normalizeCell(value);
  return /^https?:\/\//i.test(normalized) ? normalized : '';
}

function buildConfigKey(config: SheetSyncConfig): string {
  return `${config.webAppUrl.trim()}::${config.apiToken.trim()}`;
}

function toPositiveMoney(value: string): number {
  const parsed = parseMoney(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, parsed);
}

function parsePositiveInteger(value: string | undefined): number {
  const normalized = normalizeCell(value);
  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return parsed;
}

function parsePercent(value: string | undefined): number {
  const normalized = normalizeCell(value);
  if (!normalized) return 0;
  if (normalized.endsWith('%')) {
    const parsed = Number.parseFloat(normalized.slice(0, -1));
    if (!Number.isFinite(parsed)) return 0;
    return parsed / 100;
  }
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) return 0;
  return parsed;
}

function canonicalHeaderLabel(value: string | undefined): string {
  return normalizeCell(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function isExpectedStaffTabHeaderShape(header: string[]): boolean {
  if (!header || header.length < 11) return false;
  const expectedByIndex: Record<number, string> = {
    2: 'eventdate',
    3: 'clientname',
    4: 'eventartists',
    5: 'artists',
    6: 'artisteventpayout',
    7: 'counterfee',
    8: 'countername',
    9: 'artistcounterpayout',
    10: 'artisttotalevent',
  };

  return Object.entries(expectedByIndex).every(([indexRaw, expected]) => {
    const index = Number.parseInt(indexRaw, 10);
    return canonicalHeaderLabel(header[index]) === expected;
  });
}

function createDiagnostics(): StaffTabOverrideDiagnostics {
  return {
    tabDiscoverySource: 'live_sheettabs',
    checkedTabs: 0,
    checkedRows: 0,
    tabFetchFailureCount: 0,
    headerMismatchTabNames: [],
    missingRowLinkCount: 0,
    rowLinkMismatchCount: 0,
    duplicateOverrideCount: 0,
    issues: [],
    hasWarnings: false,
  };
}

function pushDiagnosticIssue(
  diagnostics: StaffTabOverrideDiagnostics,
  issue: StaffTabLinkIssue,
): void {
  if (diagnostics.issues.length < STAFF_TAB_DIAGNOSTIC_ISSUE_LIMIT) {
    diagnostics.issues.push(issue);
  }
}

function isUnknownActionError(errorMessage: string, actionName: string): boolean {
  const normalized = errorMessage.trim().toLowerCase();
  if (!normalized) return false;
  return normalized.includes(`unknown action: ${actionName.toLowerCase()}`);
}

function isSheetTabNotFoundError(errorMessage: string, tabName: string): boolean {
  const normalized = errorMessage.trim().toLowerCase();
  if (!normalized) return false;
  return normalized.includes(`sheet tab '${tabName.toLowerCase()}' not found`);
}

type ParsedStaffTabOverride = {
  override: StaffTabPayoutOverride;
  eventCompleteRowRef: number;
};

function parseStaffTabOverrideRow(
  tabName: string,
  rowNumber: number,
  cells: string[],
): ParsedStaffTabOverride | null {
  const personName = tabName.trim();
  const entryId = normalizeCell(cells[STAFF_TAB_COL_ENTRY_ID]);
  if (!entryId) return null;

  const eventArtists = parseNameList(normalizeCell(cells[STAFF_TAB_COL_EVENT_ARTISTS]));
  const counterNames = parseNameList(normalizeCell(cells[STAFF_TAB_COL_COUNTER_NAME]));
  const isArtistParticipant = listHasName(eventArtists, personName);
  const isCounterParticipant = listHasName(counterNames, personName);

  let artistPayout = isArtistParticipant ? toPositiveMoney(cells[STAFF_TAB_COL_ARTIST_EVENT_PAYOUT] || '') : 0;
  let counterPayout = isCounterParticipant ? toPositiveMoney(cells[STAFF_TAB_COL_ARTIST_COUNTER_PAYOUT] || '') : 0;
  let totalPayout = toPositiveMoney(cells[STAFF_TAB_COL_ARTIST_TOTAL] || '');

  if (!totalPayout) {
    totalPayout = Math.max(0, artistPayout + counterPayout);
  }
  if (!totalPayout) return null;

  if (artistPayout + counterPayout <= 0) {
    if (isCounterParticipant && !isArtistParticipant) {
      counterPayout = totalPayout;
    } else {
      artistPayout = totalPayout;
    }
  } else if (artistPayout + counterPayout > totalPayout) {
    totalPayout = artistPayout + counterPayout;
  }

  return {
    override: {
      entryId,
      personName,
      clientName: normalizeCell(cells[STAFF_TAB_COL_CLIENT_NAME]),
      eventDate: normalizeCell(cells[STAFF_TAB_COL_EVENT_DATE]),
      sourceTab: tabName,
      sourceRowNumber: rowNumber,
      artistPayout,
      counterPayout,
      totalPayout,
    },
    eventCompleteRowRef: parsePositiveInteger(cells[STAFF_TAB_COL_EVENT_COMPLETE_ROW_LINK]),
  };
}

function assertConfigured(config: SheetSyncConfig): void {
  if (!config.webAppUrl) {
    throw new Error('Missing sheet sync web app URL.');
  }
}

function normalizeEvent(raw: ApiEvent, fallbackId: string): EventRecord {
  const merged: EventRecord = {
    ...EMPTY_EVENT,
    ...raw,
    id: raw.id || fallbackId,
    sourceRow: raw.sourceRow || '',
  };

  if (!merged.id) {
    merged.id = `sheet-${merged.entryId || Date.now()}`;
  }

  if (!merged.staffPriceAdjustment.trim() && merged.optionalFee.trim()) {
    merged.staffPriceAdjustment = merged.optionalFee;
  }

  merged.setupTime = normalizeImportedTime(merged.setupTime);
  merged.eventStartTime = normalizeImportedTime(merged.eventStartTime);
  merged.eventEndTime = normalizeImportedTime(merged.eventEndTime);
  merged.artistNames = normalizeArtistNamesToEdEntry(merged.artistNames);
  merged.status = normalizeUnifiedStatus(merged.status, merged.payStatus);
  merged.payStatus = merged.status;

  return merged;
}

function buildUrl(base: string, params: Record<string, string>): string {
  const url = new URL(base);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return url.toString();
}

function applyReadCacheBust(url: URL): void {
  url.searchParams.set('_ts', `${Date.now()}`);
}

function readRequestHeaders(): Record<string, string> {
  return {
    Accept: 'application/json',
    'Cache-Control': 'no-cache, no-store, max-age=0',
    Pragma: 'no-cache',
  };
}

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    const lower = text.toLowerCase();
    const isGoogleLoginHtml =
      (lower.includes('<html') || lower.includes('<!doctype html')) &&
      (lower.includes('accounts.google.com') ||
        lower.includes('servicelogin') ||
        lower.includes('moved temporarily'));
    if (isGoogleLoginHtml) {
      throw new Error(
        'Google sign-in is required for sheet sync. Open the Apps Script /exec URL in this browser, sign in, then retry.',
      );
    }
    throw new Error(`Invalid JSON from Apps Script: ${text.slice(0, 200)}`);
  }
}

export async function pullEventsFromSheet(config: SheetSyncConfig): Promise<EventRecord[]> {
  assertConfigured(config);

  const url = new URL(
    buildUrl(config.webAppUrl, {
      action: 'events',
      limit: '1000',
    }),
  );
  if (config.apiToken) {
    url.searchParams.set('token', config.apiToken);
  }
  applyReadCacheBust(url);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: readRequestHeaders(),
  });

  const data = await parseJson<ListEventsResponse>(response);
  if (!response.ok || !data.ok) {
    throw new Error(data.error || `Failed to pull events (HTTP ${response.status}).`);
  }

  const events = (data.events || []).map((event, index) =>
    normalizeEvent(event, `sheet-${event.entryId || index + 1}`),
  );

  return events;
}

export async function pullEventByEntryId(
  config: SheetSyncConfig,
  entryId: string,
): Promise<EventRecord | null> {
  assertConfigured(config);
  if (!entryId.trim()) {
    throw new Error('Entry ID is required to pull a single event.');
  }

  const url = buildUrl(config.webAppUrl, {
    action: 'event',
    entryId: entryId.trim(),
  });
  const finalUrl = new URL(url);
  if (config.apiToken) finalUrl.searchParams.set('token', config.apiToken);
  applyReadCacheBust(finalUrl);

  const response = await fetch(finalUrl.toString(), {
    method: 'GET',
    headers: readRequestHeaders(),
  });

  const data = await parseJson<{ ok: boolean; error?: string; event?: ApiEvent }>(response);
  if (!response.ok || !data.ok) {
    if (data.error && data.error.includes('not found')) return null;
    throw new Error(data.error || `Failed to pull event ${entryId} (HTTP ${response.status}).`);
  }

  if (!data.event) return null;
  return normalizeEvent(data.event, `sheet-${entryId}`);
}

export async function pullSheetSyncHealth(config: SheetSyncConfig): Promise<SheetSyncHealthSnapshot | null> {
  assertConfigured(config);

  const url = new URL(
    buildUrl(config.webAppUrl, {
      action: 'health',
    }),
  );
  if (config.apiToken) {
    url.searchParams.set('token', config.apiToken);
  }
  applyReadCacheBust(url);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: readRequestHeaders(),
  });

  const data = await parseJson<HealthResponse>(response);
  if (!response.ok || !data.ok) {
    throw new Error(data.error || `Failed to pull sheet health (HTTP ${response.status}).`);
  }

  const spreadsheetId = String(data.spreadsheetId || '').trim();
  const sourceMode = String(data.sourceMode || '').trim();
  const version = String(data.version || '').trim();
  const eventsRows = Number(data.sheetStats?.Events?.rows || 0);

  if (!spreadsheetId) return null;

  return {
    version,
    spreadsheetId,
    sourceMode,
    eventsRows: Number.isFinite(eventsRows) ? eventsRows : 0,
  };
}

export async function pullActiveArtistsFromSheet(config: SheetSyncConfig): Promise<string[]> {
  assertConfigured(config);

  const url = buildUrl(config.webAppUrl, {
    action: 'artists',
  });
  const finalUrl = new URL(url);
  if (config.apiToken) finalUrl.searchParams.set('token', config.apiToken);

  async function fetchFrom(endpointUrl: string): Promise<{ names: string[]; error?: string; ok: boolean }> {
    try {
      const response = await fetch(endpointUrl, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });

      const data = await parseJson<ListArtistsResponse>(response);
      if (!response.ok || !data.ok) {
        return { names: [], error: data.error || `Failed to pull artists (HTTP ${response.status}).`, ok: false };
      }

      const names = (data.artists || [])
        .map((artist) => (artist.name || '').trim())
        .filter(Boolean);
      return { names: sortArtistNamesByPreferredOrder(names), ok: true };
    } catch (error) {
      return {
        names: [],
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to pull artists.',
      };
    }
  }

  const primaryResult = await fetchFrom(finalUrl.toString());
  if (primaryResult.ok && primaryResult.names.length > 0) {
    return primaryResult.names;
  }

  const errorText = (primaryResult.error || '').toLowerCase();
  const isUnauthorized = errorText.includes('unauthorized') || errorText.includes('invalid token');

  if (isUnauthorized && config.webAppUrl.trim() !== DEFAULT_WEB_APP_URL) {
    const fallbackUrl = new URL(buildUrl(DEFAULT_WEB_APP_URL, { action: 'artists' }));
    if (config.apiToken) fallbackUrl.searchParams.set('token', config.apiToken);
    const fallbackResult = await fetchFrom(fallbackUrl.toString());
    if (fallbackResult.ok && fallbackResult.names.length > 0) {
      return fallbackResult.names;
    }
  }

  if (isUnauthorized) {
    return FALLBACK_ARTIST_NAMES;
  }

  if (primaryResult.ok && primaryResult.names.length === 0) {
    return FALLBACK_ARTIST_NAMES;
  }

  throw new Error(primaryResult.error || 'Failed to pull artists.');
}

export async function pullCounterStaffChargeFromSheet(
  config: SheetSyncConfig,
  planName: string,
  artistCount: number,
): Promise<string> {
  assertConfigured(config);

  const plan = planName.trim();
  if (!plan || !Number.isFinite(artistCount) || artistCount <= 0) {
    return '';
  }

  const url = buildUrl(config.webAppUrl, {
    action: 'counterstaffcharge',
    planName: plan,
    artistCount: String(artistCount),
  });
  const finalUrl = new URL(url);
  if (config.apiToken) finalUrl.searchParams.set('token', config.apiToken);

  const response = await fetch(finalUrl.toString(), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  const data = await parseJson<CounterStaffChargeResponse>(response);
  if (!response.ok || !data.ok) {
    throw new Error(data.error || `Failed to pull counter staff charge (HTTP ${response.status}).`);
  }

  if (data.charge == null || String(data.charge).trim() === '') {
    return '';
  }

  const numeric = Number.parseFloat(String(data.charge));
  if (Number.isNaN(numeric)) return '';
  return numeric.toFixed(2);
}

export async function pullHistoricalPayoutOverridesFromStaffTabs(
  config: SheetSyncConfig,
  input?: { forceRefresh?: boolean },
): Promise<StaffTabPayoutOverrideMap> {
  const snapshot = await pullHistoricalPayoutOverridesSnapshotFromStaffTabs(config, input);
  return snapshot.overrides;
}

export async function pullPricingSchedulePayoutMapFromSheet(
  config: SheetSyncConfig,
): Promise<PricingSchedulePayoutMap> {
  assertConfigured(config);

  const data = await fetchSheetTabRows(config, 'Pricing Schedule', 200);
  const map: PricingSchedulePayoutMap = {};

  (data.rows || []).forEach((row) => {
    const rowNumber = Number.parseInt(String(row.rowNumber || 0), 10);
    if (!rowNumber || rowNumber <= 1) return;

    const cells = row.cells || [];
    const planName = normalizeCell(cells[PRICING_SCHEDULE_COL_PLAN_NAME]);
    const artistCount = parsePositiveInteger(cells[PRICING_SCHEDULE_COL_ARTISTS]);
    if (!planName || !artistCount) return;

    const key = buildPricingSchedulePayoutKey(planName, artistCount);
    map[key] = {
      basePayPerArtist: Math.max(0, parseMoney(cells[PRICING_SCHEDULE_COL_BASE_PAY_PER_ARTIST] || '')),
      customFlashArtistBonus: Math.max(
        0,
        parseMoney(cells[PRICING_SCHEDULE_COL_CUSTOM_FLASH_ARTIST_BONUS] || ''),
      ),
      radiusArtistSharePct: Math.max(0, parsePercent(cells[PRICING_SCHEDULE_COL_RADIUS_ARTIST_SHARE])),
      extraHourlyArtistSharePct: Math.max(
        0,
        parsePercent(cells[PRICING_SCHEDULE_COL_EXTRA_HOURLY_ARTIST_SHARE]),
      ),
    };
  });

  return map;
}

export async function pullCompletedEventStaffAssignmentsFromSheet(
  config: SheetSyncConfig,
): Promise<CompletedEventStaffAssignmentMap> {
  assertConfigured(config);

  const data = await fetchSheetTabRows(config, 'Event Complete', 1000);
  const map: CompletedEventStaffAssignmentMap = {};

  (data.rows || []).forEach((row) => {
    const rowNumber = Number.parseInt(String(row.rowNumber || 0), 10);
    if (!rowNumber || rowNumber <= 1) return;

    const cells = row.cells || [];
    const entryId = normalizeCell(cells[EVENT_COMPLETE_COL_ENTRY_ID]);
    if (!entryId) return;

    map[entryId] = {
      artistNames: normalizeCell(cells[EVENT_COMPLETE_COL_ARTIST_NAMES]),
      counterNames: normalizeCell(cells[EVENT_COMPLETE_COL_COUNTER_NAMES]),
      artistPayTotal: Math.max(0, parseMoney(cells[EVENT_COMPLETE_COL_ARTIST_PAY] || '')),
      counterFeeTotal: Math.max(0, parseMoney(cells[EVENT_COMPLETE_COL_COUNTER_FEE] || '')),
      optionalFeeTotal: Math.max(0, parseMoney(cells[EVENT_COMPLETE_COL_OPTIONAL_FEE] || '')),
      radiusFeeTotal: Math.max(0, parseMoney(cells[EVENT_COMPLETE_COL_RADIUS_FEE] || '')),
      radiusShopTotal: Math.max(0, parseMoney(cells[EVENT_COMPLETE_COL_RADIUS_SHOP] || '')),
      extraHourlyArtistTotal: Math.max(0, parseMoney(cells[EVENT_COMPLETE_COL_EXTRA_HOURLY_ARTIST] || '')),
      extraHourlyShopTotal: Math.max(0, parseMoney(cells[EVENT_COMPLETE_COL_EXTRA_HOURLY_SHOP] || '')),
      customFlashFeeTotal: Math.max(0, parseMoney(cells[EVENT_COMPLETE_COL_CUSTOM_FLASH_FEE] || '')),
      customFlashShopTotal: Math.max(0, parseMoney(cells[EVENT_COMPLETE_COL_CUSTOM_FLASH_SHOP] || '')),
      temporaryTattooFeeTotal: Math.max(0, parseMoney(cells[EVENT_COMPLETE_COL_TEMP_TATTOO_FEE] || '')),
      tempFacilityLicenseFeeTotal: Math.max(0, parseMoney(cells[EVENT_COMPLETE_COL_TFL_FEE] || '')),
      totalForEvent: Math.max(0, parseMoney(cells[EVENT_COMPLETE_COL_TOTAL_FOR_EVENT] || '')),
      shopProfit: Math.max(0, parseMoney(cells[EVENT_COMPLETE_COL_SHOP_PROFIT] || '')),
      hasTotalForEvent: normalizeCell(cells[EVENT_COMPLETE_COL_TOTAL_FOR_EVENT]).length > 0,
      hasShopProfit: normalizeCell(cells[EVENT_COMPLETE_COL_SHOP_PROFIT]).length > 0,
    };
  });

  return map;
}

export async function pullGeneratedDocUrlsByEntryId(
  config: SheetSyncConfig,
  entryId: string,
): Promise<{ contractUrl: string; tflUrl: string } | null> {
  assertConfigured(config);
  const wantedEntryId = normalizeCell(entryId);
  if (!wantedEntryId) return null;

  const data = await fetchSheetTabRows(config, 'Events', 2000);
  for (const row of data.rows || []) {
    const cells = row.cells || [];
    if (normalizeCell(cells[EVENT_DETAILS_COL_ENTRY_ID]) !== wantedEntryId) continue;

    return {
      contractUrl: normalizeUrlCell(cells[EVENT_DETAILS_COL_CONTRACT_URL]),
      tflUrl: normalizeUrlCell(cells[EVENT_DETAILS_COL_TFL_URL]),
    };
  }

  return null;
}

async function fetchSheetTabRows(
  config: SheetSyncConfig,
  tabName: string,
  limit = 500,
): Promise<SheetTabRowsResponse> {
  const rowsUrl = new URL(
    buildUrl(config.webAppUrl, {
      action: 'sheettabrows',
      tabName,
      startRow: '1',
      limit: String(limit),
      trimTrailingBlanks: 'true',
      dropFullyEmptyRows: 'true',
    }),
  );
  if (config.apiToken) rowsUrl.searchParams.set('token', config.apiToken);

  const response = await fetch(rowsUrl.toString(), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });
  const data = await parseJson<SheetTabRowsResponse>(response);
  if (!response.ok || !data.ok) {
    throw new Error(data.error || `Failed to pull ${tabName} rows (HTTP ${response.status}).`);
  }
  return data;
}

export async function pullHistoricalPayoutOverridesSnapshotFromStaffTabs(
  config: SheetSyncConfig,
  input?: { forceRefresh?: boolean },
): Promise<StaffTabPayoutOverridesSnapshot> {
  assertConfigured(config);

  const forceRefresh = Boolean(input?.forceRefresh);
  const configKey = buildConfigKey(config);
  const now = Date.now();

  if (
    !forceRefresh &&
    cachedStaffTabOverrides &&
    cachedStaffTabOverrides.configKey === configKey &&
    now - cachedStaffTabOverrides.fetchedAtMs < STAFF_TAB_CACHE_TTL_MS
  ) {
    return cachedStaffTabOverrides.snapshot;
  }

  const diagnostics = createDiagnostics();
  const allowedTabs = new Set(ARTIST_PAY_SHEET_TABS.map((name) => normalizeNameKey(name)));
  let staffTabs: string[] = [];
  try {
    const tabsUrl = new URL(
      buildUrl(config.webAppUrl, {
        action: 'sheettabs',
      }),
    );
    if (config.apiToken) tabsUrl.searchParams.set('token', config.apiToken);

    const tabsResponse = await fetch(tabsUrl.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });
    const tabsData = await parseJson<SheetTabsResponse>(tabsResponse);
    if (!tabsResponse.ok || !tabsData.ok) {
      throw new Error(tabsData.error || `Failed to pull sheet tabs (HTTP ${tabsResponse.status}).`);
    }

    staffTabs = (tabsData.tabs || [])
      .map((tab) => normalizeCell(tab.title))
      .filter((tabTitle) => Boolean(tabTitle) && allowedTabs.has(normalizeNameKey(tabTitle)));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || '');
    if (!isUnknownActionError(message, 'sheettabs')) {
      throw error;
    }

    diagnostics.tabDiscoverySource = 'static_artist_list';
    staffTabs = [...ARTIST_PAY_SHEET_TABS];
    pushDiagnosticIssue(diagnostics, {
      type: 'sheettabs_unsupported',
      tabName: '',
      rowNumber: 0,
      entryId: '',
      eventCompleteRowRef: 0,
      message:
        'Apps Script deployment does not expose action=sheettabs. Falling back to known artist tab list.',
    });
  }

  diagnostics.checkedTabs = staffTabs.length;

  if (staffTabs.length === 0) {
    const emptySnapshot: StaffTabPayoutOverridesSnapshot = {
      overrides: {},
      diagnostics,
    };
    cachedStaffTabOverrides = {
      configKey,
      fetchedAtMs: now,
      snapshot: emptySnapshot,
    };
    return emptySnapshot;
  }

  const rowResponses = await Promise.all(
    staffTabs.map(async (tabName) => {
      try {
        const data = await fetchSheetTabRows(config, tabName, 500);
        return {
          tabName,
          fetchError: '',
          header: data.header || [],
          rows: data.rows || [],
        };
      } catch (error) {
        console.warn(`Unable to pull payout tab '${tabName}':`, error);
        const message = error instanceof Error ? error.message : String(error || '');
        return {
          tabName,
          fetchError: message,
          header: [] as string[],
          rows: [] as SheetTabRowsResponse['rows'],
        };
      }
    }),
  );

  const eventCompleteRowLookup = new Map<number, { entryId: string }>();
  try {
    const eventCompleteRows = await fetchSheetTabRows(config, 'Event Complete', 1000);
    (eventCompleteRows.rows || []).forEach((row) => {
      const rowNumber = parsePositiveInteger(String(row.rowNumber || ''));
      if (!rowNumber) return;
      const cells = row.cells || [];
      eventCompleteRowLookup.set(rowNumber, {
        entryId: normalizeCell(cells[0]),
      });
    });
  } catch (error) {
    console.warn('Unable to validate staff-tab row links against Event Complete:', error);
  }

  const overrides: StaffTabPayoutOverrideMap = {};
  let sheettabrowsUnsupportedLogged = false;
  rowResponses.forEach((tabResult) => {
    if (tabResult.fetchError) {
      const isMissingStaticTab =
        diagnostics.tabDiscoverySource === 'static_artist_list' &&
        isSheetTabNotFoundError(tabResult.fetchError, tabResult.tabName);
      if (isMissingStaticTab) {
        return;
      }

      diagnostics.tabFetchFailureCount += 1;
      if (isUnknownActionError(tabResult.fetchError, 'sheettabrows')) {
        if (!sheettabrowsUnsupportedLogged) {
          pushDiagnosticIssue(diagnostics, {
            type: 'sheettabrows_unsupported',
            tabName: tabResult.tabName,
            rowNumber: 0,
            entryId: '',
            eventCompleteRowRef: 0,
            message:
              'Apps Script deployment does not expose action=sheettabrows. ' +
              'Live staff-tab overrides are unavailable; using framework totals.',
          });
          sheettabrowsUnsupportedLogged = true;
        }
      } else {
        pushDiagnosticIssue(diagnostics, {
          type: 'tab_fetch_failed',
          tabName: tabResult.tabName,
          rowNumber: 0,
          entryId: '',
          eventCompleteRowRef: 0,
          message: `Unable to pull staff tab '${tabResult.tabName}': ${tabResult.fetchError}`,
        });
      }
      return;
    }

    if (!isExpectedStaffTabHeaderShape(tabResult.header)) {
      if (!diagnostics.headerMismatchTabNames.includes(tabResult.tabName)) {
        diagnostics.headerMismatchTabNames.push(tabResult.tabName);
      }
      pushDiagnosticIssue(diagnostics, {
        type: 'header_shape_changed',
        tabName: tabResult.tabName,
        rowNumber: 1,
        entryId: '',
        eventCompleteRowRef: 0,
        message:
          `Header layout changed for ${tabResult.tabName}. ` +
          'This tab links to other sheets by position; verify formulas and referenced columns.',
      });
    }

    (tabResult.rows || []).forEach((row) => {
      const rowNumber = Number.parseInt(String(row.rowNumber || 0), 10);
      const cells = row.cells || [];
      if (!rowNumber || rowNumber <= 1) return;

      const parsed = parseStaffTabOverrideRow(tabResult.tabName, rowNumber || 0, cells);
      if (!parsed) return;

      diagnostics.checkedRows += 1;

      if (!parsed.eventCompleteRowRef) {
        diagnostics.missingRowLinkCount += 1;
        pushDiagnosticIssue(diagnostics, {
          type: 'missing_event_complete_row_link',
          tabName: tabResult.tabName,
          rowNumber,
          entryId: parsed.override.entryId,
          eventCompleteRowRef: 0,
          message:
            `${tabResult.tabName} row ${rowNumber} (Entry ${parsed.override.entryId}) ` +
            'is missing its Event Complete row link (column Z).',
        });
      } else if (eventCompleteRowLookup.size > 0) {
        const linkedRow = eventCompleteRowLookup.get(parsed.eventCompleteRowRef);
        if (!linkedRow) {
          diagnostics.rowLinkMismatchCount += 1;
          pushDiagnosticIssue(diagnostics, {
            type: 'event_complete_row_missing',
            tabName: tabResult.tabName,
            rowNumber,
            entryId: parsed.override.entryId,
            eventCompleteRowRef: parsed.eventCompleteRowRef,
            message:
              `${tabResult.tabName} row ${rowNumber} (Entry ${parsed.override.entryId}) ` +
              `points to Event Complete row ${parsed.eventCompleteRowRef}, which is missing.`,
          });
        } else if (linkedRow.entryId && normalizeCell(linkedRow.entryId) !== normalizeCell(parsed.override.entryId)) {
          diagnostics.rowLinkMismatchCount += 1;
          pushDiagnosticIssue(diagnostics, {
            type: 'event_complete_entry_mismatch',
            tabName: tabResult.tabName,
            rowNumber,
            entryId: parsed.override.entryId,
            eventCompleteRowRef: parsed.eventCompleteRowRef,
            message:
              `${tabResult.tabName} row ${rowNumber} Entry ${parsed.override.entryId} ` +
              `points to Event Complete row ${parsed.eventCompleteRowRef} with Entry ${linkedRow.entryId}.`,
          });
        }
      }

      const key = buildStaffTabPayoutOverrideKey(parsed.override.entryId, parsed.override.personName);
      if (overrides[key]) {
        diagnostics.duplicateOverrideCount += 1;
        pushDiagnosticIssue(diagnostics, {
          type: 'duplicate_override_key',
          tabName: tabResult.tabName,
          rowNumber,
          entryId: parsed.override.entryId,
          eventCompleteRowRef: parsed.eventCompleteRowRef,
          message:
            `Duplicate payout override key for ${parsed.override.personName} / Entry ${parsed.override.entryId}. ` +
            'Using the latest row value.',
        });
      }
      overrides[key] = parsed.override;
    });
  });

  diagnostics.hasWarnings =
    diagnostics.tabDiscoverySource === 'static_artist_list' ||
    diagnostics.tabFetchFailureCount > 0 ||
    diagnostics.headerMismatchTabNames.length > 0 ||
    diagnostics.missingRowLinkCount > 0 ||
    diagnostics.rowLinkMismatchCount > 0 ||
    diagnostics.duplicateOverrideCount > 0;

  const snapshot: StaffTabPayoutOverridesSnapshot = {
    overrides,
    diagnostics,
  };

  cachedStaffTabOverrides = {
    configKey,
    fetchedAtMs: now,
    snapshot,
  };

  return snapshot;
}

export async function upsertEventToSheet(
  config: SheetSyncConfig,
  event: EventRecord,
): Promise<EventRecord> {
  assertConfigured(config);

  const eventToSave: EventRecord = {
    ...event,
    optionalFee: event.staffPriceAdjustment.trim() || event.optionalFee,
    setupTime: normalizeImportedTime(event.setupTime),
    eventStartTime: normalizeImportedTime(event.eventStartTime),
    eventEndTime: normalizeImportedTime(event.eventEndTime),
    artistNames: normalizeArtistNamesToEdEntry(event.artistNames),
    status: normalizeUnifiedStatus(event.status, event.payStatus),
    payStatus: normalizeUnifiedStatus(event.status, event.payStatus),
  };
  const eventForSheet = { ...eventToSave } as Record<string, unknown>;
  delete eventForSheet.eventCompletedAt;

  const totals = computeEventTotals(event);

  const payload = {
    action: 'upsertEvent',
    event: eventForSheet,
    computed: {
      totalCharge: totals.computedTotal,
      balanceAfterDeposit: totals.balanceAfterDeposit,
    },
  };
  if (config.apiToken) {
    (payload as { token?: string }).token = config.apiToken;
  }

  // Web + Apps Script can fail on POST due cross-origin preflight/redirect behavior.
  // Use a GET upsert route in web to avoid "Failed to fetch".
  if (Platform.OS === 'web') {
    const upsertUrl = new URL(config.webAppUrl);
    upsertUrl.searchParams.set('action', 'upsertEvent');
    upsertUrl.searchParams.set('event', JSON.stringify(eventForSheet));
    upsertUrl.searchParams.set('computed', JSON.stringify(payload.computed));
    if (config.apiToken) upsertUrl.searchParams.set('token', config.apiToken);

    const response = await fetch(upsertUrl.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    const data = await parseJson<UpsertEventResponse>(response);
    if (!response.ok || !data.ok || !data.event) {
      throw new Error(data.error || `Failed to save event to sheet (HTTP ${response.status}).`);
    }

    return normalizeEvent(data.event, `sheet-${eventToSave.entryId || Date.now()}`);
  }

  const response = await fetch(config.webAppUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await parseJson<UpsertEventResponse>(response);
  if (!response.ok || !data.ok || !data.event) {
    throw new Error(data.error || `Failed to save event to sheet (HTTP ${response.status}).`);
  }

  return normalizeEvent(data.event, `sheet-${eventToSave.entryId || Date.now()}`);
}

export async function deleteEventFromSheet(
  config: SheetSyncConfig,
  input: { entryId?: string; sourceRow?: string | number },
): Promise<{ deleted: boolean; entryId: string; sourceRow: string }> {
  assertConfigured(config);

  const entryId = String(input.entryId || '').trim();
  const sourceRow = String(input.sourceRow || '').trim();
  if (!entryId && !sourceRow) {
    throw new Error('Delete requires Entry ID or Source Row.');
  }

  const payload: { action: 'deleteEvent'; entryId?: string; sourceRow?: string; token?: string } = {
    action: 'deleteEvent',
  };
  if (entryId) payload.entryId = entryId;
  if (sourceRow) payload.sourceRow = sourceRow;
  if (config.apiToken) payload.token = config.apiToken;

  if (Platform.OS === 'web') {
    const url = new URL(config.webAppUrl);
    url.searchParams.set('action', 'deleteEvent');
    if (entryId) url.searchParams.set('entryId', entryId);
    if (sourceRow) url.searchParams.set('sourceRow', sourceRow);
    if (config.apiToken) url.searchParams.set('token', config.apiToken);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    const data = await parseJson<DeleteEventResponse>(response);
    if (!response.ok || !data.ok) {
      throw new Error(data.error || `Failed to delete event from sheet (HTTP ${response.status}).`);
    }
    return {
      deleted: data.deleted ?? true,
      entryId: String(data.entryId || entryId),
      sourceRow: String(data.sourceRow || sourceRow),
    };
  }

  const response = await fetch(config.webAppUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await parseJson<DeleteEventResponse>(response);
  if (!response.ok || !data.ok) {
    throw new Error(data.error || `Failed to delete event from sheet (HTTP ${response.status}).`);
  }
  return {
    deleted: data.deleted ?? true,
    entryId: String(data.entryId || entryId),
    sourceRow: String(data.sourceRow || sourceRow),
  };
}

export async function triggerEventDocumentGeneration(
  config: SheetSyncConfig,
  input: { entryId: string; kind: 'contract' | 'tfl' },
): Promise<{ entryId: string; contractUrl: string; tflUrl: string }> {
  assertConfigured(config);

  const entryId = String(input.entryId || '').trim();
  if (!entryId) {
    throw new Error('Generate requires Entry ID.');
  }

  const kind = input.kind === 'tfl' ? 'tfl' : 'contract';
  const action = kind === 'contract' ? 'generatecontract' : 'generatetfl';

  const payload: { action: string; entryId: string; token?: string } = {
    action,
    entryId,
  };
  if (config.apiToken) payload.token = config.apiToken;

  if (Platform.OS === 'web') {
    const url = new URL(config.webAppUrl);
    url.searchParams.set('action', action);
    url.searchParams.set('entryId', entryId);
    if (config.apiToken) url.searchParams.set('token', config.apiToken);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    const data = await parseJson<GenerateByEntryResponse>(response);
    if (!response.ok || !data.ok) {
      throw new Error(data.error || `Failed to generate ${kind.toUpperCase()} (HTTP ${response.status}).`);
    }
    return {
      entryId: String(data.entryId || entryId),
      contractUrl: String(data.contractUrl || ''),
      tflUrl: String(data.tflUrl || ''),
    };
  }

  const response = await fetch(config.webAppUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await parseJson<GenerateByEntryResponse>(response);
  if (!response.ok || !data.ok) {
    throw new Error(data.error || `Failed to generate ${kind.toUpperCase()} (HTTP ${response.status}).`);
  }
  return {
    entryId: String(data.entryId || entryId),
    contractUrl: String(data.contractUrl || ''),
    tflUrl: String(data.tflUrl || ''),
  };
}

export async function uploadEventArtImageToSheet(
  config: SheetSyncConfig,
  input: {
    entryId: string;
    base64Data: string;
    mimeType?: string;
    fileName?: string;
  },
): Promise<EventRecord> {
  assertConfigured(config);

  const entryId = String(input.entryId || '').trim();
  const base64Data = String(input.base64Data || '').trim();
  if (!entryId) {
    throw new Error('entryId is required for art upload.');
  }
  if (!base64Data) {
    throw new Error('base64Data is required for art upload.');
  }

  const payload: Record<string, string> = {
    action: 'uploadartimage',
    entryId,
    base64Data,
  };
  if (input.mimeType) payload.mimeType = input.mimeType;
  if (input.fileName) payload.fileName = input.fileName;
  if (config.apiToken) payload.token = config.apiToken;

  const body = new URLSearchParams(payload).toString();
  const response = await fetch(config.webAppUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
    },
    body,
  });

  const data = await parseJson<UploadArtImageResponse>(response);
  if (!response.ok || !data.ok) {
    throw new Error(data.error || `Failed to upload art image (HTTP ${response.status}).`);
  }

  if (data.event) return normalizeEvent(data.event, `sheet-${entryId}`);

  const pulled = await pullEventByEntryId(config, entryId);
  if (pulled) return pulled;

  throw new Error('Art image uploaded but event refresh failed.');
}
