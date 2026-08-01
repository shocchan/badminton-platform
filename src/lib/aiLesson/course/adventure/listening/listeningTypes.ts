// 聴解問題bankの型（COMPLETION §7）。
//
// 原則:
// - **実際に音声を再生できること**（音声なしの聴解は「存在するふり」＝出題しない）
// - attempt中はtranscriptを表示しない。回答後のみ表示可
// - 再生回数は問題仕様に従う（本試験にならい原則1回、練習用に2回まで）
// - audio asset が manifest に無い／読み込めない問題は出題しない（HOLD）
export type ListeningType =
  | 'taskComprehension'   // 課題理解（次に何をするか）
  | 'pointComprehension'  // ポイント理解（理由・条件など特定の点）
  | 'outlineComprehension'// 概要理解（話の主旨）
  | 'quickResponse'       // 即時応答（短い問いかけへの返答）
  | 'integrated';         // 統合理解（複数の情報をまとめる）

export const LISTENING_TYPE_LABELS: Record<ListeningType, { ja: string; zh: string }> = {
  taskComprehension: { ja: '課題理解', zh: '课题理解' },
  pointComprehension: { ja: 'ポイント理解', zh: '要点理解' },
  outlineComprehension: { ja: '概要理解', zh: '概要理解' },
  quickResponse: { ja: '即時応答', zh: '即时应答' },
  integrated: { ja: '統合理解', zh: '综合理解' },
};

export interface ListeningChoice {
  choiceId: string;
  textJa: string;
  isCorrect: boolean;
  whyWrongJa?: string;
}

export interface ListeningSet {
  setId: string;
  sourceLevel: 'N2' | 'N3';
  listeningType: ListeningType;
  /** 音声ファイルのパス（public配下）。manifestで実在を検証する */
  audioAsset: string;
  /** 読み上げ原稿（attempt中は非表示・回答後に表示） */
  transcriptJa: string;
  /** 場面説明（音声の前に表示してよい導入） */
  situationJa: string;
  situationZh: string;
  questionJa: string;
  questionZh: string;
  choices: ListeningChoice[];
  explanationJa: string;
  /** 中国語の解説（日本語の引用は「」で明示） */
  explanationZh: string;
  difficulty: 1 | 2 | 3;
  /** 音声の長さ（秒）。manifest生成時に実測値で上書きされる */
  durationSeconds: number;
  /** 再生できる回数 */
  playLimit: 1 | 2;
  reviewState: 'generated_draft' | 'validated_beta' | 'authored';
  sourceId: string;
}

export const listeningKeyOf = (s: ListeningSet): string => `listen:${s.setId}`;
