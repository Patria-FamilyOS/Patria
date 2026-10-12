import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { copy } from '../../lib/copy';
import { CreateFamilyScreen } from './CreateFamilyScreen';

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

describe('CreateFamilyScreen', () => {
  beforeEach(() => {
    mockedPush().mockClear();
  });

  it('opens a pasted invite on the accept screen instead of creating a family', () => {
    const { getByLabelText, getByText } = render(
      <SafeAreaProvider initialMetrics={metrics}>
        <CreateFamilyScreen />
      </SafeAreaProvider>,
    );

    expect(getByText(copy.invite.pastePrompt)).toBeTruthy();
    fireEvent.changeText(
      getByLabelText(copy.invite.pasteLabel),
      'patria://invite/abc123def456',
    );
    fireEvent.press(getByText(copy.invite.openLink));

    expect(mockedPush()).toHaveBeenCalledWith('/invite/abc123def456');
  });

  it('shows a friendly error when the pasted invite link is not valid', () => {
    const { getByLabelText, getByText } = render(
      <SafeAreaProvider initialMetrics={metrics}>
        <CreateFamilyScreen />
      </SafeAreaProvider>,
    );

    fireEvent.changeText(getByLabelText(copy.invite.pasteLabel), 'not-an-invite');
    fireEvent.press(getByText(copy.invite.openLink));

    expect(getByText(copy.invite.pasteInvalid)).toBeTruthy();
    expect(mockedPush()).not.toHaveBeenCalled();
  });
});
