import { logFailedAction, logKeyStep } from './devLog';

describe('devLog', () => {
  afterEach(() => {
    process.env.NODE_ENV = 'test';
  });

  it('does nothing in Jest', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    logFailedAction({ code: '42501', message: 'new row violates row-level security policy' });
    logKeyStep('commit_family_key_ceremony', 'space-id');
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('logs only a code and message in development', () => {
    process.env.NODE_ENV = 'development';
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    logFailedAction({ code: '42501', message: 'new row violates row-level security policy' });
    expect(warn).toHaveBeenCalledWith(
      'Patria action failed (42501): new row violates row-level security policy',
    );
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/@|token|password/i);
    warn.mockRestore();
  });

  it('logs only a step name and optional ids in development', () => {
    process.env.NODE_ENV = 'development';
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    logKeyStep('approve_first_device', 'space-id device-id');
    expect(warn).toHaveBeenCalledWith('Patria keys: approve_first_device space-id device-id');
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(
      /wrap|cipher|familyKey|recoveryKey|mnemonic|@/i,
    );
    warn.mockRestore();
  });
});
