import sharp from 'sharp';
import crypto from 'node:crypto';
import path from 'node:path';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { pool } from '../config/db.js';
import { transaction, profile, blocked } from './profile.js';
import { fail, uuid } from '../utils/http.util.js';

const directory = path.resolve(process.env.UPLOADS_DIR || new URL('../../uploads', import.meta.url).pathname);
const collection = async id => ({ pictures: (await profile(id)).pictures });
export async function upload(id, file) {
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) fail('UPLOAD_INVALID_TYPE');
  if (file.size > 5 * 1024 * 1024) fail('UPLOAD_TOO_LARGE');
  let buffer;
  try { buffer = await sharp(file.buffer, { limitInputPixels: 20000000 }).rotate().resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true }).webp().toBuffer(); }
  catch { fail('UPLOAD_INVALID_TYPE'); }
  const name = `${crypto.randomUUID()}.webp`;
  await transaction(async client => {
    await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [id]);
    const photos = (await client.query('SELECT id FROM photos WHERE user_id=$1', [id])).rows;
    if (photos.length >= 5) fail('UPLOAD_LIMIT_REACHED', 409);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, name), buffer);
    await client.query('INSERT INTO photos(user_id,url,is_profile_picture,position) VALUES($1,$2,$3,$4)', [id, name, photos.length === 0, photos.length + 1]);
  }).catch(async error => { await unlink(path.join(directory, name)).catch(() => {}); throw error; });
  return collection(id);
}
export async function read(id, viewer) {
  if (!uuid(id)) fail('NOT_FOUND', 404);
  const photo = (await pool.query('SELECT p.*,u.is_verified FROM photos p JOIN users u ON u.id=p.user_id WHERE p.id=$1', [id])).rows[0];
  if (!photo || !photo.is_verified || viewer !== photo.user_id && await blocked(viewer, photo.user_id)) fail('NOT_FOUND', 404);
  if (photo.url.startsWith('https://picsum.photos/')) {
    let response;
    try { response = await fetch(photo.url, { signal: AbortSignal.timeout(8000) }); if (!response.ok) throw Error(); return await sharp(Buffer.from(await response.arrayBuffer())).webp().toBuffer(); }
    catch { fail('NOT_FOUND', 404); }
  }
  try { return await readFile(path.join(directory, path.basename(photo.url))); } catch { fail('NOT_FOUND', 404); }
}
export async function mutate(id, actor, remove = false) {
  if (!uuid(id)) fail('NOT_FOUND', 404);
  const filename = await transaction(async client => {
    await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [actor]);
    const photo = (await client.query('SELECT * FROM photos WHERE id=$1 AND user_id=$2', [id, actor])).rows[0];
    if (!photo) fail('NOT_FOUND', 404);
    if (remove) {
      await client.query('DELETE FROM photos WHERE id=$1', [id]);
      const remaining = (await client.query('SELECT id FROM photos WHERE user_id=$1 ORDER BY position,created_at,id', [actor])).rows;
      for (const [index, item] of remaining.entries()) await client.query('UPDATE photos SET position=$2 WHERE id=$1', [item.id, index + 1]);
      if (photo.is_profile_picture && remaining.length) await client.query('UPDATE photos SET is_profile_picture=true WHERE id=$1', [remaining[0].id]);
      return photo.url;
    } else {
      await client.query('UPDATE photos SET is_profile_picture=(id=$2) WHERE user_id=$1', [actor, id]);
    }
  });
  if (filename && !filename.startsWith('https:')) await unlink(path.join(directory, path.basename(filename))).catch(() => {});
  return collection(actor);
}