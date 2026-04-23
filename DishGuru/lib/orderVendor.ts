import { Linking, Platform } from 'react-native';
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

const openWebsite = async (url: string) => {
  try {
    await Linking.openURL(url);
  } catch {
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch {
      showAppAlert('שגיאה', `לא ניתן לפתוח את הקישור: ${url}`);
    }
  }
};

const buildAndroidIntentUrl = (url: string, packageName: string) => {
  const httpsUrl = url.replace(/^http:\/\//i, 'https://');
  const withoutScheme = httpsUrl.replace(/^https?:\/\//i, '');
  return `intent://${withoutScheme}#Intent;scheme=https;package=${packageName};S.browser_fallback_url=${encodeURIComponent(httpsUrl)};end`;
};

const openVendorAppOrWebsite = async (websiteUrl: string, options?: { androidPackage?: string }) => {
  if (Platform.OS === 'android' && options?.androidPackage) {
    const intentUrl = buildAndroidIntentUrl(websiteUrl, options.androidPackage);
    try {
      await Linking.openURL(intentUrl);
      return;
    } catch {
      // Fall through to the website if the app is unavailable or the intent fails.
    }
  }

  await openWebsite(websiteUrl);
};

const openWolt = async () => {
  // We only store a generic vendor marker today, not Wolt venue slugs, so this opens
  // the vendor entry point and lets the app handle universal/app links when available.
  await openVendorAppOrWebsite('https://wolt.com/en/isr', {
    androidPackage: 'com.wolt.android',
  });
};

const openCibus = async () => {
  // Same limitation as Wolt: company settings currently identify the vendor, but we
  // don't store a Cibus-specific venue URL yet, so we route to the vendor home/order site.
  await openVendorAppOrWebsite('https://cibus.pluxee.co.il', {
    androidPackage: 'com.sodexo.mysodexo',
  });
};

export const openVendorDish = async (
  vendor: OrderVendor,
  resId?: number | null,
  dishId?: number | null
) => {
  if (!vendor) {
    showAppAlert('שגיאה', 'לא נמצא ספק הזמנות לחברה.');
    return;
  }
  const normalized = vendor.trim().toLowerCase();
  if (normalized === '10bis') {
    if (!resId || !dishId) {
      showAppAlert('שגיאה', 'חסרים פרטי מסעדה או מנה.');
      return;
    }
    open10bisDish(resId, dishId);
    return;
  }
  if (normalized === 'wolt') {
    await openWolt();
    return;
  }
  if (normalized === 'cibus' || normalized === 'cibus pluxee') {
    await openCibus();
    return;
  }
  showAppAlert('שגיאה', 'ספק ההזמנות אינו נתמך עדיין.');
};
