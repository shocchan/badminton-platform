// ミニ模試の進行状態（COMPLETION §9）。純関数＋直列化可能な状態にして reload 復帰できるようにする。
import type { AdvBattleQuestion } from './advVariants';
import type { MockSection, MockSpec } from './advMock';
import { presentBattle, isCorrectAnswer, type PresentedQuestion } from './advChoiceOrder';
import type { ExamSkill } from './advExamSkills';
import type { AdvMockLogEntry, AdvMockSessionState } from './advTypes';

/** 保存する最小状態（profile.mockSession へ入れる。正準は advTypes 側） */
export type MockSessionState = AdvMockSessionState;

export interface MockSectionRuntime {
  section: MockSection;
  questions: AdvBattleQuestion[];
  presented: PresentedQuestion[];
}

export interface MockRuntime {
  spec: MockSpec;
  sections: MockSectionRuntime[];
  state: MockSessionState;
}

/** 短時間版と本番時間版の倍率（§9） */
export const MOCK_MODE_LABEL: Record<'short' | 'fullTime', { ja: string; zh: string; note: { ja: string; zh: string } }> = {
  short: {
    ja: '短時間版', zh: '短时版',
    note: {
      ja: '本番より短い時間・少ない問題数です。時間配分の練習用です。',
      zh: '时间和题量都比真实考试少，用于练习时间分配。',
    },
  },
  fullTime: {
    ja: '本番時間版', zh: '真实时长版',
    note: {
      ja: '本番と同じ制限時間で行います。問題数は本番より少ないミニ版です。',
      zh: '采用与真实考试相同的限时。题量仍少于真实考试，是迷你版。',
    },
  },
};

/** 本番の科目時間（分）。fullTime版で使う */
const FULL_TIME_SEC: Record<'N2' | 'N3', Record<string, number>> = {
  N2: { languageKnowledge: 105 * 60, reading: 105 * 60, listening: 50 * 60 },
  N3: { languageKnowledge: 30 * 60, reading: 70 * 60, listening: 40 * 60 },
};

export const sectionTimeLimit = (
  section: MockSection, level: 'N2' | 'N3', mode: 'short' | 'fullTime',
): number => (mode === 'short'
  ? section.timeLimitSec
  : (FULL_TIME_SEC[level][section.sectionId] ?? section.timeLimitSec));

/** 決定的な擬似乱数（seedのみに依存。vocabQuestions.ts と同方式） */
const rng = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
};

const seededShuffle = <T>(items: T[], seed: number): T[] => {
  const arr = [...items];
  const r = rng(seed);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

/**
 * 言語知識の語彙は観点を巡回して選ぶ（N3本試験の文字・語彙構成に寄せる:
 * 漢字読み→文脈規定→表記→言い換え近似→用法）。meaning（中国語訳選び）は
 * JLPTに無い形式なので、他観点で足りる限り模試には出さない。
 */
const VOCAB_ASPECT_PLAN = ['vocab-reading', 'vocab-context', 'vocab-orthography', 'vocab-confusable', 'vocab-usage'];

/**
 * 言語知識セクションの層化選択。
 * 旧実装（プールを平坦化して連番カーソルで拾う）は、同一語の観点違い問題が
 * プール内で隣接しているため「同じ語を読み・表記・例文…で連打」する出題になり、
 * さらにプールの9割超を占める基礎語（N5/N4）ばかりが出ていた（CEO指摘 2026-08-14）。
 * ここでは ①語彙5:文法5 ②同一語（sourceItemId）は1問まで ③観点を巡回
 * ④受験バンド優先（3問に1問だけ基礎を混ぜて復習を残す）で選ぶ。
 * attemptSeed のみに依存する決定的選択なので restoreMockSession はそのまま成立する。
 */
const pickLanguageKnowledge = (
  pool: AdvBattleQuestion[], count: number, level: 'N2' | 'N3', seed: number,
): AdvBattleQuestion[] => {
  const bands: AdvBattleQuestion['level'][] = level === 'N2' ? ['n2', 'n3', 'foundation'] : ['n3', 'foundation'];
  // プールのMap挿入順に依存しないよう key で正規化してから決定的にシャッフル
  const shuffled = seededShuffle(
    [...pool].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)), seed,
  );
  const vocabAll = shuffled.filter((q) => q.skill === 'charactersVocabulary');
  const grammar = shuffled.filter((q) => q.skill === 'grammar');
  const vocabNoMeaning = vocabAll.filter((q) => q.type !== 'vocab-meaning');

  const usedKeys = new Set<string>();
  const usedItems = new Set<string>();
  const take = (cands: AdvBattleQuestion[], pred: (q: AdvBattleQuestion) => boolean): AdvBattleQuestion | null => {
    for (const q of cands) {
      if (usedKeys.has(q.key) || usedItems.has(q.sourceItemId) || !pred(q)) continue;
      usedKeys.add(q.key);
      usedItems.add(q.sourceItemId);
      return q;
    }
    return null;
  };
  // バンド優先つきで1問選ぶ。3問に1問は基礎側から（復習を完全には切らない）
  const takeBanded = (cands: AdvBattleQuestion[], slot: number, aspect: string | null): AdvBattleQuestion | null => {
    const order = slot % 3 === 2 ? [...bands].reverse() : bands;
    for (const band of order) {
      const q = take(cands, (x) => x.level === band && (aspect === null || x.type === aspect));
      if (q) return q;
    }
    return aspect === null ? null : takeBanded(cands, slot, null);
  };

  const total = Math.min(count, pool.length);
  const grammarQuota = Math.min(Math.floor(total / 2), grammar.length);
  const picked: AdvBattleQuestion[] = [];
  const vocabCands = vocabNoMeaning.length >= total - grammarQuota ? vocabNoMeaning : vocabAll;
  for (let i = 0; picked.length < total - grammarQuota && i < total * 2; i++) {
    const q = takeBanded(vocabCands, i, VOCAB_ASPECT_PLAN[i % VOCAB_ASPECT_PLAN.length]);
    if (!q) break;
    picked.push(q);
  }
  for (let i = 0; picked.length < total && i < total * 2; i++) {
    const q = takeBanded(grammar, i, null);
    if (!q) break;
    picked.push(q);
  }
  // 端数の補充。同一語1問の縛りだけではプールが小さくて埋まらない場合は縛りを緩める
  for (const q of shuffled) {
    if (picked.length >= total) break;
    if (usedKeys.has(q.key) || usedItems.has(q.sourceItemId)) continue;
    usedKeys.add(q.key);
    usedItems.add(q.sourceItemId);
    picked.push(q);
  }
  for (const q of shuffled) {
    if (picked.length >= total) break;
    if (usedKeys.has(q.key)) continue;
    usedKeys.add(q.key);
    picked.push(q);
  }
  return picked;
};

/** 新しい模試セッションを開始する */
export const startMockSession = (
  spec: MockSpec, pools: Map<string, AdvBattleQuestion[]>, mode: 'short' | 'fullTime',
  attemptSeed: number, nowISO: string,
): MockRuntime | null => {
  if (spec.sections.length === 0) return null;
  const sections: MockSectionRuntime[] = [];
  for (const section of spec.sections) {
    // このsectionの技能に合う問題を集める
    const pool: AdvBattleQuestion[] = [];
    for (const qs of pools.values()) {
      for (const q of qs) if (section.skills.includes(q.skill)) pool.push(q);
    }
    if (pool.length === 0) continue;
    let picked: AdvBattleQuestion[];
    if (section.sectionId === 'languageKnowledge') {
      // 語彙・文法は層化選択（観点・バンド・同一語1問）
      picked = pickLanguageKnowledge(pool, section.questionCount, spec.level, attemptSeed);
    } else {
      // 読解・聴解は従来どおり（本文グループの並びを壊さない）。seedで決定的
      picked = [];
      const seen = new Set<string>();
      let cursor = attemptSeed % Math.max(1, pool.length);
      while (picked.length < Math.min(section.questionCount, pool.length)) {
        const q = pool[cursor % pool.length];
        cursor += 1;
        if (seen.has(q.key)) continue;
        seen.add(q.key);
        picked.push(q);
      }
    }
    sections.push({ section, questions: picked, presented: presentBattle(picked, attemptSeed + sections.length) });
  }
  if (sections.length === 0) return null;
  return {
    spec, sections,
    state: {
      mockId: `mock-${spec.level}-${mode}-${attemptSeed}`,
      level: spec.level, mode, attemptSeed, startedAt: nowISO,
      sectionIndex: 0,
      remainingSecBySection: sections.map((s) => sectionTimeLimit(s.section, spec.level, mode)),
      answers: {},
      completedSections: [],
      finishedAt: null,
    },
  };
};

/** 保存状態から復元（問題は同じseedで決定的に再構成される） */
export const restoreMockSession = (
  spec: MockSpec, pools: Map<string, AdvBattleQuestion[]>, state: MockSessionState,
): MockRuntime | null => {
  const fresh = startMockSession(spec, pools, state.mode, state.attemptSeed, state.startedAt);
  if (!fresh) return null;
  // 保存時と問題プールが変わっていると、保存stateが再構成した問題と噛み合わない
  // （sectionが減った・答えた問題が消えた等）。壊れた復元で答えを別問題に
  // 付け替えるより、復元失敗として扱い新規に始めさせる方が安全
  if (state.remainingSecBySection.length !== fresh.sections.length) return null;
  if (state.sectionIndex < 0 || state.sectionIndex > fresh.sections.length) return null;
  const keys = new Set<string>();
  for (const sec of fresh.sections) for (const q of sec.questions) keys.add(q.key);
  for (const k of Object.keys(state.answers)) if (!keys.has(k)) return null;
  return { ...fresh, state };
};

export interface SectionResult {
  sectionId: string;
  labelJa: string;
  labelZh: string;
  correct: number;
  total: number;
  unanswered: number;
  elapsedSec: number;
  finishedInTime: boolean;
  bySkill: Record<string, { correct: number; total: number; unseen: number }>;
  /**
   * このsectionで間違えた（未回答を含む）問題キー。错题本の材料。
   * **全問正解でも空配列**（配列が在ること自体が「正誤を記録した」印・advMistakeNotebook.ts）
   */
  wrongKeys: string[];
}

export const gradeSection = (
  rt: MockRuntime, sectionIdx: number, seenKeysAtStart: Set<string>,
): SectionResult => {
  const sec = rt.sections[sectionIdx];
  const limit = sectionTimeLimit(sec.section, rt.state.level, rt.state.mode);
  const remaining = rt.state.remainingSecBySection[sectionIdx] ?? 0;
  let correct = 0; let unanswered = 0;
  const bySkill: SectionResult['bySkill'] = {};
  const wrongKeys: string[] = [];
  for (const q of sec.questions) {
    const p = sec.presented.find((x) => x.key === q.key);
    const picked = rt.state.answers[q.key] ?? null;
    if (picked === null) unanswered += 1;
    const ok = p ? isCorrectAnswer(p, picked) : false;
    if (ok) correct += 1;
    else wrongKeys.push(q.key);
    const row = bySkill[q.skill] ?? { correct: 0, total: 0, unseen: 0 };
    row.total += 1;
    if (ok) row.correct += 1;
    if (!seenKeysAtStart.has(q.key)) row.unseen += 1;
    bySkill[q.skill] = row;
  }
  return {
    sectionId: sec.section.sectionId,
    labelJa: sec.section.labelJa, labelZh: sec.section.labelZh,
    correct, total: sec.questions.length, unanswered,
    elapsedSec: Math.max(0, limit - remaining),
    finishedInTime: remaining > 0,
    bySkill,
    wrongKeys,
  };
};

export interface MockResult {
  mockId: string;
  level: 'N2' | 'N3';
  mode: 'short' | 'fullTime';
  sections: SectionResult[];
  totalCorrect: number;
  totalQuestions: number;
  totalUnanswered: number;
  /** 全section合算の技能別 */
  bySkill: Record<string, { correct: number; total: number; unseen: number }>;
  skills: ExamSkill[];
  allQuestionKeys: string[];
  /**
   * 全section合算の誤答キー（未回答も誤答）。**全問正解でも空配列**。
   * これを台帳のattemptへ入れないと、模試を1回受けるだけで
   * 「正誤を記録していない試行」とみなされ、错题本の未克服が全部「未確認」へ落ちる。
   */
  wrongKeys: string[];
  unseenRatio: number;
}

export const gradeMock = (rt: MockRuntime, seenKeysAtStart: Set<string>): MockResult => {
  const sections = rt.sections.map((_, i) => gradeSection(rt, i, seenKeysAtStart));
  const bySkill: MockResult['bySkill'] = {};
  for (const s of sections) {
    for (const [skill, row] of Object.entries(s.bySkill)) {
      const cur = bySkill[skill] ?? { correct: 0, total: 0, unseen: 0 };
      cur.correct += row.correct; cur.total += row.total; cur.unseen += row.unseen;
      bySkill[skill] = cur;
    }
  }
  const allQuestionKeys = rt.sections.flatMap((s) => s.questions.map((q) => q.key));
  const unseen = allQuestionKeys.filter((k) => !seenKeysAtStart.has(k)).length;
  return {
    mockId: rt.state.mockId,
    level: rt.state.level,
    mode: rt.state.mode,
    sections,
    totalCorrect: sections.reduce((n, s) => n + s.correct, 0),
    totalQuestions: sections.reduce((n, s) => n + s.total, 0),
    totalUnanswered: sections.reduce((n, s) => n + s.unanswered, 0),
    bySkill,
    skills: [...new Set(rt.sections.flatMap((s) => s.questions.map((q) => q.skill)))],
    allQuestionKeys,
    wrongKeys: sections.flatMap((s) => s.wrongKeys),
    unseenRatio: allQuestionKeys.length === 0 ? 0
      : Math.round((unseen / allQuestionKeys.length) * 100) / 100,
  };
};

/** 模試結果 → 保存する履歴1件（§10の mock count 判定に使う） */
export const toMockLogEntry = (r: MockResult, dateKey: string, completedAt: string): AdvMockLogEntry => ({
  mockId: r.mockId,
  dateKey,
  level: r.level,
  mode: r.mode,
  totalCorrect: r.totalCorrect,
  totalQuestions: r.totalQuestions,
  totalUnanswered: r.totalUnanswered,
  sectionsFinishedInTime: r.sections.filter((s) => s.finishedInTime).length,
  sectionCount: r.sections.length,
  skills: r.skills,
  completedAt,
});

/**
 * 模試結果 → mastery台帳へ入れるattempt（timed evidence・skill別evidenceを同時に供給する）。
 *
 * **wrongKeys を必ず入れる**（2026-08-18 監査P1）。模試の問題キーはバトルと同じなので、
 * 正誤を落とすと错题本が「この問題は正誤を記録していない試行で出題された」と読み、
 * 未克服だった誤答が模試1回で全部「未確認」へ落ちていた（advMistakeNotebook.ts の
 * unverifiedSinceGraded 判定）。全問正解でも空配列を入れること。
 */
export const toMockAttempt = (
  r: MockResult, dateKey: string, seenKeysAtStart: Set<string>, completedAt: string,
): {
  dateKey: string; scorePct: number; unseenRatio: number; questionKeys: string[];
  tier: 'rankboss'; timed: true; completedAt: string; skills: string[];
  bySkill: Record<string, { correct: number; total: number; unseen: number }>;
  wrongKeys: string[];
} => ({
  dateKey,
  scorePct: r.totalQuestions === 0 ? 0 : Math.round((r.totalCorrect / r.totalQuestions) * 100),
  unseenRatio: r.allQuestionKeys.length === 0 ? 0
    : r.allQuestionKeys.filter((k) => !seenKeysAtStart.has(k)).length / r.allQuestionKeys.length,
  questionKeys: r.allQuestionKeys,
  tier: 'rankboss',
  timed: true,
  completedAt,
  skills: r.skills,
  bySkill: r.bySkill,
  wrongKeys: r.wrongKeys,
});

/** 未回答の問題番号（1始まり）。section提出前の警告に使う */
export const unansweredIndexes = (rt: MockRuntime, sectionIdx: number): number[] => {
  const sec = rt.sections[sectionIdx];
  return sec.questions
    .map((q, i) => ({ q, i }))
    .filter(({ q }) => (rt.state.answers[q.key] ?? null) === null)
    .map(({ i }) => i + 1);
};
