import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { GlowPressable as Pressable } from '@/components/ui/glow-pressable';
import { getPricingScheduleRow, parsePricingPlanYear } from '@/constants/pricing-schedule';
import { SHEET_SYNC_CONFIG } from '@/constants/sheets-sync';
import { useEvents } from '@/context/events-context';
import { useAuthFramework } from '@/lib/auth-framework';
import { fireAndForgetAuditLog } from '@/lib/audit-log';
import { computeEventTotals, formatCurrency, parseMoney, PRICING_SCHEDULE_BY_YEAR } from '@/lib/event-math';
import { deleteEventFromSheet, pullEventByEntryId, upsertEventToSheet } from '@/lib/sheets-sync';
import type { EventRecord } from '@/types/events';

const BASE_INCLUDED_HOURS = 5;

type ClientFieldConfig = {
  key: keyof EventRecord;
  label: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'number-pad' | 'decimal-pad';
  placeholder?: string;
};

const CLIENT_FIELDS: ClientFieldConfig[] = [
  { key: 'year', label: 'Price Plan' },
  { key: 'clientName', label: 'Client Name', placeholder: 'Enter client name' },
  { key: 'eventDate', label: 'Date of Event', placeholder: 'MM/DD/YYYY' },
  { key: 'eventType', label: 'Type of Event' },
  { key: 'contactPhone', label: 'Contact Phone', keyboardType: 'phone-pad' },
  { key: 'email', label: 'Email', keyboardType: 'email-address' },
  { key: 'venueName', label: 'Venue Name' },
  { key: 'eventAddress', label: 'Event Address', multiline: true },
  { key: 'estGuestCount', label: 'Est Guest Count', keyboardType: 'number-pad' },
  { key: 'travelDistance', label: 'Travel Distance', keyboardType: 'decimal-pad' },
];

const PRICE_PLAN_OPTIONS = Object.keys(PRICING_SCHEDULE_BY_YEAR)
  .map((key) => Number.parseInt(key, 10))
  .filter((value) => Number.isFinite(value))
  .sort((a, b) => b - a)
  .map((value) => String(value));
const YES_NO_TBD_CHOICES = ['YES', 'NO', 'TBD'];
const DEPOSIT_PAID_OR_LATER_STATUSES = new Set([
  'deposit paid',
  'deposit complete',
  'deposit completed',
  'temporary license submitted',
  'awaiting follow up',
  'needing changes',
  'balance invoice sent',
  'event complete',
  'event complete balance late',
]);
const HISTORICAL_LOCKED_STATUSES = new Set([
  'event complete',
  'event complete balance late',
  'cancelled',
  'canceled',
]);

function parsePositiveNumber(value: string): number {
  const parsed = Number.parseFloat(String(value || '').trim().replace(/,/g, ''));
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return parsed;
}

function deriveBookedHours(event: EventRecord): number {
  const extraHours = parsePositiveNumber(event.extraHours);
  if (extraHours > 0) return BASE_INCLUDED_HOURS + extraHours;

  const reason = event.staffPriceAdjustmentReason || '';
  const match = reason.match(/from\s*5h\s*to\s*([0-9]+(?:\.[0-9]+)?)h/i);
  if (!match) return BASE_INCLUDED_HOURS;

  const parsed = parsePositiveNumber(match[1]);
  return parsed > 0 ? parsed : BASE_INCLUDED_HOURS;
}

function normalizeStatus(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function getUnifiedStatus(event: EventRecord): string {
  const status = event.status.trim();
  if (status) return status;
  return event.payStatus.trim();
}

function isOpenForwardPricingMode(event: EventRecord): boolean {
  const normalized = normalizeStatus(getUnifiedStatus(event));
  if (!normalized) return true;
  return !HISTORICAL_LOCKED_STATUSES.has(normalized);
}

function isDepositMarkedPaid(event: EventRecord): boolean {
  const normalized = normalizeStatus(getUnifiedStatus(event));
  if (!normalized) return false;
  if (normalized === 'cancelled' || normalized === 'canceled') return false;
  return DEPOSIT_PAID_OR_LATER_STATUSES.has(normalized);
}

type EventTypeVisual = {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
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

export default function EventClientDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { events, setSelectedEventId, updateEvent, upsertEventFromRemote, removeEvent } = useEvents();
  const { viewerName, canAccessAdminToolsForViewer, resolvePermissionsForName } = useAuthFramework();

  const [isEditable, setIsEditable] = useState(false);
  const [isSavingToSheet, setIsSavingToSheet] = useState(false);
  const [isDeletingFromSheet, setIsDeletingFromSheet] = useState(false);
  const [sheetSyncStatus, setSheetSyncStatus] = useState('');
  const [sheetSyncError, setSheetSyncError] = useState('');

  const event = events.find((item) => item.id === id);

  const viewerPermission = viewerName ? resolvePermissionsForName(viewerName) : null;
  const canAccessClientDetails = canAccessAdminToolsForViewer || Boolean(viewerPermission?.roles.includes('admin'));
  const canEditStaffAdjustment = canAccessClientDetails;

  const currentEvent = event ?? null;
  const typeVisual = currentEvent ? getEventTypeVisual(currentEvent.eventType) : null;

  const totals = useMemo(() => {
    if (!currentEvent) return null;

    const openForwardPricing = isOpenForwardPricingMode(currentEvent);
    const computed = computeEventTotals(currentEvent, {
      allowTravelDistanceWithoutAddress: openForwardPricing,
    });
    const bookedHours = deriveBookedHours(currentEvent);
    const hasBookedHours = bookedHours > 0;
    const shouldProrateBase = hasBookedHours && bookedHours < BASE_INCLUDED_HOURS;
    const parsedTravelDistanceMiles = parsePositiveNumber(currentEvent.travelDistance);
    const planYear = parsePricingPlanYear(currentEvent.year);
    const artistCount = Number.parseInt(currentEvent.numberOfArtists, 10);
    const scheduleRow =
      Number.isFinite(artistCount) && artistCount > 0 ? getPricingScheduleRow(planYear, artistCount) : null;
    const freeRadiusMiles = scheduleRow?.freeRadiusMiles ?? 20;
    const travelDistanceDisplayLabel = `Travel Distance (first ${freeRadiusMiles} mi included)`;
    const basePrice = computed.baseTotal;
    const baseCounterStaffCharge = parseMoney(currentEvent.counterStaffCharge);
    const proratedBaseTotal = shouldProrateBase
      ? (computed.baseTotal / BASE_INCLUDED_HOURS) * bookedHours
      : computed.baseTotal;
    const shouldScaleCounterWithHours = hasBookedHours && bookedHours !== BASE_INCLUDED_HOURS;
    const proratedCounterStaffCharge = shouldScaleCounterWithHours
      ? (baseCounterStaffCharge / BASE_INCLUDED_HOURS) * bookedHours
      : baseCounterStaffCharge;
    const effectiveExtrasTotal = computed.extrasTotal - baseCounterStaffCharge + proratedCounterStaffCharge;
    const effectiveModifiersTotal = effectiveExtrasTotal + computed.staffAdjustment;
    const staffAdjustmentLabel = currentEvent.staffPriceAdjustmentReason.trim() || 'Staff Adjustment';
    const extraHourlyCharge = parseMoney(currentEvent.extraHourlyCharge);
    const goldStandardPricingTotal = Math.max(0, proratedBaseTotal + effectiveExtrasTotal + computed.staffAdjustment);

    // Keep historical completed/cancelled rows on legacy interpretation.
    const hourRatio = bookedHours > 0 ? bookedHours / BASE_INCLUDED_HOURS : 1;
    const legacyPricingTotal = Math.max(
      0,
      computed.baseTotal * hourRatio +
        parseMoney(currentEvent.counterStaffCharge) * hourRatio +
        computed.effectiveFees.tempFacilityLicenseFee +
        computed.effectiveFees.customFlashFee +
        computed.effectiveFees.temporaryTattooFee +
        computed.effectiveFees.radiusFee +
        computed.staffAdjustment,
    );
    const pricingTotal = openForwardPricing ? goldStandardPricingTotal : legacyPricingTotal;

    return {
      computed,
      basePrice,
      baseCounterStaffCharge,
      bookedHours,
      shouldProrateBase,
      proratedBaseTotal,
      proratedCounterStaffCharge,
      extraHourlyCharge,
      effectiveModifiersTotal,
      staffAdjustmentLabel,
      pricingTotal,
      openForwardPricing,
      customFlashFlag: currentEvent.customFlash.trim().toUpperCase() || 'NO',
      temporaryTattoosFlag: currentEvent.temporaryTattoos.trim().toUpperCase() || 'NO',
      travelDistanceLabel: parsedTravelDistanceMiles > 0 ? `${parsedTravelDistanceMiles.toFixed(1)} mi` : 'Not entered',
      travelDistanceDisplayLabel,
    };
  }, [currentEvent]);

  if (!currentEvent || !totals) {
    return (
      <View style={styles.emptyContainer}>
        <ThemedText type="subtitle">Event not found</ThemedText>
      </View>
    );
  }

  if (!canAccessClientDetails) {
    return (
      <ScrollView style={styles.page} contentContainerStyle={styles.content}>
        <View style={styles.topRow}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={14} color="#cde0f5" />
            <ThemedText style={styles.backButtonText}>Back</ThemedText>
          </Pressable>
        </View>
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Access Restricted</ThemedText>
          <ThemedText style={styles.helperText}>
            Client Details is available to admin and super admin only.
          </ThemedText>
        </View>
      </ScrollView>
    );
  }

  function updateField<K extends keyof EventRecord>(key: K, value: EventRecord[K]) {
    if (!currentEvent) return;
    setSelectedEventId(currentEvent.id);
    updateEvent(currentEvent.id, { [key]: value } as Partial<EventRecord>);
  }

  async function saveToSheet() {
    const eventRecord = currentEvent;
    if (!eventRecord) return;
    if (isSavingToSheet || isDeletingFromSheet) return;

    try {
      setIsSavingToSheet(true);
      setSheetSyncError('');
      setSheetSyncStatus('Saving to sheet...');

      const latestEvent = events.find((item) => item.id === eventRecord.id) || eventRecord;
      const saved = await upsertEventToSheet(SHEET_SYNC_CONFIG, latestEvent);
      let next = saved;
      const savedEntryId = saved.entryId.trim();
      if (savedEntryId) {
        try {
          const pulled = await pullEventByEntryId(SHEET_SYNC_CONFIG, savedEntryId);
          if (pulled) next = pulled;
        } catch {
          // Keep optimistic save result.
        }
      }

      upsertEventFromRemote(next);
      setSheetSyncStatus(`Saved to sheet row ${next.sourceRow || saved.sourceRow || '?'}.`);
    } catch (error) {
      setSheetSyncStatus('');
      setSheetSyncError(error instanceof Error ? error.message : 'Failed to save event.');
    } finally {
      setIsSavingToSheet(false);
    }
  }

  async function deleteCurrentEventFromSheet() {
    const eventRecord = currentEvent;
    if (!eventRecord) return;
    if (isDeletingFromSheet || isSavingToSheet) return;

    try {
      setIsDeletingFromSheet(true);
      setSheetSyncError('');
      setSheetSyncStatus('Deleting event from sheet...');

      const result = await deleteEventFromSheet(SHEET_SYNC_CONFIG, {
        entryId: eventRecord.entryId,
        sourceRow: eventRecord.sourceRow,
      });

      fireAndForgetAuditLog({
        eventType: 'sheet_delete',
        status: 'success',
        message: `Deleted event ${result.entryId || eventRecord.entryId || eventRecord.id} from sheet.`,
        details: {
          id: eventRecord.id,
          entryId: result.entryId || eventRecord.entryId || '',
          sourceRow: result.sourceRow || eventRecord.sourceRow || '',
        },
      });

      removeEvent(eventRecord.id);
      router.replace('/');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete event from sheet.';
      setSheetSyncStatus('');
      setSheetSyncError(message);
      fireAndForgetAuditLog({
        eventType: 'sheet_delete',
        status: 'error',
        message,
        details: {
          id: eventRecord.id,
          entryId: eventRecord.entryId,
          sourceRow: eventRecord.sourceRow,
        },
      });
    } finally {
      setIsDeletingFromSheet(false);
    }
  }

  function requestDeleteConfirmation() {
    if (isDeletingFromSheet || isSavingToSheet) return;

    const title = 'Delete Event?';
    const message =
      'This will delete the entire event row from the Google Sheet. This cannot be undone from the app.';

    if (Platform.OS === 'web') {
      const webConfirm = (globalThis as unknown as { confirm?: (value: string) => boolean }).confirm;
      const ok = webConfirm ? webConfirm(`${title}\n\n${message}`) : true;
      if (!ok) return;
      void deleteCurrentEventFromSheet();
      return;
    }

    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void deleteCurrentEventFromSheet();
        },
      },
    ]);
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.topRow}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={14} color="#cde0f5" />
          <ThemedText style={styles.backButtonText}>Back</ThemedText>
        </Pressable>
        <View style={styles.topActionsRight}>
          <Pressable
            onPress={() => setIsEditable((current) => !current)}
            style={[styles.editButton, isEditable ? styles.editButtonActive : null]}>
            <MaterialIcons name="edit" size={16} color={isEditable ? '#ffffff' : '#cde1ff'} />
          </Pressable>
          {isEditable ? (
            <Pressable
              style={[styles.topDeleteButton, isDeletingFromSheet ? styles.buttonDisabled : null]}
              disabled={isSavingToSheet || isDeletingFromSheet}
              onPress={requestDeleteConfirmation}>
              <MaterialIcons name="delete-forever" size={14} color="#ffd7d7" />
              <ThemedText style={styles.topDeleteButtonText}>
                {isDeletingFromSheet ? 'Deleting...' : 'Delete Event'}
              </ThemedText>
            </Pressable>
          ) : null}
        </View>
      </View>

      {typeVisual ? (
        <View style={styles.hero}>
          <View style={styles.heroTitleRow}>
            <View style={[styles.eventTypeIconWrap, { borderColor: typeVisual.color }]}>
              <MaterialIcons name={typeVisual.icon} size={15} color={typeVisual.color} />
            </View>
            <ThemedText type="title" style={[styles.heroTitle, { color: typeVisual.color }]}>
              {currentEvent.clientName || 'Untitled Event'}
            </ThemedText>
          </View>
        </View>
      ) : null}

      <View style={styles.section}>
        <ThemedText style={styles.sectionTitle}>Event Timing & Hours</ThemedText>
        <View style={styles.fieldBlock}>
          <ThemedText style={styles.fieldLabel}>Set-Up Time</ThemedText>
          <TextInput
            style={[styles.input, !isEditable ? styles.readOnlyInput : null]}
            value={currentEvent.setupTime}
            editable={isEditable}
            onChangeText={(text) => updateField('setupTime', text)}
            placeholder="4:30 PM"
            placeholderTextColor="#6f849a"
          />
        </View>
        <View style={styles.fieldBlock}>
          <ThemedText style={styles.fieldLabel}>Event Start Time</ThemedText>
          <TextInput
            style={[styles.input, !isEditable ? styles.readOnlyInput : null]}
            value={currentEvent.eventStartTime}
            editable={isEditable}
            onChangeText={(text) => updateField('eventStartTime', text)}
            placeholder="6:00 PM"
            placeholderTextColor="#6f849a"
          />
        </View>
        <View style={styles.fieldBlock}>
          <ThemedText style={styles.fieldLabel}>Event End Time</ThemedText>
          <TextInput
            style={[styles.input, !isEditable ? styles.readOnlyInput : null]}
            value={currentEvent.eventEndTime}
            editable={isEditable}
            onChangeText={(text) => updateField('eventEndTime', text)}
            placeholder="11:00 PM"
            placeholderTextColor="#6f849a"
          />
        </View>
        <View style={styles.fieldBlock}>
          <ThemedText style={styles.fieldLabel}>Extra Hours</ThemedText>
          <TextInput
            style={[styles.input, !isEditable ? styles.readOnlyInput : null]}
            value={currentEvent.extraHours}
            editable={isEditable}
            keyboardType="decimal-pad"
            onChangeText={(text) => updateField('extraHours', text)}
            placeholder="0"
            placeholderTextColor="#6f849a"
          />
        </View>
      </View>

      <View style={styles.section}>
        <ThemedText style={styles.sectionTitle}>Options</ThemedText>
        <View style={styles.fieldBlock}>
          <ThemedText style={styles.fieldLabel}>Custom Flash?</ThemedText>
          <View style={styles.choiceRow}>
            {YES_NO_TBD_CHOICES.map((choice) => {
              const selected = currentEvent.customFlash.trim().toUpperCase() === choice;
              return (
                <Pressable
                  key={`custom-flash-${choice}`}
                  disabled={!isEditable}
                  onPress={() => {
                    if (!isEditable) return;
                    updateField('customFlash', choice);
                  }}
                  style={[
                    styles.choiceChip,
                    selected ? styles.choiceChipActive : null,
                    !isEditable ? styles.choiceChipDisabled : null,
                  ]}>
                  <ThemedText style={[styles.choiceChipText, selected ? styles.choiceChipTextActive : null]}>
                    {choice}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        </View>
        <View style={styles.fieldBlock}>
          <ThemedText style={styles.fieldLabel}>Temporary Tattoos?</ThemedText>
          <View style={styles.choiceRow}>
            {YES_NO_TBD_CHOICES.map((choice) => {
              const selected = currentEvent.temporaryTattoos.trim().toUpperCase() === choice;
              return (
                <Pressable
                  key={`temporary-tattoos-${choice}`}
                  disabled={!isEditable}
                  onPress={() => {
                    if (!isEditable) return;
                    updateField('temporaryTattoos', choice);
                  }}
                  style={[
                    styles.choiceChip,
                    selected ? styles.choiceChipActive : null,
                    !isEditable ? styles.choiceChipDisabled : null,
                  ]}>
                  <ThemedText style={[styles.choiceChipText, selected ? styles.choiceChipTextActive : null]}>
                    {choice}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <ThemedText style={styles.sectionTitle}>Event Pricing</ThemedText>
        <View style={styles.breakdownRow}>
          <ThemedText style={styles.leadBreakdownLabel}>Base Price (5 hours)</ThemedText>
          <ThemedText style={styles.leadBreakdownValue}>{formatCurrency(totals.basePrice)}</ThemedText>
        </View>
        <View style={styles.breakdownRow}>
          <ThemedText style={styles.leadBreakdownLabel}>Counter Staff (5 hours)</ThemedText>
          <ThemedText style={styles.leadBreakdownValue}>{formatCurrency(totals.baseCounterStaffCharge)}</ThemedText>
        </View>
        <View style={styles.breakdownDivider} />
        {totals.shouldProrateBase ? (
          <>
            <View style={styles.breakdownRow}>
              <ThemedText style={styles.breakdownLabel}>
                {`Prorated Base Price (${totals.bookedHours.toFixed(2)} hours)`}
              </ThemedText>
              <ThemedText style={styles.breakdownValue}>{formatCurrency(totals.proratedBaseTotal)}</ThemedText>
            </View>
            <View style={styles.breakdownRow}>
              <ThemedText style={styles.breakdownLabel}>
                {`Prorated Counter Staff (${totals.bookedHours.toFixed(2)} hours)`}
              </ThemedText>
              <ThemedText style={styles.breakdownValue}>
                {formatCurrency(totals.proratedCounterStaffCharge)}
              </ThemedText>
            </View>
            <View style={styles.breakdownDivider} />
          </>
        ) : null}
        <View style={styles.breakdownRow}>
          <ThemedText style={styles.breakdownLabel}>Temp Facility License</ThemedText>
          <ThemedText style={styles.breakdownValue}>
            {formatCurrency(totals.computed.effectiveFees.tempFacilityLicenseFee)}
          </ThemedText>
        </View>
        <View style={styles.breakdownRow}>
          <ThemedText style={styles.breakdownLabel}>
            {`Custom Flash (${totals.customFlashFlag})`}
          </ThemedText>
          <ThemedText style={styles.breakdownValue}>
            {formatCurrency(totals.computed.effectiveFees.customFlashFee)}
          </ThemedText>
        </View>
        <View style={styles.breakdownRow}>
          <ThemedText style={styles.breakdownLabel}>
            {`Temporary Tattoos (${totals.temporaryTattoosFlag})`}
          </ThemedText>
          <ThemedText style={styles.breakdownValue}>
            {formatCurrency(totals.computed.effectiveFees.temporaryTattooFee)}
          </ThemedText>
        </View>
        <View style={styles.breakdownRow}>
          <ThemedText style={styles.breakdownLabel}>{totals.travelDistanceDisplayLabel}</ThemedText>
          <ThemedText style={styles.breakdownValue}>{totals.travelDistanceLabel}</ThemedText>
        </View>
        <View style={styles.breakdownRow}>
          <ThemedText style={styles.breakdownLabel}>Radius Fee</ThemedText>
          <ThemedText style={styles.breakdownValue}>
            {formatCurrency(totals.computed.effectiveFees.radiusFee)}
          </ThemedText>
        </View>
        <View style={styles.breakdownRow}>
          <ThemedText style={styles.breakdownLabel}>Extra Hourly Charge</ThemedText>
          <ThemedText style={styles.breakdownValue}>{formatCurrency(totals.extraHourlyCharge)}</ThemedText>
        </View>
        <View style={styles.breakdownRow}>
          <ThemedText style={styles.breakdownLabel}>{totals.staffAdjustmentLabel}</ThemedText>
          <ThemedText style={styles.breakdownValue}>{formatCurrency(totals.computed.staffAdjustment)}</ThemedText>
        </View>
        <View style={styles.breakdownRow}>
          <ThemedText style={styles.breakdownLabel}>Modifiers Total</ThemedText>
          <ThemedText style={styles.breakdownValue}>{formatCurrency(totals.effectiveModifiersTotal)}</ThemedText>
        </View>
        <View style={styles.breakdownDivider} />
        <View style={styles.breakdownRow}>
          <ThemedText style={styles.totalLabel}>Total</ThemedText>
          <ThemedText style={styles.totalValue}>{formatCurrency(Math.max(0, totals.pricingTotal))}</ThemedText>
        </View>
        <View style={styles.breakdownRow}>
          <ThemedText style={styles.breakdownLabel}>Deposit</ThemedText>
          <View style={styles.valueWithBadge}>
            <ThemedText style={styles.breakdownValue}>
              {formatCurrency(Math.max(0, totals.computed.depositRequired))}
            </ThemedText>
            {isDepositMarkedPaid(currentEvent) && Math.max(0, totals.computed.depositRequired) > 0 ? (
              <MaterialIcons name="check-circle" size={14} color="#7fd29a" />
            ) : null}
          </View>
        </View>
        <View style={styles.breakdownRow}>
          <ThemedText style={styles.breakdownLabel}>Balance</ThemedText>
          <ThemedText style={styles.breakdownValue}>
            {formatCurrency(Math.max(0, totals.computed.balanceAfterDeposit))}
          </ThemedText>
        </View>
      </View>

      {canEditStaffAdjustment ? (
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Staff Price Adjustment</ThemedText>

          <View style={styles.fieldBlock}>
            <ThemedText style={styles.fieldLabel}>Staff Price Adjustment (+/-)</ThemedText>
            <TextInput
              style={[styles.input, !isEditable ? styles.readOnlyInput : null]}
              value={currentEvent.staffPriceAdjustment}
              keyboardType="decimal-pad"
              editable={isEditable}
              onChangeText={(text) => updateField('staffPriceAdjustment', text)}
              placeholder="Example: -150 or 250"
              placeholderTextColor="#6f849a"
            />
          </View>

          <View style={styles.fieldBlock}>
            <ThemedText style={styles.fieldLabel}>Adjustment Reason</ThemedText>
            <TextInput
              style={[styles.input, !isEditable ? styles.readOnlyInput : null]}
              value={currentEvent.staffPriceAdjustmentReason}
              editable={isEditable}
              onChangeText={(text) => updateField('staffPriceAdjustmentReason', text)}
              placeholder="Why this adjustment was made"
              placeholderTextColor="#6f849a"
            />
          </View>
        </View>
      ) : null}

      <View style={styles.section}>
        <ThemedText style={styles.sectionTitle}>Client Details</ThemedText>
        {CLIENT_FIELDS.map((field) => {
          const value = currentEvent[field.key] ?? '';

          if (field.key === 'year') {
            return (
              <View key={String(field.key)} style={styles.fieldBlock}>
                <ThemedText style={styles.fieldLabel}>{field.label}</ThemedText>
                <View style={styles.choiceRow}>
                  {PRICE_PLAN_OPTIONS.map((option) => {
                    const selected = value.trim() === option;
                    return (
                      <Pressable
                        key={option}
                        disabled={!isEditable}
                        onPress={() => {
                          if (!isEditable) return;
                          updateField('year', option);
                        }}
                        style={[
                          styles.choiceChip,
                          selected ? styles.choiceChipActive : null,
                          !isEditable ? styles.choiceChipDisabled : null,
                        ]}>
                        <ThemedText style={[styles.choiceChipText, selected ? styles.choiceChipTextActive : null]}>
                          {option}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          }

          return (
            <View key={String(field.key)} style={styles.fieldBlock}>
              <ThemedText style={styles.fieldLabel}>{field.label}</ThemedText>
              <TextInput
                style={[
                  styles.input,
                  field.multiline ? styles.inputMultiline : null,
                  !isEditable ? styles.readOnlyInput : null,
                ]}
                value={value}
                multiline={field.multiline}
                keyboardType={field.keyboardType}
                editable={isEditable}
                onChangeText={(text) => updateField(field.key, text as EventRecord[typeof field.key])}
                placeholder={field.placeholder}
                placeholderTextColor="#6f849a"
              />
            </View>
          );
        })}
      </View>

      {isEditable ? (
        <View style={styles.section}>
          <Pressable
            style={[styles.primaryButton, isSavingToSheet ? styles.buttonDisabled : null]}
            disabled={isSavingToSheet || isDeletingFromSheet}
            onPress={() => {
              void saveToSheet();
            }}>
            <ThemedText style={styles.primaryButtonText}>{isSavingToSheet ? 'Saving...' : 'Save Changes'}</ThemedText>
          </Pressable>
          {sheetSyncStatus ? <ThemedText style={styles.helperText}>{sheetSyncStatus}</ThemedText> : null}
          {sheetSyncError ? <ThemedText style={styles.errorText}>{sheetSyncError}</ThemedText> : null}
        </View>
      ) : null}
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
    paddingBottom: 40,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0b1117',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  topActionsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#2a3f56',
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
    backgroundColor: '#101922',
  },
  backButtonText: {
    color: '#cde0f5',
    fontWeight: '700',
    fontSize: 12,
  },
  editButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#2f4358',
    backgroundColor: '#101922',
  },
  editButtonActive: {
    backgroundColor: '#2563c7',
    borderColor: '#3f7fe6',
  },
  topDeleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#6b1f28',
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 8,
    backgroundColor: '#3c1118',
  },
  topDeleteButtonText: {
    color: '#ffd7d7',
    fontWeight: '700',
    fontSize: 12,
  },
  hero: {
    backgroundColor: '#111a24',
    borderColor: '#223244',
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 6,
  },
  heroTitle: {
    fontSize: 28,
    lineHeight: 31,
  },
  heroTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  eventTypeIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    backgroundColor: '#0f1620',
  },
  section: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#223244',
    backgroundColor: '#111a24',
    padding: 14,
    gap: 10,
  },
  sectionTitle: {
    color: '#e8f1fb',
    fontWeight: '700',
    fontSize: 17,
  },
  fieldBlock: {
    gap: 5,
  },
  fieldLabel: {
    color: '#9cb1c8',
    fontWeight: '700',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  choiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  choiceChip: {
    borderWidth: 1,
    borderColor: '#3a536d',
    backgroundColor: '#162433',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  choiceChipActive: {
    borderColor: '#5e98ff',
    backgroundColor: '#214b8d',
  },
  choiceChipDisabled: {
    opacity: 0.45,
  },
  choiceChipText: {
    color: '#cde1ff',
    fontWeight: '700',
    fontSize: 12,
  },
  choiceChipTextActive: {
    color: '#f3f8ff',
  },
  input: {
    borderWidth: 1,
    borderColor: '#2b3f55',
    borderRadius: 10,
    backgroundColor: '#0f1620',
    color: '#e5eef8',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  inputMultiline: {
    minHeight: 82,
    textAlignVertical: 'top',
  },
  readOnlyInput: {
    opacity: 0.75,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  leadBreakdownLabel: {
    color: '#a6bdd5',
    fontWeight: '600',
    flex: 1,
  },
  leadBreakdownValue: {
    color: '#e5eef9',
    fontWeight: '700',
  },
  breakdownLabel: {
    color: '#a7bbd0',
    fontSize: 13,
    flex: 1,
  },
  breakdownValue: {
    color: '#e4edf8',
    fontWeight: '700',
    fontSize: 13,
  },
  valueWithBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  breakdownDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#27405b',
    marginVertical: 2,
  },
  totalLabel: {
    color: '#f1f6fd',
    fontWeight: '800',
    fontSize: 14,
  },
  totalValue: {
    color: '#f3f8ff',
    fontWeight: '900',
    fontSize: 15,
  },
  primaryButton: {
    borderRadius: 10,
    backgroundColor: '#2b74d9',
    paddingHorizontal: 12,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  helperText: {
    color: '#9ab0c7',
    fontSize: 12,
  },
  errorText: {
    color: '#ff8f8f',
    fontWeight: '600',
  },
});
