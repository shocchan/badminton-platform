# Adventure V2 — 次セッション開始プロンプト

~/badminton-platform の `feature/ai-course-adaptive-adventure-v2` で継続してください。

状態: **V2 Technical Complete（RC tag `ai-course-adventure-v2-rc1`）・staging反映済み・CEO確認待ち**

1. `docs/ai-course/adventure-v2/current-state.md` と `final-report.md` §43（P2/P3残）を読む
2. CEOフィードバックがあれば最優先で反映 → staging再デプロイ → 実画面確認
3. フィードバック待ちの間に着手可能な残タスク（優先順）:
   - P2-a: 読解専用問題（既存例文からの内容一致型・validated_beta基準）
   - P3-a: 診断の会話診断を既存text会話runtime 1〜2往復に接続（D-011の本実装）
   - P2-c: 言い直しstepの素材0時の代替（今日の表現の復唱練習）
4. 制約: 本番/main/remote migration/learner invite禁止。教材昇格は人間のみ。
   staging検証は stage-verify-session.mjs のfixtureを使い**必ず--cleanup**
5. 仕様正準: CEO指示（ADAPTIVE ADVENTURE V2 §0〜§34）＋ decision-log.md
