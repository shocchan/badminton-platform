// 層Cコンテンツと語彙問題の受入テスト（EXAM COVERAGE CLOSURE §5・§6）。
//
// FAIL条件（落ちたらPilotへ出さない）:
// - レビュー未了の語が出題される
// - 自由入力の語彙問題が混ざる
// - 正解が2つ以上／選択肢が重複する
// - 日本語コンテンツに第三言語が混入する
// - 中国語訳にかなが残る
import { describe, it, expect } from 'vitest';
import { ALL_VOCAB_CONTENT } from './content/vocabContentBank';
import { activeContent, VOCAB_ASPECTS, summarizeBatch, toSenseRecord } from './vocabContent';
import { buildVocabQuestions, vocabPool, vocabQuestionCoverage } from './vocabQuestions';

const FOREIGN = /[\p{Script=Cyrillic}\p{Script=Hangul}\p{Script=Arabic}\p{Script=Thai}\p{Script=Devanagari}\p{Script=Hebrew}\p{Script=Greek}]/u;
const KANA = /[぀-ゟ゠-ヺ]/;

describe('§5 層Cコンテンツ', () => {
  it('バッチ1が存在し、全語に訳・例文がある', () => {
    const b1 = ALL_VOCAB_CONTENT.filter((c) => c.batchNo === 1);
    expect(b1.length).toBeGreaterThanOrEqual(200);
    for (const c of b1) {
      expect(c.glossZh.trim(), c.surface).not.toBe('');
      expect(c.exampleJa.trim(), c.surface).not.toBe('');
      expect(c.exampleZh.trim(), c.surface).not.toBe('');
    }
  });

  it('surface|reading が重複しない', () => {
    const keys = ALL_VOCAB_CONTENT.map((c) => `${c.surface}|${c.reading}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('**日本語例文に第三言語・ラテン文字が混ざらない**', () => {
    for (const c of ALL_VOCAB_CONTENT) {
      expect(FOREIGN.test(c.exampleJa), `${c.surface}: ${c.exampleJa}`).toBe(false);
      expect(/[A-Za-z]{3,}/.test(c.exampleJa), `${c.surface}: ${c.exampleJa}`).toBe(false);
    }
  });

  it('**中国語訳にかなが残らない**（訳が日本語のままになっていない）', () => {
    for (const c of ALL_VOCAB_CONTENT) {
      expect(KANA.test(c.glossZh), `${c.surface}: ${c.glossZh}`).toBe(false);
    }
  });

  it('日本語例文に見出し語（表記または読み）が現れる', () => {
    for (const c of ALL_VOCAB_CONTENT) {
      const stem = c.surface.replace(/[うくぐすつぬぶむるいだ]$/, '');
      const readingStem = c.reading.replace(/[うくぐすつぬぶむるいだ]$/, '');
      const ok = c.exampleJa.includes(c.surface)
        || (stem.length >= 1 && c.exampleJa.includes(stem))
        || c.exampleJa.includes(c.reading)
        || (readingStem.length >= 2 && c.exampleJa.includes(readingStem));
      expect(ok, `${c.surface}: ${c.exampleJa}`).toBe(true);
    }
  });

  it('自分自身を「紛らわしい語」にしない', () => {
    for (const c of ALL_VOCAB_CONTENT) {
      expect(c.confusableSurfaces.includes(c.surface), c.surface).toBe(false);
    }
  });

  it('**CORE から外した語は active_beta になっていない**（§6の昇格ルール）', () => {
    const excluded = ALL_VOCAB_CONTENT.filter((c) => c.state === 'excluded_from_core');
    expect(excluded.length).toBeGreaterThan(0);   // 全部OKと言い切らない（正直な状態）
    for (const c of excluded) {
      // 外した理由を型と文章の両方で残す
      expect(c.exclusionReason, c.surface).toBeTruthy();
      expect(c.reviewNotes.length, c.surface).toBeGreaterThan(0);
      expect(activeContent(ALL_VOCAB_CONTENT).some((a) => a.surface === c.surface && a.reading === c.reading)).toBe(false);
    }
  });

  it('**保留のまま放置された語が無い**（最終状態は active_beta か excluded_from_core の2つだけ）', () => {
    const stray = ALL_VOCAB_CONTENT.filter(
      (c) => c.state !== 'active_beta' && c.state !== 'excluded_from_core',
    );
    expect(stray.map((c) => `${c.surface}|${c.reading}:${c.state}`)).toEqual([]);
    // 移行期の中間状態が残っていないこと
    expect(ALL_VOCAB_CONTENT.filter((c) => c.state === 'needs_human_review')).toEqual([]);
  });

  it('**active_beta の語は必須10項目が揃っている**（要件B）', () => {
    const missing = activeContent(ALL_VOCAB_CONTENT)
      .filter((c) => toSenseRecord(c) === null)
      .map((c) => `${c.surface}|${c.reading}`);
    expect(missing).toEqual([]);
  });

  it('バッチ状態の集計が取れる（pending 0）', () => {
    for (const batchNo of [...new Set(ALL_VOCAB_CONTENT.map((c) => c.batchNo))]) {
      const s = summarizeBatch(batchNo, ALL_VOCAB_CONTENT, false);
      expect(s.words, `batch${batchNo}`).toBeGreaterThan(0);
      expect(s.pending, `batch${batchNo}: 未処理が残っている`).toBe(0);
      expect(s.activeBeta + s.excludedFromCore, `batch${batchNo}`).toBe(s.words);
      expect(s.needsHumanReview, `batch${batchNo}`).toBe(0);
    }
  });
});

describe('§6 語彙問題（選択式のみ）', () => {
  const active = activeContent(ALL_VOCAB_CONTENT);

  it('**レビュー未了の語からは問題を作らない**', () => {
    const flagged = ALL_VOCAB_CONTENT.filter((c) => c.state !== 'active_beta');
    for (const c of flagged) {
      expect(buildVocabQuestions(c, active, 1), c.surface).toEqual([]);
    }
  }, 30_000);

  it('**active_beta の全語に有効な選択問題が2問以上ある**（要件C）', () => {
    // 2問未満しか作れない語は「無理に水増しせず CORE から外す」のが方針。
    // ここを通らない語が残っていたら、内容を足すか excluded_from_core へ移す。
    const under = active
      .map((c) => ({ id: `${c.surface}|${c.reading}`, n: buildVocabQuestions(c, active, 20260801).length }))
      .filter((x) => x.n < 2);
    expect(under.map((x) => `${x.id}:${x.n}`)).toEqual([]);
  }, 30_000);

  it('CORE の大半が4形式以上（水増しはしないが、薄すぎもしない）', () => {
    const counts = active.map((c) => buildVocabQuestions(c, active, 20260801).length);
    const fourPlus = counts.filter((n) => n >= 4).length;
    // かな語は読み・表記の観点が構造上作れないため100%にはならない。7割を下限にする
    expect(fourPlus / counts.length).toBeGreaterThan(0.7);
  }, 30_000);

  it('全問が選択式で、正解choiceIdが一意', () => {
    const pool = vocabPool('N2');
    let total = 0;
    for (const qs of pool.values()) {
      for (const q of qs) {
        total += 1;
        expect(q.choices.length, q.key).toBeGreaterThanOrEqual(3);
        expect(q.choices.filter((c) => c.isCorrect).length, q.key).toBe(1);
        const ids = q.choices.map((c) => c.choiceId);
        expect(new Set(ids).size, q.key).toBe(ids.length);
        const texts = q.choices.map((c) => c.textJa);
        expect(new Set(texts).size, `${q.key} に重複選択肢`).toBe(texts.length);
      }
    }
    expect(total).toBeGreaterThan(300);
  }, 30_000);

  it('観点は定義済みのものだけ', () => {
    const pool = vocabPool('N2');
    for (const qs of pool.values()) {
      for (const q of qs) {
        const aspect = q.type.replace('vocab-', '');
        expect(VOCAB_ASPECTS as string[]).toContain(aspect);
      }
    }
  }, 30_000);

  it('**同じseedなら同じ問題**（決定的生成）', () => {
    const a = vocabPool('N3', 123);
    const b = vocabPool('N3', 123);
    const flat = (m: Map<string, { key: string; choices: { choiceId: string }[] }[]>) =>
      [...m.values()].flat().map((q) => `${q.key}:${q.choices.map((c) => c.choiceId).join(',')}`);
    expect(flat(a)).toEqual(flat(b));
  }, 30_000);

  it('全問が試験科目「文字・語彙」に紐づく', () => {
    for (const qs of vocabPool('N2').values()) {
      for (const q of qs) {
        expect(q.skill).toBe('charactersVocabulary');
        expect(q.examSection).toBe('languageKnowledge');
      }
    }
  }, 30_000);

  it('カバレッジが取れ、観点不足の語を隠さない', () => {
    const cov = vocabQuestionCoverage('N3');
    expect(cov.activeWords).toBeGreaterThan(200);
    expect(cov.wordsWithQuestions).toBe(cov.activeWords);
    expect(cov.questions).toBeGreaterThan(300);
    // かな語は読み・表記の観点が作れないため4観点に届かない。隠さず数える
    expect(Array.isArray(cov.belowAspectTarget)).toBe(true);
  }, 30_000);
});
