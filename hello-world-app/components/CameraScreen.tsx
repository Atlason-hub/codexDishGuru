import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';

type Size = { width: number; height: number };
type Rect = { x: number; y: number; width: number; height: number };

const VIEWFINDER_RATIO = 4 / 3;

export default function CameraScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const restaurantId = typeof params.restaurantId === 'string' ? params.restaurantId : '';
  const restaurantName = typeof params.restaurantName === 'string' ? params.restaurantName : '';
  const dishId = typeof params.dishId === 'string' ? params.dishId : '';
  const dishName = typeof params.dishName === 'string' ? params.dishName : '';
  const editId = typeof params.editId === 'string' ? params.editId : '';
  const returnTo = typeof params.returnTo === 'string' ? params.returnTo : '';
  const returnScroll = typeof params.scrollY === 'string' ? params.scrollY : '';

  const cameraRef = useRef<CameraView | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [previewSize, setPreviewSize] = useState<Size>({ width: 0, height: 0 });
  const [isCapturing, setIsCapturing] = useState(false);
  const [flashEnabled, setFlashEnabled] = useState(false);

  const viewfinder = useMemo<Rect>(() => {
    const { width, height } = previewSize;
    if (!width || !height) return { x: 0, y: 0, width: 0, height: 0 };
    const maxWidth = width * 0.9;
    const maxHeight = height * 0.7;
    let viewWidth = maxWidth;
    let viewHeight = viewWidth / VIEWFINDER_RATIO;
    if (viewHeight > maxHeight) {
      viewHeight = maxHeight;
      viewWidth = viewHeight * VIEWFINDER_RATIO;
    }
    const x = (width - viewWidth) / 2;
    const y = (height - viewHeight) / 2;
    return { x, y, width: viewWidth, height: viewHeight };
  }, [previewSize]);

  const ensurePermission = async () => {
    if (permission?.granted) return true;
    const response = await requestPermission();
    return response.granted;
  };

  const cropToViewfinder = async (photo: { uri: string; width: number; height: number }) => {
    const { width: previewW, height: previewH } = previewSize;
    if (!previewW || !previewH) return null;
    const { width: imgW, height: imgH } = photo;
    const scale = Math.min(previewW / imgW, previewH / imgH);
    const displayW = imgW * scale;
    const displayH = imgH * scale;
    const offsetX = Math.max(0, (previewW - displayW) / 2);
    const offsetY = Math.max(0, (previewH - displayH) / 2);

    let rawX = (viewfinder.x - offsetX) / scale;
    let rawY = (viewfinder.y - offsetY) / scale;
    let rawW = viewfinder.width / scale;
    let rawH = viewfinder.height / scale;

    const expand = 1.05;
    const centerX = rawX + rawW / 2;
    const centerY = rawY + rawH / 2;
    rawW *= expand;
    rawH *= expand;
    rawX = centerX - rawW / 2;
    rawY = centerY - rawH / 2;

    let cropX = Math.max(0, Math.floor(rawX));
    let cropY = Math.max(0, Math.floor(rawY));
    let cropW = Math.min(imgW - cropX, Math.floor(rawW));
    let cropH = Math.min(imgH - cropY, Math.floor(rawH));

    const enforceH = Math.min(imgH - cropY, Math.round(cropW * (3 / 4)));
    cropH = Math.min(cropH, enforceH);
    const enforceW = Math.min(imgW - cropX, Math.round(cropH * (4 / 3)));
    cropW = Math.min(cropW, enforceW);

    if (cropW < 1 || cropH < 1) {
      return null;
    }

    const result = await ImageManipulator.manipulateAsync(
      photo.uri,
      [
        {
          crop: {
            originX: cropX,
            originY: cropY,
            width: cropW,
            height: cropH,
          },
        },
        { resize: { width: 1200, height: 900 } },
      ],
      { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );

    return result;
  };

  const handleCapture = async () => {
    if (isCapturing) return;
    const ok = await ensurePermission();
    if (!ok) return;
    if (!cameraRef.current) return;
    try {
      setIsCapturing(true);
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        skipProcessing: false,
      });
      const cropped = await cropToViewfinder({
        uri: photo.uri,
        width: photo.width ?? 0,
        height: photo.height ?? 0,
      });
      if (!cropped?.uri) return;
      if (editId) {
        router.push({
          pathname: '/edit-dish',
          params: {
            id: editId,
            photoUri: encodeURIComponent(cropped.uri),
            photoBase64: cropped.base64 ?? '',
            returnTo,
            scrollY: returnScroll,
          },
        });
      } else {
        router.push({
          pathname: '/camera/details',
          params: {
            photoUri: encodeURIComponent(cropped.uri),
            photoBase64: cropped.base64 ?? '',
            restaurantId,
            restaurantName,
            dishId,
            dishName,
          },
        });
      }
    } finally {
      setIsCapturing(false);
    }
  };

  if (!permission) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.centered}>
        <Text style={styles.permissionText}>נדרש אישור מצלמה</Text>
        <Pressable style={styles.permissionButton} onPress={ensurePermission}>
          <Text style={styles.permissionButtonText}>אפשר מצלמה</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View
        style={styles.cameraWrap}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          if (width !== previewSize.width || height !== previewSize.height) {
            setPreviewSize({ width, height });
          }
        }}
      >
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing="back"
          flash={flashEnabled ? 'on' : 'off'}
          ratio="4:3"
        />
        {viewfinder.width > 0 ? (
          <View style={styles.overlay} pointerEvents="none">
            <View style={[styles.mask, { height: viewfinder.y }]} />
            <View style={styles.middleRow}>
              <View style={[styles.mask, { width: viewfinder.x }]} />
              <View
                style={[
                  styles.viewfinder,
                  { width: viewfinder.width, height: viewfinder.height },
                ]}
              />
              <View style={[styles.mask, { width: viewfinder.x }]} />
            </View>
            <View style={[styles.mask, { flex: 1 }]} />
          </View>
        ) : null}
      </View>
      <View style={styles.topBar}>
        <Pressable style={styles.topButton} onPress={() => router.back()}>
          <Ionicons name="close" size={20} color="#ffffff" />
          <Text style={styles.topButtonText}>ביטול</Text>
        </Pressable>
        <Pressable
          style={styles.topButton}
          onPress={() => setFlashEnabled((prev) => !prev)}
        >
          <Ionicons
            name={flashEnabled ? 'flash' : 'flash-off'}
            size={20}
            color="#ffffff"
          />
          <Text style={styles.topButtonText}>{flashEnabled ? 'פלאש פעיל' : 'פלאש כבוי'}</Text>
        </Pressable>
      </View>
      <View style={styles.controls}>
        <Pressable
          style={styles.captureButton}
          onPress={handleCapture}
          disabled={isCapturing}
        >
          <View style={styles.captureInner} />
        </Pressable>
      </View>
      {isCapturing ? (
        <View style={styles.processingOverlay}>
          <ActivityIndicator size="large" color="#ffffff" />
          <Text style={styles.processingText}>מעבד תמונה...</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  cameraWrap: {
    flex: 1,
    backgroundColor: '#000000',
  },
  camera: {
    ...StyleSheet.absoluteFillObject,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-start',
  },
  middleRow: {
    flexDirection: 'row',
  },
  mask: {
    backgroundColor: 'rgba(0,0,0,0.8)',
    flex: 1,
  },
  viewfinder: {
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
    borderRadius: 16,
  },
  controls: {
    position: 'absolute',
    bottom: 32,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  topBar: {
    position: 'absolute',
    top: 32,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  topButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 999,
  },
  topButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  captureButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#ffffff',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    gap: 12,
  },
  permissionText: {
    fontSize: 14,
    color: '#111111',
  },
  permissionButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#111111',
  },
  permissionButtonText: {
    fontSize: 14,
    color: '#111111',
    fontWeight: '600',
  },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  processingText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
});
