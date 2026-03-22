import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text, Alert, ActivityIndicator, Pressable } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';

export default function CameraScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const restaurantId = typeof params.restaurantId === 'string' ? params.restaurantId : '';
  const restaurantName = typeof params.restaurantName === 'string' ? params.restaurantName : '';
  const dishId = typeof params.dishId === 'string' ? params.dishId : '';
  const dishName = typeof params.dishName === 'string' ? params.dishName : '';
  const [opening, setOpening] = useState(true);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const takePicture = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setPermissionDenied(true);
        Alert.alert('Camera access needed', 'Please allow camera access to take a photo.');
        return;
      }
      const photo = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
        base64: true,
      });
      if (photo.canceled || !photo.assets) return;
      if (!photo.assets[0]?.uri) {
        router.back();
        return;
      }
      const uri = photo.assets[0].uri;
      const base64 = photo.assets[0].base64 ?? null;
      router.push({
        pathname: '/camera/details',
        params: {
          photoUri: encodeURIComponent(uri),
          photoBase64: base64 ?? '',
          restaurantId,
          restaurantName,
          dishId,
          dishName,
        },
      });
    } catch (err) {
      Alert.alert('Camera error', err instanceof Error ? err.message : 'Failed to take photo');
    } finally {
      setOpening(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    const open = async () => {
      if (!mounted) return;
      await takePicture();
    };
    open();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" />
      <Text style={styles.loadingText}>
        {permissionDenied ? 'Camera permission required' : 'Opening camera...'}
      </Text>
      {permissionDenied && (
        <Pressable style={styles.retryButton} onPress={takePicture}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#111111',
  },
  retryButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#111111',
  },
  retryText: {
    fontSize: 14,
    color: '#111111',
    fontWeight: '600',
  },
});
