# Phase 2E-1.15 完了報告書

**Result Meaning Clarity & Version-Safe Learner Recovery**

日付: 2026-07-28（夜間セッション継続・自律ループ#5）
依頼元: ChatGPT「AI日本語学習監督」（decision=CONTINUE・`prompts/2e1-15-prompt.md`）
ブランチ: feature/ai-course-learning-polish ／ staging反映済み・本番未反映

---

## 0. 最初に: 前Phaseで私が入れた変更を取り消した

前Phaseの終盤、Step4の内訳が全部0になる件に対して
「どの区分にも入らない語を『もう一度確認する』に含める」修正を独断で入れていた。
本Phaseの依頼文 §2 に **「数値を合計に合わせるために、既存結果を別カテゴリへ勝手に再分類しないこと」**
と明記されていたため、**その修正を revert し**、指示どおりの派生モデルを作り直した。

---

## 1. Step4表示問題の原因（§2）

| 分けるべきもの | 実際にどこに保存されているか |
|---|---|
| quiz correctness | 語ごとの問題結果（正誤と日時） |
| hint usage | **保存されていない**（記録する仕組みが無い） |
| self assessment | 語ごとの自己評価（覚えたと思う／まだ不安） |
| review schedule decision | 復習予定（次回日と段階） |
| presentation category | これまでは verifiedState と自己評価を混ぜて作っていた |

`checked=3 / independent=0 / supported=0 / needsReview=0` が成立していた理由は、
**independent/supported はクイズ由来、needsReview は自己評価由来という別の軸を、
ひとつの合計の内訳のように並べていた**こと。3つは互いに排他でも網羅でもなく、
checked の完全な内訳を意図した設計ではなかった。

---

## 2. 学習者向け結果モデル（§3）

`learnerResultModel.ts` を新設。内部の値は一切変えず、表示のためだけの派生モデルを作る。

| 軸 | 項目 | 性質 |
|---|---|---|
| **A クイズの結果** | correctCount / incorrectCount / notAnsweredCount | **これだけが checked の完全な内訳** |
| **B 本人の感じ方** | feltConfidentCount / feltUnsureCount | 別の軸。正解の代わりにしない |
| **C これからの予定** | scheduledForReviewCount / nextReviewDate | 別の軸 |

- `answeredWithSupportCount` は **常に null**。保存データに「ヒントを使ったか」が無いため、
  0 と書くと「ヒントを使わなかった」という別の意味になる
- 対象の語が取れないときは partial とし、0件を結果として見せない
- 同じ入力なら必ず同じ結果（決定的・副作用なし）

**クイズ誤答＋「覚えたと思う」は「正しく答えられた」に数えない**（テストで担保）。

## 3. 表示（§4・§5・§6）

Step4は3つのカードに分かれた。

```
今日確認したことば: 3

［問題の結果］            ← 棒グラフはここだけ（合計の完全な内訳のときのみ描く）
 ・正しく答えられた: 2
 ・もう一度確認する: 1

［自分の感じ方］          ← 別カード（合計の分解ではない）
 ・覚えたと思う: 2
 ・まだ少し不安: 1

［次の復習］              ← 別カード
 3語が復習の予定に入りました
```

- 棒グラフは `isQuizBreakdownComplete()` が true のときだけ描く
- 0件の項目は棒も行も出さない／欠損は0として描かない
- グラフの図形は `aria-hidden`、件数は必ず文字でも読める
- 内部用語（independent / supported / needsReview / retained / mastery / snapshot）は出さない（テストで担保）

---

## 4. Schema分類とRecovery（§7・§8・§9）

`journeySchemaVersion.ts` に判定を一箇所へ集約（副作用なし・決定的）。

| 分類 | 学習者に何が起きるか |
|---|---|
| same_schema | 通常どおり |
| safely_migratable | そのまま学習を続けられる（v1→v2はここ。再読込しても再移行しない） |
| incompatible_schema / corrupted_state | 「学習の続き方を確認できませんでした」＋この初回学習だけやり直す／ホームへ。**自動で完了扱いにしない** |
| newer_than_client | 「新しい状態で保存されています」＋もう一度読み込む／ホームへ。**保存状態を上書きしない** |

いずれも **語彙の学習記録と復習予定には触れない**（テストで担保）。
再読込ループ防止として `recoveryAttemptCount` / `lastRecoveryReason` / `lastRecoveryAt` /
`lastSeenSchemaVersion` を持ち、自動再読込は最大1回・同じ理由と同じ版では繰り返さない。
**新しいstorageキーは増やしていない。**

---

## 5. 部分成功Recovery の実機実証（§10）

sandbox内で「契約completed・stepがpracticeのまま」という状態を作って確認した（**E2**）。

| 確認項目 | 結果 |
|---|---|
| Step4が表示される | ✅（1回のrenderで表示。修正前は保存だけされて画面は前のままだった） |
| usedTokens | 1件のまま（**再消費なし**） |
| completedTaskIds | 1件のまま（**再追加なし**） |
| Journeyのstep | practice → done（**stepだけ修復**） |
| 結果表示 | 「今日確認したことば 3／正しく答えられた 2／もう一度確認する 1／覚えたと思う 2／まだ少し不安 1／3語が復習の予定に入りました」 |
| 通常の学習記録 | 8,960文字のまま不変 |

**この実機検証で「保存はされるのに画面が1つ前のステップのまま」という不具合を発見し、修正した。**

---

## 6. コントラスト計測（§12）

外部サービスも追加ライブラリも使わず、WCAGの相対輝度の式を実装して計測した
（`courseContrast.test.ts`・20項目）。

| 対象 | 結果 |
|---|---|
| 本文（白地・薄い灰地）・説明文・補助説明 | 4.5:1 以上 ✅ |
| 主要CTAの文字 | 4.5:1 以上 ✅ |
| 保存失敗の警告・検証モードの注意文 | 4.5:1 以上 ✅ |
| グラフのラベル・正解の数値・タイムラインの強調 | 4.5:1 以上 ✅ |
| **gray-400（小さな補助文字）** | **2.54:1 で未達 → この画面に限り gray-500 へ差し替え**（4.83:1） |
| **focus ring（indigo-400）** | **2.98:1 でわずかに未達。未対応** |

focus ring は全画面共通の `ActionButton` 由来で、変更すると
「全アプリのテーマ変更をしない」という条件に触れるため**このPhaseでは手を付けていない**。
数値と理由を残して次Phaseの判断材料とする。

---

## 7. 188px（200% zoom相当）の操作領域（§13）

**特定した5件**: モバイルタブの「ホーム／AI会話／ことば／しくみ／その他」。
実寸は各 **31 × 66 px**（高さは足りるが幅が不足）。分類は**主要ナビゲーション**。

5タブ×44px = 220px は 188px に収まらないため、**折り返し**で解決した
（`flex-wrap` ＋ 各タブ `basis-11 min-w-11`）。

| 幅 | 横overflow | 44px未満 |
|---|---|---|
| **188** | **0** | **0** |
| 320 | 0 | 0 |
| 375 | 0 | 0 |
| 430 | 0 | 0 |

通常幅では従来どおり1行に均等配置され、見た目は変わらない。
min-width固定だけでは横あふれを作る（前Phaseで実際に作ってしまった）ため、折り返しと併用した。

---

## 8. Storage Registry（§14）

**新しいキーは追加していない。** 再読込ループ防止の情報も既存の契約キーの範囲で扱う。

| 区分 | 数 |
|---|---|
| registry総数 | 9 ／ sessionStorage 7 ／ localStorage 2 |
| resettable 3 ／ non-resettable 6 | |
| learner-impacting 2 ／ lab-only 9 | |
| Journey reset allowlist 3 ／ sandbox allowlist 1 | |

---

## 9. 品質ゲート

| 指標 | 値 |
|---|---|
| テスト | **785件全パス**（2E-1.14の731 → +54） |
| 新規テストファイル | 3（結果モデル9・schema分類15・コントラスト20） |
| tsc | 0エラー |
| lint | 45E/6W=51（ベースライン一致・増分0） |
| build | 成功 |
| main bundle | **590.30KB（増加0）** |

---

## 10. ガードレール遵守

禁止事項はすべて未変更。特に本Phaseで名指しされた
**復習間隔・正誤判定・自己評価の意味・「まだ不安」「覚えたと思う」の予定生成規則・
診断問題数・練習語数**は一切変えていない。教材本文・meaningZh・exJa/exZh・cognate・
role確定値・human_reviewed・approved・共有Supabase・migration・RLS・認証・OTP・決済・
learner正式データ・admin_overrides・本番・main も変更なし。
`storage.clear`／prefix・正規表現削除なし。通常進捗を削除した検証もしていない（sandboxを使用）。

---

## 11. 未完成・人間判断待ち

| 項目 | 状態 |
|---|---|
| **E1（復習予定あり・契約未完了からの契約完了の再試行）** | 判定関数（`contract_pending`）とテストはあるが、**UIへの接続は未実装**。実機実証も未 |
| Journey F1-F4（schema Recoveryの実機実証） | 分類とRecovery表示・ユニットテストは完成。実機で各状態を作る作業は未実施 |
| focus ring のコントラスト（2.98:1） | 全画面共通コンポーネントのため範囲外として未対応 |
| ヒント使用の記録 | そもそも保存していない。表示したい場合は記録の追加が必要（学習ロジックに触れるため要判断） |
| 実機スマートフォン | 人間確認事項 |
| root P0=1・root P1=13 | **CEO判断待ち** |
| 語彙進捗・復習予定の正式DB保存 | **正式公開ブロッカー** |
| admin_overrides の RLS | **正式公開ブロッカー** |

---

## 12. CEOが見る画面

staging: https://staging.badminton-platform.pages.dev
（更新直後は `?cb=<数字>` を付けて開くと新しい画面が確実に出ます）

1. `?app=1&vocab=1` → ことば図鑑トップ。最下部の「初回学習を安全に試す」で検証モードへ
2. 検証モードで初回学習を通すと、Step4で「問題の結果」「自分の感じ方」「次の復習」が
   別々のカードで表示されます
3. 「検証を終えて通常の画面へ戻る」で元に戻ります（通常の記録は一切変わりません）
