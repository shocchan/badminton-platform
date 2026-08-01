// 案内の先生（Teacher Selection）。
//
// 原則:
// - **teacherId で管理する。** 性別を条件にしない（性別は表示上の設定であって分岐条件ではない）。
//   教材・出題・難易度・ルート・準備度は teacherId によって一切変わらない。
// - 未選択（null）は既定の先生へ倒す。**既存learnerの見え方を勝手に変えない**ため、
//   既定は従来から表示していた翔子先生のままにする。
// - assetが無い／読み込めない場合はモノグラムへ落とす（空表示にしない）。
export type AdvTeacherId = 'shoko' | 'yuto';

export const ADV_TEACHER_IDS: AdvTeacherId[] = ['shoko', 'yuto'];

/** 未選択learnerの表示。既存の見え方を維持するため翔子先生 */
export const DEFAULT_TEACHER_ID: AdvTeacherId = 'shoko';

export type TeacherExpression = 'neutral' | 'speaking' | 'smile' | 'teaching';

export interface AdvTeacherDef {
  id: AdvTeacherId;
  nameJa: string;
  nameZh: string;
  /** 選択画面の一言。学習内容の違いではなく、話し方の違いだけを書く */
  roleJa: string;
  roleZh: string;
  /** Homeの挨拶（クエストが無いときのフォールバック） */
  greetJa: string;
  greetZh: string;
  /** 表情 → 画像パス。無い表情は base へ落とす */
  assets: Partial<Record<TeacherExpression, string>> & { neutral: string };
  /** assetが読めないときに出すモノグラム */
  monogram: string;
  /** アバターの背景色（モノグラム時とリング色に使う） */
  accentClass: string;
  ringClass: string;
  /**
   * AI会話（realtime）で使う音声。**これは表示・記録用の写しであって、送信値ではない。**
   * クライアントは teacherId しか送らず、実際の音声は
   * `supabase/functions/ai-lesson-token` の allowlist（TEACHER_VOICE）が決める。
   * 両者が一致することは advTeacherVoice.test.ts が Edge Function のソースを読んで固定している。
   */
  realtimeVoice: string;
  /** 音声の印象（学習者向け）。公式の性別分類ではないので「女性声／男性声」とは書かない */
  voiceToneJa: string;
  voiceToneZh: string;
  voiceSwitchAvailable: boolean;
  /** 声がまだ切り替わらないことの説明（voiceSwitchAvailable=false のときだけ表示） */
  voiceNoteJa?: string;
  voiceNoteZh?: string;
}

const TEACHER_DEFS: Record<AdvTeacherId, AdvTeacherDef> = {
  shoko: {
    id: 'shoko',
    nameJa: '翔子先生',
    nameZh: '翔子老师',
    roleJa: 'ていねいに、一つずつ確かめながら進みます',
    roleZh: '细致地一步一步确认着前进',
    greetJa: 'こんにちは。今日も少しずつ進めましょう。',
    greetZh: '你好。今天也一点一点地往前走吧。',
    assets: {
      neutral: '/images/ai-course/shoko-sensei-base.webp',
      speaking: '/images/ai-course/shoko-sensei-base.webp',
      smile: '/images/ai-course/shoko-sensei-cheer.webp',
      teaching: '/images/ai-course/shoko-sensei-teaching.webp',
    },
    monogram: '翔',
    accentClass: 'bg-lp-coral-soft',
    ringClass: 'ring-rose-100',
    realtimeVoice: 'marin',
    voiceToneJa: 'やさしく落ち着いたAI音声',
    voiceToneZh: '温和沉稳的AI语音',
    voiceSwitchAvailable: true,
  },
  yuto: {
    id: 'yuto',
    nameJa: '悠斗先生',
    nameZh: '悠斗老师',
    roleJa: 'テンポよく、要点から先に伝えます',
    roleZh: '节奏明快，先讲重点',
    greetJa: 'おつかれさま。今日の分、さくっと片づけよう。',
    greetZh: '辛苦了。今天的份，我们干脆地做完吧。',
    assets: {
      neutral: '/images/ai-course/yuto-sensei-base.webp',
      speaking: '/images/ai-course/yuto-sensei-base.webp',
      // 悠斗先生には cheer 画像が無い。**無い表情は作り話をせず base へ落とす**
      smile: '/images/ai-course/yuto-sensei-base.webp',
      teaching: '/images/ai-course/yuto-sensei-teaching.webp',
    },
    monogram: '悠',
    accentClass: 'bg-sky-100',
    ringClass: 'ring-sky-100',
    realtimeVoice: 'cedar',
    voiceToneJa: '穏やかで低めのAI音声',
    voiceToneZh: '沉稳低沉的AI语音',
    // 2026-08-01 実走smokePASS後に true にした。
    // 実測: session.created の voice=cedar・音声274,882バイト・日本語transcript あり
    // （証跡: docs/ai-course/adventure-v2/generated/teacher-voice-smoke.json）
    voiceSwitchAvailable: true,
  },
};

/**
 * 正準の 先生 → realtime音声 対応表。
 * **サーバー側（supabase/functions/ai-lesson-token の TEACHER_VOICE）が正。**
 * ここはクライアント側の写しで、テストで両者の一致を固定している。
 * クライアントはこの値をリクエストへ載せない（載せると任意音声の注入経路になる）。
 */
export const CANONICAL_TEACHER_VOICE: Record<AdvTeacherId, string> = {
  shoko: 'marin',
  yuto: 'cedar',
};

export const ALL_TEACHERS: AdvTeacherDef[] = ADV_TEACHER_IDS.map((id) => TEACHER_DEFS[id]);

export const isTeacherId = (v: unknown): v is AdvTeacherId =>
  typeof v === 'string' && (ADV_TEACHER_IDS as string[]).includes(v);

/**
 * 保存値 → 表示する先生。
 * null / 不明な値 は既定へ倒す（壊れたデータで画面が空にならない）。
 */
export const resolveTeacher = (id: AdvTeacherId | null | undefined): AdvTeacherDef =>
  TEACHER_DEFS[isTeacherId(id) ? id : DEFAULT_TEACHER_ID];

/** 表情に対応するasset。無ければ neutral（＝必ず1枚は返る） */
export const teacherAsset = (t: AdvTeacherDef, e: TeacherExpression): string =>
  t.assets[e] ?? t.assets.neutral;

export const teacherName = (t: AdvTeacherDef, lang: 'ja' | 'zh'): string =>
  (lang === 'zh' ? t.nameZh : t.nameJa);
