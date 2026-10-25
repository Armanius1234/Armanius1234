/**
 * Account deletion and data export (GDPR Art. 15, 17, 20).
 */
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { unregisterPush } from '@/features/notifications/push';
import { supabase } from '@/lib/supabase';

async function listAll(bucket: string, folder: string): Promise<string[]> {
  const { data, error } = await supabase.storage.from(bucket).list(folder, { limit: 1000 });
  if (error) throw error;
  const out: string[] = [];
  for (const entry of data ?? []) {
    const path = `${folder}/${entry.name}`;
    // Folders are returned without an id.
    if (entry.id === null) out.push(...(await listAll(bucket, path)));
    else out.push(path);
  }
  return out;
}

async function removeAll(bucket: string, paths: string[]) {
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await supabase.storage.from(bucket).remove(paths.slice(i, i + 100));
    if (error) throw error;
  }
}

/** Deletes every file the user owns, in every bucket. */
export async function deleteAllMyFiles(uid: string): Promise<void> {
  await removeAll('avatars', await listAll('avatars', uid));
  await removeAll('verification-evidence', await listAll('verification-evidence', uid));

  const { data: vehicles, error: vErr } = await supabase.from('vehicles').select('id').eq('owner_id', uid);
  if (vErr) throw vErr;
  for (const v of vehicles ?? []) await removeAll('vehicle-photos', await listAll('vehicle-photos', v.id));

  const { data: posts, error: pErr } = await supabase.from('posts').select('id').eq('author_id', uid);
  if (pErr) throw pErr;
  for (const p of posts ?? []) await removeAll('post-media', await listAll('post-media', p.id));
}

/**
 * Permanently deletes the account after re-checking the password.
 * Files first (only the owner may delete them), then all database rows.
 */
export async function deleteMyAccount(email: string, password: string): Promise<void> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  const uid = data.user.id;

  await unregisterPush().catch(() => undefined);
  await deleteAllMyFiles(uid);
  const { error: delErr } = await supabase.rpc('delete_my_account');
  if (delErr) throw delErr;
  // The login no longer exists; clear the session on this phone.
  await supabase.auth.signOut({ scope: 'local' });
}

/** Builds a JSON file with all the user's data and opens the share sheet. */
export async function exportMyData(dialogTitle: string): Promise<void> {
  const { data, error } = await supabase.rpc('export_my_data');
  if (error) throw error;
  const date = new Date().toISOString().slice(0, 10);
  const file = new File(Paths.cache, `pl8-data-${date}.json`);
  file.create({ overwrite: true });
  await file.write(JSON.stringify(data, null, 2));
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle, UTI: 'public.json' });
  }
}
