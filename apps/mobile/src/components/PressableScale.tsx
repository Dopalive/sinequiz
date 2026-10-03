import * as Haptics from "expo-haptics";
import { Platform, Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { useAudio } from "@/lib/audio";
import { pop, snap } from "@/lib/motion";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface Props extends Omit<PressableProps, "style"> {
  style?: StyleProp<ViewStyle>;
  /** Scale while pressed. Buttons 0.96, cards 0.975. */
  pressScale?: number;
  haptic?: boolean;
}

/**
 * Press feedback (Playful): anticipation squash on press-in with a stiff spring, release overshoots ~4%
 * and settles. Secondary layer: opacity dips so the press reads even on flat surfaces.
 */
export function PressableScale({ style, pressScale = 0.96, haptic = true, onPressIn, onPressOut, disabled, ...rest }: Props) {
  const { play } = useAudio();
  const scale = useSharedValue(1);
  const dim = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], opacity: dim.value }));

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      style={[style, animated]}
      onPressIn={(e) => {
        scale.value = snap(pressScale);
        dim.value = snap(0.92);
        if (haptic && Platform.OS !== "web") void Haptics.selectionAsync();
        if (!disabled) play("tap");
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = pop(1);
        dim.value = snap(1);
        onPressOut?.(e);
      }}
    />
  );
}
