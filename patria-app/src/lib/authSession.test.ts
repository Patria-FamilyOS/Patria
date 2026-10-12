import { signOutAndGoWelcome } from './authSession';
import { routes } from './navigation';

describe('signOutAndGoWelcome', () => {
  it('signs out then replaces to welcome', async () => {
    const signOut = jest.fn().mockResolvedValue(undefined);
    const replace = jest.fn();

    await signOutAndGoWelcome({ signOut, replace });

    expect(signOut).toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith(routes.welcome);
    expect(replace.mock.invocationCallOrder[0]).toBeGreaterThan(
      signOut.mock.invocationCallOrder[0],
    );
  });
});
