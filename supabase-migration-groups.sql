-- ======================================================
-- kawabado.com マルチグループ対応マイグレーション
-- Supabase SQL Editor で実行してください
-- ======================================================

-- Step 1: groupsテーブル作成
CREATE TABLE IF NOT EXISTS groups (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  admin_password text NOT NULL,
  enable_member_charge boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Groups are viewable by everyone"
  ON groups FOR SELECT USING (true);

-- Step 2: 初期データ投入
-- ※ chaoxianzuのパスワードはしょっちゃんが変更してください
INSERT INTO groups (slug, name, admin_password, enable_member_charge)
VALUES
  ('kawaguchi-warabi', '川口・蕨バド', 'Hiranosy0709', true),
  ('chaoxianzu', '在日朝鮮族バドミントン協会', 'CHANGE_THIS_PASSWORD', false)
ON CONFLICT (slug) DO NOTHING;

-- Step 3: activitiesテーブルにgroup_idを追加
ALTER TABLE activities ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES groups(id);

-- 既存データを川口・蕨グループに割り当て
UPDATE activities
SET group_id = (SELECT id FROM groups WHERE slug = 'kawaguchi-warabi')
WHERE group_id IS NULL;

-- Step 4: membersテーブルにgroup_idを追加（将来用）
ALTER TABLE members ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES groups(id);

UPDATE members
SET group_id = (SELECT id FROM groups WHERE slug = 'kawaguchi-warabi')
WHERE group_id IS NULL;

-- ======================================================
-- 実行後の確認クエリ
-- SELECT * FROM groups;
-- SELECT id, title, group_id FROM activities LIMIT 5;
-- ======================================================
