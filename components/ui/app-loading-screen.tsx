import { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Easing, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';

export function AppLoadingScreen() {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 850,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 850,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  const scale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.16],
  });

  const ringOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 0.05],
  });

  return (
    <View style={styles.page}>
      <View style={styles.centerWrap}>
        <Animated.View style={[styles.ring, { opacity: ringOpacity, transform: [{ scale }] }]} />
        <View style={styles.dotWrap}>
          <View style={styles.dotCore} />
        </View>
        <ThemedText style={styles.title}>Anatomy Events</ThemedText>
        <ThemedText style={styles.subtitle}>Loading workspace...</ThemedText>
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
  },
  ring: {
    position: 'absolute',
    top: -18,
    width: 120,
    height: 120,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#2b74d9',
    backgroundColor: 'rgba(43,116,217,0.08)',
  },
  dotWrap: {
    width: 70,
    height: 70,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#314862',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    backgroundColor: '#101a25',
  },
  dotCore: {
    width: 20,
    height: 20,
    borderRadius: 999,
    backgroundColor: '#f2c066',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#e7eff8',
  },
  subtitle: {
    color: '#9eb2c8',
    marginBottom: 6,
  },
});

