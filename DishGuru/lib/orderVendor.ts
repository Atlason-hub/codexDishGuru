import { Linking } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { showAppAlert } from './appDialog';

type OrderVendor = string | null | undefined;

export const open10bisDish = (resId: number, dishId: number) => {
  const url = `https://www.10bis.co.il/next/en/restaurants/menu/delivery/${resId}/res?dishId=${dishId}`;
  Linking.openURL(url).catch(async () => {
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch (err) {
      showAppAlert('שגיאה', `לא ניתן לפתוח את הקישור: ${url}`);
    }
  });
};

export const openVendorDish = (vendor: OrderVendor, resId?: number | null, dishId?: number | null) => {
  if (!vendor) {
    showAppAlert('שגיאה', 'לא נמצא ספק הזמנות לחברה.');
    return;
  }
  if (!resId || !dishId) {
    showAppAlert('שגיאה', 'חסרים פרטי מסעדה או מנה.');
    return;
  }
  const normalized = vendor.trim().toLowerCase();
  if (normalized === '10bis') {
    open10bisDish(resId, dishId);
    return;
  }
  showAppAlert('שגיאה', 'ספק ההזמנות אינו נתמך עדיין.');
};
