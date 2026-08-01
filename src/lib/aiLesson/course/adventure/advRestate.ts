// 言い直し素材の決定（COMPLETION §14）。
//
// 既知P2: 言い直しstepの素材が0件になり、空カード・進行不能になることがあった。
// 対策: 優先順に素材を探し、本当に無い場合も **安全な代替を必ず返す**（nullを返さない）。
//   ① 会話中の最重要修正
//   ② バトルで誤った表現
//   ③ 今日のtarget expressionが未使用
//   ④ fallback: 今日使えた表現を別場面で言ってみる
//   ⑤ 素材ゼロ: 「今日は言い直しなし」と明示して完了できる

export type RestateSource = 'conversation_correction' | 'battle_mistake' | 'unused_target' | 'transfer' | 'none';

export interface RestateMaterial {
  source: RestateSource;
  /** 学習者に見せる見出し */
  titleJa: string;
  titleZh: string;
  /** 直す対象（誤用）。none/transfer のときは null */
  beforeJa: string | null;
  /** 正しい形・目標表現 */
  afterJa: string | null;
  /** 何をすればよいか */
  instructionJa: string;
  instructionZh: string;
  /** step自体をスキップ扱いにしてよいか（素材が本当に無いとき） */
  skippable: boolean;
}

export interface RestateInput {
  /** 会話レポートの修正（最重要1件） */
  conversationCorrection?: { beforeJa: string; afterJa: string } | null;
  /** 直近バトルで誤った表現（文法パターン等） */
  battleMistakes?: { expression: string; meaningJa: string }[];
  /** 今日の対象表現 */
  targetExpressions?: string[];
  /** 会話で実際に使えた表現 */
  usedExpressions?: string[];
}

/** 必ず素材を返す（空カード・null・進行不能を作らない） */
export const pickRestateMaterial = (input: RestateInput): RestateMaterial => {
  const cc = input.conversationCorrection;
  if (cc && cc.beforeJa.trim() && cc.afterJa.trim()) {
    return {
      source: 'conversation_correction',
      titleJa: '今日の会話で直したところ', titleZh: '今天会话中修正的地方',
      beforeJa: cc.beforeJa, afterJa: cc.afterJa,
      instructionJa: '正しい形をもう一度、声に出して言ってみましょう。',
      instructionZh: '把正确的说法再大声说一遍。',
      skippable: false,
    };
  }

  const mistake = (input.battleMistakes ?? [])[0];
  if (mistake) {
    return {
      source: 'battle_mistake',
      titleJa: 'バトルで間違えた表現', titleZh: '战斗中答错的表达',
      beforeJa: null, afterJa: mistake.expression,
      instructionJa: `「${mistake.expression}」（${mistake.meaningJa}）を使って、自分のことを一文で言ってみましょう。`,
      instructionZh: `用「${mistake.expression}」造一个关于自己的句子。`,
      skippable: false,
    };
  }

  const used = new Set(input.usedExpressions ?? []);
  const unused = (input.targetExpressions ?? []).filter((e) => !used.has(e));
  if (unused.length > 0) {
    return {
      source: 'unused_target',
      titleJa: '今日まだ使っていない表現', titleZh: '今天还没用过的表达',
      beforeJa: null, afterJa: unused[0],
      instructionJa: `「${unused[0]}」を使って、一文だけ言ってみましょう。`,
      instructionZh: `用「${unused[0]}」说一句话试试。`,
      skippable: false,
    };
  }

  const usedList = input.usedExpressions ?? [];
  if (usedList.length > 0) {
    return {
      source: 'transfer',
      titleJa: '別の場面で言ってみる', titleZh: '换个场景说说看',
      beforeJa: null, afterJa: usedList[0],
      instructionJa: `今日使えた「${usedList[0]}」を、今度は別の場面で言ってみましょう。`,
      instructionZh: `把今天用过的「${usedList[0]}」换一个场景再说一次。`,
      skippable: true,
    };
  }

  return {
    source: 'none',
    titleJa: '今日は言い直しなし', titleZh: '今天没有需要改口的内容',
    beforeJa: null, afterJa: null,
    instructionJa: '今日は直すところがありませんでした。このまま次に進めます。',
    instructionZh: '今天没有需要修正的地方，可以直接继续。',
    skippable: true,
  };
};
