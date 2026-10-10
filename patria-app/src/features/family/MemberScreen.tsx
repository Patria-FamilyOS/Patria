import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Body, Button, ErrorState, LoadingState, Muted, Screen, Title } from '../../components/ui';
import { useAuth } from '../../lib/auth-context';
import { copy } from '../../lib/copy';
import { readCurrentFamilyId } from '../../lib/currentFamily';
import { fetchMembers } from '../../lib/family';
import { countAdmins, INVITE_ROLES, isSpaceAdmin, type SpaceRole } from '../../lib/roles';
import { supabase } from '../../lib/supabase';
import { colors, spacing, type } from '../../theme';

type MemberScreenProps = {
  userId: string;
};

export function MemberScreen({ userId }: MemberScreenProps) {
  const router = useRouter();
  const { session } = useAuth();
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [roleOverride, setRoleOverride] = useState<SpaceRole | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void readCurrentFamilyId().then(setSpaceId);
  }, []);

  const membersQuery = useQuery({
    queryKey: ['members', spaceId],
    enabled: Boolean(spaceId),
    queryFn: () => fetchMembers(spaceId as string),
  });

  const member = membersQuery.data?.find((row) => row.userId === userId);
  const role = roleOverride ?? member?.role ?? 'teen';
  const myRole = membersQuery.data?.find((row) => row.userId === session?.user.id)?.role;
  const admin = isSpaceAdmin(myRole);
  const adminCount = countAdmins((membersQuery.data ?? []).map((row) => row.role));
  const isLastAdmin = isSpaceAdmin(member?.role) && adminCount <= 1;

  if (membersQuery.isLoading || !member) {
    return (
      <Screen withHeader>
        {membersQuery.isLoading ? (
          <LoadingState message={copy.common.loading} />
        ) : (
          <ErrorState message={copy.common.empty} />
        )}
      </Screen>
    );
  }

  const saveRole = async () => {
    if (!spaceId || isLastAdmin) {
      return;
    }
    setError(null);
    const { error: updateError } = await supabase
      .from('space_members')
      .update({ role })
      .eq('family_space_id', spaceId)
      .eq('user_id', userId);
    if (updateError) {
      setError(copy.member.saveFailed);
      return;
    }
    router.replace('/(signed-in)/home');
  };

  const remove = () => {
    if (!spaceId || isLastAdmin) {
      return;
    }
    Alert.alert(copy.member.remove, copy.member.removeConfirm, [
      { text: copy.common.cancel, style: 'cancel' },
      {
        text: copy.member.remove,
        style: 'destructive',
        onPress: () => {
          void supabase
            .from('space_members')
            .delete()
            .eq('family_space_id', spaceId)
            .eq('user_id', userId)
            .then(({ error: deleteError }) => {
              if (deleteError) {
                setError(copy.member.removeFailed);
                return;
              }
              router.replace('/(signed-in)/home');
            });
        },
      },
    ]);
  };

  return (
    <Screen accessibilityLabel={member.displayName} withHeader>
      <Title>{member.displayName}</Title>
      <Body>{copy.roles[member.role]}</Body>
      {admin ? (
        <>
          <Muted>{copy.member.roleLabel}</Muted>
          <View style={styles.chips}>
            {INVITE_ROLES.map((item) => (
              <Pressable
                key={item}
                accessibilityRole="button"
                accessibilityLabel={copy.roles[item]}
                onPress={() => setRoleOverride(item)}
                style={[styles.chip, role === item && styles.chipOn]}
              >
                <Text style={[styles.chipText, role === item && styles.chipTextOn]}>
                  {copy.roles[item]}
                </Text>
              </Pressable>
            ))}
          </View>
          {isLastAdmin ? <Muted>{copy.member.lastAdmin}</Muted> : null}
          {error ? <ErrorState message={error} /> : null}
          <Button
            label={copy.member.changeRole}
            onPress={() => void saveRole()}
            disabled={isLastAdmin}
          />
          <Button
            label={copy.member.remove}
            variant="danger"
            onPress={remove}
            disabled={isLastAdmin}
          />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    backgroundColor: colors.chip,
    borderRadius: 24,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipOn: {
    backgroundColor: colors.primary,
  },
  chipText: {
    ...type.caption,
    color: colors.text,
  },
  chipTextOn: {
    color: colors.onPrimary,
  },
});
