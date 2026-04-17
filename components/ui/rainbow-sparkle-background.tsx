import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

type RainbowSparkleBackgroundProps = {
  overlayOnly?: boolean;
};

export function RainbowSparkleBackground({ overlayOnly = false }: RainbowSparkleBackgroundProps) {
  const orbit = useRef(new Animated.Value(0)).current;
  const shimmer = useRef(new Animated.Value(0)).current;
  const drift = useRef(new Animated.Value(0)).current;

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
    const driftAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, {
          toValue: 1,
          duration: 9000,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(drift, {
          toValue: 0,
          duration: 9000,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );

    orbitAnimation.start();
    shimmerAnimation.start();
    driftAnimation.start();

    return () => {
      orbitAnimation.stop();
      shimmerAnimation.stop();
      driftAnimation.stop();
    };
  }, [drift, orbit, shimmer]);

  const orbitSpin = orbit.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const shimmerOpacity = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [0.5, 1],
  });
  const driftY = drift.interpolate({
    inputRange: [0, 1],
    outputRange: [-8, 8],
  });
  const overlaySparkleOpacity = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [0.38, 0.82],
  });

  return (
    <View pointerEvents="none" style={[styles.root, overlayOnly ? styles.rootOverlay : null]}>
      {!overlayOnly ? <View style={styles.base} /> : null}

      {!overlayOnly ? (
        <>
          <Animated.View style={[styles.orb, styles.orbA, { transform: [{ rotate: orbitSpin }, { translateY: driftY }] }]} />
          <Animated.View style={[styles.orb, styles.orbB, { transform: [{ rotate: orbitSpin }, { translateY: driftY }] }]} />
          <Animated.View style={[styles.orb, styles.orbC, { transform: [{ rotate: orbitSpin }, { translateY: driftY }] }]} />
        </>
      ) : null}

      <Animated.View style={[styles.sparkle, styles.sparkleA, { opacity: overlayOnly ? overlaySparkleOpacity : shimmerOpacity }]} />
      <Animated.View style={[styles.sparkle, styles.sparkleB, { opacity: overlayOnly ? overlaySparkleOpacity : shimmerOpacity }]} />
      <Animated.View style={[styles.sparkle, styles.sparkleC, { opacity: overlayOnly ? overlaySparkleOpacity : shimmerOpacity }]} />
      <Animated.View style={[styles.sparkle, styles.sparkleD, { opacity: overlayOnly ? overlaySparkleOpacity : shimmerOpacity }]} />
      <Animated.View style={[styles.sparkle, styles.sparkleE, { opacity: overlayOnly ? overlaySparkleOpacity : shimmerOpacity }]} />
      <Animated.View style={[styles.sparkle, styles.sparkleF, { opacity: overlayOnly ? overlaySparkleOpacity : shimmerOpacity }]} />
      <Animated.View style={[styles.sparkle, styles.sparkleG, { opacity: overlayOnly ? overlaySparkleOpacity : shimmerOpacity }]} />
      <Animated.View style={[styles.sparkle, styles.sparkleH, { opacity: overlayOnly ? overlaySparkleOpacity : shimmerOpacity }]} />
      <Animated.View style={[styles.sparkle, styles.sparkleI, { opacity: overlayOnly ? overlaySparkleOpacity : shimmerOpacity }]} />
      <Animated.View style={[styles.sparkle, styles.sparkleJ, { opacity: overlayOnly ? overlaySparkleOpacity : shimmerOpacity }]} />
      <Animated.View style={[styles.sparkle, styles.sparkleK, { opacity: overlayOnly ? overlaySparkleOpacity : shimmerOpacity }]} />
      <Animated.View style={[styles.sparkle, styles.sparkleL, { opacity: overlayOnly ? overlaySparkleOpacity : shimmerOpacity }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  rootOverlay: {
    zIndex: 999,
  },
  base: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0b1117',
  },
  orb: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.44,
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
    width: 10,
    height: 10,
    borderRadius: 999,
    shadowColor: '#fff',
    shadowOpacity: 1,
    shadowRadius: 8,
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
  sparkleI: { top: '28%', left: '8%', backgroundColor: '#ffd1f7' },
  sparkleJ: { top: '41%', right: '8%', backgroundColor: '#d4ff8f' },
  sparkleK: { top: '66%', left: '8%', backgroundColor: '#7ec8ff' },
  sparkleL: { top: '88%', right: '28%', backgroundColor: '#ffe0a1' },
});
