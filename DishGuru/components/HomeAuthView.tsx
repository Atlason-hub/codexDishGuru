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
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={styles.authScreen}>
          <View pointerEvents="none" style={[styles.authGlow, styles.authGlowBottom]} />
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
            <Text style={styles.authSubtitle}>
              {showSignup ? t('authCreateAccount') : t('authSignIn')}
            </Text>
          </View>
          <View style={styles.authCard}>
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, !isRTL && styles.fieldLabelLtr]}>
                {t('authWorkEmail')}
              </Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.inputField, styles.emailInputField]}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={onEmailChange}
                  placeholder=""
                  textAlign="left"
                  autoCorrect={false}
                  spellCheck={false}
                  textContentType="emailAddress"
                  autoComplete="email"
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
                  returnKeyType={showSignup ? 'next' : 'go'}
                  onSubmitEditing={() => {
                    if (!showSignup) onSignIn();
                  }}
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
                    returnKeyType="go"
                    onSubmitEditing={onSignUp}
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
                  <View pointerEvents="none" style={styles.primaryButtonGloss} />
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
                  <View pointerEvents="none" style={styles.primaryButtonGloss} />
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
    paddingHorizontal: 8,
    gap: 8,
    paddingTop: 56,
    paddingBottom: 36,
    overflow: 'hidden',
  },
  authGlow: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.8,
  },
  authGlowBottom: {
    bottom: 48,
    left: -52,
    width: 170,
    height: 170,
    backgroundColor: 'rgba(214,180,140,0.08)',
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
    backgroundColor: 'rgba(255,255,255,0.82)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  authLanguageChipActive: {
    borderColor: theme.colors.accent,
    backgroundColor: 'rgba(255,248,240,0.96)',
  },
  authLanguageChipText: {
    fontSize: 12,
    color: 'rgba(100,70,44,0.78)',
    fontFamily: theme.typography.semibold,
  },
  authLanguageChipTextActive: {
    color: theme.colors.accent,
  },
  authHeaderWrap: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 12,
    marginTop: 8,
    marginBottom: 20,
  },
  authTitle: {
    fontSize: 34,
    color: theme.colors.text,
    textAlign: 'center',
    fontFamily: 'Heebo_700Bold',
    lineHeight: 40,
  },
  authSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(106,77,49,0.82)',
    textAlign: 'center',
    fontFamily: theme.typography.medium,
  },
  authCard: {
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 24,
    padding: 22,
    gap: 16,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
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
    borderRadius: 16,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(250,246,241,0.96)',
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
  emailInputField: {
    fontSize: 14,
    letterSpacing: -0.1,
    paddingLeft: 0,
    paddingRight: 0,
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
    color: theme.colors.accent,
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
    backgroundColor: 'rgba(250,246,241,0.96)',
    borderRadius: 16,
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
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(231,90,90,0.16)',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  authErrorTextLtr: {
    textAlign: 'left',
    writingDirection: 'ltr',
  },
  loginButton: {
    height: 44,
    borderRadius: 16,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#b75a1d',
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  primaryButtonGloss: {
    position: 'absolute',
    top: 0,
    left: 10,
    right: 10,
    height: '54%',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  loginButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontFamily: theme.typography.semibold,
  },
  signupButton: {
    height: 44,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,250,245,0.98)',
  },
  signupButtonText: {
    color: theme.colors.accent,
    fontSize: 14,
    fontFamily: theme.typography.semibold,
  },
  guestButton: {
    marginTop: 10,
    minHeight: 44,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.96)',
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
