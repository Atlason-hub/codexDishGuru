import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

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
    backgroundColor: '#ffffff',
  },
  body: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 24,
  },
  photoCard: {
    width: '90%',
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 4,
    padding: 12,
  },
  photo: {
    width: '100%',
    height: 280,
    borderRadius: 12,
    backgroundColor: '#f0f0f0',
  },
  placeholder: {
    width: '100%',
    height: 280,
    textAlign: 'center',
    textAlignVertical: 'center',
    color: '#9CA3AF',
  },
  saveButton: {
    marginTop: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
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
    color: '#111827',
  },
});
