// 中国語解説内の日本語の分類（COMPLETION §4）。
// 実行: ./node_modules/.bin/vite-node scripts/ai-course/audit-zh-explanations.ts
//
// 分類:
//  A_TARGET_JAPANESE … 正当な日本語学習対象（文法名・活用形・例文）→ 「」で囲めば正
//  B_UNWANTED_JA     … 中国語説明へ混入した不要な日本語の地の文 → 中国語へ直す
//  C_UNCLEAR         … 判断が難しい → HOLD / humanReviewCandidate
//
// 判定の考え方（機械規則・保守的）:
//  - 日本語の連なりが「文法用語・活用形・短い引用語」なら A
//  - 述語で終わる長い日本語の地の文（説明そのものが日本語）なら B
//  - どちらとも言えない中間長は C
import { writeFileSync, mkdirSync } from 'node:fs';
import { collectLearnerVisibleTexts } from '../../src/lib/aiLesson/course/adventure/advLanguageCollect';
import { stripQuoted } from '../../src/lib/aiLesson/course/adventure/advLanguageIntegrity';

/** V2画面で実際に learner へ描画される zh フィールド */
const V2_VISIBLE_ZH_FIELDS = new Set([
  'explanationZh', 'commonMistakesZh', 'recognition.promptZh', 'recognition.explanationZh',
  'explanation.whyCorrectZh', 'explanation.meaningZh', 'questionZh', 'promptZh',
  'choices[0].whyWrongZh', 'choices[1].whyWrongZh', 'choices[2].whyWrongZh', 'choices[3].whyWrongZh',
]);

/** 日本語の文法用語・活用形（＝正当な学習対象。中国語文中に出てよい） */
const GRAMMAR_TERMS = [
  'た形', 'ます形', 'ない形', 'て形', '辞書形', '普通形', '可能形', '受身形', '使役形', '意向形',
  'い形容詞', 'な形容詞', 'い形', 'な形', '名詞', '動詞', '形容詞', '副詞', '助詞', '自動詞', '他動詞',
  '尊敬語', '謙譲語', '丁寧語', '連体形', '連用形', '仮定形', '命令形', '過去形', '否定形',
];

/** 述語で終わる＝日本語の「地の文」の可能性が高い */
const PREDICATE_END = /(です|ます|だ|である|ない|ません|でした|ました|だった|ください|しょう|かもしれない|らしい|そうだ|ようだ|べきだ|なる|ある|いる|する|できる|使う|表す|言う|多い|強い|弱い|違う|注意)$/;

type ZhType = 'A_TARGET_JAPANESE' | 'B_UNWANTED_JA' | 'C_UNCLEAR';

const classify = (run: string): { type: ZhType; confidence: 'high' | 'medium' | 'low' } => {
  const s = run.trim();
  if (GRAMMAR_TERMS.some((t) => s === t || s.startsWith(t) || s.endsWith(t))) {
    return { type: 'A_TARGET_JAPANESE', confidence: 'high' };
  }
  // 短い断片＝活用形・語の引用
  if (s.length <= 6) return { type: 'A_TARGET_JAPANESE', confidence: 'high' };
  // 長く述語で終わる＝説明そのものが日本語になっている
  if (s.length >= 14 && PREDICATE_END.test(s)) return { type: 'B_UNWANTED_JA', confidence: 'high' };
  if (s.length >= 20) return { type: 'B_UNWANTED_JA', confidence: 'medium' };
  // 例文らしい（助詞を含み中程度の長さ）
  if (s.length <= 13 && /[はがをにでとへも]/.test(s)) return { type: 'A_TARGET_JAPANESE', confidence: 'medium' };
  return { type: 'C_UNCLEAR', confidence: 'low' };
};

/** A の推奨修正: 引用符で囲む */
const quoteFix = (text: string, run: string): string => text.replace(run, `「${run}」`);

const run = async () => {
  const texts = (await collectLearnerVisibleTexts()).filter((t) => t.locale === 'zh');
  const runRe = /[ぁ-ゟァ-ヺㇰ-ㇿ一-鿿ー][ぁ-ゟァ-ヺㇰ-ㇿ一-鿿ー]*/g;

  const entries: Record<string, unknown>[] = [];
  const counts: Record<string, number> = { A_TARGET_JAPANESE: 0, B_UNWANTED_JA: 0, C_UNCLEAR: 0 };
  const activeCounts: Record<string, number> = { A_TARGET_JAPANESE: 0, B_UNWANTED_JA: 0, C_UNCLEAR: 0 };

  for (const t of texts) {
    const plain = stripQuoted(t.text);
    for (const m of plain.match(runRe) ?? []) {
      // 仮名を含まないもの（＝純粋な漢字＝中国語として読める）は対象外
      if (!/[ぁ-ゟァ-ヺ]/.test(m)) continue;
      const { type, confidence } = classify(m);
      const learnerVisible = V2_VISIBLE_ZH_FIELDS.has(t.field);
      counts[type] += 1;
      if (learnerVisible) activeCounts[type] += 1;
      entries.push({
        itemId: t.itemId,
        field: t.field,
        type,
        before: t.text.length > 120 ? `${t.text.slice(0, 120)}…` : t.text,
        after: type === 'A_TARGET_JAPANESE' ? quoteFix(t.text, m).slice(0, 120) : null,
        offending: m,
        action: type === 'A_TARGET_JAPANESE' ? 'QUOTE_AS_TARGET_JAPANESE'
          : type === 'B_UNWANTED_JA' ? 'REWRITE_IN_CHINESE' : 'HOLD_FOR_HUMAN_REVIEW',
        confidence,
        learnerVisible,
        reviewState: type === 'C_UNCLEAR' ? 'humanReviewCandidate' : 'machine_classified',
        origin: t.origin,
        route: t.route,
      });
    }
  }

  const out = {
    generatedAt: new Date().toISOString(),
    totalRuns: entries.length,
    counts,
    activeCounts,
    note: 'A=正当な学習対象（引用符で明示）／B=中国語へ書き直す／C=人間レビュー。全件を人間承認済みにはしない。',
    entries,
  };
  mkdirSync('docs/ai-course/adventure-v2', { recursive: true });
  writeFileSync('docs/ai-course/adventure-v2/zh-explanation-audit.json', JSON.stringify(out, null, 1));
  console.log(`total runs=${entries.length}`, counts);
  console.log('learner-visible (V2 active fields):', activeCounts);
  const bActive = entries.filter((e) => e.type === 'B_UNWANTED_JA' && e.learnerVisible);
  console.log(`\n--- B (learner-visible, ${bActive.length}) top15 ---`);
  for (const e of bActive.slice(0, 15)) console.log(`${e.itemId}\t${e.field}\t${e.offending}`);
};

void run();
