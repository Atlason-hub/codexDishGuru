import { ReactNode } from 'react';
import { I18nManager, StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { theme } from '../lib/theme';
import { RATING_SVGS, getSelectedEmojiIndex, scoreToStars } from '../lib/ratings';

type Props = {
  label: string;
  score: number | null | undefined;
  iconSize?: number;
  rowStyle?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  iconsWrapStyle?: StyleProp<ViewStyle>;
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
        <View style={iconsWrapStyle}>
          <View style={[styles.starRow, I18nManager.isRTL && styles.starRowRtl]}>
            {indices.map((idx) => (
              <SvgXml
                key={`${label}-${idx}`}
                xml={RATING_SVGS[idx]}
                width={iconSize}
                height={iconSize}
                style={[
                  styles.emojiIcon,
                  { opacity: selectedIndex === idx ? 1 : 0.6 },
                  iconStyle,
                ]}
              />
            ))}
          </View>
        </View>
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
