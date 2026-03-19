import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text, Alert, ActivityIndicator, Pressable } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';

export default function CameraScreen() {
  const router = useRouter();
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
        params: { photoUri: encodeURIComponent(uri), photoBase64: base64 ?? '' },
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
