import AsyncStorage from '@react-native-async-storage/async-storage';

const GUEST_MODE_KEY = 'dishguru_guest_mode:v1';

export const loadGuestMode = async () => {
  try {
    return (await AsyncStorage.getItem(GUEST_MODE_KEY)) === '1';
  } catch {
    return false;
  }
};

export const setGuestModeEnabled = async (enabled: boolean) => {
  try {
    if (enabled) {
      await AsyncStorage.setItem(GUEST_MODE_KEY, '1');
    } else {
      await AsyncStorage.removeItem(GUEST_MODE_KEY);
    }
  } catch {
    // Ignore guest mode persistence failures and fall back to default auth behavior.
  }
};
