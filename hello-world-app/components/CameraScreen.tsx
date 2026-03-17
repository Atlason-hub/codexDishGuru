import React from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import CameraMask from './CameraMask';
import { useRouter } from 'expo-router';

export default function CameraScreen() {
  const router = useRouter();

  const takePicture = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Camera access needed', 'Please allow camera access to take a photo.');
        return;
      }
      const photo = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.9,
      });
      if (photo.canceled || !photo.assets || !photo.assets[0]?.uri) return;
      const uri = photo.assets[0].uri;
      router.push({
        pathname: '/camera/result',
        params: { photoUri: encodeURIComponent(uri) },
      });
    } catch (err) {
      Alert.alert('Camera error', err instanceof Error ? err.message : 'Failed to take photo');
    }
  };

  return (
    <View style={styles.container}>
      <CameraMask aspectRatio={1} />
      <TouchableOpacity style={styles.captureButton} onPress={takePicture}>
        <Text style={styles.captureText}>TAKE PHOTO</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  captureButton: {
    position: 'absolute',
    bottom: 30,
    alignSelf: 'center',
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 50,
    zIndex: 20,
  },
  captureText: {
    color: 'black',
    fontWeight: 'bold',
  },
});
