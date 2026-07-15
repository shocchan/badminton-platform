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
