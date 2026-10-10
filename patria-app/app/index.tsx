import { useQuery } from '@tanstack/react-query';
import { Redirect } from 'expo-router';

import { LoadingState, Screen } from '../src/components/ui';
import { useAuth } from '../src/lib/auth-context';
import { copy } from '../src/lib/copy';
import { fetchMemberships } from '../src/lib/family';
import { readPendingInviteToken } from '../src/lib/pendingInvite';

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
    return <Redirect href="/(signed-out)" />;
  }

  if (pendingQuery.isLoading || membershipsQuery.isLoading) {
    return (
      <Screen>
        <LoadingState message={copy.common.loading} />
      </Screen>
    );
  }

  if (pendingQuery.data) {
    return <Redirect href={`/invite/${pendingQuery.data}`} />;
  }

  if ((membershipsQuery.data?.length ?? 0) === 0) {
    return <Redirect href="/(signed-in)/create" />;
  }

  return <Redirect href="/(signed-in)" />;
}
