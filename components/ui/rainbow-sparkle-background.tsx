import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

export type SparkleStyle = 'stars' | 'dots';

type RainbowSparkleBackgroundProps = {
  overlayOnly?: boolean;
  sparkleStyle?: SparkleStyle;
};

type TwinkleChannel = 'a' | 'b' | 'c';
type PercentValue = `${number}%`;

type StarPoint = {
  id: string;
  glyph: string;
  top: PercentValue;
  left?: PercentValue;
  right?: PercentValue;
  color: string;
  size: number;
  channel: TwinkleChannel;
};

type DotPoint = {
  id: string;
  top: PercentValue;
  left?: PercentValue;
  right?: PercentValue;
  color: string;
};

const STAR_POINTS: readonly StarPoint[] = [
  { id: 's1', glyph: '✦', top: '8%', left: '8%', color: '#fff4a3', size: 24, channel: 'a' },
  { id: 's2', glyph: '✧', top: '16%', right: '10%', color: '#ffd0f4', size: 22, channel: 'b' },
  { id: 's3', glyph: '✦', top: '23%', left: '28%', color: '#a9fcff', size: 23, channel: 'c' },
  { id: 's4', glyph: '✧', top: '31%', right: '26%', color: '#beffa6', size: 21, channel: 'a' },
  { id: 's5', glyph: '✦', top: '43%', left: '11%', color: '#f5c7ff', size: 22, channel: 'b' },
  { id: 's6', glyph: '✧', top: '52%', right: '14%', color: '#a8c9ff', size: 24, channel: 'c' },
  { id: 's7', glyph: '✦', top: '61%', left: '36%', color: '#ffe3ae', size: 23, channel: 'a' },
  { id: 's8', glyph: '✧', top: '71%', right: '33%', color: '#c8fcd8', size: 21, channel: 'b' },
  { id: 's9', glyph: '✦', top: '79%', left: '16%', color: '#ffd2ef', size: 24, channel: 'c' },
  { id: 's10', glyph: '✧', top: '88%', right: '11%', color: '#b7e1ff', size: 22, channel: 'a' },
  { id: 's11', glyph: '✦', top: '37%', left: '52%', color: '#fff8bb', size: 20, channel: 'b' },
  { id: 's12', glyph: '✧', top: '67%', right: '46%', color: '#e5c8ff', size: 20, channel: 'c' },
];

const DOT_POINTS: readonly DotPoint[] = [
  { id: 'd1', top: '14%', left: '12%', color: '#ffe86b' },
  { id: 'd2', top: '22%', right: '16%', color: '#ff7ad0' },
  { id: 'd3', top: '36%', left: '22%', color: '#6ee6ff' },
  { id: 'd4', top: '49%', right: '24%', color: '#92ffb4' },
  { id: 'd5', top: '60%', left: '18%', color: '#d48bff' },
  { id: 'd6', top: '72%', right: '14%', color: '#ffd96f' },
  { id: 'd7', top: '83%', left: '36%', color: '#8fb8ff' },
  { id: 'd8', top: '8%', right: '40%', color: '#8effea' },
  { id: 'd9', top: '28%', left: '8%', color: '#ffd1f7' },
  { id: 'd10', top: '41%', right: '8%', color: '#d4ff8f' },
  { id: 'd11', top: '66%', left: '8%', color: '#7ec8ff' },
  { id: 'd12', top: '88%', right: '28%', color: '#ffe0a1' },
  { id: 'd13', top: '12%', left: '44%', color: '#ffc8f0' },
  { id: 'd14', top: '53%', left: '47%', color: '#b7ffea' },
  { id: 'd15', top: '75%', right: '42%', color: '#ffd6ff' },
  { id: 'd16', top: '32%', right: '31%', color: '#fff1ad' },
];

function createTwinkleLoop(value: Animated.Value, durationMs: number) {
  return Animated.loop(
    Animated.sequence([
      Animated.timing(value, {
        toValue: 1,
        duration: durationMs,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(value, {
        toValue: 0,
        duration: durationMs,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    ]),
  );
}

export function RainbowSparkleBackground({ overlayOnly = false, sparkleStyle = 'stars' }: RainbowSparkleBackgroundProps) {
  const orbit = useRef(new Animated.Value(0)).current;
  const drift = useRef(new Animated.Value(0)).current;
  const shimmer = useRef(new Animated.Value(0)).current;
  const twinkleA = useRef(new Animated.Value(0.2)).current;
  const twinkleB = useRef(new Animated.Value(0.6)).current;
  const twinkleC = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    const orbitAnimation = Animated.loop(
      Animated.timing(orbit, {
        toValue: 1,
        duration: 28000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
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

    const twinkleLoopA = createTwinkleLoop(twinkleA, 1500);
    const twinkleLoopB = createTwinkleLoop(twinkleB, 2100);
    const twinkleLoopC = createTwinkleLoop(twinkleC, 2600);

    orbitAnimation.start();
    driftAnimation.start();
    shimmerAnimation.start();
    twinkleLoopA.start();
    twinkleLoopB.start();
    twinkleLoopC.start();

    return () => {
      orbitAnimation.stop();
      driftAnimation.stop();
      shimmerAnimation.stop();
      twinkleLoopA.stop();
      twinkleLoopB.stop();
      twinkleLoopC.stop();
    };
  }, [drift, orbit, shimmer, twinkleA, twinkleB, twinkleC]);

  const orbitSpin = orbit.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  const driftY = drift.interpolate({
    inputRange: [0, 1],
    outputRange: [-8, 8],
  });

  const shimmerOpacity = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [0.5, 1],
  });
  const overlaySparkleOpacity = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [0.72, 1],
  });

  const twinkleOpacityA = twinkleA.interpolate({
    inputRange: [0, 1],
    outputRange: [0.34, 1],
  });
  const twinkleOpacityB = twinkleB.interpolate({
    inputRange: [0, 1],
    outputRange: [0.24, 0.95],
  });
  const twinkleOpacityC = twinkleC.interpolate({
    inputRange: [0, 1],
    outputRange: [0.28, 0.98],
  });

  const getOpacityForChannel = (channel: TwinkleChannel) => {
    if (channel === 'a') return twinkleOpacityA;
    if (channel === 'b') return twinkleOpacityB;
    return twinkleOpacityC;
  };

  const dotOpacity = overlayOnly ? overlaySparkleOpacity : shimmerOpacity;

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

      {sparkleStyle === 'stars'
        ? STAR_POINTS.map((star) => (
            <Animated.Text
              key={star.id}
              style={[
                styles.starText,
                {
                  top: star.top,
                  left: star.left,
                  right: star.right,
                  color: star.color,
                  fontSize: star.size,
                  opacity: getOpacityForChannel(star.channel),
                  transform: [{ translateY: driftY }],
                },
              ]}>
              {star.glyph}
            </Animated.Text>
          ))
        : DOT_POINTS.map((dot) => (
            <Animated.View
              key={dot.id}
              style={[
                styles.sparkleDot,
                {
                  top: dot.top,
                  left: dot.left,
                  right: dot.right,
                  backgroundColor: dot.color,
                  opacity: dotOpacity,
                  transform: [{ translateY: driftY }],
                },
              ]}
            />
          ))}
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
    opacity: 0.3,
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
  sparkleDot: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.96)',
    shadowColor: '#fff',
    shadowOpacity: 1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  starText: {
    position: 'absolute',
    fontWeight: '800',
    textShadowColor: '#ffffff',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
    includeFontPadding: false,
  },
});
