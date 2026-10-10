import { useRouter } from 'expo-router';

import { Body, Button, Muted, Screen, Title } from '../../components/ui';
import { copy } from '../../lib/copy';

export function ReadyScreen() {
  const router = useRouter();

  return (
    <Screen accessibilityLabel={copy.ready.title}>
      <Title>{copy.ready.title}</Title>
      <Body>{copy.ready.created}</Body>
      <Muted>{copy.ready.createdDetail}</Muted>
      <Body>{copy.ready.keys}</Body>
      <Muted>{copy.ready.keysDetail}</Muted>
      <Button label={copy.ready.next} onPress={() => router.replace('/(signed-in)')} />
    </Screen>
  );
}
