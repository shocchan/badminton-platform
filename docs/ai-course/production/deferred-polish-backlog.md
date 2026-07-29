# Deferred Polish Backlog（P2／P3・FOREST FIRST）

全体実装を止めないために後回しにした改善点。P0/P1は含めない（P0/P1は即修正）。

## P2（品質改善・機能は成立している）

| # | 領域 | 内容 |
|---|---|---|
| P2-1 | 語彙イラスト | approved 0のため、learnerには全語が中立図形（共通Visual kit）表示。draft画像115件の承認・品質改善はVisual Backlog |
| P2-2 | しくみラボ進捗 | foundationProgressはsessionStorage（同一タブのreloadは保持・タブを閉じると消える）。localStorage化はhardeningで検討 |
| P2-3 | Home施設カード | 施設が6枚になったためlg 3列に変更。地図上の施設配置（F3のWorld Map統合）で再設計余地 |
| P2-4 | N2旧content overlay | n2GrammarContent.tsに `imilarGrammarIds` というtypo疑いのフィールドあり（3箇所・類似リンクが効いていない可能性）。新draft接続後に整理 |

## P3（文言・装飾）

| # | 領域 | 内容 |
|---|---|---|
| P3-1 | Loading演出 | 各stepのLoadingは汎用文言。世界観に合わせた演出は後日 |

## question-quality-backlog

問題品質のP2は `question-quality-backlog.json` へ（§11）。
