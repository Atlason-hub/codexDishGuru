import AsyncStorage from '@react-native-async-storage/async-storage';

const GUEST_MODE_KEY = 'dishguru_guest_mode:v1';
let guestModeMemoryValue: boolean | null = null;

export const loadGuestMode = async () => {
  if (guestModeMemoryValue != null) {
    return guestModeMemoryValue;
  }
  try {
    guestModeMemoryValue = (await AsyncStorage.getItem(GUEST_MODE_KEY)) === '1';
    return guestModeMemoryValue;
  } catch {
    guestModeMemoryValue = false;
    return false;
  }
};

export const setGuestModeEnabled = async (enabled: boolean) => {
  guestModeMemoryValue = enabled;
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
