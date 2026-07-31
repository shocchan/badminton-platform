// 能力帯（band）の順序・更新の純関数（§9・§10）。
// 断定しない: bandは「開始地点・現在地の目安」であり、資格や自己評価を否定しない（§6）。
import type { AdvBand, AdvConfidence, AdvSkill, AdvSkillProfile, AdvSkillScore } from './advTypes';

/** 帯の順序（比較用）。needs_assessment は比較不能として -1 */
const BAND_ORDER: AdvBand[] = [
  'pre_n5', 'n5', 'n4', 'n4_late', 'n3_early', 'n3', 'n3_late', 'n2_early', 'n2', 'n2_plus',
];

export const bandRank = (b: AdvBand): number => BAND_ORDER.indexOf(b);

/** a が b 以上の帯か。どちらか未判定なら false（安全側＝補強を入れる方向へ倒す） */
export const bandAtLeast = (a: AdvBand, b: AdvBand): boolean => {
  const ra = bandRank(a); const rb = bandRank(b);
  return ra >= 0 && rb >= 0 && ra >= rb;
};

/** 0-100スコア → 帯（語彙・文法の診断用。levelHint = 出題した問題の主レベル） */
export const scoreToBand = (scorePct: number, levelHint: 'foundation' | 'n3' | 'n2'): AdvBand => {
  if (levelHint === 'foundation') {
    if (scorePct >= 85) return 'n4_late';
    if (scorePct >= 60) return 'n4';
    if (scorePct >= 35) return 'n5';
    return 'pre_n5';
  }
  if (levelHint === 'n3') {
    if (scorePct >= 85) return 'n3_late';
    if (scorePct >= 60) return 'n3';
    if (scorePct >= 35) return 'n3_early';
    return 'n4_late';
  }
  if (scorePct >= 85) return 'n2_plus';
  if (scorePct >= 60) return 'n2';
  if (scorePct >= 35) return 'n2_early';
  return 'n3_late';
};

/** 証拠数 → 信頼度。§10「データが少ない場合は暫定」 */
export const evidenceToConfidence = (evidenceCount: number): AdvConfidence => {
  if (evidenceCount <= 0) return 'none';
  if (evidenceCount < 8) return 'low';
  if (evidenceCount < 25) return 'medium';
  return 'high';
};

/**
 * 能力スコアの更新（指数移動平均）。1回の結果で急変させない。
 * weight: 新しい証拠の重み（診断=0.6 / 通常バトル=0.25 / ボス=0.4 目安）
 */
export const updateSkillScore = (
  prev: AdvSkillScore, observedPct: number, band: AdvBand, nowISO: string, weight: number,
  addedEvidence: number,
): AdvSkillScore => {
  const clamped = Math.max(0, Math.min(100, observedPct));
  const blended = prev.confidence === 'none'
    ? clamped
    : Math.round(prev.currentScore * (1 - weight) + clamped * weight);
  const evidenceCount = prev.evidenceCount + Math.max(1, addedEvidence);
  // 帯は証拠が増えたときだけ前進/後退させる（1回のブレで飛ばない）
  const nextBand = prev.band === 'needs_assessment' ? band
    : Math.abs(bandRank(band) - bandRank(prev.band)) <= 1 ? band : prev.band;
  return {
    currentScore: blended,
    confidence: evidenceToConfidence(evidenceCount),
    evidenceCount,
    lastAssessedAt: nowISO,
    band: nextBand,
  };
};

/** 表示用: 未判定を隠さない（§10・§16） */
export const skillDisplay = (s: AdvSkillScore): { kind: 'unknown' | 'provisional' | 'measured'; scorePct: number } => {
  if (s.confidence === 'none') return { kind: 'unknown', scorePct: 0 };
  if (s.confidence === 'low') return { kind: 'provisional', scorePct: s.currentScore };
  return { kind: 'measured', scorePct: s.currentScore };
};

/** 知識ランク（語彙・文法の帯の低い方＝正直側）。未判定が混じれば needs_assessment */
export const knowledgeBandOf = (skills: AdvSkillProfile): AdvBand => {
  const v = skills.vocabulary.band; const g = skills.grammar.band;
  if (v === 'needs_assessment' || g === 'needs_assessment') return 'needs_assessment';
  return bandRank(v) <= bandRank(g) ? v : g;
};

export const SKILL_LABELS: Record<AdvSkill, { ja: string; zh: string }> = {
  vocabulary: { ja: '語彙', zh: '词汇' },
  grammar: { ja: '文法', zh: '语法' },
  reading: { ja: '読解', zh: '阅读' },
  listening: { ja: '聴解', zh: '听力' },
  conversation: { ja: '会話', zh: '会话' },
  practical: { ja: '実践', zh: '实践' },
  consistency: { ja: '継続', zh: '坚持' },
};
