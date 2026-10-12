import { logFailedAction } from './devLog';

describe('logFailedAction', () => {
  it('logs only a code and message in development', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    logFailedAction({ code: '42501', message: 'new row violates row-level security policy' });
    expect(warn).toHaveBeenCalledWith(
      'Patria action failed (42501): new row violates row-level security policy',
    );
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/@|token|password/i);
    warn.mockRestore();
  });
});
