# 【V2 UX CLARITY HOTFIX FINAL】

作成: 2026-07-31 ／ branch `feature/ai-course-adaptive-adventure-v2`

| 項目 | 結果 |
|---|---|
| Home Primary CTA | **1件**（実測: `bg-blue-600` ボタン数 = 1） |
| Today Steps Clear | **YES**（番号連番・所要時間・成功条件が一致） |
| Home Secondary Menu | **COLLAPSED**（「ほかの学習を見る」展開式・既定閉） |
| Map Current CTA | **1件**（現在地のみ「ここから続ける」） |
| Repeated Challenge CTA | **0件**（実測: 「挑戦」ボタン 0／「内容を見る」7） |
| Battle Locale Integrity | **PASS** |
| Cyrillic Contamination | **0件** |
| Distractor Validity | **PASS**（出題される全問が blocking issue 0） |
| Explanation ja／zh | **PASS**（正解・意味・理由・中文補助・他が違う理由・出典・例文） |
| Readiness Scope | **ACCURATE**（文法100%でも総合は未判定＋理由を明示） |
| Selected Companion | **CONNECTED**（onboardingで選んだSVGをHomeに表示） |
| P0 | 0 |
| P1 | 0 |
| P2 | 3（下記） |
| P3 | 2（下記） |
| **UX Hotfix Ready** | **YES** |
| **Production Deploy** | **NOT_EXECUTED** |

## 詳細

- **branch / HEAD**: `feature/ai-course-adaptive-adventure-v2` / 本コミット（origin push済）
- **staging URL**: https://staging.badminton-platform.pages.dev （deploy `ea4318a4`）
- **CEO確認URL**: `https://staging.badminton-platform.pages.dev/ja/ai-course?v2=1`（zh: `/zh/ai-course?v2=1`）
  - ⚠️ 旧画面が出る場合はURL末尾に `&cb=1` を付ける（Cloudflare edgeキャッシュ対策）

### Home before → after

| | before | after |
|---|---|---|
| 第一ビュー | 目的地・現在地・試験日・週進捗・復習・新文法・成功条件・攻略マップ・準備度・復習の庭・先生準備を**同時表示** | ①目標と残日数 ②相棒の一文 ③今日の冒険（全step＋所要）④今日のゴール ⑤**CTA1つ** |
| CTA | 「今日の冒険を始める」固定 | **次の1動作を名指し**（「まず『単元のことばを学ぶ』から始める」→完了後「続ける」） |
| 二次メニュー | 4ボタンを第一階層に並列表示 | 「ほかの学習を見る」に折りたたみ（第一CTAより弱い表現） |
| 試験科目 | 表示なし | 「今鍛えている試験力：言語知識｜文法」を常時表示 |
| 相棒 | emoji | onboardingで選択したSVG＋次の行動を言う一文 |

### Map before → after

| | before | after |
|---|---|---|
| 形 | 同一カード＋「挑戦」ボタンが全stageに並ぶメニュー | **縦型roadmap**（線＋ノード） |
| CTA | 「挑戦」×7 | 現在地のみ「ここから続ける」、先は「内容を見る」 |
| 状態 | 区別なし | 攻略済み／現在地／おすすめ／閲覧できます／総合模試はまだ準備できません |

### Battle before → after

| | before | after |
|---|---|---|
| 採点 | `answerIndex`（配列位置） | **`correctChoiceId`**（表示位置を一切見ない） |
| 提示順 | 素材の並び順のまま | attempt開始時に決定的シャッフル＋battle内バランス |
| 解説 | 中文1行 | 正解／文法の意味／正しい理由／中文補助／**他の選択肢が違う理由**／出典／例文 |
| 名称 | 「N2模擬ボス」等 | **scopeで機械決定**（文法のみ→「N2文法バトル」、語彙＋文法→「N2知識バトル」、4技能揃って初めて「N2総合模試」） |

### foreign-language root cause

`n2GrammarDraftsUnit1.ts` の `n2g-003`「〜以上は」解説に **ロシア語 `должен`**（U+0434…）が混入。
執筆時に「must」の意味でロシア語が紛れ込んだもの。同種を全走査し計6件を特定・修正：

| # | itemId | field | script | 内容 |
|---|---|---|---|---|
| 1 | n2g-003 | recognition.explanationZh | Cyrillic | `должен` → `义务・决心・忠告` |
| 2 | n2g-108 | contrast | Cyrillic | `предположение` → `予想` |
| 3 | n3g-kawarini | similarPatterns | Hangul | `반面` → `反面` |
| 4 | ono-hyoro | nuanceZh | Cyrillic | `негативные` → `否定的な` |
| 5 | ono-pekopeko | nuanceZh | Cyrillic | `негатив` → `否定的` |
| 6 | shuttleCounterI18n.ts:4 | コード内コメント | Hangul | `또는` → `または`（学習者非表示だが同時修正） |

### invalid question IDs（HOLD分類）

- N2: **28件** / N3: **17件** が妥当性検査でHOLD（`generated/distractor-validity-audit.json` に全ID・理由）
- 代表: `n2g-003`（CEO指摘そのもの）= `semantic_disconnection` + `ending_category_giveaway`
- HOLDしても各項目は cloze/meaning/form のvariantを持つため **0問になる項目は0件**

### distractor validation（機械規則）

1. `ending_category_giveaway`（警告）: 正解の文末カテゴリが選択肢中で唯一 → 語尾だけで当たる
2. `semantic_disconnection`（**blocking**）: 設問＋正解と内容語を1つも共有しない誤答が過半
3. `structural_inhomogeneity`（**blocking**）: 長さ比 >3.2 または 日本語文と中文glossの混在
4. `duplicate_meaning_family` / `answer_leakage` / `duplicate_choice` / `too_few_choices`（**blocking**）
5. 生成器側の制約: 接続互換（`formation`の接続種別一致）＋長さ均質性（2.2倍以内）＋同族除外

結果: **N2 554問 / N3 248問**（rec 150+59・cloze 199+84・meaning 172+72・form 33+33）

### readiness conditions（総合を出す機械条件）

- 必須4技能（文字・語彙／文法／読解／聴解）**すべて**が
- 各 evidence ≥20問 かつ 未出 ≥10問
- 満たさない限り `overallPct = null` → 画面は「未判定」＋不足理由を列挙
- 時間配分は timed 実績のみ・AI会話は別軸（「JLPTの点数には足しません」明記）

### tests / build / lint / staging

- tests **1390 PASS**（新規: 言語整合性7・位置バイアス8・試験科目5・妥当性6）
- build PASS（build前に language-integrity validator が自動実行）
- AIコース側 lint **0**
- staging 実画面: Home／step遷移／reload復元／二次メニュー／相棒／Map／バトル／ja解説／zh解説／
  readiness scope／375px overflow 0／console error 0

## 残る P2／P3

| ID | 種別 | 内容 |
|---|---|---|
| P2-1 | 教材 | 中国語解説の地の文に日本語（「た形」等）が引用符なしで入る箇所 **1084件**（field別内訳を `generated/language-integrity.json` に出力）。全面書き換えは§13で禁止のため warning 運用＋人間の翻訳作業へ |
| P2-2 | 教材 | 読解・聴解の専用問題が未整備（準備度は未判定で正直運用） |
| P2-3 | 検証 | AI会話ミッションの実会話実走は未監査（マイク・課金を伴うため。既存runtimeは本番Pilot検証済み） |
| P3-1 | 品質 | `ending_category_giveaway` 警告 5件（N2 4・N3 1）は人間レビュー待ち |
| P3-2 | UX | Mapの「内容を見る」が `window.alert` 実装（簡易）。専用パネル化は次段 |
