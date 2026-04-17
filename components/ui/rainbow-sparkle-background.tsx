import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

type RainbowSparkleBackgroundProps = {
  overlayOnly?: boolean;
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

export function RainbowSparkleBackground({ overlayOnly = false }: RainbowSparkleBackgroundProps) {
  const orbit = useRef(new Animated.Value(0)).current;
  const drift = useRef(new Animated.Value(0)).current;
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

    const twinkleLoopA = createTwinkleLoop(twinkleA, 1500);
    const twinkleLoopB = createTwinkleLoop(twinkleB, 2100);
    const twinkleLoopC = createTwinkleLoop(twinkleC, 2600);

    orbitAnimation.start();
    driftAnimation.start();
    twinkleLoopA.start();
    twinkleLoopB.start();
    twinkleLoopC.start();

    return () => {
      orbitAnimation.stop();
      driftAnimation.stop();
      twinkleLoopA.stop();
      twinkleLoopB.stop();
      twinkleLoopC.stop();
    };
  }, [drift, orbit, twinkleA, twinkleB, twinkleC]);

  const orbitSpin = orbit.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  const driftY = drift.interpolate({
    inputRange: [0, 1],
    outputRange: [-8, 8],
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

      {STAR_POINTS.map((star) => (
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
  starText: {
    position: 'absolute',
    fontWeight: '800',
    textShadowColor: '#ffffff',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
    includeFontPadding: false,
  },
});
