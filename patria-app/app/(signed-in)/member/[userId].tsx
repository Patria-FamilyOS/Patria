import { useLocalSearchParams } from 'expo-router';

import { MemberScreen } from '../../../src/features/family/MemberScreen';

export default function MemberRoute() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  return <MemberScreen userId={userId ?? ''} />;
}
