import { PlaceholderScreen } from '../../src/components/PlaceholderScreen';
import { copy } from '../../src/lib/copy';

export default function SignedInHome() {
  return (
    <PlaceholderScreen
      title={copy.signedIn.title}
      body={copy.signedIn.body}
      accessibilityLabel={copy.signedIn.title}
    />
  );
}
