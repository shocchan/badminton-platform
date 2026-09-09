/**
 * AI会話の回数券（2026-09-09 CEO決定）。**価格をここ以外に書かない。**
 *
 * AI会話はベータ扱いで、毎日の冒険からは外し、週3回までを全員の枠にした。
 * それ以上やりたい人だけが、ここから買い足す。
 *
 * 【値決めの根拠】
 *   音声1分の原価は ¥25（$0.1344/分 × 安全率1.2 × ¥155）。**モデル値で、
 *   OpenAIの実請求とは未突合**（音声はWebRTCで直接つながるので分数しか観測できない）。
 *   1回6分＝原価¥150。Stripe手数料は3.6%で見る。
 *
 *     都度   ¥300  → 実収 ¥289 / 原価 ¥150 → 原価率 52%
 *     5回券 ¥1,350 → 実収 ¥260/回 / 原価 ¥150 → 原価率 58%
 *
 *   どちらも体験パスに設けた上限60%の内側。券の割引は10%に留めた
 *   （5回¥1,100だと原価率71%で、薄利の商品としては危ない）。
 *
 * 【プランに含まれる回との違い】
 *   含まれる回は4分、**買った回は6分**。6分を全プランに広げると体験パス（600円）の
 *   原価率が75%を超えて壊れるので、長いのは買った回だけにしている。
 *   分数は学習中の画面には出さない（CEO決定）が、**商品の説明には必ず書く**
 *   ＝何を買うのか分からないまま買わせない。
 */

export interface ConversationTopup {
  id: 'conv-topup-1' | 'conv-topup-5';
  /** 内容を変えたら上げる。購入記録に残す */
  version: number;
  /** 何回ぶんか */
  credits: number;
  /** 税込・JPY。表示の正準は priceLabel だが、決済に渡すのはこの数値 */
  priceJpy: number;
  nameJa: string; nameZh: string;
  priceLabelJa: string; priceLabelZh: string;
  descriptionJa: string; descriptionZh: string;
  sortOrder: number;
}

/** 買った回の長さ（分）。ai_config.conversation_beta.paidSessionSeconds と一致させる */
export const PAID_SESSION_MINUTES = 6;

export const CONVERSATION_TOPUPS: ConversationTopup[] = [
  {
    id: 'conv-topup-1',
    version: 1,
    credits: 1,
    priceJpy: 300,
    nameJa: 'AI会話 1回',
    nameZh: 'AI会话 1次',
    priceLabelJa: '300円（税込）',
    priceLabelZh: '300日元（含税）',
    descriptionJa: `AI先生との音声会話を1回（1回あたり最大${PAID_SESSION_MINUTES}分）。買い切りで、自動更新はありません。`,
    descriptionZh: `与AI老师的语音会话1次（每次最长${PAID_SESSION_MINUTES}分钟）。一次性付费，不会自动续费。`,
    sortOrder: 10,
  },
  {
    id: 'conv-topup-5',
    version: 1,
    credits: 5,
    priceJpy: 1350,
    nameJa: 'AI会話 5回券',
    nameZh: 'AI会话 5次券',
    priceLabelJa: '1,350円（税込）',
    priceLabelZh: '1,350日元（含税）',
    descriptionJa: `AI先生との音声会話を5回（1回あたり最大${PAID_SESSION_MINUTES}分）。1回ずつ買うより10%おトクです。買い切りで、自動更新はありません。`,
    descriptionZh: `与AI老师的语音会话5次（每次最长${PAID_SESSION_MINUTES}分钟）。比单次购买便宜10%。一次性付费，不会自动续费。`,
    sortOrder: 20,
  },
];

export const topupById = (id: string): ConversationTopup | null =>
  CONVERSATION_TOPUPS.find((t) => t.id === id) ?? null;

export const isTopupId = (id: string | null | undefined): boolean =>
  !!id && CONVERSATION_TOPUPS.some((t) => t.id === id);

/** 表示用（言語ぶんを1か所で解決する） */
export const topupView = (t: ConversationTopup, lang: 'ja' | 'zh') => ({
  id: t.id,
  name: lang === 'zh' ? t.nameZh : t.nameJa,
  priceLabel: lang === 'zh' ? t.priceLabelZh : t.priceLabelJa,
  description: lang === 'zh' ? t.descriptionZh : t.descriptionJa,
  credits: t.credits,
});
