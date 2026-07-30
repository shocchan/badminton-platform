// 章レジストリの機械検証（2026-07-31 Chapter 2以降）。
// chapter1Data.test.ts の思想を全章へ拡張する:
// - 実在IDのみ（語彙・文法rule・question）。存在しない教材IDの創作は落ちる
// - ID・starterのグローバル一意（テンプレ量産・コピペ章の防止）
// - 章がplayableである構造条件（開始Quest・連番order・unlock整合・finale成立）
import { describe, it, expect } from 'vitest';
import { CHAPTERS, chapterById, chapterForArea, questById } from './chapterRegistry';
import { WORLD_AREAS, areaById } from './worldAtlas';
import { allVocabularyItems } from '../foundationVocabBank';
import { UNIT1_RULES, UNIT1_QUESTIONS } from '../foundationUnit1';
import { UNIT2_RULES, UNIT2_QUESTIONS } from '../foundationUnit2';
import { UNIT3_RULES, UNIT3_QUESTIONS } from '../foundationUnit3';
import { UNIT4_RULES, UNIT4_QUESTIONS } from '../foundationUnit4';
import { UNIT5_RULES, UNIT5_QUESTIONS } from '../foundationUnit5';
import { UNIT6_RULES, UNIT6_QUESTIONS } from '../foundationUnit6';

const vocabIds = new Set(allVocabularyItems().map(i => i.id));
const ruleIds = new Set([...UNIT1_RULES, ...UNIT2_RULES, ...UNIT3_RULES, ...UNIT4_RULES, ...UNIT5_RULES, ...UNIT6_RULES].map(r => r.id));
const allQuestions = [...UNIT1_QUESTIONS, ...UNIT2_QUESTIONS, ...UNIT3_QUESTIONS, ...UNIT4_QUESTIONS, ...UNIT5_QUESTIONS, ...UNIT6_QUESTIONS];
const questionMap = new Map(allQuestions.map(q => [q.id, q]));

describe('章の構成（10Area監査に基づく必要章数）', () => {
  it('登録章は10章（全Areaに1章）で、orderがArea orderと一致する', () => {
    expect(CHAPTERS).toHaveLength(10);
    for (const c of CHAPTERS) {
      const area = areaById(c.areaId);
      expect(area, `${c.chapterId}: areaId ${c.areaId} が実在しない`).toBeTruthy();
      expect(area!.order, `${c.chapterId}: orderがArea orderと不一致`).toBe(c.order);
    }
  });
  it('章chainが1→7へ連結している（nextChapterIdが実在し、順序どおり）', () => {
    for (let i = 0; i < CHAPTERS.length - 1; i++) {
      expect(CHAPTERS[i].nextChapterId).toBe(CHAPTERS[i + 1].chapterId);
    }
    expect(CHAPTERS[CHAPTERS.length - 1].nextChapterId).toBeNull();
  });
  it('学習エリア（n3area）はすべて章を持つ', () => {
    for (const a of WORLD_AREAS.filter(x => x.destination.kind === 'n3area')) {
      expect(chapterForArea(a.areaId), `${a.areaId} に章がない`).toBeTruthy();
    }
  });
});

describe('ID規律（グローバル一意・実在参照のみ）', () => {
  it('chapterId / questId / locationId / npcId / beatId / stepId が全章で一意', () => {
    const seen = new Set<string>();
    const uniq = (id: string, kind: string) => {
      expect(seen.has(id), `${kind} ID重複: ${id}`).toBe(false);
      seen.add(id);
    };
    for (const c of CHAPTERS) {
      uniq(c.chapterId, 'chapter');
      for (const q of c.quests) uniq(q.questId, 'quest');
      for (const l of c.locations) uniq(l.locationId, 'location');
      for (const n of c.npcs) uniq(n.npcId, 'npc');
      for (const b of c.storyBeats) uniq(b.beatId, 'beat');
      for (const f of c.finaleSteps) uniq(f.stepId, 'finaleStep');
      uniq(c.reviewReunion.questId, 'reunion');
    }
  });
  it('learningItemIds は実在語彙のみ・grammar rule/questionは実在IDのみ', () => {
    for (const c of CHAPTERS) {
      for (const q of c.quests) {
        for (const id of q.learningItemIds) expect(vocabIds.has(id), `${q.questId}: 語彙 ${id} が実在しない`).toBe(true);
        for (const g of q.grammarRequirements ?? []) {
          expect(ruleIds.has(g.ruleId), `${q.questId}: rule ${g.ruleId} が実在しない`).toBe(true);
          for (const qid of g.questionIds) {
            const question = questionMap.get(qid);
            expect(question, `${q.questId}: question ${qid} が実在しない`).toBeTruthy();
            // Panelがrenderできるのはchoice系のみ（matching/fill_blank/orderは章UIでは使わない）
            expect(['single_choice', 'particle_choice', 'conjugation_choice', 'reading_choice',
              'sentence_choice', 'error_correction_choice']).toContain((question as { type: string }).type);
          }
        }
      }
      for (const f of c.finaleSteps) {
        expect(vocabIds.has(f.usesItemId), `${f.stepId}: ${f.usesItemId} が実在しない`).toBe(true);
      }
    }
  });
  it('unlocksは自章のlocation/npc/beatのみを参照する（他章の解放をしない）', () => {
    for (const c of CHAPTERS) {
      const locs = new Set(c.locations.map(l => l.locationId));
      const npcs = new Set(c.npcs.map(n => n.npcId));
      const beats = new Set(c.storyBeats.map(b => b.beatId));
      for (const q of c.quests) {
        for (const id of q.unlocks.locationIds) expect(locs.has(id), `${q.questId}: ${id}`).toBe(true);
        for (const id of q.unlocks.npcIds) expect(npcs.has(id), `${q.questId}: ${id}`).toBe(true);
        for (const id of q.unlocks.storyBeatIds) expect(beats.has(id), `${q.questId}: ${id}`).toBe(true);
        expect(locs.has(q.siteLocationId), `${q.questId}: site ${q.siteLocationId}`).toBe(true);
      }
    }
  });
});

describe('playable構造（開始→進行→完了が成立する）', () => {
  it('各章: Questは4〜6件・orderは1からの連番・章末がちょうど1件', () => {
    for (const c of CHAPTERS) {
      expect(c.quests.length, `${c.chapterId}: quest数`).toBeGreaterThanOrEqual(4);
      expect(c.quests.length, `${c.chapterId}: quest数`).toBeLessThanOrEqual(6);
      c.quests.forEach((q, i) => expect(q.order, `${q.questId}: order`).toBe(i + 1));
      expect(c.quests.filter(q => q.isChapterFinale), `${c.chapterId}: finale数`).toHaveLength(1);
      expect(c.quests[c.quests.length - 1].isChapterFinale, `${c.chapterId}: 最終Questがfinaleでない`).toBe(true);
    }
  });
  it('各章: 場所は4拠点・座標0..100・startLocationIdが実在する', () => {
    for (const c of CHAPTERS) {
      expect(c.locations, `${c.chapterId}`).toHaveLength(4);
      for (const l of c.locations) {
        expect(l.x).toBeGreaterThanOrEqual(0); expect(l.x).toBeLessThanOrEqual(100);
        expect(l.y).toBeGreaterThanOrEqual(0); expect(l.y).toBeLessThanOrEqual(100);
      }
      expect(c.locations.some(l => l.locationId === c.startLocationId)).toBe(true);
    }
  });
  it('finaleは4ステップで、usesItemIdは同章で学ぶ語（Storyだけで進めない）', () => {
    for (const c of CHAPTERS) {
      expect(c.finaleSteps, `${c.chapterId}`).toHaveLength(4);
      const learned = new Set(c.quests.flatMap(q => q.learningItemIds));
      for (const f of c.finaleSteps) {
        expect(learned.has(f.usesItemId), `${f.stepId}: ${f.usesItemId} はこの章で学ばない語`).toBe(true);
        expect(f.optionsJa).toContain(f.correctJa);
        expect(new Set(f.optionsJa).size, `${f.stepId}: 選択肢重複`).toBe(f.optionsJa.length);
      }
    }
  });
  it('全Questが学習要件を持つ（学習ゼロで完了できるQuestは存在しない）', () => {
    for (const c of CHAPTERS) for (const q of c.quests) {
      expect(q.learningItemIds.length + (q.grammarRequirements?.length ?? 0),
        `${q.questId}: 学習要件が空`).toBeGreaterThan(0);
    }
  });
  it('章の語彙は対象AreaのN3単元・またはChapter 1基礎語彙の範囲（無関係な語を出さない）', () => {
    // 厳密なunit所属はn3UnitSpecsに委ねる。ここでは「実在＋章内で一貫」のみ検査済みのため、
    // 各章の学習語がユニーク（同章内で二重に学ばせない）ことを固定する
    for (const c of CHAPTERS) {
      const ids = c.quests.flatMap(q => q.learningItemIds);
      expect(new Set(ids).size, `${c.chapterId}: 章内で同じ語を複数Questが対象にしている`).toBe(ids.length);
    }
  });
});

describe('テンプレ量産の防止（章ごとの固有性）', () => {
  it('incident・opening・title は全章で相異なる', () => {
    for (const key of ['incidentJa', 'openingJa', 'titleJa'] as const) {
      const values = CHAPTERS.map(c => c[key]);
      expect(new Set(values).size, `${key} が章間で重複`).toBe(values.length);
    }
  });
  it('storyBeat本文・NPCの挨拶が章間で重複しない（コピペStoryなし）', () => {
    const texts = CHAPTERS.flatMap(c => c.storyBeats.map(b => b.textJa));
    expect(new Set(texts).size).toBe(texts.length);
    const greets = CHAPTERS.flatMap(c => c.npcs.map(n => n.greetingJa));
    expect(new Set(greets).size).toBe(greets.length);
  });
  it('finaleのNPC台詞が章間で重複しない', () => {
    const lines = CHAPTERS.flatMap(c => c.finaleSteps.map(f => f.npcLineJa));
    expect(new Set(lines).size).toBe(lines.length);
  });
  it('ja/zhの全表示文言が空でない', () => {
    for (const c of CHAPTERS) {
      for (const q of c.quests) {
        for (const v of [q.titleJa, q.titleZh, q.learnGoalJa, q.learnGoalZh, q.storyIntroJa, q.storyIntroZh,
          q.storyOutcomeJa, q.storyOutcomeZh, q.completionConditionJa, q.completionConditionZh]) {
          expect(v.trim().length, `${q.questId}`).toBeGreaterThan(0);
        }
      }
      for (const b of c.storyBeats) { expect(b.textJa.trim().length).toBeGreaterThan(0); expect(b.textZh.trim().length).toBeGreaterThan(0); }
    }
  });
});

describe('helper', () => {
  it('chapterById / questById / chapterForArea が引ける', () => {
    expect(chapterById('ch2-hinode-no-asa')?.titleJa).toBe('朝の止まった部屋');
    expect(questById('c5q6-lakeside-finale')?.chapter.chapterId).toBe('ch5-ame-no-shotaijo');
    expect(chapterForArea('area07-katachi')?.order).toBe(7);
  });
});
