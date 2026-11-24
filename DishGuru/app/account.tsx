import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getCurrentAuthUser, supabase } from '../lib/supabase';
import * as ImagePicker from 'expo-image-picker';
import { Buffer } from 'buffer';
import { Image } from 'expo-image';
import { cacheAvatar, hydrateAvatarForUser, normalizeAvatarUrl } from '../lib/avatar';
import { useRouter } from 'expo-router';
import Slider from '@react-native-community/slider';
import * as ImageManipulator from 'expo-image-manipulator';
import { theme } from '../lib/theme';
import AppHeader from '../components/AppHeader';
import CachedLogo from '../components/CachedLogo';
import DefaultAvatar from '../components/DefaultAvatar';
import { showAppAlert, showAppDialog } from '../lib/appDialog';
import { Locale, useLocale } from '../lib/locale';
import { setGuestModeEnabled } from '../lib/guestMode';
import { publishAvatarUpdate, subscribeAvatarUpdates } from '../lib/avatarEvents';
import { setPendingLocalLogout } from '../lib/logoutGate';
import { clearUserSessionArtifacts } from '../lib/sessionCleanup';

const extractAvatarStoragePath = (rawUrl: string | null | undefined) => {
  if (!rawUrl) return null;

  const objectPublicMarker = '/storage/v1/object/public/avatars/';
  const renderPublicMarker = '/storage/v1/render/image/public/avatars/';
  const marker = rawUrl.includes(objectPublicMarker)
    ? objectPublicMarker
    : rawUrl.includes(renderPublicMarker)
      ? renderPublicMarker
      : null;

  if (!marker) return null;
  const [, tail] = rawUrl.split(marker);
  if (!tail) return null;
  const [pathPart] = tail.split('?');
  const decodedPath = decodeURIComponent(pathPart).trim();
  return decodedPath.length > 0 ? decodedPath : null;
};

export default function AccountScreen() {
  const FRAME_SIZE = 148;
  const MIN_ZOOM = 1.28;
  const MAX_ZOOM = 5;

  const router = useRouter();
  const { isRTL, locale, setLocale, t } = useLocale();
  const [changingLocale, setChangingLocale] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [tempAvatarUrl, setTempAvatarUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [redirectingOut, setRedirectingOut] = useState(false);
  const [pendingAsset, setPendingAsset] = useState<{
    uri: string;
    width: number;
    height: number;
  } | null>(null);
  const [avatarOffset, setAvatarOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const dragStart = useRef({ x: 0, y: 0 });
  const zoomStart = useRef(MIN_ZOOM);
  const authUserIdRef = useRef<string | null>(null);
  const scaleToCover = pendingAsset
    ? Math.max(FRAME_SIZE / pendingAsset.width, FRAME_SIZE / pendingAsset.height)
    : 1;
  const scaleFactor = scaleToCover * zoom;
  const displayWidth = pendingAsset ? pendingAsset.width * scaleFactor : FRAME_SIZE;
  const displayHeight = pendingAsset ? pendingAsset.height * scaleFactor : FRAME_SIZE;
  const extraDragAllowance = pendingAsset ? FRAME_SIZE * 0.55 : 0;

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [avatarUrl]);
  const maxOffsetX = Math.max(FRAME_SIZE * 0.35, (displayWidth - FRAME_SIZE) / 2 + extraDragAllowance);
  const maxOffsetY = Math.max(FRAME_SIZE * 0.35, (displayHeight - FRAME_SIZE) / 2 + extraDragAllowance);

  const clampOffset = (value: { x: number; y: number }) => ({
    x: Math.min(maxOffsetX, Math.max(-maxOffsetX, value.x)),
    y: Math.min(maxOffsetY, Math.max(-maxOffsetY, value.y)),
  });

  const getErrorMessage = (error: unknown) => {
    if (error instanceof Error) return error.message;
    if (error && typeof error === 'object') {
      const maybeMessage = (error as { message?: unknown }).message;
      if (typeof maybeMessage === 'string' && maybeMessage.trim()) return maybeMessage;
      try {
        return JSON.stringify(error);
      } catch {
        return t('commonUnexpectedError');
      }
    }
    if (typeof error === 'string' && error.trim()) return error;
    return t('commonUnexpectedError');
  };

  const syncAuthAvatarMetadata = useCallback(async (nextAvatarUrl: string | null) => {
    const { error } = await supabase.auth.updateUser({
      data: {
        avatar_url: nextAvatarUrl,
      },
    });

    if (error) {
      throw error;
    }
  }, []);

  const ensureAvatarSavedToProfile = useCallback(
    async (userId: string, emailAddress: string | null, avatarUrlToSave: string) => {
      const { data: savedAvatarUrl, error: saveAvatarError } = await supabase.rpc(
        'set_my_avatar_url',
        { p_avatar_url: avatarUrlToSave }
      );
      if (!saveAvatarError) {
        return typeof savedAvatarUrl === 'string' && savedAvatarUrl
          ? savedAvatarUrl
          : avatarUrlToSave;
      }

      const { data: updatedProfiles, error: updateError } = await supabase
        .from('AppUsers')
        .update({ avatar_url: avatarUrlToSave })
        .eq('user_id', userId)
        .select('user_id, avatar_url');

      if (updateError) {
        throw updateError;
      }

      const updatedProfile = Array.isArray(updatedProfiles) ? updatedProfiles[0] : updatedProfiles;
      if (updatedProfile?.user_id) {
        return avatarUrlToSave;
      }

      const normalizedEmail = emailAddress?.trim().toLowerCase() ?? '';
      if (!normalizedEmail) {
        throw new Error(t('accountReloginToDelete'));
      }

      const existingByEmail = await supabase
        .from('AppUsers')
        .select('user_id, avatar_url')
        .ilike('email', normalizedEmail)
        .limit(1)
        .maybeSingle();

      if (existingByEmail.error) {
        throw existingByEmail.error;
      }

      if (existingByEmail.data?.user_id) {
        const { data: recoveredProfiles, error: recoverError } = await supabase
          .from('AppUsers')
          .update({ user_id: userId, avatar_url: avatarUrlToSave })
          .eq('email', normalizedEmail)
          .select('user_id, avatar_url');

        if (recoverError) {
          throw recoverError;
        }

        const recoveredProfile = Array.isArray(recoveredProfiles) ? recoveredProfiles[0] : recoveredProfiles;
        if (recoveredProfile?.user_id) {
          return avatarUrlToSave;
        }
      }

      const domain = normalizedEmail.includes('@')
        ? normalizedEmail.split('@').pop()?.trim().toLowerCase() ?? ''
        : '';
      if (!domain) {
        throw new Error(t('authEmailDomainMissing'));
      }

      const { data: companyMatch, error: companyError } = await supabase
        .from('companies')
        .select('id')
        .ilike('domain', domain)
        .limit(1)
        .maybeSingle();

      if (companyError) {
        throw companyError;
      }

      if (!companyMatch?.id) {
        throw new Error(t('authEmailDomainUnknown'));
      }

      const { data: insertedProfile, error: insertError } = await supabase
        .from('AppUsers')
        .insert({
          user_id: userId,
          email: normalizedEmail,
          company_id: companyMatch.id,
          avatar_url: avatarUrlToSave,
        })
        .select('user_id, avatar_url')
        .maybeSingle();

      if (insertError) {
        throw insertError;
      }

      if (!insertedProfile?.user_id) {
        throw new Error(t('accountSaveFailed'));
      }

      return avatarUrlToSave;
    },
    [t]
  );

  const routeToLoggedOutHome = useCallback(() => {
    setRedirectingOut(true);
    router.replace({
      pathname: '/',
      params: {
        headerSync: String(Date.now()),
        guestMode: '0',
        skipLaunch: '1',
      },
    });
    void (async () => {
      try {
        await setGuestModeEnabled(false);
      } catch (error) {
        console.warn('[account] post-logout cleanup failed', error);
      }
    })();
  }, [router]);

  const signOut = useCallback(async () => {
    if (saving || deletingAccount || redirectingOut) return;

    setPendingLocalLogout(true);
    setRedirectingOut(true);
    try {
      await clearUserSessionArtifacts(currentUserId, email);
      await setGuestModeEnabled(false);
      await cacheAvatar(currentUserId, null);
    } catch (error) {
      console.warn('[account] sign out cleanup failed', error);
    }

    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch (error) {
      console.warn('[account] local sign out failed', error);
    } finally {
      routeToLoggedOutHome();
    }
  }, [currentUserId, deletingAccount, email, redirectingOut, routeToLoggedOutHome, saving]);

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
    const resolveSignedInUser = async () => {
      let session = (await supabase.auth.getSession()).data.session;
      let authUser = session?.user ?? (await getCurrentAuthUser());
      if (authUser) {
        return { session, authUser };
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
      session = (await supabase.auth.getSession()).data.session;
      authUser = session?.user ?? (await getCurrentAuthUser());
      return { session, authUser };
    };

    resolveSignedInUser().then(async ({ session, authUser }) => {
      if (!mounted) return;
      if (!session) {
        routeToLoggedOutHome();
        return;
      }
      if (!mounted) return;
      if (!authUser) {
        routeToLoggedOutHome();
        return;
      }
      setEmail(authUser.email ?? session.user?.email ?? null);
      setCurrentUserId(authUser.id ?? null);
      authUserIdRef.current = authUser.id ?? null;
      const resolvedAvatar = await hydrateAvatarForUser(
        authUser.id,
        (authUser.user_metadata as any)?.avatar_url ?? null
      );
      if (!mounted) return;
      const normalizedMetaAvatar = normalizeAvatarUrl(
        (authUser.user_metadata as any)?.avatar_url ?? null
      );
      if (resolvedAvatar !== normalizedMetaAvatar) {
        await syncAuthAvatarMetadata(resolvedAvatar);
      }
      if (!mounted) return;
      await cacheAvatar(authUser.id, resolvedAvatar);
      if (!mounted) return;
      publishAvatarUpdate(authUser.id, resolvedAvatar);
      if (resolvedAvatar) {
        setAvatarUrl(resolvedAvatar);
      } else {
        setAvatarUrl(null);
      }
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (!session) {
        // Returning from the native camera can briefly produce an empty auth
        // notification while the persisted session is being restored.
        if (event === 'SIGNED_OUT') {
          setEmail(null);
          setCurrentUserId(null);
          setAvatarUrl(null);
          setTempAvatarUrl(null);
          setPendingAsset(null);
          routeToLoggedOutHome();
        }
        return;
      }
      const authUser = session.user;
      setEmail(authUser.email ?? null);
      setCurrentUserId(authUser.id);
      authUserIdRef.current = authUser.id;

      // Supabase warns against awaiting auth methods from inside this callback.
      // Defer profile hydration so token refreshes cannot deadlock avatar saving.
      setTimeout(() => {
        void hydrateAvatarForUser(
          authUser.id,
          (authUser.user_metadata as any)?.avatar_url ?? null
        ).then(async (resolvedAvatar) => {
          if (!mounted) return;
          await cacheAvatar(authUser.id, resolvedAvatar);
          if (!mounted) return;
          publishAvatarUpdate(authUser.id, resolvedAvatar);
          setAvatarUrl(resolvedAvatar);
        }).catch((error) => {
          console.warn('[account] avatar hydration after auth change failed', error);
        });
      }, 0);
    });
    const unsubscribeAvatarUpdates = subscribeAvatarUpdates(({ userId, avatarUrl: nextAvatarUrl }) => {
      if (!userId || userId !== authUserIdRef.current) return;
      setAvatarUrl(nextAvatarUrl);
    });
    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
      unsubscribeAvatarUpdates();
    };
  }, [routeToLoggedOutHome, syncAuthAvatarMetadata]);

  if (redirectingOut) {
    return <View style={styles.redirectPlaceholder} />;
  }

  return (
    <KeyboardAvoidingView
      style={styles.keyboardAvoiding}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
    >
      <AppHeader
        isAuthenticatedOverride
        currentUserIdOverride={currentUserId}
        currentUserEmailOverride={email}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.container}>
        <View style={[styles.headerRow, !isRTL && styles.headerRowLtr]}>
          <Pressable
            style={styles.backButton}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          >
            <Ionicons name={isRTL ? 'chevron-back' : 'chevron-forward'} size={18} color={theme.colors.ink} />
          </Pressable>
          <Text style={[styles.title, !isRTL && styles.titleLtr]}>{t('accountTitle')}</Text>
        </View>

        <View style={styles.profileCard}>
          <View style={[styles.emailSection, !isRTL && styles.emailSectionLtr]}>
            <Text style={[styles.emailLabel, !isRTL && styles.emailLabelLtr]}>{t('accountEmailLabel')}</Text>
            <Text style={styles.emailValue}>{email ?? ''}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.languageSection}>
            <View style={[styles.languageOptions, !isRTL && styles.languageOptionsLtr]}>
              {([
                ['he', t('accountLanguageHebrew')],
                ['en', t('accountLanguageEnglish')],
              ] as const).map(([value, label]) => (
                <Pressable
                  key={value}
                  style={[
                    styles.languageChip,
                    !isRTL && styles.languageChipLtr,
                    locale === value && styles.languageChipActive,
                    changingLocale && styles.languageChipDisabled,
                  ]}
                  onPress={async () => {
                    if (changingLocale || locale === value) return;
                    try {
                      setChangingLocale(true);
                      await setLocale(value as Locale);
                    } finally {
                      setChangingLocale(false);
                    }
                  }}
                  disabled={changingLocale}
                >
                  <Text
                    style={[
                      styles.languageChipText,
                      locale === value && styles.languageChipTextActive,
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.avatarSection}>
            <View style={styles.avatarFrame}>
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
                ) : avatarUrl && !avatarLoadFailed ? (
                  <CachedLogo
                    uri={avatarUrl}
                    style={styles.avatarImage}
                    onError={() => setAvatarLoadFailed(true)}
                  />
                ) : (
                  <DefaultAvatar size={FRAME_SIZE} />
                )}
              </View>

              {avatarUrl && !tempAvatarUrl && !avatarLoadFailed ? (
                <Pressable
                  style={({ pressed }) => [
                    styles.removeAvatarOverlayButton,
                    pressed && styles.removeAvatarOverlayButtonPressed,
                  ]}
                  disabled={saving}
                  onPress={() => {
                    if (saving) return;
                    Alert.alert(
                      t('accountRemoveAvatarTitle'),
                      t('accountRemoveAvatarMessage'),
                      [
                        { text: t('commonCancel'), style: 'cancel' },
                        {
                          text: t('accountRemoveAvatarAction'),
                          style: 'destructive',
                          onPress: async () => {
                            const userId = currentUserId ?? authUserIdRef.current;
                            const previousAvatarUrl = avatarUrl;
                            try {
                              setSaving(true);
                              if (!userId) {
                                throw new Error(t('accountUnauthorized'));
                              }

                              setAvatarUrl(null);
                              setTempAvatarUrl(null);
                              setPendingAsset(null);
                              setAvatarOffset({ x: 0, y: 0 });
                              setZoom(MIN_ZOOM);
                              publishAvatarUpdate(userId, null);

                              const { error: updateError } = await supabase.rpc(
                                'set_my_avatar_url',
                                { p_avatar_url: null }
                              );
                              if (updateError) throw updateError;

                              showAppAlert(t('accountSaveSuccessTitle'), t('accountRemoveAvatarSuccess'));

                              void syncAuthAvatarMetadata(null).catch((error) => {
                                console.warn('[account] avatar metadata cleanup failed', error);
                              });
                              void cacheAvatar(userId, null);
                              const previousAvatarPath = extractAvatarStoragePath(previousAvatarUrl);
                              if (previousAvatarPath) {
                                void supabase.storage.from('avatars').remove([previousAvatarPath]);
                              }
                            } catch (error) {
                              if (userId) {
                                setAvatarUrl(previousAvatarUrl);
                                publishAvatarUpdate(userId, previousAvatarUrl);
                              }
                              showAppAlert(
                                t('accountRemoveAvatarFailed'),
                                error instanceof Error ? error.message : t('accountRemoveAvatarFailed')
                              );
                            } finally {
                              setSaving(false);
                            }
                          },
                        },
                      ],
                      { cancelable: true }
                    );
                  }}
                >
                  <Ionicons name="trash-outline" size={14} color={theme.colors.accent} />
                </Pressable>
              ) : null}
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
                  } catch (error) {
                    showAppAlert(
                      t('accountUploadFailed'),
                      error instanceof Error ? error.message : t('accountUploadFailed')
                    );
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
                  } catch (error) {
                    showAppAlert(
                      t('accountCameraFailed'),
                      error instanceof Error ? error.message : t('accountUploadFailed')
                    );
                  }
                }}
              >
                <Ionicons name="camera-outline" size={22} color={theme.colors.textMuted} />
              </Pressable>
            </View>

            {pendingAsset ? (
            <Pressable
              style={({ pressed }) => [
                styles.saveButton,
                !isRTL && styles.saveButtonLtr,
                pressed && !saving && pendingAsset && styles.saveButtonPressed,
                (!pendingAsset || saving) && styles.saveButtonDisabled,
              ]}
              onPress={async () => {
                if (!pendingAsset || saving) return;
                try {
                  setSaving(true);
                  const userId = currentUserId ?? authUserIdRef.current;
                  const userEmail = email;
                  if (!userId) {
                    throw new Error(t('accountUnauthorized'));
                  }
                  const imageLeft = FRAME_SIZE / 2 - displayWidth / 2 + avatarOffset.x;
                  const imageTop = FRAME_SIZE / 2 - displayHeight / 2 + avatarOffset.y;
                  const cropX = Math.floor(Math.max(0, (0 - imageLeft) / scaleFactor));
                  const cropY = Math.floor(Math.max(0, (0 - imageTop) / scaleFactor));
                  const cropSize = FRAME_SIZE / scaleFactor;
                  const cropWidth = Math.max(1, Math.floor(Math.min(pendingAsset.width - cropX, cropSize)));
                  const cropHeight = Math.max(1, Math.floor(Math.min(pendingAsset.height - cropY, cropSize)));

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
                      { resize: { width: 320, height: 320 } },
                    ],
                    { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG, base64: true }
                  );
                  if (!cropped.base64) {
                    throw new Error(t('accountImageProcessingFailed'));
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
                    const previousAvatarPath = extractAvatarStoragePath(avatarUrl);
                    setAvatarUrl(url);
                    publishAvatarUpdate(userId, url);
                    const persistedAvatarUrl = await ensureAvatarSavedToProfile(userId, userEmail, url);
                    setAvatarUrl(persistedAvatarUrl);
                    publishAvatarUpdate(userId, persistedAvatarUrl);
                    void cacheAvatar(userId, persistedAvatarUrl);
                    void syncAuthAvatarMetadata(persistedAvatarUrl).catch((error) => {
                      console.warn('[account] avatar metadata sync failed', error);
                    });
                    const nextAvatarPath = extractAvatarStoragePath(persistedAvatarUrl);
                    if (
                      previousAvatarPath &&
                      previousAvatarPath !== nextAvatarPath
                    ) {
                      void supabase.storage.from('avatars').remove([previousAvatarPath]);
                    }
                    setPendingAsset(null);
                    setTempAvatarUrl(null);
                    setAvatarOffset({ x: 0, y: 0 });
                    setZoom(MIN_ZOOM);
                    showAppAlert(t('accountSaveSuccessTitle'), t('accountSaveSuccessMessage'));
                  }
                } catch (error) {
                  showAppAlert(
                    t('accountSaveFailed'),
                    error instanceof Error ? error.message : t('accountSaveFailed')
                  );
                } finally {
                  setSaving(false);
                }
              }}
            >
              <Text style={styles.saveButtonText}>{t('commonSave')}</Text>
            </Pressable>
            ) : null}
          </View>
        </View>

        <View style={styles.accountActionsRow}>
        <Pressable
          style={({ pressed }) => [
            styles.signOutButton,
            pressed && styles.signOutButtonPressed,
          ]}
          onPress={() => void signOut()}
          disabled={saving || deletingAccount || redirectingOut}
        >
          <Ionicons name="log-out-outline" size={18} color={theme.colors.accent} />
          <Text style={styles.signOutButtonText}>{t('headerMenuSignOut')}</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.deleteAccountButton,
            !isRTL && styles.deleteAccountButtonLtr,
            (pressed || deletingAccount) && styles.deleteAccountButtonPressed,
          ]}
          onPress={() => {
            if (saving || deletingAccount) return;
            showAppDialog({
              title: t('accountDeleteTitle'),
              message: t('accountDeleteConfirmMessage'),
              actions: [
                { text: t('commonCancel'), style: 'cancel' },
                {
                  text: t('accountDeleteConfirmAction'),
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      setDeletingAccount(true);
                      const { data } = await supabase.auth.getSession();
                      const userId = data.session?.user?.id ?? null;
                      if (!userId) {
                        showAppAlert(t('accountUnauthorized'), t('accountReloginToDelete'));
                        return;
                      }

                      const { error } = await supabase.rpc('delete_my_account');
                      if (error) throw error;

                      await cacheAvatar(userId, null);
                      setEmail(null);
                      setAvatarUrl(null);
                      setTempAvatarUrl(null);
                      setPendingAsset(null);
                      try {
                        await supabase.auth.signOut({ scope: 'local' });
                      } catch (signOutError) {
                        console.warn('[account-delete] local sign out cleanup failed', signOutError);
                      }
                      routeToLoggedOutHome();
                    } catch (error) {
                      showAppAlert(
                        t('accountDeleteFailed'),
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
          <Text style={styles.deleteAccountButtonText}>{t('accountDeleteAction')}</Text>
        </Pressable>
        </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  redirectPlaceholder: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  keyboardAvoiding: {
    flex: 1,
  },
  scroll: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 16,
  },
  container: {
    backgroundColor: theme.colors.background,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
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
  titleLtr: {
    textAlign: 'left',
    marginRight: 0,
    marginLeft: 8,
  },
  profileCard: {
    width: '100%',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card,
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 8,
  },
  emailSection: {
    width: '100%',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 7,
    gap: 2,
  },
  emailSectionLtr: {
    alignItems: 'flex-start',
  },
  headerRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    marginBottom: 6,
  },
  headerRowLtr: {
    flexDirection: 'row-reverse',
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
    fontSize: 15,
    color: theme.colors.text,
    textAlign: 'right',
    writingDirection: 'ltr',
    lineHeight: 20,
  },
  
  emailLabel: {
    fontSize: 12,
    color: theme.colors.textMuted,
    textAlign: 'right',
  },
  emailLabelLtr: {
    textAlign: 'left',
    alignSelf: 'flex-start',
  },
  divider: {
    width: '100%',
    height: 1,
    backgroundColor: theme.colors.border,
    marginTop: 2,
    marginBottom: 9,
  },
  languageSection: {
    width: '100%',
    paddingHorizontal: 12,
    gap: 4,
    marginBottom: 8,
  },
  languageOptions: {
    flexDirection: 'row-reverse',
    gap: 6,
    justifyContent: 'flex-start',
  },
  languageOptionsLtr: {
    flexDirection: 'row',
  },
  languageChip: {
    minWidth: 68,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  languageChipLtr: {
    minWidth: 64,
  },
  languageChipActive: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accentSoft,
  },
  languageChipDisabled: {
    opacity: 0.6,
  },
  languageChipText: {
    fontSize: 12,
    color: theme.colors.textMuted,
    fontWeight: '600',
  },
  languageChipTextActive: {
    color: theme.colors.accent,
  },
  avatarSection: {
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 2,
  },
  avatarFrame: {
    position: 'relative',
  },
  avatarCircle: {
    width: 148,
    height: 148,
    borderRadius: 74,
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
    marginTop: 8,
    width: '88%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  zoomSlider: {
    flex: 1,
    height: 30,
  },
  actionsRow: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 12,
  },
  saveButton: {
    alignSelf: 'flex-start',
    marginTop: 10,
    marginLeft: 12,
    paddingHorizontal: 24,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.accent,
  },
  saveButtonLtr: {
    alignSelf: 'flex-end',
    marginLeft: 0,
    marginRight: 12,
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
  removeAvatarOverlayButton: {
    position: 'absolute',
    right: 6,
    bottom: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFF8F2',
    borderWidth: 1,
    borderColor: 'rgba(166, 73, 22, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: theme.colors.ink,
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  removeAvatarOverlayButtonPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.985 }],
  },
  accountActionsRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 10,
  },
  deleteAccountButton: {
    flex: 1,
    minHeight: 40,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(199, 93, 44, 0.45)',
    backgroundColor: 'rgba(199, 93, 44, 0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutButton: {
    flex: 1,
    minHeight: 40,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    backgroundColor: 'rgba(255,248,242,0.96)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  signOutButtonPressed: {
    opacity: 0.84,
    transform: [{ scale: 0.985 }],
  },
  signOutButtonText: {
    color: theme.colors.accent,
    fontSize: 14,
    fontFamily: theme.typography.semibold,
  },
  deleteAccountButtonLtr: {
    alignSelf: 'center',
  },
  deleteAccountButtonPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.985 }],
  },
  deleteAccountButtonText: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  actionButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.cardAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
