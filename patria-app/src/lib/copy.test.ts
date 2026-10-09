import { copy } from './copy';

describe('copy', () => {
  it('keeps placeholder strings in one file', () => {
    expect(copy.appName).toBe('Patria');
    expect(copy.signedOut.title.length).toBeGreaterThan(0);
    expect(copy.signedIn.title.length).toBeGreaterThan(0);
  });
});
