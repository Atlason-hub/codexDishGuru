import React from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { RATING_IMAGES, getSelectedEmojiIndex } from '../lib/ratings';
import { useLocale } from '../lib/locale';

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
  const { isRTL } = useLocale();
  const indices = [4, 3, 2, 1, 0];
  const selectedIndex = getSelectedEmojiIndex(value);

  return (
    <View style={styles.outer}>
      <View
        style={[
          styles.row,
          isRTL && styles.rowRtl,
          {
            height: size + 8,
            justifyContent: isRTL ? 'flex-end' : 'flex-start',
          },
        ]}
      >
      {indices.map((idx) => {
        const opacity = selectedIndex === idx ? 1 : 0.38;
        return (
          <View
            key={`face-${idx}`}
            style={[styles.item, { width: size + 2, height: size + 2 }]}
          >
            <Image
              source={RATING_IMAGES[idx]}
              style={{ width: size, height: size, opacity }}
              resizeMode="contain"
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
