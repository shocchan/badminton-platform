// Phase 2E-1 教材品質・診断次元・ふりがな・レビュー基盤のテスト（§33）。
// 集計は必ず単一関数（auditSummary/aggregate*）を通す（手計算の期待値を書かない）。
import { describe, it, expect } from 'vitest';
import { buildVocabularyReviewRecords, auditSummary } from './vocabularyReview';
import { allVocabularyItems } from './foundationVocabBank';
import { N3_ITEMS } from './foundationVocabN3';
import { N3_ROLE_META } from './vocabularyRoleMeta';
import { VOCABULARY_PACKS, roleFor, roleCounts } from './vocabularyPacks';
import type { VocabularyTrack } from './vocabularyPacks';
import { EXAMPLE_FURIGANA, furiganaForItem, furiganaCoverage } from './vocabFurigana';
import { meaningZhShortOf, SENSE_COGNATE_OVERRIDES, aggregateSenseCognates, VOCAB_CONTENT_NOTES } from './vocabContentMeta';
import { BASIC_POOL, N3_POOL, relatedItemsOf } from './vocabDiagnosticPool';
import { buildDiagnosticSet, diagnosticCountFor, pickQuickReviewItems } from './vocabDiagnostic';
import { createVocabProgressRepository, deriveDiagnosticOutcome } from './vocabProgress';
import { createVocabReviewRepository, REVIEW_SCHEMA_VERSION } from './vocabReviewStore';
import { aggregateAssetStates, VISUAL_ASSETS } from './visualAssetManifest';
import { requiresKeyboard } from './foundationTypes';

const items = allVocabularyItems();
const itemById = new Map(items.map((i) => [i.id, i]));
const basics = VOCABULARY_PACKS[0];
const n3pack = VOCABULARY_PACKS[1];
const TRACKS: VocabularyTrack[] = ['life_basic', 'n3_prep', 'n2_prep', 'conversation'];

const makeStorage = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } };
};

describe('140語の単一監査インデックス（§2）', () => {
  const records = buildVocabularyReviewRecords();
  const summary = auditSummary();
  it('総語数=基礎+N3・ID/Sense重複なし', () => {
    expect(summary.totalItems).toBe(items.length);
    expect(summary.basicsItems + summary.n3Items).toBe(summary.totalItems);
    expect(summary.n3Items).toBe(N3_ITEMS.length);
    const ids = records.map((r) => r.itemId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of records) expect(new Set(r.senseIds).size).toBe(r.senseIds.length);
  });
  it('全語がいずれかのパックに属し、track別roleが埋まる', () => {
    for (const r of records) {
      expect(r.packs.length).toBeGreaterThanOrEqual(1);
      for (const tr of TRACKS) expect(['required', 'diagnostic', 'optional', 'remedial', 'enrichment']).toContain(r.rolesByTrack[tr]);
    }
  });
  it('必須フィールド: 読み・中国語・例文・出典・draft状態', () => {
    for (const r of records) {
      expect(r.item.readingKana.length).toBeGreaterThan(0);
      expect(r.item.meaningZh.length).toBeGreaterThan(0);  // N3語の>1はvocabPacksPhase2dで担保（水=水等の基礎1字訳は可）
      expect(r.meaningZhShort.length).toBeGreaterThan(0);
      expect(r.item.exampleJa.length).toBeGreaterThan(0);
      expect(r.item.exampleZh.length).toBeGreaterThan(0);
      expect(r.item.sources.length).toBeGreaterThan(0);
      expect(r.item.review).toBe('draft');  // 自動approved禁止
      expect(['draft', 'unreviewed']).toContain(r.contentReviewStatus);
    }
  });
  it('cognate集計はItem単位で合計が語数と一致（基礎・N3別も同関数）', () => {
    const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
    expect(sum(summary.itemCognates)).toBe(summary.totalItems);
    expect(sum(summary.basicsCognates)).toBe(summary.basicsItems);
    expect(sum(summary.n3Cognates)).toBe(summary.n3Items);
  });
  it('outstandingIssuesは実状態から導出（cognate未レビュー語はunreviewedフラグ）', () => {
    for (const r of records) {
      if (r.cognateDefault === 'unreviewed') expect(r.outstandingIssues).toContain('cognate_unreviewed');
      if (!r.furiganaSegments) expect(r.outstandingIssues).toContain('furigana_missing');
    }
  });
});

describe('N3パックroleの目標別監査（§3）', () => {
  it('全62語に監査エントリと根拠がある（登録漏れ=diagnosticへ倒れるがテストで禁止）', () => {
    for (const i of N3_ITEMS) {
      const e = N3_ROLE_META[i.id];
      expect(e, i.id).toBeTruthy();
      expect(e.rationaleJa.length).toBeGreaterThan(5);
    }
  });
  it('無根拠の全件requiredではない（diagnostic/optional/enrichmentが存在・remedial静的なし）', () => {
    const rc = roleCounts(n3pack, 'n3_prep');
    expect(rc.required).toBeLessThan(N3_ITEMS.length);
    expect(rc.diagnostic).toBeGreaterThan(0);
    expect(rc.optional).toBeGreaterThan(0);
    expect(rc.enrichment).toBeGreaterThan(0);   // つまり等の発展語
    expect(rc.remedial).toBe(0);                // remedialは動的付与のみ（§3）
    const total = Object.values(rc).reduce((a, b) => a + b, 0);
    expect(total).toBe(n3pack.itemIds.length);
  });
  it('目標別に差がある: N2は原則diagnostic＋false friend中核のみrequired', () => {
    const rcN2 = roleCounts(n3pack, 'n2_prep');
    expect(rcN2.required).toBeGreaterThanOrEqual(1);
    expect(rcN2.required).toBeLessThanOrEqual(5);
    expect(roleFor('pack-n3-prep-1', 'n2_prep', 'fi-tsugou')).toBe('required');
    expect(roleFor('pack-n3-prep-1', 'n2_prep', 'fi-taihen')).toBe('required');
    // 会話トラックは読解寄りの抽象語がoptionalへ
    expect(roleFor('pack-n3-prep-1', 'conversation', 'fi-joukyou')).toBe('optional');
    expect(roleFor('pack-n3-prep-1', 'conversation', 'fi-soudan')).toBe('required');
    // transparent語はN3でもdiagnostic（読み確認中心）
    expect(roleFor('pack-n3-prep-1', 'n3_prep', 'fi-riyuu')).toBe('diagnostic');
  });
  it('同一Itemの複製は無い（roleはトラック文脈のみで変わる）', () => {
    const ids = n3pack.itemIds;
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('診断の次元と結果導出（§4-§6）', () => {
  it('deriveDiagnosticOutcome: 誤答あり=remedial／読み+意味=basic_confirmed／一部=partially', () => {
    expect(deriveDiagnosticOutcome(undefined)).toBe('diagnostic');
    expect(deriveDiagnosticOutcome({ dims: { reading: 'confirmed' } })).toBe('partially_confirmed');
    expect(deriveDiagnosticOutcome({ dims: { reading: 'confirmed', meaning: 'confirmed' } })).toBe('basic_confirmed');
    expect(deriveDiagnosticOutcome({ dims: { reading: 'confirmed', usage: 'needs_review' } })).toBe('remedial');
    expect(deriveDiagnosticOutcome({ dims: { usage: 'supported' } })).toBe('partially_confirmed');
  });
  it('v1ストア移行: confirmed→partially_confirmed（次元をでっち上げない）・remedial維持・entries無傷', () => {
    const storage = makeStorage();
    storage.setItem('ai_course_vocab_preview_v1', JSON.stringify({
      schemaVersion: 1,
      entries: { 'fi-iku': { selfAssessment: 'learning', imageViewed: true, firstSeenAt: 'x', lastSeenAt: 'x', encounterCount: 2, tests: [] } },
      dailyWords: null,
      diagnostics: { 'pack-life-basic-1': { 'fi-chugoku': 'confirmed', 'fi-mizu': 'remedial' } },
    }));
    const repo = createVocabProgressRepository(storage);
    expect(repo.getEntry('fi-iku').encounterCount).toBe(2);
    const outcomes = repo.getDiagnosticOutcomes('pack-life-basic-1');
    expect(outcomes['fi-chugoku']).toBe('partially_confirmed');
    expect(outcomes['fi-mizu']).toBe('remedial');
  });
  it('不正JSON・未知schemaVersionでもクラッシュせず初期化', () => {
    const storage = makeStorage();
    storage.setItem('ai_course_vocab_preview_v1', '{{{broken');
    const repo = createVocabProgressRepository(storage);
    expect(repo.getStats().seenCount).toBe(0);
    storage.setItem('ai_course_vocab_preview_v1', JSON.stringify({ schemaVersion: 99, entries: {} }));
    expect(createVocabProgressRepository(storage).getStats().seenCount).toBe(0);
  });
});

describe('診断セットの構成（§5）', () => {
  it('基礎=10〜15問・N3=12〜18問・全タップ式・重複なし・決定的', () => {
    const repo = createVocabProgressRepository(makeStorage());
    expect(diagnosticCountFor(basics)).toBeGreaterThanOrEqual(10);
    expect(diagnosticCountFor(basics)).toBeLessThanOrEqual(15);
    expect(diagnosticCountFor(n3pack)).toBeGreaterThanOrEqual(12);
    expect(diagnosticCountFor(n3pack)).toBeLessThanOrEqual(18);
    for (const [pack, track] of [[basics, 'n2_prep'], [n3pack, 'n3_prep']] as const) {
      const set1 = buildDiagnosticSet(pack, track, itemById, repo, items);
      const set2 = buildDiagnosticSet(pack, track, itemById, repo, items);
      expect(set1.map((x) => x.q.id)).toEqual(set2.map((x) => x.q.id));  // 決定的
      const qIds = set1.map((x) => x.q.id);
      expect(new Set(qIds).size).toBe(qIds.length);                     // duplicateなし
      for (const x of set1) {
        expect(requiresKeyboard(x.q.type)).toBe(false);                 // タップ式のみ
        expect(x.q.choices!.length).toBeGreaterThanOrEqual(2);
        expect(['reading', 'meaning', 'usage', 'collocation', 'particle', 'conjugation']).toContain(x.vocabDimension);
      }
    }
  });
  it('用法・コロケーション・助詞・活用・自他・類義・false friend問題がプールに存在', () => {
    const dims = (pool: typeof BASIC_POOL) => pool.map((p) => p.vocabDimension);
    expect(dims(BASIC_POOL)).toContain('usage');
    expect(dims(BASIC_POOL)).toContain('particle');
    expect(dims(BASIC_POOL)).toContain('conjugation');
    expect(dims(BASIC_POOL)).toContain('collocation');
    expect(dims(N3_POOL)).toContain('collocation');
    expect(dims(N3_POOL)).toContain('particle');
    // 自他（決まる/変わる）・類義（考える/思う）・false friend（都合/大変）
    expect(N3_POOL.some((p) => p.itemId === 'fi-kimaru')).toBe(true);
    expect(N3_POOL.some((p) => p.itemId === 'fi-kangaeru')).toBe(true);
    expect(N3_POOL.some((p) => p.itemId === 'fi-tsugou' && p.vocabDimension === 'usage')).toBe(true);
    expect(N3_POOL.some((p) => p.itemId === 'fi-taihen' && p.vocabDimension === 'meaning')).toBe(true);
    // プール問題の正解index=0・選択肢に重複なし
    for (const p of [...BASIC_POOL, ...N3_POOL]) {
      expect(p.q.answerIndex).toBe(0);
      expect(new Set(p.q.choices).size).toBe(p.q.choices!.length);
      expect(itemById.has(p.itemId)).toBe(true);
    }
  });
  it('transparent語は読み・用法優先（中国の1問目はreading）', () => {
    const repo = createVocabProgressRepository(makeStorage());
    const set = buildDiagnosticSet(basics, 'n2_prep', itemById, repo, items);
    const chugoku = set.filter((x) => x.itemId === 'fi-chugoku');
    expect(chugoku.length).toBeGreaterThanOrEqual(1);
    expect(chugoku[0].vocabDimension).toBe('reading');
  });
  it('誤答の関連Item（自他ペア）が復習候補へ追加される（結果はでっち上げない）', () => {
    expect(relatedItemsOf('fi-kimaru')).toContain('fi-kimeru');
    const storage = makeStorage();
    const repo = createVocabProgressRepository(storage);
    repo.recordTest('fi-kimaru', 'usage', false, '2026-07-27T10:00:00.000Z');
    const picked = pickQuickReviewItems(n3pack.itemIds, repo);
    expect(picked).toContain('fi-kimaru');
    expect(picked).toContain('fi-kimeru');
    // 関連Itemの診断結果・テスト履歴には何も書かれていない
    expect(repo.getEntry('fi-kimeru').tests.length).toBe(0);
  });
});

describe('Sense別cognate（§7）', () => {
  it('高い・聞く・大変・都合にSense上書きがあり、senseIdが実在する', () => {
    for (const id of ['fi-takai', 'fi-kiku', 'fi-taihen', 'fi-tsugou']) {
      const overrides = SENSE_COGNATE_OVERRIDES[id];
      expect(overrides?.length, id).toBeGreaterThanOrEqual(2);
      const item = itemById.get(id)!;
      const senseIds = new Set((item.senses ?? []).map((sn) => sn.id));
      for (const o of overrides) expect(senseIds.has(o.senseId), `${id}:${o.senseId}`).toBe(true);
    }
  });
  it('集計: Item集計とSense集計を分離・同一Sense重複カウントなし', () => {
    const s = aggregateSenseCognates();
    const allOverrides = Object.values(SENSE_COGNATE_OVERRIDES).flat();
    expect(s.senseOverrideCount).toBe(new Set(allOverrides.map((o) => o.senseId)).size);
    expect(s.itemsWithOverrides).toBe(Object.keys(SENSE_COGNATE_OVERRIDES).length);
    expect(s.unreviewedSenseCount).toBeGreaterThanOrEqual(0);
  });
});

describe('中国語の分離と品質（§8-§9）', () => {
  it('meaningZhShortは決定的（明示指定 or 第1義）・空にならない', () => {
    for (const i of items) {
      const short = meaningZhShortOf(i);
      expect(short.length).toBeGreaterThan(0);
      // 自動導出（明示指定なし）の中心意味は1義のみ（明示指定はレビュー済みの文言をそのまま尊重）
      if (!VOCAB_CONTENT_NOTES[i.id]?.meaningZhShort) expect(short.includes('；'), i.id).toBe(false);
    }
  });
  it('false friend・transparentの代表語に学習ポイント（learningFocusZh）がある', () => {
    for (const id of ['fi-sensei', 'fi-benkyo', 'fi-tsugou', 'fi-taihen', 'fi-chugoku', 'fi-riyuu']) {
      expect(VOCAB_CONTENT_NOTES[id]?.learningFocusZh, id).toBeTruthy();
    }
  });
  it('meaningZhに日本語式の中黒を使わない（中国語標点へ正規化済み）', () => {
    for (const i of items) expect(i.meaningZh.includes('・'), `${i.id}: ${i.meaningZh}`).toBe(false);
  });
});

describe('例文ふりがな（§11-§12）', () => {
  it('全140語の主要例文にsegmentsがあり、連結で例文を完全再構成できる', () => {
    const cov = furiganaCoverage(items.map((i) => i.id));
    expect(cov.withSegments).toBe(cov.total);   // 主要例文1件以上=全件（§11最低目標）
    for (const i of items) {
      const segs = furiganaForItem(i.id)!;
      expect(segs.map((sg) => sg.text).join(''), i.id).toBe(i.exampleJa);  // 文字抜け・重複なし
    }
  });
  it('漢字を含むセグメントには読みがある（不確実な読みを機械的に残さない）', () => {
    const kanji = /[一-鿿]/;
    for (const [id, segs] of Object.entries(EXAMPLE_FURIGANA)) {
      for (const sg of segs) {
        if (kanji.test(sg.text)) expect(sg.reading, `${id}:${sg.text}`).toBeTruthy();
      }
    }
  });
  it('対象語セグメントがあり、見出し語の先頭部分と一致する', () => {
    for (const i of items) {
      const segs = furiganaForItem(i.id)!;
      const targetText = segs.filter((sg) => sg.isTarget).map((sg) => sg.text).join('');
      expect(targetText.length, i.id).toBeGreaterThan(0);
      expect(i.displayForm.startsWith(targetText) || i.exampleJa.includes(targetText), `${i.id}:${targetText}`).toBe(true);
    }
  });
});

describe('教材レビューストア（§15-§16・§29）', () => {
  it('decision/issueTypes/note保存・進捗集計・学習者進捗ストアに書かない', () => {
    const storage = makeStorage();
    const repo = createVocabReviewRepository(storage);
    repo.setDecision('fi-iku', 'ok', []);
    repo.setDecision('fi-sumu', 'fix', ['zh_meaning', 'example_ja'], 'メモ');
    repo.setDecision('fi-kiku', 'hold', []);
    const p = repo.getProgress(['fi-iku', 'fi-sumu', 'fi-kiku', 'fi-taberu']);
    expect(p).toEqual({ total: 4, reviewed: 3, ok: 1, fix: 1, hold: 1, unreviewed: 1 });
    expect(repo.getEntry('fi-sumu')?.issueTypes).toEqual(['zh_meaning', 'example_ja']);
    expect(storage.getItem('ai_course_vocab_preview_v1')).toBeNull();  // 語彙進捗と混ぜない（§29）
  });
  it('export→importで往復できる・不正JSONは何も変更しない', () => {
    const s1 = makeStorage(); const s2 = makeStorage();
    const r1 = createVocabReviewRepository(s1);
    r1.setDecision('fi-iku', 'fix', ['reading']);
    const json = r1.exportJson();
    expect(JSON.parse(json).schemaVersion).toBe(REVIEW_SCHEMA_VERSION);
    const r2 = createVocabReviewRepository(s2);
    expect(r2.importJson(json)).toBe(true);
    expect(r2.getEntry('fi-iku')?.decision).toBe('fix');
    expect(r2.importJson('{{{')).toBe(false);
    expect(r2.importJson(JSON.stringify({ schemaVersion: 9 }))).toBe(false);
    expect(r2.getEntry('fi-iku')?.decision).toBe('fix');  // 壊れていない
  });
  it('レビューの「問題なし」で教材データがapprovedにならない（review状態は静的データ側）', () => {
    const repo = createVocabReviewRepository(makeStorage());
    repo.setDecision('fi-iku', 'ok', []);
    expect(itemById.get('fi-iku')!.review).toBe('draft');
    const rec = buildVocabularyReviewRecords().find((r) => r.itemId === 'fi-iku')!;
    expect(['draft', 'unreviewed']).toContain(rec.contentReviewStatus);
  });
});

describe('VisualAsset状態集計（§23）', () => {
  it('単一集計関数: imported+placeholder+rejected=総数・queue差の説明（未キュー2件）', () => {
    const s = aggregateAssetStates();
    expect(s.totalManifest).toBe(VISUAL_ASSETS.length);
    expect(s.imported + s.placeholderOnly + s.rejected).toBe(s.totalManifest);
    expect(s.queuedPending + s.plannedUnqueued).toBe(s.placeholderOnly);
    expect(s.plannedUnqueued).toBe(2);  // 会話・仕事パックのカバー（パック未実装のため未キュー）
    expect(s.svgOnly).toBe(6);
    expect(s.blocked).toBe(0);
  });
  it('矛盾した状態を持たない: filePathの無いassetはimportedに数えない', () => {
    const s = aggregateAssetStates();
    const withFile = VISUAL_ASSETS.filter((a) => !!a.filePath && a.reviewStatus !== 'rejected').length;
    expect(s.imported).toBe(withFile);
  });
});
