import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  AppText,
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
import { readCurrentFamilyId } from '../../lib/currentFamily';
import { fetchMemberships } from '../../lib/family';
import { routes } from '../../lib/navigation';
import { isMemoryRole } from '../../lib/roles';
import { colors, spacing, type } from '../../theme';
import {
  cleanupStaleUploads,
  clearImageCacheIfItemsLost,
  fetchReadyMemories,
  type MemoryItem,
} from './memoryApi';

function formatTakenAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function MemoriesScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id;
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const previousIds = useRef<string[]>([]);

  useEffect(() => {
    void readCurrentFamilyId().then(setSpaceId);
  }, []);

  const membershipsQuery = useQuery({
    queryKey: ['memberships', userId],
    enabled: Boolean(userId),
    queryFn: () => fetchMemberships(userId as string),
  });
  const role = membershipsQuery.data?.find((item) => item.space.id === spaceId)?.role;

  const memoriesQuery = useQuery({
    queryKey: ['memories', spaceId],
    enabled: Boolean(spaceId) && isMemoryRole(role),
    queryFn: async (): Promise<MemoryItem[]> => fetchReadyMemories(spaceId as string),
  });

  useEffect(() => {
    if (!userId || !isMemoryRole(role)) {
      return;
    }
    void cleanupStaleUploads(userId);
  }, [userId, role]);

  useEffect(() => {
    const ids = (memoriesQuery.data ?? []).map((item) => item.id);
    void clearImageCacheIfItemsLost(previousIds.current, ids).then(() => {
      previousIds.current = ids;
    });
  }, [memoriesQuery.data]);

  const onRefresh = useCallback(() => {
    void memoriesQuery.refetch();
  }, [memoriesQuery]);

  if (!spaceId || membershipsQuery.isLoading) {
    return (
      <Screen withHeader>
        <LoadingState message={copy.common.loading} />
      </Screen>
    );
  }

  if (!isMemoryRole(role)) {
    return (
      <Screen withHeader testID="screen-memories">
        <Title>{copy.memories.title}</Title>
        <BodyDenied />
      </Screen>
    );
  }

  return (
    <Screen
      withHeader
      testID="screen-memories"
      accessibilityLabel={copy.memories.title}
      refreshing={memoriesQuery.isRefetching}
      onRefresh={onRefresh}
    >
      <Title>{copy.memories.title}</Title>
      <Button label={copy.memories.addPhotos} onPress={() => router.push(routes.memoriesAdd)} />
      {memoriesQuery.isLoading ? <LoadingState message={copy.common.loading} /> : null}
      {memoriesQuery.isError ? <ErrorState message={copy.common.error} /> : null}
      {!memoriesQuery.isLoading && (memoriesQuery.data ?? []).length === 0 ? (
        <EmptyState message={copy.memories.empty} />
      ) : null}
      <View style={styles.grid}>
        {(memoriesQuery.data ?? []).map((item) => (
          <Pressable
            key={item.id}
            testID={`memory-${item.id}`}
            accessibilityRole="button"
            accessibilityLabel={`${item.circleName}, ${item.uploaderName}, ${formatTakenAt(item.takenAt)}`}
            onPress={() => router.push(routes.memoryItem(item.id))}
            style={styles.tile}
          >
            {item.thumbUrl ? (
              <Image source={{ uri: item.thumbUrl }} style={styles.thumb} contentFit="cover" />
            ) : (
              <View style={[styles.thumb, styles.thumbEmpty]} />
            )}
            <AppText testID={`memory-badge-${item.id}`} style={styles.badge}>
              {item.circleName}
            </AppText>
            {item.caption ? <Muted testID={`memory-caption-${item.id}`}>{item.caption}</Muted> : null}
            <Muted testID={`memory-uploader-${item.id}`}>{item.uploaderName}</Muted>
            <Muted testID={`memory-meta-${item.id}`}>{formatTakenAt(item.takenAt)}</Muted>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

function BodyDenied() {
  return <Muted>{copy.memories.denied}</Muted>;
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tile: {
    width: '47%',
    flexGrow: 1,
    gap: spacing.xs,
  },
  thumb: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 12,
    backgroundColor: colors.chip,
  },
  thumbEmpty: {
    minHeight: 96,
  },
  badge: {
    ...type.caption,
    color: colors.primary,
    fontWeight: '600',
  },
});
