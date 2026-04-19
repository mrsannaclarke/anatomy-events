import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState, type ComponentProps } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { AppLoadingScreen } from '@/components/ui/app-loading-screen';
import { GlowPressable as Pressable } from '@/components/ui/glow-pressable';
import { isPayoutDisabledForUser } from '@/constants/admin-capabilities';
import { STAFF_PERMISSIONS } from '@/constants/auth-permissions';
import { isShopCapturedToShopByName, normalizeNameKey } from '@/constants/pay-framework';
import { isHistoricalForceShopCustomFlashToFullFee } from '@/constants/historical-payout-truth';
import { SHEET_SYNC_CONFIG } from '@/constants/sheets-sync';
import { useEvents } from '@/context/events-context';
import { useAuthFramework } from '@/lib/auth-framework';
import { computeEventTotals, formatCurrency, parseMoney } from '@/lib/event-math';
import {
  buildPricingSchedulePayoutKey,
  formatEventDateDisplay,
  getCompletedAtDisplayLabel,
  getCompletedYearKey,
  getPersonPayRow,
  isEventCancelledForPay,
  isEventCompleteForPay,
  parseEventTimestamp,
  type PersonPayRow,
  type PricingSchedulePayoutMap,
} from '@/lib/pay-framework';
import {
  buildStaffTabPayoutOverrideKey,
  type StaffTabPayoutOverrideMap,
} from '@/lib/payout-overrides';
import {
  pullCompletedEventStaffAssignmentsFromSheet,
  pullEventsFromSheet,
  pullHistoricalPayoutOverridesSnapshotFromStaffTabs,
  pullPricingSchedulePayoutMapFromSheet,
  type CompletedEventStaffAssignmentMap,
} from '@/lib/sheets-sync';
import type { EventRecord } from '@/types/events';

type EventPayoutLine = {
  personName: string;
  row: PersonPayRow;
  isShopCapturedToShop: boolean;
};

type CapturedModifierBreakdown = {
  artistBase: number;
  counter: number;
  customFlash: number;
  radius: number;
  temporaryTattoos: number;
  extraHourly: number;
};

type ShopCapturedStaffLine = {
  personName: string;
  amount: number;
  modifierBreakdown: CapturedModifierBreakdown;
};

type ShopModifierBreakdown = {
  baseOther: number;
  customFlashFee: number;
  customFlashShop: number;
  radiusFee: number;
  radiusShop: number;
  temporaryTattooFee: number;
  temporaryTattooShop: number;
  extraHourlyFee: number;
  extraHourlyShop: number;
};

type StaffTypeCounts = {
  artistCount: number;
  counterCount: number;
};

type ShopProfitEventCard = {
  event: EventRecord;
  lines: EventPayoutLine[];
  counterUnassignedTotal: number;
  grossTotal: number;
  staffPaidTotal: number;
  shopTotal: number;
  remainder: number;
  staffTypeCounts: StaffTypeCounts;
  shopCapturedStaffLines: ShopCapturedStaffLine[];
  shopModifierBreakdown: ShopModifierBreakdown;
};

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

function isExplicitCounterNoneSelection(value: string): boolean {
  const tokens = value
    .split(/[,\n;/&]+/)
    .map((entry) => normalizeNameKey(entry))
    .filter(Boolean);
  if (tokens.length === 0) return false;
  const hasNoneToken = tokens.includes('none');
  const hasAssignedPersonToken = tokens.some((token) => isValidPersonToken(token));
  return hasNoneToken && !hasAssignedPersonToken;
}

function hasValidNameList(value: string): boolean {
  return parseNames(value).length > 0;
}

function resolveNameListWithFallback(primary: string, fallback: string): string {
  if (hasValidNameList(primary)) return primary;
  if (hasValidNameList(fallback)) return fallback;
  return primary;
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

function sortEventsByDateDesc(a: EventRecord, b: EventRecord): number {
  const aDate = parseEventTimestamp(a.eventDate);
  const bDate = parseEventTimestamp(b.eventDate);
  if (aDate == null && bDate == null) return b.clientName.localeCompare(a.clientName);
  if (aDate == null) return 1;
  if (bDate == null) return -1;
  return bDate - aDate;
}

function normalizeOneCentNoise(value: number): number {
  const rounded = Math.round(value * 100) / 100;
  const cents = Math.abs(Math.round(rounded * 100)) % 100;
  if (cents === 1) {
    return rounded >= 0 ? Math.floor(rounded) : Math.ceil(rounded);
  }
  if (cents === 99) {
    return rounded >= 0 ? Math.ceil(rounded) : Math.floor(rounded);
  }
  return rounded;
}

function toCapturedModifierBreakdown(row: PersonPayRow): CapturedModifierBreakdown {
  return {
    artistBase: normalizeOneCentNoise(Math.max(0, row.artistBasePayout)),
    counter: normalizeOneCentNoise(Math.max(0, row.counterPayout)),
    customFlash: normalizeOneCentNoise(Math.max(0, row.artistModifierBreakdown.customFlash)),
    radius: normalizeOneCentNoise(Math.max(0, row.artistModifierBreakdown.radius)),
    temporaryTattoos: normalizeOneCentNoise(Math.max(0, row.artistModifierBreakdown.temporaryTattoos)),
    extraHourly: normalizeOneCentNoise(Math.max(0, row.artistModifierBreakdown.extraHourly)),
  };
}

function getModifierDisplayItems(modifierBreakdown: CapturedModifierBreakdown): { label: string; amount: number }[] {
  return [
    { label: 'Artist Base', amount: modifierBreakdown.artistBase },
    { label: 'Counter', amount: modifierBreakdown.counter },
    { label: 'Custom Flash Bonus', amount: modifierBreakdown.customFlash },
    { label: 'Radius Share', amount: modifierBreakdown.radius },
    { label: 'Temporary Tattoos', amount: modifierBreakdown.temporaryTattoos },
    { label: 'Extra Hourly Share', amount: modifierBreakdown.extraHourly },
  ].filter((item) => item.amount > 0);
}

function getCapturedIncomeLabel(personName: string): string {
  if (normalizeNameKey(personName) === 'tomma') return "Tomma's Income";
  return `${personName} (to Shop)`;
}

function formatPercent(value: number, total: number): string {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return '0.0%';
  return `${((value / total) * 100).toFixed(1)}%`;
}

function formatSchedulePercent(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0.0%';
  return `${(value * 100).toFixed(1)}%`;
}

function roleSortRank(role: PersonPayRow['role']): number {
  if (role === 'counter') return 0;
  if (role === 'artist+counter') return 1;
  return 2;
}

function roleLabel(value: PersonPayRow['role']): string {
  if (value === 'artist') return 'Role: Artist';
  if (value === 'counter') return 'Role: Counter';
  return 'Role: Artist + Counter';
}

type EventTypeVisual = {
  icon: ComponentProps<typeof MaterialIcons>['name'];
  color: string;
};

function getEventTypeVisual(eventType: string): EventTypeVisual {
  const normalized = eventType.trim().toLowerCase();
  if (normalized.includes('private')) return { icon: 'celebration', color: '#b58bff' };
  if (normalized.includes('corporate')) return { icon: 'business-center', color: '#6ab7ff' };
  if (normalized.includes('wedding')) return { icon: 'favorite', color: '#ff7fb8' };
  if (normalized.includes('fundraiser')) return { icon: 'volunteer-activism', color: '#7fd29a' };
  return { icon: 'event-note', color: '#f1b56f' };
}

export default function ShopProfitScreen() {
  const router = useRouter();
  const { events, upsertEventFromRemote } = useEvents();
  const { user, canAccessAdminToolsForViewer } = useAuthFramework();
  const [sheetEvents, setSheetEvents] = useState<EventRecord[] | null>(null);
  const [staffTabOverrides, setStaffTabOverrides] = useState<StaffTabPayoutOverrideMap>({});
  const [pricingSchedulePayoutMap, setPricingSchedulePayoutMap] = useState<PricingSchedulePayoutMap>({});
  const [completedStaffAssignments, setCompletedStaffAssignments] = useState<CompletedEventStaffAssignmentMap>({});
  const [syncStatus, setSyncStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [selectedYear, setSelectedYear] = useState<string>('All');
  const [expandedEventIds, setExpandedEventIds] = useState<Record<string, boolean>>({});

  const payoutDisabledForCurrentLogin = isPayoutDisabledForUser(user);
  const canViewAdmin = useMemo(
    () => canAccessAdminToolsForViewer && !payoutDisabledForCurrentLogin,
    [canAccessAdminToolsForViewer, payoutDisabledForCurrentLogin],
  );

  function goToAdminTools() {
    router.replace('/admin');
  }

  function openEventDetails(event: EventRecord) {
    upsertEventFromRemote(event);
    router.push(
      `/event/${event.id}?returnTo=${encodeURIComponent('/shop-profit')}&clientName=${encodeURIComponent(event.clientName || '')}`,
    );
  }

  function toggleEventBreakdown(eventId: string) {
    setExpandedEventIds((current) => ({
      ...current,
      [eventId]: !current[eventId],
    }));
  }

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      setSyncStatus('loading');
      try {
        const [snapshot, pricingMap, completedAssignmentsMap, liveEvents] = await Promise.all([
          pullHistoricalPayoutOverridesSnapshotFromStaffTabs(SHEET_SYNC_CONFIG),
          pullPricingSchedulePayoutMapFromSheet(SHEET_SYNC_CONFIG).catch(() => ({} as PricingSchedulePayoutMap)),
          pullCompletedEventStaffAssignmentsFromSheet(SHEET_SYNC_CONFIG).catch(
            () => ({} as CompletedEventStaffAssignmentMap),
          ),
          pullEventsFromSheet(SHEET_SYNC_CONFIG).catch(() => [] as EventRecord[]),
        ]);

        if (!isMounted) return;
        setSheetEvents(liveEvents);
        setStaffTabOverrides(snapshot.overrides);
        setPricingSchedulePayoutMap(pricingMap);
        setCompletedStaffAssignments(completedAssignmentsMap);
        setSyncStatus('ready');
      } catch {
        if (!isMounted) return;
        setSheetEvents(null);
        setStaffTabOverrides({});
        setPricingSchedulePayoutMap({});
        setCompletedStaffAssignments({});
        setSyncStatus('error');
      }
    }

    if (canViewAdmin) {
      void loadData();
    } else {
      setSyncStatus('ready');
    }

    return () => {
      isMounted = false;
    };
  }, [canViewAdmin]);

  const sourceEvents = sheetEvents ?? events;

  const effectiveEvents = useMemo(() => {
    return sourceEvents.map((event) => {
      const entryKey = event.entryId.trim();
      const completedFallback = entryKey ? completedStaffAssignments[entryKey] : undefined;
      if (!completedFallback) return event;

      return {
        ...event,
        artistNames: resolveNameListWithFallback(event.artistNames, completedFallback.artistNames),
        counterNames: resolveNameListWithFallback(event.counterNames, completedFallback.counterNames),
      };
    });
  }, [completedStaffAssignments, sourceEvents]);

  const peoplePool = useMemo(() => {
    const permissionNames = STAFF_PERMISSIONS.filter((entry) =>
      entry.roles.includes('artist') || entry.roles.includes('counter'),
    ).map((entry) => entry.name);

    const fromEvents = effectiveEvents.flatMap((event) => [
      ...parseNames(event.artistNames),
      ...parseNames(event.counterNames),
    ]);

    const fromOverrides = Object.values(staffTabOverrides).map((entry) => entry.personName);
    return uniqueByNormalizedName([...permissionNames, ...fromEvents, ...fromOverrides]);
  }, [effectiveEvents, staffTabOverrides]);

  const cards = useMemo<ShopProfitEventCard[]>(() => {
    const completedEvents = effectiveEvents
      .filter((event) => isEventCompleteForPay(event) && !isEventCancelledForPay(event))
      .sort(sortEventsByDateDesc);

    return completedEvents.map((event) => {
      const lines: EventPayoutLine[] = peoplePool
        .map((personName) => {
          const override = staffTabOverrides[buildStaffTabPayoutOverrideKey(event.entryId, personName)];
          const row = getPersonPayRow(event, personName, override, pricingSchedulePayoutMap);
          if (!row || !row.isComplete) return null;
          if (row.totalPayout <= 0 && row.artistPayout <= 0 && row.counterPayout <= 0) return null;
          return {
            personName,
            row,
            isShopCapturedToShop: isShopCapturedToShopByName(personName),
          };
        })
        .filter((entry): entry is EventPayoutLine => entry != null)
        .sort((a, b) => {
          const roleDelta = roleSortRank(a.row.role) - roleSortRank(b.row.role);
          if (roleDelta !== 0) return roleDelta;
          return a.personName.localeCompare(b.personName);
        });

      const shopCapturedStaffLines = lines
        .filter((line) => line.isShopCapturedToShop)
        .map((line) => ({
          personName: line.personName,
          amount: normalizeOneCentNoise(line.row.totalPayout),
          modifierBreakdown: toCapturedModifierBreakdown(line.row),
        }))
        .filter((line) => line.amount > 0);
      const shopCapturedStaffTotal = shopCapturedStaffLines.reduce((sum, line) => sum + line.amount, 0);

      const staffPaidAssignedTotalRaw = lines.reduce((sum, line) => sum + line.row.totalPayout, 0);
      const staffPaidAssignedTotal = staffPaidAssignedTotalRaw - shopCapturedStaffTotal;

      const financials = completedStaffAssignments[event.entryId.trim()];
      const computed = computeEventTotals(event);

      const grossTotal =
        financials && financials.hasTotalForEvent ? financials.totalForEvent : Math.max(0, computed.computedTotal);
      const baseShopTotal =
        financials && financials.hasShopProfit
          ? financials.shopProfit
          : Math.max(0, grossTotal - staffPaidAssignedTotalRaw);
      const shopTotal = normalizeOneCentNoise(baseShopTotal + shopCapturedStaffTotal);

      const customFlashFee = normalizeOneCentNoise(
        financials ? financials.customFlashFeeTotal : Math.max(0, computed.effectiveFees.customFlashFee),
      );
      let customFlashShop = normalizeOneCentNoise(financials ? financials.customFlashShopTotal : 0);
      if (isHistoricalForceShopCustomFlashToFullFee(event.entryId) && customFlashFee > 0) {
        customFlashShop = normalizeOneCentNoise(customFlashFee);
      }

      const radiusFee = normalizeOneCentNoise(
        financials ? financials.radiusFeeTotal : Math.max(0, computed.effectiveFees.radiusFee),
      );
      const radiusShop = normalizeOneCentNoise(financials ? financials.radiusShopTotal : 0);

      const temporaryTattooFee = normalizeOneCentNoise(
        financials ? financials.temporaryTattooFeeTotal : Math.max(0, computed.effectiveFees.temporaryTattooFee),
      );
      const temporaryTattooShop = normalizeOneCentNoise(temporaryTattooFee);

      const extraHourlyFeeRaw = financials
        ? financials.extraHourlyArtistTotal + financials.extraHourlyShopTotal
        : Math.max(0, parseMoney(event.extraHourlyCharge));
      const extraHourlyFee = normalizeOneCentNoise(extraHourlyFeeRaw);
      const extraHourlyShop = normalizeOneCentNoise(financials ? financials.extraHourlyShopTotal : 0);

      const displayGrossTotal = normalizeOneCentNoise(grossTotal);
      let displayShopTotal = normalizeOneCentNoise(shopTotal);

      const initialRemainder = displayGrossTotal - (staffPaidAssignedTotal + displayShopTotal);
      const counterFeeConfigured = normalizeOneCentNoise(
        financials ? financials.counterFeeTotal : Math.max(0, parseMoney(event.counterStaffCharge)),
      );
      const counterNoneToShopTotal =
        isExplicitCounterNoneSelection(event.counterNames) && initialRemainder > 0.01
          ? normalizeOneCentNoise(Math.min(counterFeeConfigured, initialRemainder))
          : 0;

      if (counterNoneToShopTotal > 0.01) {
        displayShopTotal = normalizeOneCentNoise(displayShopTotal + counterNoneToShopTotal);
      }

      const counterUnassignedTotal =
        counterNoneToShopTotal > 0.01 ? 0 : initialRemainder > 0.01 ? normalizeOneCentNoise(initialRemainder) : 0;
      const displayStaffPaidTotal = normalizeOneCentNoise(staffPaidAssignedTotal + counterUnassignedTotal);
      const remainder = displayGrossTotal - (displayStaffPaidTotal + displayShopTotal);
      const displayRemainder = Math.abs(remainder) <= 0.01 ? 0 : normalizeOneCentNoise(remainder);

      const modifierShopTotal =
        customFlashShop + radiusShop + temporaryTattooShop + extraHourlyShop + shopCapturedStaffTotal;
      const shopBaseOther = normalizeOneCentNoise(displayShopTotal - modifierShopTotal);
      const artistNamesInvolved = new Set<string>();
      const counterNamesInvolved = new Set<string>();

      lines.forEach((line) => {
        const personKey = normalizeNameKey(line.personName);
        if (!personKey) return;
        if (line.row.role === 'artist' || line.row.role === 'artist+counter') {
          artistNamesInvolved.add(personKey);
        }
        if (line.row.role === 'counter' || line.row.role === 'artist+counter') {
          counterNamesInvolved.add(personKey);
        }
      });

      return {
        event,
        lines,
        counterUnassignedTotal,
        grossTotal: displayGrossTotal,
        staffPaidTotal: displayStaffPaidTotal,
        shopTotal: displayShopTotal,
        remainder: displayRemainder,
        staffTypeCounts: {
          artistCount: artistNamesInvolved.size,
          counterCount: counterNamesInvolved.size,
        },
        shopCapturedStaffLines,
        shopModifierBreakdown: {
          baseOther: shopBaseOther,
          customFlashFee,
          customFlashShop,
          radiusFee,
          radiusShop,
          temporaryTattooFee,
          temporaryTattooShop,
          extraHourlyFee,
          extraHourlyShop,
        },
      };
    });
  }, [completedStaffAssignments, effectiveEvents, peoplePool, pricingSchedulePayoutMap, staffTabOverrides]);

  const yearOptions = useMemo(() => {
    const years = Array.from(
      new Set(
        cards
          .map((card) => getCompletedYearKey(card.event))
          .filter((year) => year && year !== 'Untracked'),
      ),
    ).sort((a, b) => Number.parseInt(b, 10) - Number.parseInt(a, 10));
    return ['All', ...years];
  }, [cards]);

  const effectiveSelectedYear = yearOptions.includes(selectedYear) ? selectedYear : 'All';
  const visibleCards = useMemo(() => {
    if (effectiveSelectedYear === 'All') return cards;
    return cards.filter((card) => getCompletedYearKey(card.event) === effectiveSelectedYear);
  }, [cards, effectiveSelectedYear]);

  const grandGrossTotal = useMemo(
    () => visibleCards.reduce((sum, card) => sum + card.grossTotal, 0),
    [visibleCards],
  );
  const grandStaffPaidTotal = useMemo(
    () => visibleCards.reduce((sum, card) => sum + card.staffPaidTotal, 0),
    [visibleCards],
  );
  const grandShopTotal = useMemo(
    () => visibleCards.reduce((sum, card) => sum + card.shopTotal, 0),
    [visibleCards],
  );

  const shopBaseTotal = useMemo(
    () => visibleCards.reduce((sum, card) => sum + card.shopModifierBreakdown.baseOther, 0),
    [visibleCards],
  );
  const shopCapturedStaffSummary = useMemo(() => {
    const byName: Record<string, ShopCapturedStaffLine> = {};

    visibleCards.forEach((card) => {
      card.shopCapturedStaffLines.forEach((line) => {
        const key = normalizeNameKey(line.personName) || line.personName;
        const existing = byName[key];
        if (!existing) {
          byName[key] = {
            personName: line.personName,
            amount: line.amount,
            modifierBreakdown: { ...line.modifierBreakdown },
          };
          return;
        }

        existing.amount = normalizeOneCentNoise(existing.amount + line.amount);
        existing.modifierBreakdown.artistBase = normalizeOneCentNoise(
          existing.modifierBreakdown.artistBase + line.modifierBreakdown.artistBase,
        );
        existing.modifierBreakdown.counter = normalizeOneCentNoise(
          existing.modifierBreakdown.counter + line.modifierBreakdown.counter,
        );
        existing.modifierBreakdown.customFlash = normalizeOneCentNoise(
          existing.modifierBreakdown.customFlash + line.modifierBreakdown.customFlash,
        );
        existing.modifierBreakdown.radius = normalizeOneCentNoise(
          existing.modifierBreakdown.radius + line.modifierBreakdown.radius,
        );
        existing.modifierBreakdown.temporaryTattoos = normalizeOneCentNoise(
          existing.modifierBreakdown.temporaryTattoos + line.modifierBreakdown.temporaryTattoos,
        );
        existing.modifierBreakdown.extraHourly = normalizeOneCentNoise(
          existing.modifierBreakdown.extraHourly + line.modifierBreakdown.extraHourly,
        );
      });
    });

    return Object.values(byName).sort((a, b) => a.personName.localeCompare(b.personName));
  }, [visibleCards]);
  const customFlashShopTotal = useMemo(
    () => visibleCards.reduce((sum, card) => sum + card.shopModifierBreakdown.customFlashShop, 0),
    [visibleCards],
  );
  const radiusShopTotal = useMemo(
    () => visibleCards.reduce((sum, card) => sum + card.shopModifierBreakdown.radiusShop, 0),
    [visibleCards],
  );
  const temporaryTattooShopTotal = useMemo(
    () => visibleCards.reduce((sum, card) => sum + card.shopModifierBreakdown.temporaryTattooShop, 0),
    [visibleCards],
  );
  const extraHourlyShopTotal = useMemo(
    () => visibleCards.reduce((sum, card) => sum + card.shopModifierBreakdown.extraHourlyShop, 0),
    [visibleCards],
  );

  if (!canViewAdmin) {
    return (
      <View style={styles.page}>
        <View style={styles.card}>
          <ThemedText style={styles.sectionTitle}>Shop Profit</ThemedText>
          <ThemedText style={styles.helperText}>
            {payoutDisabledForCurrentLogin
              ? 'Payout Ledger is disabled for this login.'
              : 'This page is only visible to admins and super admins.'}
          </ThemedText>
          <Pressable style={styles.secondaryButton} onPress={goToAdminTools}>
            <View style={styles.buttonContent}>
              <MaterialIcons name="arrow-back" size={16} color="#c7d8eb" />
              <ThemedText style={styles.secondaryButtonText}>Back</ThemedText>
            </View>
          </Pressable>
        </View>
      </View>
    );
  }

  if (syncStatus === 'loading') {
    return <AppLoadingScreen />;
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Pressable style={styles.secondaryButton} onPress={goToAdminTools}>
          <View style={styles.buttonContent}>
            <MaterialIcons name="arrow-back" size={16} color="#c7d8eb" />
            <ThemedText style={styles.secondaryButtonText}>Back to Admin Tools</ThemedText>
          </View>
        </Pressable>
      </View>

      <View style={styles.card}>
        <ThemedText style={styles.sectionTitle}>Shop Profit</ThemedText>
        <ThemedText style={styles.helperText}>Completed-event shop totals and breakdown.</ThemedText>
        {syncStatus === 'loading' ? (
          <ThemedText style={styles.helperText}>Loading shop profit data...</ThemedText>
        ) : null}
        {syncStatus === 'error' ? (
          <ThemedText style={styles.helperTextError}>Sheet sync issue. Showing schedule-derived fallback totals.</ThemedText>
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
        <View style={styles.summaryRow}>
          <View>
            <ThemedText style={styles.summaryLabel}>Completed Events</ThemedText>
            <ThemedText style={styles.summaryValue}>{String(visibleCards.length)}</ThemedText>
          </View>
          <View>
            <ThemedText style={styles.summaryLabel}>Gross Total</ThemedText>
            <ThemedText style={styles.summaryValue}>{formatCurrency(grandGrossTotal)}</ThemedText>
          </View>
          <View>
            <ThemedText style={styles.summaryLabel}>Staff Paid</ThemedText>
            <ThemedText style={styles.summaryValue}>{formatCurrency(grandStaffPaidTotal)}</ThemedText>
          </View>
          <View>
            <ThemedText style={styles.summaryLabel}>Shop Total</ThemedText>
            <ThemedText style={styles.summaryValue}>{formatCurrency(grandShopTotal)}</ThemedText>
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <ThemedText style={styles.sectionTitle}>Shop Breakdown Totals</ThemedText>
        <ThemedText style={styles.breakdownLine}>Shop Base {formatCurrency(shopBaseTotal)}</ThemedText>
        {shopCapturedStaffSummary.map((capturedSummary) => (
          <View key={`captured-summary-${normalizeNameKey(capturedSummary.personName)}`} style={styles.capturedStaffBlock}>
            <ThemedText style={styles.breakdownLine}>
              {getCapturedIncomeLabel(capturedSummary.personName)} {formatCurrency(capturedSummary.amount)}
            </ThemedText>
            {getModifierDisplayItems(capturedSummary.modifierBreakdown).map((modifierItem) => (
              <ThemedText
                key={`captured-summary-${normalizeNameKey(capturedSummary.personName)}-${modifierItem.label}`}
                style={styles.breakdownSubLine}>
                • {modifierItem.label} {formatCurrency(modifierItem.amount)}
              </ThemedText>
            ))}
          </View>
        ))}
        {customFlashShopTotal > 0 ? (
          <ThemedText style={styles.breakdownLine}>Custom Flash Shop {formatCurrency(customFlashShopTotal)}</ThemedText>
        ) : null}
        {radiusShopTotal > 0 ? (
          <ThemedText style={styles.breakdownLine}>Radius Shop {formatCurrency(radiusShopTotal)}</ThemedText>
        ) : null}
        {temporaryTattooShopTotal > 0 ? (
          <ThemedText style={styles.breakdownLine}>Temporary Tattoos Shop {formatCurrency(temporaryTattooShopTotal)}</ThemedText>
        ) : null}
        {extraHourlyShopTotal > 0 ? (
          <ThemedText style={styles.breakdownLine}>Extra Hourly Shop {formatCurrency(extraHourlyShopTotal)}</ThemedText>
        ) : null}
      </View>

      {visibleCards.length === 0 ? (
        <View style={styles.card}>
          <ThemedText style={styles.helperText}>No completed events found for this year.</ThemedText>
        </View>
      ) : null}

      {visibleCards.map((card) => {
        const completedAt = getCompletedAtDisplayLabel(card.event);
        const eventTypeVisual = getEventTypeVisual(card.event.eventType);
        const isExpanded = Boolean(expandedEventIds[card.event.id]);
        const showAssignCounterPrompt =
          card.counterUnassignedTotal > 0.01 && !isExplicitCounterNoneSelection(card.event.counterNames);
        const showShopBreakdown = Math.abs(card.shopTotal - card.shopModifierBreakdown.baseOther) > 0.01;
        const computedTotals = computeEventTotals(card.event);
        const artistNamesForSchedule = parseNames(card.event.artistNames);
        const scheduleArtistCount =
          artistNamesForSchedule.length > 0 ? artistNamesForSchedule.length : Math.max(1, computedTotals.artistCount || 1);
        const scheduleKey = buildPricingSchedulePayoutKey(card.event.year, scheduleArtistCount);
        const scheduleRow = pricingSchedulePayoutMap[scheduleKey];
        const radiusShopSchedulePct = scheduleRow ? Math.max(0, 1 - scheduleRow.radiusArtistSharePct) : 0;
        const extraHourlyShopSchedulePct = scheduleRow ? Math.max(0, 1 - scheduleRow.extraHourlyArtistSharePct) : 0;
        const customFlashTotal = Math.max(0, card.shopModifierBreakdown.customFlashFee);
        const customFlashShopTotal = Math.max(0, card.shopModifierBreakdown.customFlashShop);
        const customFlashArtistTotal = Math.max(0, customFlashTotal - customFlashShopTotal);
        const staffAllocationLines = card.lines.filter((line) => !line.isShopCapturedToShop);
        return (
          <View key={card.event.id} style={styles.card}>
            <View style={styles.eventHeader}>
              <View style={styles.eventHeaderLeft}>
                <View style={styles.eventClientRow}>
                  <View style={[styles.eventTypeIconWrap, { borderColor: eventTypeVisual.color }]}>
                    <MaterialIcons name={eventTypeVisual.icon} size={13} color={eventTypeVisual.color} />
                  </View>
                  <Pressable style={styles.eventClientButton} onPress={() => toggleEventBreakdown(card.event.id)}>
                    <ThemedText style={[styles.eventClient, { color: eventTypeVisual.color }]}>
                      {card.event.clientName || 'Untitled Event'}
                    </ThemedText>
                    <MaterialIcons
                      name={isExpanded ? 'expand-less' : 'expand-more'}
                      size={16}
                      color={eventTypeVisual.color}
                    />
                  </Pressable>
                </View>
                <ThemedText style={styles.eventTotal}>{formatCurrency(card.shopTotal)}</ThemedText>
              </View>
              <View style={styles.eventDateBlock}>
                <ThemedText style={styles.eventMeta}>{formatEventDateDisplay(card.event.eventDate) || 'No date'}</ThemedText>
                <ThemedText style={styles.eventMeta}>Completed: {completedAt || 'timestamp pending'}</ThemedText>
              </View>
            </View>
            <View style={styles.eventMoneyBreakdown}>
              <ThemedText style={styles.eventMoneyLinePrimary}>Gross Total {formatCurrency(card.grossTotal)}</ThemedText>
              <ThemedText style={styles.eventMoneyLinePrimary}>Staff Paid {formatCurrency(card.staffPaidTotal)}</ThemedText>
              <ThemedText style={styles.eventMoneyLinePrimary}>Shop Total {formatCurrency(card.shopTotal)}</ThemedText>
              <ThemedText style={styles.eventMoneyLineSecondary}>
                Staff Involved: Artists {card.staffTypeCounts.artistCount} • Counter {card.staffTypeCounts.counterCount}
              </ThemedText>
              {showAssignCounterPrompt ? (
                <Pressable style={styles.inlineAssignCounterButton} onPress={() => openEventDetails(card.event)}>
                  <ThemedText style={styles.inlineAssignCounterButtonText}>
                    Counter (Unassigned) {formatCurrency(card.counterUnassignedTotal)} • Assign Counter
                  </ThemedText>
                </Pressable>
              ) : null}
              {showShopBreakdown ? (
                <>
                  <ThemedText style={styles.eventMoneyBreakdownLine}>
                    • Shop Base {formatCurrency(card.shopModifierBreakdown.baseOther)}
                  </ThemedText>
                  {card.shopCapturedStaffLines.map((capturedLine) => (
                    <View
                      key={`${card.event.id}-shop-captured-${normalizeNameKey(capturedLine.personName)}`}
                      style={styles.capturedStaffBlock}>
                      <ThemedText style={styles.eventMoneyBreakdownLine}>
                        • {getCapturedIncomeLabel(capturedLine.personName)} {formatCurrency(capturedLine.amount)}
                      </ThemedText>
                      {getModifierDisplayItems(capturedLine.modifierBreakdown).map((modifierItem) => (
                        <ThemedText
                          key={`${card.event.id}-shop-captured-${normalizeNameKey(capturedLine.personName)}-${modifierItem.label}`}
                          style={styles.eventMoneyBreakdownSubLine}>
                          • {modifierItem.label} {formatCurrency(modifierItem.amount)}
                        </ThemedText>
                      ))}
                    </View>
                  ))}
                  {card.shopModifierBreakdown.customFlashFee > 0 ? (
                    <ThemedText style={styles.eventMoneyBreakdownLine}>
                      • Custom Flash Shop {formatCurrency(card.shopModifierBreakdown.customFlashShop)}
                    </ThemedText>
                  ) : null}
                  {card.shopModifierBreakdown.radiusFee > 0 ? (
                    <ThemedText style={styles.eventMoneyBreakdownLine}>
                      • Radius Shop {formatCurrency(card.shopModifierBreakdown.radiusShop)}
                    </ThemedText>
                  ) : null}
                  {card.shopModifierBreakdown.temporaryTattooFee > 0 ? (
                    <ThemedText style={styles.eventMoneyBreakdownLine}>
                      • Temporary Tattoos Shop {formatCurrency(card.shopModifierBreakdown.temporaryTattooShop)}
                    </ThemedText>
                  ) : null}
                  {card.shopModifierBreakdown.extraHourlyFee > 0 ? (
                    <ThemedText style={styles.eventMoneyBreakdownLine}>
                      • Extra Hourly Shop {formatCurrency(card.shopModifierBreakdown.extraHourlyShop)}
                    </ThemedText>
                  ) : null}
                </>
              ) : null}
              {Math.abs(card.remainder) > 0.01 ? (
                <ThemedText style={styles.eventMoneyWarning}>Remainder {formatCurrency(card.remainder)}</ThemedText>
              ) : null}
            </View>

            {isExpanded ? (
              <View style={styles.fullBreakdownSection}>
                <View style={styles.fullBreakdownHeaderRow}>
                  <ThemedText style={styles.fullBreakdownTitle}>Full Allocation</ThemedText>
                  <Pressable style={styles.inlineOpenDetailsButton} onPress={() => openEventDetails(card.event)}>
                    <ThemedText style={styles.inlineOpenDetailsButtonText}>Open Event</ThemedText>
                  </Pressable>
                </View>

                <ThemedText style={styles.fullBreakdownSummaryLine}>
                  Gross Total {formatCurrency(card.grossTotal)} (100.0%)
                </ThemedText>
                <ThemedText style={styles.fullBreakdownSummaryLine}>
                  Staff Paid {formatCurrency(card.staffPaidTotal)} ({formatPercent(card.staffPaidTotal, card.grossTotal)})
                </ThemedText>
                <ThemedText style={styles.fullBreakdownSummaryLine}>
                  Shop Total {formatCurrency(card.shopTotal)} ({formatPercent(card.shopTotal, card.grossTotal)})
                </ThemedText>
                {Math.abs(card.remainder) > 0.01 ? (
                  <ThemedText style={styles.fullBreakdownWarningLine}>
                    Remainder {formatCurrency(card.remainder)} ({formatPercent(card.remainder, card.grossTotal)})
                  </ThemedText>
                ) : null}
                <ThemedText style={styles.fullBreakdownSectionTitle}>Pay Schedule Percent Source</ThemedText>
                {scheduleRow ? (
                  <>
                    <ThemedText style={styles.fullBreakdownSubLine}>
                      Plan {card.event.year} • Artists {scheduleArtistCount}
                    </ThemedText>
                    <ThemedText style={styles.fullBreakdownSubLine}>
                      Radius Split: Artist {formatSchedulePercent(scheduleRow.radiusArtistSharePct)} • Shop{' '}
                      {formatSchedulePercent(radiusShopSchedulePct)}
                    </ThemedText>
                    <ThemedText style={styles.fullBreakdownSubLine}>
                      Extra Hourly Split: Artist {formatSchedulePercent(scheduleRow.extraHourlyArtistSharePct)} • Shop{' '}
                      {formatSchedulePercent(extraHourlyShopSchedulePct)}
                    </ThemedText>
                    {customFlashTotal > 0.01 ? (
                      <ThemedText style={styles.fullBreakdownSubLine}>
                        Custom Flash Split: Artist {formatPercent(customFlashArtistTotal, customFlashTotal)} (
                        {formatCurrency(customFlashArtistTotal)}) • Shop {formatPercent(customFlashShopTotal, customFlashTotal)} (
                        {formatCurrency(customFlashShopTotal)})
                      </ThemedText>
                    ) : null}
                    {card.shopModifierBreakdown.radiusFee > 0.01 ? (
                      <ThemedText style={styles.fullBreakdownSubLine}>
                        Radius Fee Total {formatCurrency(card.shopModifierBreakdown.radiusFee)}
                      </ThemedText>
                    ) : null}
                    {card.shopModifierBreakdown.extraHourlyFee > 0.01 ? (
                      <ThemedText style={styles.fullBreakdownSubLine}>
                        Extra Hourly Fee Total {formatCurrency(card.shopModifierBreakdown.extraHourlyFee)}
                      </ThemedText>
                    ) : null}
                  </>
                ) : (
                  <>
                    <ThemedText style={styles.fullBreakdownSubLine}>
                      No live pay-schedule row found for Plan {card.event.year} / {scheduleArtistCount} artists.
                    </ThemedText>
                    {customFlashTotal > 0.01 ? (
                      <ThemedText style={styles.fullBreakdownSubLine}>
                        Custom Flash Split: Artist {formatPercent(customFlashArtistTotal, customFlashTotal)} (
                        {formatCurrency(customFlashArtistTotal)}) • Shop {formatPercent(customFlashShopTotal, customFlashTotal)} (
                        {formatCurrency(customFlashShopTotal)})
                      </ThemedText>
                    ) : null}
                    {card.shopModifierBreakdown.radiusFee > 0.01 ? (
                      <ThemedText style={styles.fullBreakdownSubLine}>
                        Radius Fee Total {formatCurrency(card.shopModifierBreakdown.radiusFee)}
                      </ThemedText>
                    ) : null}
                    {card.shopModifierBreakdown.extraHourlyFee > 0.01 ? (
                      <ThemedText style={styles.fullBreakdownSubLine}>
                        Extra Hourly Fee Total {formatCurrency(card.shopModifierBreakdown.extraHourlyFee)}
                      </ThemedText>
                    ) : null}
                  </>
                )}

                <View style={styles.fullBreakdownSectionHeaderRow}>
                  <ThemedText style={styles.fullBreakdownSectionTitle}>Staff Allocation</ThemedText>
                  {showAssignCounterPrompt ? (
                    <Pressable style={styles.assignCounterButton} onPress={() => openEventDetails(card.event)}>
                      <ThemedText style={styles.assignCounterButtonText}>Assign Counter</ThemedText>
                    </Pressable>
                  ) : null}
                </View>
                {staffAllocationLines.length === 0 ? (
                  <ThemedText style={styles.fullBreakdownSubLine}>No staff payout rows found.</ThemedText>
                ) : (
                  staffAllocationLines.map((line) => {
                    const staffBreakdownItems = [
                      { label: 'Artist Base', amount: line.row.artistBasePayout },
                      { label: 'Counter', amount: line.row.counterPayout },
                      { label: 'Custom Flash Bonus', amount: line.row.artistModifierBreakdown.customFlash },
                      { label: 'Radius Share', amount: line.row.artistModifierBreakdown.radius },
                      { label: 'Temporary Tattoos', amount: line.row.artistModifierBreakdown.temporaryTattoos },
                      { label: 'Extra Hourly Share', amount: line.row.artistModifierBreakdown.extraHourly },
                    ].filter((item) => item.amount > 0.01);

                    return (
                      <View key={`${card.event.id}-staff-full-${normalizeNameKey(line.personName)}`} style={styles.fullBreakdownBlock}>
                        <ThemedText style={styles.fullBreakdownPrimaryLine}>
                          • {line.personName} ({roleLabel(line.row.role)}) {formatCurrency(line.row.totalPayout)}
                        </ThemedText>
                        {staffBreakdownItems.map((item) => (
                          <ThemedText
                            key={`${card.event.id}-staff-full-${normalizeNameKey(line.personName)}-${item.label}`}
                            style={styles.fullBreakdownSubLine}>
                            • {item.label} {formatCurrency(item.amount)}
                          </ThemedText>
                        ))}
                      </View>
                    );
                  })
                )}
                {showAssignCounterPrompt ? (
                  <ThemedText style={styles.fullBreakdownPrimaryLine}>
                    • Counter (Unassigned) {formatCurrency(card.counterUnassignedTotal)}
                  </ThemedText>
                ) : null}

                <ThemedText style={styles.fullBreakdownSectionTitle}>Shop Allocation</ThemedText>
                <ThemedText style={styles.fullBreakdownPrimaryLine}>
                  • Shop Base {formatCurrency(card.shopModifierBreakdown.baseOther)}
                </ThemedText>
                {card.shopCapturedStaffLines.map((capturedLine) => (
                  <View
                    key={`${card.event.id}-shop-full-${normalizeNameKey(capturedLine.personName)}`}
                    style={styles.fullBreakdownBlock}>
                    <ThemedText style={styles.fullBreakdownPrimaryLine}>
                      • {getCapturedIncomeLabel(capturedLine.personName)} {formatCurrency(capturedLine.amount)}
                    </ThemedText>
                    {getModifierDisplayItems(capturedLine.modifierBreakdown).map((modifierItem) => (
                      <ThemedText
                        key={`${card.event.id}-shop-full-${normalizeNameKey(capturedLine.personName)}-${modifierItem.label}`}
                        style={styles.fullBreakdownSubLine}>
                        • {modifierItem.label} {formatCurrency(modifierItem.amount)}
                      </ThemedText>
                    ))}
                  </View>
                ))}
                {card.shopModifierBreakdown.customFlashShop > 0.01 ? (
                  <ThemedText style={styles.fullBreakdownPrimaryLine}>
                    • Custom Flash Shop {formatCurrency(card.shopModifierBreakdown.customFlashShop)}
                  </ThemedText>
                ) : null}
                {card.shopModifierBreakdown.radiusShop > 0.01 ? (
                  <ThemedText style={styles.fullBreakdownPrimaryLine}>
                    • Radius Shop {formatCurrency(card.shopModifierBreakdown.radiusShop)}
                  </ThemedText>
                ) : null}
                {card.shopModifierBreakdown.temporaryTattooShop > 0.01 ? (
                  <ThemedText style={styles.fullBreakdownPrimaryLine}>
                    • Temporary Tattoos Shop {formatCurrency(card.shopModifierBreakdown.temporaryTattooShop)}
                  </ThemedText>
                ) : null}
                {card.shopModifierBreakdown.extraHourlyShop > 0.01 ? (
                  <ThemedText style={styles.fullBreakdownPrimaryLine}>
                    • Extra Hourly Shop {formatCurrency(card.shopModifierBreakdown.extraHourlyShop)}
                  </ThemedText>
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#0b1117',
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
  helperTextError: {
    color: '#f7b4a8',
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
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#2f4358',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: '#172230',
    alignSelf: 'flex-start',
  },
  secondaryButtonText: {
    color: '#c7d8eb',
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
    fontSize: 18,
    fontWeight: '800',
  },
  breakdownLine: {
    color: '#b9d4ec',
    fontSize: 13,
  },
  breakdownSubLine: {
    color: '#9ec3e4',
    fontSize: 12,
    paddingLeft: 14,
  },
  capturedStaffBlock: {
    gap: 1,
  },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  eventHeaderLeft: {
    flex: 1,
    gap: 2,
  },
  eventClientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  eventTypeIconWrap: {
    width: 20,
    height: 20,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    backgroundColor: '#0f1620',
  },
  eventClientButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  eventClient: {
    fontWeight: '700',
  },
  eventMeta: {
    color: '#9fc4dd',
    fontSize: 12,
  },
  eventDateBlock: {
    alignItems: 'flex-end',
    gap: 1,
  },
  eventTotal: {
    color: '#e3ecf8',
    fontWeight: '800',
    fontSize: 17,
  },
  eventMoneyBreakdown: {
    gap: 1,
    paddingTop: 2,
  },
  eventMoneyLinePrimary: {
    color: '#9fc4dd',
    fontSize: 12,
    fontWeight: '700',
  },
  eventMoneyLineSecondary: {
    color: '#84a8c9',
    fontSize: 12,
  },
  inlineAssignCounterButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#a56b59',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
    backgroundColor: '#2a1a18',
    marginTop: 2,
    marginBottom: 2,
  },
  inlineAssignCounterButtonText: {
    color: '#f3b8aa',
    fontSize: 11,
    fontWeight: '700',
  },
  eventMoneyBreakdownLine: {
    color: '#7fb5e8',
    fontSize: 12,
    paddingLeft: 8,
  },
  eventMoneyBreakdownSubLine: {
    color: '#a2c9ea',
    fontSize: 12,
    paddingLeft: 20,
  },
  eventMoneyWarning: {
    color: '#f7b4a8',
    fontSize: 12,
    fontWeight: '700',
  },
  fullBreakdownSection: {
    borderTopWidth: 1,
    borderTopColor: '#223447',
    marginTop: 8,
    paddingTop: 8,
    gap: 5,
  },
  fullBreakdownHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  fullBreakdownTitle: {
    color: '#dce9f7',
    fontSize: 13,
    fontWeight: '700',
  },
  inlineOpenDetailsButton: {
    borderWidth: 1,
    borderColor: '#2f4358',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#172230',
  },
  inlineOpenDetailsButtonText: {
    color: '#c7d8eb',
    fontSize: 11,
    fontWeight: '700',
  },
  fullBreakdownSectionTitle: {
    color: '#bbd3ea',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
  fullBreakdownSectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 4,
  },
  assignCounterButton: {
    borderWidth: 1,
    borderColor: '#a56b59',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#2a1a18',
  },
  assignCounterButtonText: {
    color: '#f3b8aa',
    fontSize: 11,
    fontWeight: '700',
  },
  fullBreakdownSummaryLine: {
    color: '#a7c1da',
    fontSize: 12,
  },
  fullBreakdownWarningLine: {
    color: '#f7b4a8',
    fontSize: 12,
    fontWeight: '700',
  },
  fullBreakdownBlock: {
    gap: 1,
  },
  fullBreakdownPrimaryLine: {
    color: '#9fd0fa',
    fontSize: 12,
  },
  fullBreakdownSubLine: {
    color: '#85b8e3',
    fontSize: 12,
    paddingLeft: 12,
  },
});
