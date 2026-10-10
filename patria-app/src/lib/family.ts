import { supabase } from './supabase';
import type { SpaceRole } from './roles';

export type FamilySpace = {
  id: string;
  name: string;
};

export type MemberRow = {
  id: string;
  userId: string;
  role: SpaceRole;
  relationshipLabel: string | null;
  displayName: string;
  email: string | null;
};

export type ChildRow = {
  id: string;
  displayName: string;
  dateOfBirth: string | null;
};

export type PendingInvite = {
  id: string;
  email: string;
  role: SpaceRole;
  token: string;
  expiresAt: string;
};

export type CircleOption = {
  id: string;
  name: string;
  kind: string;
};

export type InvitePreview = {
  family_space_name: string;
  role: SpaceRole;
  default_circle_name: string;
  expires_at: string;
  visibility_summary: string;
  inviter_display_name: string;
};

export async function fetchMemberships(
  userId: string,
): Promise<{ space: FamilySpace; role: SpaceRole }[]> {
  const { data, error } = await supabase
    .from('space_members')
    .select('role, family_spaces ( id, name )')
    .eq('user_id', userId);

  if (error) {
    throw error;
  }

  return (data ?? []).flatMap((row) => {
    const space = row.family_spaces as FamilySpace | FamilySpace[] | null;
    const one = Array.isArray(space) ? space[0] : space;
    if (!one) {
      return [];
    }
    return [{ space: one, role: row.role as SpaceRole }];
  });
}

export async function fetchMembers(spaceId: string): Promise<MemberRow[]> {
  const { data, error } = await supabase
    .from('space_members')
    .select('id, user_id, role, relationship_label, profiles ( display_name, email )')
    .eq('family_space_id', spaceId);

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => {
    const profile = row.profiles as
      | { display_name: string; email: string | null }
      | { display_name: string; email: string | null }[]
      | null;
    const one = Array.isArray(profile) ? profile[0] : profile;
    return {
      id: row.id as string,
      userId: row.user_id as string,
      role: row.role as SpaceRole,
      relationshipLabel: row.relationship_label as string | null,
      displayName: one?.display_name ?? '',
      email: one?.email ?? null,
    };
  });
}

export async function fetchChildren(spaceId: string): Promise<ChildRow[]> {
  const { data, error } = await supabase
    .from('child_profiles')
    .select('id, display_name, date_of_birth')
    .eq('family_space_id', spaceId);

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    displayName: row.display_name as string,
    dateOfBirth: row.date_of_birth as string | null,
  }));
}

export async function fetchPendingInvites(spaceId: string): Promise<PendingInvite[]> {
  const { data, error } = await supabase
    .from('invites')
    .select('id, email, role, token, expires_at, status')
    .eq('family_space_id', spaceId)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString());

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    email: row.email as string,
    role: row.role as SpaceRole,
    token: row.token as string,
    expiresAt: row.expires_at as string,
  }));
}

export async function fetchInviteCircles(spaceId: string): Promise<CircleOption[]> {
  const { data, error } = await supabase
    .from('circles')
    .select('id, name, kind')
    .eq('family_space_id', spaceId)
    .in('kind', ['household', 'extended_family', 'close_friends']);

  if (error) {
    throw error;
  }

  return (data ?? []) as CircleOption[];
}

export async function householdCircleId(spaceId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('circles')
    .select('id')
    .eq('family_space_id', spaceId)
    .eq('kind', 'household')
    .maybeSingle();

  if (error) {
    throw error;
  }
  return data?.id ?? null;
}
