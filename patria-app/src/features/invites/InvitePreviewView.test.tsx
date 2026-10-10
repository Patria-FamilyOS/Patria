import { render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { copy } from '../../lib/copy';
import { InvitePreviewView } from './InvitePreviewView';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const preview = {
  family_space_name: 'The Rivera Family',
  role: 'teen' as const,
  default_circle_name: 'Household',
  expires_at: new Date().toISOString(),
  visibility_summary: 'You can see the family space and the member list.',
  inviter_display_name: 'Elena Rivera',
};

describe('InvitePreviewView', () => {
  it('shows who invited, the family, role, and visibility summary before accept', () => {
    const { getByText } = render(
      <SafeAreaProvider initialMetrics={metrics}>
        <InvitePreviewView
          preview={preview}
          signedIn
          busy={false}
          error={null}
          onAccept={() => undefined}
          onDecline={() => undefined}
          onSignIn={() => undefined}
          onSignUp={() => undefined}
        />
      </SafeAreaProvider>,
    );

    expect(getByText(/Elena Rivera/)).toBeTruthy();
    expect(getByText(/The Rivera Family/)).toBeTruthy();
    expect(getByText(preview.visibility_summary)).toBeTruthy();
    expect(getByText(copy.invitePreview.accept)).toBeTruthy();
    expect(getByText(copy.invitePreview.decline)).toBeTruthy();
  });
});
