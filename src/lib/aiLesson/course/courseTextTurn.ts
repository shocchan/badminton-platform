// テキスト会話の決定的ターンエンジン（API・LLM不使用＝費用ゼロ・完全テスト可能）。
//
// 背景: 旧テキストモードは followUpQuestions を使い切ると同じ質問を永久に繰り返し、
// 最大ターン・終了フェーズ・学習者発言への反応が無かった（無限会話・噛み合わない の根本原因）。
// 本エンジンは以下を保証する:
//   1. 必ず maxTurns 以内に closing → summary へ到達する（無限会話なし）
//   2. 同じ質問を繰り返さない（使用済みインデックス管理）
//   3. 学習者の発言からキーワード・感情を1つ拾って短く反応してから、質問を1つだけ返す
//   4. 「終わりたい」を検知したら新しい質問を出さずにまとめへ
//   5. 極端に短い/不明瞭な入力が続いたら、無限に聞き返さず「まとめる」選択肢を出す
// ※ 音声Realtime側（voiceSession / buildVoicePayload）には一切触れない。

import type { Mission } from './types';

export type TextPhase = 'talking' | 'closingAnnounced' | 'done';

export interface TextTurnState {
  /** 学習者が送った有効ターン数 */
  turn: number;
  /** この回数に達したら必ずまとめへ（既定8） */
  maxTurns: number;
  /** 出題済み followUpQuestions のインデックス（重複質問防止） */
  usedFollowUps: number[];
  /** 目標表現を使えた回数 */
  targetHits: number;
  /** 連続で理解できなかった回数（2でフォールバック） */
  unclearStreak: number;
  phase: TextPhase;
}

export interface TextTurnReply {
  /** 先生の返答（反応≦1文＋質問≦1つ。closing後は質問なし） */
  text: string;
  state: TextTurnState;
  /** 今回の入力が目標表現にヒットしたか */
  targetHit: boolean;
  /** まとめボタンを強調表示すべきか（done で true） */
  offerSummary: boolean;
}

export const TEXT_MAX_TURNS_DEFAULT = 8;

export const initialTextTurnState = (maxTurns = TEXT_MAX_TURNS_DEFAULT): TextTurnState => ({
  turn: 0, maxTurns, usedFollowUps: [], targetHits: 0, unclearStreak: 0, phase: 'talking',
});

/**
 * 「終わりたい」意思の検知（ja/zh）。
 * 「仕事が終わってから」等の一般文を誤検知しないよう、終了の意思表明パターンに限定する。
 */
export const wantsToEnd = (text: string): boolean =>
  /(もう(終わり|おわり)|(終わり|おわり)たい|(終わり|おわり)にし|やめたい|やめます|終了したい|終了します|まとめ(て|を)ください|まとめに(して|進んで)|結束吧|想结束|不想(说|聊)了?|到此为止)/.test(text);

/** 実質的に内容が無い入力（相づち・極端な短文）。ひらがな1〜3文字の相づち等 */
export const isUnclear = (text: string): boolean => {
  const tr = text.trim();
  if (tr.length <= 2) return true;
  return /^(はい|うん|ええ|そう|そうです|わかりました|OK|ok|嗯|好的|是的)[。.！!]?$/.test(tr);
};

// ── 発言内容の反映（決定的な意図ピックアップ）────────────────────────────
// LLMなしでも「聞いてもらえた」体験を作るため、トピック・感情語を辞書で拾い、
// 1文だけ反射してから質問する。拾えなければ相づちのみ。

const TOPIC_WORDS = [
  '上司', '同僚', '会社', '仕事', '会議', '面接', '残業',
  '家族', '友達', '子ども', '子供', '先生', 'お客',
  '日本語', '勉強', '練習', '学校',
  '昨日', '今日', '週末', '休み', '旅行', 'ご飯', '料理', '買い物', '病院',
];

const FEELING_RULES: { re: RegExp; ja: string }[] = [
  { re: /(難しい|むずかしい|大変|たいへん|うまく(いか|でき)|できませんでした|失敗|ミス)/, ja: 'それは大変でしたね。' },
  { re: /(嬉しい|うれしい|楽しい|たのしい|よかった|できました|合格)/, ja: 'それは良かったですね！' },
  { re: /(疲れ|つかれ|眠い|ねむい|忙しい|いそがしい)/, ja: 'お疲れさまです。' },
  { re: /(心配|不安|怖い|こわい|緊張)/, ja: 'その気持ち、よく分かります。' },
];

/** 学習者の発言から1文の「反応」を作る（拾えたキーワード/感情を必ず1つ含める） */
export const buildReflection = (text: string): string => {
  const feeling = FEELING_RULES.find((f) => f.re.test(text));
  const topic = TOPIC_WORDS.find((w) => text.includes(w));
  if (feeling && topic) return `${topic}のことですね。${feeling.ja}`;
  if (feeling) return feeling.ja;
  if (topic) return `${topic}のことですね。`;
  return 'なるほど。';
};

/** 未出題の followUp を1つ選ぶ（無ければ null＝ネタ切れ→closingへ） */
const pickQuestion = (mission: Mission, used: number[]): { q: string; idx: number } | null => {
  for (let i = 0; i < mission.followUpQuestions.length; i++) {
    if (!used.includes(i)) return { q: mission.followUpQuestions[i], idx: i };
  }
  return null;
};

/** 不明瞭入力への具体的で答えやすい質問（同じ質問の繰り返しを避ける） */
const easierQuestion = (mission: Mission, state: TextTurnState): string =>
  state.unclearStreak >= 2
    ? `ここまでの内容でまとめることもできますよ。続けるなら、たとえば「${mission.simpleExample}」のように、短い文で教えてください。`
    : `短い文で大丈夫です。たとえば「${mission.simpleExample}」のように言ってみてください。`;

const CLOSING_ANNOUNCE = 'よく分かりました。あと1つだけ聞かせてください。';
const CLOSING_FINAL = 'ありがとうございます。今日はたくさん話せましたね。この会話をまとめましょう。下の「まとめを見る」を押してください。';
const END_BY_REQUEST = '分かりました。今日はここまでにしましょう。よくがんばりました！下の「まとめを見る」を押してください。';

/**
 * 学習者の1発言に対する先生の返答を決定的に生成する。
 * 返答構造は常に「反応（≦1文）＋質問（≦1つ）」。closing後は新しい質問を出さない。
 */
export const nextTextTurn = (state: TextTurnState, studentText: string, mission: Mission): TextTurnReply => {
  const detect = (() => { try { return new RegExp(mission.detect); } catch { return null; } })();
  const hit = !!detect && detect.test(studentText);
  const turn = state.turn + 1;

  // ① 終了希望 → 質問を出さずにまとめへ（§F）
  if (wantsToEnd(studentText)) {
    return {
      text: END_BY_REQUEST, targetHit: hit, offerSummary: true,
      state: { ...state, turn, phase: 'done', targetHits: state.targetHits + (hit ? 1 : 0) },
    };
  }

  // ② closing宣言済み → これが最後の回答。新しい質問は出さない（§G）
  if (state.phase === 'closingAnnounced') {
    const reflection = buildReflection(studentText);
    return {
      text: `${reflection}${CLOSING_FINAL}`, targetHit: hit, offerSummary: true,
      state: { ...state, turn, phase: 'done', targetHits: state.targetHits + (hit ? 1 : 0) },
    };
  }
  if (state.phase === 'done') {
    // done後は会話を再開しない（UIは入力を閉じるが、保険として固定応答）
    return { text: CLOSING_FINAL, targetHit: false, offerSummary: true, state: { ...state, turn: state.turn } };
  }

  // ③ 不明瞭な入力 → 同じ質問を繰り返さず、答えやすい形へ（§B/§D/§H）
  if (isUnclear(studentText)) {
    const unclearStreak = state.unclearStreak + 1;
    return {
      text: easierQuestion(mission, { ...state, unclearStreak }),
      targetHit: false, offerSummary: unclearStreak >= 2,
      state: { ...state, turn, unclearStreak },
    };
  }

  const targetHits = state.targetHits + (hit ? 1 : 0);
  const reflection = buildReflection(studentText);

  // ④ 残りターン計算。maxTurns-1 で closing宣言、maxTurns で終了（§2/§10）
  const isClosingTurn = turn >= state.maxTurns - 1;
  const isFinalTurn = turn >= state.maxTurns;

  if (isFinalTurn) {
    return {
      text: `${reflection}${CLOSING_FINAL}`, targetHit: hit, offerSummary: true,
      state: { ...state, turn, targetHits, unclearStreak: 0, phase: 'done' },
    };
  }

  // ⑤ 目標表現が使えた（1回目=別場面へ1回だけ誘導 / 2回目以降=closingへ寄せる）
  if (hit) {
    if (targetHits === 1 && mission.alternateScenes[0] && !isClosingTurn) {
      return {
        text: `いいですね！「${mission.targetExpression}」が自然に使えました。${mission.alternateScenes[0]}の場面でも、同じ表現で言ってみましょう。`,
        targetHit: true, offerSummary: false,
        state: { ...state, turn, targetHits, unclearStreak: 0 },
      };
    }
    // 2回使えた/最終盤 → closing宣言
    return {
      text: `すばらしい！「${mission.targetExpression}」がしっかり使えています。${CLOSING_ANNOUNCE}${pickQuestion(mission, state.usedFollowUps)?.q ?? '今日の話で、いちばん印象に残ったことは何ですか？'}`,
      targetHit: true, offerSummary: false,
      state: { ...state, turn, targetHits, unclearStreak: 0, phase: 'closingAnnounced' },
    };
  }

  // ⑥ closing間際 → 「あと1つ」を宣言して最後の質問（§10）
  if (isClosingTurn) {
    const picked = pickQuestion(mission, state.usedFollowUps);
    return {
      text: `${reflection}${CLOSING_ANNOUNCE}${picked?.q ?? '最後に、今日の話をひとことで言うと、どうでしたか？'}`,
      targetHit: false, offerSummary: false,
      state: {
        ...state, turn, targetHits, unclearStreak: 0, phase: 'closingAnnounced',
        usedFollowUps: picked ? [...state.usedFollowUps, picked.idx] : state.usedFollowUps,
      },
    };
  }

  // ⑦ 通常ターン: 反応＋未出題の質問1つ。ネタ切れなら closingへ（同じ質問を繰り返さない・§7）
  const picked = pickQuestion(mission, state.usedFollowUps);
  if (!picked) {
    return {
      text: `${reflection}${CLOSING_ANNOUNCE}今日の話の中で、「${mission.targetExpression}」を使ってもう一度言ってみませんか？`,
      targetHit: false, offerSummary: false,
      state: { ...state, turn, targetHits, unclearStreak: 0, phase: 'closingAnnounced' },
    };
  }
  return {
    text: `${reflection}${picked.q}`,
    targetHit: false, offerSummary: false,
    state: {
      ...state, turn, targetHits, unclearStreak: 0,
      usedFollowUps: [...state.usedFollowUps, picked.idx],
    },
  };
};
