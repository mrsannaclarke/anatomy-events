import { Link } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';

export default function ModalScreen() {
  return (
    <View style={styles.container}>
      <ThemedText type="title" style={styles.title}>
        Anatomy Events v1
      </ThemedText>
      <ThemedText style={styles.body}>
        This app mirrors the Event Details spreadsheet schema and computes totals using the same base
        pricing + fee-addition flow.
      </ThemedText>
      <ThemedText style={styles.body}>
        Current scope: event entry, totals preview, and contract/TFL placeholder preview. Google Docs
        generation and license lookup are next-step integrations.
      </ThemedText>
      <Link href="/" dismissTo style={styles.link}>
        <ThemedText type="link">Back to Events</ThemedText>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    backgroundColor: 'transparent',
    gap: 12,
  },
  title: {
    fontSize: 30,
    lineHeight: 34,
  },
  body: {
    color: '#9fb3c9',
  },
  link: {
    marginTop: 8,
  },
});
