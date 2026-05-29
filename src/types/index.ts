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
}

export interface BlogPost {
  id: number;
  tournament_id?: number;
  title: string;
  content: string;
  excerpt?: string;
  image_url?: string;
  image_position?: string;
  published_at: string;
  created_at: string;
  updated_at: string;
}
