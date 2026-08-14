# p2-n2-kika:F1 (P0)

## Evidence
実在を確認（反証失敗）。①スクリプト側: scripts/ai-course/issue-answer-sheet.mjs 139-144行が jsonb_set で settings.adventureV2.answerSheets へDB直接追記、issue-interview-prep.mjs 53-59行が interviewPrep.enabledAt を jsonb_set で直接設定。②クライアント側: src/pages/ai-lesson/AiCoursePage.tsx 1066-1069行の onSaveSettings が updateLearner({settings: next}) を呼び、src/lib/aiLesson/course/courseRepository.ts 188行 `if (patch.settings !== undefined) row.settings = patch.settings;` → 191行 supabase update で settings列を全置換。③settings はメモリ上のコピー: AdvShell.tsx 144-146行 save() は writeAdvProfile(learner.settings, ...) で adventureV2 全体（answerSheets/interviewPrep含む・advProfile.ts 164-169行）を在メモリ値から再構築。learner の再取得は AiCoursePage.tsx 306-347行 loadAll（初回マウント/認証変化時）のみ。④発火頻度: save はステップ完了ごと（markStep 156-159行）・マークシート解答1タップごと（AdvAnswerSheetRunner.tsx 67-68行 saveSession、268行 onClick）。⑤運用: PILOT_OPERATIONS.md §6b（124-144行）は「本人がV2オンボーディングを終えたあと」に発行と指示し、タイミングの注意なし。スクリプトは149行/66行で✅成功表示のみ。したがって「発行→本人の次の1タップで無言消滅」の経路は現行コードに実在する。過去の監査修正（タスク#26の発行スクリプト×2）はスクリプト側をjsonb_set追記に直したもので、クライアント全置換との競合は未対処。

## FixSpec
【暫定策（運用手順書の追記のみ・コード変更なし・これを先に実施）】
対象: docs/ai-course/PILOT_OPERATIONS.md §6b。アンカー（現行140-142行）:
```
どちらも `--confirm` なしで dry-run できる。**発行チェック**: 本人の成長マップ下部
「特別な場所」に「帰化面接の表現特訓」「過去問の試験場」が出ていれば成功
（試験場は目標N2の人にだけ出る）。
```
この段落の直後に以下を全文挿入:
```
> ⚠️ **発行のタイミング（重要）**: 本人がアプリを開いている間に発行しない。
> アプリはステップ完了・マークシートの解答1タップごとに settings 列を**丸ごと上書き保存**し、
> learner の再読込は初回ロードの1回だけのため、発行直後に本人が何か操作すると
> いま発行した answerSheets / interviewPrep が**無言で消える**（スクリプトは✅表示のまま）。
> 必ず次の手順で発行する:
> 1. 本人がアプリを使っていない時間帯（深夜・早朝など）に発行する
> 2. 発行後、本人に「アプリを一度閉じて、開き直してください」と伝える（開き直しで新しい settings が読み込まれる）
> 3. **残存確認**: 数分後〜翌日に同じコマンドを `--confirm` なしでもう一度実行する。
>    答案用紙 → 「refuse: paperId "..." は既に発行済み」と拒否されれば残っている。
>    面接特訓 → 「発行状態=<日時>」が表示されれば残っている。
>    消えていた（未発行表示に戻っていた）場合は、本人がアプリを閉じたのを確認してから再発行する。
```
【恒久策（バックログとして起票のみ・今回は実装しない）】updateLearner の settings 保存を、サーバ所有フィールド（adventureV2.answerSheets / adventureV2.interviewPrep.enabledAt）を保存直前にDB値から読み直してマージする方式、または jsonb_set の部分更新RPCへ変更する。パイロット人数（数名）の間は上記運用で十分。
