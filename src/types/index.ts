import type { PaymentMethod } from '../lib/payment';
export interface Tournament {
  id: number;
  title: string;
  level: string;
  event_type: string;
  location: string;
  event_date: string;
  start_time: string;
  end_time: string;
  capacity: number;
  entry_fee: number;
  cancel_deadline?: string | null;
  // 追加受付の個別override（ISO8601 timestamptz / 本番DBは timestamptz 列）。
  // NULL の大会は共通ルール（14日前）のまま。詳細は src/lib/entryDeadline.ts
  // ※両ブランチが同じ列を別の位置に宣言していたため、1つに統合した（重複宣言はTSエラー）
  late_entry_until?: string | null;
  description?: string;
  edition?: number | null;
  visibility?: 'draft' | 'unlisted' | 'published';
  status: 'active' | 'cancelled';
  payment_required: boolean;
  payment_deadline?: string;
  bank_account?: string;
  paypay_id?: string;
  venue_address?: string;
  created_at: string;
  updated_at: string;
}

export interface Entry {
  id: number;
  tournament_id: number;
  name: string;
  phone: string;
  email: string;
  partner_name?: string;
  notes?: string;
  entry_date: string;
  created_at: string;
  status: 'confirmed' | 'waitlist' | 'cancelled';
  cancel_token?: string;
  cancelled_at?: string;
  cancel_reason?: string;
  payment_method?: PaymentMethod | null;
  // 'refunded' はキャンセル時の返金処理で実際に入る（本番DBに存在する値）
  payment_status?: 'pending' | 'completed' | 'failed' | 'refunded';
  stripe_payment_id?: string | null;
  paid_at?: string | null;
}

export interface BlogPost {
  id: number;
  tournament_id?: number;
  title: string;
  content: string;
  content_type?: 'html' | 'markdown';
  excerpt?: string;
  // 中国語版（2026-08-25）。同じ記事・同じ id のまま言語で表示を切り替える。
  // NULL/空 = 未翻訳 → 中国語UIでも日本語のまま出し「日文」バッジを付ける
  // （src/pages/blogSeo.ts の pickBlogLang / src/lib/blogI18n.ts の両方が読む）。
  // content_zh は content と同じHTML骨格を保つ（scripts/blog/apply-zh.mjs が保証する）。
  // 4列とも本番DB blog_posts に実在する（2026-08-28 information_schema で確認済み）。
  title_zh?: string | null;
  excerpt_zh?: string | null;
  content_zh?: string | null;
  /** 中国語版を作った時点の日本語版のハッシュ。ズレていたら翻訳が古い（自動生成の再翻訳判定に使う） */
  content_zh_hash?: string | null;
  image_url?: string;
  image_position?: string;
  tags?: string[];
  status?: 'draft' | 'unlisted' | 'published';
  youtube_url?: string;
  external_url?: string;
  published_at: string;
  created_at: string;
  updated_at: string;
  view_count?: number;
  auto_generated?: boolean;
  auto_generated_at?: string;
}
