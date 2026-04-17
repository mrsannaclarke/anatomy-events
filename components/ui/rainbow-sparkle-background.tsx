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
  { id: 's1', glyph: '✦', top: '5%', left: '6%', color: '#fff8ca', size: 11, channel: 'a' },
  { id: 's2', glyph: '✧', top: '8%', right: '10%', color: '#ffd8f2', size: 10, channel: 'b' },
  { id: 's3', glyph: '✦', top: '11%', left: '22%', color: '#bff3ff', size: 12, channel: 'c' },
  { id: 's4', glyph: '✧', top: '14%', right: '24%', color: '#dcffcf', size: 10, channel: 'a' },
  { id: 's5', glyph: '✦', top: '18%', left: '12%', color: '#e2d3ff', size: 11, channel: 'b' },
  { id: 's6', glyph: '✧', top: '21%', right: '14%', color: '#ffe7c8', size: 10, channel: 'c' },
  { id: 's7', glyph: '✦', top: '25%', left: '33%', color: '#ffd8f2', size: 12, channel: 'a' },
  { id: 's8', glyph: '✧', top: '28%', right: '36%', color: '#bff3ff', size: 10, channel: 'b' },
  { id: 's9', glyph: '✦', top: '31%', left: '8%', color: '#fff8ca', size: 11, channel: 'c' },
  { id: 's10', glyph: '✧', top: '34%', right: '8%', color: '#dcffcf', size: 10, channel: 'a' },
  { id: 's11', glyph: '✦', top: '38%', left: '26%', color: '#e2d3ff', size: 12, channel: 'b' },
  { id: 's12', glyph: '✧', top: '41%', right: '28%', color: '#ffe7c8', size: 10, channel: 'c' },
  { id: 's13', glyph: '✦', top: '45%', left: '14%', color: '#bff3ff', size: 11, channel: 'a' },
  { id: 's14', glyph: '✧', top: '48%', right: '17%', color: '#ffd8f2', size: 10, channel: 'b' },
  { id: 's15', glyph: '✦', top: '52%', left: '39%', color: '#fff8ca', size: 12, channel: 'c' },
  { id: 's16', glyph: '✧', top: '55%', right: '41%', color: '#dcffcf', size: 10, channel: 'a' },
  { id: 's17', glyph: '✦', top: '59%', left: '7%', color: '#e2d3ff', size: 11, channel: 'b' },
  { id: 's18', glyph: '✧', top: '62%', right: '9%', color: '#ffe7c8', size: 10, channel: 'c' },
  { id: 's19', glyph: '✦', top: '66%', left: '29%', color: '#ffd8f2', size: 12, channel: 'a' },
  { id: 's20', glyph: '✧', top: '69%', right: '31%', color: '#bff3ff', size: 10, channel: 'b' },
  { id: 's21', glyph: '✦', top: '73%', left: '17%', color: '#fff8ca', size: 11, channel: 'c' },
  { id: 's22', glyph: '✧', top: '76%', right: '19%', color: '#dcffcf', size: 10, channel: 'a' },
  { id: 's23', glyph: '✦', top: '80%', left: '43%', color: '#e2d3ff', size: 12, channel: 'b' },
  { id: 's24', glyph: '✧', top: '83%', right: '44%', color: '#ffe7c8', size: 10, channel: 'c' },
  { id: 's25', glyph: '✦', top: '86%', left: '10%', color: '#bff3ff', size: 11, channel: 'a' },
  { id: 's26', glyph: '✧', top: '89%', right: '12%', color: '#ffd8f2', size: 10, channel: 'b' },
  { id: 's27', glyph: '✦', top: '92%', left: '34%', color: '#fff8ca', size: 11, channel: 'c' },
  { id: 's28', glyph: '✧', top: '95%', right: '34%', color: '#dcffcf', size: 10, channel: 'a' },
];

const DOT_POINTS: readonly DotPoint[] = [
  { id: 'd1', top: '10%', left: '12%', color: '#ffe86b' },
  { id: 'd2', top: '16%', right: '18%', color: '#ff7ad0' },
  { id: 'd3', top: '23%', left: '24%', color: '#6ee6ff' },
  { id: 'd4', top: '31%', right: '28%', color: '#92ffb4' },
  { id: 'd5', top: '40%', left: '16%', color: '#d48bff' },
  { id: 'd6', top: '48%', right: '12%', color: '#ffd96f' },
  { id: 'd7', top: '57%', left: '34%', color: '#8fb8ff' },
  { id: 'd8', top: '66%', right: '36%', color: '#8effea' },
  { id: 'd9', top: '74%', left: '10%', color: '#ffd1f7' },
  { id: 'd10', top: '82%', right: '22%', color: '#d4ff8f' },
  { id: 'd11', top: '88%', left: '42%', color: '#7ec8ff' },
  { id: 'd12', top: '93%', right: '10%', color: '#ffe0a1' },
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
        duration: 34000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );

    const driftAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, {
          toValue: 1,
          duration: 12000,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(drift, {
          toValue: 0,
          duration: 12000,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );

    const shimmerAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 2600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          toValue: 0,
          duration: 2600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );

    const twinkleLoopA = createTwinkleLoop(twinkleA, 2100);
    const twinkleLoopB = createTwinkleLoop(twinkleB, 2800);
    const twinkleLoopC = createTwinkleLoop(twinkleC, 3400);

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
    outputRange: [-3, 3],
  });

  const shimmerOpacity = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [0.09, 0.2],
  });
  const overlaySparkleOpacity = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [0.12, 0.24],
  });

  const twinkleOpacityA = twinkleA.interpolate({
    inputRange: [0, 1],
    outputRange: [0.06, 0.22],
  });
  const twinkleOpacityB = twinkleB.interpolate({
    inputRange: [0, 1],
    outputRange: [0.04, 0.18],
  });
  const twinkleOpacityC = twinkleC.interpolate({
    inputRange: [0, 1],
    outputRange: [0.05, 0.2],
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

      {overlayOnly
        ? sparkleStyle === 'stars'
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
            ))
        : null}
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
    opacity: 0.2,
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
    width: 7,
    height: 7,
    borderRadius: 999,
    shadowColor: '#fff',
    shadowOpacity: 0.35,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 0 },
  },
  starText: {
    position: 'absolute',
    fontWeight: '700',
    textShadowColor: 'rgba(255,255,255,0.35)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 4,
    includeFontPadding: false,
  },
});
