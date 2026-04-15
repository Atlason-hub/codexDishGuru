import { StyleProp } from 'react-native';
import { Image, ImageStyle } from 'expo-image';

type Props = {
  uri: string;
  style?: StyleProp<ImageStyle>;
};

export default function CachedLogo({ uri, style }: Props) {
  return <Image source={{ uri }} style={style} cachePolicy="memory-disk" transition={200} />;
}
