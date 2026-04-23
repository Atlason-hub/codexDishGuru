import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { showAppDialog } from '../lib/appDialog';
import { useLocale } from '../lib/locale';
import { supabase } from '../lib/supabase';
import { theme } from '../lib/theme';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { isRTL, t } = useLocale();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!password.trim() || !confirmPassword.trim()) {
      setError(t('authEnterEmailPasswordConfirm'));
      return;
    }
    if (password !== confirmPassword) {
      setError(t('authPasswordsMismatch'));
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        throw updateError;
      }
      showAppDialog({
        title: t('authPasswordUpdatedTitle'),
        message: t('authPasswordUpdatedMessage'),
        actions: [{ text: t('commonConfirm'), onPress: () => router.replace('/') }],
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : t('authResetPasswordFailed');
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.card}>
        <Text style={[styles.title, !isRTL && styles.titleLtr]}>{t('authResetPasswordTitle')}</Text>
        <Text style={[styles.subtitle, !isRTL && styles.titleLtr]}>{t('authResetPasswordSubtitle')}</Text>

        <View style={styles.fieldGroup}>
          <Text style={[styles.fieldLabel, !isRTL && styles.fieldLabelLtr]}>{t('authPassword')}</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.inputField}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              textAlign="left"
              selectionColor={theme.colors.accent}
              cursorColor={theme.colors.accent}
            />
            <Pressable style={styles.eyeButton} onPress={() => setShowPassword((value) => !value)}>
              <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={18} color={theme.colors.textMuted} />
            </Pressable>
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={[styles.fieldLabel, !isRTL && styles.fieldLabelLtr]}>{t('authPasswordConfirm')}</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.inputField}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showConfirmPassword}
              textAlign="left"
              selectionColor={theme.colors.accent}
              cursorColor={theme.colors.accent}
            />
            <Pressable style={styles.eyeButton} onPress={() => setShowConfirmPassword((value) => !value)}>
              <Ionicons name={showConfirmPassword ? 'eye-off' : 'eye'} size={18} color={theme.colors.textMuted} />
            </Pressable>
          </View>
        </View>

        {error ? <Text style={[styles.errorText, !isRTL && styles.fieldLabelLtr]}>{error}</Text> : null}

        <Pressable style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]} onPress={submit} disabled={loading}>
          {loading ? <ActivityIndicator color={theme.colors.white} /> : <Text style={styles.buttonText}>{t('authUpdatePassword')}</Text>}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 22,
    paddingVertical: 24,
  },
  title: {
    color: theme.colors.text,
    fontSize: 32,
    fontWeight: '700',
    textAlign: 'right',
  },
  titleLtr: {
    textAlign: 'left',
  },
  subtitle: {
    marginTop: 10,
    color: theme.colors.ink,
    fontSize: 17,
    lineHeight: 28,
    textAlign: 'right',
  },
  fieldGroup: {
    marginTop: 22,
  },
  fieldLabel: {
    marginBottom: 8,
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'right',
  },
  fieldLabelLtr: {
    textAlign: 'left',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 18,
    paddingHorizontal: 16,
    minHeight: 54,
    backgroundColor: theme.colors.white,
  },
  inputField: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 18,
    paddingVertical: 12,
  },
  eyeButton: {
    paddingLeft: 12,
    paddingVertical: 6,
  },
  errorText: {
    marginTop: 16,
    color: theme.colors.danger,
    fontSize: 15,
    lineHeight: 24,
  },
  button: {
    alignSelf: 'flex-end',
    marginTop: 22,
    minWidth: 170,
    minHeight: 54,
    borderRadius: 20,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  buttonPressed: {
    opacity: 0.88,
  },
  buttonText: {
    color: theme.colors.white,
    fontSize: 18,
    fontWeight: '700',
  },
});
