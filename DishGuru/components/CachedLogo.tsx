import { StyleProp } from 'react-native';
import { Image, ImageContentFit, ImageStyle } from 'expo-image';

type Props = {
  uri: string;
  style?: StyleProp<ImageStyle>;
  contentFit?: ImageContentFit;
  transition?: number | null;
  priority?: 'low' | 'normal' | 'high';
  allowDownscaling?: boolean;
  cachePolicy?: 'none' | 'disk' | 'memory' | 'memory-disk' | null;
  onError?: () => void;
};

export default function CachedLogo({
  uri,
  style,
  contentFit = 'cover',
  transition = 200,
  priority = 'normal',
  allowDownscaling = true,
  cachePolicy = 'memory-disk',
  onError,
}: Props) {
  return (
    <Image
      source={{ uri }}
      style={style}
      cachePolicy={cachePolicy ?? 'memory-disk'}
      contentFit={contentFit}
      placeholderContentFit={contentFit}
      transition={transition}
      priority={priority}
      allowDownscaling={allowDownscaling}
      onError={onError}
    />
  );
}
