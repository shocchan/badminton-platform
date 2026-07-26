// しくみラボの表示位置をURL search paramsで管理（言語切替・リロード・再マウントでも位置維持）。
// URL=どの画面を開いているか／Repository=何を回答したか／local state=一時UI の責務分離。
// URLへ入れるのは lab/section/unit/step のみ（回答・正解・learner情報・errorTag等は入れない）。
export type LabSection = 'today' | 'words' | 'rules' | 'review' | 'history';
export type LabUnitStep = 'intro' | 'words' | 'rules' | 'quiz' | 'result';

/** URL上のsection名（外部表記）→内部view名。不正値はtoday扱い */
const SECTION_FROM_URL: Record<string, LabSection> = {
  today: 'today', vocabulary: 'words', rules: 'rules', review: 'review', history: 'history',
};
const SECTION_TO_URL: Record<LabSection, string> = {
  today: 'today', words: 'vocabulary', rules: 'rules', review: 'review', history: 'history',
};
const VALID_STEPS = new Set<LabUnitStep>(['intro', 'words', 'rules', 'quiz', 'result']);

export interface ParsedLabUrl {
  lab: boolean;
  section: LabSection;          // 不正sectionはtodayへ（§8）
  unit: string | null;          // 実在検証は呼び出し側（registry）で行う
  step: LabUnitStep | null;     // 不正stepはnull（unit側でintroへ）
}

export const parseLabUrl = (search: string): ParsedLabUrl => {
  const p = new URLSearchParams(search);
  const rawSection = p.get('section') ?? '';
  const rawStep = p.get('step') ?? '';
  return {
    lab: p.get('lab') === '1',
    section: SECTION_FROM_URL[rawSection] ?? 'today',
    unit: p.get('unit'),
    step: VALID_STEPS.has(rawStep as LabUnitStep) ? (rawStep as LabUnitStep) : null,
  };
};

export interface LabUrlInput { section: LabSection; unit: string | null; step: LabUnitStep | null }

/** 既存search（app=1等）を維持したまま lab/section/unit/step を書き換える。nullで全削除（ラボ退出） */
export const buildLabSearch = (currentSearch: string, state: LabUrlInput | null): string => {
  const p = new URLSearchParams(currentSearch);
  p.delete('lab'); p.delete('section'); p.delete('unit'); p.delete('step');
  if (state) {
    p.set('lab', '1');
    p.set('section', SECTION_TO_URL[state.section]);
    if (state.unit) p.set('unit', state.unit);
    if (state.unit && state.step) p.set('step', state.step);
  }
  const s = p.toString();
  return s ? `?${s}` : '';
};

/**
 * ラボ試作の閲覧権限判定（§11）。DB jsonbのboolean true のみ許可。
 * string "true"・"1"・lab_preview等の揺れは権限として認めない。
 */
export const hasLabPreview = (adminOverrides: unknown): boolean =>
  typeof adminOverrides === 'object' && adminOverrides !== null &&
  (adminOverrides as { labPreview?: unknown }).labPreview === true;
