# しくみラボ Phase 2B: MVP拡張（実装記録）

実施日: 2026-07-26 ／ ブランチ: feature/ai-course-learning-polish ／ 全教材 draft・labPreview限定

## 目的
第1単元のみの試作を「日本語のしくみラボMVP全体」へ拡張する。
複数単元選択・今日の推薦・語彙/規則の体系閲覧・軸別確認・復習候補・試作履歴・
lazy loadによるbundle非肥大化・将来のSupabase永続化準備。**一般受講生へは公開しない。**

## 実装範囲
- 6単元（unit1既存維持＋unit2〜6新規、全draft）
- 共通エンジン: 10問題タイプ→4メカニクス（choice/input/order/matching）、決定的採点、
  attemptSeedシャッフル、正規化（normalizeJaAnswer/normalizeKanaAnswer）、
  deriveMasteryState（not_seen/familiar/guided/independent/retained）
- 5領域UI: 今日／ことば／しくみ／復習／履歴（FoundationLabShell配下・下部ナビ非増設）
- 仮進捗: SessionFoundationProgressRepository（sessionStorage・schemaVersion・PIIなし）
- lazy load: ラボ全体＋単元別チャンク（詳細→ ai-course-foundation-lazy-loading.md）
- migration草案＋RLS設計（未適用・詳細→ ai-course-foundation-progress-persistence.md）

## 6単元の構成
| # | id | 単元 | 前提 | 推奨週 | 分 | 語彙 | 規則 | 問題 |
|---|---|---|---|---|---|---|---|---|
| 1 | fu-selfintro-1 | 自己紹介で使う基本のことば | — | 1 | 6 | 11 | 3 | 11 |
| 2 | fu-verbs-masu-nai | 基本動詞と「ます形・ない形」 | unit1 | 2 | 8 | 12 | 4 | 12 |
| 3 | fu-te-form | 基本動詞の「て形」 | unit2 | 3 | 8 | 11(共有) | 6 | 12 |
| 4 | fu-particles-wa-ga-wo | 助詞「は・が・を」 | unit1 | 2 | 8 | 6(共有含) | 4 | 11 |
| 5 | fu-particles-ni-de-e | 助詞「に・で・へ」 | unit1 | 3 | 8 | 6(共有含) | 3 | 11 |
| 6 | fu-numbers-shopping | 数字・時間・値段と買い物 | unit1 | 4 | 8 | 8(共有含) | 5 | 11 |

- 語彙は foundationItemBank で単一登録し単元間で同一Item参照（行く=unit2/3/5、住む=unit1/5、日本語=unit1/4 等）
- 前提はソフト（「先に◯◯を確認すると理解しやすい」表示のみ・ハードロックなし）
- 軸別最低問題数の例外: 単元4・5はform/connectionの代わりにparticle次元を主とする。
  単元6は「分」の特殊読み（一分・三分・六分・八分・十分）をMVP対象外とし次段階で扱う。

## 安全条件（維持）
draft教材のみ／adminOverrides.labPreview===trueのみ表示／一般受講生・Andyさん非表示／
DB・migration適用・RLS適用・Edge・AI APIなし／正式進捗保存なし／
current_week・masteryState・XP・会話復習へ不接触／本番デプロイ・mainマージなし。

## Phase 2C へ進む条件
1. CEOによる6単元のdraft教材レビュー（docs/foundation-review/）
2. 正式保存方式の承認（専用テーブルmigrationの適用判断・適用タイミング）
3. レビュー済み単元の draft→beta 昇格ルール確定
4. 一般受講生への公開範囲・課金プランとの関係の決定

## 遅延読み込み計画（Phase 2A時点の計画・2Bで実施済み）
Phase 2Aで計画した React.lazy 化・単元別チャンク分割は本Phaseで実装済み。実測は lazy-loading docs を参照。
