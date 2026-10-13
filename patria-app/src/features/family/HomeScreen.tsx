import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation, useRouter } from 'expo-router';
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
import {
  approveFirstDevice,
  approveOwnExtraDevice,
  declineFirstDevice,
  fetchFirstDeviceNotices,
  rejectOwnExtraDevice,
  type FirstDeviceNotice,
} from '../../lib/crypto/deviceAccess';
import { ensureDeviceIdentity } from '../../lib/crypto/deviceIdentity';
import { ensureKeysForOpenFamily, type FamilyKeyStatus } from '../../lib/crypto/familyCeremony';
import {
  approveRecoveryAsContact,
  cancelledCopyKind,
  cancelRecoveryRequest,
  requestCanFinish,
  supabaseRecoverFlowGateway,
  type RecoveryRequestRow,
} from '../../lib/crypto/recoverFlow';
import {
  fulfillAcceptedContacts,
  loadRecoverySnapshot,
  respondRecoveryInvite,
} from '../../lib/crypto/recoverySetup';
import { ApproveMyDeviceCard, formatDeviceWhen } from '../keys/ApproveMyDeviceScreen';
import { memberDisplayName } from '../../lib/displayName';
import { describeCaughtError, logFailedAction, logKeyStep } from '../../lib/devLog';
import { routes } from '../../lib/navigation';
import { countAdmins, isSpaceAdmin } from '../../lib/roles';
import { supabase } from '../../lib/supabase';
import { colors, spacing, type } from '../../theme';

export function HomeScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const userId = session?.user.id;
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [busyNoticeId, setBusyNoticeId] = useState<string | null>(null);
  const [noticeError, setNoticeError] = useState<string | null>(null);

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
  const noticesQuery = useQuery({
    queryKey: ['deviceApprovalNotices', spaceId],
    enabled: Boolean(spaceId),
    refetchOnMount: 'always',
    queryFn: () => fetchFirstDeviceNotices(spaceId as string),
  });
  const recoveryQuery = useQuery({
    queryKey: ['recoverySnapshot', spaceId, userId],
    enabled: Boolean(spaceId && userId && current),
    refetchOnMount: 'always',
    queryFn: () =>
      loadRecoverySnapshot(spaceId as string, userId as string, current?.role),
  });
  const recoveryRequestsQuery = useQuery({
    queryKey: ['recoveryRequests', spaceId],
    enabled: Boolean(spaceId),
    refetchOnMount: 'always',
    queryFn: () => supabaseRecoverFlowGateway.listRequests(spaceId as string),
  });
  const removedNoticesQuery = useQuery({
    queryKey: ['deviceRemovedNotices', spaceId],
    enabled: Boolean(spaceId && admin),
    refetchOnMount: 'always',
    queryFn: () => supabaseRecoverFlowGateway.listRemovedNotices(spaceId as string),
  });
  const adminCount = countAdmins((membersQuery.data ?? []).map((row) => row.role));

  const onRefresh = useCallback(() => {
    if (userId) {
      void queryClient.invalidateQueries({ queryKey: ['memberships', userId] });
    }
    if (spaceId) {
      void queryClient.invalidateQueries({ queryKey: ['members', spaceId] });
      void queryClient.invalidateQueries({ queryKey: ['children', spaceId] });
      void queryClient.invalidateQueries({ queryKey: ['invites', spaceId] });
      void queryClient.invalidateQueries({ queryKey: ['familyKeyStatus'] });
      void queryClient.invalidateQueries({ queryKey: ['deviceApprovalNotices', spaceId] });
      void queryClient.invalidateQueries({ queryKey: ['recoverySnapshot', spaceId, userId] });
      void queryClient.invalidateQueries({ queryKey: ['recoveryRequests', spaceId] });
      void queryClient.invalidateQueries({ queryKey: ['deviceRemovedNotices', spaceId] });
    }
  }, [queryClient, userId, spaceId]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        onRefresh();
      }
    });
    return () => sub.remove();
  }, [onRefresh]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      onRefresh();
    });
    return unsubscribe;
  }, [navigation, onRefresh]);

  const refreshing =
    membershipsQuery.isRefetching ||
    membersQuery.isRefetching ||
    childrenQuery.isRefetching ||
    invitesQuery.isRefetching ||
    noticesQuery.isRefetching ||
    recoveryQuery.isRefetching ||
    recoveryRequestsQuery.isRefetching ||
    removedNoticesQuery.isRefetching;

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

  const onLetIn = async (notice: FirstDeviceNotice) => {
    if (!userId || !spaceId) {
      return;
    }
    setNoticeError(null);
    setBusyNoticeId(notice.id);
    try {
      const device = await ensureDeviceIdentity(userId);
      const member = (membersQuery.data ?? []).find((row) => row.userId === notice.userId);
      await approveFirstDevice({
        spaceId,
        adminUserId: userId,
        adminDeviceId: device.deviceId,
        adminPrivateKey: device.privateKey,
        notice,
        memberRole: member?.role,
      });
      await queryClient.invalidateQueries({ queryKey: ['deviceApprovalNotices', spaceId] });
      await queryClient.invalidateQueries({ queryKey: ['familyKeyStatus'] });
    } catch (error) {
      const info = describeCaughtError(error);
      logFailedAction(error);
      logKeyStep('let_in_failed', `${info.code} ${info.message}`);
      setNoticeError(copy.home.letInFailed);
    } finally {
      setBusyNoticeId(null);
    }
  };

  const onDecline = async (noticeId: string) => {
    setNoticeError(null);
    setBusyNoticeId(noticeId);
    try {
      await declineFirstDevice(noticeId);
      await queryClient.invalidateQueries({ queryKey: ['deviceApprovalNotices', spaceId] });
    } catch (error) {
      logFailedAction(error);
      setNoticeError(copy.home.declineFailed);
    } finally {
      setBusyNoticeId(null);
    }
  };

  const onApproveMyPhone = async (notice: FirstDeviceNotice) => {
    if (!userId || !spaceId || !current) {
      return;
    }
    setNoticeError(null);
    setBusyNoticeId(notice.id);
    try {
      const device = await ensureDeviceIdentity(userId);
      await approveOwnExtraDevice({
        spaceId,
        userId,
        approverDeviceId: device.deviceId,
        approverPrivateKey: device.privateKey,
        notice,
        role: current.role,
      });
      await queryClient.invalidateQueries({ queryKey: ['deviceApprovalNotices', spaceId] });
      await queryClient.invalidateQueries({ queryKey: ['familyKeyStatus'] });
    } catch (error) {
      const info = describeCaughtError(error);
      logFailedAction(error);
      logKeyStep('approve_own_phone_failed', `${info.code} ${info.message}`);
      setNoticeError(copy.home.approvePhoneFailed);
    } finally {
      setBusyNoticeId(null);
    }
  };

  const onRejectMyPhone = async (notice: FirstDeviceNotice) => {
    if (!userId || !spaceId) {
      return;
    }
    setNoticeError(null);
    setBusyNoticeId(notice.id);
    try {
      await rejectOwnExtraDevice({ spaceId, userId, notice });
      await queryClient.invalidateQueries({ queryKey: ['deviceApprovalNotices', spaceId] });
    } catch (error) {
      logFailedAction(error);
      setNoticeError(copy.home.rejectPhoneFailed);
    } finally {
      setBusyNoticeId(null);
    }
  };

  useEffect(() => {
    if (!admin || !spaceId || !userId || keyStatusQuery.data !== 'ready') {
      return;
    }
    if ((recoveryQuery.data?.accepted ?? 0) === 0) {
      return;
    }
    const adminUserIds = (membersQuery.data ?? [])
      .filter((row) => isSpaceAdmin(row.role))
      .map((row) => row.userId);
    void fulfillAcceptedContacts({
      spaceId,
      adminUserId: userId,
      adminUserIds,
    }).catch((caught: unknown) => {
      logFailedAction(caught);
    });
  }, [admin, spaceId, userId, keyStatusQuery.data, recoveryQuery.data?.accepted, membersQuery.data]);

  const onCancelRecovery = async (requestId: string) => {
    setNoticeError(null);
    setBusyNoticeId(requestId);
    try {
      await cancelRecoveryRequest(requestId);
      await queryClient.invalidateQueries({ queryKey: ['recoveryRequests', spaceId] });
    } catch (caught) {
      logFailedAction(caught);
      setNoticeError(copy.home.recoveryCancelFailed);
    } finally {
      setBusyNoticeId(null);
    }
  };

  const onApproveRecoveryHelp = async (request: RecoveryRequestRow) => {
    if (!userId || !spaceId) {
      return;
    }
    const slot = recoveryQuery.data?.contacts.find(
      (row) => row.userId === userId && row.status === 'accepted',
    )?.slot;
    if (!slot) {
      return;
    }
    setNoticeError(null);
    setBusyNoticeId(request.id);
    try {
      const device = await ensureDeviceIdentity(userId);
      await approveRecoveryAsContact({
        spaceId,
        request,
        slot,
        contactUserId: userId,
        contactDeviceId: device.deviceId,
        contactPrivateKey: device.privateKey,
      });
      await queryClient.invalidateQueries({ queryKey: ['recoveryRequests', spaceId] });
    } catch (caught) {
      logFailedAction(caught);
      setNoticeError(copy.home.recoveryApproveFailed);
    } finally {
      setBusyNoticeId(null);
    }
  };

  const onRecoveryRespond = async (accept: boolean) => {
    if (!spaceId || !userId) {
      return;
    }
    try {
      await respondRecoveryInvite({ spaceId, userId, accept });
      await queryClient.invalidateQueries({ queryKey: ['recoverySnapshot', spaceId, userId] });
    } catch (caught) {
      logFailedAction(caught);
      setNoticeError(copy.common.error);
    }
  };

  const keyStatusCopy = (status: FamilyKeyStatus): string => {
    if (status === 'ready') {
      return copy.home.keysReady;
    }
    if (status === 'needsRelink') {
      return copy.home.keysNeedRelink;
    }
    if (status === 'waitingOwnPhone') {
      return copy.home.keysWaitingOwnPhone;
    }
    return copy.home.keysWaiting;
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
      {keyStatusQuery.data ? <Muted>{keyStatusCopy(keyStatusQuery.data)}</Muted> : null}
      {admin && recoveryQuery.data?.status === 'not_setup' ? (
        <Muted>{copy.home.recoveryNotSetup}</Muted>
      ) : null}
      {admin && recoveryQuery.data?.status === 'one_of_two' ? (
        <Muted>{copy.home.recoveryOneOfTwo}</Muted>
      ) : null}
      {admin && recoveryQuery.data?.status === 'setup' ? (
        <Muted>{copy.home.recoverySetup}</Muted>
      ) : null}
      {!admin && recoveryQuery.data?.status === 'contact' ? (
        <Muted>
          {copy.home.recoveryYouAreContact.replace('{family}', current.space.name)}
        </Muted>
      ) : null}
      {admin && keyStatusQuery.data === 'ready' && (recoveryQuery.data?.accepted ?? 0) < 2 ? (
        <View style={styles.row}>
          <AppText style={styles.rowTitle}>{copy.home.recoveryCardTitle}</AppText>
          <Muted>{copy.home.recoveryCardBody}</Muted>
          <Button
            label={copy.home.recoveryCardAction}
            onPress={() => router.push(routes.recoverySetup)}
          />
        </View>
      ) : null}
      {admin &&
      recoveryQuery.data &&
      recoveryQuery.data.accepted >= 2 &&
      !recoveryQuery.data.hasPaper ? (
        <Button
          label={copy.home.recoveryPrintedAction}
          variant="secondary"
          onPress={() => router.push(routes.printedCode)}
        />
      ) : null}
      {(recoveryQuery.data?.pending ?? [])
        .filter((row) => row.userId === userId)
        .map((row) => (
          <View key={row.id} style={styles.row}>
            <AppText style={styles.rowTitle}>{copy.home.recoveryInviteTitle}</AppText>
            <Muted>{copy.home.recoveryInviteBody}</Muted>
            <Button
              label={copy.home.recoveryAccept}
              onPress={() => void onRecoveryRespond(true)}
            />
            <Button
              label={copy.home.recoveryDecline}
              variant="secondary"
              onPress={() => void onRecoveryRespond(false)}
            />
          </View>
        ))}
      {keyStatusQuery.data && keyStatusQuery.data !== 'ready' ? (
        <Button
          label={copy.home.lostPhone}
          variant="secondary"
          onPress={() => router.push(routes.recoverLostPhone)}
        />
      ) : null}
      {(recoveryRequestsQuery.data ?? []).map((request) => {
        const member = (membersQuery.data ?? []).find((row) => row.userId === request.userId);
        const name = memberDisplayName(member?.displayName);
        const when = formatDeviceWhen(request.newDeviceCreatedAt ?? request.startedAt);
        const open = request.cancelledAt == null && request.completedAt == null;
        const own = request.userId === userId;
        if (own && request.cancelledAt) {
          return (
            <View key={request.id} style={styles.row}>
              <AppText style={styles.rowTitle}>
                {cancelledCopyKind(request.cancelledBy, userId) === 'you'
                  ? copy.home.recoveryCancelledByYou
                  : copy.home.recoveryCancelledByAdmin}
              </AppText>
            </View>
          );
        }
        if (own && open) {
          return (
            <View key={request.id} style={styles.row}>
              <AppText style={styles.rowTitle}>{copy.home.recoveryWaiting}</AppText>
              <Muted>{when}</Muted>
              <Button
                label={copy.home.notMyPhone}
                variant="secondary"
                busy={busyNoticeId === request.id}
                disabled={busyNoticeId !== null && busyNoticeId !== request.id}
                onPress={() => void onCancelRecovery(request.id)}
              />
              <Button
                label={copy.recovery.lostTitle}
                variant="secondary"
                onPress={() => router.push(routes.recoverLostPhone)}
              />
            </View>
          );
        }
        if (open && !own) {
          const myContact = recoveryQuery.data?.contacts.find(
            (row) => row.userId === userId && row.status === 'accepted',
          );
          if (!admin && !myContact) {
            return null;
          }
          return (
            <View key={request.id} style={styles.row}>
              <AppText style={styles.rowTitle}>
                {admin
                  ? copy.home.recoveryAdminNotice.replace('{name}', name)
                  : copy.home.recoveryContactNotice.replace('{name}', name)}
              </AppText>
              {myContact ? (
                <Muted>{copy.home.recoveryContactNotice.replace('{name}', name)}</Muted>
              ) : null}
              <Muted>{when}</Muted>
              {myContact && requestCanFinish(request) ? (
                <Button
                  label={copy.home.recoveryApproveHelp}
                  busy={busyNoticeId === request.id}
                  disabled={busyNoticeId !== null && busyNoticeId !== request.id}
                  onPress={() => void onApproveRecoveryHelp(request)}
                />
              ) : null}
              {admin ? (
                <Button
                  label={copy.home.stopThisRecovery}
                  variant="secondary"
                  busy={busyNoticeId === request.id}
                  disabled={busyNoticeId !== null && busyNoticeId !== request.id}
                  onPress={() => void onCancelRecovery(request.id)}
                />
              ) : null}
            </View>
          );
        }
        return null;
      })}
      {(removedNoticesQuery.data ?? []).map((notice) => {
        const member = (membersQuery.data ?? []).find((row) => row.userId === notice.userId);
        const name = memberDisplayName(member?.displayName);
        return (
          <View key={notice.id} style={styles.row}>
            <AppText style={styles.rowTitle}>
              {copy.home.deviceRemovedNotice.replace('{name}', name)}
            </AppText>
          </View>
        );
      })}
      {noticeError ? <ErrorState message={noticeError} /> : null}
      {(noticesQuery.data ?? []).map((notice) => {
        const member = (membersQuery.data ?? []).find((row) => row.userId === notice.userId);
        const name = memberDisplayName(member?.displayName);
        const own = notice.userId === userId;
        const whenLabel = formatDeviceWhen(notice.deviceCreatedAt);
        const setUp = copy.home.deviceSetUp.replace('{when}', whenLabel);

        if (notice.kind === 'extra_device') {
          if (own && keyStatusQuery.data === 'ready') {
            return (
              <ApproveMyDeviceCard
                key={notice.id}
                notice={notice}
                name={name}
                canApprove
                busy={busyNoticeId === notice.id}
                disabled={busyNoticeId !== null && busyNoticeId !== notice.id}
                onApprove={() => void onApproveMyPhone(notice)}
                onReject={() => void onRejectMyPhone(notice)}
              />
            );
          }
          if (admin && !own) {
            return (
              <ApproveMyDeviceCard
                key={notice.id}
                notice={notice}
                name={name}
                canApprove={false}
                busy={false}
                disabled
                onApprove={() => undefined}
                onReject={() => undefined}
              />
            );
          }
          return null;
        }

        if (notice.kind === 'rejected_device') {
          if (!admin) {
            return null;
          }
          return (
            <View key={notice.id} style={styles.row}>
              <AppText style={styles.rowTitle}>
                {copy.home.extraDeviceRejectedNotice.replace('{name}', name)}
              </AppText>
              <Muted>{setUp}</Muted>
            </View>
          );
        }

        if (!admin || own) {
          return null;
        }
        const title = copy.home.letInNotice.replace('{name}', name);
        return (
          <View key={notice.id} style={styles.row}>
            <AppText style={styles.rowTitle}>{title}</AppText>
            <Muted>
              {member ? copy.roles[member.role] : ''}
              {member ? ' · ' : ''}
              {setUp}
            </Muted>
            <Button
              label={copy.home.letIn}
              busy={busyNoticeId === notice.id}
              disabled={busyNoticeId !== null && busyNoticeId !== notice.id}
              onPress={() => void onLetIn(notice)}
              accessibilityHint={title}
            />
            <Button
              label={copy.home.declineDevice}
              variant="secondary"
              busy={busyNoticeId === notice.id}
              disabled={busyNoticeId !== null && busyNoticeId !== notice.id}
              onPress={() => void onDecline(notice.id)}
            />
          </View>
        );
      })}

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

      {admin ? (
        <Button
          label={copy.recovery.title}
          variant="secondary"
          onPress={() => router.push(routes.recoverySetup)}
        />
      ) : null}
      <Button
        label={copy.home.yourPhones}
        variant="secondary"
        onPress={() => router.push(routes.yourPhones)}
      />
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
