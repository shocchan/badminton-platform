CREATE TABLE tournaments (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  level VARCHAR(50) NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  location VARCHAR(100) NOT NULL,
  event_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  capacity INT NOT NULL,
  entry_fee INT NOT NULL,
  cancel_deadline DATE NOT NULL,
  description TEXT,
  status VARCHAR(20) DEFAULT 'active',
  payment_required BOOLEAN DEFAULT false,
  payment_deadline DATE,
  bank_account TEXT,
  paypay_id TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE entries (
  id BIGSERIAL PRIMARY KEY,
  tournament_id BIGINT REFERENCES tournaments(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  email VARCHAR(100) NOT NULL,
  notes TEXT,
  entry_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE blog_posts (
  id BIGSERIAL PRIMARY KEY,
  tournament_id BIGINT REFERENCES tournaments(id) ON DELETE SET NULL,
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  excerpt VARCHAR(300),
  image_url VARCHAR(500),
  published_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tournaments_select_public" ON tournaments FOR SELECT USING (true);
CREATE POLICY "entries_insert_public" ON entries FOR INSERT WITH CHECK (true);
CREATE POLICY "blog_posts_select_public" ON blog_posts FOR SELECT USING (true);
