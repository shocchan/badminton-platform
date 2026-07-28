// Phase 3A: 教材Release監査の単一集計の恒等式と、matrix JSONとの同期ガード。
// 「読み込んだ」と「公開可能」の区別が崩れないことをテストで固定する。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { buildContentReleaseMatrix } from './contentReleaseAudit';

const m = buildContentReleaseMatrix();

describe('単一集計の恒等式', () => {
  it('語彙: role合計・出典区分・画像区分がtotalと一致する', () => {
    const v = m.vocabulary;
    const roleSum = v.byRole.required + v.byRole.diagnostic + v.byRole.optional + v.byRole.enrichment;
    expect(roleSum).toBe(v.total);
    expect(v.sourceVerified + v.sourceExternalOnly).toBe(v.total);
    expect(v.imageImported + v.imagePlannedOrNone).toBe(v.total);
  });
  it('語彙140＝基礎78＋N3準備62', () => {
    expect(m.vocabulary.total).toBe(140);
  });
  it('文法は180項目・例文は全項目にある', () => {
    expect(m.grammar.total).toBe(180);
    expect(m.grammar.exampleComplete).toBe(180);
  });
});

describe('「公開可能」を誇張しない', () => {
  it('approved・human_reviewedは人間のみ付与＝現時点0が正しい', () => {
    expect(m.vocabulary.byReview.human_reviewed).toBe(0);
    expect(m.vocabulary.byReview.approved).toBe(0);
    expect(m.vocabulary.releasableNow).toBe(0);
    expect(m.grammar.humanReviewed).toBe(0);
    expect(m.grammar.approved).toBe(0);
  });
  it('文法の未完成を正直に数える（中文0・出題0・復習接続0）', () => {
    expect(m.grammar.chineseComplete).toBe(0);
    expect(m.grammar.diagnosticComplete).toBe(0);
    expect(m.grammar.reviewConnected).toBe(0);
  });
  it('root P0/P1は0（CEO判断14件反映後の状態を維持）', () => {
    expect(m.decisionQueue.rootP0).toBe(0);
    expect(m.decisionQueue.rootP1).toBe(0);
  });
});

describe('content-release-matrix.json との同期ガード', () => {
  const json = JSON.parse(readFileSync(
    join(__dirname, '../../../..', 'docs/ai-course/content-release-matrix.json'), 'utf8'));
  it('語彙・文法・キューの数値がJSONと一致する（教材変更時はJSONを再生成すること）', () => {
    expect(json.vocabulary).toEqual(m.vocabulary);
    expect(json.grammar).toEqual(m.grammar);
    expect(json.decisionQueue).toEqual(m.decisionQueue);
    expect(json.usedExcelSheets).toEqual(m.usedExcelSheets);
    expect(json.sourceRefTotal).toBe(m.sourceRefTotal);
  });
  it('Excel部分はopenpyxl集計由来（40シート・使用12・非空4417行）', () => {
    expect(json.excel.sheetCount).toBe(40);
    expect(json.excel.usedSheets).toBe(m.usedExcelSheets.length);
    expect(json.excel.totalNonEmptyRows).toBe(4417);
    expect(json.excel.usedSheets + json.excel.unusedSheets).toBe(json.excel.sheetCount);
  });
  it('N2問題Sourceは0件＝公開可能問題0を正直に記録している', () => {
    expect(json.n2QuestionSources.registered).toBe(0);
    expect(json.n2QuestionSources.publishableQuestions).toBe(0);
    expect(json.n2QuestionSources.rightsUnknown).toBe(0);
  });
});
