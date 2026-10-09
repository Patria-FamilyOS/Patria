import { render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { copy } from '../lib/copy';
import { PlaceholderScreen } from './PlaceholderScreen';

const safeAreaMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

describe('PlaceholderScreen', () => {
  it('renders copy for the signed-out placeholder', () => {
    const { getByText } = render(
      <SafeAreaProvider initialMetrics={safeAreaMetrics}>
        <PlaceholderScreen
          title={copy.signedOut.title}
          body={copy.signedOut.body}
          accessibilityLabel={copy.signedOut.title}
        />
      </SafeAreaProvider>,
    );

    expect(getByText(copy.signedOut.title)).toBeTruthy();
    expect(getByText(copy.signedOut.body)).toBeTruthy();
  });
});
