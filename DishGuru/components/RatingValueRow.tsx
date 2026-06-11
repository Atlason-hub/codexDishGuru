import React, { ReactNode } from 'react';
import {
  Animated,
  Image,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import {
  RATING_IMAGE_BASELINE_OFFSETS,
  RATING_IMAGE_SCALES,
  RATING_IMAGES,
  getSelectedEmojiIndex,
  scoreToStars,
} from '../lib/ratings';
import { useLocale } from '../lib/locale';

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

function RatingValueRow({
  label,
  score,
  iconSize = 24,
  rowStyle,
  labelStyle,
  iconsWrapStyle,
  iconStyle,
  iconsContainer,
}: Props) {
  const { isRTL } = useLocale();
  const selectedIndex = getSelectedEmojiIndex(scoreToStars(score));
  const indices = [4, 3, 2, 1, 0];

  return (
    <View style={rowStyle}>
      <Text style={labelStyle}>{label}</Text>
      {iconsContainer ?? (
        <Animated.View style={iconsWrapStyle}>
          <View style={[styles.starRow, isRTL && styles.starRowRtl]}>
            {indices.map((idx) => (
              <View
                key={`${label}-${idx}`}
                style={iconStyle}
              >
                <Image
                  source={RATING_IMAGES[idx]}
                  style={[
                    styles.emojiIcon,
                    isRTL ? styles.emojiIconRtl : styles.emojiIconLtr,
                    { width: iconSize, height: iconSize },
                    {
                      transform: [
                        { translateY: iconSize * RATING_IMAGE_BASELINE_OFFSETS[idx] },
                        { scale: RATING_IMAGE_SCALES[idx] },
                      ],
                    },
                    { opacity: selectedIndex === idx ? 1 : 0.38 },
                  ]}
                  resizeMode="contain"
                />
              </View>
            ))}
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const stylePropEqual = (left: unknown, right: unknown) => left === right;

export default React.memo(RatingValueRow, (prev, next) => {
  return (
    prev.label === next.label &&
    prev.score === next.score &&
    prev.iconSize === next.iconSize &&
    stylePropEqual(prev.rowStyle, next.rowStyle) &&
    stylePropEqual(prev.labelStyle, next.labelStyle) &&
    stylePropEqual(prev.iconsWrapStyle, next.iconsWrapStyle) &&
    stylePropEqual(prev.iconStyle, next.iconStyle) &&
    prev.iconsContainer === next.iconsContainer
  );
});

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
    resizeMode: 'contain',
  },
  emojiIconRtl: {
    marginLeft: 2,
    marginRight: -2,
  },
  emojiIconLtr: {
    marginLeft: 0,
    marginRight: 0,
  },
});
