import { Ionicons } from '@expo/vector-icons';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

type DefaultAvatarProps = {
  size: number;
  style?: StyleProp<ViewStyle>;
};

export default function DefaultAvatar({ size, style }: DefaultAvatarProps) {
  const innerSize = Math.max(size - 6, 0);
  const iconSize = Math.max(Math.round(size * 0.44), 14);

  return (
    <View
      style={[
        styles.shell,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
        style,
      ]}
    >
      <View
        style={[
          styles.inner,
          {
            width: innerSize,
            height: innerSize,
            borderRadius: innerSize / 2,
          },
        ]}
      >
        <Ionicons name="person-outline" size={iconSize} color="#A64916" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#F1D48A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inner: {
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
