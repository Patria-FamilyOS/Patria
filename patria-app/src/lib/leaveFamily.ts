import { logFailedAction } from './devLog';
import { discardLocalFamilySecrets } from './crypto/keyStore';
import { supabase } from './supabase';

export async function leaveFamilySpace(input: {
  spaceId: string;
  userId: string;
}): Promise<{ ok: true } | { ok: false }> {
  const { error } = await supabase
    .from('space_members')
    .delete()
    .eq('family_space_id', input.spaceId)
    .eq('user_id', input.userId);
  if (error) {
    logFailedAction(error);
    return { ok: false };
  }
  await discardLocalFamilySecrets(input.userId, input.spaceId);
  return { ok: true };
}
