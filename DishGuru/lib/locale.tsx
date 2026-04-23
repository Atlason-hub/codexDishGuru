import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';

export type Locale = 'he' | 'en';

const LOCALE_STORAGE_KEY = 'dishguru_locale:v1';

const translations = {
  he: {
    commonSave: 'שמור',
    commonCancel: 'ביטול',
    commonClose: 'סגור',
    commonConfirm: 'אישור',
    commonDelete: 'מחק',
    commonNoDishesToShow: 'אין מנות להצגה',
    commonUnexpectedError: 'אירעה שגיאה לא צפויה.',
    headerMenuAccount: 'החשבון שלי',
    headerMenuMyDishes: 'המנות שלי',
    headerMenuFavorites: 'המועדפים שלי',
    favoritesTitle: 'המועדפים שלי',
    favoritesEmpty: 'אין מנות במועדפים',
    headerMenuPrivacy: 'מדיניות פרטיות',
    headerMenuTerms: 'תנאים',
    headerMenuSignOut: 'התנתקות',
    ratingTasty: 'טעים',
    ratingSize: 'משביע',
    orderAction: 'הזמן',
    homeSearchPlaceholder: 'חיפוש מנות או מסעדות',
    searchTitle: 'חיפוש',
    searchAllDishes: 'כלל המנות',
    searchUploadedDishes: 'מנות שהועלו',
    searchRestaurantPlaceholder: 'חיפוש מסעדה…',
    searchChooseRestaurant: 'בחר מסעדה',
    searchChooseRestaurantFirst: 'בחר מסעדה קודם',
    searchDishPlaceholder: 'חיפוש מנה…',
    searchDishPrompt: 'הכנס שם או בחר מנה',
    searchExpandAll: 'הרחב הכל',
    searchCollapseAll: 'כווץ הכל',
    searchResultsForRestaurant: 'תוצאות עבור מסעדות',
    searchNoDishesFound: 'לא נמצאו מנות',
    searchNoRestaurantsFound: 'לא נמצאו מסעדות',
    searchNoResultsFound: 'לא נמצאו תוצאות',
    dishAverageScore: 'דירוג ממוצע',
    restaurantWithReviews: 'עם ביקורות',
    cameraPermissionRequired: 'נדרש אישור מצלמה',
    cameraEnablePermission: 'אפשר מצלמה',
    cameraCancel: 'ביטול',
    cameraFlashOn: 'פלאש פעיל',
    cameraFlashOff: 'פלאש כבוי',
    cameraProcessing: 'מעבד תמונה...',
    cameraNoImageYet: 'אין תמונה עדיין',
    cameraDetailsBack: 'חזור',
    cameraDetailsTitle: 'פרטי המנה',
    cameraRetake: 'צלם מחדש',
    cameraTakeDishPhoto: 'צלם מנה',
    cameraReviewPlaceholder: 'כתוב דעתך על המנה',
    cameraLoadingRestaurants: 'טוען מסעדות…',
    cameraSearchRestaurantPlaceholder: 'חיפוש מסעדה…',
    cameraNoRestaurantsFound: 'לא נמצאו מסעדות',
    cameraRestaurantsGroup: 'מסעדות',
    cameraChooseRestaurantFirst: 'בחר מסעדה קודם',
    cameraLoadingDishes: 'טוען מנות…',
    cameraRateDish: 'דרג את המנה',
    cameraMissingImageTitle: 'חסרה תמונה',
    cameraTakePhotoFirst: 'אנא צלם תמונה תחילה.',
    cameraMissingRestaurantTitle: 'חסרה מסעדה',
    cameraChooseRestaurant: 'אנא בחר מסעדה.',
    cameraMissingDishTitle: 'חסרה מנה',
    cameraChooseDish: 'אנא בחר מנה.',
    cameraNotSignedInTitle: 'לא מחובר',
    cameraSignInAgain: 'אנא התחבר שוב.',
    cameraRetakePhotoPrompt: 'אנא צלם מחדש.',
    cameraSaveFailed: 'שמירה נכשלה',
    editDishTitle: 'עריכת מנה',
    editDishNotFound: 'המנה לא נמצאה.',
    legalPrivacyTitle: 'מדיניות פרטיות',
    legalTermsTitle: 'תנאים',
    launchSubtitle: 'טוען את סביבת העבודה שלך',
    authWorkEmail: 'אימייל מקום העבודה',
    authPassword: 'סיסמה',
    authPasswordConfirm: 'אישור סיסמה',
    authAcceptTerms: 'מאשר תנאי שימוש',
    authForgotPassword: 'שכחת סיסמה?',
    authResetEmailMissing: 'יש להזין כתובת אימייל כדי לאפס סיסמה.',
    authResetEmailSentTitle: 'נשלח מייל לאיפוס סיסמה',
    authResetEmailSentMessage: 'שלחנו קישור לאיפוס הסיסמה לכתובת האימייל שהזנת.',
    authVerifyEmailSentTitle: 'נשלח מייל לאימות',
    authVerifyEmailSentMessage: 'שלחנו מייל לאימות החשבון. לחצו על הקישור במייל כדי להשלים את ההרשמה.',
    authCallbackLoading: 'מאמתים את הקישור המאובטח...',
    authLinkInvalid: 'הקישור אינו תקין או שפג תוקפו.',
    authResetPasswordTitle: 'בחירת סיסמה חדשה',
    authResetPasswordSubtitle: 'הזינו סיסמה חדשה כדי להשלים את האיפוס.',
    authUpdatePassword: 'עדכן סיסמה',
    authPasswordUpdatedTitle: 'הסיסמה עודכנה',
    authPasswordUpdatedMessage: 'הסיסמה החדשה נשמרה בהצלחה.',
    authResetPasswordFailed: 'עדכון הסיסמה נכשל.',
    authCreateAccount: 'צור חשבון',
    authBackToSignIn: 'חזרה להתחברות',
    authSignIn: 'התחבר',
    authEnterEmailPassword: 'אנא הזן אימייל וסיסמה.',
    authEnterEmailPasswordConfirm: 'אנא הזן אימייל, סיסמה ואישור סיסמה.',
    authMustAcceptTerms: 'יש לאשר את תנאי השימוש כדי ליצור חשבון.',
    authPasswordsMismatch: 'הסיסמאות אינן תואמות.',
    authInvalidCredentials: 'האימייל או הסיסמה שגויים.',
    authEmailNotConfirmed: 'יש לאשר את כתובת האימייל לפני ההתחברות.',
    authUserExists: 'המשתמש כבר קיים במערכת.',
    authPasswordTooShort: 'הסיסמה חייבת להכיל לפחות 6 תווים.',
    authSignupDisabled: 'ההרשמה אינה זמינה כרגע.',
    authRateLimit: 'בוצעו יותר מדי ניסיונות. נסה שוב בעוד כמה דקות.',
    authCompanyMatchError: 'ההרשמה נכשלה. בדוק שכתובת האימייל שייכת לחברה קיימת.',
    authEmailDomainUnknown: 'דומיין האימייל אינו משויך לחברה מוכרת.',
    authEmailDomainMissing: 'יש להזין כתובת אימייל מלאה של מקום העבודה.',
    authGenericError: 'אירעה שגיאה. נסה שוב.',
    authLoginFailed: 'התחברות נכשלה.',
    authSignupFailed: 'הרשמה נכשלה.',
    accountTitle: 'החשבון שלי',
    accountEmailLabel: 'אימייל',
    accountLanguageLabel: 'שפה',
    accountLanguageDescription: 'בחר את שפת הממשק',
    accountLanguageHebrew: 'עברית',
    accountLanguageEnglish: 'English',
    accountPermissionRequired: 'נדרש אישור',
    accountAllowGallery: 'אנא אפשר גישה לגלריה.',
    accountUploadFailed: 'העלאה נכשלה',
    accountAllowCamera: 'אנא אפשר גישה למצלמה.',
    accountCameraFailed: 'צילום נכשל',
    accountImageProcessingFailed: 'כשל בעיבוד התמונה',
    accountSaveFailed: 'שמירה נכשלה',
    accountDeleteTitle: 'מחיקת חשבון',
    accountDeleteMessage: 'האם למחוק את החשבון וכל המנות שהעלית?',
    accountDeleteAction: 'מחק חשבון',
    accountUnauthorized: 'אין הרשאה',
    accountReloginToDelete: 'יש להתחבר מחדש כדי למחוק את החשבון.',
    accountDeleteFailed: 'מחיקה נכשלה',
    dishDeleteTitle: 'מחיקת מנה',
    dishDeleteMessage: 'האם למחוק את המנה והביקורות שלה?',
    dishDeleteUnauthorized: 'אפשר למחוק רק מנות שהעלית.',
  },
  en: {
    commonSave: 'Save',
    commonCancel: 'Cancel',
    commonClose: 'Close',
    commonConfirm: 'OK',
    commonDelete: 'Delete',
    commonNoDishesToShow: 'No Dishes to Show',
    commonUnexpectedError: 'An unexpected error occurred.',
    headerMenuAccount: 'My account',
    headerMenuMyDishes: 'My dishes',
    headerMenuFavorites: 'Favorites',
    favoritesTitle: 'Favorites',
    favoritesEmpty: 'No Favorite Dishes',
    headerMenuPrivacy: 'Privacy policy',
    headerMenuTerms: 'Terms',
    headerMenuSignOut: 'Sign out',
    ratingTasty: 'Tasty',
    ratingSize: 'Size',
    orderAction: 'Order',
    homeSearchPlaceholder: 'Search Dishes',
    searchTitle: 'Search',
    searchAllDishes: 'All Dishes',
    searchUploadedDishes: 'Uploaded Dishes',
    searchRestaurantPlaceholder: 'Search Restaurant',
    searchChooseRestaurant: 'Choose Restaurant',
    searchChooseRestaurantFirst: 'First Choose Restaurant',
    searchDishPlaceholder: 'Search Dish',
    searchDishPrompt: 'Enter or Choose a Dish',
    searchExpandAll: 'Expand All',
    searchCollapseAll: 'Collapse All',
    searchResultsForRestaurant: 'Results for Restaurant',
    searchNoDishesFound: 'No Dishes Found',
    searchNoRestaurantsFound: 'No Restaurants Found',
    searchNoResultsFound: 'No Results Found',
    dishAverageScore: 'Avarge Score',
    restaurantWithReviews: 'With Reviews',
    cameraPermissionRequired: 'Camera permission required',
    cameraEnablePermission: 'Enable Camera',
    cameraCancel: 'Cancel',
    cameraFlashOn: 'Flash On',
    cameraFlashOff: 'Flash Off',
    cameraProcessing: 'Processing image...',
    cameraNoImageYet: 'No image yet',
    cameraDetailsBack: 'Back',
    cameraDetailsTitle: 'Dish Details',
    cameraRetake: 'Retake',
    cameraTakeDishPhoto: 'Take Dish Photo',
    cameraReviewPlaceholder: 'Write your thoughts about the dish',
    cameraLoadingRestaurants: 'Loading restaurants...',
    cameraSearchRestaurantPlaceholder: 'Search Restaurant',
    cameraNoRestaurantsFound: 'No Restaurants Found',
    cameraRestaurantsGroup: 'Restaurants',
    cameraChooseRestaurantFirst: 'First Choose Restaurant',
    cameraLoadingDishes: 'Loading dishes...',
    cameraRateDish: 'Rate the Dish',
    cameraMissingImageTitle: 'Missing Image',
    cameraTakePhotoFirst: 'Please take a photo first.',
    cameraMissingRestaurantTitle: 'Missing Restaurant',
    cameraChooseRestaurant: 'Please choose a restaurant.',
    cameraMissingDishTitle: 'Missing Dish',
    cameraChooseDish: 'Please choose a dish.',
    cameraNotSignedInTitle: 'Not signed in',
    cameraSignInAgain: 'Please sign in again.',
    cameraRetakePhotoPrompt: 'Please retake the photo.',
    cameraSaveFailed: 'Save failed',
    editDishTitle: 'Edit Dish',
    editDishNotFound: 'Dish not found.',
    legalPrivacyTitle: 'Privacy policy',
    legalTermsTitle: 'Terms',
    launchSubtitle: 'Loading your workspace',
    authWorkEmail: 'Work email',
    authPassword: 'Password',
    authPasswordConfirm: 'Confirm password',
    authAcceptTerms: 'I accept the terms of use',
    authForgotPassword: 'Forgot password?',
    authResetEmailMissing: 'Please enter your email address to reset your password.',
    authResetEmailSentTitle: 'Password reset email sent',
    authResetEmailSentMessage: 'We sent a password reset link to the email address you entered.',
    authVerifyEmailSentTitle: 'Verification email sent',
    authVerifyEmailSentMessage: 'We sent a verification email. Tap the link in the email to finish creating your account.',
    authCallbackLoading: 'Checking your secure link...',
    authLinkInvalid: 'This link is invalid or has expired.',
    authResetPasswordTitle: 'Choose a new password',
    authResetPasswordSubtitle: 'Enter a new password to finish resetting your account.',
    authUpdatePassword: 'Update password',
    authPasswordUpdatedTitle: 'Password updated',
    authPasswordUpdatedMessage: 'Your new password was saved successfully.',
    authResetPasswordFailed: 'Password update failed.',
    authCreateAccount: 'Create account',
    authBackToSignIn: 'Back to sign in',
    authSignIn: 'Sign in',
    authEnterEmailPassword: 'Please enter your email and password.',
    authEnterEmailPasswordConfirm: 'Please enter email, password, and password confirmation.',
    authMustAcceptTerms: 'You must accept the terms to create an account.',
    authPasswordsMismatch: 'Passwords do not match.',
    authInvalidCredentials: 'The email or password is incorrect.',
    authEmailNotConfirmed: 'Please confirm your email address before signing in.',
    authUserExists: 'This user already exists.',
    authPasswordTooShort: 'Password must be at least 6 characters.',
    authSignupDisabled: 'Sign-up is currently unavailable.',
    authRateLimit: 'Too many attempts. Try again in a few minutes.',
    authCompanyMatchError: 'Sign-up failed. Make sure your email belongs to an existing company.',
    authEmailDomainUnknown: 'This email domain is not linked to a known company.',
    authEmailDomainMissing: 'Please enter your full work email address.',
    authGenericError: 'Something went wrong. Please try again.',
    authLoginFailed: 'Sign-in failed.',
    authSignupFailed: 'Sign-up failed.',
    accountTitle: 'My account',
    accountEmailLabel: 'Email',
    accountLanguageLabel: 'Language',
    accountLanguageDescription: 'Choose the app language',
    accountLanguageHebrew: 'Hebrew',
    accountLanguageEnglish: 'English',
    accountPermissionRequired: 'Permission required',
    accountAllowGallery: 'Please allow access to the photo library.',
    accountUploadFailed: 'Upload failed',
    accountAllowCamera: 'Please allow camera access.',
    accountCameraFailed: 'Camera capture failed',
    accountImageProcessingFailed: 'Image processing failed',
    accountSaveFailed: 'Save failed',
    accountDeleteTitle: 'Delete account',
    accountDeleteMessage: 'Delete your account and all dishes you uploaded?',
    accountDeleteAction: 'Delete account',
    accountUnauthorized: 'Not authorized',
    accountReloginToDelete: 'Please sign in again to delete your account.',
    accountDeleteFailed: 'Delete failed',
    dishDeleteTitle: 'Delete Dish',
    dishDeleteMessage: 'Delete this dish and its reviews?',
    dishDeleteUnauthorized: 'You can only delete dishes you uploaded.',
  },
} as const;

export type TranslationKey = keyof typeof translations.he;

export const getLegalUrl = (locale: Locale, section: 'terms' | 'privacy') => {
  const base =
    locale === 'en'
      ? 'https://termsen.dishguru.app/index_en.html'
      : 'https://termsheb.dishguru.app';
  return `${base}#${section}`;
};

type LocaleContextValue = {
  locale: Locale;
  isRTL: boolean;
  setLocale: (next: Locale) => Promise<void>;
  t: (key: TranslationKey) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('he');

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(LOCALE_STORAGE_KEY).then((stored) => {
      if (!mounted) return;
      if (stored === 'he' || stored === 'en') {
        setLocaleState(stored);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const setLocale = async (next: Locale) => {
    setLocaleState(next);
    await AsyncStorage.setItem(LOCALE_STORAGE_KEY, next);
  };

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      isRTL: locale === 'he',
      setLocale,
      t: (key) => translations[locale][key] ?? translations.he[key],
    }),
    [locale]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error('useLocale must be used within a LocaleProvider');
  }
  return context;
}
