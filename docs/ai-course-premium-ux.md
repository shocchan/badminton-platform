# Premium UX（Phase 2D §14-§17・§27-§29）

## Visual Depth System（§15）
Depth0=背景/静的テキスト（影なし）／Depth1=情報カード（境界線のみ）／
Depth2=クリック可能カード・選択肢（card-interactive/action-choice）／
Depth3=第一CTA・Sticky・Hero（action-primary＋depth shadow）／Depth4=モーダル（多用しない）。
トークン: --action-shadow-*/--action-depth/--card-interactive-shadow/--transition-fast（index.css）。

## ナビ案A（§27・labPreviewのみ）
ホーム/ことば/日本語のしくみ/成長/設定の5項目。ロードマップ・学習記録は成長画面上部のサブリンクへ統合。
旧URL・旧画面は削除せず直接アクセス可。一般受講生ナビは不変。モバイルは折返し・横スクロールなし。

## ロードマップ・進捗（§20-§21）
語彙ロードマップ画面: 目標→現在パック（カバー画像枠+状態+分離2バー: 学習開始/問題確認）→診断CTA→
今日の3語/3分復習→次のパック。self_knownとverifiedを同じバーに混ぜない。数値＋ラベル併記。

## motion（§28）
hover -1px/active +2px・100-180ms・prefers-reduced-motionで全transform抑制。紙吹雪・常時アニメなし。

## 未実施（Phase 2E候補）
ホームHeroの大型ビジュアル背景（パックカバー画像の生成承認後に適用）・例文の語別ルビ（形態素データ要）・
タイポグラフィスケールの全画面統一。
