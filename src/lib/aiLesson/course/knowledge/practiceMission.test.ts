/*
 * 文法の practice → AI会話ミッション（2026-09-10 Phase 6）。
 *
 * 守りたいこと:
 *   ・既存の会話 runtime が読める Mission の全項目が埋まる（空文字・壊れた正規表現を出さない）
 *   ・detect が期待する発話に当たり、無関係な発話に当たらない
 *   ・missionId に grammarId が入り、会話の結果を知識項目へ戻せる
 *   ・COURSE_MISSIONS（会話コースの90本）は変えない。登録は advconv-/bizconv- だけ
 */
import { describe, it, expect } from 'vitest';
import { practiceMissionFromGrammar, businessSceneMission, detectSourceFromKeys, sceneCardOf, type PracticeSource } from './practiceMission';
import { grammarIdOfMission } from './conversationKnowledge';
import { missionById, registerPracticeMissions, practiceMissionById } from '../courseEngine';
import { COURSE_MISSIONS } from '../courseData';
import { detectTargetUsage } from '../courseLesson';
import { N3_GRAMMAR_DRAFTS } from '../n3GrammarDrafts';

const src: PracticeSource = {
  grammarId: 'n3g-teoku', pattern: '〜ておく', level: 'N3',
  meaningJa: '前もって準備する', explanationZh: '事先做好准备',
  nuance: '準備・放置', examplesJa: ['会議の前に資料を読んでおきます。', '窓を開けておいてください。'],
  commonMistakesZh: '不要写成「ておきる」', matchKeys: ['ておく', 'ておき'],
  production: { promptJa: '明日の準備で、今日しておくことを言ってください。', promptZh: '请说说为了明天，今天先做的事。', expected: ['資料を読んでおきます'], acceptable: ['読んでおく'] },
  practice: { themeJa: '会議の準備', starterJa: '明日の会議、何か準備しておきますか。', starterZh: '明天的会议，要先准备什么吗？', targetUse: '準備' },
};

describe('practice → Mission', () => {
  const m = practiceMissionFromGrammar(src);

  it('全項目が埋まり、id に grammarId が入る', () => {
    expect(m.id).toBe('advconv-n3g-teoku');
    expect(grammarIdOfMission(m.id)).toBe('n3g-teoku');
    for (const [k, v] of Object.entries(m)) {
      if (typeof v === 'string') expect(v.length, k).toBeGreaterThan(0);
      if (Array.isArray(v) && k !== 'commonMistakes' && k !== 'requiredPreviousItems') expect(v.length, k).toBeGreaterThan(0);
    }
    expect(m.hintLevels).toHaveLength(6);
    expect(m.isPublished).toBe(true);
    expect(m.openingQuestion).toBe(src.practice.starterJa);
  });

  it('detect が期待する発話に当たり、無関係な発話に当たらない（既存の判定関数で）', () => {
    expect(() => new RegExp(m.detect)).not.toThrow();
    const self = detectTargetUsage([{ role: 'tutor', text: '何を準備しますか。' }, { role: 'student', text: '資料を読んでおきます。' }], m.detect);
    expect(self.usage).toBe('self');
    const none = detectTargetUsage([{ role: 'student', text: '今日は雨です。' }], m.detect);
    expect(none.usage).toBe('none');
    // お手本の直後は hint
    const hint = detectTargetUsage([{ role: 'tutor', text: '「読んでおきます」と言ってみて。' }, { role: 'student', text: '読んでおきます。' }], m.detect);
    expect(hint.usage).toBe('hint');
  });

  it('1文字・波線だけのキーは detect に入れない（何にでも当たる）', () => {
    // て形は音便で「で」になるので、両方を持つ（読んでおく）
    expect(detectSourceFromKeys(['〜', 'あ', 'ておく'])).toBe('ておく|でおく');
    expect(detectSourceFromKeys([])).toBe('(?!)');
    expect(new RegExp(detectSourceFromKeys([])).test('何でも')).toBe(false);
  });

  it('Business の場面 × 文法 → bizconv-<scene>:<grammarId>', () => {
    const b = businessSceneMission({ sceneId: 'biz-x', titleJa: '場面', titleZh: '场景', starterJa: '始めましょう。', starterZh: '开始吧。', grammarIds: ['n3g-teoku'] }, src);
    expect(b.id).toBe('bizconv-biz-x:n3g-teoku');
    expect(grammarIdOfMission(b.id)).toBe('n3g-teoku');
    expect(b.openingQuestion).toBe('始めましょう。');
    expect(sceneCardOf(b, 'business')).toEqual({ id: b.id, titleJa: '場面', titleZh: '场景', targetExpression: '〜ておく', group: 'business' });
  });
});

describe('登録と検索', () => {
  it('登録した practice ミッションを missionById が引ける。COURSE_MISSIONS は増えない', () => {
    const before = COURSE_MISSIONS.length;
    const m = practiceMissionFromGrammar(src);
    registerPracticeMissions([m, { ...m, id: 'w99m9' }]);
    expect(missionById('advconv-n3g-teoku')?.id).toBe('advconv-n3g-teoku');
    expect(practiceMissionById('w99m9')).toBeUndefined();   // advconv-/bizconv- 以外は登録しない
    expect(COURSE_MISSIONS.length).toBe(before);
    // 会話コース側の id が優先（同名衝突はしないが、順序を固定）
    expect(missionById('w03m1')?.week).toBe(3);
  });

  it('**本番の N3 文法 76 項目すべてから Mission が作れる**（practice が全項目にある）', () => {
    for (const d of N3_GRAMMAR_DRAFTS) {
      const m = practiceMissionFromGrammar(d as unknown as PracticeSource);
      expect(() => new RegExp(m.detect)).not.toThrow();
      expect(m.detect).not.toBe('(?!)');
      expect(m.openingQuestion.length).toBeGreaterThan(0);
    }
  });
});
