import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

export function RainbowSparkleBackground() {
  const orbit = useRef(new Animated.Value(0)).current;
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const orbitAnimation = Animated.loop(
      Animated.timing(orbit, {
        toValue: 1,
        duration: 28000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );

    const shimmerAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 2200,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          toValue: 0,
          duration: 2200,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );

    orbitAnimation.start();
    shimmerAnimation.start();

    return () => {
      orbitAnimation.stop();
      shimmerAnimation.stop();
    };
  }, [orbit, shimmer]);

  const orbitSpin = orbit.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const shimmerOpacity = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 0.92],
  });

  return (
    <View pointerEvents="none" style={styles.root}>
      <View style={styles.base} />

      <Animated.View style={[styles.orb, styles.orbA, { transform: [{ rotate: orbitSpin }] }]} />
      <Animated.View style={[styles.orb, styles.orbB, { transform: [{ rotate: orbitSpin }] }]} />
      <Animated.View style={[styles.orb, styles.orbC, { transform: [{ rotate: orbitSpin }] }]} />

      <Animated.View style={[styles.sparkle, styles.sparkleA, { opacity: shimmerOpacity }]} />
      <Animated.View style={[styles.sparkle, styles.sparkleB, { opacity: shimmerOpacity }]} />
      <Animated.View style={[styles.sparkle, styles.sparkleC, { opacity: shimmerOpacity }]} />
      <Animated.View style={[styles.sparkle, styles.sparkleD, { opacity: shimmerOpacity }]} />
      <Animated.View style={[styles.sparkle, styles.sparkleE, { opacity: shimmerOpacity }]} />
      <Animated.View style={[styles.sparkle, styles.sparkleF, { opacity: shimmerOpacity }]} />
      <Animated.View style={[styles.sparkle, styles.sparkleG, { opacity: shimmerOpacity }]} />
      <Animated.View style={[styles.sparkle, styles.sparkleH, { opacity: shimmerOpacity }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  base: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  orb: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.22,
  },
  orbA: {
    width: 340,
    height: 340,
    top: -120,
    left: -90,
    backgroundColor: '#ff4fb0',
  },
  orbB: {
    width: 280,
    height: 280,
    bottom: -90,
    right: -70,
    backgroundColor: '#40f7ff',
  },
  orbC: {
    width: 250,
    height: 250,
    top: '36%',
    right: '28%',
    backgroundColor: '#9a66ff',
  },
  sparkle: {
    position: 'absolute',
    width: 7,
    height: 7,
    borderRadius: 999,
    shadowColor: '#fff',
    shadowOpacity: 0.72,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
  },
  sparkleA: { top: '14%', left: '12%', backgroundColor: '#ffe86b' },
  sparkleB: { top: '22%', right: '16%', backgroundColor: '#ff7ad0' },
  sparkleC: { top: '36%', left: '22%', backgroundColor: '#6ee6ff' },
  sparkleD: { top: '49%', right: '24%', backgroundColor: '#92ffb4' },
  sparkleE: { top: '60%', left: '18%', backgroundColor: '#d48bff' },
  sparkleF: { top: '72%', right: '14%', backgroundColor: '#ffd96f' },
  sparkleG: { top: '83%', left: '36%', backgroundColor: '#8fb8ff' },
  sparkleH: { top: '8%', right: '40%', backgroundColor: '#8effea' },
});
