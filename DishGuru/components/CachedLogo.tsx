import { StyleProp } from 'react-native';
import { Image, ImageContentFit, ImageStyle } from 'expo-image';

type Props = {
  uri: string;
  style?: StyleProp<ImageStyle>;
  contentFit?: ImageContentFit;
  transition?: number | null;
  priority?: 'low' | 'normal' | 'high';
  allowDownscaling?: boolean;
};

export default function CachedLogo({
  uri,
  style,
  contentFit = 'cover',
  transition = 200,
  priority = 'normal',
  allowDownscaling = true,
}: Props) {
  return (
    <Image
      source={{ uri }}
      style={style}
      cachePolicy="memory-disk"
      contentFit={contentFit}
      placeholderContentFit={contentFit}
      transition={transition}
      priority={priority}
      allowDownscaling={allowDownscaling}
    />
  );
}
