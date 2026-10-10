import { useQuery } from '@tanstack/react-query';
import { Redirect } from 'expo-router';

import { ErrorState, LoadingState, Screen } from '../src/components/ui';
import { useAuth } from '../src/lib/auth-context';
import { copy } from '../src/lib/copy';
import { fetchMemberships } from '../src/lib/family';
import { readPendingInviteToken } from '../src/lib/pendingInvite';
import { resolveEntryHref } from '../src/lib/sessionGate';

export default function Index() {
  const { session, loading } = useAuth();
  const userId = session?.user.id;

  const pendingQuery = useQuery({
    queryKey: ['pending-invite', userId],
    enabled: Boolean(userId),
    queryFn: readPendingInviteToken,
  });
  const membershipsQuery = useQuery({
    queryKey: ['memberships-gate', userId],
    enabled: Boolean(userId),
    queryFn: () => fetchMemberships(userId as string),
  });

  if (loading) {
    return (
      <Screen>
        <LoadingState message={copy.common.loading} />
      </Screen>
    );
  }

  if (!session) {
    return (
      <Redirect
        href={resolveEntryHref({
          hasSession: false,
          membershipCount: 0,
          pendingInviteToken: null,
        })}
      />
    );
  }

  if (pendingQuery.isLoading) {
    return (
      <Screen>
        <LoadingState message={copy.common.loading} />
      </Screen>
    );
  }

  if (pendingQuery.data) {
    return (
      <Redirect
        href={resolveEntryHref({
          hasSession: true,
          membershipCount: 0,
          pendingInviteToken: pendingQuery.data,
        })}
      />
    );
  }

  if (membershipsQuery.isLoading) {
    return (
      <Screen>
        <LoadingState message={copy.common.loading} />
      </Screen>
    );
  }

  if (membershipsQuery.isError) {
    return (
      <Screen>
        <ErrorState message={copy.common.error} />
      </Screen>
    );
  }

  return (
    <Redirect
      href={resolveEntryHref({
        hasSession: true,
        membershipCount: membershipsQuery.data?.length ?? 0,
        pendingInviteToken: null,
      })}
    />
  );
}
