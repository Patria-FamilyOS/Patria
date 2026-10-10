import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';

import { Body, Button, ErrorState, LoadingState, Screen } from '../../components/ui';
import { useAuth } from '../../lib/auth-context';
import { copy } from '../../lib/copy';
import { writeCurrentFamilyId } from '../../lib/currentFamily';
import type { InvitePreview } from '../../lib/family';
import { clearPendingInviteToken, savePendingInviteToken } from '../../lib/pendingInvite';
import { supabase } from '../../lib/supabase';
import { InvitePreviewView } from './InvitePreviewView';

type InvitePreviewScreenProps = {
  token: string;
};

export function InvitePreviewScreen({ token }: InvitePreviewScreenProps) {
  const router = useRouter();
  const { session } = useAuth();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const previewQuery = useQuery({
    queryKey: ['invite-preview', token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_invite_preview', {
        p_token: token,
      });
      if (error) {
        throw error;
      }
      const row = Array.isArray(data) ? data[0] : data;
      return (row as InvitePreview | undefined) ?? null;
    },
  });

  const goAuth = async (path: '/(signed-out)/sign-in' | '/(signed-out)/sign-up') => {
    await savePendingInviteToken(token);
    router.push(path);
  };

  const onAccept = async () => {
    setBusy(true);
    setActionError(null);
    const { data, error } = await supabase.rpc('accept_invite', { p_token: token });
    setBusy(false);
    if (error) {
      const mismatch = error.message.toLowerCase().includes('email');
      setActionError(mismatch ? copy.invitePreview.emailMismatch : copy.common.error);
      return;
    }
    await clearPendingInviteToken();
    if (data) {
      await writeCurrentFamilyId(String(data));
    }
    router.replace('/(signed-in)');
  };

  const onDecline = async () => {
    setBusy(true);
    setActionError(null);
    const { error } = await supabase.rpc('decline_invite', { p_token: token });
    setBusy(false);
    if (error) {
      setActionError(copy.invitePreview.invalid);
      return;
    }
    await clearPendingInviteToken();
    await previewQuery.refetch();
  };

  if (previewQuery.isLoading) {
    return (
      <Screen>
        <LoadingState message={copy.common.loading} />
      </Screen>
    );
  }

  if (previewQuery.error) {
    return (
      <Screen>
        <ErrorState message={copy.common.error} />
      </Screen>
    );
  }

  if (!previewQuery.data) {
    return (
      <Screen accessibilityLabel={copy.invitePreview.invalid}>
        <Body>{copy.invitePreview.invalid}</Body>
        <Button label={copy.common.continue} onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  return (
    <Screen accessibilityLabel={copy.invitePreview.title}>
      <InvitePreviewView
        preview={previewQuery.data}
        signedIn={Boolean(session)}
        busy={busy}
        error={actionError}
        onAccept={() => void onAccept()}
        onDecline={() => void onDecline()}
        onSignIn={() => void goAuth('/(signed-out)/sign-in')}
        onSignUp={() => void goAuth('/(signed-out)/sign-up')}
      />
    </Screen>
  );
}
