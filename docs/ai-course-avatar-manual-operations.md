# アバター手動運用手順（Avatar 2・管理者用）

原則: **元写真は学習システムに一切保存しない**。実ユーザー名・実userId・実画像URLをこの文書やログ・Gitへ残さない。

## 1. 受け取り〜生成
1. 受講生へ案内: 本人（または使用許可のある）写真のみ／他人が写らない／背景に個人情報なし／身分証・書類は送らない
2. WeChatで写真を受領（アプリへアップロードしない）
3. ChatGPT等でアニメ風アバターを生成（翔子・悠斗と調和する温かい作風／過度な美化・年齢改変・肌色変更・性別表現変更・幼児化なし／文字・ロゴなし／上半身／四辺余白／逆光・白グローなし）
4. 人間が品質確認（小さく表示しても顔が識別できるか）
5. **受領した元写真を端末・チャット履歴から削除**（生成完了後すみやかに）

## 2. 登録（Supabase Dashboard・service role）
- 受け入れ条件: **PNG推奨（透過）／WebP可（透過保持できる場合のみ）／2MB以下／推奨 512×683px以上（3:4）**。SVG不可。拡張子とMIMEの両方を確認
- バケット: `ai-course-avatars`（private・publicにしない）
- パス: `{userId}/candidates/avatar-{uuid}.png`（userIdは auth.users.id。**登録前にダブルチェック**）
- 登録後、対象learnerの `settings` に以下をマージ（Dashboard SQL・他キーを消さないこと）:
  `pendingAvatarObjectPath = '{userId}/candidates/avatar-xxxx.png'` / `avatarReviewStatus = 'pending'`

## 3. 本人確認フロー
- 学習者のホームに自動でプレビューカードが出る（強制モーダルなし）
- 承認→ `avatarObjectPath` へ昇格・`approved`／作り直し→ `revision_requested`（既存承認分は維持・WeChatで要望を受けて再生成）
- 「あとで確認」はその画面限り（次回また表示）

## 4. 差し替え・退会・障害
- 差し替え: 新candidateを登録→pendingを更新（旧候補ファイルは月次で手動削除）
- 退会: learner削除でsettingsは消える。Storageの `{userId}/` フォルダをDashboardから手動削除
- 誤ユーザーへ登録した場合: 直ちに該当オブジェクト削除＋settingsのpending系キーを除去（本人フォルダ以外は本人に見えない=RLSで露出しないが、速やかに撤去）
- 障害時: アバターが出なくてもイニシャル表示で学習は継続できる（機能制限なし）
