import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { AppLoadingScreen } from '@/components/ui/app-loading-screen';
import { GlowPressable as Pressable } from '@/components/ui/glow-pressable';
import { isPayoutDisabledForUser } from '@/constants/admin-capabilities';
import { getHistoricalArtistBreakdownOverride } from '@/constants/historical-payout-truth';
import { SHEET_SYNC_CONFIG } from '@/constants/sheets-sync';
import { normalizeNameKey } from '@/constants/pay-framework';
import { STAFF_PERMISSIONS } from '@/constants/auth-permissions';
import { useEvents } from '@/context/events-context';
import { useAuthFramework } from '@/lib/auth-framework';
import { formatCurrency } from '@/lib/event-math';
import {
  formatEventDateDisplay,
  getCompletedAtDisplayLabel,
  getCompletedYearKey,
  getPersonPayRow,
  type PricingSchedulePayoutMap,
  sortRowsByEventDate,
} from '@/lib/pay-framework';
import {
  buildStaffTabPayoutOverrideKey,
  type StaffTabOverrideDiagnostics,
  type StaffTabPayoutOverrideMap,
} from '@/lib/payout-overrides';
import {
  pullHistoricalPayoutOverridesSnapshotFromStaffTabs,
  pullCompletedEventStaffAssignmentsFromSheet,
  pullPricingSchedulePayoutMapFromSheet,
  type CompletedEventStaffAssignmentMap,
} from '@/lib/sheets-sync';

function isValidPersonToken(value: string): boolean {
  const key = normalizeNameKey(value);
  if (!key) return false;
  if (key === '-' || key === '—') return false;
  if (key === 'n/a' || key === 'na' || key === 'none') return false;
  return true;
}

function parseNames(value: string): string[] {
  return value
    .split(/[,\n;/&]+/)
    .map((entry) => entry.trim())
    .filter((entry) => isValidPersonToken(entry));
}

function hasValidNameList(value: string): boolean {
  return parseNames(value).length > 0;
}

function resolveNameListWithFallback(primary: string, fallback: string): string {
  if (hasValidNameList(primary)) return primary;
  if (hasValidNameList(fallback)) return fallback;
  return primary;
}

function roleLabel(value: 'artist' | 'counter' | 'artist+counter'): string {
  if (value === 'artist') return 'Role: Artist';
  if (value === 'counter') return 'Role: Counter';
  return 'Role: Artist + Counter';
}

function uniqueByNormalizedName(values: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  values.forEach((value) => {
    const key = normalizeNameKey(value);
    if (!key || seen.has(key)) return;
    seen.add(key);
    result.push(value.trim());
  });

  return result;
}

type EventTypeVisual = {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  color: string;
};

const PAY_VIEW_DELEGATION_MAP: Readonly<Record<string, readonly string[]>> = {
  megan: ['jacob'],
  tomma: ['kevin', 'jayden', 'veda'],
  shy: ['jason'],
};

function getEventTypeVisual(eventType: string): EventTypeVisual {
  const normalized = eventType.trim().toLowerCase();
  if (normalized.includes('private')) return { icon: 'celebration', color: '#b58bff' };
  if (normalized.includes('corporate')) return { icon: 'business-center', color: '#6ab7ff' };
  if (normalized.includes('wedding')) return { icon: 'favorite', color: '#ff7fb8' };
  if (normalized.includes('fundraiser')) return { icon: 'volunteer-activism', color: '#7fd29a' };
  return { icon: 'event-note', color: '#f1b56f' };
}

export default function PayScreen() {
  const { events } = useEvents();
  const { user, viewerName, canAccessAdminToolsForViewer, resolvePermissionsForName } = useAuthFramework();

  const defaultViewerName = viewerName;
  const viewerPermission = useMemo(() => {
    if (!defaultViewerName) return null;
    return resolvePermissionsForName(defaultViewerName);
  }, [defaultViewerName, resolvePermissionsForName]);

  const payoutDisabledForCurrentLogin = isPayoutDisabledForUser(user);
  const canViewAnyPayTable = !payoutDisabledForCurrentLogin && canAccessAdminToolsForViewer;

  const canViewOwnPayTable = Boolean(
    !payoutDisabledForCurrentLogin &&
      (viewerPermission?.roles.includes('artist') || viewerPermission?.roles.includes('counter')),
  );

  const canViewPayFramework = canViewAnyPayTable || canViewOwnPayTable;

  const allPeople = useMemo(() => {
    const permissionNames = STAFF_PERMISSIONS.filter((entry) =>
      entry.roles.includes('artist') || entry.roles.includes('counter'),
    ).map((entry) => entry.name);

    const fromEvents = events.flatMap((event) => [
      ...parseNames(event.artistNames),
      ...parseNames(event.counterNames),
    ]);

    return uniqueByNormalizedName([...permissionNames, ...fromEvents]);
  }, [events]);

  const delegatedPeople = useMemo(() => {
    const delegationKeys = PAY_VIEW_DELEGATION_MAP[normalizeNameKey(defaultViewerName)] ?? [];
    if (delegationKeys.length === 0) return [];
    return uniqueByNormalizedName(
      delegationKeys
        .map((delegatedKey) => allPeople.find((name) => normalizeNameKey(name) === delegatedKey) || '')
        .filter(Boolean),
    );
  }, [allPeople, defaultViewerName]);

  const selectablePeople = useMemo(() => {
    if (!canViewPayFramework) return [];
    if (canViewAnyPayTable) return allPeople;

    const ownName =
      allPeople.find((name) => normalizeNameKey(name) === normalizeNameKey(defaultViewerName)) || defaultViewerName;
    return uniqueByNormalizedName([ownName, ...delegatedPeople].filter(Boolean));
  }, [allPeople, canViewAnyPayTable, canViewPayFramework, defaultViewerName, delegatedPeople]);

  // Staff/non-admin users should never get the person dropdown.
  const canPickPerson = canViewAnyPayTable;

  const [selectedPersonName, setSelectedPersonName] = useState<string>('');
  const [isPersonPickerOpen, setIsPersonPickerOpen] = useState(false);
  const [selectedYear, setSelectedYear] = useState<string>('All');
  const [staffTabOverrides, setStaffTabOverrides] = useState<StaffTabPayoutOverrideMap>({});
  const [pricingSchedulePayoutMap, setPricingSchedulePayoutMap] = useState<PricingSchedulePayoutMap>({});
  const [completedStaffAssignments, setCompletedStaffAssignments] = useState<CompletedEventStaffAssignmentMap>({});
  const [staffTabDiagnostics, setStaffTabDiagnostics] = useState<StaffTabOverrideDiagnostics | null>(null);
  const [payoutOverrideStatus, setPayoutOverrideStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let isMounted = true;

    async function loadPayoutOverrides() {
      setPayoutOverrideStatus('loading');
      try {
        const [snapshot, pricingMap, completedAssignmentsMap] = await Promise.all([
          pullHistoricalPayoutOverridesSnapshotFromStaffTabs(SHEET_SYNC_CONFIG),
          pullPricingSchedulePayoutMapFromSheet(SHEET_SYNC_CONFIG).catch(() => ({} as PricingSchedulePayoutMap)),
          pullCompletedEventStaffAssignmentsFromSheet(SHEET_SYNC_CONFIG).catch(
            () => ({} as CompletedEventStaffAssignmentMap),
          ),
        ]);
        if (!isMounted) return;
        const pulledOverrides = snapshot.overrides;
        setStaffTabOverrides(pulledOverrides);
        setPricingSchedulePayoutMap(pricingMap);
        setCompletedStaffAssignments(completedAssignmentsMap);
        setStaffTabDiagnostics(snapshot.diagnostics);
        setPayoutOverrideStatus('ready');
      } catch {
        if (!isMounted) return;
        setStaffTabOverrides({});
        setPricingSchedulePayoutMap({});
        setCompletedStaffAssignments({});
        setStaffTabDiagnostics(null);
        setPayoutOverrideStatus('error');
      }
    }

    void loadPayoutOverrides();
    return () => {
      isMounted = false;
    };
  }, []);

  const effectivePersonName = useMemo(() => {
    if (!canViewPayFramework) return '';

    if (!canPickPerson) {
      if (defaultViewerName) return defaultViewerName;
      return '';
    }

    const hasSelected =
      selectedPersonName &&
      selectablePeople.some((name) => normalizeNameKey(name) === normalizeNameKey(selectedPersonName));
    if (hasSelected) return selectedPersonName;

    const defaultInList = selectablePeople.find(
      (name) => normalizeNameKey(name) === normalizeNameKey(defaultViewerName),
    );
    if (defaultInList) return defaultInList;

    return selectablePeople[0] || defaultViewerName;
  }, [canPickPerson, canViewPayFramework, defaultViewerName, selectablePeople, selectedPersonName]);

  const rows = useMemo(() => {
    if (!effectivePersonName) return [];

    return events
      .map((event) => {
        const entryKey = event.entryId.trim();
        const completedFallback = entryKey ? completedStaffAssignments[entryKey] : undefined;
        const eventForPay = completedFallback
          ? {
              ...event,
              artistNames: resolveNameListWithFallback(event.artistNames, completedFallback.artistNames),
              counterNames: resolveNameListWithFallback(event.counterNames, completedFallback.counterNames),
            }
          : event;
        const overrideKey = buildStaffTabPayoutOverrideKey(event.entryId, effectivePersonName);
        const override = staffTabOverrides[overrideKey];
        return getPersonPayRow(eventForPay, effectivePersonName, override, pricingSchedulePayoutMap);
      })
      .filter((row): row is NonNullable<typeof row> => row != null)
      .sort(sortRowsByEventDate);
  }, [completedStaffAssignments, effectivePersonName, events, pricingSchedulePayoutMap, staffTabOverrides]);

  const payoutOverrideWarningMessage = useMemo(() => {
    if (!staffTabDiagnostics || !staffTabDiagnostics.hasWarnings) return '';

    const parts: string[] = [];
    if (staffTabDiagnostics.tabDiscoverySource === 'static_artist_list') {
      parts.push('legacy tab discovery fallback');
    }
    if (staffTabDiagnostics.tabFetchFailureCount > 0) {
      parts.push(`${staffTabDiagnostics.tabFetchFailureCount} tab pull failure${staffTabDiagnostics.tabFetchFailureCount === 1 ? '' : 's'}`);
    }
    if (staffTabDiagnostics.rowLinkMismatchCount > 0) {
      parts.push(`${staffTabDiagnostics.rowLinkMismatchCount} row-link mismatch${staffTabDiagnostics.rowLinkMismatchCount === 1 ? '' : 'es'}`);
    }
    if (staffTabDiagnostics.missingRowLinkCount > 0) {
      parts.push(`${staffTabDiagnostics.missingRowLinkCount} missing row link${staffTabDiagnostics.missingRowLinkCount === 1 ? '' : 's'}`);
    }
    if (staffTabDiagnostics.headerMismatchTabNames.length > 0) {
      parts.push(`${staffTabDiagnostics.headerMismatchTabNames.length} header layout change${staffTabDiagnostics.headerMismatchTabNames.length === 1 ? '' : 's'}`);
    }
    if (staffTabDiagnostics.duplicateOverrideCount > 0) {
      parts.push(`${staffTabDiagnostics.duplicateOverrideCount} duplicate override key${staffTabDiagnostics.duplicateOverrideCount === 1 ? '' : 's'}`);
    }

    const issuePreview = staffTabDiagnostics.issues[0]?.message || '';
    const summary = parts.length > 0 ? parts.join(' • ') : 'staff-tab link drift detected';
    return `Warning: ${summary}. ${issuePreview}`.trim();
  }, [staffTabDiagnostics]);

  const completedRows = useMemo(() => rows.filter((row) => row.isComplete), [rows]);
  const yearOptions = useMemo(() => {
    const years = Array.from(
      new Set(
        completedRows
          .map((row) => getCompletedYearKey(row.event))
          .filter((year) => year && year !== 'Untracked'),
      ),
    ).sort((a, b) => Number.parseInt(b, 10) - Number.parseInt(a, 10));
    return ['All', ...years];
  }, [completedRows]);

  const effectiveSelectedYear = yearOptions.includes(selectedYear) ? selectedYear : 'All';
  const visibleRows = useMemo(() => {
    const completedOnly = rows.filter((row) => row.isComplete);
    if (effectiveSelectedYear === 'All') return completedOnly;
    return completedOnly.filter((row) => getCompletedYearKey(row.event) === effectiveSelectedYear);
  }, [effectiveSelectedYear, rows]);
  const visibleCompletedRows = visibleRows;

  const totals = useMemo(() => {
    return visibleCompletedRows.reduce(
      (acc, row) => {
        acc.total += row.totalPayout;
        acc.artist += row.artistPayout;
        acc.counter += row.counterPayout;
        return acc;
      },
      { total: 0, artist: 0, counter: 0 },
    );
  }, [visibleCompletedRows]);

  if (!canViewPayFramework) {
    return (
      <View style={styles.page}>
        <View style={styles.card}>
          <ThemedText style={styles.sectionTitle}>Pay Schedule</ThemedText>
          <ThemedText style={styles.helperText}>
            {payoutDisabledForCurrentLogin
              ? 'Pay table is disabled for this login.'
              : 'Pay table is visible to artists, counter staff, admins, and super admins only.'}
          </ThemedText>
        </View>
      </View>
    );
  }

  if (payoutOverrideStatus === 'loading') {
    return <AppLoadingScreen />;
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <ThemedText style={styles.sectionTitle}>Pay Schedule</ThemedText>
        {!canPickPerson ? (
          <ThemedText style={styles.helperTextInfo}>Access limited to your own payout schedule.</ThemedText>
        ) : null}
        {payoutOverrideStatus === 'error' ? (
          <ThemedText style={styles.helperTextError}>Payout sync issue. Using schedule totals.</ThemedText>
        ) : null}
        {canViewAnyPayTable && payoutOverrideWarningMessage ? (
          <ThemedText style={styles.helperTextWarning}>{payoutOverrideWarningMessage}</ThemedText>
        ) : null}

        <View style={styles.fieldBlock}>
          <ThemedText style={styles.fieldLabel}>Year</ThemedText>
          <View style={styles.yearChipRow}>
            {yearOptions.map((yearOption) => {
              const selected = yearOption === effectiveSelectedYear;
              return (
                <Pressable
                  key={yearOption}
                  onPress={() => setSelectedYear(yearOption)}
                  style={[styles.yearChip, selected ? styles.yearChipActive : null]}>
                  <ThemedText style={[styles.yearChipText, selected ? styles.yearChipTextActive : null]}>
                    {yearOption}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        </View>

        {canPickPerson ? (
          <View style={styles.fieldBlock}>
            <ThemedText style={styles.fieldLabel}>Person</ThemedText>
            <Pressable
              style={styles.dropdownButton}
              onPress={() => {
                setIsPersonPickerOpen((current) => !current);
              }}>
              <ThemedText style={styles.dropdownButtonText}>{effectivePersonName || 'Select person'}</ThemedText>
              <MaterialIcons
                name={isPersonPickerOpen ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
                size={16}
                color="#cfe2ff"
              />
            </Pressable>
            {isPersonPickerOpen ? (
              <View style={styles.dropdownList}>
                {selectablePeople.map((name) => {
                  const selected = normalizeNameKey(name) === normalizeNameKey(effectivePersonName);
                  return (
                    <Pressable
                      key={name}
                      onPress={() => {
                        setSelectedPersonName(name);
                        setIsPersonPickerOpen(false);
                      }}
                      style={[styles.dropdownItem, selected ? styles.dropdownItemActive : null]}>
                      <ThemedText style={[styles.dropdownItemText, selected ? styles.dropdownItemTextActive : null]}>
                        {name}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>
        ) : (
          <View style={styles.personRow}>
            <MaterialIcons name="person" size={15} color="#9fc3ef" />
            <ThemedText style={styles.personText}>{effectivePersonName || 'Unassigned'}</ThemedText>
          </View>
        )}

      </View>

      <View style={styles.card}>
        <ThemedText style={styles.sectionTitle}>Completed Totals</ThemedText>
        <View style={styles.summaryRow}>
          <View>
            <ThemedText style={styles.summaryLabel}>Total</ThemedText>
            <ThemedText style={styles.summaryValue}>{formatCurrency(totals.total)}</ThemedText>
          </View>
          <View>
            <ThemedText style={styles.summaryLabel}>Artist</ThemedText>
            <ThemedText style={styles.summaryValue}>{formatCurrency(totals.artist)}</ThemedText>
          </View>
          <View>
            <ThemedText style={styles.summaryLabel}>Counter</ThemedText>
            <ThemedText style={styles.summaryValue}>{formatCurrency(totals.counter)}</ThemedText>
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <ThemedText style={styles.sectionTitle}>Completed Totals by Year</ThemedText>
        {(() => {
          const byYear = visibleCompletedRows.reduce<Record<string, { total: number; artist: number; counter: number }>>(
            (acc, row) => {
              const key = getCompletedYearKey(row.event) || 'Untracked';
              if (!acc[key]) acc[key] = { total: 0, artist: 0, counter: 0 };
              acc[key].total += row.totalPayout;
              acc[key].artist += row.artistPayout;
              acc[key].counter += row.counterPayout;
              return acc;
            },
            {},
          );

          const keys = Object.keys(byYear).sort((a, b) => {
            if (a === 'Untracked') return 1;
            if (b === 'Untracked') return -1;
            return Number.parseInt(b, 10) - Number.parseInt(a, 10);
          });

          if (keys.length === 0) {
            return <ThemedText style={styles.helperText}>No completed payouts yet.</ThemedText>;
          }

          return keys.map((key) => (
            <View key={key} style={styles.yearRow}>
              <ThemedText style={styles.yearLabel}>{key}</ThemedText>
              <View style={styles.yearValues}>
                <ThemedText style={styles.yearValue}>Total {formatCurrency(byYear[key].total)}</ThemedText>
                <ThemedText style={styles.yearValue}>Artist {formatCurrency(byYear[key].artist)}</ThemedText>
                <ThemedText style={styles.yearValue}>Counter {formatCurrency(byYear[key].counter)}</ThemedText>
              </View>
            </View>
          ));
        })()}
      </View>

      <View style={styles.card}>
        <ThemedText style={styles.sectionTitle}>Assigned Events</ThemedText>
        {visibleRows.length === 0 ? <ThemedText style={styles.helperText}>No assigned events found.</ThemedText> : null}

        {visibleRows.map((row) => {
          const completedAtLabel = getCompletedAtDisplayLabel(row.event);
          const isCounterOnly = row.role === 'counter';
          const eventTypeVisual = getEventTypeVisual(row.event.eventType);
          const historicalBreakdownOverride = getHistoricalArtistBreakdownOverride(row.event.entryId);
          const historicalLicensingSplit =
            historicalBreakdownOverride?.licensingSplitPerArtist && !isCounterOnly
              ? Math.max(0, historicalBreakdownOverride.licensingSplitPerArtist)
              : 0;
          const modifierBreakdownItems = [
            { label: 'Custom Flash Bonus', amount: row.artistModifierBreakdown.customFlash },
            { label: 'Radius Share', amount: row.artistModifierBreakdown.radius },
            { label: 'Temporary Tattoos', amount: row.artistModifierBreakdown.temporaryTattoos },
            { label: 'Extra Hourly Share', amount: row.artistModifierBreakdown.extraHourly },
          ].filter((item) => item.amount > 0);
          return (
            <View key={`${row.event.id}-${row.role}`} style={styles.rowCard}>
              <View style={styles.rowTop}>
                <View style={styles.rowTitleBlock}>
                  <View style={styles.rowTitleRow}>
                    <View style={[styles.rowEventTypeIconWrap, { borderColor: eventTypeVisual.color }]}>
                      <MaterialIcons name={eventTypeVisual.icon} size={13} color={eventTypeVisual.color} />
                    </View>
                    <ThemedText style={[styles.rowTitle, { color: eventTypeVisual.color }]}>
                      {row.event.clientName || 'Untitled Event'}
                    </ThemedText>
                  </View>
                  <ThemedText style={styles.rowTitlePrice}>{formatCurrency(row.totalPayout)}</ThemedText>
                </View>
                <View style={styles.rowDateBlock}>
                  <ThemedText style={styles.rowDate}>
                    {formatEventDateDisplay(row.event.eventDate) || 'No date'}
                  </ThemedText>
                  <ThemedText style={styles.completedAtText}>Completed: {completedAtLabel || 'timestamp pending'}</ThemedText>
                </View>
              </View>

              <View style={styles.rowMoneyBlock}>
                <View style={styles.rowRoleLeft}>
                  <ThemedText style={styles.roleChip}>{roleLabel(row.role)}</ThemedText>
                </View>
                {!isCounterOnly ? (
                  <View style={styles.rowMoneyRight}>
                    {row.role === 'artist' || row.role === 'artist+counter' ? (
                      <ThemedText style={styles.rowMoneyBreakdown}>Artist Base {formatCurrency(row.artistBasePayout)}</ThemedText>
                    ) : null}
                    {row.counterPayout > 0 ? (
                      <ThemedText style={styles.rowMoneyBreakdown}>Counter {formatCurrency(row.counterPayout)}</ThemedText>
                    ) : null}
                    {historicalLicensingSplit > 0 ? (
                      <ThemedText style={styles.rowModifierBreakdown}>
                        Licensing Split (Historical) {formatCurrency(historicalLicensingSplit)}
                      </ThemedText>
                    ) : null}
                    {row.role === 'artist' || row.role === 'artist+counter'
                      ? modifierBreakdownItems.map((item) => (
                          <ThemedText key={item.label} style={styles.rowModifierBreakdown}>
                            {item.label} {formatCurrency(item.amount)}
                          </ThemedText>
                        ))
                      : null}
                  </View>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  content: {
    padding: 16,
    gap: 12,
    paddingBottom: 36,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#223244',
    backgroundColor: '#111a24',
    padding: 14,
    gap: 8,
  },
  sectionTitle: {
    fontWeight: '700',
    color: '#e4edf8',
    fontSize: 17,
  },
  helperText: {
    color: '#9ab0c7',
    lineHeight: 18,
  },
  helperTextInfo: {
    color: '#7fb5e8',
    lineHeight: 18,
    fontSize: 12,
  },
  helperTextError: {
    color: '#f7b4a8',
    lineHeight: 18,
    fontSize: 12,
  },
  helperTextWarning: {
    color: '#f7d7a8',
    lineHeight: 18,
    fontSize: 12,
  },
  fieldBlock: {
    gap: 6,
  },
  fieldLabel: {
    color: '#9bb0c7',
    fontSize: 13,
    fontWeight: '600',
  },
  yearChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  yearChip: {
    borderWidth: 1,
    borderColor: '#2d4259',
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 5,
    backgroundColor: '#0f1620',
  },
  yearChipActive: {
    backgroundColor: '#2b74d9',
    borderColor: '#2b74d9',
  },
  yearChipText: {
    fontWeight: '600',
    color: '#9fb3c8',
    fontSize: 12,
  },
  yearChipTextActive: {
    color: '#fff',
  },
  dropdownButton: {
    borderWidth: 1,
    borderColor: '#2f4358',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: '#0f1620',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  dropdownButtonText: {
    color: '#d6e6fa',
    fontWeight: '700',
    flexShrink: 1,
  },
  dropdownList: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#2f4358',
    borderRadius: 10,
    backgroundColor: '#0f1620',
    overflow: 'hidden',
  },
  dropdownItem: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: '#213244',
  },
  dropdownItemActive: {
    backgroundColor: '#1f4f95',
  },
  dropdownItemText: {
    color: '#c7d8eb',
    fontWeight: '600',
  },
  dropdownItemTextActive: {
    color: '#fff',
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  personText: {
    color: '#d6e6fa',
    fontWeight: '700',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
  },
  summaryLabel: {
    color: '#7f95ad',
    textTransform: 'uppercase',
    fontSize: 11,
    letterSpacing: 0.8,
  },
  summaryValue: {
    color: '#e3ecf8',
    fontSize: 17,
    fontWeight: '800',
  },
  yearRow: {
    borderTopWidth: 1,
    borderTopColor: '#24374c',
    paddingTop: 8,
    gap: 4,
  },
  yearLabel: {
    color: '#9fc3ef',
    fontWeight: '800',
    fontSize: 14,
  },
  yearValues: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  yearValue: {
    color: '#d8e6f8',
    fontSize: 12,
    fontWeight: '600',
  },
  rowCard: {
    borderWidth: 1,
    borderColor: '#2a3c50',
    borderRadius: 10,
    backgroundColor: '#0f1620',
    padding: 10,
    gap: 5,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  rowTitleBlock: {
    flex: 1,
    gap: 1,
  },
  rowTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rowEventTypeIconWrap: {
    width: 20,
    height: 20,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    backgroundColor: '#0f1620',
  },
  rowTitle: {
    fontWeight: '700',
    paddingTop: 1,
  },
  rowTitlePrice: {
    color: '#67d68d',
    fontWeight: '800',
    fontSize: 18,
    lineHeight: 21,
  },
  rowDate: {
    color: '#a5bbd2',
    fontSize: 12,
    fontWeight: '600',
  },
  rowDateBlock: {
    flex: 1,
    alignItems: 'flex-end',
    gap: 1,
  },
  roleChip: {
    color: '#8dc2ff',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'left',
  },
  rowMoneyBlock: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  rowRoleLeft: {
    minWidth: 118,
    paddingTop: 1,
  },
  rowMoneyRight: {
    flex: 1,
    alignItems: 'flex-end',
    gap: 1,
  },
  completedAtText: {
    color: '#9fc4dd',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'right',
  },
  rowMoneyBreakdown: {
    color: '#9fc4dd',
    fontSize: 12,
    textAlign: 'right',
  },
  rowModifierBreakdown: {
    color: '#7fb5e8',
    fontSize: 11,
    textAlign: 'right',
  },
});
