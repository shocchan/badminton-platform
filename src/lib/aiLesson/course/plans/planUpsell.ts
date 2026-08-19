// 1か月AI自学プラン → 6か月伴走コースへの案内（アップセル導線）の判定。
//
// 方針（2026-08-19 CEO依頼）:
// - 1か月プランを「安売り」ではなく「6か月コースへつながる体験導線」として設計する
// - 案内は**邪魔にならない**こと。閉じたら7日間は出さない
// - 対象は plan_id = 'ai-month' の利用者だけ。既存の6か月コース生徒・
//   plan_id が無い従来契約（null）には一切出さない
// - 存在しない成果・上達保証の文言を使わない
//
// ⚠️ plan_id は migration 20260819100000（remote未適用）の列。適用されるまで
//    すべての利用者で planId が null になり、この導線は**自動的に休眠**する。
export type UpsellMoment =
  | 'expiry_soon'      // 有効期限の7日前
  | 'after_sessions'   // AI会話を3回以上使った後
  | 'day7'             // 利用開始から7日後
  | 'summary';         // 30日間の学習まとめを表示した時（まとめ画面側から明示指定）

export interface UpsellInput {
  /** ai_course_access.plan_id。null＝従来契約 or migration未適用 → 出さない */
  planId: string | null;
  nowISO: string;
  validFromISO: string | null;
  validUntilISO: string | null;
  /** AI会話セッションの数（直近の取得分でよい） */
  sessionCount: number;
  /** 最後に案内を閉じた日時（未閉じなら null） */
  dismissedAtISO: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** 閉じてから再表示までの日数（邪魔にならないこと優先） */
export const UPSELL_SNOOZE_DAYS = 7;

/**
 * いま案内を出してよいか。出すなら、どの文脈（moment）か。
 * 優先度: 期限が近い > 会話3回 > 開始7日（期限前がいちばん判断に直結するため）
 */
export const upsellMomentFor = (i: UpsellInput): UpsellMoment | null => {
  if (i.planId !== 'ai-month') return null;
  const now = Date.parse(i.nowISO);
  if (Number.isNaN(now)) return null;
  if (i.dismissedAtISO) {
    const dismissed = Date.parse(i.dismissedAtISO);
    if (!Number.isNaN(dismissed) && now - dismissed < UPSELL_SNOOZE_DAYS * DAY_MS) return null;
  }
  if (i.validUntilISO) {
    const until = Date.parse(i.validUntilISO);
    if (!Number.isNaN(until) && until > now && until - now <= 7 * DAY_MS) return 'expiry_soon';
  }
  if (i.sessionCount >= 3) return 'after_sessions';
  if (i.validFromISO) {
    const from = Date.parse(i.validFromISO);
    if (!Number.isNaN(from) && now - from >= 7 * DAY_MS) return 'day7';
  }
  return null;
};

/** 案内文（成果の約束をしない。方向設計という事実だけを言う） */
export const UPSELL_COPY = {
  ja: {
    body: '自分だけで続けるのが難しい部分はありませんか？6か月伴走コースでは、安田翔が学習の方向を一緒に設計します。',
    cta: '伴走コースについて無料相談する',
    dismiss: '閉じる',
  },
  zh: {
    body: '有没有觉得靠自己坚持有点难的部分？在6个月陪跑课程里，安田翔会和你一起设计学习方向。',
    cta: '免费咨询陪跑课程',
    dismiss: '关闭',
  },
} as const;

/* ── 「閉じた」状態の保存（端末内・個人情報なし） ── */
const DISMISS_KEY = 'ai-course-upsell-dismissed-at';

export const readUpsellDismissedAt = (storage: Pick<Storage, 'getItem'>): string | null => {
  try { return storage.getItem(DISMISS_KEY); } catch { return null; }
};

export const writeUpsellDismissedAt = (storage: Pick<Storage, 'setItem'>, nowISO: string): void => {
  try { storage.setItem(DISMISS_KEY, nowISO); } catch { /* noop */ }
};
