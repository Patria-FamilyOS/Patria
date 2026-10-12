import { type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing, type } from '../theme';

type ScreenProps = {
  children: ReactNode;
  accessibilityLabel?: string;
  withHeader?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
};

export function Screen({
  children,
  accessibilityLabel,
  withHeader = false,
  refreshing = false,
  onRefresh,
}: ScreenProps) {
  return (
    <SafeAreaView
      style={styles.safe}
      edges={withHeader ? ['bottom', 'left', 'right'] : ['top', 'bottom', 'left', 'right']}
      accessibilityLabel={accessibilityLabel}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        alwaysBounceVertical={Boolean(onRefresh)}
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          ) : undefined
        }
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

type TitleProps = { children: ReactNode };

export function Title({ children }: TitleProps) {
  return (
    <Text
      allowFontScaling
      maxFontSizeMultiplier={type.titleMaxMultiplier}
      style={styles.title}
    >
      {children}
    </Text>
  );
}

export function Body({ children }: TitleProps) {
  return (
    <Text allowFontScaling style={styles.body}>
      {children}
    </Text>
  );
}

export function Muted({ children }: TitleProps) {
  return (
    <Text allowFontScaling style={styles.muted}>
      {children}
    </Text>
  );
}

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  busy?: boolean;
  accessibilityHint?: string;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  busy = false,
  accessibilityHint,
}: ButtonProps) {
  const inactive = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'danger' && styles.buttonDanger,
        inactive && styles.buttonDisabled,
        pressed && !inactive && styles.buttonPressed,
      ]}
    >
      {busy ? (
        <ActivityIndicator
          color={variant === 'secondary' ? colors.primary : colors.onPrimary}
        />
      ) : (
        <Text
          allowFontScaling
          style={[
            styles.buttonLabel,
            variant === 'secondary' && styles.buttonLabelSecondary,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

type FieldProps = TextInputProps & {
  label: string;
  error?: string;
};

export function Field({ label, error, ...inputProps }: FieldProps) {
  return (
    <View style={styles.field}>
      <Text allowFontScaling style={styles.fieldLabel}>
        {label}
      </Text>
      <TextInput
        {...inputProps}
        allowFontScaling
        accessibilityLabel={label}
        placeholderTextColor={colors.textMuted}
        style={styles.input}
        textAlignVertical="center"
      />
      {error ? (
        <Text allowFontScaling style={styles.fieldError}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

type StatusProps = { message: string };

export function LoadingState({ message }: StatusProps) {
  return (
    <View style={styles.status} accessibilityRole="progressbar" accessibilityLabel={message}>
      <ActivityIndicator color={colors.primary} />
      <Text allowFontScaling style={styles.muted}>
        {message}
      </Text>
    </View>
  );
}

export function ErrorState({ message }: StatusProps) {
  return (
    <Text allowFontScaling style={styles.fieldError} accessibilityRole="alert">
      {message}
    </Text>
  );
}

export function EmptyState({ message }: StatusProps) {
  return (
    <Text allowFontScaling style={styles.muted}>
      {message}
    </Text>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  title: {
    ...type.heading,
    color: colors.primary,
  },
  body: {
    ...type.body,
    color: colors.text,
  },
  muted: {
    ...type.caption,
    color: colors.textMuted,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 28,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  buttonDanger: {
    backgroundColor: colors.danger,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonLabel: {
    ...type.body,
    color: colors.onPrimary,
    fontWeight: '600',
    textAlign: 'center',
  },
  buttonLabelSecondary: {
    color: colors.primary,
  },
  field: {
    gap: spacing.xs,
  },
  fieldLabel: {
    ...type.caption,
    color: colors.textMuted,
  },
  input: {
    fontFamily: type.body.fontFamily,
    fontSize: type.body.fontSize,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.chip,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 52,
    color: colors.text,
  },
  fieldError: {
    ...type.caption,
    color: colors.danger,
  },
  status: {
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
  },
});
