import { Image, StyleSheet, Text, TouchableOpacity, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { fetchCompanyLogoForCurrentUser, loadCachedLogo } from '../../lib/logo';

const SUPABASE_URL = 'https://snbreqnndprgbfgiiynd.supabase.co';

export default function CameraResultScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const rawValue = typeof params.photoUri === 'string' ? decodeURIComponent(params.photoUri) : null;
  const [menuVisible, setMenuVisible] = useState(false);
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [companyDomain, setCompanyDomain] = useState<string | null>(null);

  const resolveLogoUrl = (path: string | null | undefined) => {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    const bucket = 'companies';
    return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path.replace(/^\/+/, '')}`;
  };

  const fetchCompanyLogoForUser = async () => {
    const cached = await loadCachedLogo();
    if (cached.logoUrl) setCompanyLogoUrl(cached.logoUrl);
    const res = await fetchCompanyLogoForCurrentUser();
    setCompanyLogoUrl(res.logoUrl);
    setCompanyDomain(res.domain);
    setUserEmail(res.email);
  };

  useEffect(() => {
    const primeLogo = async () => {
      const cached = await loadCachedLogo();
      if (cached.logoUrl) setCompanyLogoUrl(cached.logoUrl);
      fetchCompanyLogoForUser();
    };
    primeLogo();
  }, []);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.leftIcons}>
          <TouchableOpacity style={styles.iconButton} onPress={() => router.push('/camera')}>
            <Ionicons name="camera" size={24} color="#111111" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconButton} onPress={() => {}}>
            <Ionicons name="search" size={24} color="#111111" />
          </TouchableOpacity>
        </View>
        <Pressable style={styles.logoContainer} onPress={() => router.push('/')}>
          {companyLogoUrl ? (
            <Image source={{ uri: companyLogoUrl }} style={styles.logoImage} />
          ) : (
            <Text style={styles.logoText}>DishGuru</Text>
          )}
        </Pressable>
        <View style={styles.rightIcons}>
          <TouchableOpacity style={styles.iconButton} onPress={() => setMenuVisible((p) => !p)}>
            <Ionicons name="menu" size={28} color="#111111" />
          </TouchableOpacity>
        </View>
      </View>
      {menuVisible && (
        <View style={styles.menuContainer}>
          <TouchableOpacity style={styles.menuBackdrop} onPress={() => setMenuVisible(false)} />
          <View style={styles.menuOverlay}>
            <TouchableOpacity style={styles.menuClose} onPress={() => setMenuVisible(false)}>
              <Ionicons name="close" size={20} color="#333333" />
            </TouchableOpacity>
            <View style={styles.menuUserRow}>
              <Ionicons name="person-circle-outline" size={36} color="#111111" />
            </View>
            <TouchableOpacity style={styles.menuOptionRow}>
              <Text style={styles.menuOption}>Privacy</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuOptionRow}>
              <Text style={styles.menuOption}>Terms</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      <View style={styles.body}>
        <View style={styles.photoCard}>
          {rawValue ? (
            <Image source={{ uri: rawValue }} style={styles.photo} />
          ) : (
            <Text style={styles.placeholder}>No photo available yet</Text>
          )}
        </View>
        <TouchableOpacity
          style={styles.saveButton}
          onPress={() => {
            router.push({
              pathname: '/camera/details',
              params: { photoUri: params.photoUri ?? '' },
            });
          }}
        >
          <Text style={styles.saveText}>Save</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#ffffff',
    marginTop: 6,
  },
  iconButton: {
    padding: 4,
    borderRadius: 20,
  },
  logoContainer: {
    flex: 1,
    alignItems: 'center',
  },
  logoText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  logoImage: {
    width: 160,
    height: 40,
    resizeMode: 'contain',
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
  saveText: {
    fontWeight: '600',
    color: '#111827',
  },
  leftIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: 96,
  },
  rightIcons: {
    width: 96,
    alignItems: 'flex-end',
  },
  menuContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 18,
  },
  menuBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  menuOverlay: {
    position: 'absolute',
    top: 64,
    right: 16,
    width: 200,
    zIndex: 20,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#dddddd',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
  menuClose: {
    position: 'absolute',
    top: 8,
    right: 8,
    height: 32,
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuOption: {
    fontSize: 14,
    color: '#666666',
    marginBottom: 4,
  },
  menuOptionRow: {
    paddingVertical: 4,
  },
  menuUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
});
