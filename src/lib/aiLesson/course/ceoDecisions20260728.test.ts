// CEO判断（2026-07-28・14件）のfield単位反映を担保するテスト。
// 反映が正しく静的教材へ入り、item/pack全体の承認へ波及していないことを固定する。
import { describe, it, expect } from 'vitest';
import { allVocabularyItems } from './foundationVocabBank';
import { levelMetaOf } from './vocabularyLevelMeta';
import { VOCAB_CONTENT_NOTES } from './vocabContentMeta';
import { EXAMPLE_FURIGANA } from './vocabFurigana';
import { BASIC_POOL, N3_POOL } from './vocabDiagnosticPool';
import { CEO_FIELD_DECISIONS, fieldDecisionSummary, isCeoDecidedField } from './vocabFieldReviewDecisions';
import { buildDecisionQueue, decisionQueueSummary } from './vocabDecisionQueue';

const items = new Map(allVocabularyItems().map((i) => [i.id, i]));

describe('fi-namae（P0例文・P1訳語のCEO確定値）', () => {
  const namae = items.get('fi-namae')!;
  it('例文はCEO確定値（学習対象語を含む・フルネーム・叫）', () => {
    expect(namae.exampleJa).toBe('私の名前は王小明です。');
    expect(namae.exampleZh).toBe('我叫王小明。');
  });
  it('訳語は「姓名；名字」・usageNoteに正式場面の説明を含む', () => {
    expect(namae.meaningZh).toBe('姓名；名字');
    expect(namae.usageNoteZh).toContain('姓名');
  });
  it('意味問題の正答テキストは新しい訳「姓名；名字」になる（選択肢は自動生成で追随）', async () => {
    const { buildDiagnosticQuestion } = await import('./vocabDiagnostic');
    const q = buildDiagnosticQuestion(namae, allVocabularyItems(), 0);
    if (q.dimension === 'meaning') {
      expect(q.choices![q.answerIndex]).toBe('姓名；名字');
    } else {
      // index 0 が読み問題の場合も、意味問題側で正答が新訳になることを確認する
      const qm = buildDiagnosticQuestion(namae, allVocabularyItems(), 1);
      const target = [q, qm].find((x) => x.dimension === 'meaning');
      expect(target?.choices![target.answerIndex]).toBe('姓名；名字');
    }
  });
  it('例文ふりがなは新例文と一致するよう再構成済み', () => {
    const segs = EXAMPLE_FURIGANA['fi-namae'];
    expect(segs).toBeTruthy();
    const text = segs.map((s) => s.text).join('');
    expect(text).toBe(namae.exampleJa);
  });
});

describe('cognate 11件のCEO確定分類', () => {
  const expected: Record<string, string> = {
    'fi-kyoumi': 'mostly_same',        // 案B維持
    'fi-genki': 'partial_overlap',
    'fi-kaishain': 'japanese_specific',
    'fi-kibun': 'japanese_specific',
    'fi-nanji': 'partial_overlap',
    'fi-nihongo': 'japanese_specific',
    'fi-soudan': 'partial_overlap',
    'fi-tomodachi': 'japanese_specific',
    'fi-yakusoku': 'false_friend',
    'fi-yasui': 'false_friend',
    'fi-zenzen': 'partial_overlap',
  };
  it.each(Object.entries(expected))('%s は %s', (id, cog) => {
    expect(levelMetaOf(id).cognate).toBe(cog);
  });
  it('CEO判断で追加した語のlearningFocusZhがCEO文言で登録されている', () => {
    expect(VOCAB_CONTENT_NOTES['fi-yakusoku']?.learningFocusZh).toContain('约定');
    expect(VOCAB_CONTENT_NOTES['fi-yasui']?.learningFocusZh).toContain('便宜');
    expect(VOCAB_CONTENT_NOTES['fi-nanji']?.learningFocusZh).toContain('几点');
    expect(VOCAB_CONTENT_NOTES['fi-zenzen']?.learningFocusZh).toContain('全然大丈夫');
    expect(VOCAB_CONTENT_NOTES['fi-genki']?.learningFocusZh).toContain('元气');
    expect(VOCAB_CONTENT_NOTES['fi-kyoumi']?.learningFocusZh).toContain('兴趣');
  });
});

describe('診断への反映（分類名そのものは問わない・§5）', () => {
  const all = [...BASIC_POOL, ...N3_POOL];
  it('約束＝约定・安いスーパー＝价格便宜・何時＝几点・全然＝否定呼応の意味用法問題がある', () => {
    const byId = new Map(all.map((p) => [p.q.id, p]));
    expect(byId.get('vdq-n3-m-yakusoku')!.q.choices![0]).toBe('约定');
    expect(byId.get('vdq-b-m-yasui')!.q.choices![0]).toBe('价格便宜的超市');
    expect(byId.get('vdq-b-m-nanji')!.q.choices![0]).toBe('现在几点？');
    expect(byId.get('vdq-n3-u-zenzen')!.q.choices![0]).toContain('全然分かりませんでした');
  });
  it('分類名（false_friend等の内部用語）を問題文・選択肢に出さない', () => {
    for (const p of all) {
      const text = p.q.promptJa + p.q.promptZh + (p.q.choices ?? []).join('');
      expect(text).not.toMatch(/false_friend|japanese_specific|partial_overlap|mostly_same|cognate/i);
    }
  });
  it('問題ID重複なし・対象itemIdは実在する', () => {
    expect(new Set(all.map((p) => p.q.id)).size).toBe(all.length);
    for (const p of all) expect(items.has(p.itemId), p.itemId).toBe(true);
  });
});

describe('未確定（unreviewed）cognateの扱い（severity原則の前提）', () => {
  it('unreviewedの語はfalse friend診断問題の対象になっていない', () => {
    for (const p of [...BASIC_POOL, ...N3_POOL]) {
      // 意味の違いを突く問題の対象語は、分類が確定している語だけ
      if (p.q.id.includes('yakusoku') || p.q.id.includes('yasui')) {
        expect(levelMetaOf(p.itemId).cognate).not.toBe('unreviewed');
      }
    }
  });
});

describe('field単位のレビュー状態（item/pack全体を昇格しない・§2）', () => {
  it('14件すべて applied_draft（validation・tests完了状態）', () => {
    const s = fieldDecisionSummary();
    expect(s.total).toBe(14);
    expect(s.byStatus.applied_draft + s.byStatus.human_review_candidate).toBe(14);
    expect(s.byField['cognate']).toBe(11);
  });
  it('CEO判断済みfieldの照会が機能する', () => {
    expect(isCeoDecidedField('fi-namae:example')).toBe(true);
    expect(isCeoDecidedField('fi-yakusoku:cognate')).toBe(true);
    expect(isCeoDecidedField('fi-namae:role')).toBe(false);   // roleは判断していない
  });
  it('item全体は draft のまま（human_reviewed / approved へ昇格していない）', () => {
    for (const d of CEO_FIELD_DECISIONS) {
      expect(items.get(d.itemId)!.review).toBe('draft');
    }
    expect(allVocabularyItems().every((i) => i.review === 'draft')).toBe(true);
  });
});

describe('severityモデル（CEO決定 2026-07-28）と Release Gate', () => {
  const q = buildDecisionQueue();
  const s = decisionQueueSummary(q);
  it('root P0 = 0・root P1 = 0（14件反映後）', () => {
    expect(s.rootP0Count).toBe(0);
    expect(s.rootP1Count).toBe(0);
    expect(s.byReleaseClass.release_blocker).toBe(0);
  });
  it('残る判断はP2/P3のみ（unreviewed cognateは非表示・非診断なのでP2原則）', () => {
    for (const d of q) expect(['P2', 'P3']).toContain(d.localSeverity);
  });
  it('rootIssueIdは重複カウントされない（root集計はユニーク）', () => {
    const blockers = q.filter((d) => d.releaseClass === 'release_blocker');
    expect(s.rootBlockerCount).toBe(new Set(blockers.map((d) => d.rootIssueId)).size);
  });
});
