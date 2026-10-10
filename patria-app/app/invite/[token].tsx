import { useLocalSearchParams } from 'expo-router';

import { InvitePreviewScreen } from '../../src/features/invites/InvitePreviewScreen';

export default function InviteRoute() {
  const { token } = useLocalSearchParams<{ token: string }>();
  return <InvitePreviewScreen token={token ?? ''} />;
}
