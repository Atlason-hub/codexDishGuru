import { ReactNode } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

type Props = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export default function CrossfadeView({ children, style }: Props) {
  return (
    <Animated.View
      style={style}
      entering={FadeIn.duration(240)}
      exiting={FadeOut.duration(180)}
    >
      {children}
    </Animated.View>
  );
}
