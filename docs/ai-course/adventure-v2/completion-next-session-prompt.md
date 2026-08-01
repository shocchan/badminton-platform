# N2／N3 Adaptive Adventure Completion — 次セッション開始プロンプト

~/badminton-platform の `feature/ai-course-adventure-v2-completion` で継続してください。

状態: **Phase A〜H完了・Pilot Complete=NO（残2task）**・staging反映済み

## 最初に読む

1. `docs/ai-course/adventure-v2/completion-current-state.md`
2. `docs/ai-course/adventure-v2/completion-final-report.md`（未完理由・P2/P3）
3. `docs/ai-course/adventure-v2/completion-work-queue.json`

## resumeFrom: E-3

**E-3: ミニ模試の section遷移UI**（`advMock.ts` の仕様は実装済み・画面だけ無い）
- `buildMockSpec()` が返す sections を順に実行する Runner を作る
- 必須: section遷移・残り時間・未回答警告・終了確認・section別結果・skill別evidence記録（timed=true）
- 出題は `loadGrammarPools()` / `readingPool()` / `listeningPool()` から
- 4技能が揃わない場合の表示（準備中／一部科目）は `MockSpec.titleJa` に従う
- **timed=true の attempt を記録すると総合準備度が判定可能になる**（現在ここが塞がっている）

## 次: G-3

**G-3: AI会話E2E 1周**（実API・CEO test learnerのみ）
- Today Adventure →（会話ミッション）→ 会話 → レポート → 言い直し → 復習登録 → 完了 → 次回
- mockだけでE2E完了扱いにしない。実課金額・token使用量は秘密値なしで記録

## 検証コマンド

```
npm run validate:ai-course
npx vitest run
npm run build
node scripts/ai-course/generate-listening-audio.mjs --verify
```

## staging検証の手順

```
node scripts/ai-course/stage-verify-session.mjs --create --out <path>
node scripts/ai-course/seed-adventure-profile.mjs <userId> N2   # onboardingを飛ばす
# 検証後は必ず
node scripts/ai-course/stage-verify-session.mjs --cleanup <userId>
```

⚠️ staging確認時は `dist/assets/index-*.js` と配信中のhashが一致するか必ず確認。
ズレていれば edge キャッシュ → URLに `&cb=<秒>` を付ける。

## 制約（不変）

本番/main/remote migration/learner invite/Stripe 禁止。既存learnerデータ非破壊。
教材の全面再生成禁止。誤問よりHOLDを選ぶ。人間確認前でもAI側taskは止めない。
