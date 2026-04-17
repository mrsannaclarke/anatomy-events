import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { getCounterStaffChargeFromSchedule, getPricingScheduleRow } from '@/constants/pricing-schedule';
import { useEvents } from '@/context/events-context';
import { lookupDrivingDistanceMiles } from '@/lib/address-distance';
import {
  PRICING_SCHEDULE_BY_YEAR,
  computeEventTotals,
  formatCurrency,
  parseMoney,
} from '@/lib/event-math';
import { EMPTY_EVENT, type EventRecord } from '@/types/events';

const PRICING_SHEET_PUBLIC_URL_BY_YEAR: Readonly<Record<number, string>> = {
  2025: 'https://drive.google.com/file/d/1iYJBvR9GSXb_mwZtE4xysuoXpWCMxsFG/view?usp=sharing',
  2026: 'https://drive.google.com/file/d/1RqB2DEuH_AFm1yirkpdhAYQBpCTunSj9/view?usp=drive_link',
};
const DEFAULT_PLAN_YEAR = 2026;
const DEFAULT_BASE_ADDRESS = 'Anatomy Tattoo, Portland, OR';
const BASE_INCLUDED_HOURS = 5;
const DEPOSIT_RATE_PERCENT = 30;

function parseNumberInput(value: string): number {
  const normalized = value.trim().replace(/,/g, '');
  if (!normalized) return 0;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDecimal(value: number): string {
  if (!Number.isFinite(value)) return '';
  return value.toFixed(2);
}

function formatEventOptionLabel(event: EventRecord): string {
  const client = event.clientName.trim() || 'Untitled';
  const date = event.eventDate.trim();
  return date ? `${client} • ${date}` : client;
}

function normalizeStatus(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function parsePlanYear(value: string): number {
  const direct = Number.parseInt(value.trim(), 10);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const match = value.match(/\b(20\d{2})\b/);
  if (!match) return 0;
  return Number.parseInt(match[1], 10);
}

function deriveImportedBookedHours(event: EventRecord): number {
  const extraHours = parseNumberInput(event.extraHours);
  if (extraHours > 0) return BASE_INCLUDED_HOURS + extraHours;

  const reason = event.staffPriceAdjustmentReason || '';
  const match = reason.match(/from\s*5h\s*to\s*([0-9]+(?:\.[0-9]+)?)h/i);
  if (!match) return BASE_INCLUDED_HOURS;
  const parsed = parseNumberInput(match[1]);
  return parsed > 0 ? parsed : BASE_INCLUDED_HOURS;
}

function getUnifiedStatus(event: EventRecord): string {
  const normalizedStatus = event.status.trim();
  if (normalizedStatus) return normalizedStatus;
  return event.payStatus.trim();
}

function isLedgerEligible(event: EventRecord): boolean {
  const closedStatuses = new Set(['cancelled', 'canceled', 'event complete', 'event complete balance late']);
  const normalized = normalizeStatus(getUnifiedStatus(event));
  if (!normalized) return true;
  return !closedStatuses.has(normalized);
}

function normalizeFlag(value: string): string {
  const upper = value.trim().toUpperCase();
  if (upper === 'YES' || upper === 'NO' || upper === 'TBD') return upper;
  return 'NO';
}

function buildHypotheticalEvent(input: {
  year: number;
  artistCount: string;
  counterStaffCharge: string;
  customFlash: string;
  temporaryTattoos: string;
  eventAddress: string;
  travelDistance: string;
  extraHourlyCharge: string;
  staffAdjustment: string;
}): EventRecord {
  const baseTotalByArtists = PRICING_SCHEDULE_BY_YEAR[input.year]?.[Number.parseInt(input.artistCount, 10)] ?? 0;

  return {
    ...EMPTY_EVENT,
    year: String(input.year),
    numberOfArtists: input.artistCount,
    artistFeeBreakdown: String(baseTotalByArtists),
    counterStaffCharge: input.counterStaffCharge,
    customFlash: normalizeFlag(input.customFlash),
    temporaryTattoos: normalizeFlag(input.temporaryTattoos),
    travelDistance: input.travelDistance,
    extraHourlyCharge: input.extraHourlyCharge,
    staffPriceAdjustment: input.staffAdjustment,
    depositRequired: '',
    venueName: 'Hypothetical',
    eventAddress: input.eventAddress,
  };
}

function ChoiceChips({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.actionRow}>
      {options.map((option) => {
        const selected = value === option;
        return (
          <Pressable
            key={option}
            onPress={() => onChange(option)}
            style={[styles.yearChip, selected ? styles.yearChipActive : null]}>
            <ThemedText style={[styles.yearChipText, selected ? styles.yearChipTextActive : null]}>
              {option}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function PricingScreen() {
  const router = useRouter();
  const { events, createEvent, updateEvent, setSelectedEventId } = useEvents();
  const yearOptions = useMemo(
    () =>
      Object.keys(PRICING_SCHEDULE_BY_YEAR)
        .map((key) => Number.parseInt(key, 10))
        .filter((year) => Number.isFinite(year))
        .sort((a, b) => b - a),
    [],
  );

  const [selectedYear, setSelectedYear] = useState<number>(
    yearOptions.includes(DEFAULT_PLAN_YEAR) ? DEFAULT_PLAN_YEAR : (yearOptions[0] ?? DEFAULT_PLAN_YEAR),
  );
  const [hypotheticalArtistCount, setHypotheticalArtistCount] = useState<string>('');
  const [customFlashFlag, setCustomFlashFlag] = useState<string>('NO');
  const [temporaryTattoosFlag, setTemporaryTattoosFlag] = useState<string>('NO');
  const [eventAddress, setEventAddress] = useState<string>('');
  const [travelDistanceMiles, setTravelDistanceMiles] = useState<string>('');
  const [radiusLookupStatus, setRadiusLookupStatus] = useState<string>('');
  const [isLookingUpRadius, setIsLookingUpRadius] = useState(false);
  const [staffAdjustment, setStaffAdjustment] = useState<string>('');
  const [staffAdjustmentReason, setStaffAdjustmentReason] = useState<string>('');
  const [bookedHours, setBookedHours] = useState<string>('');
  const [saveMode, setSaveMode] = useState<'new' | 'import' | 'overwrite'>('new');
  const [newClientName, setNewClientName] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [newClientEmail, setNewClientEmail] = useState('');
  const [newClientEventDate, setNewClientEventDate] = useState('');
  const [selectedExistingEventId, setSelectedExistingEventId] = useState('');
  const [existingPickerOpen, setExistingPickerOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const [isSavingEntry, setIsSavingEntry] = useState(false);

  const selectedSchedule = PRICING_SCHEDULE_BY_YEAR[selectedYear] ?? {};
  const pricingSheetPublicUrl =
    PRICING_SHEET_PUBLIC_URL_BY_YEAR[selectedYear] ??
    PRICING_SHEET_PUBLIC_URL_BY_YEAR[DEFAULT_PLAN_YEAR];
  const artistCountOptions = Object.keys(selectedSchedule)
    .map((key) => Number.parseInt(key, 10))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);

  const parsedArtistCount = Number.parseInt(hypotheticalArtistCount, 10);
  const hasArtistCount = Number.isFinite(parsedArtistCount) && parsedArtistCount > 0;
  const scheduleRow = hasArtistCount ? getPricingScheduleRow(selectedYear, parsedArtistCount) : null;
  const counterStaffChargeRaw =
    hasArtistCount && scheduleRow
      ? formatDecimal(getCounterStaffChargeFromSchedule(selectedYear, parsedArtistCount))
      : '';
  const counterStatus = hasArtistCount && !scheduleRow ? 'No hardwired counter charge found for this plan.' : '';
  const parsedBookedHoursInput = parseNumberInput(bookedHours);
  const parsedBookedHours =
    bookedHours.trim().length > 0 ? parsedBookedHoursInput : BASE_INCLUDED_HOURS;
  const parsedTravelDistanceMiles = parseNumberInput(travelDistanceMiles);
  const hasBookedHours = parsedBookedHours > 0;
  const hasTravelDistance = travelDistanceMiles.trim().length > 0 && Number.isFinite(parsedTravelDistanceMiles);
  const hasBaseInputs = hasArtistCount && hasBookedHours;
  const freeRadiusMiles = scheduleRow?.freeRadiusMiles ?? 20;
  const customFlashSelection = normalizeFlag(customFlashFlag);
  const temporaryTattoosSelection = normalizeFlag(temporaryTattoosFlag);
  const extraHourlyPerArtist = scheduleRow?.extraHourlyPerArtist ?? 0;
  const extraHourlyTotalPerHour = extraHourlyPerArtist * (hasArtistCount ? parsedArtistCount : 0);
  const autoExtraHourlyCharge =
    hasBaseInputs && parsedBookedHours > BASE_INCLUDED_HOURS
      ? (extraHourlyTotalPerHour * (parsedBookedHours - BASE_INCLUDED_HOURS)).toFixed(2)
      : '';

  const hypotheticalEvent = buildHypotheticalEvent({
    year: selectedYear,
    artistCount: hypotheticalArtistCount,
    counterStaffCharge: counterStaffChargeRaw,
    customFlash: customFlashFlag,
    temporaryTattoos: temporaryTattoosFlag,
    eventAddress,
    travelDistance: travelDistanceMiles,
    extraHourlyCharge: autoExtraHourlyCharge,
    staffAdjustment,
  });

  const totals = computeEventTotals(hypotheticalEvent, { allowTravelDistanceWithoutAddress: true });
  const basePrice = hasBaseInputs ? totals.baseTotal : 0;
  const shouldProrateBase = hasBaseInputs && parsedBookedHours < BASE_INCLUDED_HOURS;
  const proratedBaseTotal = hasBaseInputs
    ? shouldProrateBase
      ? (totals.baseTotal / BASE_INCLUDED_HOURS) * parsedBookedHours
      : totals.baseTotal
    : 0;
  const baseCounterStaffCharge = parseMoney(counterStaffChargeRaw);
  const shouldScaleCounterWithHours = hasBaseInputs && parsedBookedHours !== BASE_INCLUDED_HOURS;
  const proratedCounterStaffCharge = shouldScaleCounterWithHours
    ? (baseCounterStaffCharge / BASE_INCLUDED_HOURS) * parsedBookedHours
    : baseCounterStaffCharge;
  const counterProrationDelta =
    hasBaseInputs && parsedBookedHours < BASE_INCLUDED_HOURS
      ? proratedCounterStaffCharge - baseCounterStaffCharge
      : 0;
  const effectiveExtrasTotal =
    totals.extrasTotal - baseCounterStaffCharge + proratedCounterStaffCharge;
  const effectiveModifiersTotal = effectiveExtrasTotal + totals.staffAdjustment;
  const hypotheticalTotal = Math.max(0, proratedBaseTotal + effectiveExtrasTotal + totals.staffAdjustment);
  const depositRate = DEPOSIT_RATE_PERCENT;
  const depositAmount = hypotheticalTotal * (depositRate / 100);
  const balanceAmount = Math.max(0, hypotheticalTotal - depositAmount);
  const manualStaffAdjustment = parseMoney(staffAdjustment);
  const normalizedStaffAdjustmentReason = staffAdjustmentReason.trim();
  const staffAdjustmentLabel = normalizedStaffAdjustmentReason || 'Staff Adjustment';
  const prorationDelta = proratedBaseTotal - totals.baseTotal;
  const effectiveStaffAdjustment = manualStaffAdjustment + prorationDelta + counterProrationDelta;
  const existingOptions = useMemo(
    () =>
      [...events]
        .filter((event) => isLedgerEligible(event))
        .sort((a, b) => {
        const aDate = Date.parse(a.eventDate || '');
        const bDate = Date.parse(b.eventDate || '');
        if (!Number.isNaN(aDate) && !Number.isNaN(bDate)) return aDate - bDate;
        return formatEventOptionLabel(a).localeCompare(formatEventOptionLabel(b));
      }),
    [events],
  );
  const selectedExistingEvent =
    existingOptions.find((event) => event.id === selectedExistingEventId) ?? null;
  const radiusFeeLabel = 'Radius Fee';
  const travelDistanceDisplayLabel = `Travel Distance (first ${freeRadiusMiles} mi included)`;
  const travelDistanceLabel = hasTravelDistance ? `${parsedTravelDistanceMiles.toFixed(1)} mi` : 'Not entered';

  async function runRadiusLookup() {
    const venue = eventAddress.trim();
    if (!venue) {
      setRadiusLookupStatus('Enter event address first.');
      return;
    }

    try {
      setIsLookingUpRadius(true);
      setRadiusLookupStatus('Looking up driving distance...');
      const miles = await lookupDrivingDistanceMiles(DEFAULT_BASE_ADDRESS, venue);
      const normalized = Number.isFinite(miles) ? miles : 0;
      setTravelDistanceMiles(normalized.toFixed(1));
      setRadiusLookupStatus(`Travel distance updated to ${normalized.toFixed(1)} miles.`);
    } catch (error) {
      setRadiusLookupStatus(error instanceof Error ? error.message : 'Unable to calculate travel distance.');
    } finally {
      setIsLookingUpRadius(false);
    }
  }

  function openPricingSheetPublicUrl() {
    void Linking.openURL(pricingSheetPublicUrl);
  }

  async function copyPricingSheetPublicUrl() {
    const clipboardApi = (
      globalThis as unknown as {
        navigator?: { clipboard?: { writeText?: (value: string) => Promise<void> } };
      }
    ).navigator?.clipboard;

    if (!clipboardApi?.writeText) return;

    try {
      await clipboardApi.writeText(pricingSheetPublicUrl);
    } catch {}
  }

  function buildPricingClipboardText(): string {
    const lines: string[] = [
      `Number of Artists: ${hasArtistCount ? parsedArtistCount : 'Not selected'}`,
      `Booked Hours: ${hasBookedHours ? parsedBookedHours.toFixed(2) : 'Not entered'}`,
      `${travelDistanceDisplayLabel}: ${travelDistanceLabel}`,
      '',
      `Base Price (5 hours): ${formatCurrency(basePrice)}`,
      `Counter Staff (5 hours): ${formatCurrency(baseCounterStaffCharge)}`,
    ];

    if (shouldProrateBase) {
      lines.push(`Prorated Base Price (${parsedBookedHours.toFixed(2)} hours): ${formatCurrency(proratedBaseTotal)}`);
      lines.push(
        `Prorated Counter Staff (${parsedBookedHours.toFixed(2)} hours): ${formatCurrency(proratedCounterStaffCharge)}`,
      );
    }

    lines.push(`Temp Facility License: ${formatCurrency(totals.effectiveFees.tempFacilityLicenseFee)}`);
    lines.push(`Custom Flash (${customFlashSelection}): ${formatCurrency(totals.effectiveFees.customFlashFee)}`);
    lines.push(
      `Temporary Tattoos (${temporaryTattoosSelection}): ${formatCurrency(totals.effectiveFees.temporaryTattooFee)}`,
    );
    lines.push(`${radiusFeeLabel}: ${formatCurrency(totals.effectiveFees.radiusFee)}`);
    lines.push(`Extra Hourly Charge: ${formatCurrency(parseMoney(autoExtraHourlyCharge))}`);
    lines.push(`${staffAdjustmentLabel}: ${formatCurrency(totals.staffAdjustment)}`);
    lines.push(`Modifiers Total: ${formatCurrency(effectiveModifiersTotal)}`);
    lines.push('');
    lines.push(`Total: ${formatCurrency(hypotheticalTotal)}`);
    lines.push(`Deposit (${depositRate.toFixed(0)}%): ${formatCurrency(depositAmount)}`);
    lines.push(`Balance: ${formatCurrency(balanceAmount)}`);

    return lines.join('\n');
  }

  async function copyPricingTableToClipboard() {
    const clipboardApi = (
      globalThis as unknown as {
        navigator?: { clipboard?: { writeText?: (value: string) => Promise<void> } };
      }
    ).navigator?.clipboard;

    if (!clipboardApi?.writeText) return;

    try {
      await clipboardApi.writeText(buildPricingClipboardText());
    } catch {}
  }

  function buildPricingPatch(baseEvent?: EventRecord): Partial<EventRecord> {
    const hourScalingReason =
      hasBaseInputs && parsedBookedHours !== BASE_INCLUDED_HOURS
        ? `Hour scaling from 5h to ${parsedBookedHours.toFixed(2)}h in Pricing Calculator`
        : '';
    const mergedReason =
      normalizedStaffAdjustmentReason ||
      hourScalingReason ||
      baseEvent?.staffPriceAdjustmentReason ||
      '';

    const patch: Partial<EventRecord> = {
      year: String(selectedYear),
      numberOfArtists: hypotheticalArtistCount,
      counterStaffCharge: formatDecimal(parseMoney(counterStaffChargeRaw)),
      customFlash: normalizeFlag(customFlashFlag),
      temporaryTattoos: normalizeFlag(temporaryTattoosFlag),
      eventAddress: eventAddress.trim(),
      travelDistance: formatDecimal(parseNumberInput(travelDistanceMiles)),
      extraHourlyCharge: formatDecimal(parseMoney(autoExtraHourlyCharge)),
      staffPriceAdjustment: formatDecimal(effectiveStaffAdjustment),
      staffPriceAdjustmentReason: mergedReason,
      depositRequired: formatDecimal(depositAmount),
      extraHours:
        parsedBookedHours > BASE_INCLUDED_HOURS
          ? formatDecimal(parsedBookedHours - BASE_INCLUDED_HOURS)
          : '',
      venueName: baseEvent?.venueName?.trim() ? baseEvent.venueName : 'Hypothetical',
    };
    return patch;
  }

  function confirmWithGate(title: string, message: string, onConfirm: () => void) {
    if (Platform.OS === 'web') {
      const webConfirm = (globalThis as unknown as { confirm?: (value: string) => boolean }).confirm;
      const ok = webConfirm ? webConfirm(`${title}\n\n${message}`) : true;
      if (!ok) return;
      onConfirm();
      return;
    }

    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        style: 'default',
        onPress: onConfirm,
      },
    ]);
  }

  function importExistingEventToCalculator() {
    if (!selectedExistingEvent) {
      setSaveStatus('Select an open client entry to import.');
      return;
    }

    const importedYear = parsePlanYear(selectedExistingEvent.year);
    if (yearOptions.includes(importedYear)) {
      setSelectedYear(importedYear);
    }

    setHypotheticalArtistCount(selectedExistingEvent.numberOfArtists.trim());
    setCustomFlashFlag(normalizeFlag(selectedExistingEvent.customFlash));
    setTemporaryTattoosFlag(normalizeFlag(selectedExistingEvent.temporaryTattoos));
    setEventAddress(selectedExistingEvent.eventAddress);
    setTravelDistanceMiles(selectedExistingEvent.travelDistance.trim());
    setStaffAdjustment(
      selectedExistingEvent.staffPriceAdjustment.trim() ||
        selectedExistingEvent.optionalFee.trim(),
    );
    setStaffAdjustmentReason(selectedExistingEvent.staffPriceAdjustmentReason.trim());
    setBookedHours(deriveImportedBookedHours(selectedExistingEvent).toFixed(2));
    setSaveStatus(`Imported "${formatEventOptionLabel(selectedExistingEvent)}" into calculator.`);
  }

  function saveHypotheticalToEntry() {
    if (isSavingEntry) return;
    if (saveMode === 'import') {
      importExistingEventToCalculator();
      return;
    }

    if (Math.abs(parseMoney(staffAdjustment)) > 0.0001 && !normalizedStaffAdjustmentReason) {
      setSaveStatus('Staff adjustment reason is required.');
      return;
    }

    if (saveMode === 'overwrite' && !selectedExistingEvent) {
      setSaveStatus('Select an existing client entry first.');
      return;
    }

    const confirmTitle =
      saveMode === 'new' ? 'Create New Client Entry?' : 'Overwrite Existing Client Entry?';
    const confirmMessage =
      saveMode === 'new'
        ? 'This will create a new client entry from current hypothetical pricing values.'
        : `This will overwrite pricing fields for "${formatEventOptionLabel(selectedExistingEvent!)}".`;

    confirmWithGate(confirmTitle, confirmMessage, () => {
      setIsSavingEntry(true);
      setSaveStatus('');

      try {
        if (saveMode === 'new') {
          const id = createEvent();
          const fallbackName = `Hypothetical ${new Date().toLocaleDateString()}`;
          const nextName = newClientName.trim() || fallbackName;
          updateEvent(id, {
            clientName: nextName,
            contactPhone: newClientPhone.trim(),
            email: newClientEmail.trim(),
            eventDate: newClientEventDate.trim(),
            ...buildPricingPatch(),
          });
          setSelectedEventId(id);
          setSaveStatus('Created new client entry from hypothetical pricing.');
          router.push(`/event/${id}`);
        } else if (selectedExistingEvent) {
          updateEvent(selectedExistingEvent.id, buildPricingPatch(selectedExistingEvent));
          setSelectedEventId(selectedExistingEvent.id);
          setSaveStatus(`Updated "${formatEventOptionLabel(selectedExistingEvent)}".`);
          router.push(`/event/${selectedExistingEvent.id}`);
        }
      } finally {
        setIsSavingEntry(false);
      }
    });
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <View style={styles.titleRow}>
          <ThemedText style={styles.title}>Price Plan</ThemedText>
          <View style={styles.headerActions}>
            <Pressable
              style={styles.iconActionButton}
              onPress={() => {
                void copyPricingSheetPublicUrl();
              }}>
              <MaterialIcons name="share" size={16} color="#d9e9ff" />
            </Pressable>
            <Pressable style={styles.iconActionButton} onPress={openPricingSheetPublicUrl}>
              <MaterialIcons name="search" size={16} color="#d9e9ff" />
            </Pressable>
          </View>
        </View>
        <ThemedText style={styles.body}>Select the plan year to view base per-artist pricing.</ThemedText>

        <View style={styles.actionRow}>
          {yearOptions.map((year) => {
            const selected = year === selectedYear;
            return (
              <Pressable
                key={year}
                onPress={() => setSelectedYear(year)}
                style={[styles.yearChip, selected ? styles.yearChipActive : null]}>
                <ThemedText style={[styles.yearChipText, selected ? styles.yearChipTextActive : null]}>
                  {year}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.card}>
        <ThemedText style={styles.sectionTitle}>Plan {selectedYear}</ThemedText>
        <View style={styles.tableWrap}>
          <View style={styles.tableHeaderRow}>
            <ThemedText style={[styles.tableHeaderCell, styles.tableColArtists]}>Artists</ThemedText>
            <ThemedText style={[styles.tableHeaderCell, styles.tableColMoney]}>Per Artist</ThemedText>
            <ThemedText style={[styles.tableHeaderCell, styles.tableColMoney]}>Base Total</ThemedText>
          </View>
          {artistCountOptions.map((count) => {
            const rate = selectedSchedule[count] ?? 0;
            const total = rate * count;
            return (
              <View key={count} style={styles.tableDataRow}>
                <ThemedText style={[styles.tableDataCell, styles.tableColArtists]}>{count}</ThemedText>
                <ThemedText style={[styles.tableDataCell, styles.tableColMoney]}>{formatCurrency(rate)}</ThemedText>
                <ThemedText style={[styles.tableDataCell, styles.tableColMoney]}>{formatCurrency(total)}</ThemedText>
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.card}>
        <ThemedText style={styles.sectionTitle}>Theoretical Calculator</ThemedText>
        <ThemedText style={styles.body}>Modifiers and radius update automatically based on your inputs.</ThemedText>

        <View style={styles.fieldBlock}>
          <ThemedText style={styles.fieldLabel}>Number of Artists</ThemedText>
          <ChoiceChips
            options={artistCountOptions.map(String)}
            value={hypotheticalArtistCount}
            onChange={setHypotheticalArtistCount}
          />
        </View>

        <View style={styles.fieldBlock}>
          <ThemedText style={styles.fieldLabel}>Booked Hours (Base Covers 5)</ThemedText>
          <TextInput
            value={bookedHours}
            onChangeText={setBookedHours}
            style={styles.input}
            keyboardType="decimal-pad"
            placeholder="5"
            placeholderTextColor="#6f849a"
          />
        </View>

        {counterStatus ? <ThemedText style={styles.helperText}>{counterStatus}</ThemedText> : null}

        <View style={styles.fieldBlock}>
          <ThemedText style={styles.fieldLabel}>Custom Flash?</ThemedText>
          <ChoiceChips options={['YES', 'NO']} value={customFlashFlag} onChange={setCustomFlashFlag} />
        </View>

        <View style={styles.fieldBlock}>
          <ThemedText style={styles.fieldLabel}>Temporary Tattoos?</ThemedText>
          <ChoiceChips options={['YES', 'NO']} value={temporaryTattoosFlag} onChange={setTemporaryTattoosFlag} />
        </View>

        <View style={styles.fieldBlock}>
          <ThemedText style={styles.fieldLabel}>Event Address</ThemedText>
          <TextInput
            value={eventAddress}
            onChangeText={setEventAddress}
            style={[styles.input, styles.inputMultiline]}
            multiline
            placeholder="Street, City, State ZIP"
            placeholderTextColor="#6f849a"
          />
        </View>

        <View style={styles.fieldBlock}>
          <Pressable
            style={[styles.secondaryButton, isLookingUpRadius ? styles.buttonDisabled : null]}
            disabled={isLookingUpRadius}
            onPress={() => {
              void runRadiusLookup();
            }}>
            {isLookingUpRadius ? <ActivityIndicator size="small" color="#cfe2ff" /> : null}
            <ThemedText style={styles.secondaryButtonText}>
              {isLookingUpRadius ? 'Looking Up...' : 'Lookup Radius from Address'}
            </ThemedText>
          </Pressable>
          {radiusLookupStatus ? <ThemedText style={styles.helperText}>{radiusLookupStatus}</ThemedText> : null}
        </View>

        <View style={styles.fieldBlock}>
          <ThemedText style={styles.fieldLabel}>Travel Distance (miles)</ThemedText>
          <TextInput
            value={travelDistanceMiles}
            onChangeText={setTravelDistanceMiles}
            style={styles.input}
            keyboardType="decimal-pad"
            placeholder="Auto-filled from lookup or enter manually"
            placeholderTextColor="#6f849a"
          />
        </View>

        <View style={styles.fieldBlock}>
          <ThemedText style={styles.fieldLabel}>Staff Adjustment (+/-)</ThemedText>
          <TextInput
            value={staffAdjustment}
            onChangeText={setStaffAdjustment}
            style={styles.input}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor="#6f849a"
          />
          <ThemedText style={styles.fieldLabel}>Staff Adjustment Reason</ThemedText>
          <TextInput
            value={staffAdjustmentReason}
            onChangeText={setStaffAdjustmentReason}
            style={styles.input}
            placeholder="Required when adjustment is used"
            placeholderTextColor="#6f849a"
          />
        </View>

          <View style={styles.summaryBox}>
            <View style={styles.summaryRow}>
              <ThemedText style={styles.summaryLabel}>Base Price (5 hours)</ThemedText>
              <ThemedText style={styles.summaryValue}>{formatCurrency(basePrice)}</ThemedText>
            </View>
            <View style={styles.summaryRow}>
              <ThemedText style={styles.summaryLabel}>Counter Staff (5 hours)</ThemedText>
              <ThemedText style={styles.summaryValue}>{formatCurrency(baseCounterStaffCharge)}</ThemedText>
            </View>
            <View style={styles.summaryDivider} />

            {shouldProrateBase ? (
              <>
                <View style={styles.summaryRow}>
                  <ThemedText style={styles.summaryLabel}>
                    Prorated Base Price ({parsedBookedHours.toFixed(2)} hours)
                  </ThemedText>
                  <ThemedText style={styles.summaryValue}>{formatCurrency(proratedBaseTotal)}</ThemedText>
                </View>
                <View style={styles.summaryRow}>
                  <ThemedText style={styles.summaryLabel}>
                    Prorated Counter Staff ({parsedBookedHours.toFixed(2)} hours)
                  </ThemedText>
                  <ThemedText style={styles.summaryValue}>{formatCurrency(proratedCounterStaffCharge)}</ThemedText>
                </View>
                <View style={styles.summaryDivider} />
              </>
            ) : null}

            <View style={styles.summaryRow}>
              <ThemedText style={[styles.summaryLabel, styles.modifierLabel]}>Temp Facility License</ThemedText>
              <ThemedText style={[styles.summaryValue, styles.modifierValue]}>
                {formatCurrency(totals.effectiveFees.tempFacilityLicenseFee)}
              </ThemedText>
            </View>
            <View style={styles.summaryRow}>
              <ThemedText style={[styles.summaryLabel, styles.modifierLabel]}>
                {`Custom Flash (${customFlashSelection})`}
              </ThemedText>
              <ThemedText style={[styles.summaryValue, styles.modifierValue]}>
                {formatCurrency(totals.effectiveFees.customFlashFee)}
              </ThemedText>
            </View>
            <View style={styles.summaryRow}>
              <ThemedText style={[styles.summaryLabel, styles.modifierLabel]}>
                {`Temporary Tattoos (${temporaryTattoosSelection})`}
              </ThemedText>
              <ThemedText style={[styles.summaryValue, styles.modifierValue]}>
                {formatCurrency(totals.effectiveFees.temporaryTattooFee)}
              </ThemedText>
            </View>
            <View style={styles.summaryRow}>
              <ThemedText style={[styles.summaryLabel, styles.modifierLabel]}>
                {travelDistanceDisplayLabel}
              </ThemedText>
              <ThemedText style={[styles.summaryValue, styles.modifierValue]}>{travelDistanceLabel}</ThemedText>
            </View>
            <View style={styles.summaryRow}>
              <ThemedText style={[styles.summaryLabel, styles.modifierLabel]}>{radiusFeeLabel}</ThemedText>
              <ThemedText style={[styles.summaryValue, styles.modifierValue]}>
                {formatCurrency(totals.effectiveFees.radiusFee)}
              </ThemedText>
            </View>
            <View style={styles.summaryRow}>
              <ThemedText style={[styles.summaryLabel, styles.modifierLabel]}>Extra Hourly Charge</ThemedText>
              <ThemedText style={[styles.summaryValue, styles.modifierValue]}>
                {formatCurrency(parseMoney(autoExtraHourlyCharge))}
              </ThemedText>
            </View>
            <View style={styles.summaryRow}>
              <ThemedText style={[styles.summaryLabel, styles.modifierLabel]}>{staffAdjustmentLabel}</ThemedText>
              <ThemedText style={[styles.summaryValue, styles.modifierValue]}>
                {formatCurrency(totals.staffAdjustment)}
              </ThemedText>
            </View>
            <View style={styles.summaryRow}>
              <ThemedText style={[styles.summaryLabel, styles.modifierLabel]}>Modifiers Total</ThemedText>
              <ThemedText style={[styles.summaryValue, styles.modifierValue]}>
                {formatCurrency(effectiveModifiersTotal)}
              </ThemedText>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryRow}>
              <ThemedText style={styles.summaryLabel}>Total</ThemedText>
              <ThemedText style={styles.summaryValue}>{formatCurrency(hypotheticalTotal)}</ThemedText>
            </View>
            <View style={styles.summaryRow}>
              <ThemedText style={styles.summaryLabel}>Deposit ({depositRate.toFixed(0)}%)</ThemedText>
              <ThemedText style={styles.summaryValue}>{formatCurrency(depositAmount)}</ThemedText>
            </View>
            <View style={styles.summaryRow}>
              <ThemedText style={styles.summaryLabel}>Balance</ThemedText>
              <ThemedText style={styles.summaryValue}>{formatCurrency(balanceAmount)}</ThemedText>
            </View>
        </View>
        <Pressable
          style={[styles.iconActionButton, styles.copyTableIconButton]}
          onPress={() => void copyPricingTableToClipboard()}>
          <MaterialIcons name="content-copy" size={16} color="#cfe2ff" />
        </Pressable>

        <View style={styles.fieldBlock}>
          <ChoiceChips
            options={['New Client Entry', 'Import', 'Overwrite']}
            value={
              saveMode === 'new'
                ? 'New Client Entry'
                : saveMode === 'import'
                  ? 'Import'
                  : 'Overwrite'
            }
            onChange={(value) => {
              if (value === 'Import') {
                setSaveMode('import');
              } else if (value === 'Overwrite') {
                setSaveMode('overwrite');
              } else {
                setSaveMode('new');
              }
              setExistingPickerOpen(false);
              setSaveStatus('');
            }}
          />
        </View>

        {saveMode === 'new' ? (
          <View style={styles.fieldBlock}>
            <ThemedText style={styles.fieldLabel}>Client Name</ThemedText>
            <TextInput
              value={newClientName}
              onChangeText={setNewClientName}
              style={styles.input}
              placeholder="Jordan Avery"
              placeholderTextColor="#6f849a"
            />
            <ThemedText style={styles.fieldLabel}>Client Phone</ThemedText>
            <TextInput
              value={newClientPhone}
              onChangeText={setNewClientPhone}
              style={styles.input}
              keyboardType="phone-pad"
              placeholder="(555) 555-5555"
              placeholderTextColor="#6f849a"
            />
            <ThemedText style={styles.fieldLabel}>Client Email</ThemedText>
            <TextInput
              value={newClientEmail}
              onChangeText={setNewClientEmail}
              style={styles.input}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholder="client@email.com"
              placeholderTextColor="#6f849a"
            />
            <ThemedText style={styles.fieldLabel}>Date of Event</ThemedText>
            <TextInput
              value={newClientEventDate}
              onChangeText={setNewClientEventDate}
              style={styles.input}
              placeholder="MM/DD/YYYY"
              placeholderTextColor="#6f849a"
            />
          </View>
        ) : (
          <View style={styles.fieldBlock}>
            <ThemedText style={styles.fieldLabel}>Existing Client Entry</ThemedText>
            <Pressable
              style={styles.dropdownButton}
              onPress={() => {
                setExistingPickerOpen((current) => !current);
              }}>
              <ThemedText style={styles.dropdownButtonText}>
                {selectedExistingEvent ? formatEventOptionLabel(selectedExistingEvent) : 'Select existing entry'}
              </ThemedText>
              <MaterialIcons
                name={existingPickerOpen ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
                size={16}
                color="#cfe2ff"
              />
            </Pressable>
            {existingPickerOpen ? (
              <View style={styles.dropdownList}>
                {existingOptions.length === 0 ? (
                  <ThemedText style={styles.helperText}>No entries available yet.</ThemedText>
                ) : (
                  existingOptions.map((eventOption) => {
                    const selected = selectedExistingEventId === eventOption.id;
                    return (
                      <Pressable
                        key={eventOption.id}
                        onPress={() => {
                          setSelectedExistingEventId(eventOption.id);
                          setExistingPickerOpen(false);
                          setSaveStatus('');
                        }}
                        style={[styles.dropdownItem, selected ? styles.dropdownItemActive : null]}>
                        <ThemedText
                          style={[styles.dropdownItemText, selected ? styles.dropdownItemTextActive : null]}>
                          {formatEventOptionLabel(eventOption)}
                        </ThemedText>
                      </Pressable>
                    );
                  })
                )}
              </View>
            ) : null}
          </View>
        )}

        <Pressable
          style={[styles.primaryButton, isSavingEntry ? styles.buttonDisabled : null]}
          disabled={isSavingEntry}
          onPress={saveHypotheticalToEntry}>
          <ThemedText style={styles.primaryButtonText}>
            {isSavingEntry
              ? 'Saving...'
              : saveMode === 'import'
                ? 'Import'
                : saveMode === 'overwrite'
                  ? 'Overwrite'
                  : 'Save'}
          </ThemedText>
        </Pressable>
        {saveStatus ? <ThemedText style={styles.helperText}>{saveStatus}</ThemedText> : null}
      </View>
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
    gap: 14,
    paddingBottom: 40,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#223244',
    backgroundColor: '#111a24',
    padding: 14,
    gap: 10,
  },
  title: {
    fontWeight: '700',
    color: '#e4edf8',
    fontSize: 20,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconActionButton: {
    width: 30,
    height: 30,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#2e4460',
    backgroundColor: '#132235',
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyTableIconButton: {
    alignSelf: 'flex-start',
  },
  sectionTitle: {
    fontWeight: '700',
    color: '#e4edf8',
    fontSize: 17,
  },
  body: {
    color: '#9ab0c7',
    lineHeight: 20,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  yearChip: {
    borderWidth: 1,
    borderColor: '#2d4259',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#0f1620',
  },
  yearChipActive: {
    borderColor: '#2b74d9',
    backgroundColor: '#2b74d9',
  },
  yearChipText: {
    color: '#9fb3c8',
    fontWeight: '700',
  },
  yearChipTextActive: {
    color: '#fff',
  },
  tableWrap: {
    borderWidth: 1,
    borderColor: '#2a3c50',
    borderRadius: 10,
    overflow: 'hidden',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#162332',
    borderBottomWidth: 1,
    borderBottomColor: '#2a3c50',
  },
  tableDataRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#1f3042',
    backgroundColor: '#101924',
  },
  tableHeaderCell: {
    color: '#9fc0e4',
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 12,
  },
  tableDataCell: {
    color: '#d8e4f2',
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 13,
  },
  tableColArtists: {
    width: '28%',
  },
  tableColMoney: {
    width: '36%',
  },
  fieldBlock: {
    gap: 5,
  },
  fieldLabel: {
    color: '#9fb8d0',
    fontWeight: '700',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#2b3d52',
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 9,
    color: '#e3ecf8',
    backgroundColor: '#0f1620',
  },
  inputMultiline: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  summaryBox: {
    borderWidth: 1,
    borderColor: '#2a3c50',
    borderRadius: 10,
    backgroundColor: '#0f1620',
    padding: 10,
    gap: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  summaryLabel: {
    color: '#a6bdd5',
    fontWeight: '600',
  },
  summaryValue: {
    color: '#e5eef9',
    fontWeight: '700',
  },
  modifierLabel: {
    fontSize: 12,
    fontWeight: '400',
    color: '#95acc3',
  },
  modifierValue: {
    fontSize: 12,
    fontWeight: '400',
    color: '#d1dcea',
  },
  summaryDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#26415f',
    marginVertical: 2,
  },
  secondaryButton: {
    backgroundColor: '#1a2b40',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: '#3a5b83',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  secondaryButtonText: {
    color: '#cfe2ff',
    fontWeight: '700',
    fontSize: 13,
  },
  helperText: {
    color: '#8fb5de',
    lineHeight: 18,
  },
  primaryButton: {
    marginTop: 2,
    borderRadius: 10,
    backgroundColor: '#2b74d9',
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  dropdownButton: {
    borderWidth: 1,
    borderColor: '#2a3c50',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    backgroundColor: '#0f1620',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  dropdownButtonText: {
    color: '#d6e4f4',
    flex: 1,
  },
  dropdownList: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#2a3c50',
    borderRadius: 10,
    overflow: 'hidden',
  },
  dropdownItem: {
    backgroundColor: '#0f1620',
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#203246',
  },
  dropdownItemActive: {
    backgroundColor: '#1e3f6b',
  },
  dropdownItemText: {
    color: '#d6e4f4',
    fontSize: 13,
  },
  dropdownItemTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
