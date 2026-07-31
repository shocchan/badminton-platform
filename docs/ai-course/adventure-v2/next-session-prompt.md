# Adventure V2 — 次セッション開始プロンプト

~/badminton-platform の `feature/ai-course-adaptive-adventure-v2` で継続してください。

状態: **UX Hotfix Ready・JLPT Assessment Integrity完了・staging反映済み・CEO確認待ち**

1. `docs/ai-course/adventure-v2/current-state.md` を読む
2. CEOフィードバックがあれば最優先で反映 → staging再デプロイ → **実画面確認**
   - ⚠️ 確認時は必ず chunk hash（`index-*.js` / `AdvShell-*.js`）が `dist/assets/` と一致するか見る。
     一致しなければ edge キャッシュ。URLに `&cb=<秒>` を付ける
3. フィードバック待ちの間に着手可能な残タスク（優先順）:
   - P2-1: 中国語解説の未引用日本語 974件の整理（`generated/language-integrity.json` の field別内訳順）
   - P2-2: 読解専用問題の作成（現在は準備度「未判定」で正直運用）
   - P3-1: `ending_category_giveaway` 警告5件の人間レビュー
   - P3-2: Mapの「内容を見る」を `window.alert` から専用パネルへ
4. 制約: 本番/main/remote migration/learner invite禁止。教材の全面再生成禁止。
   staging検証は `stage-verify-session.mjs` のfixtureを使い**必ず --cleanup**
5. 検証コマンド: `npm run validate:ai-course` / `npx vitest run` / `npm run build`
