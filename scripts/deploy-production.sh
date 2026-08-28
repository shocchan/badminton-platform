#!/bin/bash
# 本番デプロイは、このフォルダからは行えません（2026-08-28）
#
# Cloudflare Pages の配信は差分ではなく**全置換**です。
# 本番サイトは、このスクリプトを実行したフォルダの姿へ丸ごと入れ替わります。
# ワークツリーが4つあり、それぞれ別ブランチを開いていたため、
# 実行するフォルダが違うだけで本番が別物になっていました。
# 2026-08-28 だけで3回起き、AIコースのログインが消えて
# 実在の生徒3人がログインできなくなりました。
#
# 対策として、本番へ出せるフォルダを1つに固定しました。
# ここは「出せない側」です。中身は消していません（git log で戻せます）。

DEPLOY_DIR="/Users/shocchan/badminton-sales"
DEPLOY_BRANCH="integration/unify-2026-08-28"
CUR_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')

cat <<MSG

🛑 このフォルダからは本番へデプロイできません

   いまのフォルダ  : $(pwd)
   いまのブランチ  : ${CUR_BRANCH}

   本番へ出せるのは1か所だけです:
     フォルダ : ${DEPLOY_DIR}
     ブランチ : ${DEPLOY_BRANCH}

   理由: Cloudflare Pages は全置換です。ここから出すと、
        ${DEPLOY_BRANCH} にしか無いものが本番から消えます。
        2026-08-28 にこれが3回起き、生徒3人がログイン不能になりました。

   進めるには:
     1) ここでの作業をコミットする
          git add -A && git commit -m '...'
     2) デプロイ用フォルダへ移動する
          cd ${DEPLOY_DIR}
     3) この作業を取り込む
          git merge ${CUR_BRANCH}
     4) そこで実行する
          ./scripts/deploy-production.sh

   詳細: ${DEPLOY_DIR}/docs/DEPLOY.md

MSG
exit 1
