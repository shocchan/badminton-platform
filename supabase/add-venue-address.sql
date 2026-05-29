-- Add venue_address column to tournaments table
ALTER TABLE tournaments
ADD COLUMN IF NOT EXISTS venue_address TEXT;

-- Add comment for documentation
COMMENT ON COLUMN tournaments.venue_address IS '会場住所（会場名ではなく詳細な住所）';
