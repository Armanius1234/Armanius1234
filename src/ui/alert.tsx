/**
 * Alert.alert that also works in the browser.
 *
 * On the phone it is the system dialog, as before. React Native Web's own
 * Alert does nothing, so on the web the same call shows a PL8 dialog instead
 * (rendered by <DialogHost />, which the root layout mounts once).
 *
 * Use `import { Alert } from '@/ui/alert'` everywhere; the lint config forbids
 * importing Alert from react-native.
 */
import { useEffect, useSyncExternalStore } from 'react';
// eslint-disable-next-line no-restricted-imports -- this file wraps it
import { Alert as NativeAlert, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';

import { useI18n } from '@/i18n';
import { colors, radius, spacing } from '@/theme/tokens';

import { AppText } from './AppText';

export type AlertButton = {
  text?: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
};

type Dialog = { id: number; title: string; message?: string; buttons: AlertButton[] };

// Dialogs waiting to be shown, oldest first. A button press closes the dialog
// before running its action, so an action can open the next dialog.
let queue: Dialog[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function publish() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const snapshot = () => queue;

/** The web dialog. Exported for tests; the app calls Alert.alert. */
export function showWebDialog(title: string, message?: string, buttons?: AlertButton[]) {
  queue = [...queue, { id: nextId++, title, message, buttons: buttons?.length ? buttons : [{}] }];
  publish();
}

function close(dialog: Dialog, button?: AlertButton) {
  queue = queue.filter((d) => d.id !== dialog.id);
  publish();
  button?.onPress?.();
}

export const Alert = {
  // Arguments are passed on unchanged, so the phone behaves exactly as before.
  alert(...args: [title: string, message?: string, buttons?: AlertButton[]]) {
    if (Platform.OS === 'web') showWebDialog(...args);
    else NativeAlert.alert(...args);
  },
};

/** Shows the web dialogs. Mounted once in the root layout; renders nothing on the phone. */
export function DialogHost() {
  const { t } = useI18n();
  const dialogs = useSyncExternalStore(subscribe, snapshot, snapshot);

  const dialog = dialogs[0];
  const cancel = dialog?.buttons.find((b) => b.style === 'cancel');

  // Escape closes the dialog like "Cancel" (or "OK" when that is the only button).
  useEffect(() => {
    if (!dialog || typeof document === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (cancel) close(dialog, cancel);
      else if (dialog.buttons.length === 1) close(dialog, dialog.buttons[0]);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [dialog, cancel]);

  if (!dialog) return null;
  // Like the phone: the cancel button goes last.
  const ordered = [...dialog.buttons.filter((b) => b !== cancel), ...(cancel ? [cancel] : [])];

  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => cancel && close(dialog, cancel)}>
      <View style={styles.backdrop}>
        {/* Tapping outside cancels, if there is a cancel button. */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => cancel && close(dialog, cancel)}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
        <View style={styles.card} accessibilityRole="alert" accessibilityViewIsModal aria-modal>
          <AppText variant="heading">{dialog.title}</AppText>
          {dialog.message ? <AppText color="textSecondary">{dialog.message}</AppText> : null}
          <View style={styles.buttons}>
            {ordered.map((b, i) => {
              const label = b.text ?? t('common.ok');
              return (
                <Pressable
                  key={`${dialog.id}-${i}`}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  onPress={() => close(dialog, b)}
                  style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
                >
                  <AppText
                    variant="bodyStrong"
                    color={b.style === 'destructive' ? 'danger' : b.style === 'cancel' ? 'textSecondary' : 'accent'}
                  >
                    {label}
                  </AppText>
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
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  buttons: { marginTop: spacing.sm, gap: spacing.xs },
  button: {
    minHeight: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgPrimary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonPressed: { opacity: 0.7 },
});
