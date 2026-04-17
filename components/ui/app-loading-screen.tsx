import { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Easing, Image, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';

export function AppLoadingScreen() {
  const pulse = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const logoSource = require('../../assets/images/anatomy-logo-circle.png');

  useEffect(() => {
    const pulseAnimation = Animated.loop(
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
    const spinAnimation = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 3800,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );

    pulseAnimation.start();
    spinAnimation.start();
    return () => {
      pulseAnimation.stop();
      spinAnimation.stop();
    };
  }, [pulse, spin]);

  const scale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.16],
  });

  const ringOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 0.05],
  });
  const spinForward = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  const spinBackward = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '-360deg'],
  });
  const sparkleOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.55, 1],
  });

  return (
    <View style={styles.page}>
      <View style={styles.centerWrap}>
        <Animated.View style={[styles.swirlRingOuter, { transform: [{ rotate: spinForward }] }]} />
        <Animated.View style={[styles.swirlRingInner, { transform: [{ rotate: spinBackward }] }]} />
        <Animated.View style={[styles.ring, { opacity: ringOpacity, transform: [{ scale }] }]} />
        <Animated.View style={[styles.sparkleDot, styles.sparkleA, { opacity: sparkleOpacity }]} />
        <Animated.View style={[styles.sparkleDot, styles.sparkleB, { opacity: sparkleOpacity }]} />
        <Animated.View style={[styles.sparkleDot, styles.sparkleC, { opacity: sparkleOpacity }]} />
        <Animated.View style={[styles.sparkleDot, styles.sparkleD, { opacity: sparkleOpacity }]} />
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
  },
  swirlRingOuter: {
    position: 'absolute',
    top: -34,
    width: 186,
    height: 186,
    borderRadius: 999,
    borderWidth: 3.4,
    borderTopColor: '#ff4fb0',
    borderRightColor: '#ffde59',
    borderBottomColor: '#40f7ff',
    borderLeftColor: '#9a66ff',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  swirlRingInner: {
    position: 'absolute',
    top: -28,
    width: 174,
    height: 174,
    borderRadius: 999,
    borderWidth: 2.5,
    borderTopColor: '#56ff9a',
    borderRightColor: '#ff7f50',
    borderBottomColor: '#55a8ff',
    borderLeftColor: '#f45dff',
    backgroundColor: 'rgba(255,255,255,0.015)',
  },
  ring: {
    position: 'absolute',
    top: -24,
    width: 168,
    height: 168,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#2b74d9',
    backgroundColor: 'rgba(43,116,217,0.08)',
  },
  sparkleDot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 999,
    shadowColor: '#fff',
    shadowOpacity: 0.45,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
  sparkleA: {
    top: -22,
    left: 20,
    backgroundColor: '#ff73c6',
  },
  sparkleB: {
    top: 18,
    right: -18,
    backgroundColor: '#7af5ff',
  },
  sparkleC: {
    bottom: 68,
    left: -16,
    backgroundColor: '#ffe270',
  },
  sparkleD: {
    bottom: 20,
    right: 14,
    backgroundColor: '#b79cff',
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
