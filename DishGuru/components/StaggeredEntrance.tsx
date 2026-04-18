import { ReactNode } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

type Props = {
  children: ReactNode;
  index: number;
  style?: StyleProp<ViewStyle>;
};

const MAX_STAGGERED_ITEMS = 8;
const STAGGER_MS = 42;
const DURATION_MS = 260;

export default function StaggeredEntrance({ children, index, style }: Props) {
  const delay = Math.min(index, MAX_STAGGERED_ITEMS) * STAGGER_MS;

  return (
    <Animated.View
      style={style}
      entering={FadeInDown.duration(DURATION_MS).delay(delay).withInitialValues({
        opacity: 0,
        transform: [{ translateY: 14 }],
      })}
    >
      {children}
    </Animated.View>
  );
}
