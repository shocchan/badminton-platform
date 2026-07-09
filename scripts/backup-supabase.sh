#!/bin/bash
# Supabase 全テーブルバックアップスクリプト
# 使い方: SUPABASE_ACCESS_TOKEN=<sbp_トークン> ./scripts/backup-supabase.sh
# トークンは ~/.supabase_backup_token にも置ける（chmod 600）
#
# 出力: ~/ai-company/backups/kawabado/YYYY-MM-DD/<table>.json
# 背景: 2026-07-07 に blog_posts を誤削除した事故を受けて導入。
#       無料プランはバックアップ機能が無いため、日次でJSONダンプを取る。

set -euo pipefail

PROJECT_REF="jdkwijdphlkrcoiggfqw"
TOKEN="${SUPABASE_ACCESS_TOKEN:-$(cat ~/.supabase_backup_token 2>/dev/null || true)}"
if [ -z "$TOKEN" ]; then
  echo "ERROR: SUPABASE_ACCESS_TOKEN が未設定（~/.supabase_backup_token も無し）" >&2
  exit 1
fi

DEST=~/ai-company/backups/kawabado/$(date +%F)
mkdir -p "$DEST"

TABLES=$(curl -sS -X POST "https://api.supabase.com/v1/projects/$PROJECT_REF/database/query" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"query": "select tablename from pg_tables where schemaname = '\''public'\'' order by tablename"}' \
  | python3 -c "import json,sys; print('\n'.join(r['tablename'] for r in json.load(sys.stdin)))")

TOTAL=0
for T in $TABLES; do
  printf '{"query": "select coalesce(jsonb_agg(t), '\''[]'\''::jsonb) from %s t"}' "$T" > /tmp/backup_q.json
  curl -sS -X POST "https://api.supabase.com/v1/projects/$PROJECT_REF/database/query" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    --data @/tmp/backup_q.json \
    | python3 -c "
import json, sys
rows = json.load(sys.stdin)[0]['coalesce']
json.dump(rows, open('$DEST/$T.json', 'w'), ensure_ascii=False, indent=1, default=str)
print('$T:', len(rows), 'rows')
"
  TOTAL=$((TOTAL + 1))
done

# auth.users（メール・メタデータのみ。パスワードハッシュは含めない）
printf '%s' '{"query": "select coalesce(jsonb_agg(jsonb_build_object('\''id'\'', id, '\''email'\'', email, '\''meta'\'', raw_user_meta_data, '\''created_at'\'', created_at)), '\''[]'\''::jsonb) from auth.users"}' > /tmp/backup_q.json
curl -sS -X POST "https://api.supabase.com/v1/projects/$PROJECT_REF/database/query" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  --data @/tmp/backup_q.json \
  | python3 -c "
import json, sys
rows = json.load(sys.stdin)[0]['coalesce']
json.dump(rows, open('$DEST/auth_users.json', 'w'), ensure_ascii=False, indent=1, default=str)
print('auth_users:', len(rows), 'rows')
"

echo "✅ backup complete: $DEST（public ${TOTAL}テーブル + auth_users）"
