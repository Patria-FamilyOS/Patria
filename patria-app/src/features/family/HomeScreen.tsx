import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  Body,
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  Muted,
  Screen,
  Title,
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
import { countAdmins, isSpaceAdmin } from '../../lib/roles';
import { supabase } from '../../lib/supabase';
import { colors, spacing, type } from '../../theme';

export function HomeScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id;
  const [spaceId, setSpaceId] = useState<string | null>(null);

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
  const adminCount = countAdmins((membersQuery.data ?? []).map((row) => row.role));

  const onRefresh = useCallback(() => {
    void membershipsQuery.refetch();
    void membersQuery.refetch();
    void childrenQuery.refetch();
    void invitesQuery.refetch();
  }, [membershipsQuery, membersQuery, childrenQuery, invitesQuery]);

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
      <Screen accessibilityLabel={copy.home.noFamilyTitle}>
        <Title>{copy.home.noFamilyTitle}</Title>
        <Body>{copy.home.noFamilyBody}</Body>
        <Button label={copy.createFamily.submit} onPress={() => router.push('/(signed-in)/create')} />
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
          onPress={() => void supabase.auth.signOut()}
        />
      </Screen>
    );
  }

  const others = (membersQuery.data ?? []).filter((row) => row.userId !== userId);
  const displayName =
    membersQuery.data?.find((row) => row.userId === userId)?.displayName ?? copy.appName;

  return (
    <Screen accessibilityLabel={current.space.name}>
      <Title>{copy.home.greeting.replace('{name}', displayName)}</Title>
      <Title>{current.space.name}</Title>
      <Muted>{copy.home.todoMemories}</Muted>

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
              <Text style={styles.rowTitle}>{item.space.name}</Text>
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
          onPress={() => router.push(`/(signed-in)/member/${row.userId}`)}
          style={styles.row}
        >
          <Text style={styles.rowTitle}>
            {row.displayName}
            {row.userId === userId ? ` · ${copy.invite.youBadge}` : ''}
          </Text>
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
          <Text style={styles.rowTitle}>{child.displayName}</Text>
          <Muted>
            {copy.roles.child} · {copy.child.noEmail}
          </Muted>
        </Pressable>
      ))}

      {admin ? (
        <>
          <Button label={copy.home.invite} onPress={() => router.push('/(signed-in)/invite')} />
          <Button
            label={copy.home.addChild}
            variant="secondary"
            onPress={() => router.push('/(signed-in)/add-child')}
          />
          <Muted>
            {copy.home.pendingInvites}: {invitesQuery.data?.length ?? 0}
          </Muted>
        </>
      ) : null}

      <Button label={copy.common.continue} variant="secondary" onPress={onRefresh} />
      <Button
        label={copy.auth.signOut}
        variant="secondary"
        onPress={() => void supabase.auth.signOut()}
      />
      {adminCount <= 1 && userId ? (
        <Muted>{copy.member.lastAdmin}</Muted>
      ) : null}
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
});
