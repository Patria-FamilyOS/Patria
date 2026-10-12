import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { copy } from '../../lib/copy';
import { supabase } from '../../lib/supabase';
import { CreateFamilyScreen } from './CreateFamilyScreen';

jest.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: jest.fn(),
    auth: { signOut: jest.fn(async () => ({ error: null })) },
  },
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function mockedRouter(): { push: jest.Mock; replace: jest.Mock } {
  const expoRouter = jest.requireMock('expo-router') as {
    useRouter: () => { push: jest.Mock; replace: jest.Mock };
  };
  return expoRouter.useRouter();
}

describe('CreateFamilyScreen', () => {
  beforeEach(() => {
    mockedRouter().push.mockClear();
    mockedRouter().replace.mockClear();
    (supabase.auth.signOut as jest.Mock).mockClear();
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

    expect(mockedRouter().push).toHaveBeenCalledWith('/invite/abc123def456');
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
    expect(mockedRouter().push).not.toHaveBeenCalled();
  });

  it('signs out with a spinner then replaces to welcome', async () => {
    const { getByText } = render(
      <SafeAreaProvider initialMetrics={metrics}>
        <CreateFamilyScreen />
      </SafeAreaProvider>,
    );

    fireEvent.press(getByText(copy.auth.signOut));

    await waitFor(() => {
      expect(supabase.auth.signOut).toHaveBeenCalled();
    });
    expect(mockedRouter().replace).toHaveBeenCalledWith('/(signed-out)/welcome');
  });
});
