import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { theme } from '../../lib/theme';

export default function CameraResultScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const rawValue = typeof params.photoUri === 'string' ? decodeURIComponent(params.photoUri) : null;

  return (
    <View style={styles.screen}>
      <View style={styles.body}>
        <View style={styles.photoCard}>
          {rawValue ? (
            <Image source={{ uri: rawValue }} style={styles.photo} />
          ) : (
            <Text style={styles.placeholder}>אין תמונה עדיין</Text>
          )}
        </View>
        <Pressable
          style={({ pressed }) => [styles.saveButton, pressed && styles.saveButtonPressed]}
          onPress={() => {
            router.push({
              pathname: '/camera/details',
              params: { photoUri: params.photoUri ?? '' },
            });
          }}
        >
          <Text style={styles.saveText}>שמור</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 24,
  },
  photoCard: {
    width: '90%',
    borderRadius: 16,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    shadowColor: theme.colors.ink,
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 4,
    padding: 12,
  },
  photo: {
    width: '100%',
    height: 280,
    borderRadius: 12,
    backgroundColor: theme.colors.cardAlt,
  },
  placeholder: {
    width: '100%',
    height: 280,
    textAlign: 'center',
    textAlignVertical: 'center',
    color: theme.colors.textMuted,
  },
  saveButton: {
    marginTop: 16,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 50,
    paddingVertical: 12,
    paddingHorizontal: 48,
  },
  saveButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  saveText: {
    fontWeight: '600',
    color: theme.colors.text,
  },
});
