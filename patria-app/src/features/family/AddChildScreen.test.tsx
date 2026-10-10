import { copy } from '../../lib/copy';

describe('add child', () => {
  it('does not ask for email or a password', () => {
    expect(copy.child.noEmail.length).toBeGreaterThan(0);
    expect(JSON.stringify(copy.child)).not.toMatch(/password/i);
    expect(copy.child.body).toMatch(/No email/i);
  });
});
