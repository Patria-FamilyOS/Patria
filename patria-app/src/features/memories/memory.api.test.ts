import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const MEMORIES_BUCKET = 'memories';
const SIGNED_URL_SECONDS = 600;

const LOCAL_URL = 'http://127.0.0.1:54321';
const LOCAL_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const LOCAL_SERVICE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const TINY_JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);

async function localReady(): Promise<boolean> {
  try {
    const response = await fetch(`${LOCAL_URL}/rest/v1/`, {
      headers: { apikey: LOCAL_ANON },
    });
    return response.ok || response.status === 200 || response.status === 404;
  } catch {
    return false;
  }
}

function userClient(): SupabaseClient {
  return createClient(LOCAL_URL, LOCAL_ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

describe('memory library local API', () => {
  it(
    'blocks an Extended Family-only member from a Household record, signed URL, and leftover files after delete',
    async () => {
      if (!(await localReady())) {
        return;
      }
      const service = createClient(LOCAL_URL, LOCAL_SERVICE, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const password = 'Api-memory-12';
      const stamp = Date.now();
      const adminAuth = await service.auth.admin.createUser({
        email: `admin-mem-${stamp}@patria.local`,
        password,
        email_confirm: true,
      });
      const cousinAuth = await service.auth.admin.createUser({
        email: `cousin-mem-${stamp}@patria.local`,
        password,
        email_confirm: true,
      });
      if (adminAuth.error || cousinAuth.error || !adminAuth.data.user || !cousinAuth.data.user) {
        throw adminAuth.error ?? cousinAuth.error ?? new Error('createUser failed');
      }
      const admin = userClient();
      const adminSession = await admin.auth.signInWithPassword({
        email: `admin-mem-${stamp}@patria.local`,
        password,
      });
      if (adminSession.error) {
        throw adminSession.error;
      }
      admin.auth.stopAutoRefresh();
      const space = await admin.rpc('create_family_space', {
        p_name: `Mem API ${stamp}`,
        p_relationship_label: 'Mom',
      });
      if (space.error || !space.data) {
        throw space.error ?? new Error('create_family_space failed');
      }
      const spaceId = String(space.data);
      const circles = await admin.from('circles').select('id, kind').eq('family_space_id', spaceId);
      const household = circles.data?.find((row) => row.kind === 'household')?.id;
      const extended = circles.data?.find((row) => row.kind === 'extended_family')?.id;
      if (!household || !extended) {
        throw new Error('missing default circles');
      }
      const cousinId = cousinAuth.data.user.id;
      const memberInsert = await service.from('space_members').insert({
        family_space_id: spaceId,
        user_id: cousinId,
        role: 'extended_relative',
      });
      if (memberInsert.error) {
        throw memberInsert.error;
      }
      const circleInsert = await service.from('circle_members').insert({
        circle_id: extended,
        user_id: cousinId,
      });
      if (circleInsert.error) {
        throw circleInsert.error;
      }

      const created = await admin
        .from('memory_items')
        .insert({
          family_space_id: spaceId,
          circle_id: household,
          uploader_id: adminAuth.data.user.id,
          caption: 'Photo A',
          taken_at: new Date().toISOString(),
          width: 10,
          height: 10,
          status: 'uploading',
        })
        .select('id, full_path, thumb_path')
        .single();
      if (created.error || !created.data) {
        throw created.error ?? new Error('insert memory failed');
      }
      const itemId = created.data.id as string;
      const fullPath = created.data.full_path as string;
      const thumbPath = created.data.thumb_path as string;
      const fullUp = await admin.storage.from(MEMORIES_BUCKET).upload(fullPath, TINY_JPEG, {
        contentType: 'image/jpeg',
      });
      const thumbUp = await admin.storage.from(MEMORIES_BUCKET).upload(thumbPath, TINY_JPEG, {
        contentType: 'image/jpeg',
      });
      if (fullUp.error || thumbUp.error) {
        throw fullUp.error ?? thumbUp.error;
      }
      const ready = await admin.from('memory_items').update({ status: 'ready' }).eq('id', itemId);
      if (ready.error) {
        throw ready.error;
      }

      const cousin = userClient();
      const cousinSession = await cousin.auth.signInWithPassword({
        email: `cousin-mem-${stamp}@patria.local`,
        password,
      });
      if (cousinSession.error) {
        throw cousinSession.error;
      }
      cousin.auth.stopAutoRefresh();
      const hidden = await cousin.from('memory_items').select('id').eq('id', itemId);
      expect(hidden.data ?? []).toEqual([]);
      const signed = await cousin.storage.from(MEMORIES_BUCKET).createSignedUrl(fullPath, SIGNED_URL_SECONDS);
      expect(signed.data?.signedUrl).toBeUndefined();
      expect(signed.error).toBeTruthy();

      const removedFiles = await admin.storage.from(MEMORIES_BUCKET).remove([fullPath, thumbPath]);
      if (removedFiles.error) {
        throw removedFiles.error;
      }
      const removedRow = await admin.from('memory_items').delete().eq('id', itemId);
      if (removedRow.error) {
        throw removedRow.error;
      }
      const listed = await admin.storage.from(MEMORIES_BUCKET).list(`${spaceId}/${itemId}`);
      expect(listed.data ?? []).toEqual([]);
    },
    30_000,
  );
});
