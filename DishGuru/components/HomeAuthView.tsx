import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../lib/theme';

type Props = {
  isRTL: boolean;
  locale: 'he' | 'en';
  t: (key: any) => string;
  email: string;
  pass: string;
  confirmPass: string;
  showSignup: boolean;
  acceptedTerms: boolean;
  showPass: boolean;
  showConfirmPass: boolean;
  authError: string | null;
  authLoading: boolean;
  onLocaleChange: (locale: 'he' | 'en') => void;
  onEmailChange: (value: string) => void;
  onPassChange: (value: string) => void;
  onConfirmPassChange: (value: string) => void;
  onToggleShowPass: () => void;
  onToggleShowConfirmPass: () => void;
  onToggleAcceptedTerms: () => void;
  onOpenTerms: () => void;
  onForgotPassword: () => void;
  onSignIn: () => void;
  onSignUp: () => void;
  onShowSignup: () => void;
  onBackToSignIn: () => void;
  onBrowseGuest: () => void;
};

export default function HomeAuthView({
  isRTL,
  locale,
  t,
  email,
  pass,
  confirmPass,
  showSignup,
  acceptedTerms,
  showPass,
  showConfirmPass,
  authError,
  authLoading,
  onLocaleChange,
  onEmailChange,
  onPassChange,
  onConfirmPassChange,
  onToggleShowPass,
  onToggleShowConfirmPass,
  onToggleAcceptedTerms,
  onOpenTerms,
  onForgotPassword,
  onSignIn,
  onSignUp,
  onShowSignup,
  onBackToSignIn,
  onBrowseGuest,
}: Props) {
  return (
    <KeyboardAvoidingView
      style={styles.authKeyboardAvoiding}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
    >
      <ScrollView
        style={styles.authScroll}
        contentContainerStyle={styles.authScrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={styles.authScreen}>
          <View style={[styles.authLanguageRow, !isRTL && styles.authLanguageRowLtr]}>
            {([
              ['he', t('accountLanguageHebrew')],
              ['en', t('accountLanguageEnglish')],
            ] as const).map(([value, label]) => (
              <Pressable
                key={value}
                style={[
                  styles.authLanguageChip,
                  locale === value && styles.authLanguageChipActive,
                ]}
                onPress={() => onLocaleChange(value)}
              >
                <Text
                  style={[
                    styles.authLanguageChipText,
                    locale === value && styles.authLanguageChipTextActive,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.authHeaderWrap}>
            <Text style={styles.authTitle}>Take Away - The Reality Version</Text>
          </View>
          <View style={styles.authCard}>
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, !isRTL && styles.fieldLabelLtr]}>
                {t('authWorkEmail')}
              </Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.inputField}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={onEmailChange}
                  placeholder=""
                  textAlign="left"
                  selectionColor={theme.colors.accent}
                  cursorColor={theme.colors.accent}
                />
              </View>
            </View>
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, !isRTL && styles.fieldLabelLtr]}>
                {t('authPassword')}
              </Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.inputFieldPassword}
                  placeholder=""
                  secureTextEntry={!showPass}
                  value={pass}
                  onChangeText={onPassChange}
                  textAlign="left"
                  selectionColor={theme.colors.accent}
                  cursorColor={theme.colors.accent}
                />
                <Pressable style={styles.eyeButton} onPress={onToggleShowPass}>
                  <Ionicons
                    name={showPass ? 'eye-off' : 'eye'}
                    size={18}
                    color={theme.colors.textMuted}
                  />
                </Pressable>
              </View>
            </View>
            {showSignup ? (
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, !isRTL && styles.fieldLabelLtr]}>
                  {t('authPasswordConfirm')}
                </Text>
                <View style={styles.inputRow}>
                  <TextInput
                    style={styles.inputFieldPassword}
                    placeholder=""
                    secureTextEntry={!showConfirmPass}
                    value={confirmPass}
                    onChangeText={onConfirmPassChange}
                    textAlign="left"
                    selectionColor={theme.colors.accent}
                    cursorColor={theme.colors.accent}
                  />
                  <Pressable style={styles.eyeButton} onPress={onToggleShowConfirmPass}>
                    <Ionicons
                      name={showConfirmPass ? 'eye-off' : 'eye'}
                      size={18}
                      color={theme.colors.textMuted}
                    />
                  </Pressable>
                </View>
              </View>
            ) : null}
            {showSignup ? (
              <Pressable
                style={({ pressed }) => [
                  styles.termsRow,
                  !isRTL && styles.termsRowLtr,
                  pressed && styles.termsRowPressed,
                ]}
                onPress={onToggleAcceptedTerms}
              >
                <Pressable
                  onPress={onOpenTerms}
                  style={[styles.termsTextWrap, !isRTL && styles.termsTextWrapLtr]}
                >
                  <Text style={[styles.termsText, !isRTL && styles.termsTextLtr]}>
                    {t('authAcceptTerms')}
                  </Text>
                </Pressable>
                <View style={[styles.termsCheckbox, acceptedTerms && styles.termsCheckboxChecked]}>
                  {acceptedTerms ? (
                    <Ionicons name="checkmark" size={16} color={theme.colors.white} />
                  ) : null}
                </View>
              </Pressable>
            ) : null}
            {!showSignup ? (
              <Pressable onPress={onForgotPassword} disabled={authLoading}>
                <Text
                  style={[
                    styles.forgotPasswordText,
                    !isRTL && styles.forgotPasswordTextLtr,
                    authLoading && styles.authLoadingDimmed,
                  ]}
                >
                  {t('authForgotPassword')}
                </Text>
              </Pressable>
            ) : null}
            {authError ? (
              <Text style={[styles.authErrorText, !isRTL && styles.authErrorTextLtr]}>
                {authError}
              </Text>
            ) : null}
            {showSignup ? (
              <>
                <Pressable
                  style={({ pressed }) => [styles.loginButton, pressed && styles.buttonPressed]}
                  onPress={onSignUp}
                  disabled={authLoading}
                >
                  {authLoading ? (
                    <ActivityIndicator color={theme.colors.white} />
                  ) : (
                    <Text style={styles.loginButtonText}>{t('authCreateAccount')}</Text>
                  )}
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.signupButton, pressed && styles.buttonPressed]}
                  onPress={onBackToSignIn}
                  disabled={authLoading}
                >
                  <Text style={styles.signupButtonText}>{t('authBackToSignIn')}</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Pressable
                  style={({ pressed }) => [styles.loginButton, pressed && styles.buttonPressed]}
                  onPress={onSignIn}
                  disabled={authLoading}
                >
                  {authLoading ? (
                    <ActivityIndicator color={theme.colors.white} />
                  ) : (
                    <Text style={styles.loginButtonText}>{t('authSignIn')}</Text>
                  )}
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.signupButton, pressed && styles.buttonPressed]}
                  onPress={onShowSignup}
                  disabled={authLoading}
                >
                  <Text style={styles.signupButtonText}>{t('authCreateAccount')}</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.guestButton, pressed && styles.buttonPressed]}
                  onPress={onBrowseGuest}
                  disabled={authLoading}
                >
                  <Text style={styles.guestButtonText}>{t('authBrowseAsGuest')}</Text>
                </Pressable>
                <Text style={[styles.guestHintText, !isRTL && styles.guestHintTextLtr]}>
                  {t('authBrowseAsGuestHint')}
                </Text>
              </>
            )}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  authScreen: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 4,
    gap: 8,
    paddingTop: 72,
    paddingBottom: 28,
  },
  authKeyboardAvoiding: {
    flex: 1,
  },
  authScroll: {
    flex: 1,
  },
  authScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  authLanguageRow: {
    width: '100%',
    maxWidth: 580,
    flexDirection: 'row-reverse',
    justifyContent: 'flex-start',
    gap: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  authLanguageRowLtr: {
    flexDirection: 'row',
  },
  authLanguageChip: {
    minWidth: 72,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  authLanguageChipActive: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accentSoft,
  },
  authLanguageChipText: {
    fontSize: 12,
    color: theme.colors.textMuted,
    fontFamily: theme.typography.semibold,
  },
  authLanguageChipTextActive: {
    color: theme.colors.accent,
  },
  authHeaderWrap: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    paddingHorizontal: 12,
    marginTop: 18,
    marginBottom: 28,
  },
  authTitle: {
    fontSize: 34,
    color: theme.colors.text,
    textAlign: 'center',
    fontFamily: 'Heebo_700Bold',
    lineHeight: 40,
  },
  authCard: {
    alignSelf: 'stretch',
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 20,
    padding: 20,
    gap: 16,
    shadowColor: theme.colors.ink,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
    width: '100%',
    maxWidth: 580,
  },
  fieldGroup: {
    gap: 9,
  },
  fieldLabel: {
    fontSize: 14,
    color: theme.colors.textMuted,
    textAlign: 'right',
    alignSelf: 'flex-end',
    paddingRight: 4,
    fontFamily: theme.typography.semibold,
  },
  fieldLabelLtr: {
    textAlign: 'left',
    alignSelf: 'flex-start',
    paddingRight: 0,
    paddingLeft: 4,
  },
  inputRow: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    height: 46,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    backgroundColor: theme.colors.cardAlt,
  },
  inputField: {
    flex: 1,
    fontSize: 16,
    textAlign: 'left',
    color: theme.colors.text,
    writingDirection: 'ltr',
    paddingLeft: 4,
    paddingRight: 4,
  },
  inputFieldPassword: {
    flex: 1,
    fontSize: 16,
    textAlign: 'left',
    color: theme.colors.text,
    writingDirection: 'ltr',
    paddingLeft: 4,
    paddingRight: 44,
  },
  eyeButton: {
    position: 'absolute',
    right: 10,
    top: 7,
    height: 32,
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    zIndex: 2,
  },
  forgotPasswordText: {
    fontSize: 12,
    color: theme.colors.danger,
    textAlign: 'right',
    marginTop: -2,
  },
  forgotPasswordTextLtr: {
    textAlign: 'left',
    alignSelf: 'flex-start',
  },
  authLoadingDimmed: {
    opacity: 0.6,
  },
  termsRow: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.cardAlt,
    borderRadius: 14,
    paddingHorizontal: 14,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  termsRowLtr: {
    flexDirection: 'row',
  },
  termsRowPressed: {
    opacity: 0.92,
  },
  termsTextWrap: {
    flex: 1,
    alignItems: 'flex-end',
  },
  termsTextWrapLtr: {
    alignItems: 'flex-start',
  },
  termsCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.white,
  },
  termsCheckboxChecked: {
    backgroundColor: theme.colors.accent,
  },
  termsText: {
    color: theme.colors.text,
    textAlign: 'right',
    textDecorationLine: 'underline',
    fontSize: 14,
  },
  termsTextLtr: {
    textAlign: 'left',
  },
  authErrorText: {
    color: theme.colors.danger,
    fontSize: 13,
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 20,
  },
  authErrorTextLtr: {
    textAlign: 'left',
    writingDirection: 'ltr',
  },
  loginButton: {
    height: 44,
    borderRadius: 12,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontFamily: theme.typography.semibold,
  },
  signupButton: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signupButtonText: {
    color: theme.colors.accent,
    fontSize: 14,
    fontFamily: theme.typography.semibold,
  },
  guestButton: {
    marginTop: 10,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.white,
  },
  guestButtonText: {
    color: theme.colors.accent,
    fontSize: 14,
    fontFamily: theme.typography.semibold,
  },
  guestHintText: {
    marginTop: 10,
    color: theme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  guestHintTextLtr: {
    textAlign: 'left',
    writingDirection: 'ltr',
  },
  buttonPressed: {
    transform: [{ scale: 0.98 }],
  },
});
