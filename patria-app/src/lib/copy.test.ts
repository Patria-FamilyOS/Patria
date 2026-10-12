import { copy } from './copy';

describe('copy', () => {
  it('keeps user facing strings in one file', () => {
    expect(copy.appName).toBe('Patria');
    expect(copy.welcome.title.length).toBeGreaterThan(0);
    expect(copy.invitePreview.summaryTitle.length).toBeGreaterThan(0);
    expect(copy.home.todoMemories.length).toBeGreaterThan(0);
    expect(copy.relationships.mum).toBe('Mom');
    expect(copy.createFamily.failed.length).toBeGreaterThan(0);
    expect(copy.home.joinFamily).toBe('Join another family');
    expect(copy.home.keysReady).toBe('Family keys: set up on this phone');
    expect(copy.home.keysWaiting).toBe('Waiting for a family admin to let this phone in');
    expect(copy.member.fallbackName).toBe('Family member');
  });
});
