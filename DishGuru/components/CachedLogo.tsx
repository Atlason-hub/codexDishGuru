import { useEffect, useMemo, useState } from 'react';
import {
  ImageResizeMode,
  Image as NativeImage,
  Platform,
  StyleProp,
} from 'react-native';
import { Image, ImageContentFit, ImageStyle } from 'expo-image';
import { resolveDishImageUrl } from '../lib/dishImage';

type Props = {
  uri: string;
  imagePath?: string | null;
  style?: StyleProp<ImageStyle>;
  contentFit?: ImageContentFit;
  transition?: number | null;
  priority?: 'low' | 'normal' | 'high';
  allowDownscaling?: boolean;
  cachePolicy?: 'none' | 'disk' | 'memory' | 'memory-disk' | null;
  preferNative?: boolean;
  onError?: () => void;
};

export default function CachedLogo({
  uri,
  imagePath = null,
  style,
  contentFit = 'cover',
  transition = 200,
  priority = 'normal',
  allowDownscaling = true,
  cachePolicy = 'memory-disk',
  preferNative = false,
  onError,
}: Props) {
  const resolvedUri = useMemo(() => {
    if (!imagePath) return uri;
    return resolveDishImageUrl(uri, imagePath) ?? uri;
  }, [imagePath, uri]);
  const deterministicDishCacheKey = useMemo(
    () => encodeURIComponent(imagePath ?? resolvedUri),
    [imagePath, resolvedUri]
  );
  const shouldUseSimpleIosDishImage = Platform.OS === 'ios' && Boolean(imagePath);
  const [renderMode, setRenderMode] = useState<'expo' | 'native'>(
    shouldUseSimpleIosDishImage ? 'expo' : preferNative ? 'native' : 'expo'
  );
  const [attemptNonce, setAttemptNonce] = useState(0);

  useEffect(() => {
    setRenderMode(shouldUseSimpleIosDishImage ? 'expo' : preferNative ? 'native' : 'expo');
    setAttemptNonce(0);
  }, [preferNative, resolvedUri, shouldUseSimpleIosDishImage]);

  const nativeResizeMode = useMemo<ImageResizeMode>(() => {
    switch (contentFit) {
      case 'contain':
        return 'contain';
      case 'fill':
        return 'stretch';
      case 'none':
      case 'scale-down':
        return 'contain';
      case 'cover':
      default:
        return 'cover';
    }
  }, [contentFit]);

  const resolvedUriWithRetry = (() => {
    const base = `${resolvedUri}${resolvedUri.includes('?') ? '&' : '?'}imgKey=${deterministicDishCacheKey}`;
    if (attemptNonce > 0) {
      return `${base}&imageRetry=${attemptNonce}`;
    }
    return base;
  })();

  if (renderMode === 'native' && !shouldUseSimpleIosDishImage) {
    const fallbackUri = (() => {
      const base = `${resolvedUri}${resolvedUri.includes('?') ? '&' : '?'}imgKey=${deterministicDishCacheKey}`;
      if (attemptNonce > 0) {
        return `${base}&nativeFallback=${attemptNonce}`;
      }
      return base;
    })();

    return (
      <NativeImage
        source={
          Platform.OS === 'ios'
            ? { uri: fallbackUri, cache: 'reload' }
            : { uri: fallbackUri }
        }
        style={style}
        resizeMode={nativeResizeMode}
        onError={() => {
          if (attemptNonce === 0) {
            setAttemptNonce(1);
            return;
          }
          setAttemptNonce(0);
          setRenderMode('expo');
        }}
      />
    );
  }

  return (
    <Image
      source={{ uri: resolvedUriWithRetry }}
      style={style}
      cachePolicy={
        shouldUseSimpleIosDishImage
          ? 'none'
          : preferNative && Platform.OS === 'ios'
          ? 'none'
          : cachePolicy ?? 'memory-disk'
      }
      contentFit={contentFit}
      placeholderContentFit={contentFit}
      transition={transition}
      priority={priority}
      allowDownscaling={allowDownscaling}
      onError={() => {
        if (attemptNonce === 0) {
          setAttemptNonce(1);
          return;
        }
        if (shouldUseSimpleIosDishImage) {
          onError?.();
          return;
        }
        if (!preferNative) {
          setAttemptNonce(0);
          setRenderMode('native');
          return;
        }
        onError?.();
      }}
    />
  );
}
