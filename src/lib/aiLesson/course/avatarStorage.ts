// 本人アバターの private Storage 表示（§PW-V1）。
// - settings には objectPath のみ保存（signed URLは期限切れするため永続保存しない）
// - 表示時に短時間 signed URL（30分）を発行。セッション内キャッシュで再発行を抑制
// - path は形式検証（traversal 拒否）。所有権の最終判定は Storage RLS（他人pathは発行失敗）
// - URL は analytics / console / storage へ出さない

import { supabase } from '../../../services/supabaseClient';

const BUCKET = 'ai-course-avatars';
const EXPIRES_SEC = 1800;              // 30分（学習セッション中に切れにくく・漏えい時の窓は短く）
const REFRESH_MARGIN_MS = 5 * 60_000;  // 期限5分前に再発行

const cache = new Map<string, { url: string; expAt: number }>();

/** {uuid}/(approved|candidates)/ファイル.png|webp のみ許可（.. や絶対URLを拒否） */
export const isValidAvatarPath = (path: string): boolean =>
  /^[0-9a-f-]{36}\/(approved|candidates)\/[A-Za-z0-9._-]+\.(png|webp)$/.test(path) && !path.includes('..');

export const getAvatarSignedUrl = async (path: string): Promise<string | null> => {
  if (!isValidAvatarPath(path)) return null;
  const hit = cache.get(path);
  if (hit && hit.expAt - REFRESH_MARGIN_MS > Date.now()) return hit.url;
  try {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, EXPIRES_SEC);
    if (error || !data?.signedUrl) return null; // 他人のpath等はRLSでここで失敗→イニシャルfallback
    cache.set(path, { url: data.signedUrl, expAt: Date.now() + EXPIRES_SEC * 1000 });
    return data.signedUrl;
  } catch { return null; }
};
