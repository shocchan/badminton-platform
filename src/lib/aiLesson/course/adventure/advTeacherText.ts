// 表示文の先生名を、選択中の先生に合わせて差し替える。
//
// 経緯: 文言辞書は「翔子先生」固定で書かれている。先生を選べるようになったため、
// **表示時に名前だけを差し替える**（辞書を先生ごとに二重管理しない）。
//
// 差し替えないもの:
// - `brand`（商品名。学習者の選択で商品名は変わらない）
// - 先生名を含まない文字列（そのまま返す）
import { resolveTeacher, type AdvTeacherId } from './advTeacher';

/** 辞書に固定で書かれている既定の先生名 */
const DEFAULT_NAME = { ja: '翔子先生', zh: '翔子老师' } as const;

/** 商品名など、学習者の選択で変えてはいけないキー */
const PRESERVED_KEYS = new Set(['brand']);

export const replaceTeacherName = (
  text: string, teacherId: AdvTeacherId | null, lang: 'ja' | 'zh',
): string => {
  const t = resolveTeacher(teacherId);
  const to = lang === 'zh' ? t.nameZh : t.nameJa;
  const from = DEFAULT_NAME[lang];
  if (to === from) return text;
  // ja画面でもzh表記が混ざることがあるため両方を見る
  return text.split(DEFAULT_NAME.ja).join(lang === 'zh' ? t.nameJa : to)
    .split(DEFAULT_NAME.zh).join(lang === 'zh' ? to : t.nameZh);
};

/**
 * 辞書オブジェクトを再帰的に走査し、先生名だけを差し替えた複製を返す。
 * 未選択（null）や既定の先生なら**元のオブジェクトをそのまま返す**（余計な再生成をしない）。
 */
export const applyTeacherName = <T>(dict: T, teacherId: AdvTeacherId | null, lang: 'ja' | 'zh'): T => {
  const t = resolveTeacher(teacherId);
  if ((lang === 'zh' ? t.nameZh : t.nameJa) === DEFAULT_NAME[lang]) return dict;

  const walk = (v: unknown, key?: string): unknown => {
    if (typeof v === 'string') {
      return key && PRESERVED_KEYS.has(key) ? v : replaceTeacherName(v, teacherId, lang);
    }
    if (Array.isArray(v)) return v.map((x) => walk(x));
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = walk(val, k);
      return out;
    }
    return v;
  };
  return walk(dict) as T;
};
