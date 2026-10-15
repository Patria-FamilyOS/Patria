import { fireEvent, waitFor } from '@testing-library/react-native';
import { KeyboardAvoidingView } from 'react-native';

import { copy } from '../../lib/copy';
import { routes } from '../../lib/navigation';
import { supabase } from '../../lib/supabase';
import { renderScreen } from '../../test/renderScreen';
import { SignUpScreen } from './SignUpScreen';

jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      signUp: jest.fn(),
    },
  },
}));

function mockedReplace(): jest.Mock {
  const expoRouter = jest.requireMock('expo-router') as {
    useRouter: () => { replace: jest.Mock };
  };
  return expoRouter.useRouter().replace;
}

describe('SignUpScreen', () => {
  beforeEach(() => {
    mockedReplace().mockClear();
    (supabase.auth.signUp as jest.Mock).mockReset();
    (supabase.auth.signUp as jest.Mock).mockResolvedValue({
      data: { session: { access_token: 't' } },
      error: null,
    });
  });

  it('marks the screen, keeps AutoFill, and submits from the password Go key', async () => {
    const { getByTestId, getByLabelText, UNSAFE_getByType } = renderScreen(<SignUpScreen />);

    expect(getByTestId('screen-sign-up')).toBeTruthy();
    expect(UNSAFE_getByType(KeyboardAvoidingView)).toBeTruthy();

    const password = getByLabelText(copy.auth.passwordLabel);
    expect(password.props.returnKeyType).toBe('go');
    expect(password.props.textContentType).toBe('newPassword');
    expect(password.props.autoComplete).toBe('new-password');
    expect(password.props.secureTextEntry).toBe(true);

    fireEvent.changeText(getByLabelText(copy.auth.nameLabel), 'Test 1');
    fireEvent.changeText(getByLabelText(copy.auth.emailLabel), 'test1@example.com');
    fireEvent.changeText(password, 'secret-password');
    fireEvent(password, 'submitEditing');

    await waitFor(() => {
      expect(supabase.auth.signUp).toHaveBeenCalledWith({
        email: 'test1@example.com',
        password: 'secret-password',
        options: { data: { display_name: 'Test 1' } },
      });
    });
    await waitFor(() => {
      expect(mockedReplace()).toHaveBeenCalledWith(routes.gate);
    });
  });
});
