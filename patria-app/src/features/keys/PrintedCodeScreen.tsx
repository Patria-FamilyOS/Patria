import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';

import {
  Body,
  Button,
  ErrorState,
  Field,
  LoadingState,
  Muted,
  Screen,
  Title,
} from '../../components/ui';
import { useAuth } from '../../lib/auth-context';
import { copy } from '../../lib/copy';
import { readCurrentFamilyId } from '../../lib/currentFamily';
import { logFailedAction } from '../../lib/devLog';
import { fetchMembers } from '../../lib/family';
import { generatePrintedCode, pickPrintedCodeChecks } from '../../lib/crypto/printedCode';
import { savePrintedCode } from '../../lib/crypto/recoverySetup';
import { isSpaceAdmin } from '../../lib/roles';
import { routes } from '../../lib/navigation';

export function PrintedCodeScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id;
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [phase, setPhase] = useState<'show' | 'confirm'>('show');
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const printed = useMemo(() => generatePrintedCode(), []);
  const checks = useMemo(() => pickPrintedCodeChecks(printed.words), [printed.words]);

  useEffect(() => {
    void readCurrentFamilyId().then(setSpaceId);
  }, []);

  const membersQuery = useQuery({
    queryKey: ['members', spaceId],
    enabled: Boolean(spaceId),
    queryFn: () => fetchMembers(spaceId as string),
  });

  if (!spaceId || membersQuery.isLoading) {
    return (
      <Screen withHeader>
        <LoadingState message={copy.common.loading} />
      </Screen>
    );
  }

  const adminUserIds = (membersQuery.data ?? [])
    .filter((row) => isSpaceAdmin(row.role))
    .map((row) => row.userId);

  const onSave = async () => {
    if (!userId) {
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await savePrintedCode({
        spaceId,
        adminUserId: userId,
        adminUserIds,
        printed,
        answers: checks.map((item) => ({
          index: item.index,
          word: answers[item.index] ?? '',
        })),
      });
      router.replace(routes.home);
    } catch (caught) {
      logFailedAction(caught);
      setError(copy.recovery.printedFailed);
    } finally {
      setBusy(false);
    }
  };

  if (phase === 'show') {
    return (
      <Screen withHeader accessibilityLabel={copy.recovery.printedTitle}>
        <Title>{copy.recovery.printedTitle}</Title>
        <Body>{copy.recovery.printedBody}</Body>
        <Muted>{printed.words}</Muted>
        <Button label={copy.recovery.printedContinue} onPress={() => setPhase('confirm')} />
        <Button
          label={copy.recovery.printedSkip}
          variant="secondary"
          onPress={() => router.replace(routes.home)}
        />
      </Screen>
    );
  }

  return (
    <Screen withHeader accessibilityLabel={copy.recovery.printedConfirmTitle}>
      <Title>{copy.recovery.printedConfirmTitle}</Title>
      <Body>{copy.recovery.printedConfirmBody}</Body>
      {error ? <ErrorState message={error} /> : null}
      {checks.map((item) => (
        <Field
          key={item.index}
          label={copy.recovery.printedWord.replace('{n}', String(item.index + 1))}
          autoCapitalize="none"
          autoCorrect={false}
          value={answers[item.index] ?? ''}
          onChangeText={(text) =>
            setAnswers((current) => ({ ...current, [item.index]: text }))
          }
        />
      ))}
      <Button
        label={copy.common.save}
        busy={busy}
        onPress={() => void onSave()}
      />
    </Screen>
  );
}
