import { useEffect, useRef, useState } from 'react';
import { Alert, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import * as ImagePicker from 'expo-image-picker';
import { Buffer } from 'buffer';
import { Image } from 'expo-image';
import { cacheAvatar, fetchAvatarFromAuth, loadCachedAvatar } from '../lib/avatar';
import { useRouter } from 'expo-router';
import Slider from '@react-native-community/slider';
import * as ImageManipulator from 'expo-image-manipulator';

export default function AccountScreen() {
  const FRAME_SIZE = 180;
  const MIN_ZOOM = 1;
  const MAX_ZOOM = 3;

  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [tempAvatarUrl, setTempAvatarUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingAsset, setPendingAsset] = useState<{
    uri: string;
    width: number;
    height: number;
  } | null>(null);
  const [avatarOffset, setAvatarOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const dragStart = useRef({ x: 0, y: 0 });
  const zoomStart = useRef(MIN_ZOOM);
  const scaleToCover = pendingAsset
    ? Math.max(FRAME_SIZE / pendingAsset.width, FRAME_SIZE / pendingAsset.height)
    : 1;
  const scaleFactor = scaleToCover * zoom;
  const displayWidth = pendingAsset ? pendingAsset.width * scaleFactor : FRAME_SIZE;
  const displayHeight = pendingAsset ? pendingAsset.height * scaleFactor : FRAME_SIZE;
  const maxOffsetX = Math.max(0, (displayWidth - FRAME_SIZE) / 2);
  const maxOffsetY = Math.max(0, (displayHeight - FRAME_SIZE) / 2);

  const clampOffset = (value: { x: number; y: number }) => ({
    x: Math.min(maxOffsetX, Math.max(-maxOffsetX, value.x)),
    y: Math.min(maxOffsetY, Math.max(-maxOffsetY, value.y)),
  });

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => Boolean(tempAvatarUrl),
    onMoveShouldSetPanResponder: () => Boolean(tempAvatarUrl),
    onStartShouldSetPanResponderCapture: () => Boolean(tempAvatarUrl),
    onMoveShouldSetPanResponderCapture: () => Boolean(tempAvatarUrl),
    onPanResponderGrant: () => {
      dragStart.current = avatarOffset;
      zoomStart.current = zoom;
    },
    onPanResponderMove: (_evt, gesture) => {
      const next = {
        x: dragStart.current.x + gesture.dx,
        y: dragStart.current.y + gesture.dy,
      };
      setAvatarOffset(clampOffset(next));
    },
    onPanResponderRelease: (_evt, gesture) => {
      const next = {
        x: dragStart.current.x + gesture.dx,
        y: dragStart.current.y + gesture.dy,
      };
      setAvatarOffset(clampOffset(next));
    },
    onPanResponderTerminationRequest: () => false,
  });

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setEmail(data.session?.user?.email ?? null);
      const cached = await loadCachedAvatar();
      if (cached) setAvatarUrl(cached);
      const metaAvatar = await fetchAvatarFromAuth();
      if (metaAvatar) {
        setAvatarUrl(metaAvatar);
        await cacheAvatar(metaAvatar);
      }
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
      const metaAvatar = (session?.user?.user_metadata as any)?.avatar_url ?? null;
      if (metaAvatar) {
        setAvatarUrl(metaAvatar);
        cacheAvatar(metaAvatar);
      }
    });
    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Pressable style={styles.backButton} onPress={() => router.replace('/')}>
          <Ionicons name="chevron-back" size={18} color="#111111" />
        </Pressable>
        <Text style={styles.title}>החשבון שלי</Text>
      </View>
      <View style={styles.emailRow}>
        <Text style={styles.emailValue}>{email ?? ''}</Text>
        <Text style={styles.emailLabel}>אימייל</Text>
      </View>
      <View style={styles.divider} />
      <View style={styles.avatarCircle} {...panResponder.panHandlers}>
        {tempAvatarUrl ? (
          <Image
            source={{ uri: tempAvatarUrl }}
            style={[
              styles.tempAvatarImage,
              { width: displayWidth, height: displayHeight },
              { transform: [{ translateX: avatarOffset.x }, { translateY: avatarOffset.y }] },
            ]}
            contentFit="cover"
            pointerEvents="none"
          />
        ) : avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
        ) : (
          <Ionicons name="person" size={44} color="#ffffff" />
        )}
      </View>
      {tempAvatarUrl ? (
        <View style={styles.zoomRow}>
          <Ionicons name="remove" size={16} color="#6B7280" />
          <Slider
            style={styles.zoomSlider}
            minimumValue={MIN_ZOOM}
            maximumValue={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onValueChange={(value) => {
              setZoom(value);
              setAvatarOffset((prev) => clampOffset(prev));
            }}
            minimumTrackTintColor="#111111"
            maximumTrackTintColor="#E5E7EB"
          />
          <Ionicons name="add" size={16} color="#6B7280" />
        </View>
      ) : null}
      <View style={styles.actionsRow}>
        <Pressable
          style={styles.actionButton}
          onPress={async () => {
            if (saving) return;
            try {
              const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
              if (!permission.granted) {
                Alert.alert('Permission needed', 'Please allow photo library access.');
                return;
              }
              const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                quality: 0.7,
              });
              if (result.canceled || !result.assets) return;
              const asset = result.assets[0];
              if (!asset?.uri || !asset?.width || !asset?.height) return;
              setPendingAsset({ uri: asset.uri, width: asset.width, height: asset.height });
              setTempAvatarUrl(asset.uri);
              setAvatarOffset({ x: 0, y: 0 });
              setZoom(MIN_ZOOM);
              setSaving(true);
              const { data } = await supabase.auth.getSession();
              const userId = data.session?.user?.id;
              if (!userId) return;
              // do not upload until user presses Save
            } catch (error) {
              console.log('[AVATAR_UPLOAD_ERROR]:', error);
              Alert.alert('Upload failed', error instanceof Error ? error.message : 'Upload failed');
            } finally {
              setSaving(false);
            }
          }}
        >
          <Ionicons name="image-outline" size={22} color="#6B7280" />
        </Pressable>
        <Pressable
          style={styles.actionButton}
          onPress={async () => {
            if (saving) return;
            try {
              const permission = await ImagePicker.requestCameraPermissionsAsync();
              if (!permission.granted) {
                Alert.alert('Permission needed', 'Please allow camera access.');
                return;
              }
              const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                quality: 0.7,
                cameraType: ImagePicker.CameraType.front,
              });
              if (result.canceled || !result.assets) return;
              const asset = result.assets[0];
              if (!asset?.uri || !asset?.width || !asset?.height) return;
              setPendingAsset({ uri: asset.uri, width: asset.width, height: asset.height });
              setTempAvatarUrl(asset.uri);
              setAvatarOffset({ x: 0, y: 0 });
              setZoom(MIN_ZOOM);
              setSaving(true);
              const { data } = await supabase.auth.getSession();
              const userId = data.session?.user?.id;
              if (!userId) return;
              // do not upload until user presses Save
            } catch (error) {
              console.log('[AVATAR_CAMERA_ERROR]:', error);
              Alert.alert('Camera upload failed', error instanceof Error ? error.message : 'Upload failed');
            } finally {
              setSaving(false);
            }
          }}
        >
          <Ionicons name="camera-outline" size={22} color="#6B7280" />
        </Pressable>
      </View>
      <Pressable
        style={[styles.saveButton, (!pendingAsset || saving) && styles.saveButtonDisabled]}
        onPress={async () => {
          if (!pendingAsset || saving) return;
          try {
            setSaving(true);
            const { data } = await supabase.auth.getSession();
            const userId = data.session?.user?.id;
            if (!userId) return;
            const imageLeft = FRAME_SIZE / 2 - displayWidth / 2 + avatarOffset.x;
            const imageTop = FRAME_SIZE / 2 - displayHeight / 2 + avatarOffset.y;
            const cropX = Math.max(0, (0 - imageLeft) / scaleFactor);
            const cropY = Math.max(0, (0 - imageTop) / scaleFactor);
            const cropSize = FRAME_SIZE / scaleFactor;
            const cropWidth = Math.min(pendingAsset.width - cropX, cropSize);
            const cropHeight = Math.min(pendingAsset.height - cropY, cropSize);

            const cropped = await ImageManipulator.manipulateAsync(
              pendingAsset.uri,
              [
                {
                  crop: {
                    originX: cropX,
                    originY: cropY,
                    width: cropWidth,
                    height: cropHeight,
                  },
                },
                { resize: { width: 512, height: 512 } },
              ],
              { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG, base64: true }
            );
            if (!cropped.base64) {
              throw new Error('Failed to crop image');
            }

            const filePath = `${userId}/${Date.now()}.jpg`;
            const binary = globalThis.atob
              ? globalThis.atob(cropped.base64)
              : Buffer.from(cropped.base64, 'base64').toString('binary');
            const len = binary.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i += 1) bytes[i] = binary.charCodeAt(i);
            const upload = await supabase.storage.from('avatars').upload(filePath, bytes, {
              contentType: 'image/jpeg',
              upsert: true,
            });
            if (upload.error) throw upload.error;
            const { data: publicData } = supabase.storage.from('avatars').getPublicUrl(filePath);
            const url = publicData?.publicUrl ?? null;
              if (url) {
                await supabase.auth.updateUser({ data: { avatar_url: url } });
                setAvatarUrl(url);
                await cacheAvatar(url);
                setPendingAsset(null);
                setTempAvatarUrl(null);
                setAvatarOffset({ x: 0, y: 0 });
                setZoom(MIN_ZOOM);
                router.replace('/');
              }
          } catch (error) {
            console.log('[AVATAR_SAVE_ERROR]:', error);
            Alert.alert('Save failed', error instanceof Error ? error.message : 'Save failed');
          } finally {
            setSaving(false);
          }
        }}
      >
        <Text style={styles.saveButtonText}>שמור</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingHorizontal: 20,
    paddingTop: 12,
    alignItems: 'center',
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111111',
  },
  headerRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  backButton: {
    height: 32,
    width: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  emailRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  emailValue: {
    fontSize: 18,
    color: '#111111',
    flex: 1,
    textAlign: 'left',
  },
  emailLabel: {
    fontSize: 16,
    color: '#6B7280',
    marginLeft: 12,
  },
  divider: {
    width: '100%',
    height: 1,
    backgroundColor: '#E5E7EB',
    marginTop: 6,
    marginBottom: 28,
  },
  avatarCircle: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#F87171',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '140%',
    height: '140%',
  },
  tempAvatarImage: {
    width: 360,
    height: 360,
  },
  zoomRow: {
    marginTop: 14,
    width: '85%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  zoomSlider: {
    flex: 1,
    height: 30,
  },
  actionsRow: {
    marginTop: 32,
    flexDirection: 'row',
    gap: 28,
  },
  saveButton: {
    marginTop: 18,
    paddingVertical: 10,
    paddingHorizontal: 28,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  saveButtonDisabled: {
    opacity: 0.4,
  },
  saveButtonText: {
    fontSize: 16,
    color: '#111111',
    fontWeight: '600',
  },
  actionButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
