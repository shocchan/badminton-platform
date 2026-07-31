#!/usr/bin/env node
/**
 * 横断品質監査（Phase B-5・UI層）。
 *
 * 教材データ側は contentReleaseAudit.ts が担当する。こちらはそこが見ない
 * 「学習者の画面に何が出てしまうか」を静的に調べる:
 *   1. 中国語表示でも日本語が出てしまう箇所（辞書を通さない直書き）
 *   2. learner-visibleなTODO / 準備中 / coming soon / placeholder
 *   3. 出荷してはいけないconsole出力
 *   4. 未翻訳のaria-label / placeholder / alt（支援技術だけが読む文言の取り残し）
 *
 * 出力は件数と file:line だけ。全文は出さない。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('../../', import.meta.url).pathname.replace(/\/$/, '');
const SCAN_DIRS = ['src/components/ai-course', 'src/pages/ai-lesson'];
// 管理者だけが見る画面は learner-visible ではないので、日本語直書きを欠陥として数えない
const ADMIN_ONLY = [/AiCourseAdminPage\.tsx$/, /CourseLearnerList\.tsx$/, /CourseUsageCostCard\.tsx$/];
// ja/zh を両方持つ辞書ファイル自体は「日本語直書き」ではない
const DICTIONARY = [/lpContent\.ts$/, /vocabReviewI18n\.ts$/, /locales\//];
const KANA = /[ぁ-んァ-ヴ]/;               // かな＝ほぼ確実に日本語（漢字だけだと中国語と区別できない）

const walk = (dir) => {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p)) out.push(p);
  }
  return out;
};

/** コメントを空白に潰す（行番号は保つ）。文字列中の // を誤検出しない程度の実用版。 */
const stripComments = (src) => {
  let out = '';
  let i = 0;
  let mode = 'code'; // code | line | block | s | d | t
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (mode === 'code') {
      if (c === '/' && n === '/') { mode = 'line'; out += '  '; i += 2; continue; }
      if (c === '/' && n === '*') { mode = 'block'; out += '  '; i += 2; continue; }
      if (c === "'") mode = 's';
      else if (c === '"') mode = 'd';
      else if (c === '`') mode = 't';
      out += c; i++; continue;
    }
    if (mode === 'line') { if (c === '\n') { mode = 'code'; out += c; } else out += ' '; i++; continue; }
    if (mode === 'block') {
      if (c === '*' && n === '/') { mode = 'code'; out += '  '; i += 2; continue; }
      out += c === '\n' ? c : ' '; i++; continue;
    }
    // 文字列内
    if (c === '\\') { out += c + (n ?? ''); i += 2; continue; }
    if ((mode === 's' && c === "'") || (mode === 'd' && c === '"') || (mode === 't' && c === '`')) mode = 'code';
    out += c; i++;
  }
  return out;
};

const findings = { hardcodedJa: [], placeholders: [], consoleCalls: [], untranslatedA11y: [] };
// stepTodo のような識別子に当たらないよう境界を付ける
const PLACEHOLDER = /\bTODO\b|\bFIXME\b|\bXXX\b|準備中|准备中|coming\s*soon|敬请期待|lorem ipsum/i;
const A11Y_ATTR = /\b(aria-label|placeholder|alt|title)=["']([^"']+)["']/g;

for (const dir of SCAN_DIRS) {
  for (const file of walk(join(ROOT, dir))) {
    const rel = relative(ROOT, file);
    const raw = readFileSync(file, 'utf8');
    const code = stripComments(raw);
    const lines = code.split('\n');
    const rawLines = raw.split('\n');

    const adminOnly = ADMIN_ONLY.some((re) => re.test(rel)) || DICTIONARY.some((re) => re.test(rel));
    lines.forEach((line, idx) => {
      const at = `${rel}:${idx + 1}`;
      // 1) JSXテキスト or 文字列リテラル中のかな。辞書経由（t.` `）なら問題ない
      if (KANA.test(line)) {
        // 辞書経由 or ja/zh の三項演算子で両言語を持っているなら翻訳済みとみなす
        const viaDict = /\bt[a-zA-Z0-9_]*\./.test(line) || /aiCourseI18n|locales/.test(line)
          || /lang\s*===?\s*['"]ja['"]/.test(line) || /\[lang\]/.test(line)
          || /\bzh\s*\?/.test(line) || /\bisZh\b/.test(line);
        const jsxText = />[^<>{]*[ぁ-んァ-ヴ][^<>]*</.test(line);
        const strLit = /(["'])[^"']*[ぁ-んァ-ヴ][^"']*\1/.test(line);
        if ((jsxText || strLit) && !viaDict && !adminOnly) findings.hardcodedJa.push(at);
      }
      // 2) learner-visibleなplaceholder表現
      if (PLACEHOLDER.test(line)) findings.placeholders.push(`${at}  ${rawLines[idx].trim().slice(0, 70)}`);
      // 3) console出力
      // console.error はError Boundary等の意図的な記録なので数えない（学習者には出ない）
      if (/\bconsole\.(log|debug|info)\s*\(/.test(line)) findings.consoleCalls.push(at);
      // 4) 支援技術だけが読む文言の未翻訳（かな or ASCIIべた書き）
      let m;
      A11Y_ATTR.lastIndex = 0;
      while ((m = A11Y_ATTR.exec(line))) {
        const val = m[2];
        if (val.startsWith('{') || !val.trim()) continue;
        // decorative なsprite等は aria-hidden で title を描画しないため、読み上げ対象ではない
        if (/\bdecorative\b/.test(line)) continue;
        if (!adminOnly) findings.untranslatedA11y.push(`${at}  ${m[1]}="${val.slice(0, 40)}"`);
      }
    });
  }
}

const R = {
  hardcodedJapanese: { count: findings.hardcodedJa.length, byFile: Object.fromEntries(Object.entries(findings.hardcodedJa.reduce((a,s)=>{const f=s.split(':')[0];a[f]=(a[f]||0)+1;return a;},{})).sort((a,b)=>b[1]-a[1])) },
  learnerVisiblePlaceholder: { count: findings.placeholders.length, hits: findings.placeholders },
  consoleCalls: { count: findings.consoleCalls.length, hits: findings.consoleCalls },
  untranslatedA11yAttrs: { count: findings.untranslatedA11y.length, hits: findings.untranslatedA11y },
};
console.log(JSON.stringify(R, null, 2));
const fail = R.learnerVisiblePlaceholder.count || R.consoleCalls.count || R.untranslatedA11yAttrs.count || R.hardcodedJapanese.count;
console.log(fail ? 'CROSS-PRODUCT AUDIT: FINDINGS' : 'CROSS-PRODUCT AUDIT: CLEAN');
