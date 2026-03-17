import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';

const { width: windowWidth, height: windowHeight } = Dimensions.get('window');

type Props = {
  aspectRatio?: number;
};

export default function CameraMask({ aspectRatio = 1 }: Props) {
  const maskWidth = windowWidth * 0.8;
  const maskHeight = maskWidth / aspectRatio;
  const verticalPadding = (windowHeight - maskHeight) / 2;

  return (
    <View style={styles.maskContainer} pointerEvents="none">
      <View style={[styles.maskTop, { height: verticalPadding }]} />
      <View style={styles.maskMiddle}>
        <View style={styles.maskSide} />
        <View style={[styles.maskCutout, { width: maskWidth, height: maskHeight }]} />
        <View style={styles.maskSide} />
      </View>
      <View style={[styles.maskBottom, { height: verticalPadding }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  maskContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: windowWidth,
    height: windowHeight,
    zIndex: 10,
  },
  maskTop: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    width: '100%',
  },
  maskMiddle: {
    flexDirection: 'row',
  },
  maskSide: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  maskCutout: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: 'white',
  },
  maskBottom: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    width: '100%',
  },
});
