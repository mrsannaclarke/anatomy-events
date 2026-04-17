import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useEvents } from '@/context/events-context';
import { computeEventTotals, formatCurrency } from '@/lib/event-math';
import { buildContractPlaceholders, buildTflPlaceholders } from '@/lib/placeholders';

function renderPlaceholderMap(map: Record<string, string>) {
  return Object.entries(map)
    .map(([key, value]) => `${key}: ${value || '<blank>'}`)
    .join('\n');
}

export default function GeneratorScreen() {
  const { events, selectedEventId } = useEvents();
  const current = events.find((event) => event.id === selectedEventId) ?? events[0];

  if (!current) {
    return (
      <View style={styles.emptyContainer}>
        <ThemedText type="subtitle">No events yet</ThemedText>
      </View>
    );
  }

  const totals = computeEventTotals(current);
  const contractPlaceholders = buildContractPlaceholders(current);
  const tflPlaceholders = buildTflPlaceholders(current);

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <ThemedText style={styles.heroKicker}>Generator Preview</ThemedText>
        <ThemedText type="title" style={styles.heroTitle}>
          {current.clientName || 'Untitled Event'}
        </ThemedText>
        <ThemedText style={styles.heroBody}>
          Active schema row: Year {current.year || '-'}, Entry {current.entryId || '-'}, Artists{' '}
          {current.numberOfArtists || '0'}.
        </ThemedText>
      </View>

      <View style={styles.summaryGrid}>
        <View style={styles.summaryCard}>
          <ThemedText style={styles.summaryLabel}>Base Source</ThemedText>
          <ThemedText style={styles.summaryValue}>{totals.source.replaceAll('_', ' ')}</ThemedText>
        </View>
        <View style={styles.summaryCard}>
          <ThemedText style={styles.summaryLabel}>Base Total</ThemedText>
          <ThemedText style={styles.summaryValue}>{formatCurrency(totals.baseTotal)}</ThemedText>
        </View>
        <View style={styles.summaryCard}>
          <ThemedText style={styles.summaryLabel}>Modifiers Total</ThemedText>
          <ThemedText style={styles.summaryValue}>{formatCurrency(totals.extrasTotal)}</ThemedText>
        </View>
        <View style={styles.summaryCard}>
          <ThemedText style={styles.summaryLabel}>Staff Adjustment</ThemedText>
          <ThemedText style={styles.summaryValue}>{formatCurrency(totals.staffAdjustment)}</ThemedText>
        </View>
        <View style={styles.summaryCard}>
          <ThemedText style={styles.summaryLabel}>Credit Applied</ThemedText>
          <ThemedText style={styles.summaryValue}>{formatCurrency(totals.creditApplied)}</ThemedText>
        </View>
        <View style={styles.summaryCard}>
          <ThemedText style={styles.summaryLabel}>Computed Total</ThemedText>
          <ThemedText style={styles.summaryValue}>{formatCurrency(totals.computedTotal)}</ThemedText>
        </View>
        <View style={styles.summaryCard}>
          <ThemedText style={styles.summaryLabel}>Balance</ThemedText>
          <ThemedText style={styles.summaryValue}>{formatCurrency(totals.balanceAfterDeposit)}</ThemedText>
        </View>
        <View style={styles.summaryCard}>
          <ThemedText style={styles.summaryLabel}>Auto Sources</ThemedText>
          <ThemedText style={styles.summaryValue}>
            Radius {totals.autoSources.radiusFee}, Flash {totals.autoSources.customFlash}, Temp{' '}
            {totals.autoSources.temporaryTattoo}, TFL {totals.autoSources.tflFee}
          </ThemedText>
        </View>
      </View>

      <View style={styles.section}>
        <ThemedText style={styles.sectionTitle}>Contract Placeholders</ThemedText>
        <ThemedText style={styles.sectionDescription}>
          Includes required mappings for {'{{ED_M}}'}, {'{{ED_Y}}'}, {'{{ED_Z}}'}, and{' '}
          {'{{Counter Staff Charge}}'}.
        </ThemedText>
        <View style={styles.codeBlock}>
          <ThemedText style={styles.codeText}>{renderPlaceholderMap(contractPlaceholders)}</ThemedText>
        </View>
      </View>

      <View style={styles.section}>
        <ThemedText style={styles.sectionTitle}>TFL Placeholders</ThemedText>
        <ThemedText style={styles.sectionDescription}>
          Artist slot placeholders {'{{a1}}'}..{'{{a19}}'} are pre-built; license fields stay blank
          until an Artist License source is connected.
        </ThemedText>
        <View style={styles.codeBlock}>
          <ThemedText style={styles.codeText}>{renderPlaceholderMap(tflPlaceholders)}</ThemedText>
        </View>
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
    gap: 14,
    paddingBottom: 40,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hero: {
    backgroundColor: '#111a24',
    borderWidth: 1,
    borderColor: '#223244',
    borderRadius: 16,
    padding: 16,
    gap: 6,
  },
  heroKicker: {
    color: '#8cbfff',
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontSize: 12,
    fontWeight: '700',
  },
  heroTitle: {
    color: '#e7edf6',
    fontSize: 28,
    lineHeight: 32,
  },
  heroBody: {
    color: '#9eb2c9',
    lineHeight: 21,
  },
  summaryGrid: {
    gap: 10,
  },
  summaryCard: {
    backgroundColor: '#111a24',
    borderWidth: 1,
    borderColor: '#223244',
    borderRadius: 12,
    padding: 12,
  },
  summaryLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    color: '#7f95ad',
    letterSpacing: 0.9,
  },
  summaryValue: {
    marginTop: 3,
    fontWeight: '700',
    color: '#e3ecf8',
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontWeight: '700',
    color: '#e4edf8',
    fontSize: 18,
  },
  sectionDescription: {
    color: '#9ab0c7',
    lineHeight: 20,
  },
  codeBlock: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a3c50',
    backgroundColor: '#0f1620',
    padding: 12,
  },
  codeText: {
    fontFamily: 'Courier',
    fontSize: 12,
    lineHeight: 18,
    color: '#d9e5f3',
  },
});
