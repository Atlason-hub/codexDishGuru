import { useEffect, useState } from 'react';
import { Keyboard, Platform, UIManager } from 'react-native';

type KeyboardInsetOptions = {
  iosInset?: number;
  androidInset?: number;
  onShow?: () => void;
  onHide?: () => void;
};

export const useDebouncedValue = <T,>(value: T, delayMs = 250) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => clearTimeout(handle);
  }, [delayMs, value]);

  return debouncedValue;
};

export const useEnableAndroidLayoutAnimation = () => {
  useEffect(() => {
    if (Platform.OS === 'android') {
      UIManager.setLayoutAnimationEnabledExperimental?.(true);
    }
  }, []);
};

export const useKeyboardInset = ({
  iosInset = 24,
  androidInset = 320,
  onShow,
  onHide,
}: KeyboardInsetOptions = {}) => {
  const [keyboardInset, setKeyboardInset] = useState(0);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => {
      setKeyboardInset(Platform.OS === 'android' ? androidInset : iosInset);
      onShow?.();
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardInset(0);
      onHide?.();
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [androidInset, iosInset, onHide, onShow]);

  return keyboardInset;
};
