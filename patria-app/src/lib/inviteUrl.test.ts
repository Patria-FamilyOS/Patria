import { inviteUrlFromToken, tokenFromInviteUrl } from './inviteUrl';

describe('inviteUrl', () => {
  it('builds and parses a patria invite deep link', () => {
    const token = 'abc123def456';
    const url = inviteUrlFromToken(token);
    expect(url).toBe('patria://invite/abc123def456');
    expect(tokenFromInviteUrl(url)).toBe(token);
  });
});
