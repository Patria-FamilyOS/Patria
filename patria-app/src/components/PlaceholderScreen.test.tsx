import { render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { copy } from '../lib/copy';
import { PlaceholderScreen } from './PlaceholderScreen';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

describe('PlaceholderScreen', () => {
  it('renders title and body copy', () => {
    const { getByText } = render(
      <SafeAreaProvider initialMetrics={metrics}>
        <PlaceholderScreen
          title={copy.welcome.title}
          body={copy.welcome.body}
          accessibilityLabel={copy.welcome.title}
        />
      </SafeAreaProvider>,
    );

    expect(getByText(copy.welcome.title)).toBeTruthy();
    expect(getByText(copy.welcome.body)).toBeTruthy();
    expect(getByText(copy.welcome.title).props.maxFontSizeMultiplier).toBe(2);
    expect(getByText(copy.welcome.title).props.allowFontScaling).not.toBe(false);
  });
});
