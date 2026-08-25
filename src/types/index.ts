export interface Tournament {
  id: number;
  title: string;
  level: string;
  event_type: string;
  location: string;
  event_date: string;
  /** 追加受付の締切（override）。NULL の大会は共通ルール（14日前）のまま */
  late_entry_until?: string | null;
  start_time: string;
  end_time: string;
  capacity: number;
  entry_fee: number;
  cancel_deadline?: string | null;
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
  payment_method?: 'credit' | 'paypay' | 'bank' | null;
  payment_status?: 'pending' | 'completed' | 'failed';
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
  // （src/pages/blogSeo.ts の pickBlogLang が唯一の判定箇所）。
  // content_zh は content と同じHTML骨格を保つ（scripts/blog/apply-zh.mjs が保証する）。
  title_zh?: string | null;
  excerpt_zh?: string | null;
  content_zh?: string | null;
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
