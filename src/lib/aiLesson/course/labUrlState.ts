// しくみラボの表示位置をURL search paramsで管理（言語切替・リロード・再マウントでも位置維持）。
// URL=どの画面を開いているか／Repository=何を回答したか／local state=一時UI の責務分離。
// URLへ入れるのは lab/section/unit/step のみ（回答・正解・learner情報・errorTag等は入れない）。
export type LabSection = 'today' | 'units' | 'records';
export type LabUnitStep = 'intro' | 'words' | 'rules' | 'quiz' | 'result';

/** URL上のsection名→内部view名。旧5領域URL（vocabulary/rules/review）は新3領域へ正規化（§19・リダイレクトなし） */
const SECTION_FROM_URL: Record<string, LabSection> = {
  today: 'today', units: 'units', history: 'records',
  vocabulary: 'units', rules: 'units', review: 'records',
};
const SECTION_TO_URL: Record<LabSection, string> = {
  today: 'today', units: 'units', records: 'history',
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

// ── ことば図鑑のURL状態（§59・回答/自己評価/learner情報は入れない） ──
export type VocabUrlView = 'top' | 'category' | 'detail' | 'daily' | 'all' | 'practice' | 'roadmap' | 'diagnostic' | 'quickreview' | 'review' | 'decisions' | 'connectivity';
export interface ParsedVocabUrl { vocab: boolean; view: VocabUrlView; category: string | null; itemId: string | null }

export const parseVocabUrl = (search: string): ParsedVocabUrl => {
  const p = new URLSearchParams(search);
  const practiceMode = p.get('mode') === 'vocab-practice'; // §8 の別名URLにも対応
  const vocab = p.get('vocab') === '1' || practiceMode;
  const itemId = p.get('vitem');
  const category = p.get('vcat');
  const raw = practiceMode ? 'practice' : (p.get('vview') ?? '');
  let view: VocabUrlView = 'top';
  if (raw === 'review') view = 'review';               // 教材レビュー（vitemは位置復元用・§28）
  else if (raw === 'decisions') view = 'decisions';    // 判断キュー（2E-1.7・labPreview限定）
  else if (raw === 'connectivity') view = 'connectivity';   // 接続監査（2E-1.9・labPreview限定）
  else if (raw === 'practice' && itemId) view = 'practice';
  else if (itemId) view = 'detail';
  else if (raw === 'daily' || raw === 'all' || raw === 'roadmap' || raw === 'diagnostic' || raw === 'quickreview') view = raw;
  else if (category) view = 'category';
  return { vocab, view, category, itemId };
};

export const buildVocabSearch = (currentSearch: string, state: { view: VocabUrlView; category: string | null; itemId: string | null } | null): string => {
  const p = new URLSearchParams(currentSearch);
  p.delete('vocab'); p.delete('vview'); p.delete('vcat'); p.delete('vitem');
  if (state) {
    p.set('vocab', '1');
    if (state.view !== 'top' && state.view !== 'category' && state.view !== 'detail') p.set('vview', state.view);
    if (state.category) p.set('vcat', state.category);
    if (state.itemId) p.set('vitem', state.itemId);
  }
  const s = p.toString();
  return s ? `?${s}` : '';
};
