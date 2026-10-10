import { useLocalSearchParams } from 'expo-router';

import { ChildProfileScreen } from '../../../src/features/family/ChildProfileScreen';

export default function ChildRoute() {
  const { childId } = useLocalSearchParams<{ childId: string }>();
  return <ChildProfileScreen childId={childId ?? ''} />;
}
