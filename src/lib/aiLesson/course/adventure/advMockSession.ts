// ミニ模試の進行状態（COMPLETION §9）。純関数＋直列化可能な状態にして reload 復帰できるようにする。
import type { AdvBattleQuestion } from './advVariants';
import type { MockLevel, MockSection, MockSpec } from './advMock';
import { presentBattle, isCorrectAnswer, type PresentedQuestion } from './advChoiceOrder';
import type { ExamSkill } from './advExamSkills';
import type { AdvMockLogEntry, AdvMockSessionState } from './advTypes';
import { readingSetById } from './reading/readingBank';
import { listeningSetById } from './listening/listeningBank';

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
const FULL_TIME_SEC: Record<MockLevel, Record<string, number>> = {
  N2: { languageKnowledge: 105 * 60, reading: 105 * 60, listening: 50 * 60 },
  N3: { languageKnowledge: 30 * 60, reading: 70 * 60, listening: 40 * 60 },
  // N4/N5 は2022年改定後の公式試験時間（advMock.EXAM_MINUTES と同じ値）
  N4: { languageKnowledge: 25 * 60, reading: 55 * 60, listening: 35 * 60 },
  N5: { languageKnowledge: 20 * 60, reading: 40 * 60, listening: 30 * 60 },
};

export const sectionTimeLimit = (
  section: MockSection, level: MockLevel, mode: 'short' | 'fullTime',
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
  pool: AdvBattleQuestion[], count: number, level: MockLevel, seed: number,
): AdvBattleQuestion[] => {
  // 受験バンド優先。N5/N4 は基礎（foundation）が本体なのでそれだけを見る
  // （n3/n2 を混ぜると、目標N5の生徒の模試にN3語彙が出る＝約束と中身が食い違う）
  const bands: AdvBattleQuestion['level'][] = level === 'N2'
    ? ['n2', 'n3', 'foundation']
    : level === 'N3' ? ['n3', 'foundation'] : ['foundation'];
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
  level: MockLevel;
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
  /**
   * 誤答の解説つき記録（2026-08-25）。結果画面の表示と、あとから読み返す保存の
   * **両方がこれ1つを使う**（表示と保存で中身がずれないようにするため）
   */
  wrong: MockWrongDetail[];
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
    wrong: toMockWrongDetails(rt),
  };
};

/* ────────────────────────────────────────────────────────────
   間違い直しの保存（2026-08-25 CEO指摘）
   ──────────────────────────────────────────────────────────── */

/**
 * 誤答1問ぶんの「あとから読み返せる」記録。
 *
 * なぜ保存するのか: 以前は終了直後の結果画面でしか間違い直しを見られず、
 * 画面を閉じた瞬間に問題文も解説も消えていた。試験形式はその場で答え合わせを
 * しないぶん、**あとで解説を読む時間**が学習そのものになる（CEO実測・画面共有授業）。
 *
 * 錯題本（advMistakeNotebook）は設計上、問題文を持たない（キーだけ）。
 * だから模試の解説はここに写し取るしかない。
 */
export interface MockWrongDetail {
  key: string;
  sectionLabelJa: string;
  sectionLabelZh: string;
  /** section内の問題番号（1始まり） */
  index: number;
  /** 問題文（対象語＋設問）。言語は日本語のまま持つ */
  stemJa: string;
  stemZh: string;
  /**
   * 出題時に並んでいた選択肢の全文（表示順）。
   * 「選んだもの」と「正解」だけでは、何と何で迷ったのかが復習できない（2026-08-29 CEO指摘）。
   * 2026-08-29 より前に保存された回には無い（undefined）
   */
  choicesJa?: string[];
  /** 読解の本文。これが無いと読解の誤答は復習しようがない */
  passageJa?: string;
  /** 聴解の場面説明と読み上げ原稿（解答後なので出してよい） */
  situationJa?: string;
  transcriptJa?: string;
  /** 学習者が選んだ選択肢。null＝未回答 */
  pickedTextJa: string | null;
  correctTextJa: string;
  whyJa: string;
  whyZh: string;
}

/** 1回の模試で保存する誤答の上限（settings jsonb を太らせない） */
export const MAX_WRONG_DETAILS = 30;
/** 解説つきで残す模試の回数（古いものは集計だけ残る） */
export const MOCK_DETAIL_KEEP = 5;

const clip = (s: string | null | undefined, max: number): string =>
  (typeof s === 'string' ? s.slice(0, max) : '');

/**
 * 採点済みの runtime から、誤答（未回答を含む）の解説つき記録を作る。
 * 画面側の表示ロジックと同じ材料を、言語に依存しない形で取り出す。
 */
export const toMockWrongDetails = (rt: MockRuntime): MockWrongDetail[] => {
  const out: MockWrongDetail[] = [];
  for (const sec of rt.sections) {
    for (const [qi, q] of sec.questions.entries()) {
      const picked = rt.state.answers[q.key] ?? null;
      const correct = q.choices.find((c) => c.isCorrect);
      if (!correct || picked === correct.choiceId) continue;
      // 読解は本文が問題文なので、出題画面と同じく targetJapanese は出さない
      const reading = q.skill === 'reading' ? readingSetById(q.sourceItemId) : undefined;
      const listening = q.skill === 'listening' ? listeningSetById(q.sourceItemId) : undefined;
      // 出題時に並んでいた順のまま残す（選択肢の並びも「どう見えたか」の一部）
      const order = sec.presented.find((p) => p.key === q.key)?.presentedChoiceOrder;
      const inOrder = order
        ? order.map((id) => q.choices.find((c) => c.choiceId === id)).filter((c) => !!c)
        : q.choices;
      out.push({
        key: q.key,
        sectionLabelJa: sec.section.labelJa,
        sectionLabelZh: sec.section.labelZh,
        index: qi + 1,
        stemJa: clip([reading ? null : q.targetJapanese, q.questionJa].filter(Boolean).join('\n'), 400),
        stemZh: clip(q.questionZh, 400),
        choicesJa: inOrder.map((c) => clip(c.textJa, 200)),
        ...(reading ? { passageJa: clip(reading.passageJa, 1200) } : {}),
        ...(listening ? {
          situationJa: clip(listening.situationJa, 200),
          transcriptJa: clip(listening.transcriptJa, 800),
        } : {}),
        pickedTextJa: picked ? clip(q.choices.find((c) => c.choiceId === picked)?.textJa, 200) : null,
        correctTextJa: clip(correct.textJa, 200),
        whyJa: clip(q.explanation.whyCorrectJa, 500),
        whyZh: clip(q.explanation.whyCorrectZh, 500),
      });
    }
  }
  return out.slice(0, MAX_WRONG_DETAILS);
};

const isRec = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * 保存された誤答記録の復元（jsonbなので何が入っているか分からない）。
 * 問題文か正解が欠けている行は落とす（空の解説カードを画面に出さない）。
 */
export const restoreMockWrongDetails = (v: unknown): MockWrongDetail[] => {
  if (!Array.isArray(v)) return [];
  const out: MockWrongDetail[] = [];
  for (const raw of v) {
    if (!isRec(raw)) continue;
    if (typeof raw.key !== 'string') continue;
    if (typeof raw.correctTextJa !== 'string' || !raw.correctTextJa) continue;
    const stemJa = clip(raw.stemJa as string, 400);
    const stemZh = clip(raw.stemZh as string, 400);
    const passageJa = clip(raw.passageJa as string, 1200);
    const transcriptJa = clip(raw.transcriptJa as string, 800);
    // 設問・本文・原稿がどれも無い行は、出しても何も分からないので落とす
    if (!stemJa && !stemZh && !passageJa && !transcriptJa) continue;
    out.push({
      key: raw.key,
      sectionLabelJa: clip(raw.sectionLabelJa as string, 60),
      sectionLabelZh: clip(raw.sectionLabelZh as string, 60),
      index: typeof raw.index === 'number' && Number.isFinite(raw.index) ? Math.max(1, Math.floor(raw.index)) : 1,
      stemJa,
      stemZh,
      ...(Array.isArray(raw.choicesJa)
        ? { choicesJa: raw.choicesJa.filter((c): c is string => typeof c === 'string' && !!c).slice(0, 6).map((c) => clip(c, 200)) }
        : {}),
      ...(passageJa ? { passageJa } : {}),
      ...(clip(raw.situationJa as string, 200) ? { situationJa: clip(raw.situationJa as string, 200) } : {}),
      ...(transcriptJa ? { transcriptJa } : {}),
      pickedTextJa: typeof raw.pickedTextJa === 'string' ? clip(raw.pickedTextJa, 200) : null,
      correctTextJa: clip(raw.correctTextJa, 200),
      whyJa: clip(raw.whyJa as string, 500),
      whyZh: clip(raw.whyZh as string, 500),
    });
    if (out.length >= MAX_WRONG_DETAILS) break;
  }
  return out;
};

/**
 * 新しい1件を足した mockLog を作る。
 * 解説つきの誤答は**新しい MOCK_DETAIL_KEEP 回ぶんだけ**残す
 * （古い回は集計だけ残る。settings が無制限に太るのを防ぐ）。
 */
export const appendMockLog = (
  log: AdvMockLogEntry[], entry: AdvMockLogEntry, keep = MOCK_DETAIL_KEEP,
): AdvMockLogEntry[] => {
  const next = [...log, entry].slice(-30);
  const detailFrom = Math.max(0, next.length - keep);
  return next.map((e, i) => (i >= detailFrom ? e : { ...e, wrong: undefined }));
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
  // 全問正解なら持たない（空配列を保存して「解説がある」と見せない）
  wrong: r.wrong.length > 0 ? r.wrong : undefined,
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
