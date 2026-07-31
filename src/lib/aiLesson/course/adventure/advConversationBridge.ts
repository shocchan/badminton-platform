// JLPT学習 → AI会話への転用（§19）。
// 既存会話runtime（最大8ターン・1応答1質問・closingPhase・zh訳・ふりがな・report・retry・review）は
// 変更しない。ここでは「今日の文法をミッション化する仕様」と「会話後の使用判定」だけを純関数で提供する。
import type { GrammarDraftLike } from './advVariants';
import { matchKeysOf } from './advVariants';

export interface ConversationMissionSpec {
  /** 既存レッスン起動に渡すテーマ・開始文（practiceフィールド由来） */
  missionId: string;
  grammarId: string;
  targetUse: string;
  themeJa: string;
  starterJa: string;
  starterZh: string;
  /** 使用判定に使う照合キー（expected/acceptable/matchKeys統合） */
  acceptKeys: string[];
  /** 会話ミッションの説明（§19の例の形） */
  introJa: string;
  introZh: string;
}

/** 文法draftから会話ミッション仕様を作る（会話目的learnerに試験文法を強制しない判断は呼び出し側） */
export const buildConversationMission = (d: GrammarDraftLike & {
  practice: { themeJa: string; starterJa: string; starterZh: string; targetUse: string };
  production: { expected: string[]; acceptable: string[] };
}): ConversationMissionSpec => {
  const acceptKeys = [...new Set([
    ...matchKeysOf(d),
    ...d.production.expected,
    ...d.production.acceptable,
  ])].map((k) => k.replace(/[〜～]/g, '')).filter((k) => k.length >= 2);
  return {
    missionId: `advconv-${d.grammarId}`,
    grammarId: d.grammarId,
    targetUse: d.practice.targetUse,
    themeJa: d.practice.themeJa,
    starterJa: d.practice.starterJa,
    starterZh: d.practice.starterZh,
    acceptKeys,
    introJa: `今日学んだ文法「${d.pattern}」を、実際の会話で1回使ってみましょう。`,
    introZh: `把今天学的语法「${d.pattern}」在实际会话中用一次吧。`,
  };
};

export interface ConversationUsageResult {
  used: boolean;
  /** 実際に使えた発話（Before/After・§22「使えた表現」） */
  usedUtterances: string[];
  /** 判定に使ったキー */
  matchedKeys: string[];
}

/** 会話transcript（生徒発話のみ）から対象表現の使用を判定（誇張しない: 完全包含のみ） */
export const detectTargetUsage = (studentUtterances: string[], spec: ConversationMissionSpec): ConversationUsageResult => {
  const usedUtterances: string[] = [];
  const matchedKeys: string[] = [];
  for (const u of studentUtterances) {
    for (const k of spec.acceptKeys) {
      if (u.includes(k)) {
        if (!usedUtterances.includes(u)) usedUtterances.push(u);
        if (!matchedKeys.includes(k)) matchedKeys.push(k);
      }
    }
  }
  return { used: usedUtterances.length > 0, usedUtterances, matchedKeys };
};

/** 会話後の次アクション提案（使えた→転用/使えなかった→言い直し優先） */
export const nextAfterConversation = (r: ConversationUsageResult): { ja: string; zh: string; kind: 'transfer' | 'restate' } =>
  r.used
    ? { ja: '別の場面でも同じ表現を使ってみましょう', zh: '试着在别的场景也用同一个表达', kind: 'transfer' }
    : { ja: '言い直し練習で今日の表現をもう一度', zh: '通过改口练习再用一次今天的表达', kind: 'restate' };
