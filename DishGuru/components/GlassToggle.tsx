import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  LayoutChangeEvent,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { theme } from '../lib/theme';

type Props = {
  selectedIndex: number;
  onTabChange: (selectedIndex: number) => void;
  dishesLabel: string;
  restaurantsLabel: string;
  isRTL: boolean;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
};

const TRACK_PADDING = 4;
const INDICATOR_INSET = 6;

export default function GlassToggle({
  selectedIndex,
  onTabChange,
  dishesLabel,
  restaurantsLabel,
  isRTL,
  style,
  intensity = 55,
}: Props) {
  const [trackWidth, setTrackWidth] = useState(0);
  const indicatorX = useRef(new Animated.Value(0)).current;

  const options = useMemo(
    () => [
      { index: 0, label: dishesLabel },
      { index: 1, label: restaurantsLabel },
    ],
    [dishesLabel, restaurantsLabel]
  );

  const usableWidth = Math.max(trackWidth - TRACK_PADDING * 2, 0);
  const segmentWidth = usableWidth > 0 ? usableWidth / 2 : 0;
  const indicatorWidth = segmentWidth > 0 ? Math.max(segmentWidth - INDICATOR_INSET * 2, 0) : 0;

  const targetSlot = isRTL
    ? selectedIndex === 0
      ? 1
      : 0
    : selectedIndex;

  useEffect(() => {
    if (!segmentWidth) return;
    Animated.spring(indicatorX, {
      toValue: TRACK_PADDING + INDICATOR_INSET + segmentWidth * targetSlot,
      useNativeDriver: true,
      damping: 18,
      stiffness: 220,
      mass: 0.8,
    }).start();
  }, [indicatorX, segmentWidth, targetSlot]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;
    if (nextWidth !== trackWidth) {
      setTrackWidth(nextWidth);
      indicatorX.setValue(
        TRACK_PADDING + (nextWidth - TRACK_PADDING * 2) / 2 * targetSlot
      );
    }
  };

  return (
    <View style={[styles.trackWrap, style]} onLayout={handleLayout}>
      <BlurView intensity={intensity} tint="light" style={StyleSheet.absoluteFillObject} />
      <View style={styles.trackTint} />
      {segmentWidth > 0 ? (
        <Animated.View
          style={[
            styles.indicator,
            {
              width: indicatorWidth,
              transform: [{ translateX: indicatorX }],
            },
          ]}
        >
          <BlurView intensity={28} tint="light" style={StyleSheet.absoluteFillObject} />
          <View style={styles.indicatorTint} />
        </Animated.View>
      ) : null}
      <View style={[styles.row, isRTL && styles.rowRtl]}>
        {options.map((option) => {
          const isActive = selectedIndex === option.index;
          return (
            <Pressable
              key={option.index}
              style={styles.segment}
              onPress={() => onTabChange(option.index)}
            >
              <Text style={[styles.label, isActive ? styles.labelActive : styles.labelInactive]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  trackWrap: {
    borderRadius: 30,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)', // crisp outer glass rim replacing the old underline rail
    backgroundColor: 'rgba(255,255,255,0.15)', // low-opacity tint layer over the blur for frosted glass depth
    minHeight: 36,
  },
  trackTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 36,
    position: 'relative',
    zIndex: 2,
  },
  rowRtl: {
    flexDirection: 'row-reverse',
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: 8,
  },
  indicator: {
    position: 'absolute',
    top: TRACK_PADDING,
    bottom: TRACK_PADDING,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.52)', // stronger reflective rim for the selected pill
    backgroundColor: 'rgba(255,250,245,0.82)',
    zIndex: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 14,
    elevation: 2,
  },
  indicatorTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(244,135,34,0.24)',
  },
  label: {
    fontSize: 15,
    letterSpacing: 0.1,
    fontFamily: theme.typography.semibold,
  },
  labelActive: {
    color: theme.colors.accent,
    fontFamily: theme.typography.bold,
  },
  labelInactive: {
    color: 'rgba(75,42,27,0.46)',
  },
});
