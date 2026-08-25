// ブログ中国語訳の検品。翻訳JSONと、戻した先のHTMLを機械で見る。
//
// 【言語整合性は既存の実装を使う】
// U+FFFD・文字化け・許可していないUnicode Script・「中国語の地の文に引用外の仮名」は
// src/lib/aiLesson/course/adventure/advLanguageIntegrity.ts の checkText が既に持っている。
// 同じ判定をここに書き直すと必ず片方が古くなるので、**その関数をそのまま呼ぶ**。
// .ts を .mjs から読むため Node の type stripping を使う:
//   node --experimental-strip-types scripts/blog/apply-zh.mjs ...
// 読めなかったときは「検査できなかった」を返す。呼び出し側は --write を拒否すること（fail closed）。
//
// 【固有名詞は checkText の許可リストに載せる】
// 「ばりかた屋」「メガネクラッシュズ」のような日本語のまま残す語は、中国語の地の文に
// 仮名が出る＝ unquoted_kana_in_zh に当たる。checkText へ渡す前に glossary.mjs の
// KEEP_JA を伏せることで、これらを許可リストとして扱う（advLanguageIntegrity.ts の
// stripAllowedTerms と同じやり方）。
import { fileURLToPath } from 'node:url';
import { KEEP_JA, FORBIDDEN_VARIANTS, stripKeepJa } from './glossary.mjs';
import { extractTextNodes, applyTextNodes, structureFingerprint, contentHash } from './htmlText.mjs';

const INTEGRITY_TS = new URL(
  '../../src/lib/aiLesson/course/adventure/advLanguageIntegrity.ts',
  import.meta.url,
);

/** checkText を読む。type stripping が無効な環境では null を返す（＝検査できなかった） */
export async function loadCheckText() {
  try {
    const mod = await import(fileURLToPath(INTEGRITY_TS));
    return typeof mod.checkText === 'function' ? mod.checkText : null;
  } catch (_) {
    return null;
  }
}

/** 1件の指摘 */
const issue = (kind, where, detail) => ({ kind, where, detail });

/**
 * 翻訳JSON（zhDoc）と現在の記事（post）を突き合わせる。
 * @returns {{ ok:boolean, issues:object[], integrityRan:boolean, contentZh:string|null }}
 */
export async function verifyTranslation(post, zhDoc) {
  const issues = [];
  const warnings = [];
  const jaNodes = extractTextNodes(post.content || '');

  // 1) 骨格が動いていないか。記事の構造を編集したあとに古い訳を戻すと、
  //    index がずれて**別の場所に別の文が入る**。数字ひとつで検出できるので必ず見る
  const fp = structureFingerprint(post.content || '');
  if (zhDoc.skeleton && zhDoc.skeleton !== fp) {
    issues.push(issue('skeleton_changed', `post ${post.id}`,
      `記事の構造が編集されています（記録=${zhDoc.skeleton} / 現在=${fp}）。`
      + ' export-zh-todo.mjs をやり直して訳し直してください。'));
    return { ok: false, issues, warnings, integrityRan: false, contentZh: null };
  }
  // 1') 構造が同じでも文言が編集されていれば、その訳は古い可能性がある。
  //     index の対応は崩れていないので止めはしないが、黙って上書きもしない
  if (zhDoc.contentHash && zhDoc.contentHash !== contentHash(post.content || '')) {
    warnings.push(issue('source_edited', `post ${post.id}`,
      '日本語本文が編集されています。訳が古い可能性があるので読み直してください。'));
  }

  // 2) 訳の抜け。抜けたノードは日本語のまま残るので致命ではないが、黙って混ざるのは困る
  const byIndex = new Map();
  for (const n of zhDoc.nodes || []) {
    if (typeof n.zh === 'string' && n.zh.trim()) byIndex.set(n.index, n.zh.trim());
  }
  for (const n of jaNodes) {
    if (!byIndex.has(n.index)) {
      issues.push(issue('missing_node', `post ${post.id} node ${n.index}`, n.text.slice(0, 40)));
    }
  }
  for (const idx of byIndex.keys()) {
    if (!jaNodes.some((n) => n.index === idx)) {
      issues.push(issue('unknown_node', `post ${post.id} node ${idx}`, '対応する日本語ノードがありません'));
    }
  }

  // 3) 固有名詞が日本語のまま残っているか（CEO指示「固有名詞はそのままで」）。
  //    日本語側に出てくる語は、中国語側にも同じ表記で出ていなければならない
  const pairs = [
    ['title', post.title || '', zhDoc.title_zh || ''],
    ['excerpt', post.excerpt || '', zhDoc.excerpt_zh || ''],
    ...jaNodes.map((n) => [`node ${n.index}`, n.text, byIndex.get(n.index) || '']),
  ];
  for (const [where, ja, zh] of pairs) {
    if (!zh) continue;
    for (const term of KEEP_JA) {
      if (ja.includes(term) && !zh.includes(term)) {
        issues.push(issue('proper_noun_translated', `post ${post.id} ${where}`,
          `「${term}」が中国語側に残っていません: ${zh.slice(0, 50)}`));
      }
    }
  }

  // 4) 簡体字で統一する（繁体字・台湾表記が混ざると同じ記事の中で表記が割れる）
  for (const [where, , zh] of pairs) {
    for (const bad of FORBIDDEN_VARIANTS) {
      if (zh.includes(bad)) {
        issues.push(issue('variant_mismatch', `post ${post.id} ${where}`, `「${bad}」は簡体字表記に直してください`));
      }
    }
  }

  // 5) 言語整合性（checkText をそのまま利用）
  const checkText = await loadCheckText();
  if (checkText) {
    for (const [where, , zh] of pairs) {
      if (!zh) continue;
      // 訳さない固有名詞は許可リスト扱いで伏せてから渡す
      const violations = checkText({
        itemId: `blog:${post.id}`,
        field: where,
        locale: 'zh',
        text: stripKeepJa(zh),
        route: 'blog',
        origin: 'canonical',
        sourceFile: `scripts/blog/zh/${post.id}.zh.json`,
      });
      for (const v of violations) {
        issues.push(issue(`lang_${v.kind}`, `post ${post.id} ${where}`,
          `${v.severity} ${v.offending} ${v.codePoints.join(' ')}`));
      }
    }
  }

  const contentZh = applyTextNodes(post.content || '', Object.fromEntries(byIndex));

  // 6) 何も変わっていない訳は事故（index の取り違え・空ファイル）
  if (contentZh === (post.content || '')) {
    issues.push(issue('no_change', `post ${post.id}`, '本文が1文字も変わっていません'));
  }
  // 7) 骨格が保たれているか（タグ・href・iframe属性が動いていない）
  if (structureFingerprint(contentZh) !== fp) {
    issues.push(issue('skeleton_broken', `post ${post.id}`, '訳を戻した結果、HTMLの骨格が変わりました'));
  }

  return {
    ok: issues.length === 0,
    issues,
    warnings,
    integrityRan: Boolean(checkText),
    contentZh,
  };
}
