// Phase 3P-2: Excel統合候補manifestの恒等式・同期ガード。
// 「未分類0」= 全登録行が終端intakeStatusを持つこと（教材採否が決まったことではない）。
// manifestは scripts/ai-course/generate-excel-intake-manifests.py の再実行で再生成する。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { ExcelIntegrationCandidate } from './vocabIntegrationTypes';

const gen = (name: string) => JSON.parse(readFileSync(
  join(__dirname, '../../../..', 'docs/ai-course/production/generated', name), 'utf8'));

const inventory = gen('excel-intake-inventory.json');
const summary = gen('candidate-classification-summary.json');
const candidates: ExcelIntegrationCandidate[] = gen('content-candidates.json').candidates;
const conflicts = gen('candidate-conflicts.json').conflicts;
const dq = gen('candidate-decision-queue.json');

const WB_SHA = '8b365e6186b9189d';
const FIRST_WAVE = ['オノマトペ100集（完成版）', '複合動詞一覧', '頻出表現', '最初に覚える最低限表現'];
const RIGHTS_SHEETS = ['営業・ビジネス用語集200集', '原：慣用句110集 ', '日本の29歳以下のビジネスメッセージ67選'];

describe('Excel intake: シートInventory', () => {
  it('全40シートが理由付きsheetStateで登録されている（未登録0）', () => {
    expect(inventory.sheets.length).toBe(40);
    const states = Object.values(summary.sheets.byState as Record<string, number>)
      .reduce((a, b) => a + b, 0);
    expect(states).toBe(40);
    for (const s of inventory.sheets) {
      expect(s.sheetState.length).toBeGreaterThan(0);
      expect(s.reason.length).toBeGreaterThan(0);
    }
  });
  it('workbook fingerprintが一致（Excel変更時はmanifest再生成が必要）', () => {
    expect(inventory.workbookSha16).toBe(WB_SHA);
    expect(summary.workbookSha16).toBe(WB_SHA);
  });
});

describe('Excel intake: 候補の恒等式', () => {
  it('未分類0: 全候補が終端intakeStatusを持ち、状態合計=候補総数', () => {
    expect(summary.unclassified).toBe(0);
    const stSum = Object.values(summary.intakeStatus as Record<string, number>)
      .reduce((a, b) => a + b, 0);
    expect(stSum).toBe(summary.rows.registeredCandidates);
    expect(candidates.length).toBe(summary.rows.registeredCandidates);
    expect(candidates.every(c => c.intakeStatus.length > 0)).toBe(true);
  });
  it('provenance完備（error 0・全件にworkbook hash/シート/行/元テキスト）', () => {
    expect(summary.provenance.errors).toBe(0);
    for (const c of candidates) {
      expect(c.provenance.workbookSha16).toBe(WB_SHA);
      expect(c.provenance.excelRow).toBeGreaterThan(0);
      expect(c.provenance.sheet.length).toBeGreaterThan(0);
    }
  });
  it('sourceCandidateIdは重複しない（決定的・行順非依存）', () => {
    const ids = new Set(candidates.map(c => c.sourceCandidateId));
    expect(ids.size).toBe(candidates.length);
  });
});

describe('Excel intake: 第一弾4シートの意味分類', () => {
  const fw = candidates.filter(c => FIRST_WAVE.includes(c.provenance.sheet));
  it('primary分類未完了0（全候補がrelationshipを持つ）', () => {
    expect(fw.length).toBe(summary.firstWave.candidates);
    expect(fw.every(c => c.relationship !== 'awaiting_review')).toBe(true);
    const relSum = Object.values(summary.firstWave.byRelationship as Record<string, number>)
      .reduce((a, b) => a + b, 0);
    expect(relSum).toBe(fw.length);
  });
  it('reuse判定は必ず既存itemIdつき・人間判断必須（中文言い換えだけでnew_senseにしない）', () => {
    for (const c of fw.filter(c => c.relationship === 'reuse_existing')) {
      expect(c.matchedExistingIds.length).toBeGreaterThan(0);
      expect(c.requiresHumanDecision).toBe(true);
    }
    expect(fw.some(c => c.relationship === 'new_sense')).toBe(false);
  });
  it('conflictは無理にreuse/newへ解決せず専用manifestへ', () => {
    const cf = candidates.filter(c => c.relationship === 'conflict');
    expect(conflicts.length).toBe(cf.length);
    for (const c of cf) expect(c.requiresHumanDecision).toBe(true);
  });
});

describe('Excel intake: rightsシートの保全', () => {
  const rights = candidates.filter(c => RIGHTS_SHEETS.includes(c.provenance.sheet));
  it('3シート379行が全件awaiting_rights_rewriteで登録（非採用・非削除・行数維持）', () => {
    expect(rights.length).toBe(379);
    expect(rights.every(c => c.intakeStatus === 'awaiting_rights_rewrite')).toBe(true);
    expect(rights.every(c => c.requiresHumanDecision)).toBe(true);
  });
  it('rightsシートはsheetStateでも隔離され、置換対象Phaseが明記されている', () => {
    const sheets = inventory.sheets.filter((s: { sheet: string }) => RIGHTS_SHEETS.includes(s.sheet));
    expect(sheets.length).toBe(3);
    for (const s of sheets) expect(s.sheetState).toBe('awaiting_rights_rewrite');
  });
});

describe('Excel intake: 自動昇格なし', () => {
  it('全候補がdraft（human_reviewed/approvedは存在しない）', () => {
    expect(candidates.every(c => c.reviewStatus === 'draft')).toBe(true);
  });
  it('Decision Queueの参照が切れていない', () => {
    const ids = new Set(candidates.map(c => c.sourceCandidateId));
    for (const queue of Object.values(dq.queues as Record<string, { sourceCandidateId: string }[]>)) {
      for (const entry of queue) expect(ids.has(entry.sourceCandidateId)).toBe(true);
    }
  });
});
