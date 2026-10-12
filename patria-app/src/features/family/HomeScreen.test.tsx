import { fireEvent, waitFor } from '@testing-library/react-native';

import { copy } from '../../lib/copy';
import { memberDisplayName } from '../../lib/displayName';
import {
  fetchChildren,
  fetchMembers,
  fetchMemberships,
  fetchPendingInvites,
} from '../../lib/family';
import {
  approveFirstDevice,
  declineFirstDevice,
  fetchFirstDeviceNotices,
} from '../../lib/crypto/deviceAccess';
import { ensureKeysForOpenFamily } from '../../lib/crypto/familyCeremony';
import { supabase } from '../../lib/supabase';
import { renderScreen } from '../../test/renderScreen';
import { HomeScreen } from './HomeScreen';

jest.mock('../../lib/auth-context', () => ({
  useAuth: () => ({ session: { user: { id: 'u1' } }, loading: false }),
}));

jest.mock('../../lib/family', () => ({
  fetchMemberships: jest.fn(async () => [
    { space: { id: 's1', name: 'The Riveras' }, role: 'family_admin' },
  ]),
  fetchMembers: jest.fn(async () => [
    {
      id: 'm1',
      userId: 'u1',
      role: 'family_admin',
      relationshipLabel: null,
      displayName: 'Family member',
    },
    {
      id: 'm2',
      userId: 'u2',
      role: 'co_admin',
      relationshipLabel: null,
      displayName: 'Family member',
    },
  ]),
  fetchChildren: jest.fn(async () => []),
  fetchPendingInvites: jest.fn(async () => []),
}));

jest.mock('../../lib/currentFamily', () => ({
  readCurrentFamilyId: jest.fn(async () => 's1'),
  writeCurrentFamilyId: jest.fn(async () => undefined),
}));

jest.mock('../../lib/crypto/familyCeremony', () => ({
  ensureKeysForOpenFamily: jest.fn(async () => 'ready'),
}));

jest.mock('../../lib/crypto/deviceAccess', () => ({
  fetchFirstDeviceNotices: jest.fn(async () => []),
  approveFirstDevice: jest.fn(async () => undefined),
  declineFirstDevice: jest.fn(async () => undefined),
}));

jest.mock('../../lib/crypto/deviceIdentity', () => ({
  ensureDeviceIdentity: jest.fn(async () => ({
    deviceId: 'd-admin',
    publicKey: new Uint8Array(32),
    privateKey: new Uint8Array(32),
  })),
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
  // First HomeScreen mount is slow on Linux; collection is not billed to an `it`.
  renderScreen(<HomeScreen />).unmount();

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
    (fetchFirstDeviceNotices as jest.Mock).mockResolvedValue([]);
    (ensureKeysForOpenFamily as jest.Mock).mockResolvedValue('ready');
    (approveFirstDevice as jest.Mock).mockClear();
    (declineFirstDevice as jest.Mock).mockClear();
  });

  it('uses a Join another family link instead of a paste box', async () => {
    const { findByLabelText, queryByText } = renderScreen(<HomeScreen />);
    const join = await findByLabelText(copy.home.joinFamily);
    expect(join).toBeTruthy();
    expect(queryByText(copy.invite.pastePrompt)).toBeNull();
    expect(queryByText(copy.invite.pasteLabel)).toBeNull();

    fireEvent.press(join);
    expect(mockedRouter().push).toHaveBeenCalledWith('/(signed-in)/join-family');
  });

  it('signs out then replaces to welcome', async () => {
    const { findByText } = renderScreen(<HomeScreen />);

    fireEvent.press(await findByText(copy.auth.signOut));

    await waitFor(() => {
      expect(supabase.auth.signOut).toHaveBeenCalled();
    });
    expect(mockedRouter().replace).toHaveBeenCalledWith('/(signed-out)/welcome');
  });

  it('shows a quiet family-keys status on Home', async () => {
    const { findByText } = renderScreen(<HomeScreen />);
    expect(await findByText(copy.home.keysReady)).toBeTruthy();
  });

  it('lets an admin wrap or decline a first device from Home', async () => {
    (fetchFirstDeviceNotices as jest.Mock).mockResolvedValue([
      {
        id: 'n1',
        spaceId: 's1',
        userId: 'u2',
        deviceId: 'd-marco',
        publicKey: new Uint8Array(32),
        deviceCreatedAt: '2026-10-12T12:00:00.000Z',
      },
    ]);
    const { findByText, getByText } = renderScreen(<HomeScreen />);

    expect(await findByText(`${copy.member.fallbackName} wants this phone let in`)).toBeTruthy();
    fireEvent.press(getByText(copy.home.letIn));
    await waitFor(() => {
      expect(approveFirstDevice).toHaveBeenCalled();
    });
  });

  it('never shows a blank member card', async () => {
    const { findAllByText, getAllByText } = renderScreen(<HomeScreen />);

    expect((await findAllByText(copy.member.fallbackName)).length).toBeGreaterThan(0);
    expect(getAllByText(copy.roles.co_admin).length).toBeGreaterThan(0);
  });
});
