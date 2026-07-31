// RPG層の不変条件を機械固定するガードテスト（§21）。
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import {
  RPG_SANDBOX_KEY, loadAdventureState, startQuest,
  recordLearningResult, completeQuest, questRequirementKeys,
  deriveItemFog, deriveLocationFog, reviewNeededItems, resetAdventureState,
  advanceSimulatedTime, recordReviewResult, claimReviewReward,
} from './adventureState';
import { CHAPTER1_QUESTS, CHAPTER1_LOCATIONS, CHAPTER1_NPCS, CHAPTER1_STORY_BEATS, CHAPTER1_FINALE_STEPS } from './chapter1Data';
import { allVocabularyItems } from '../foundationVocabBank';
import type { KVStorage } from '../n2Recent';

const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

/** 触れたキーを全記録するmock storage（learner非接触の証明用） */
const trackingStorage = () => {
  const map = new Map<string, string>();
  const touched = new Set<string>();
  const s: KVStorage = {
    getItem: (k) => { touched.add(k); return map.get(k) ?? null; },
    setItem: (k, v) => { touched.add(k); map.set(k, v); },
  };
  return { s, touched, map };
};

/** Quest 1..n を順に学習充足→完了させるヘルパー */
const clearQuests = (upTo: number, storage: KVStorage) => {
  let st = loadAdventureState(NOW, storage);
  for (const q of CHAPTER1_QUESTS.filter(q => q.order <= upTo)) {
    st = startQuest(st, q.questId, NOW, storage);
    for (const id of questRequirementKeys(q.questId)) st = recordLearningResult(st, q.questId, id, true, NOW, storage);
    st = completeQuest(st, q.questId, NOW, q.isChapterFinale, storage);
  }
  return st;
};

describe('Chapter 1 data contract', () => {
  it('learningItemIdsは全件実在の教材ID（存在しないIDの創作なし）', () => {
    const real = new Set(allVocabularyItems().map(i => i.id));
    for (const q of CHAPTER1_QUESTS) {
      expect(q.learningItemIds.length).toBeGreaterThan(0);
      for (const id of q.learningItemIds) expect(real.has(id), `${q.questId}: ${id} が実在しない`).toBe(true);
    }
    for (const f of CHAPTER1_FINALE_STEPS) expect(real.has(f.usesItemId), `${f.stepId}`).toBe(true);
  });
  it('Quest 5件・order連番・章末は場面攻略・unlock先IDが実在する', () => {
    expect(CHAPTER1_QUESTS.length).toBe(5);
    expect(CHAPTER1_QUESTS.map(q => q.order)).toEqual([1, 2, 3, 4, 5]);
    expect(CHAPTER1_QUESTS.filter(q => q.isChapterFinale).map(q => q.order)).toEqual([5]);
    expect(CHAPTER1_FINALE_STEPS.length).toBeGreaterThanOrEqual(4); // 10問テストではなく場面
    const locs = new Set(CHAPTER1_LOCATIONS.map(l => l.locationId));
    const npcs = new Set(CHAPTER1_NPCS.map(n => n.npcId));
    const beats = new Set(CHAPTER1_STORY_BEATS.map(b => b.beatId));
    for (const q of CHAPTER1_QUESTS) {
      expect(locs.has(q.siteLocationId), `${q.questId}: 舞台${q.siteLocationId}が実在しない`).toBe(true);
      q.unlocks.locationIds.forEach(id => expect(locs.has(id), id).toBe(true));
      q.unlocks.npcIds.forEach(id => expect(npcs.has(id), id).toBe(true));
      q.unlocks.storyBeatIds.forEach(id => expect(beats.has(id), id).toBe(true));
      // RPG用語で学習内容を隠さない: 学習目的・分数・完了条件が必ずある
      expect(q.learnGoalJa.length).toBeGreaterThan(5);
      expect(q.estimatedMinutes).toBeGreaterThan(0);
      expect(q.completionConditionJa.length).toBeGreaterThan(5);
      expect(q.storyOutcomeJa.length).toBeGreaterThan(5); // 完了後に必ず物語上の変化
    }
  });
  it('章末場面会話は正解が選択肢に含まれ一意', () => {
    for (const f of CHAPTER1_FINALE_STEPS) {
      expect(f.optionsJa).toContain(f.correctJa);
      expect(new Set(f.optionsJa).size).toBe(f.optionsJa.length);
    }
  });
});

describe('RPG層のread-only・sandbox分離（§5・§13）', () => {
  const rpgDir = join(__dirname);
  const rpgSources = readdirSync(rpgDir).filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map(f => ({ f, text: readFileSync(join(rpgDir, f), 'utf8') }));
  it('rpg配下は学習エンジンのwriter・learnerストレージへ一切依存しない', () => {
    const forbidden = [
      'courseGrowth', 'courseEngine', 'persistence/', 'courseAdminApi', 'courseChatApi',
      'kawabado.aiCourse.v1.learner', 'kawabado.aiCourse.v1.progress',
      'kawabado.aiCourse.v1.pending', 'kawabado.aiCourse.v1.resume',
      'masteryState', 'current_week', 'supabase',
    ];
    for (const { f, text } of rpgSources) {
      for (const term of forbidden) {
        expect(text.includes(term), `${f} が「${term}」へ依存している`).toBe(false);
      }
    }
  });
  it('保存はsandbox専用キーのみ（learnerキー非接触）', () => {
    const { s, touched } = trackingStorage();
    clearQuests(5, s);
    expect([...touched]).toEqual([RPG_SANDBOX_KEY]);
  });
});

describe('Quest進行の不変条件（§7・§21）', () => {
  it('学習未完了のQuestは完了できない（Story Skipで学習完了しない）', () => {
    const { s } = trackingStorage();
    let st = loadAdventureState(NOW, s);
    st = startQuest(st, 'c1q1-meet-shoko', NOW, s);
    const before = st;
    st = completeQuest(st, 'c1q1-meet-shoko', NOW, false, s);
    expect(st).toBe(before); // 状態不変
    expect(st.chapter.completedQuestIds).toEqual([]);
    expect(st.adventureXp).toBe(0);
  });
  it('未解放Questは開始できない・順に解放される', () => {
    const { s } = trackingStorage();
    let st = loadAdventureState(NOW, s);
    expect(st.chapter.unlockedQuestIds).toEqual(['c1q1-meet-shoko']);
    const before = st;
    st = startQuest(st, 'c1q3-greet-town', NOW, s);
    expect(st).toBe(before);
    st = clearQuests(1, s);
    expect(st.chapter.unlockedQuestIds).toContain('c1q2-tell-name');
  });
  it('XPは冪等（再completeQuest・reloadで二重加算しない）', () => {
    const { s } = trackingStorage();
    let st = clearQuests(2, s);
    const xp = st.adventureXp;
    expect(xp).toBe(20 + 20);
    st = completeQuest(st, 'c1q1-meet-shoko', NOW + 1000, false, s); // 再実行
    expect(st.adventureXp).toBe(xp);
    const reloaded = loadAdventureState(NOW + 2000, s); // reload
    expect(reloaded.adventureXp).toBe(xp);
    const again = completeQuest(reloaded, 'c1q2-tell-name', NOW + 3000, false, s);
    expect(again.adventureXp).toBe(xp);
  });
  it('章末Questは場面会話成立なしでは完了しない', () => {
    const { s } = trackingStorage();
    let st = clearQuests(4, s);
    st = startQuest(st, 'c1q5-station-talk', NOW, s);
    for (const id of ['fi-kuru', 'fi-gakkou']) st = recordLearningResult(st, 'c1q5-station-talk', id, true, NOW, s);
    const blocked = completeQuest(st, 'c1q5-station-talk', NOW, false, s);
    expect(blocked.chapter.completedQuestIds).not.toContain('c1q5-station-talk');
    const done = completeQuest(st, 'c1q5-station-talk', NOW, true, s);
    expect(done.chapter.completedQuestIds).toContain('c1q5-station-talk');
    expect(done.chapter.completedAtMs).toBe(NOW); // Chapter完了
  });
  it('reloadで進行が保持される（resume）', () => {
    const { s } = trackingStorage();
    clearQuests(3, s);
    const st = loadAdventureState(NOW + DAY, s);
    expect(st.chapter.completedQuestIds).toEqual(
      ['c1q1-meet-shoko', 'c1q2-tell-name', 'c1q3-greet-town']);
    expect(st.chapter.discoveredLocationIds).toContain('c1-plaza');
    expect(st.chapter.encounteredNpcIds).toContain('c1-npc-hana');
  });
});

describe('FogとUnlockの分離（§6）', () => {
  it('Fogは時間経過で濃くなるが、Unlock・完了・出会いは失われない', () => {
    const { s } = trackingStorage();
    clearQuests(3, s);
    const later = NOW + 12 * DAY;
    const st = loadAdventureState(later, s);
    // Fogはreview_neededまで濃くなる
    expect(deriveItemFog(st, 'fi-genki', later)).toBe('review_needed');
    expect(deriveLocationFog(st, 'c1-main-street', later)).toBe('review_needed');
    // しかしUnlock・完了・出会いは維持（再ロックなし）
    expect(st.chapter.completedQuestIds).toContain('c1q3-greet-town');
    expect(st.chapter.discoveredLocationIds).toContain('c1-main-street');
    expect(st.chapter.encounteredNpcIds).toContain('c1-npc-hana');
    expect(st.chapter.unlockedQuestIds).toContain('c1q4-ask-time-place');
    // 復習候補として提示される（罰ではなく再会）
    expect(reviewNeededItems(st, later)).toContain('fi-genki');
  });
  it('Fog段階が鮮度から導出される（保存値ではない）', () => {
    const { s } = trackingStorage();
    const st = clearQuests(1, s);
    expect(deriveItemFog(st, 'fi-sensei', NOW + 1 * DAY)).toBe('clear');
    expect(deriveItemFog(st, 'fi-sensei', NOW + 3 * DAY)).toBe('light_fog');
    expect(deriveItemFog(st, 'fi-sensei', NOW + 7 * DAY)).toBe('foggy');
    expect(deriveItemFog(st, 'fi-sensei', NOW + 30 * DAY)).toBe('review_needed');
    expect(deriveItemFog(st, 'fi-eki', NOW)).toBe('foggy'); // 未学習
  });
  it('リセットはlabPreview用sandboxのみを初期化する', () => {
    const { s, touched } = trackingStorage();
    clearQuests(5, s);
    const st = resetAdventureState(NOW, s);
    expect(st.adventureXp).toBe(0);
    expect([...touched]).toEqual([RPG_SANDBOX_KEY]);
  });
});

describe('文法ミッション要件（§10）', () => {
  it('Quest2/4は語彙だけでは完了できない（rule要件が必須）', () => {
    const { s } = trackingStorage();
    let st = clearQuests(1, s);
    st = startQuest(st, 'c1q2-tell-name', NOW, s);
    for (const id of ['fi-namae', 'fi-hanasu']) st = recordLearningResult(st, 'c1q2-tell-name', id, true, NOW, s);
    const blocked = completeQuest(st, 'c1q2-tell-name', NOW, false, s);
    expect(blocked.chapter.completedQuestIds).not.toContain('c1q2-tell-name');
    st = recordLearningResult(st, 'c1q2-tell-name', 'rule:fr-desu', true, NOW, s);
    const done = completeQuest(st, 'c1q2-tell-name', NOW, false, s);
    expect(done.chapter.completedQuestIds).toContain('c1q2-tell-name');
  });
  it('要件キーは実在rule（fr-desu/fr-ni-e-destination/fr-time-reading）を含む', () => {
    expect(questRequirementKeys('c1q2-tell-name')).toContain('rule:fr-desu');
    const q4 = questRequirementKeys('c1q4-ask-time-place');
    expect(q4).toContain('rule:fr-ni-e-destination');
    expect(q4).toContain('rule:fr-time-reading');
  });
});

describe('復習「再会」（§11）', () => {
  it('時間シミュレーションで期限が発生→再確認でClarityが晴れる→XPは1日1回', () => {
    const { s } = trackingStorage();
    let st = clearQuests(2, s);
    // 12日進める（review_needed発生）。Unlock・完了は不変
    st = advanceSimulatedTime(st, 12, s);
    const simNow = NOW + 12 * DAY;
    expect(reviewNeededItems(st, simNow).length).toBeGreaterThan(0);
    expect(st.chapter.completedQuestIds).toContain('c1q2-tell-name');
    // 別文脈の再確認正解→lastCorrectAtMs更新→clear
    expect(deriveItemFog(st, 'fi-namae', simNow)).toBe('review_needed');
    st = recordReviewResult(st, 'fi-namae', true, simNow, s);
    expect(deriveItemFog(st, 'fi-namae', simNow)).toBe('clear');
    // rule要件も復習対象になり、再確認できる
    expect(deriveItemFog(st, 'rule:fr-desu', simNow)).toBe('review_needed');
    st = recordReviewResult(st, 'rule:fr-desu', true, simNow, s);
    expect(deriveItemFog(st, 'rule:fr-desu', simNow)).toBe('clear');
    // 報酬は冪等（同日2回目は加算なし）
    const xp0 = st.adventureXp;
    st = claimReviewReward(st, 15, simNow, s);
    expect(st.adventureXp).toBe(xp0 + 15);
    st = claimReviewReward(st, 15, simNow + 1000, s);
    expect(st.adventureXp).toBe(xp0 + 15);
  });
  it('学習履歴のない語はrecordReviewResultで作られない（復習対象外）', () => {
    const { s } = trackingStorage();
    const st = loadAdventureState(NOW, s);
    const after = recordReviewResult(st, 'fi-eki', true, NOW, s);
    expect(after.learning['fi-eki']).toBeUndefined();
  });
});

describe('Adventure XPとJapanese Masteryの分離（§7）', () => {
  it('XP報酬はQuest定義に固定され、学習正答数を増やしてもXPは増えない', () => {
    const { s } = trackingStorage();
    let st = clearQuests(1, s);
    const xp = st.adventureXp;
    // 同じItemを何度正解してもXPは変わらない（周回で無制限XPなし）
    for (let i = 0; i < 20; i++) st = recordLearningResult(st, 'c1q1-meet-shoko', 'fi-sensei', true, NOW + i, s);
    expect(st.adventureXp).toBe(xp);
    // 学習記録は増える（mastery系はsandbox内でのみ）
    expect(st.learning['fi-sensei'].correctCount).toBeGreaterThan(20 - 1);
  });
});
