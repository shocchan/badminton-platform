-- Add rich editor fields to blog_posts
ALTER TABLE blog_posts
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published')),
  ADD COLUMN IF NOT EXISTS content_type text NOT NULL DEFAULT 'html' CHECK (content_type IN ('html', 'markdown')),
  ADD COLUMN IF NOT EXISTS youtube_url text,
  ADD COLUMN IF NOT EXISTS external_url text;

-- Backfill: existing posts are published
UPDATE blog_posts SET status = 'published' WHERE status IS NULL OR status = '';
