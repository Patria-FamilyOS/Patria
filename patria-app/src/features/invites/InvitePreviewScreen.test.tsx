import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { copy } from '../../lib/copy';
import { resolveEntryHref } from '../../lib/sessionGate';
import { supabase } from '../../lib/supabase';
import { InvitePreviewScreen } from './InvitePreviewScreen';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

jest.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: jest.fn(),
  },
}));

jest.mock('../../lib/auth-context', () => ({
  useAuth: () => ({ session: null, loading: false }),
}));

function mockedReplace(): jest.Mock {
  const expoRouter = jest.requireMock('expo-router') as {
    useRouter: () => { replace: jest.Mock };
  };
  return expoRouter.useRouter().replace;
}

function renderInvite() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SafeAreaProvider initialMetrics={metrics}>
        <InvitePreviewScreen token="deadbeef" />
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
}

describe('InvitePreviewScreen invalid invite', () => {
  beforeEach(() => {
    mockedReplace().mockClear();
    (SecureStore.deleteItemAsync as jest.Mock).mockClear();
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: [], error: null });
  });

  it('clears the pending token as soon as the preview is invalid', async () => {
    renderInvite();

    await waitFor(() => {
      expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
    });
  });

  it('Continue replaces to the gate, which sends signed-out users to welcome', async () => {
    const { getByText } = renderInvite();

    await waitFor(() => {
      expect(getByText(copy.invitePreview.invalid)).toBeTruthy();
    });
    fireEvent.press(getByText(copy.common.continue));

    await waitFor(() => {
      expect(mockedReplace()).toHaveBeenCalledWith('/');
    });
    expect(
      resolveEntryHref({
        hasSession: false,
        membershipCount: 0,
        pendingInviteToken: null,
      }),
    ).toBe('/(signed-out)/welcome');
  });

  it('Continue then the gate sends signed-in users to create family or home, never back to the invite', async () => {
    const { getByText } = renderInvite();

    await waitFor(() => {
      expect(getByText(copy.common.continue)).toBeTruthy();
    });
    fireEvent.press(getByText(copy.common.continue));

    await waitFor(() => {
      expect(mockedReplace()).toHaveBeenCalledWith('/');
    });
    expect(
      resolveEntryHref({
        hasSession: true,
        membershipCount: 0,
        pendingInviteToken: null,
      }),
    ).toBe('/(signed-in)/create');
    expect(
      resolveEntryHref({
        hasSession: true,
        membershipCount: 1,
        pendingInviteToken: null,
      }),
    ).toBe('/(signed-in)/home');
    expect(
      resolveEntryHref({
        hasSession: true,
        membershipCount: 0,
        pendingInviteToken: null,
      }),
    ).not.toMatch(/^\/invite\//);
  });
});
