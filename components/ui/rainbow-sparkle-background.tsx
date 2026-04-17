import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { getArtistSparkleColors } from '@/constants/staff-colors';

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
  left: PercentValue;
  color: string;
  size: number;
  channel: TwinkleChannel;
};

type DotPoint = {
  id: string;
  top: PercentValue;
  left: PercentValue;
  color: string;
  size: number;
  channel: TwinkleChannel;
};

const STAR_GLYPHS: readonly string[] = ['✦', '✧'];
const TWINKLE_CHANNELS: readonly TwinkleChannel[] = ['a', 'b', 'c'];

function brightenHex(hex: string, mix = 0.4): string {
  const cleaned = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return '#b7d3ff';

  const r = Number.parseInt(cleaned.slice(0, 2), 16);
  const g = Number.parseInt(cleaned.slice(2, 4), 16);
  const b = Number.parseInt(cleaned.slice(4, 6), 16);

  const nr = Math.round(r + (255 - r) * mix);
  const ng = Math.round(g + (255 - g) * mix);
  const nb = Math.round(b + (255 - b) * mix);

  return `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb.toString(16).padStart(2, '0')}`;
}

const ARTIST_SPARKLE_COLORS = getArtistSparkleColors().map((color) => brightenHex(color, 0.4));
const SPARKLE_COLORS = ARTIST_SPARKLE_COLORS.length > 0 ? ARTIST_SPARKLE_COLORS : ['#c8dcff'];

function createSeededRng(seedStart: number) {
  let seed = seedStart >>> 0;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function toPercent(value: number): PercentValue {
  const clamped = Math.max(0, Math.min(100, value));
  return `${clamped.toFixed(1)}%` as PercentValue;
}

function createStarPoints(count: number): readonly StarPoint[] {
  const rand = createSeededRng(20260417);
  const columns = 12;
  const rows = Math.ceil(count / columns);
  const points: StarPoint[] = [];

  for (let i = 0; i < count; i += 1) {
    const row = Math.floor(i / columns);
    const col = i % columns;
    const baseTop = ((row + 0.5) / rows) * 100;
    const baseLeft = ((col + 0.5) / columns) * 100;

    const top = toPercent(baseTop + (rand() - 0.5) * 6.6);
    const left = toPercent(baseLeft + (rand() - 0.5) * 7.4);
    const color = SPARKLE_COLORS[i % SPARKLE_COLORS.length];
    const sizeRoll = rand();
    const size = sizeRoll < 0.58 ? 8 : sizeRoll < 0.9 ? 9 : 10;

    points.push({
      id: `s${i + 1}`,
      glyph: STAR_GLYPHS[i % STAR_GLYPHS.length],
      top,
      left,
      color,
      size,
      channel: TWINKLE_CHANNELS[i % TWINKLE_CHANNELS.length],
    });
  }

  return points;
}

function createDotPoints(count: number): readonly DotPoint[] {
  const rand = createSeededRng(20261111);
  const columns = 8;
  const rows = Math.ceil(count / columns);
  const points: DotPoint[] = [];

  for (let i = 0; i < count; i += 1) {
    const row = Math.floor(i / columns);
    const col = i % columns;
    const baseTop = ((row + 0.5) / rows) * 100;
    const baseLeft = ((col + 0.5) / columns) * 100;

    const top = toPercent(baseTop + (rand() - 0.5) * 8.4);
    const left = toPercent(baseLeft + (rand() - 0.5) * 8.4);
    const color = SPARKLE_COLORS[i % SPARKLE_COLORS.length];
    const size = rand() < 0.7 ? 4 : 5;

    points.push({
      id: `d${i + 1}`,
      top,
      left,
      color,
      size,
      channel: TWINKLE_CHANNELS[i % TWINKLE_CHANNELS.length],
    });
  }

  return points;
}

const STAR_POINTS = createStarPoints(84);
const DOT_POINTS = createDotPoints(30);

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
        duration: 30000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );

    const driftAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, {
          toValue: 1,
          duration: 8600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(drift, {
          toValue: 0,
          duration: 8600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );

    const shimmerAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );

    const twinkleLoopA = createTwinkleLoop(twinkleA, 980);
    const twinkleLoopB = createTwinkleLoop(twinkleB, 1260);
    const twinkleLoopC = createTwinkleLoop(twinkleC, 1620);

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
    outputRange: [-4, 4],
  });

  const shimmerOpacity = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [0.18, 0.42],
  });
  const overlaySparkleOpacity = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [0.22, 0.52],
  });

  const twinkleOpacityA = twinkleA.interpolate({
    inputRange: [0, 1],
    outputRange: [0.16, 0.48],
  });
  const twinkleOpacityB = twinkleB.interpolate({
    inputRange: [0, 1],
    outputRange: [0.12, 0.42],
  });
  const twinkleOpacityC = twinkleC.interpolate({
    inputRange: [0, 1],
    outputRange: [0.14, 0.45],
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
                    width: dot.size,
                    height: dot.size,
                    backgroundColor: dot.color,
                    shadowColor: dot.color,
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
    opacity: 0.24,
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
    borderRadius: 999,
    shadowOpacity: 0.85,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 0 },
  },
  starText: {
    position: 'absolute',
    fontWeight: '700',
    textShadowColor: 'rgba(255,255,255,0.6)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
    includeFontPadding: false,
  },
});
