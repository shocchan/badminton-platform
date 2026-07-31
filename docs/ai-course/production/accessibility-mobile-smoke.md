# 自動アクセシビリティ／モバイル smoke（2026-07-31）

対象: staging（RCと同一build）／viewport 375×812（mobile preset）

実機（VoiceOver / TalkBack）での確認は **DEFERRED_BY_CEO_UNTIL_RELEASE**。
ここでは、実機なしで機械的に確認できる範囲を固定する。

## 結果

| 検査 | ja | zh | 備考 |
|---|---|---|---|
| 横スクロールの発生 | 0 | 0 | `scrollWidth - clientWidth` |
| 名前のない操作要素 | 0 | 0 | text / aria-label / title のいずれも無いbutton・link |
| alt のない img | 0 | 0 | |
| h1 の数 | 1 | 1 | |
| `<html lang>` | ja | zh | |
| console error | 0 | 0 | セッションなしの新規タブ |
| 法務リンクのタップ標的 | **44px** | **44px** | 8本すべて |

## 今回見つけて直したもの

法務フッターに追加した8本のリンクが **19px** しかなく、モバイルのタップ標的として小さすぎた。
文字サイズは変えず、当たり判定だけ `min-h-11`（44px）へ広げた。

残る小さい標的は `中文版 / 日本語版` の言語切替（22px・既存分）。
LPヘッダーにも同じ切替があり、そちらは十分な大きさなので機能は塞がらない。P3として記録する。

## 実機でしか確認できない項目（DEFERRED_BY_CEO_UNTIL_RELEASE）

- VoiceOver / TalkBack の実読み上げ
- マイク許可を伴うAI音声会話
- 中国語IMEでの入力
- 別端末間の再開（cross-device resume）

`docs/ai-course/production/device-check-packet.md` に手順あり。
