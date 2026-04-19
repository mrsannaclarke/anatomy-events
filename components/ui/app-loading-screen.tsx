import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { RainbowSparkleBackground } from '@/components/ui/rainbow-sparkle-background';

export function AppLoadingScreen() {
  const logoSource = require('../../assets/images/anatomy-logo-circle.png');

  return (
    <View style={styles.page}>
      <RainbowSparkleBackground overlayOnly sparkleStyle="stars" />
      <View style={styles.centerWrap}>
        <View style={styles.logoWrap}>
          <Image source={logoSource} style={styles.logoImage} />
        </View>
        <ThemedText style={styles.title}>Anatomy Events</ThemedText>
        <ActivityIndicator color="#f2c066" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#070d13',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  centerWrap: {
    alignItems: 'center',
    gap: 10,
    zIndex: 2,
  },
  logoWrap: {
    width: 122,
    height: 122,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#314862',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    backgroundColor: '#101a25',
    overflow: 'hidden',
  },
  logoImage: {
    width: 116,
    height: 116,
    borderRadius: 999,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#e7eff8',
    marginTop: 18,
    marginBottom: 4,
  },
});
