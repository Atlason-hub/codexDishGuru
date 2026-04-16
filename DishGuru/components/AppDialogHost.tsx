import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../lib/theme';
import {
  AppDialogAction,
  AppDialogOptions,
  registerAppDialogPresenter,
} from '../lib/appDialog';

type ActiveDialog = AppDialogOptions & { visible: boolean };

const DEFAULT_ACTIONS: AppDialogAction[] = [{ text: 'אישור', style: 'default' }];

export default function AppDialogHost() {
  const [dialog, setDialog] = useState<ActiveDialog | null>(null);

  useEffect(() => {
    registerAppDialogPresenter((options) => {
      setDialog({ ...options, visible: true });
    });
    return () => registerAppDialogPresenter(null);
  }, []);

  const actions = dialog?.actions?.length ? dialog.actions : DEFAULT_ACTIONS;

  const closeDialog = () => setDialog(null);

  const handleAction = async (action: AppDialogAction) => {
    closeDialog();
    if (action.onPress) {
      await Promise.resolve(action.onPress());
    }
  };

  return (
    <Modal
      visible={Boolean(dialog?.visible)}
      transparent
      animationType="fade"
      onRequestClose={closeDialog}
    >
      <View style={styles.backdrop}>
        <Pressable style={styles.overlay} onPress={closeDialog} />
        <View style={styles.card}>
          <Text style={styles.title}>{dialog?.title ?? ''}</Text>
          {dialog?.message ? <Text style={styles.message}>{dialog.message}</Text> : null}
          <View style={styles.actionsRow}>
            {actions.map((action, index) => {
              const isPrimary = (action.style ?? 'default') === 'default';
              const isDestructive = action.style === 'destructive';
              return (
                <Pressable
                  key={`${action.text}-${index}`}
                  style={({ pressed }) => [
                    styles.actionButton,
                    isPrimary && styles.primaryAction,
                    isDestructive && styles.destructiveAction,
                    pressed && styles.actionPressed,
                  ]}
                  onPress={() => {
                    void handleAction(action);
                  }}
                >
                  <Text
                    style={[
                      styles.actionText,
                      isPrimary && styles.primaryActionText,
                      isDestructive && styles.destructiveActionText,
                    ]}
                  >
                    {action.text}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(24, 15, 10, 0.42)',
    paddingHorizontal: 22,
  },
  overlay: {
    position: 'absolute',
    inset: 0,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: theme.colors.card,
    borderRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  title: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 28,
  },
  message: {
    marginTop: 14,
    color: theme.colors.ink,
    fontSize: 16,
    lineHeight: 28,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  actionsRow: {
    marginTop: 22,
    flexDirection: 'row-reverse',
    gap: 10,
    justifyContent: 'flex-start',
    flexWrap: 'wrap',
  },
  actionButton: {
    minWidth: 104,
    minHeight: 46,
    paddingHorizontal: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.card,
  },
  primaryAction: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  destructiveAction: {
    borderColor: theme.colors.danger,
    backgroundColor: theme.colors.card,
  },
  actionPressed: {
    opacity: 0.88,
  },
  actionText: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  primaryActionText: {
    color: theme.colors.white,
  },
  destructiveActionText: {
    color: theme.colors.danger,
  },
});
