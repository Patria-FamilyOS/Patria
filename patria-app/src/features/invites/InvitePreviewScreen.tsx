import { useQuery } from '@tanstack/react-query';
import { useNavigation, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import { Body, Button, ErrorState, LoadingState, Screen } from '../../components/ui';
import { useAuth } from '../../lib/auth-context';
import { copy } from '../../lib/copy';
import { writeCurrentFamilyId } from '../../lib/currentFamily';
import type { InvitePreview } from '../../lib/family';
import { clearPendingInviteToken, savePendingInviteToken } from '../../lib/pendingInvite';
import { shouldInterceptInviteBack } from '../../lib/navigation';
import { supabase } from '../../lib/supabase';
import { InvitePreviewView } from './InvitePreviewView';

type InvitePreviewScreenProps = {
  token: string;
};

export function InvitePreviewScreen({ token }: InvitePreviewScreenProps) {
  const router = useRouter();
  const navigation = useNavigation();
  const { session } = useAuth();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (!shouldInterceptInviteBack(event.data.action.type)) {
        return;
      }
      event.preventDefault();
      router.replace('/');
    });
    return unsubscribe;
  }, [navigation, router]);

  const previewQuery = useQuery({
    queryKey: ['invite-preview'],
    staleTime: 0,
    gcTime: 0,
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
      const code = 'code' in error ? String(error.code) : '';
      setActionError(code === '42501' ? copy.invitePreview.emailMismatch : copy.common.error);
      return;
    }
    await clearPendingInviteToken();
    if (data) {
      await writeCurrentFamilyId(String(data));
    }
    router.replace('/(signed-in)/home');
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
      <Screen withHeader>
        <LoadingState message={copy.common.loading} />
      </Screen>
    );
  }

  if (previewQuery.error) {
    return (
      <Screen withHeader>
        <ErrorState message={copy.common.error} />
      </Screen>
    );
  }

  if (!previewQuery.data) {
    return (
      <Screen accessibilityLabel={copy.invitePreview.invalid} withHeader>
        <Body>{copy.invitePreview.invalid}</Body>
        <Button label={copy.common.continue} onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  return (
    <Screen accessibilityLabel={copy.invitePreview.title} withHeader>
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
