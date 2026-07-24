// テキスト予習（Feature: 全章の予習・鍵付き章の閲覧）の純ロジック。
// 既存 Mission 静的データだけを使い、AI/音声/翻訳APIを一切呼ばない。
// 「内容を学ぶこと」と「コース進行（mastery/review/解放）」を完全に分離する。

import type { ItemProgress, Mission } from './types';

/** 章のアクセス状態（音声可否の判定に使う。閲覧・予習は状態に関わらず常に可） */
export type MissionAccess = 'locked' | 'current' | 'completed';

export const missionAccessState = (mission: Mission, progresses: ItemProgress[]): MissionAccess => {
  const learned = (id: string) => progresses.some((p) => p.itemId === id);
  if (learned(mission.id)) return 'completed';
  const prereqOk = mission.requiredPreviousItems.every(learned);
  return prereqOk ? 'current' : 'locked';
};

/** 音声レッスンを開始してよいか（未解放は禁止＝直接URL/操作でも拒否できる判定） */
export const canStartVoice = (access: MissionAccess): boolean => access !== 'locked';

/** 前提章のうち、まだ学習していないもの（解放条件の説明用） */
export const missingPrerequisites = (mission: Mission, progresses: ItemProgress[]): string[] =>
  mission.requiredPreviousItems.filter((id) => !progresses.some((p) => p.itemId === id));

// ── テキスト練習（APIなし・純関数） ──

const PARTICLE = /[はがをにへとでもや、。！？]/; // は が を に へ と で も や 、 。 ！ ？

/** 助詞・句読点の直後で区切ってチャンク化（助詞は前のチャンクへ付ける） */
const splitChunks = (s: string): string[] => {
  const out: string[] = [];
  let cur = '';
  for (const ch of s) {
    cur += ch;
    if (PARTICLE.test(ch)) { out.push(cur); cur = ''; }
  }
  if (cur) out.push(cur);
  return out.map((c) => c.trim()).filter(Boolean);
};

const stripPunct = (c: string): string => c.replace(/[、。！？]/g, '');
const contentLen = (c: string): number => c.replace(new RegExp(PARTICLE, 'g'), '').replace(/\s/g, '').length;

/** 穴埋め: 例文の内容チャンクを1つ全角カッコの空欄に置き換える。answer で復元できる */
const BLANK = `（${String.fromCharCode(0x3000)}）`; // 全角カッコ＋全角スペース
export const buildCloze = (example: string): { masked: string; answer: string } => {
  const chunks = splitChunks(example);
  if (chunks.length < 2) return { masked: example, answer: '' };
  let idx = 0, best = -1;
  chunks.forEach((c, i) => { const n = contentLen(c); if (n > best) { best = n; idx = i; } });
  const answer = stripPunct(chunks[idx]);
  const masked = chunks.map((c, i) => (i === idx ? c.replace(answer, BLANK) : c)).join('');
  return { masked, answer };
};

/** 並べ替え: 例文をチャンクに分け、決定的にシャッフルして出題。answer=正解文 */
export const buildScramble = (example: string): { pieces: string[]; answer: string } => {
  const chunks = splitChunks(example).map(stripPunct);
  const answer = chunks.join('');
  const pieces = [...chunks];
  // 決定的シャッフル（同じ例文からは常に同じ並び＝冪等）
  let s = example.length * 131 + 7;
  for (let i = pieces.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
  }
  // 元と完全一致（並びが変わらない）なら軽く回して見た目を変える
  if (chunks.length > 1 && pieces.join('') === answer) pieces.push(pieces.shift() as string);
  return { pieces, answer };
};

/** 予習に出す重要表現（この章の目標表現）。static のみ・APIなし */
export interface PreviewExpression {
  targetExpression: string;
  reading: string;
  meaningZh: string;
  simpleExample: string;
  naturalExample: string;
  usageJa: string;
  usageZh: string;
  commonMistakes: string[];
  cloze: { masked: string; answer: string };
  scramble: { pieces: string[]; answer: string };
}

export const buildPreviewExpression = (mission: Mission): PreviewExpression => ({
  targetExpression: mission.targetExpression,
  reading: mission.targetExpressionReading,
  meaningZh: mission.meaningZh,
  simpleExample: mission.simpleExample,
  naturalExample: mission.naturalExample,
  usageJa: mission.usageNotesJa,
  usageZh: mission.usageNotesZh,
  commonMistakes: mission.commonMistakes ?? [],
  cloze: buildCloze(mission.simpleExample),
  scramble: buildScramble(mission.simpleExample),
});
