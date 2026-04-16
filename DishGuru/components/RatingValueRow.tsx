import { ReactNode } from 'react';
import {
  Animated,
  I18nManager,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { SvgXml } from 'react-native-svg';
import { RATING_SVGS, getSelectedEmojiIndex, scoreToStars } from '../lib/ratings';

type Props = {
  label: string;
  score: number | null | undefined;
  iconSize?: number;
  rowStyle?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  iconsWrapStyle?: any;
  iconStyle?: StyleProp<ViewStyle>;
  iconsContainer?: ReactNode;
};

export default function RatingValueRow({
  label,
  score,
  iconSize = 24,
  rowStyle,
  labelStyle,
  iconsWrapStyle,
  iconStyle,
  iconsContainer,
}: Props) {
  const selectedIndex = getSelectedEmojiIndex(scoreToStars(score));
  const indices = I18nManager.isRTL ? [4, 3, 2, 1, 0] : [0, 1, 2, 3, 4];

  return (
    <View style={rowStyle}>
      <Text style={labelStyle}>{label}</Text>
      {iconsContainer ?? (
        <Animated.View style={iconsWrapStyle}>
          <View style={[styles.starRow, I18nManager.isRTL && styles.starRowRtl]}>
            {indices.map((idx) => (
              <View
                key={`${label}-${idx}`}
                style={iconStyle}
              >
                <SvgXml
                  xml={RATING_SVGS[idx]}
                  width={iconSize}
                  height={iconSize}
                  style={[
                    styles.emojiIcon,
                    { opacity: selectedIndex === idx ? 1 : 0.6 },
                  ]}
                />
              </View>
            ))}
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  starRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
  },
  starRowRtl: {
    flexDirection: 'row-reverse',
  },
  emojiIcon: {
    marginLeft: 2,
    marginRight: -2,
  },
});
