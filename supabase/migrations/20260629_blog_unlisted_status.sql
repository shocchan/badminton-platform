-- Add 'unlisted' status to blog_posts
-- No enum type exists; status is a text column, so no ALTER TYPE needed.
-- This migration is a no-op placeholder documenting the allowed values:
-- 'draft', 'unlisted', 'published'

COMMENT ON COLUMN blog_posts.status IS 'draft | unlisted | published';
