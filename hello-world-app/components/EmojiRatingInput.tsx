import React from 'react';
import { I18nManager, Pressable, StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { RATING_SVGS, getSelectedEmojiIndex } from '../lib/ratings';

type EmojiRatingInputProps = {
  value: number;
  onChange: (value: number) => void;
  size?: number;
};

const clamp = (value: number) => Math.max(0, Math.min(5, value));

export default function EmojiRatingInput({
  value,
  onChange,
  size = 24,
}: EmojiRatingInputProps) {
  const indices = I18nManager.isRTL ? [4, 3, 2, 1, 0] : [0, 1, 2, 3, 4];
  const selectedIndex = getSelectedEmojiIndex(value);

  return (
    <View style={styles.outer}>
      <View
        style={[
          styles.row,
          I18nManager.isRTL && styles.rowRtl,
          {
          height: size + 8,
          width: 240,
          justifyContent: 'flex-end',
        },
      ]}
    >
      {indices.map((idx) => {
        const xml = RATING_SVGS[idx];
        const opacity = selectedIndex === idx ? 1 : 0.6;
        return (
          <View
            key={`face-${idx}`}
            style={[styles.item, { width: size + 2, height: size + 2 }]}
          >
            <SvgXml
              xml={xml}
              width={size}
              height={size}
              style={{ opacity }}
            />
            <Pressable
              style={[styles.half, styles.halfLeft]}
              onPress={() => onChange(clamp(idx + 0.5))}
            />
            <Pressable
              style={[styles.half, styles.halfRight]}
              onPress={() => onChange(clamp(idx + 1))}
            />
          </View>
        );
      })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    width: '100%',
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
  },
  rowRtl: {
    flexDirection: 'row-reverse',
  },
  item: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  half: {
    position: 'absolute',
    top: 0,
    bottom: 0,
  },
  halfLeft: {
    left: 0,
    width: '50%',
  },
  halfRight: {
    right: 0,
    width: '50%',
  },
});
