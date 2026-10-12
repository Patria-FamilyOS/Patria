import { fireEvent, waitFor } from '@testing-library/react-native';
import { RefreshControl } from 'react-native';

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
  approveOwnExtraDevice,
  declineFirstDevice,
  fetchFirstDeviceNotices,
  rejectOwnExtraDevice,
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
  approveOwnExtraDevice: jest.fn(async () => undefined),
  rejectOwnExtraDevice: jest.fn(async () => undefined),
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
  const warmed = renderScreen(<HomeScreen />);
  warmed.unmount();
  warmed.queryClient.clear();

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
    (approveOwnExtraDevice as jest.Mock).mockClear();
    (rejectOwnExtraDevice as jest.Mock).mockClear();
  });

  it('uses a Join another family link instead of a paste box', async () => {
    const view = renderScreen(<HomeScreen />);
    await view.findByLabelText(copy.home.joinFamily);
    expect(view.queryByText(copy.invite.pastePrompt)).toBeNull();
    expect(view.queryByText(copy.invite.pasteLabel)).toBeNull();

    fireEvent.press(view.getByLabelText(copy.home.joinFamily));
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

  it('says this phone needs to be let in again when the family key cannot be obtained', async () => {
    (ensureKeysForOpenFamily as jest.Mock).mockResolvedValue('needsRelink');
    const { findByText } = renderScreen(<HomeScreen />);
    expect(await findByText(copy.home.keysNeedRelink)).toBeTruthy();
  });

  it('refetches first-device notices on pull to refresh', async () => {
    const { UNSAFE_getByType, findByText } = renderScreen(<HomeScreen />);
    expect(await findByText(copy.home.keysReady)).toBeTruthy();
    const callsBefore = (fetchFirstDeviceNotices as jest.Mock).mock.calls.length;
    fireEvent(UNSAFE_getByType(RefreshControl), 'refresh');
    await waitFor(() => {
      expect((fetchFirstDeviceNotices as jest.Mock).mock.calls.length).toBeGreaterThan(callsBefore);
    });
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
        kind: 'first_device',
      },
    ]);
    const { findByText, getByText } = renderScreen(<HomeScreen />);

    expect(await findByText(`${copy.member.fallbackName} wants this phone let in`)).toBeTruthy();
    fireEvent.press(getByText(copy.home.letIn));
    await waitFor(() => {
      expect(approveFirstDevice).toHaveBeenCalled();
    });
  });

  it('lets a member approve their own extra phone and hides Let in for admins', async () => {
    (fetchFirstDeviceNotices as jest.Mock).mockResolvedValue([
      {
        id: 'n-extra',
        spaceId: 's1',
        userId: 'u1',
        deviceId: 'd-new',
        publicKey: new Uint8Array(32),
        deviceCreatedAt: '2026-10-12T12:00:00.000Z',
        kind: 'extra_device',
      },
    ]);
    const { findByText, queryByText } = renderScreen(<HomeScreen />);
    expect(await findByText(copy.home.extraDeviceOwnNotice)).toBeTruthy();
    expect(queryByText(copy.home.letIn)).toBeNull();
    fireEvent.press(await findByText(copy.home.yesMyPhone));
    await waitFor(() => {
      expect(approveOwnExtraDevice).toHaveBeenCalled();
    });
  });

  it('shows admins an information-only extra-device notice', async () => {
    (fetchFirstDeviceNotices as jest.Mock).mockResolvedValue([
      {
        id: 'n-extra-other',
        spaceId: 's1',
        userId: 'u2',
        deviceId: 'd-marco-2',
        publicKey: new Uint8Array(32),
        deviceCreatedAt: '2026-10-12T12:00:00.000Z',
        kind: 'extra_device',
      },
    ]);
    const { findByText, queryByText } = renderScreen(<HomeScreen />);
    expect(await findByText(`${copy.member.fallbackName} added a new phone`)).toBeTruthy();
    expect(queryByText(copy.home.letIn)).toBeNull();
    expect(queryByText(copy.home.yesMyPhone)).toBeNull();
  });

  it('waits for one of your phones when this is an extra device', async () => {
    (ensureKeysForOpenFamily as jest.Mock).mockResolvedValue('waitingOwnPhone');
    const { findByText } = renderScreen(<HomeScreen />);
    expect(await findByText(copy.home.keysWaitingOwnPhone)).toBeTruthy();
  });

  it('opens Your phones from Home', async () => {
    const { findByText } = renderScreen(<HomeScreen />);
    fireEvent.press(await findByText(copy.home.yourPhones));
    expect(mockedRouter().push).toHaveBeenCalledWith('/(signed-in)/your-phones');
  });

  it('never shows a blank member card', async () => {
    const { findAllByText, getAllByText } = renderScreen(<HomeScreen />);

    expect((await findAllByText(copy.member.fallbackName)).length).toBeGreaterThan(0);
    expect(getAllByText(copy.roles.co_admin).length).toBeGreaterThan(0);
  });
});
