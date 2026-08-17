// V2の「復習」の作り替え（2026-08-18）の受入テスト。
//
// 【なぜ作り替えたか（監査P0・8件の根っこ）】
// 旧実装は「復習 N件」の N を旧コースの会話ミッションの復習期限（DBのItemProgress）から数え、
// 押した先は**別データ**（sessionStorageの語彙図鑑）を開いていた。両者をつなぐコードは無い。
// V2の生徒には語彙図鑑へ書き込む導線が無いので中身は必ず0件になり、
// しかもその数字は減らないので復習stepは**永久に完了しなかった**。
//
// 【新しい約束】
//   ・復習＝間違えた問題ノートの未克服のうち、**実際に出題できるもの**
//   ・表示する「N問」と、押したときに出る問題数が**必ず一致**する
//   ・終われば必ずstepが完了する（自己申告ボタンが要らない）
import { describe, it, expect } from 'vitest';
import { generateTodayQuest } from './advQuest';
import { defaultAdvProfile } from './advProfile';
import { buildMistakeNotebook, pickMistakeReviewKeys } from './advMistakeNotebook';
import { recordAttempt } from './advMastery';
import type { AdvMasteryAttempt, AdvRoute, AdvRouteStage } from './advTypes';

const NOW = '2026-08-18T09:00:00.000Z';

const stage = (kind: AdvRouteStage['kind']): AdvRouteStage => ({
  stageId: 'stg', kind, areaId: 'area', titleJa: 's', titleZh: 's',
  purposeJa: '', purposeZh: '', targets: { n3UnitIds: ['u1'] },
  clearConditionJa: '', clearConditionZh: '',
});
const route: AdvRoute = {
  generatedAt: NOW, destinationJlpt: 'N3', destinationAreaId: 'd',
  destinationLabelJa: 'N3', destinationLabelZh: 'N3', explanationJa: '', explanationZh: '',
  stages: [stage('n3_practice')],
};

const questWith = (reviewQuestionCount: number) => generateTodayQuest({
  profile: { ...defaultAdvProfile(NOW), enabled: true, goalType: 'jlpt', targetJlpt: 'N3', dailyMinutes: 15 },
  route, reviewQuestionCount, weakGrammarIds: [], dateKey: '2026-08-18', nowISO: NOW,
  availability: { nextGrammarIds: [], nextUnitIds: ['u1'], conversationTargets: [] },
  daysToExam: null, masteredStageIds: new Set(),
});

describe('復習stepの出方', () => {
  it('**間違えた問題が無い日は復習stepを出さない**（空の画面へ送らない）', () => {
    const q = questWith(0);
    expect(q.steps.some((s) => s.kind === 'review_due')).toBe(false);
  });

  it('見出しは「件」ではなく**問**で、渡した数がそのまま出る', () => {
    const q = questWith(5);
    const r = q.steps.find((s) => s.kind === 'review_due');
    expect(r?.titleJa).toBe('復習 5問');
    expect(r?.titleZh).toBe('复习 5题');
  });

  it('復習は先頭に置く（忘れる前にやる）', () => {
    expect(questWith(3).steps[0].kind).toBe('review_due');
  });
});

describe('表示する数と実際に出る数が一致する', () => {
  it('ノートから取る件数の上限は、バトル1回の問題数と同じ', async () => {
    // 誤答を20問ぶん作る
    let ledger = {};
    const wrongKeys = Array.from({ length: 20 }, (_, i) => `rec:item-${i}`);
    const attempt: AdvMasteryAttempt = {
      dateKey: '2026-08-17', scorePct: 0, unseenRatio: 1,
      questionKeys: wrongKeys, tier: 'normal', timed: false,
      completedAt: '2026-08-17T09:00:00.000Z', wrongKeys,
    };
    ledger = recordAttempt(ledger, 't1', attempt);
    const nb = buildMistakeNotebook(ledger, NOW);
    expect(nb.entries.length).toBe(20);

    // AdvShell と同じ上限（7＝normalバトルの問題数）で取る
    const picked = pickMistakeReviewKeys(nb, 7);
    expect(picked.length).toBe(7);

    // その数がそのまま見出しになる
    expect(questWith(picked.length).steps[0].titleJa).toBe('復習 7問');
  });

  it('AdvShell が使う上限と、错题本の解き直しの上限が同じ定数から来ている', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../../../../components/ai-course/adventure/AdvShell.tsx', import.meta.url), 'utf8');
    // 「10問」と書いて7問しか出ない、という食い違いを二度と作らない
    expect(src).toMatch(/const REVIEW_BATTLE_SIZE = 7;/);
    const calls = src.match(/pickMistakeReviewKeys\([^)]*\)/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(2);
    for (const c of calls) expect(c, c).toMatch(/REVIEW_BATTLE_SIZE/);
  });
});

describe('旧コースの復習へは二度と繋がない', () => {
  it('AdvShell に「reviewsDueが0になったら完了」の永久に成立しない条件が残っていない', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../../../../components/ai-course/adventure/AdvShell.tsx', import.meta.url), 'utf8');
    expect(src).not.toMatch(/props\.reviewsDue > 0\) return;/);
    // 自己申告ボタン（やっていないことを終わったことにする口）も消えている
    expect(src).not.toMatch(/復習は終わった（次へ進む）/);
  });

  it('復習stepは錯題本バトルを開く（旧コースの語彙図鑑を開かない）', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../../../../components/ai-course/adventure/AdvShell.tsx', import.meta.url), 'utf8');
    const branch = /if \(s\.kind === 'review_due'\) \{[\s\S]{0,900}?\n {4}\}/.exec(src);
    expect(branch, 'review_due の分岐が見つからない').toBeTruthy();
    expect(branch![0]).toMatch(/MISTAKE_TARGET_ID/);
    expect(branch![0]).toMatch(/fromStepIdx: i/);      // 終われば必ずこのstepが完了する
    expect(branch![0]).not.toMatch(/onOpenReview/);    // 旧コースへ渡さない
  });
});
