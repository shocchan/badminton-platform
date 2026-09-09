// AI会話の回数券（Edge Function 側の写し）。
// **金額の正準は src/lib/aiLesson/course/plans/conversationTopups.ts。**
// こことズレていないことは conversationTopups.test.ts が検出する（値をここで変えない）。
//
// クライアントが送ってくる金額は信じない。決済に載せる金額は必ずこの表から取る。

export interface FunctionTopup {
  id: string;
  version: number;
  credits: number;
  priceJpy: number;
  nameJa: string; nameZh: string;
  descriptionJa: string; descriptionZh: string;
}

export const FUNCTION_TOPUP_CATALOG: FunctionTopup[] = [
  {
    id: "conv-topup-1",
    version: 1,
    credits: 1,
    priceJpy: 300,
    nameJa: "AI会話 1回",
    nameZh: "AI会话 1次",
    descriptionJa: "AI先生との音声会話を1回（1回あたり最大6分）。買い切りで、自動更新はありません。",
    descriptionZh: "与AI老师的语音会话1次（每次最长6分钟）。一次性付费，不会自动续费。",
  },
  {
    id: "conv-topup-5",
    version: 1,
    credits: 5,
    priceJpy: 1350,
    nameJa: "AI会話 5回券",
    nameZh: "AI会话 5次券",
    descriptionJa: "AI先生との音声会話を5回（1回あたり最大6分）。1回ずつ買うより10%おトクです。買い切りで、自動更新はありません。",
    descriptionZh: "与AI老师的语音会话5次（每次最长6分钟）。比单次购买便宜10%。一次性付费，不会自动续费。",
  },
];

export const functionTopupById = (id: string): FunctionTopup | null =>
  FUNCTION_TOPUP_CATALOG.find((t) => t.id === id) ?? null;
