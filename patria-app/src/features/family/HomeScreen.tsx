import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';

import {
  Body,
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  Muted,
  Screen,
  Title,
  AppText,
} from '../../components/ui';
import { useAuth } from '../../lib/auth-context';
import { copy } from '../../lib/copy';
import { readCurrentFamilyId, writeCurrentFamilyId } from '../../lib/currentFamily';
import {
  fetchChildren,
  fetchMembers,
  fetchMemberships,
  fetchPendingInvites,
} from '../../lib/family';
import { signOutAndGoWelcome } from '../../lib/authSession';
import { ensureKeysForOpenFamily } from '../../lib/crypto/familyCeremony';
import { memberDisplayName } from '../../lib/displayName';
import { routes } from '../../lib/navigation';
import { countAdmins, isSpaceAdmin } from '../../lib/roles';
import { supabase } from '../../lib/supabase';
import { colors, spacing, type } from '../../theme';

export function HomeScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id;
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const membershipsQuery = useQuery({
    queryKey: ['memberships', userId],
    enabled: Boolean(userId),
    queryFn: () => fetchMemberships(userId as string),
  });

  useEffect(() => {
    if (!membershipsQuery.data || membershipsQuery.data.length === 0) {
      return;
    }
    void readCurrentFamilyId().then((stored) => {
      const match = membershipsQuery.data?.find((item) => item.space.id === stored);
      const next = match?.space.id ?? membershipsQuery.data?.[0]?.space.id;
      if (next) {
        setSpaceId(next);
        void writeCurrentFamilyId(next);
      }
    });
  }, [membershipsQuery.data]);

  const membersQuery = useQuery({
    queryKey: ['members', spaceId],
    enabled: Boolean(spaceId),
    queryFn: () => fetchMembers(spaceId as string),
  });
  const childrenQuery = useQuery({
    queryKey: ['children', spaceId],
    enabled: Boolean(spaceId),
    queryFn: () => fetchChildren(spaceId as string),
  });
  const invitesQuery = useQuery({
    queryKey: ['invites', spaceId],
    enabled: Boolean(spaceId),
    queryFn: () => fetchPendingInvites(spaceId as string),
  });

  const current = membershipsQuery.data?.find((item) => item.space.id === spaceId);
  const admin = isSpaceAdmin(current?.role);

  const keyStatusQuery = useQuery({
    queryKey: ['familyKeyStatus', spaceId, userId, current?.role],
    enabled: Boolean(spaceId && userId && current),
    queryFn: () =>
      ensureKeysForOpenFamily({
        spaceId: spaceId as string,
        userId: userId as string,
        role: current?.role,
      }),
  });
  const adminCount = countAdmins((membersQuery.data ?? []).map((row) => row.role));

  const onRefresh = useCallback(() => {
    void membershipsQuery.refetch();
    void membersQuery.refetch();
    void childrenQuery.refetch();
    void invitesQuery.refetch();
    void keyStatusQuery.refetch();
    // refetch fns are stable; the query objects change identity every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    membershipsQuery.refetch,
    membersQuery.refetch,
    childrenQuery.refetch,
    invitesQuery.refetch,
    keyStatusQuery.refetch,
  ]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        onRefresh();
      }
    });
    return () => sub.remove();
  }, [onRefresh]);

  const refreshing =
    membershipsQuery.isRefetching ||
    membersQuery.isRefetching ||
    childrenQuery.isRefetching ||
    invitesQuery.isRefetching;

  const onSignOut = async () => {
    setSigningOut(true);
    try {
      await signOutAndGoWelcome({
        signOut: () => supabase.auth.signOut(),
        replace: (href) => router.replace(href),
      });
    } finally {
      setSigningOut(false);
    }
  };

  const joinFamilyLink = (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={copy.home.joinFamily}
      onPress={() => router.push(routes.joinFamily)}
      style={styles.joinLink}
    >
      <AppText style={styles.joinLinkText}>{copy.home.joinFamily}</AppText>
    </Pressable>
  );

  if (membershipsQuery.isLoading) {
    return (
      <Screen>
        <LoadingState message={copy.common.loading} />
      </Screen>
    );
  }

  if (membershipsQuery.error) {
    return (
      <Screen>
        <ErrorState message={copy.common.error} />
      </Screen>
    );
  }

  if (!current) {
    return (
      <Screen
        accessibilityLabel={copy.home.noFamilyTitle}
        refreshing={refreshing}
        onRefresh={onRefresh}
      >
        <Title>{copy.home.noFamilyTitle}</Title>
        <Body>{copy.home.noFamilyBody}</Body>
        <Button label={copy.createFamily.submit} onPress={() => router.push(routes.createFamily)} />
        {joinFamilyLink}
      </Screen>
    );
  }

  if (current.role === 'successor') {
    return (
      <Screen accessibilityLabel={copy.home.successorTitle}>
        <Title>{copy.home.successorTitle}</Title>
        <Body>{copy.home.successorBody}</Body>
        <Button
          label={copy.auth.signOut}
          variant="secondary"
          busy={signingOut}
          onPress={() => void onSignOut()}
        />
      </Screen>
    );
  }

  const others = (membersQuery.data ?? []).filter((row) => row.userId !== userId);
  const displayName = memberDisplayName(
    membersQuery.data?.find((row) => row.userId === userId)?.displayName,
  );

  return (
    <Screen
      accessibilityLabel={current.space.name}
      refreshing={refreshing}
      onRefresh={onRefresh}
    >
      <Title>{copy.home.greeting.replace('{name}', displayName)}</Title>
      <Title>{current.space.name}</Title>
      <Muted>{copy.home.todoMemories}</Muted>
      {keyStatusQuery.data ? (
        <Muted>
          {keyStatusQuery.data === 'ready' ? copy.home.keysReady : copy.home.keysWaiting}
        </Muted>
      ) : null}

      {(membershipsQuery.data ?? []).length > 1 ? (
        <View>
          <Muted>{copy.home.switcherLabel}</Muted>
          {(membershipsQuery.data ?? []).map((item) => (
            <Pressable
              key={item.space.id}
              accessibilityRole="button"
              accessibilityLabel={item.space.name}
              onPress={() => {
                setSpaceId(item.space.id);
                void writeCurrentFamilyId(item.space.id);
              }}
              style={[styles.row, item.space.id === spaceId && styles.rowSelected]}
            >
              <AppText style={styles.rowTitle}>{item.space.name}</AppText>
            </Pressable>
          ))}
        </View>
      ) : null}

      <Body>{copy.home.membersTitle}</Body>
      {membersQuery.isLoading || childrenQuery.isLoading ? (
        <LoadingState message={copy.common.loading} />
      ) : null}
      {others.length === 0 && (childrenQuery.data ?? []).length === 0 ? (
        <EmptyState message={copy.home.emptyMembers} />
      ) : null}
      {(membersQuery.data ?? []).map((row) => (
        <Pressable
          key={row.id}
          accessibilityRole="button"
          accessibilityLabel={`${row.displayName}, ${copy.roles[row.role]}`}
          disabled={!admin}
          onPress={() => router.push(routes.member(row.userId))}
          style={styles.row}
        >
          <AppText style={styles.rowTitle}>
            {row.displayName}
            {row.userId === userId ? ` · ${copy.invite.youBadge}` : ''}
          </AppText>
          <Muted>
            {row.relationshipLabel ? `${row.relationshipLabel} · ` : ''}
            {copy.roles[row.role]}
          </Muted>
        </Pressable>
      ))}
      {(childrenQuery.data ?? []).map((child) => (
        <Pressable
          key={child.id}
          accessibilityRole="button"
          accessibilityLabel={`${child.displayName}, ${copy.roles.child}`}
          disabled={!admin}
          onPress={() => router.push(`/(signed-in)/child/${child.id}`)}
          style={styles.row}
        >
          <AppText style={styles.rowTitle}>{child.displayName}</AppText>
          <Muted>
            {copy.roles.child} · {copy.child.noEmail}
          </Muted>
        </Pressable>
      ))}

      {admin ? (
        <>
          <Button label={copy.home.invite} onPress={() => router.push(routes.inviteSomeone)} />
          <Button
            label={copy.home.addChild}
            variant="secondary"
            onPress={() => router.push(routes.addChild)}
          />
          <Muted>
            {copy.home.pendingInvites}: {invitesQuery.data?.length ?? 0}
          </Muted>
        </>
      ) : null}

      <Button
        label={copy.auth.signOut}
        variant="secondary"
        busy={signingOut}
        onPress={() => void onSignOut()}
      />
      {adminCount <= 1 && userId ? (
        <Muted>{copy.member.lastAdmin}</Muted>
      ) : null}
      {joinFamilyLink}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.md,
    gap: spacing.xs,
  },
  rowSelected: {
    borderWidth: 1,
    borderColor: colors.primary,
  },
  rowTitle: {
    ...type.body,
    color: colors.text,
  },
  joinLink: {
    alignSelf: 'center',
    paddingVertical: spacing.md,
  },
  joinLinkText: {
    ...type.caption,
    color: colors.primary,
    textAlign: 'center',
  },
});
