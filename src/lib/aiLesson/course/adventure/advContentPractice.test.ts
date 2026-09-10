/*
 * 冒険の教材 → AI会話ミッションの登録（2026-09-10 Phase 6）。
 *
 * 守りたいこと:
 *   ・今日の文法の practice が advconv-<grammarId> として登録され、missionById で引ける（押せば始まる）
 *   ・Business の場面が bizconv- として登録され、級を持つ（学習者の級で絞れる）
 *   ・会話コースの missionId → grammarId の対応表が stageContent から出る
 *   ・会話コース（COURSE_MISSIONS）は増減しない。AI会話を毎日の冒険へ戻していない
 */
import { describe, it, expect } from 'vitest';
import { generateRoute } from './advRoute';
import { pickContentStage } from './advContent';
import { missionById, practiceMissionById } from '../courseEngine';
import { COURSE_MISSIONS } from '../courseData';
import { grammarIdOfMission } from '../knowledge/conversationKnowledge';
import { generateTodayQuest } from './advQuest';
import { defaultAdvProfile } from './advProfile';

const NOW = '2026-09-10T00:00:00.000Z';

describe('stageContent → 会話ミッション', () => {
  it('N2 ルートの現在stageで、今日の文法の practice が登録され、押せる', async () => {
    const before = COURSE_MISSIONS.length;
    const route = generateRoute({
      goalType: 'jlpt', targetJlpt: 'N2',
      knowledgeBand: 'needs_assessment', conversationBand: 'needs_assessment',
      diagnosis: null, nowISO: NOW,
    });
    const { content } = await pickContentStage(route, route.stages[0], new Set(), new Set(), new Set());
    expect(content.practiceScenes.length).toBeGreaterThan(0);
    for (const s of content.practiceScenes) {
      expect(s.id.startsWith('advconv-')).toBe(true);
      expect(missionById(s.id)?.id, s.id).toBe(s.id);
      expect(grammarIdOfMission(s.id), s.id).toBeTruthy();
      expect(s.group).toBe('grammar');
      expect(missionById(s.id)!.isPublished).toBe(true);
      expect(() => new RegExp(missionById(s.id)!.detect)).not.toThrow();
    }
    // 会話コースは変わらない
    expect(COURSE_MISSIONS.length).toBe(before);
    expect(practiceMissionById('w03m1')).toBeUndefined();
  }, 120000);

  it('Business の場面は級を持ち、全部登録される', async () => {
    const route = generateRoute({
      goalType: 'jlpt', targetJlpt: 'N1',
      knowledgeBand: 'needs_assessment', conversationBand: 'needs_assessment',
      diagnosis: null, nowISO: NOW,
    });
    const { content } = await pickContentStage(route, route.stages[0], new Set(), new Set(), new Set());
    // 10文脈 × 3場面
    expect(content.businessScenes.length).toBe(30);
    const levels = new Set(content.businessScenes.map((s) => s.level));
    expect([...levels].every((l) => ['N5', 'N4', 'N3', 'N2', 'N1'].includes(l))).toBe(true);
    expect(levels.has('N1')).toBe(true);
    expect(levels.has('N3') || levels.has('N4')).toBe(true);
    for (const s of content.businessScenes) {
      expect(missionById(s.id)?.id, s.id).toBe(s.id);
      expect(grammarIdOfMission(s.id), s.id).toBeTruthy();
    }
  }, 120000);

  it('会話コースの missionId → grammarId の対応表が出る（50件以上）', async () => {
    const route = generateRoute({
      goalType: 'jlpt', targetJlpt: 'N3',
      knowledgeBand: 'needs_assessment', conversationBand: 'needs_assessment',
      diagnosis: null, nowISO: NOW,
    });
    const { content } = await pickContentStage(route, route.stages[0], new Set(), new Set(), new Set());
    expect(content.missionGrammar.size).toBeGreaterThanOrEqual(50);
    expect(content.missionGrammar.get('w03m1')).toBe('n4g-youninarimasu');
  }, 120000);

  it('**AI会話は今日の冒険に戻っていない**（allowConversation 無しの生成に conversation_mission が無い）', () => {
    const profile = { ...defaultAdvProfile('2026-09-10T00:00:00.000Z'), goalType: 'jlpt' as const, targetJlpt: 'N2' as const, dailyMinutes: 15 as const };
    const route = generateRoute({
      goalType: 'jlpt', targetJlpt: 'N2',
      knowledgeBand: 'needs_assessment', conversationBand: 'needs_assessment',
      diagnosis: null, nowISO: NOW,
    });
    const quest = generateTodayQuest({
      profile: { ...profile, route }, route, reviewQuestionCount: 0, weakGrammarIds: [],
      dateKey: '2026-09-10', nowISO: NOW, daysToExam: null,
      availability: {
        nextGrammarIds: ['n2g-001'], nextUnitIds: [],
        conversationTargets: [{ refId: 'n2g-001', expression: 'x', themeJa: 't', themeZh: 't' }],
        grammarBundleByItem: new Map(), confirmTargetIds: [], vocabBattleTargetId: 'vocab-n2',
      } as never,
    });
    expect(quest.steps.some((s) => s.kind === 'conversation_mission')).toBe(false);
  });
});
