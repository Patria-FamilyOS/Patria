import { PlaceholderScreen } from '../../src/components/PlaceholderScreen';
import { copy } from '../../src/lib/copy';

export default function SignedOutHome() {
  return (
    <PlaceholderScreen
      title={copy.signedOut.title}
      body={copy.signedOut.body}
      accessibilityLabel={copy.signedOut.title}
    />
  );
}
