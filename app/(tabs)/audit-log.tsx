import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { readAuditLogs, type AuditLogEntry } from '@/lib/audit-log';
import { useAuthFramework } from '@/lib/auth-framework';

function formatWhen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || 'Unknown time';
  return date.toLocaleString();
}

function statusColor(status: string): string {
  const key = String(status || '').toLowerCase();
  if (key === 'success') return '#67d68d';
  if (key === 'error') return '#ff8f9a';
  return '#c8d3dc';
}

export default function AuditLogScreen() {
  const router = useRouter();
  const { canAccessAdminTools } = useAuthFramework();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  function goToAdminTools() {
    router.replace('/admin');
  }

  const canViewAdmin = useMemo(() => canAccessAdminTools, [canAccessAdminTools]);

  const loadLogs = useCallback(
    async (refresh: boolean) => {
      if (!canViewAdmin) {
        setLogs([]);
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      if (refresh) setIsRefreshing(true);
      else setIsLoading(true);

      try {
        const next = await readAuditLogs();
        setLogs(next);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [canViewAdmin],
  );

  useEffect(() => {
    void loadLogs(false);
  }, [loadLogs]);

  if (!canViewAdmin) {
    return (
      <View style={styles.page}>
        <View style={styles.card}>
          <ThemedText style={styles.sectionTitle}>Audit Log</ThemedText>
          <ThemedText style={styles.helperText}>This page is only visible to admins and super admins.</ThemedText>
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

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void loadLogs(true)} />}>
      <View style={styles.card}>
        <Pressable style={styles.secondaryButton} onPress={goToAdminTools}>
          <View style={styles.buttonContent}>
            <MaterialIcons name="arrow-back" size={16} color="#c7d8eb" />
            <ThemedText style={styles.secondaryButtonText}>Back to Admin Tools</ThemedText>
          </View>
        </Pressable>
      </View>

      <View style={styles.card}>
        <ThemedText style={styles.sectionTitle}>Audit Log</ThemedText>
        <ThemedText style={styles.helperText}>Showing latest {logs.length} entries (rolling max 150).</ThemedText>
        {isLoading ? <ThemedText style={styles.helperText}>Loading audit log...</ThemedText> : null}
        {!isLoading && logs.length === 0 ? <ThemedText style={styles.helperText}>No audit entries yet.</ThemedText> : null}
        {!isLoading
          ? logs.map((entry) => (
              <View key={entry.id} style={styles.logCard}>
                <View style={styles.logTopRow}>
                  <ThemedText style={styles.logEventType}>{entry.eventType}</ThemedText>
                  <ThemedText style={[styles.logStatus, { color: statusColor(entry.status) }]}>
                    {entry.status}
                  </ThemedText>
                </View>
                <ThemedText style={styles.logMeta}>{formatWhen(entry.timestamp)}</ThemedText>
                <ThemedText style={styles.logMessage}>{entry.message}</ThemedText>
                {entry.details ? <ThemedText style={styles.logDetails}>{entry.details}</ThemedText> : null}
              </View>
            ))
          : null}
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
  logCard: {
    borderWidth: 1,
    borderColor: '#2a3c50',
    borderRadius: 10,
    backgroundColor: '#0f1620',
    padding: 10,
    gap: 4,
  },
  logTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  logEventType: {
    color: '#f1f6fd',
    fontWeight: '700',
    flexShrink: 1,
  },
  logStatus: {
    textTransform: 'uppercase',
    fontWeight: '800',
    fontSize: 11,
  },
  logMeta: {
    color: '#a5bbd2',
    fontSize: 12,
  },
  logMessage: {
    color: '#d9e6f5',
    lineHeight: 18,
  },
  logDetails: {
    color: '#9ab0c7',
    fontSize: 11,
    lineHeight: 16,
  },
});
