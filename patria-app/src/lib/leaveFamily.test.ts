import { discardLocalFamilySecrets } from './crypto/keyStore';
import { leaveFamilySpace } from './leaveFamily';
import { supabase } from './supabase';

jest.mock('./supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

jest.mock('./crypto/keyStore', () => ({
  discardLocalFamilySecrets: jest.fn(async () => undefined),
}));

describe('leaveFamilySpace', () => {
  it('deletes the membership then discards cached family keys for that space', async () => {
    const eqUser = jest.fn(async () => ({ error: null }));
    const eqSpace = jest.fn(() => ({ eq: eqUser }));
    const del = jest.fn(() => ({ eq: eqSpace }));
    (supabase.from as jest.Mock).mockReturnValue({ delete: del });

    const result = await leaveFamilySpace({ spaceId: 's1', userId: 'u2' });

    expect(result).toEqual({ ok: true });
    expect(supabase.from).toHaveBeenCalledWith('space_members');
    expect(discardLocalFamilySecrets).toHaveBeenCalledWith('u2', 's1');
  });
});
