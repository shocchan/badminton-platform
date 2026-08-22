// 層Cコンテンツと語彙問題の受入テスト（EXAM COVERAGE CLOSURE §5・§6）。
//
// FAIL条件（落ちたらPilotへ出さない）:
// - レビュー未了の語が出題される
// - 自由入力の語彙問題が混ざる
// - 正解が2つ以上／選択肢が重複する
// - 日本語コンテンツに第三言語が混入する
// - 中国語訳にかなが残る
import { describe, it, expect, beforeAll } from 'vitest';
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
  /**
   * 全語ぶんの生成は重い（2,000語×約5問）。テストごとに作り直すと
   * vitest の worker RPC がタイムアウトして偽の unhandled error が出るので、1回だけ作って共有する。
   */
  //
  // さらに、2,000語を一気に回すとイベントループを長時間ふさぎ、vitest の worker が
  // onTaskUpdate を返せず「unhandled error」で全体が失敗扱いになる。
  // 100語ごとに一度制御を返して、レポーターが動けるようにする。
  let allCache: { c: typeof active[number]; qs: ReturnType<typeof buildVocabQuestions> }[] | null = null;
  const allQuestions = async () => {
    if (allCache) return allCache;
    const out: { c: typeof active[number]; qs: ReturnType<typeof buildVocabQuestions> }[] = [];
    for (let i = 0; i < active.length; i += 1) {
      out.push({ c: active[i], qs: buildVocabQuestions(active[i], active, 20260801) });
      if (i % 100 === 99) await new Promise((r) => { setTimeout(r, 0); });
    }
    allCache = out;
    return out;
  };
  /**
   * 生成は beforeAll でまとめて済ませる（2026-08-22）。
   * 各 it の中で初回だけ作っていたため、**最初の1本だけが 30 秒の制限に張り付き**、
   * 並列実行の負荷で時々タイムアウトしていた（中身の失敗ではない）。
   * 重い作業はフックへ寄せ、フックには十分な時間を渡す。
   */
  beforeAll(async () => { await allQuestions(); }, 180_000);

  it('**レビュー未了の語からは問題を作らない**', () => {
    const flagged = ALL_VOCAB_CONTENT.filter((c) => c.state !== 'active_beta');
    for (const c of flagged) {
      expect(buildVocabQuestions(c, active, 1), c.surface).toEqual([]);
    }
  }, 30_000);

  it('**active_beta の全語に有効な選択問題が2問以上ある**（要件C）', async () => {
    // 2問未満しか作れない語は「無理に水増しせず CORE から外す」のが方針。
    // ここを通らない語が残っていたら、内容を足すか excluded_from_core へ移す。
    const under = (await allQuestions())
      .map(({ c, qs }) => ({ id: `${c.surface}|${c.reading}`, n: qs.length }))
      .filter((x) => x.n < 2);
    expect(under.map((x) => `${x.id}:${x.n}`)).toEqual([]);
  }, 30_000);

  it('CORE の大半が4形式以上（水増しはしないが、薄すぎもしない）', async () => {
    const counts = (await allQuestions()).map(({ qs }) => qs.length);
    const fourPlus = counts.filter((n) => n >= 4).length;
    // かな語は読み・表記の観点が構造上作れないため100%にはならない。7割を下限にする
    expect(fourPlus / counts.length).toBeGreaterThan(0.7);
  }, 30_000);

  it('**画面に答えが見えない**（見出し・設問文に正解の選択肢が含まれない・2026-08-16 CEO報告）', async () => {
    // ミニ模試の表記問題で、見出し語に正解の漢字がそのまま出ていた（「今にも」）。
    // 用法問題も、正解の連語だけに見出し語が残り文字探しで当たる状態だった。
    // 実データ全問題で「学習者に見える文字列」に正解テキストが含まれないことを固定する
    // 1文字の正解（読み「は」「か」等）は除外する: 「読み方はどれですか」のような定型文に
    // 単独かなは必然的に含まれるが、毎問同じ定型文なので手がかりにならない（搾取不能）
    const leaks: string[] = [];
    for (const { qs } of await allQuestions()) {
      for (const q of qs) {
        const stem = `${q.targetJapanese ?? ''}\n${q.questionJa ?? ''}`;
        const correct = q.choices.find((x) => x.isCorrect)!;
        if ([...correct.textJa].length >= 2 && stem.includes(correct.textJa)) {
          leaks.push(`${q.key} → ${correct.textJa}`);
        }
      }
    }
    expect(leaks).toEqual([]);
  }, 30_000);

  it('**用法問題は選択肢の形式を混ぜない**（正解だけ見出し語入りだと文字探しで当たる）', async () => {
    // 空欄形（＿＿を守る）と従来形（やってみる・活用語の救済）の2形式があるが、
    // 1問の中で混ざると「形が違う選択肢＝正解」という手がかりになるため、全か無を固定する
    for (const { qs } of await allQuestions()) {
      for (const q of qs.filter((x) => x.type === 'vocab-usage')) {
        const withBlank = q.choices.filter((ch) => ch.textJa.includes('＿＿')).length;
        expect(withBlank === 0 || withBlank === q.choices.length, `${q.key} 形式が混在`).toBe(true);
      }
    }
  }, 30_000);

  it('**複数正解を作らない**（同じ意味の語を誤答に入れない・Pilot監査P0）', async () => {
    // 訳の完全一致だけを見ていたため「学习」と「学习（有计划地学）」が別物になり、
    // 意味問題に正解が2つ入っていた。実データ全件で0件であることを固定する。
    const bySurface = new Map(active.map((c) => [c.surface, c]));
    const dup: string[] = [];
    for (const { qs } of await allQuestions()) {
      for (const q of qs) {
        const correct = q.choices.find((x) => x.isCorrect)!;
        for (const other of q.choices.filter((x) => !x.isCorrect)) {
          const a = bySurface.get(correct.textJa); const b = bySurface.get(other.textJa);
          if (a && b && a.glossZh === b.glossZh) dup.push(`${q.key} ${correct.textJa}/${other.textJa}`);
        }
      }
    }
    expect(dup).toEqual([]);
  }, 60_000);

  it('**設問に正解が露出しない**（日中同形語で中国語の設問が答えを見せない・Pilot監査P1）', async () => {
    const leaked: string[] = [];
    for (const { qs } of await allQuestions()) {
      for (const q of qs) {
        const correct = q.choices.find((x) => x.isCorrect)!;
        if (correct.textJa.length >= 2 && q.questionZh.includes(correct.textJa)) {
          leaked.push(`${q.key} :: ${q.questionZh}`);
        }
      }
    }
    expect(leaked).toEqual([]);
  }, 60_000);

  it('**読みの誤答は実在する語の読みだけ**（非語を並べて消去法で当てさせない・Pilot監査P1）', async () => {
    const realReadings = new Set(active.map((c) => c.reading));
    const fake: string[] = [];
    for (const { qs } of await allQuestions()) {
      for (const q of qs) {
        if (q.type !== 'vocab-reading') continue;
        for (const ch of q.choices.filter((x) => !x.isCorrect)) {
          if (!realReadings.has(ch.textJa)) fake.push(`${q.key}:${ch.textJa}`);
        }
      }
    }
    expect(fake).toEqual([]);
  }, 60_000);

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
    // 30秒→60秒: N2バッチ増補（+880語）で vocabPool('N2') の初回構築が重くなり、
    // 全suite並列実行時にworkerが30秒を超えることがある（単体実行では5秒台）
  }, 60_000);

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
