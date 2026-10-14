import { fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { copy } from '../../lib/copy';
import { fetchAdminMemberEmail, fetchMembers } from '../../lib/family';
import { leaveFamilySpace } from '../../lib/leaveFamily';
import { renderScreen } from '../../test/renderScreen';
import { MemberScreen } from './MemberScreen';

jest.mock('../../lib/auth-context', () => ({
  useAuth: () => ({ session: { user: { id: 'u2' } }, loading: false }),
}));

jest.mock('../../lib/currentFamily', () => ({
  readCurrentFamilyId: jest.fn(async () => 's1'),
}));

jest.mock('../../lib/family', () => ({
  fetchMembers: jest.fn(),
  fetchAdminMemberEmail: jest.fn(async () => null),
}));

jest.mock('../../lib/leaveFamily', () => ({
  leaveFamilySpace: jest.fn(async () => ({ ok: true })),
}));

const members = [
  {
    id: 'm1',
    userId: 'u1',
    role: 'family_admin' as const,
    relationshipLabel: null,
    displayName: 'Test 1',
  },
  {
    id: 'm2',
    userId: 'u2',
    role: 'elder' as const,
    relationshipLabel: null,
    displayName: 'Test 2',
  },
];

describe('MemberScreen leave family', () => {
  beforeEach(() => {
    (fetchMembers as jest.Mock).mockResolvedValue(members);
    (fetchAdminMemberEmail as jest.Mock).mockResolvedValue(null);
    (leaveFamilySpace as jest.Mock).mockResolvedValue({ ok: true });
  });

  it('lets a member leave from their own row after a destructive confirm', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      expect(buttons?.[0]?.style).toBe('cancel');
      const leave = buttons?.find((item) => item.style === 'destructive');
      expect(leave?.text).toBe(copy.member.leave);
      leave?.onPress?.();
    });
    const { findByText } = renderScreen(<MemberScreen userId="u2" />);
    fireEvent.press(await findByText(copy.member.leave));
    await waitFor(() => {
      expect(leaveFamilySpace).toHaveBeenCalledWith({ spaceId: 's1', userId: 'u2' });
    });
    alertSpy.mockRestore();
  });

  it('does not show leave on someone else’s row', async () => {
    const { findByText, queryByText } = renderScreen(<MemberScreen userId="u1" />);
    await findByText('Test 1');
    expect(queryByText(copy.member.leave)).toBeNull();
  });
});
