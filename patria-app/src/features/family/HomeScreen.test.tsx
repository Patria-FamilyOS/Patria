import { fireEvent, waitFor } from '@testing-library/react-native';

import { copy } from '../../lib/copy';
import { memberDisplayName } from '../../lib/displayName';
import {
  fetchChildren,
  fetchMembers,
  fetchMemberships,
  fetchPendingInvites,
} from '../../lib/family';
import { supabase } from '../../lib/supabase';
import { renderScreen } from '../../test/renderScreen';
import { HomeScreen } from './HomeScreen';

jest.mock('../../lib/auth-context', () => ({
  useAuth: () => ({ session: { user: { id: 'u1' } }, loading: false }),
}));

jest.mock('../../lib/family', () => ({
  fetchMemberships: jest.fn(),
  fetchMembers: jest.fn(),
  fetchChildren: jest.fn(),
  fetchPendingInvites: jest.fn(),
}));

jest.mock('../../lib/crypto/familyCeremony', () => ({
  ensureKeysForOpenFamily: jest.fn(async () => 'ready'),
}));

jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: { signOut: jest.fn(async () => ({ error: null })) },
  },
}));

function mockedRouter(): { push: jest.Mock; replace: jest.Mock } {
  const expoRouter = jest.requireMock('expo-router') as {
    useRouter: () => { push: jest.Mock; replace: jest.Mock };
  };
  return expoRouter.useRouter();
}

describe('HomeScreen invite entry', () => {
  beforeEach(() => {
    mockedRouter().push.mockClear();
    mockedRouter().replace.mockClear();
    (supabase.auth.signOut as jest.Mock).mockClear();
    (fetchMemberships as jest.Mock).mockResolvedValue([
      { space: { id: 's1', name: 'The Riveras' }, role: 'family_admin' },
    ]);
    (fetchMembers as jest.Mock).mockResolvedValue([
      {
        id: 'm1',
        userId: 'u1',
        role: 'family_admin',
        relationshipLabel: null,
        displayName: memberDisplayName(''),
      },
      {
        id: 'm2',
        userId: 'u2',
        role: 'co_admin',
        relationshipLabel: null,
        displayName: memberDisplayName(null),
      },
    ]);
    (fetchChildren as jest.Mock).mockResolvedValue([]);
    (fetchPendingInvites as jest.Mock).mockResolvedValue([]);
  });

  it('uses a Join another family link instead of a paste box', async () => {
    const { getByLabelText, queryByText } = renderScreen(<HomeScreen />);

    await waitFor(() => {
      expect(getByLabelText(copy.home.joinFamily)).toBeTruthy();
    });
    expect(queryByText(copy.invite.pastePrompt)).toBeNull();
    expect(queryByText(copy.invite.pasteLabel)).toBeNull();

    fireEvent.press(getByLabelText(copy.home.joinFamily));
    expect(mockedRouter().push).toHaveBeenCalledWith('/(signed-in)/join-family');
  });

  it('signs out then replaces to welcome', async () => {
    const { getByText } = renderScreen(<HomeScreen />);

    await waitFor(() => {
      expect(getByText(copy.auth.signOut)).toBeTruthy();
    });
    fireEvent.press(getByText(copy.auth.signOut));

    await waitFor(() => {
      expect(supabase.auth.signOut).toHaveBeenCalled();
    });
    expect(mockedRouter().replace).toHaveBeenCalledWith('/(signed-out)/welcome');
  });

  it('shows a quiet family-keys status on Home', async () => {
    const { getByText } = renderScreen(<HomeScreen />);

    await waitFor(() => {
      expect(getByText(copy.home.keysReady)).toBeTruthy();
    });
  });

  it('never shows a blank member card', async () => {
    const { getAllByText } = renderScreen(<HomeScreen />);

    await waitFor(() => {
      expect(getAllByText(copy.member.fallbackName).length).toBeGreaterThan(0);
    });
    expect(getAllByText(copy.roles.co_admin).length).toBeGreaterThan(0);
  });
});
