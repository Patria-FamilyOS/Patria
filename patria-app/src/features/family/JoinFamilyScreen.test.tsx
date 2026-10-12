import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { copy } from '../../lib/copy';
import { JoinFamilyScreen } from './JoinFamilyScreen';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function mockedPush(): jest.Mock {
  const expoRouter = jest.requireMock('expo-router') as {
    useRouter: () => { push: jest.Mock };
  };
  return expoRouter.useRouter().push;
}

describe('JoinFamilyScreen', () => {
  beforeEach(() => {
    mockedPush().mockClear();
  });

  it('opens a pasted invite on the accept screen', () => {
    const { getByLabelText, getByText } = render(
      <SafeAreaProvider initialMetrics={metrics}>
        <JoinFamilyScreen />
      </SafeAreaProvider>,
    );

    expect(getByText(copy.home.joinFamily)).toBeTruthy();
    fireEvent.changeText(
      getByLabelText(copy.invite.pasteLabel),
      'patria://invite/abc123def456',
    );
    fireEvent.press(getByText(copy.invite.openLink));

    expect(mockedPush()).toHaveBeenCalledWith('/invite/abc123def456');
  });
});
