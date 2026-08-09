import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable as NativePressable,
  type GestureResponderEvent,
  type PressableProps,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

type GlowPressableProps = PressableProps & {
  glowDurationMs?: number;
  glowStyle?: StyleProp<ViewStyle>;
};

const DEFAULT_GLOW_DURATION_MS = 3000;

export function GlowPressable({
  glowDurationMs = DEFAULT_GLOW_DURATION_MS,
  glowStyle,
  disabled,
  onPressIn,
  style,
  ...rest
}: GlowPressableProps) {
  const [isGlowing, setIsGlowing] = useState(false);
  const glowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearGlowTimer = useCallback(() => {
    if (glowTimerRef.current) {
      clearTimeout(glowTimerRef.current);
      glowTimerRef.current = null;
    }
  }, []);

  const triggerGlow = useCallback(() => {
    if (disabled) return;
    setIsGlowing(true);
    clearGlowTimer();
    glowTimerRef.current = setTimeout(() => {
      setIsGlowing(false);
      glowTimerRef.current = null;
    }, Math.max(450, glowDurationMs));
  }, [clearGlowTimer, disabled, glowDurationMs]);

  useEffect(() => {
    return () => {
      clearGlowTimer();
    };
  }, [clearGlowTimer]);

  function handlePressIn(event: GestureResponderEvent) {
    triggerGlow();
    onPressIn?.(event);
  }

  return (
    <NativePressable
      {...rest}
      disabled={disabled}
      onPressIn={handlePressIn}
      style={(state) => {
        const resolvedStyle = typeof style === 'function' ? style(state) : style;
        return [resolvedStyle, isGlowing ? styles.glowActive : null, isGlowing ? glowStyle : null];
      }}
    />
  );
}

const styles = StyleSheet.create({
  glowActive: {
    shadowColor: '#7dd9ff',
    shadowOpacity: 0.78,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
});
