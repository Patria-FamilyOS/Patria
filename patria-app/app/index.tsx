import { Redirect } from 'expo-router';

import { SESSION_PLACEHOLDER_SIGNED_IN } from '../src/lib/sessionGate';

export default function Index() {
  if (SESSION_PLACEHOLDER_SIGNED_IN) {
    return <Redirect href="/(signed-in)" />;
  }

  return <Redirect href="/(signed-out)" />;
}
