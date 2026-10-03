import { useEffect, useMemo } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { colors } from "@/theme";

const PALETTE = [colors.gold, colors.accent, colors.success, "#FF8FA3", "#7FD8FF", "#FFFFFF"];

interface Piece {
  x: number;
  drift: number;
  size: number;
  color: string;
  delay: number;
  spin: number;
  fall: number;
}

/**
 * Ambient celebration burst (Surprise → radial, ease-out-expo). Pieces launch upward with a small
 * drift, then fall with gravity-ish easing while spinning and fading. Pointer-events pass through.
 */
export function Confetti({ count = 28, trigger }: { count?: number; trigger: number }) {
  const { width } = useWindowDimensions();
  const pieces = useMemo<Piece[]>(() => {
    // Seeded by `trigger` so a re-fire produces a fresh scatter.
    let seed = 1234 + trigger * 97;
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    return Array.from({ length: count }, () => ({
      x: rnd() * width,
      drift: (rnd() - 0.5) * 140,
      size: 6 + rnd() * 8,
      color: PALETTE[Math.floor(rnd() * PALETTE.length)]!,
      delay: rnd() * 180,
      spin: (rnd() - 0.5) * 900,
      fall: 260 + rnd() * 220,
    }));
  }, [count, width, trigger]);

  return (
    <View pointerEvents="none" style={styles.layer}>
      {pieces.map((p, i) => (
        <PieceView key={`${trigger}-${i}`} piece={p} />
      ))}
    </View>
  );
}

function PieceView({ piece }: { piece: Piece }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = 0;
    t.value = withDelay(piece.delay, withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) }));
  }, [piece, t]);

  const style = useAnimatedStyle(() => {
    const up = interpolate(t.value, [0, 0.3, 1], [0, -piece.fall * 0.55, piece.fall]);
    return {
      opacity: interpolate(t.value, [0, 0.1, 0.75, 1], [0, 1, 1, 0]),
      transform: [
        { translateX: piece.x + piece.drift * t.value },
        { translateY: up },
        { rotate: `${piece.spin * t.value}deg` },
        { scale: interpolate(t.value, [0, 0.2, 1], [0.4, 1.1, 0.9]) },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        styles.piece,
        { width: piece.size, height: piece.size * 0.6, backgroundColor: piece.color, borderRadius: piece.size / 4 },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  layer: { position: "absolute", left: 0, right: 0, top: "28%", height: 1, zIndex: 50 },
  piece: { position: "absolute", top: 0, left: 0 },
});
