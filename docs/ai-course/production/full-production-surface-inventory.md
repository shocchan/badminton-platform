# 全公開Surface Inventory（Phase 3P-1）

生成: 2026-07-28 ／ 集計: 型union・ファイル走査による機械集計（手計算なし）
機械可読版: `generated/unfinished-surface-manifest.json`

## 画面の全体像

| 区分 | 数 | 内訳 |
|---|---|---|
| 一般画面（現在も学習者に公開） | 15 | login/hearing/guide/home/lesson/report/growth/roadmap/history/settings/preview/chapters/light/expressions/notebook |
| labPreviewゲート内（**v1.0で一般公開する対象**） | 19 | lab（しくみラボ・Unit6）・vocab（ことば図鑑・10view）・n2grammar |
| 内部専用（v1.0でも非公開のまま） | 3 | 判断キュー・接続監査・教材レビュー（entitlement分離対象） |

## 「作成中・準備中・試作・ベータ」表示の全件（29件）

| 種別 | 件数 |
|---|---|
| 準備中・作成中・掲載予定（in_progress） | 9 |
| 試作（未保存注記を含む行を含む） | 14 |
| ベータ | 6 |
| disabledカード（押せない導線） | 0 |

### 全出現箇所

| 位置 | マーカー | 本文（抜粋） |
|---|---|---|
| components/ai-course/CourseHome.tsx:61 | 試作 | /** しくみラボ試作（adminOverrides.labPreview=true のテストアカウントのみ・§2A-6） */ |
| components/ai-course/CourseN2Grammar.tsx:55 | ベータ | const visible = useMemo(() => publiclyVisibleIndex(N2_GRAMMAR_INDEX),  |
| components/ai-course/CourseN2Grammar.tsx:112 | ベータ | {/* ベータ告知（初回に一度・各項目には繰り返さない） */} |
| components/ai-course/CourseN2Grammar.tsx:247 | ベータ | {/* 未作成項目（ベータ）: 表現＋例文で確認 */} |
| components/ai-course/CourseRoadmap.tsx:31 | 準備中 | /** N2文法トラック（準備中/レビュー）を開く */ |
| locales/aiCourse.ts:340 | 準備中 | subtitleTranslating: '中国語訳を準備中…', |
| locales/aiCourse.ts:542 | 準備中 | n2GoalN3: 'N2文法へ進むための足場（N3レベル）。N2文法トラックは準備中です。', |
| locales/aiCourse.ts:543 | 準備中 | n2GoalBridge: 'N3〜N2の橋渡し表現。対応するN2文法・問題は準備中です（順次追加）。', |
| locales/aiCourse.ts:544 | 準備中 | trackPreparing: 'N2文法・聴解・読解・語彙の専用トラックは準備中です（段階的に追加）。', |
| locales/aiCourse.ts:548 | 準備中 | axisPreparing: '準備中', |
| locales/aiCourse.ts:563 | 準備中 | learnerEmpty: 'N2文法トラックは準備中です。内容を人間レビューで確認し、順次公開します。', |
| locales/aiCourse.ts:608 | ベータ | betaBadge: 'ベータ', |
| locales/aiCourse.ts:609 | ベータ | betaBanner: 'このN2文法教材はベータ版です。原本教材をもとにAIで解説・問題を補完しています。内容は順次確認・改善しています。 |
| locales/aiCourse.ts:610 | ベータ | contentComing: 'この項目の解説・問題は順次追加中です（ベータ）。まずは表現と例文で確認しましょう。', |
| locales/aiCourse.ts:839 | 試作 | practiceNote: '※この練習は試作のスクリプト会話です。結果は保存されません。', |
| locales/aiCourse.ts:844 | 準備中 | mvpPackNote: '現在は基礎・生活語彙の初期パック（試作）です。N3・N2向けパックは準備中です。', |
| locales/aiCourse.ts:995 | 試作 | notSavedVocab: '※試作確認のため、この記録は正式保存されません。', |
| locales/aiCourse.ts:1042 | 試作 | title: '日本語のしくみラボ（試作）', |
| locales/aiCourse.ts:1043 | 試作 | draftNote: 'この単元は試作確認用（draft）です。結果は正式保存されません。', |
| locales/aiCourse.ts:1061 | 試作 | notSaved: '※現在は試作確認のため、この結果は正式保存されません。', |
| locales/aiCourse.ts:1081 | 試作 | recAllDone: '全単元の試作を確認済みです。復習候補を見直しましょう。', |
| locales/aiCourse.ts:1083 | 試作 | unitListHeading: '単元一覧（試作・draft）', |
| locales/aiCourse.ts:1093 | 試作 | reviewNote: 'この復習候補は試作セッション内の記録から表示しています。正式な復習予定としては保存されていません。', |
| locales/aiCourse.ts:1100 | 試作 | historyNote: 'この履歴は現在の試作確認用で、このブラウザセッション内だけ保存されます。', |
| locales/aiCourse.ts:1103 | 試作 | resetButton: 'この試作履歴を削除', |
| locales/aiCourse.ts:1104 | 試作 | resetConfirm: 'この試作セッションのしくみラボ履歴だけを削除します。会話レッスンの進捗には影響しません。', |
| locales/aiCourse.ts:1110 | 試作 | betaBadge: '試作', |
| locales/aiCourse.ts:1147 | 試作 | homeEntry: '日本語のしくみラボ（試作）', |
| pages/ai-lesson/landing/sectionsB.tsx:42 | 準備中 | <span>{lang === 'ja' ? '実際の学習画面を掲載予定（準備中）' : '真实学习界面即将展示（准备中）'}</span> |

## 解消方針（§2: 非表示化は原則禁止）

- **準備中9件**: N2文法トラック関連（4）・N3/N2パック（1）・LP掲載予定（1）・字幕翻訳中（1・動的表示）・その他。
  → N2文法180・N3文法120・N2パックを**完成させて**文言ごと削除する（3P-4〜3P-6）
- **試作14件**: ことば図鑑・しくみラボの試作/未保存注記。→ 正式DB保存（3P-7）と
  human review closure（3P-9）の完了をもって削除する
- **ベータ6件**: 同上。正式版でバッジ自体を廃止
- 例外（公開しない代わりに独自教材で補完）: 内部監査画面・権利未確認素材のみ
