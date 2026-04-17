import type { EventRecord } from '@/types/events';

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function flatten(value: unknown, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  if (value == null) return out;

  if (Array.isArray(value)) {
    value.forEach((item, index) => flatten(item, `${prefix}${index}.`, out));
    return out;
  }

  if (typeof value === 'object') {
    Object.entries(value as Record<string, unknown>).forEach(([k, v]) => {
      flatten(v, `${prefix}${k}.`, out);
    });
    return out;
  }

  out[prefix.slice(0, -1)] = String(value);
  return out;
}

function toFlag(value: string | undefined): string {
  if (!value) return '';
  const norm = value.trim().toLowerCase();
  if (['yes', 'y', 'true', '1'].includes(norm)) return 'YES';
  if (['no', 'n', 'false', '0'].includes(norm)) return 'NO';
  if (['tbd', 'unknown', 'not sure'].includes(norm)) return 'TBD';
  return value;
}

function pick(flat: Record<string, string>, candidates: string[]): string {
  const normalizedCandidates = candidates.map(normalizeKey);

  for (const [rawKey, value] of Object.entries(flat)) {
    const normKey = normalizeKey(rawKey);
    if (normalizedCandidates.some((candidate) => normKey.endsWith(candidate))) {
      if (value.trim().length > 0) return value.trim();
    }
  }

  return '';
}

function pickName(flat: Record<string, string>): string {
  const full = pick(flat, ['clientname', 'fullname', 'name']);
  if (full) return full;

  const first = pick(flat, ['firstname']);
  const last = pick(flat, ['lastname']);
  return `${first} ${last}`.trim();
}

export interface GravityImportResult {
  patch: Partial<EventRecord>;
  warnings: string[];
}

export function mapGravitySubmissionToEvent(raw: string): GravityImportResult {
  const parsed = JSON.parse(raw) as unknown;
  const flat = flatten(parsed);

  const patch: Partial<EventRecord> = {
    clientName: pickName(flat),
    email: pick(flat, ['email', 'emailaddress']),
    contactPhone: pick(flat, ['phone', 'phonenumber', 'contactphone']),
    eventDate: pick(flat, ['eventdate', 'dateofevent', 'preferreddate']),
    venueName: pick(flat, ['venuename', 'venue', 'eventvenue']),
    eventType: pick(flat, ['eventtype', 'typeofevent', 'eventcategory']),
    eventAddress: pick(flat, ['eventaddress', 'address', 'venueaddress']),
    estGuestCount: pick(flat, ['estguestcount', 'guestcount', 'estimatedguests', 'howmanyguests']),
    numberOfArtists: pick(flat, ['numberofartists', 'artistsneeded', 'artistcount']),
    artistNames: pick(flat, ['artistnames', 'preferredartists', 'artists']),
    customFlash: toFlag(pick(flat, ['customflash', 'customflashyesno', 'wantcustomflash'])),
    temporaryTattoos: toFlag(
      pick(flat, ['temporarytattoos', 'temporarytattoosyesno', 'wanttemporarytattoos']),
    ),
    contractNotes: pick(flat, ['contractnotes', 'notes', 'eventdetails', 'message']),
    gravitySubmissionRaw: raw,
    gravityImportedAt: new Date().toISOString(),
  };

  const warnings: string[] = [];
  if (!patch.clientName) warnings.push('Client name not found in submission payload.');
  if (!patch.eventDate) warnings.push('Event date not found in submission payload.');
  if (!patch.eventType) warnings.push('Event type not found in submission payload.');

  return { patch, warnings };
}
