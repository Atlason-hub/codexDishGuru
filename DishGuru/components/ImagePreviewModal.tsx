import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import CachedLogo from './CachedLogo';
import { theme } from '../lib/theme';

type Props = {
  visible: boolean;
  imageUrl: string | null;
  title?: string | null;
  subtitle?: string | null;
  onClose: () => void;
};

export default function ImagePreviewModal({
  visible,
  imageUrl,
  title,
  subtitle,
  onClose,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <SafeAreaView style={styles.backdrop}>
        <Pressable style={styles.overlay} onPress={onClose} />
        <View style={styles.shell}>
          <View style={styles.handle} />
          <View style={styles.card}>
            {imageUrl ? <CachedLogo uri={imageUrl} style={styles.image} /> : null}
          </View>
          {title || subtitle ? (
            <View style={styles.captionWrap}>
              {title ? <Text style={styles.title}>{title}</Text> : null}
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
          ) : null}
          <Pressable style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={18} color={theme.colors.white} />
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(13, 10, 8, 0.84)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  shell: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  handle: {
    width: 54,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.35)',
    marginBottom: 18,
  },
  card: {
    width: '100%',
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  image: {
    width: '100%',
    aspectRatio: 4 / 3,
  },
  captionWrap: {
    marginTop: 14,
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  title: {
    color: theme.colors.white,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 4,
    color: 'rgba(255,255,255,0.76)',
    fontSize: 13,
    textAlign: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 18,
    right: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.36)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
});
