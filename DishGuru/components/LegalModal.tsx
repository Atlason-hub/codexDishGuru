import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { theme } from '../lib/theme';
import { useLocale } from '../lib/locale';

type Props = {
  visible: boolean;
  title: string;
  url: string;
  onClose: () => void;
};

export default function LegalModal({ visible, title, url, onClose }: Props) {
  const { isRTL, t } = useLocale();

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
        <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Pressable
            style={[styles.closeButton, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}
            onPress={onClose}
          >
            <Ionicons name="close" size={22} color={theme.colors.ink} />
            <Text style={styles.closeText}>{t('commonClose')}</Text>
          </Pressable>
          <Text style={[styles.title, { textAlign: isRTL ? 'right' : 'left' }]}>{title}</Text>
        </View>
        <WebView source={{ uri: url }} style={styles.webview} startInLoadingState />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.card,
  },
  closeButton: {
    alignItems: 'center',
    gap: 6,
  },
  closeText: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  title: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  webview: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
});
