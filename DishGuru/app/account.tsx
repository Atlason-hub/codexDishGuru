import { useEffect, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import * as ImagePicker from 'expo-image-picker';
import { Buffer } from 'buffer';
import { Image } from 'expo-image';
import { cacheAvatar, fetchAvatarFromAuth, loadCachedAvatar } from '../lib/avatar';
import { useRouter } from 'expo-router';
import Slider from '@react-native-community/slider';
import * as ImageManipulator from 'expo-image-manipulator';
import { theme } from '../lib/theme';
import { showAppAlert, showAppDialog } from '../lib/appDialog';

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === 'string' && maybeMessage.trim()) return maybeMessage;
    try {
      return JSON.stringify(error);
    } catch {
      return 'אירעה שגיאה לא צפויה.';
    }
  }
  if (typeof error === 'string' && error.trim()) return error;
  return 'אירעה שגיאה לא צפויה.';
};

export default function AccountScreen() {
  const FRAME_SIZE = 180;
  const MIN_ZOOM = 1.28;
  const MAX_ZOOM = 5;

  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [tempAvatarUrl, setTempAvatarUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
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
  const extraDragAllowance = pendingAsset ? FRAME_SIZE * 0.55 : 0;
  const maxOffsetX = Math.max(FRAME_SIZE * 0.35, (displayWidth - FRAME_SIZE) / 2 + extraDragAllowance);
  const maxOffsetY = Math.max(FRAME_SIZE * 0.35, (displayHeight - FRAME_SIZE) / 2 + extraDragAllowance);

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
      const cached = await loadCachedAvatar(data.session?.user?.id ?? null);
      if (cached) setAvatarUrl(cached);
      const metaAvatar = await fetchAvatarFromAuth();
      if (metaAvatar) {
        setAvatarUrl(metaAvatar);
        await cacheAvatar(data.session?.user?.id ?? null, metaAvatar);
      }
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
      const metaAvatar = (session?.user?.user_metadata as any)?.avatar_url ?? null;
      if (metaAvatar) {
        setAvatarUrl(metaAvatar);
        cacheAvatar(session?.user?.id ?? null, metaAvatar);
      } else {
        setAvatarUrl(null);
        cacheAvatar(session?.user?.id ?? null, null);
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
        <Pressable
          style={styles.backButton}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        >
          <Ionicons name="chevron-back" size={18} color={theme.colors.ink} />
        </Pressable>
        <Text style={styles.title}>החשבון שלי</Text>
      </View>

      <View style={styles.profileCard}>
        <View style={styles.emailSection}>
          <Text style={styles.emailLabel}>אימייל</Text>
          <Text style={styles.emailValue}>{email ?? ''}</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.avatarSection}>
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
              <Ionicons name="remove" size={16} color={theme.colors.textMuted} />
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
                minimumTrackTintColor={theme.colors.accent}
                maximumTrackTintColor={theme.colors.border}
              />
              <Ionicons name="add" size={16} color={theme.colors.textMuted} />
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
                    showAppAlert('נדרש אישור', 'אנא אפשר גישה לגלריה.');
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
                } catch (error) {
                  showAppAlert('העלאה נכשלה', error instanceof Error ? error.message : 'העלאה נכשלה');
                } finally {
                  setSaving(false);
                }
              }}
            >
              <Ionicons name="image-outline" size={22} color={theme.colors.textMuted} />
            </Pressable>

            <Pressable
              style={styles.actionButton}
              onPress={async () => {
                if (saving) return;
                try {
                  const permission = await ImagePicker.requestCameraPermissionsAsync();
                  if (!permission.granted) {
                    showAppAlert('נדרש אישור', 'אנא אפשר גישה למצלמה.');
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
                } catch (error) {
                  showAppAlert('צילום נכשל', error instanceof Error ? error.message : 'העלאה נכשלה');
                } finally {
                  setSaving(false);
                }
              }}
            >
              <Ionicons name="camera-outline" size={22} color={theme.colors.textMuted} />
            </Pressable>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.saveButton,
              pressed && !saving && pendingAsset && styles.saveButtonPressed,
              (!pendingAsset || saving) && styles.saveButtonDisabled,
            ]}
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
                  throw new Error('כשל בעיבוד התמונה');
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
                  const { data: sessionData } = await supabase.auth.getSession();
                  const currentUserId = sessionData.session?.user?.id ?? null;
                  if (currentUserId) {
                    const { error: profileError } = await supabase
                      .from('AppUsers')
                      .update({ avatar_url: url })
                      .eq('user_id', currentUserId);
                    if (profileError) {
                      throw profileError;
                    }
                  }
                  setAvatarUrl(url);
                  await cacheAvatar(userId, url);
                  setPendingAsset(null);
                  setTempAvatarUrl(null);
                  setAvatarOffset({ x: 0, y: 0 });
                  setZoom(MIN_ZOOM);
                  router.replace('/');
                }
              } catch (error) {
                showAppAlert('שמירה נכשלה', error instanceof Error ? error.message : 'שמירה נכשלה');
              } finally {
                setSaving(false);
              }
            }}
          >
            <Text style={styles.saveButtonText}>שמור</Text>
          </Pressable>
        </View>
      </View>

      <Pressable
        style={({ pressed }) => [
          styles.deleteAccountButton,
          (pressed || deletingAccount) && styles.deleteAccountButtonPressed,
        ]}
        onPress={() => {
          if (saving || deletingAccount) return;
          showAppDialog({
            title: 'מחיקת חשבון',
            message: 'האם למחוק את החשבון וכל המנות שהעלית?',
            actions: [
              { text: 'ביטול', style: 'cancel' },
              {
                text: 'מחק חשבון',
                style: 'destructive',
                onPress: async () => {
                  try {
                    setDeletingAccount(true);
                    const { data } = await supabase.auth.getSession();
                    const userId = data.session?.user?.id ?? null;
                    if (!userId) {
                      showAppAlert('אין הרשאה', 'יש להתחבר מחדש כדי למחוק את החשבון.');
                      return;
                    }

                    const { error } = await supabase.rpc('delete_my_account');
                    if (error) throw error;

                    await cacheAvatar(userId, null);
                    setAvatarUrl(null);
                    setTempAvatarUrl(null);
                    setPendingAsset(null);
                    await supabase.auth.signOut({ scope: 'local' });
                    router.replace('/');
                  } catch (error) {
                    showAppAlert(
                      'מחיקה נכשלה',
                      getErrorMessage(error)
                    );
                  } finally {
                    setDeletingAccount(false);
                  }
                },
              },
            ],
          });
        }}
      >
        <Text style={styles.deleteAccountButtonText}>מחק חשבון</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingHorizontal: 20,
    paddingTop: 16,
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
    textAlign: 'right',
    flex: 1,
    marginRight: 8,
  },
  profileCard: {
    width: '100%',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card,
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 18,
  },
  emailSection: {
    width: '100%',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  headerRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    marginBottom: 10,
  },
  backButton: {
    height: 32,
    width: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginTop: 2,
  },
  emailValue: {
    width: '100%',
    fontSize: 17,
    color: theme.colors.text,
    textAlign: 'right',
    writingDirection: 'ltr',
    lineHeight: 24,
  },
  emailLabel: {
    fontSize: 14,
    color: theme.colors.textMuted,
    textAlign: 'right',
  },
  divider: {
    width: '100%',
    height: 1,
    backgroundColor: theme.colors.border,
    marginTop: 4,
    marginBottom: 24,
  },
  avatarSection: {
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  avatarCircle: {
    width: 188,
    height: 188,
    borderRadius: 94,
    backgroundColor: theme.colors.accent,
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
    marginTop: 16,
    width: '88%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  zoomSlider: {
    flex: 1,
    height: 30,
  },
  actionsRow: {
    marginTop: 30,
    flexDirection: 'row',
    gap: 22,
  },
  saveButton: {
    alignSelf: 'flex-start',
    marginTop: 22,
    marginLeft: 12,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.accent,
  },
  saveButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  saveButtonDisabled: {
    opacity: 0.4,
  },
  saveButtonText: {
    color: theme.colors.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  deleteAccountButton: {
    marginTop: 18,
    marginBottom: 8,
    alignSelf: 'center',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(199, 93, 44, 0.45)',
    backgroundColor: 'rgba(199, 93, 44, 0.04)',
  },
  deleteAccountButtonPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.985 }],
  },
  deleteAccountButtonText: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '500',
  },
  actionButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: theme.colors.cardAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
