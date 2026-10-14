import { testIdFromLabel } from './testId';

describe('testIdFromLabel', () => {
  it('turns button labels into stable Maestro ids', () => {
    expect(testIdFromLabel('Sign out')).toBe('sign-out');
    expect(testIdFromLabel('This wasn’t me')).toBe('this-wasnt-me');
    expect(testIdFromLabel('I already have an account')).toBe('i-already-have-an-account');
  });
});
