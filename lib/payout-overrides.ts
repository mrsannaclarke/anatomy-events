export type StaffTabPayoutOverride = {
  entryId: string;
  personName: string;
  clientName: string;
  eventDate: string;
  sourceTab: string;
  sourceRowNumber: number;
  artistPayout: number;
  counterPayout: number;
  totalPayout: number;
};

export type StaffTabPayoutOverrideMap = Record<string, StaffTabPayoutOverride>;

export type StaffTabLinkIssueType =
  | 'sheettabs_unsupported'
  | 'sheettabrows_unsupported'
  | 'tab_fetch_failed'
  | 'header_shape_changed'
  | 'missing_event_complete_row_link'
  | 'event_complete_row_missing'
  | 'event_complete_entry_mismatch'
  | 'duplicate_override_key';

export type StaffTabLinkIssue = {
  type: StaffTabLinkIssueType;
  tabName: string;
  rowNumber: number;
  entryId: string;
  eventCompleteRowRef: number;
  message: string;
};

export type StaffTabOverrideDiagnostics = {
  tabDiscoverySource: 'live_sheettabs' | 'static_artist_list';
  checkedTabs: number;
  checkedRows: number;
  tabFetchFailureCount: number;
  headerMismatchTabNames: string[];
  missingRowLinkCount: number;
  rowLinkMismatchCount: number;
  duplicateOverrideCount: number;
  issues: StaffTabLinkIssue[];
  hasWarnings: boolean;
};

export type StaffTabPayoutOverridesSnapshot = {
  overrides: StaffTabPayoutOverrideMap;
  diagnostics: StaffTabOverrideDiagnostics;
};

function normalizeNameKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function buildStaffTabPayoutOverrideKey(entryId: string, personName: string): string {
  return `${entryId.trim()}::${normalizeNameKey(personName)}`;
}
