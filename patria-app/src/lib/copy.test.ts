import { copy } from './copy';

describe('copy', () => {
  it('keeps user facing strings in one file', () => {
    expect(copy.appName).toBe('Patria');
    expect(copy.welcome.title.length).toBeGreaterThan(0);
    expect(copy.invitePreview.summaryTitle.length).toBeGreaterThan(0);
    expect(copy.home.todoMemories.length).toBeGreaterThan(0);
    expect(copy.relationships.mum).toBe('Mom');
    expect(copy.createFamily.failed.length).toBeGreaterThan(0);
  });
});
