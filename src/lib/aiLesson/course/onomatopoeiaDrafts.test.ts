// Phase 3P-3: オノマトペ完成draftのガード。
// 「完成draftのみ追加」（不完全なitemを教材へ入れない）を機械検証する。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ONOMATOPOEIA_DRAFTS } from './onomatopoeiaDrafts';

const candidates = JSON.parse(readFileSync(join(__dirname, '../../../..',
  'docs/ai-course/production/generated/content-candidates.json'), 'utf8')).candidates as
  { sourceCandidateId: string; surface: string; provenance: { sheet: string } }[];
const onoCandidates = candidates.filter(c => c.provenance.sheet === 'オノマトペ100集（完成版）');

describe('オノマトペ完成draft', () => {
  it('全draftが必須fieldを完備している（不完全なitemは存在しない）', () => {
    for (const o of ONOMATOPOEIA_DRAFTS) {
      expect(o.meaningJa.length).toBeGreaterThan(0);
      expect(o.meaningZh).toMatch(/[（(]/);           // 拟声/状态/心理の区分を含む
      expect(o.nuanceZh.length).toBeGreaterThan(5);
      expect(o.examples.length).toBeGreaterThanOrEqual(2);  // 例文2以上（§9）
      for (const ex of o.examples) {
        expect(ex.ja).toContain(o.surface[0]);        // 例文に対象語が含まれる
        expect(ex.zh.length).toBeGreaterThan(0);
      }
      expect(o.commonMistakeZh.length).toBeGreaterThan(10);
      expect(o.recognition.options.length).toBe(4);
      expect(o.recognition.answerIndex).toBeLessThan(4);
      expect(o.recognition.feedbackZh.length).toBeGreaterThan(0);
      expect(o.production.expected.length).toBeGreaterThan(0);
      expect(o.production.acceptable.length).toBeGreaterThan(0);
      expect(o.conversation.targetExpressions).toContain(o.surface);
      expect(o.conversation.starterZh.length).toBeGreaterThan(0);
      expect(o.conversation.followUpZh.length).toBeGreaterThan(0);
      expect(o.usagePatterns.length).toBeGreaterThan(0);
      expect(o.similarJa.length).toBeGreaterThan(0);
      expect(o.reviewKey).toBe(o.id);
      expect(o.unit).toBe('ono-unit-1');
    }
  });
  it('自動昇格なし: 全件draft・human_reviewed/approved false', () => {
    expect(ONOMATOPOEIA_DRAFTS.every(o =>
      o.publishStatus === 'draft' && !o.humanReviewed && !o.approved)).toBe(true);
  });
  it('sourceCandidateIdがintake manifestの実在候補と一致（括弧注記を除いたsurfaceで照合）', () => {
    const norm = (s: string) => s.replace(/[（(].*?[)）]/g, '').trim();
    const bySid = new Map(onoCandidates.map(c => [c.sourceCandidateId, norm(c.surface)]));
    for (const o of ONOMATOPOEIA_DRAFTS) {
      expect(bySid.get(o.sourceCandidateId)).toBe(o.surface);
    }
  });
  it('id・surface・starter質問が全draftで固有（テンプレ量産偽装なし）', () => {
    const ids = ONOMATOPOEIA_DRAFTS.map(o => o.id);
    expect(new Set(ids).size).toBe(ids.length);
    const starters = ONOMATOPOEIA_DRAFTS.map(o => o.conversation.starterJa);
    expect(new Set(starters).size).toBe(starters.length);
    const surfaces = ONOMATOPOEIA_DRAFTS.map(o => o.surface);
    expect(new Set(surfaces).size).toBe(surfaces.length);
  });
  it('completeness manifestと件数が同期している', () => {
    const m = JSON.parse(readFileSync(join(__dirname, '../../../..',
      'docs/ai-course/production/generated/onomatopoeia-draft-completeness.json'), 'utf8'));
    expect(m.sourceCandidates).toBe(onoCandidates.length);
    expect(m.completeDrafts).toBe(ONOMATOPOEIA_DRAFTS.length);
    expect(m.completeDrafts + m.incompleteRemaining).toBe(m.sourceCandidates);
  });
});
