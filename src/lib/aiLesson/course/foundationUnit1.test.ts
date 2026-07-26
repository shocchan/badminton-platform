import { describe, it, expect } from 'vitest';
import { UNIT1, UNIT1_ITEMS, UNIT1_QUESTIONS, UNIT1_RULES } from './foundationUnit1';
import { judgeQuestion, normalizeKanaAnswer, aggregateByDimension, deriveReviewCandidates, shuffledOrder, shuffledChoices, validateExactLexemeRef, type AuditedCell } from './foundationGrade';

describe('しくみラボ 単元データ整合性（Phase 2A レビュー前修正版）', () => {
  it('ID重複なし・単元参照が実在・source追跡あり（複数sources対応）', () => {
    const iid = UNIT1_ITEMS.map((i) => i.id); const qid = UNIT1_QUESTIONS.map((q) => q.id);
    expect(new Set(iid).size).toBe(iid.length);
    expect(new Set(qid).size).toBe(qid.length);
    UNIT1.itemIds.forEach((id) => expect(iid).toContain(id));
    UNIT1_ITEMS.forEach((i) => { expect(i.sources.length).toBeGreaterThan(0); expect(i.readingKana).toBeTruthy(); expect(i.meaningZh).toBeTruthy(); });
    // 出身は複数sourceRefs（Excel＋教科書範囲）を持つ
    const shusshin = UNIT1_ITEMS.find((i) => i.id === 'fi-shusshin')!;
    expect(shusshin.sources.length).toBeGreaterThanOrEqual(2);
  });
  it('全sourceRefがsourceMatchType/sourceLabelを持つ（null黙残し禁止）', () => {
    UNIT1_ITEMS.flatMap((i) => i.sources).forEach((s) => {
      expect(['exact_lexeme', 'inflected_form', 'example_contains', 'related_expression', 'external_scope']).toContain(s.sourceMatchType);
      expect(s.sourceLabel.length).toBeGreaterThan(0);
      if (s.sourceMatchType === 'external_scope') { expect(s.sourceSheet).toBeNull(); expect(s.cellRange ?? null).toBeNull(); }
      else { expect(s.sourceSheet).toBeTruthy(); expect(s.cellRange).toBeTruthy(); }
    });
  });
  it('語彙は8〜12語・出身/会社員を含む・好き/仕事は含まない（移動/除外）', () => {
    expect(UNIT1_ITEMS.length).toBeGreaterThanOrEqual(8);
    expect(UNIT1_ITEMS.length).toBeLessThanOrEqual(12);
    const lemmas = UNIT1_ITEMS.map((i) => i.lemma);
    ['名前', '出身', '中国', '日本', '学生', '会社員', '会社', '日本語', '住む', '働く', '勉強する'].forEach((l) => expect(lemmas).toContain(l));
    expect(lemmas).not.toContain('好き');
    expect(lemmas).not.toContain('仕事');
  });
  it('〜ています重要チャンク: 動詞3語の例文がすべてています形・ルールにています説明あり', () => {
    ['fi-sumu', 'fi-hataraku', 'fi-benkyo'].forEach((id) => {
      const item = UNIT1_ITEMS.find((i) => i.id === id)!;
      expect(item.exampleJa).toMatch(/て?います。$/);
    });
    const teimasu = UNIT1_RULES.find((r) => r.id === 'fr-teimasu')!;
    expect(teimasu.explanationJa).toContain('住んでいます');
    expect(teimasu.explanationJa).toContain('住みます'); // 予定に聞こえる注意
  });
  it('全教材がdraft（自動approved禁止）・軸別問題数（読3意3形接3使2）', () => {
    [...UNIT1_ITEMS, ...UNIT1_RULES, ...UNIT1_QUESTIONS, UNIT1].forEach((x) => expect(x.review).toBe('draft'));
    const d = (k: string) => UNIT1_QUESTIONS.filter((q) => q.dimension === k).length;
    expect(d('reading')).toBe(3); expect(d('meaning')).toBe(3);
    expect(d('form') + d('connection')).toBe(3); expect(d('usage')).toBe(2);
  });
});

describe('出典監査（CEO確認済みfixture・Excel実ファイル非依存）', () => {
  const MIN = '最初に覚える最低限表現';
  // 2026-07-26 人間確認済み監査結果（原資料照合）
  const AUDIT: AuditedCell[] = [
    { sheet: MIN, cellRange: 'C3', value: '日本語', isHeader: true }, // 列見出し行
    { sheet: MIN, cellRange: 'C200', value: '勉強する' },
    { sheet: MIN, cellRange: 'C201', value: '働く' },
    { sheet: MIN, cellRange: 'C208', value: '住む' },
    { sheet: MIN, cellRange: 'C72', value: '会社' },
    { sheet: '動詞活用形', cellRange: 'B62', value: '勉強する' },
    { sheet: '動詞活用形', cellRange: 'B63', value: '働く' },
    { sheet: '動詞活用形', cellRange: 'B70', value: '住む' },
    { sheet: '動詞活用形', cellRange: 'C136', value: '勉強する（学习）' },
    { sheet: '動詞活用形', cellRange: 'C137', value: '働く（工作）' },
    { sheet: '動詞活用形', cellRange: 'C144', value: '住む（居住）' },
    { sheet: '動詞活用形', cellRange: 'C188', value: '勉強する' },
    { sheet: '動詞活用形', cellRange: 'C189', value: '働く' },
    { sheet: '動詞活用形', cellRange: 'C196', value: '住む' },
  ];
  const srcOf = (id: string) => UNIT1_ITEMS.find((i) => i.id === id)!.sources;
  it('列見出しセル（C3）はexact_lexemeとして検証を通らない', () => {
    const bad = { sourceKind: 'teacher_workbook', sourceSheet: MIN, sourceRow: 3, cellRange: 'C3', sourceMatchType: 'exact_lexeme', sourceLabel: 'x' } as const;
    expect(validateExactLexemeRef('日本語', bad, AUDIT)).toBe(false);
  });
  it('全教材のexact_lexeme出典は監査済みセルに対象語が直接存在する', () => {
    UNIT1_ITEMS.forEach((i) => i.sources.filter((s) => s.sourceMatchType === 'exact_lexeme')
      .forEach((s) => expect(validateExactLexemeRef(i.lemma, s, AUDIT)).toBe(true)));
  });
  it('勉強する=C200・働く=C201・住む=C208 が主要出典（＋動詞活用形の追加参照）', () => {
    expect(srcOf('fi-benkyo')[0]).toMatchObject({ sourceSheet: MIN, cellRange: 'C200', sourceMatchType: 'exact_lexeme' });
    expect(srcOf('fi-hataraku')[0]).toMatchObject({ sourceSheet: MIN, cellRange: 'C201', sourceMatchType: 'exact_lexeme' });
    expect(srcOf('fi-sumu')[0]).toMatchObject({ sourceSheet: MIN, cellRange: 'C208', sourceMatchType: 'exact_lexeme' });
    ['fi-benkyo', 'fi-hataraku', 'fi-sumu'].forEach((id) => {
      expect(srcOf(id).filter((s) => s.sourceSheet === '動詞活用形').length).toBeGreaterThanOrEqual(3);
      expect(srcOf(id).length).toBe(4); // 複数sourceRef維持
    });
  });
  it('中国・会社員はexternal_scope（Excelに存在するように見せない）', () => {
    expect(srcOf('fi-chugoku').every((s) => s.sourceMatchType === 'external_scope')).toBe(true);
    expect(srcOf('fi-kaishain').every((s) => s.sourceMatchType === 'external_scope')).toBe(true);
  });
  it('日本語: 列見出しC3を出典にせずexternal_scope主＋例文はexample_contains明記', () => {
    const refs = srcOf('fi-nihongo');
    expect(refs.some((s) => s.cellRange === 'C3')).toBe(false);
    expect(refs[0].sourceMatchType).toBe('external_scope');
    expect(refs.find((s) => s.cellRange === 'F44')?.sourceMatchType).toBe('example_contains');
  });
  it('名前・出身=related_expression／学生=example_contains（F326）／日本=external_scope主', () => {
    expect(srcOf('fi-namae')[0].sourceMatchType).toBe('related_expression');
    expect(srcOf('fi-shusshin')[0].sourceMatchType).toBe('related_expression');
    expect(srcOf('fi-gakusei')[0]).toMatchObject({ cellRange: 'F326', sourceMatchType: 'example_contains' });
    expect(srcOf('fi-nihon')[0].sourceMatchType).toBe('external_scope');
  });
});

describe('choice表示シャッフル（決定的・安定ID判定）', () => {
  const choiceQs = UNIT1_QUESTIONS.filter((q) => q.type === 'choice');
  it('2〜4択に対応・同じ問題は毎回同じ表示順（決定的）', () => {
    choiceQs.forEach((q) => {
      expect(q.choices!.length).toBeGreaterThanOrEqual(2);
      expect(q.choices!.length).toBeLessThanOrEqual(4);
      expect(shuffledChoices(q)).toEqual(shuffledChoices(q));
      expect([...shuffledChoices(q)].sort()).toEqual(q.choices!.map((_, i) => i).sort());
    });
  });
  it('正解が表示上つねに先頭にはならない', () => {
    choiceQs.forEach((q) => expect(shuffledChoices(q)[0]).not.toBe(q.answerIndex));
  });
  it('判定は表示位置ではなく元index（安定choice ID）で行う', () => {
    const q = UNIT1_QUESTIONS.find((x) => x.id === 'fq-f2')!;
    const order = shuffledChoices(q);
    const displayPosOfAnswer = order.indexOf(q.answerIndex!);
    expect(displayPosOfAnswer).toBeGreaterThan(0); // 表示上は先頭でない
    expect(judgeQuestion(q, { choiceIndex: q.answerIndex! })).toBe(true); // IDで正解
    expect(judgeQuestion(q, { choiceIndex: order[displayPosOfAnswer === 0 ? 1 : 0] })).toBe(false);
  });
});

describe('決定的採点', () => {
  const input = UNIT1_QUESTIONS.find((q) => q.id === 'fq-r3')!;
  const order = UNIT1_QUESTIONS.find((q) => q.id === 'fq-u1')!;
  it('かな正規化: カタカナ・全角空白を許容', () => {
    expect(normalizeKanaAnswer(' スム ')).toBe('すむ');
    expect(judgeQuestion(input, { text: 'スム' })).toBe(true);
    expect(judgeQuestion(input, { text: 'すみ' })).toBe(false);
    expect(judgeQuestion(input, { text: '' })).toBe(false);
  });
  it('に/で/を の助詞問題とています選択の正誤', () => {
    const de = UNIT1_QUESTIONS.find((q) => q.id === 'fq-f2')!;
    const wo = UNIT1_QUESTIONS.find((q) => q.id === 'fq-f3')!;
    const te = UNIT1_QUESTIONS.find((q) => q.id === 'fq-f1')!;
    expect(judgeQuestion(de, { choiceIndex: de.answerIndex! })).toBe(true);
    expect(judgeQuestion(wo, { choiceIndex: wo.answerIndex! })).toBe(true);
    expect(te.choices![te.answerIndex!]).toBe('住んでいます');
    expect(judgeQuestion(te, { choiceIndex: te.choices!.indexOf('住みます') })).toBe(false);
    expect(judgeQuestion(order, { orderIndexes: [0, 1, 2, 3] })).toBe(true);
    expect(judgeQuestion(order, { orderIndexes: [1, 0, 2, 3] })).toBe(false);
  });
  it('orderシャッフルは決定的かつ正解順と異なる', () => {
    expect(shuffledOrder(order)).toEqual(shuffledOrder(order));
    expect(shuffledOrder(order)).not.toEqual([0, 1, 2, 3]);
  });
});

describe('軸別集計＋復習候補（day1/day3/day7/retained）', () => {
  const rs = [
    { questionId: 'a', targetId: 'fi-hataraku', dimension: 'reading' as const, correct: false, errorTag: 'reading_hataraku' },
    { questionId: 'b', targetId: 'fi-kaisha', dimension: 'meaning' as const, correct: true, errorTag: 'meaning_kaisha' },
    { questionId: 'c', targetId: 'fr-particles', dimension: 'connection' as const, correct: true, hintUsed: true, errorTag: 'particle_location_action' },
    { questionId: 'd', targetId: 'fi-shusshin', dimension: 'reading' as const, correct: true, previouslyConfirmed: true, errorTag: 'reading_shusshin' },
  ];
  it('軸別に正答/総数を集計', () => {
    const agg = aggregateByDimension(rs.map(({ questionId, dimension, correct, errorTag, targetId }) => ({ questionId, dimension, correct, errorTag, targetId })));
    expect(agg.reading).toEqual({ correct: 1, total: 2 });
    expect(agg.meaning).toEqual({ correct: 1, total: 1 });
  });
  it('誤答=day1・ヒント正解=day3・自力正解=day7確認候補・再確認自力正解=retained', () => {
    const cands = deriveReviewCandidates(rs);
    expect(cands).toEqual([
      { reviewTarget: 'fi-hataraku', reviewDimension: 'reading', errorTag: 'reading_hataraku', suggestedInterval: 'day1', reviewReason: 'incorrect', candidateState: 'due_day1' },
      { reviewTarget: 'fi-kaisha', reviewDimension: 'meaning', errorTag: 'meaning_kaisha', suggestedInterval: 'day7', reviewReason: 'confirm_retention', candidateState: 'confirm_day7' },
      { reviewTarget: 'fr-particles', reviewDimension: 'connection', errorTag: 'particle_location_action', suggestedInterval: 'day3', reviewReason: 'hint_used', candidateState: 'due_day3' },
      { reviewTarget: 'fi-shusshin', reviewDimension: 'reading', errorTag: 'reading_shusshin', suggestedInterval: null, reviewReason: 'retained', candidateState: 'retained' },
    ]);
  });
  it('一度の自力正解だけではretainedにしない（day7確認候補になる）', () => {
    const one = deriveReviewCandidates([{ questionId: 'x', targetId: 'fi-nihon', dimension: 'meaning' as const, correct: true, errorTag: 'meaning_nihon' }]);
    expect(one[0].candidateState).toBe('confirm_day7');
  });
});
