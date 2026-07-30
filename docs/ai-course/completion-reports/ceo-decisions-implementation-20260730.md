# 完了報告: CEO確認完了反映＋World Map操作性＋Support統一＋教材表示整合（2026-07-30）

```
CEO Product Check                : COMPLETE（記録: decisions/ceo-decisions-20260730.json）
Whole Product Complete on Staging: YES（実ブラウザ確認済み・console error 0）
Production Ready                 : NO（openゲート: legal / 実機正式確認 / remote migration / remote RLS / production承認）
Cleanup                          : PENDING_APPROVAL（承認文字列なし・remote write 0のまま）
```

HEAD: e054f34（253f2ac=本体・e054f34=Map chip修正）／ branch feature/ai-course-learning-polish
tests **1149 PASS**（+22）・tsc 0・lint E46（ベースライン47→46・新規0）・build OK・staging index-GepeUUGa.js

## 反映内容（§2〜§20）
1. **CEO決定記録**: decisions/ceo-decisions-20260730.json（decided/openGates分離・notAllGatesComplete=true・機械検証テスト付き）
2. **正式名称**: 世界=ミナモ列島・Chapter1=**霧の港町**・Area10件（オウライ街道/ハタラキ街を含む）。旧称（はじまりの町/トオリミチ/ハタラキ区）learner-visible **0**（テスト固定）。route ID/progress IDは不変
3. **地名方針B**: atlas nameZh=「日本語固有名詞（中国語gloss）」形式（ソラノ塔（N2语法之塔）等・CEO指定gloss採用）。地図＝ja短縮形、Area detail/塔/庭園/港/第1章＝併記、aria=「进入「X」。学习Y。」。地図⇔詳細の同一性断絶を解消
4. **Support統一**: learnerアプリ面の人間窓口= **info@kawabado.com のみ**（WeChat/Shocchance/微信=0テスト固定）。設定に「お問い合わせ/联系我们」セクション＋mailto CTA、issue報告失敗時のメールfallback（正直表示）。issue報告成功時の「送信しました」はai_issue_reportsへの実送信のため正直。**LPの無料相談WeChatモーダルは軸1商談導線（learner窓口ではない）と判断し対象外**——別判断が必要ならお知らせください
5. **World Map主要ナビ化**: 島Visual+状態タグ+名前+chevron=単一button（全10・44px+・overlay重複を幾何テストで0）。hover/focus-visible=浮上(-6px)・拡大(1.04)・影・gloss・テーマ・「この街へ」。Enter/Space遷移。mobile常時chevron+pressed(0.98)。状態別（現在地/復習あり/完了✓/未開放=非活性+開放条件・現在locked該当なし）。reduced motion完全対応（motion-safe接頭辞+animate停止）
6. **N2統合**: 024→023・104→102（similar/contrast吸収）、独立維持5件を本編昇格 → **canonical 178＋alias 2＝原本180**。進捗はcanonical正規化＋alias元キーのマージ読み取りで引き継ぎ（テスト3件）。塔/テーマ/LPの表記178へ
7. **教材・Visual**: provisionally_accepted_for_beta として記録（humanReviewed/approved昇格なし・全draft維持）
8. **Cognate二層**: docs/ai-course/cognate-taxonomy.md＋両定義ファイルに型コメント。出身/都合は分類不変のまま`CONTRAST_ROUTED_JAPANESE_SPECIFIC`で対照問題を通常出題へ接続（二重出題なし・core_meaning先頭で初学者負荷配慮・テスト）
9. **Coverage表現**: 「全140語が使い分け問題」を廃し「Stage2接続140/140・使用直接測定139/140・勉強するは日中対照＋活用」に統一（docs訂正＋テスト固定）
10. **LP**: 「N2準備中」→「N2文法はソラノ塔で学べます」（ja/zh）。虚偽の「人間確認済みの教材から公開」dead key削除。ベータ/先行モニター表現は維持

## 実ブラウザ確認（staging・learner画面・console error 0）
- desktop 1280 ja/zh: Map通常/hover（ソラノ塔浮上+パネル実写）/focus/Enter遷移（カタチの遺跡→Area detail）/現在地/完了/復習あり表示/設定Support（mailto実在）/塔178
- mobile 390（headlessハーネス実測）: 全10街名フル表示・chevron常時・状態タグ・横scrollなし・重なりなし（ja/zh PNG取得）
- 検証中に発見した390px街名切詰めをその場で修正（e054f34）

## 開示・残課題
- 実機（物理端末）確認は未実施のまま**open**（headless実測は代替であり正式確認ではない）
- lockedエリアは現在存在しない（全10開放）。UI/テストはlocked対応済みで、将来ゲート導入時に嘘のない表示が可能
- 偶発会話Cleanup（session cd58eebf・7行）は**PENDING_APPROVAL**。実行には `APPROVE_CEO_TEST_SESSION_CLEANUP_A` が必要（cleanup-packet-20260730.md §4・packetは未commitのまま保持）
