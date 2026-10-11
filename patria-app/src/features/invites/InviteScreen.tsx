import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Linking, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { z } from 'zod';

import {
  Body,
  Button,
  EmptyState,
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
import { fetchInviteCircles, fetchInviteShareToken, fetchPendingInvites } from '../../lib/family';
import { inviteUrlFromToken } from '../../lib/inviteUrl';
import { INVITE_ROLES, type SpaceRole } from '../../lib/roles';
import { supabase } from '../../lib/supabase';
import { colors, spacing, type } from '../../theme';

const schema = z.object({
  email: z.string().trim().min(3),
  role: z.custom<SpaceRole>(),
  circleId: z.string().min(1),
});

type FormValues = z.infer<typeof schema>;

export function InviteScreen() {
  const { session } = useAuth();
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [createdInviteId, setCreatedInviteId] = useState<string | null>(null);
  const [createdEmail, setCreatedEmail] = useState<string>('');

  useEffect(() => {
    void readCurrentFamilyId().then(setSpaceId);
  }, []);

  const circlesQuery = useQuery({
    queryKey: ['invite-circles', spaceId],
    enabled: Boolean(spaceId),
    queryFn: () => fetchInviteCircles(spaceId as string),
  });
  const pendingQuery = useQuery({
    queryKey: ['invites', spaceId],
    enabled: Boolean(spaceId),
    queryFn: () => fetchPendingInvites(spaceId as string),
  });

  const { control, handleSubmit, watch, formState, reset } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: '',
      role: 'teen',
      circleId: '',
    },
  });

  // watch() is from react-hook-form; the compiler skips memoizing this screen.
  // eslint-disable-next-line react-hooks/incompatible-library -- form subscription
  const selectedRole = watch('role') as SpaceRole;
  const householdId = circlesQuery.data?.find((item) => item.kind === 'household')?.id ?? '';

  useEffect(() => {
    if (householdId) {
      reset({ email: '', role: 'teen', circleId: householdId });
    }
  }, [householdId, reset]);

  const onCreate = handleSubmit(async (values) => {
    if (!session || !spaceId) {
      return;
    }
    setFormError(null);
    const circleId = values.circleId || householdId;
    const { data, error } = await supabase
      .from('invites')
      .insert({
        family_space_id: spaceId,
        invited_by: session.user.id,
        email: values.email,
        role: values.role,
        default_circle_id: circleId,
      })
      .select('id')
      .single();
    if (error || !data) {
      setFormError(copy.invite.createFailed);
      return;
    }
    setCreatedInviteId(data.id as string);
    setCreatedEmail(values.email);
    reset({ email: '', role: 'teen', circleId: householdId });
    void pendingQuery.refetch();
  });

  const loadShareToken = async (): Promise<string | null> => {
    if (!createdInviteId) {
      return null;
    }
    return fetchInviteShareToken(createdInviteId);
  };

  const share = async () => {
    const token = await loadShareToken();
    if (!token) {
      setFormError(copy.common.error);
      return;
    }
    await Share.share({ message: inviteUrlFromToken(token) });
  };

  const sendEmail = async () => {
    const token = await loadShareToken();
    if (!token) {
      setFormError(copy.common.error);
      return;
    }
    const link = inviteUrlFromToken(token);
    const name = session?.user.user_metadata?.display_name ?? copy.appName;
    const subject = copy.invite.emailSubject.replace('{family}', copy.appName);
    const body = copy.invite.emailBody
      .replace('{name}', String(name))
      .replace('{family}', copy.appName)
      .replace('{link}', link);
    await Linking.openURL(
      `mailto:${createdEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
    );
  };

  const revoke = async (id: string) => {
    await supabase.from('invites').update({ status: 'revoked' }).eq('id', id);
    void pendingQuery.refetch();
  };

  if (!spaceId || circlesQuery.isLoading) {
    return (
      <Screen withHeader>
        <LoadingState message={copy.common.loading} />
      </Screen>
    );
  }

  return (
    <Screen accessibilityLabel={copy.invite.title} withHeader>
      <Title>{copy.invite.title}</Title>
      <Controller
        control={control}
        name="email"
        render={({ field }) => (
          <Field
            label={copy.invite.emailLabel}
            placeholder={copy.auth.emailPlaceholder}
            autoCapitalize="none"
            keyboardType="email-address"
            value={field.value}
            onChangeText={field.onChange}
          />
        )}
      />
      <Muted>{copy.invite.roleLabel}</Muted>
      <Controller
        control={control}
        name="role"
        render={({ field }) => (
          <View style={styles.chips}>
            {INVITE_ROLES.map((role) => (
              <Pressable
                key={role}
                accessibilityRole="button"
                accessibilityLabel={copy.roles[role]}
                onPress={() => field.onChange(role)}
                style={[styles.chip, field.value === role && styles.chipOn]}
              >
                <Text style={[styles.chipText, field.value === role && styles.chipTextOn]}>
                  {copy.roles[role]}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      />
      {selectedRole === 'caregiver' ? <Muted>{copy.invite.caregiverNote}</Muted> : null}
      <Muted>{copy.invite.circleLabel}</Muted>
      <Controller
        control={control}
        name="circleId"
        render={({ field }) => (
          <View style={styles.chips}>
            {(circlesQuery.data ?? []).map((circle) => {
              const selected = (field.value || householdId) === circle.id;
              return (
                <Pressable
                  key={circle.id}
                  accessibilityRole="button"
                  accessibilityLabel={circle.name}
                  onPress={() => field.onChange(circle.id)}
                  style={[styles.chip, selected && styles.chipOn]}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextOn]}>
                    {circle.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      />
      {formError ? <ErrorState message={formError} /> : null}
      <Button
        label={copy.invite.create}
        onPress={onCreate}
        disabled={formState.isSubmitting}
      />
      {createdInviteId ? (
        <>
          <Body>{copy.invite.created}</Body>
          <Button label={copy.invite.shareLink} onPress={() => void share()} />
          <Button
            label={copy.invite.sendEmail}
            variant="secondary"
            onPress={() => void sendEmail()}
          />
        </>
      ) : null}
      <Muted>{copy.invite.smsLater}</Muted>
      <Body>{copy.invite.pendingTitle}</Body>
      {pendingQuery.data?.length ? (
        pendingQuery.data.map((invite) => (
          <View key={invite.id} style={styles.pending}>
            <Text style={styles.chipText}>{invite.email}</Text>
            <Muted>
              {copy.roles[invite.role]} ·{' '}
              {copy.invite.expires.replace(
                '{date}',
                new Date(invite.expiresAt).toLocaleDateString(),
              )}
            </Muted>
            <Button
              label={copy.invite.revoke}
              variant="danger"
              onPress={() => void revoke(invite.id)}
            />
          </View>
        ))
      ) : (
        <EmptyState message={copy.invite.emptyPending} />
      )}
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
  pending: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.md,
    gap: spacing.sm,
  },
});
