// 語彙ハーベスティング方針の必須検査（HARVESTING POLICY §7・§10）。
//
// FAIL条件（このテストが落ちたらPilotへ出さない）:
// - active JLPTルートに自由入力が1件でもある
// - sourceId / senseId / correctChoiceId 欠損
// - multiple correct / duplicate choice / answer leakage
// - HOLD leakage（hold語・hold問題がactiveへ漏れる）
// - source listの順番をそのままcanonicalとして再現
// - 他ソースの訳・例文・解説のコピー
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { N3_UNIT_SPECS } from '../quality/n3UnitSpecs';
import { buildUnitQuestions } from '../n3unit/unitRuntime';
import { allVocabularyItems } from '../foundationVocabBank';
import { ALL_READING_SETS } from './reading/readingBank';
import { ALL_LISTENING_SETS } from './listening/listeningBank';
import { ACTIVE_EXAM_FORMATS, FORBIDDEN_EXAM_FORMATS } from './vocab/vocabTypes';
import type { CanonicalVocabWord } from './vocab/vocabTypes';

const GEN = 'docs/ai-course/adventure-v2/generated';
const loadBank = (): { words: CanonicalVocabWord[] } | null => {
  const p = `${GEN}/vocab-canonical.json`;
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
};
const loadCandidates = () => {
  const p = `${GEN}/vocab-candidates.json`;
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
};

describe('§7 JLPT試験ルートは選択式のみ', () => {
  it('許可形式と禁止形式が重ならない', () => {
    for (const f of FORBIDDEN_EXAM_FORMATS) {
      expect(ACTIVE_EXAM_FORMATS).not.toContain(f as never);
    }
    expect(ACTIVE_EXAM_FORMATS.every((f) => f.toLowerCase().includes('choice'))).toBe(true);
  });

  it('**active JLPT出題に自由入力が0件**（N3単元・読解・聴解の全問）', () => {
    const vocab = allVocabularyItems();
    const nonChoice: string[] = [];
    for (const spec of N3_UNIT_SPECS) {
      const set = buildUnitQuestions(spec, vocab);
      for (const q of [...set.diagnostic, ...set.byStage.understand, ...set.byStage.distinguish, ...set.byStage.apply]) {
        // kind は 'choice' | 'order'。order は orderedChoice（トークン選択）で許可形式
        if (q.kind !== 'choice' && q.kind !== 'order') nonChoice.push(q.questionId);
        // 自由入力なら choices が空になるはず
        if (!Array.isArray(q.choices) || q.choices.length < 2) nonChoice.push(`${q.questionId}:no-choices`);
      }
    }
    for (const r of ALL_READING_SETS) if (r.choices.length < 3) nonChoice.push(r.setId);
    for (const l of ALL_LISTENING_SETS) if (l.choices.length < 3) nonChoice.push(l.setId);
    expect(nonChoice).toEqual([]);
  });

  it('読解・聴解は選択肢を持ち、正解choiceIdが一意に決まる', () => {
    for (const r of ALL_READING_SETS) {
      expect(r.choices.filter((c) => c.isCorrect)).toHaveLength(1);
      expect(r.choices.every((c) => !!c.choiceId)).toBe(true);
    }
    for (const l of ALL_LISTENING_SETS) {
      expect(l.choices.filter((c) => c.isCorrect)).toHaveLength(1);
      expect(l.choices.every((c) => !!c.choiceId)).toBe(true);
    }
  });
});

describe('§10 語彙bankの必須検査', () => {
  const bank = loadBank();

  it('canonical bankが生成されている', () => {
    expect(bank).not.toBeNull();
    expect(bank!.words.length).toBeGreaterThan(1000);
  });

  it('sourceId欠損 0・sourceEvidence必須', () => {
    for (const w of bank!.words) {
      expect(w.sourceEvidence.length, w.wordId).toBeGreaterThan(0);
      for (const e of w.sourceEvidence) expect(e.sourceId, w.wordId).toBeTruthy();
    }
  });

  it('senseId欠損 0（senseを持つ語はすべてIDつき）', () => {
    for (const w of bank!.words) {
      for (const s of w.senses) expect(s.senseId, w.wordId).toBeTruthy();
    }
  });

  it('**sourceSuggestedLevelをそのままcanonicalにしていない**（独自判定が効いている）', () => {
    // sourceの主張と独自判定が一致しない語が一定数あること＝再判定が実際に働いている証拠
    const withSource = bank!.words.filter((w) => w.sourceEvidence.some((e) => e.suggestedLevel));
    const differ = withSource.filter((w) => {
      const s = w.sourceEvidence.map((e) => e.suggestedLevel).filter(Boolean);
      return s.length > 0 && !s.includes(w.independentlyAssignedLevel);
    });
    expect(withSource.length).toBeGreaterThan(1000);
    expect(differ.length, '独自判定が1件も効いていない').toBeGreaterThan(0);
  });

  it('**元リストの順番をcanonicalへ引き継いでいない**（読み順で並ぶ）', () => {
    const readings = bank!.words.map((w) => w.reading);
    const sorted = [...readings].sort((a, b) => a.localeCompare(b, 'ja'));
    expect(readings).toEqual(sorted);
  });

  it('cumulativeLevelが累積になっている（N3learnerはN5+N4+N3が必要・§4）', () => {
    for (const w of bank!.words) {
      expect(w.cumulativeLevel).toContain(w.independentlyAssignedLevel);
      expect(w.cumulativeLevel.length).toBeGreaterThan(0);
    }
  });

  it('**HOLD leakage 0**（hold語はactive扱いにならない）', () => {
    const holds = bank!.words.filter((w) => w.priority === 'hold');
    expect(holds.length).toBeGreaterThan(0); // 検証できない語は必ず存在する（正直な状態）
    for (const w of holds) {
      expect(w.reviewState, w.wordId).toBe('hold');
      // holdの語に学習コンテンツを付けない
      expect(w.senses.every((s) => !s.hasOriginalContent), w.wordId).toBe(true);
    }
  });

  it('sourceFamilyCountが同一原典の派生を1として数える（§2）', () => {
    for (const w of bank!.words) {
      const families = new Set(w.sourceEvidence.map((e) => e.sourceFamily));
      expect(w.sourceFamilyCount).toBe(families.size);
      // 同一familyの複数sourceIdがあっても family は1
      expect(w.sourceFamilyCount).toBeLessThanOrEqual(w.sourceEvidence.length);
    }
  });

  it('levelConflictが保持される（§5）', () => {
    const conflicts = bank!.words.filter((w) => w.levelConflict !== null);
    for (const w of conflicts) {
      expect(w.levelConflict!.sources.length).toBeGreaterThan(0);
    }
  });
});

describe('§1/§3 他ソースの訳・例文を取り込んでいない', () => {
  const cand = loadCandidates();

  it('候補層は surface / reading / level / 出典 のみを持つ', () => {
    expect(cand).not.toBeNull();
    const allowed = new Set([
      'surface', 'reading', 'sourceSuggestedLevel', 'sourceId', 'sourceFamily', 'sourcePosition', 'retrievedAt',
    ]);
    for (const c of cand.candidates.slice(0, 500)) {
      for (const k of Object.keys(c)) expect(allowed.has(k), `unexpected field: ${k}`).toBe(true);
    }
    // 訳・例文・解説のフィールドが存在しない
    const blob = JSON.stringify(cand.candidates.slice(0, 2000));
    for (const forbidden of ['meaning', 'gloss', 'translation', 'example', 'sentence', 'definition']) {
      expect(blob.includes(`"${forbidden}"`), forbidden).toBe(false);
    }
  });

  it('独立ソースの候補も surface / reading / 出典 のみで、レベル主張を持ち込まない（§2）', () => {
    const p = `${GEN}/vocab-candidates-independent.json`;
    if (!existsSync(p)) return;                    // 独立ソース未取得の環境ではスキップ
    const indep = JSON.parse(readFileSync(p, 'utf8'));
    const allowed = new Set([
      'surface', 'reading', 'sourceSuggestedLevel', 'sourceId', 'sourceFamily', 'sourcePosition', 'retrievedAt',
    ]);
    for (const c of indep.candidates.slice(0, 500)) {
      for (const k of Object.keys(c)) expect(allowed.has(k), `unexpected field: ${k}`).toBe(true);
      // 独立ソースは頻度リストであってJLPTレベルの権威ではない
      expect(c.sourceSuggestedLevel).toBeNull();
    }
    const blob = JSON.stringify(indep.candidates.slice(0, 2000));
    for (const forbidden of ['meaning', 'gloss', 'translation', 'example', 'sentence', 'definition']) {
      expect(blob.includes(`"${forbidden}"`), forbidden).toBe(false);
    }
  });

  it('reference_only のソースは canonical bank に取り込まれていない（§2）', () => {
    const p = `${GEN}/vocab-independent-sources.json`;
    if (!existsSync(p)) return;
    const { sources } = JSON.parse(readFileSync(p, 'utf8'));
    const refOnly = sources.filter((s: { license: string }) => s.license === 'reference_only');
    expect(refOnly.length).toBeGreaterThan(0);     // JEVはreference_onlyとして記録されている
    const bank = loadBank()!;
    const refFamilies = new Set(refOnly.map((s: { sourceFamily: string }) => s.sourceFamily));
    for (const w of bank.words) {
      for (const e of w.sourceEvidence) {
        expect(refFamilies.has(e.sourceFamily), `${w.wordId} が reference_only ソース由来`).toBe(false);
      }
    }
    // reference_only は「取らなかったfield」を明記し、取得もしていない
    for (const s of refOnly) {
      expect(s.available).toBe(false);
      expect(s.fieldsTaken).toEqual([]);
      expect(s.fieldsDeliberatelyNotTaken.length).toBeGreaterThan(0);
    }
  });

  it('取得できなかったソースを「取得できた」と書いていない（§2）', () => {
    const p = `${GEN}/vocab-independent-sources.json`;
    if (!existsSync(p)) return;
    const { sources } = JSON.parse(readFileSync(p, 'utf8'));
    for (const s of sources) {
      if (s.available === false) {
        expect(typeof s.reason, s.sourceId).toBe('string');
        expect(s.sha256, s.sourceId).toBeUndefined();
      } else {
        // 取得できたと書くならバイト列のハッシュか件数の裏づけがある
        expect(s.sha256 ?? s.japaneseTokens, s.sourceId).toBeDefined();
      }
    }
  });

  it('飽和は「公式100%網羅」と言い換えられていない（§3）', () => {
    const p = `${GEN}/vocab-saturation-report.json`;
    if (!existsSync(p)) return;
    const r = JSON.parse(readFileSync(p, 'utf8'));
    const blob = JSON.stringify(r);
    expect(blob).not.toContain('100%網羅');
    expect(blob).not.toContain('公式出題基準を完全に');
    // 判定はスコープつきで、暫定であることを明記している
    expect(r.verdict.provisional).toBe(true);
    expect(typeof r.verdict.provisionalReason).toBe('string');
    expect(r.examScopeFilter.maxFrequencyRank).toBeGreaterThan(0);
  });

  it('各sourceが「取ったfield」「あえて取らなかったfield」を記録している', () => {
    for (const s of cand.sources) {
      expect(s.fieldsTaken.length).toBeGreaterThan(0);
      expect(s.fieldsDeliberatelyNotTaken.length).toBeGreaterThan(0);
      expect(['permissive', 'attribution_share', 'unknown_public', 'reference_only']).toContain(s.license);
    }
  });

  it('canonical bankに他ソースの訳文が入っていない', () => {
    const bank = loadBank()!;
    // 値だけを集める（キー名は検査対象外）
    const values: string[] = [];
    const walk = (v: unknown) => {
      if (typeof v === 'string') values.push(v);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    walk(bank.words.slice(0, 3000));
    // 許可: wordId/senseId/sourceId/sourceFamily/品詞タグ/レベル記号
    const allowed = (t: string) =>
      /^kv-\d+$/.test(t)
      || /^[^|]*-[ぁ-ゟァ-ヺ一-鿿]*-s\d+$/.test(t)
      || /^(openanki-jlpt-n[1-5]|kawabado-vocab-140|jmdict-eng-common|kanjidic2-en)$/.test(t)
      || /^(opensubtitles-ja-50k|jmdict-eng-common-inventory|ninjal-bccwj-suw|jev-vocabulary-table)$/.test(t)
      || /^(tanos-waller|jmdict|kanjidic2|kawabado-internal|opensubtitles-opus|ninjal-bccwj|jev)$/.test(t)
      || /^N[1-5]$/.test(t)
      || /^(core|likely|extended|hold|high|medium|low|very_common|common|uncommon|unknown|candidate|canonical_draft|active_beta|human_review_candidate)$/.test(t)
      || /^[a-z0-9-]{1,12}$/.test(t); // JMdict品詞タグ（n, v5k, adj-i 等）
    const suspicious = values.filter((t) => /[A-Za-z]{4,}[ ,'-][A-Za-z]{3,}/.test(t) && !allowed(t));
    expect(suspicious.slice(0, 5)).toEqual([]);
  });
});
