import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import CachedLogo from './CachedLogo';
import { theme } from '../lib/theme';

const AVATAR_MODAL_SIZE = 220;

type Props = {
  visible: boolean;
  avatarUrl: string | null;
  label: string | null;
  onClose: () => void;
};

export default function AvatarPreviewModal({ visible, avatarUrl, label, onClose }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.overlay} onPress={onClose} />
        <View style={styles.wrapper}>
          <View style={styles.card}>
            {avatarUrl ? (
              <CachedLogo uri={avatarUrl} style={styles.image} />
            ) : (
              <View style={styles.placeholder}>
                <Ionicons name="person" size={64} color={theme.colors.textMuted} />
              </View>
            )}
            {label ? (
              <View style={styles.emailPill}>
                <Text style={styles.emailText}>{label}</Text>
              </View>
            ) : null}
          </View>
          <Pressable style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={18} color={theme.colors.ink} />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  wrapper: {
    width: AVATAR_MODAL_SIZE,
    height: AVATAR_MODAL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  card: {
    width: AVATAR_MODAL_SIZE,
    height: AVATAR_MODAL_SIZE,
    borderRadius: AVATAR_MODAL_SIZE / 2,
    backgroundColor: theme.colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: theme.colors.border,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.cardAlt,
  },
  closeButton: {
    position: 'absolute',
    top: 8,
    right: -36,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  emailPill: {
    position: 'absolute',
    bottom: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 1,
    borderColor: theme.colors.border,
    maxWidth: AVATAR_MODAL_SIZE - 36,
  },
  emailText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
});
