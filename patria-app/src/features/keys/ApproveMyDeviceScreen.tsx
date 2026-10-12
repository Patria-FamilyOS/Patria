import { StyleSheet, View } from 'react-native';

import { AppText, Button, Muted } from '../../components/ui';
import { copy } from '../../lib/copy';
import type { FirstDeviceNotice } from '../../lib/crypto/deviceAccess';
import { colors, spacing, type } from '../../theme';

export function formatDeviceWhen(iso: string): string {
  const when = new Date(iso);
  return Number.isNaN(when.getTime()) ? iso : when.toLocaleString();
}

type ApproveMyDeviceCardProps = {
  notice: FirstDeviceNotice;
  name: string;
  canApprove: boolean;
  busy: boolean;
  disabled: boolean;
  onApprove: () => void;
  onReject: () => void;
};

export function ApproveMyDeviceCard({
  notice,
  name,
  canApprove,
  busy,
  disabled,
  onApprove,
  onReject,
}: ApproveMyDeviceCardProps) {
  const whenLabel = formatDeviceWhen(notice.deviceCreatedAt);
  const setUp = copy.home.deviceSetUp.replace('{when}', whenLabel);

  if (!canApprove) {
    return (
      <View style={styles.row}>
        <AppText style={styles.rowTitle}>
          {copy.home.extraDeviceAdminNotice.replace('{name}', name)}
        </AppText>
        <Muted>{setUp}</Muted>
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <AppText style={styles.rowTitle}>{copy.home.extraDeviceOwnNotice}</AppText>
      <Muted>{setUp}</Muted>
      <Button
        label={copy.home.yesMyPhone}
        busy={busy}
        disabled={disabled}
        onPress={onApprove}
        accessibilityHint={copy.home.extraDeviceOwnNotice}
      />
      <Button
        label={copy.home.notMyPhone}
        variant="secondary"
        busy={busy}
        disabled={disabled}
        onPress={onReject}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.md,
    gap: spacing.xs,
  },
  rowTitle: {
    ...type.body,
    color: colors.text,
  },
});
