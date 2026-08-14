# p2-n2-kika:F7 (P2)

## Evidence
src/components/ai-course/adventure/AdvAnswerSheetRunner.tsx:415 で scorePct===null の提出履歴に「先生が確認中/老师核对中」を恒常表示。src/lib/aiLesson/course/adventure/advAnswerSheet.ts:249-252 で正解未登録用紙の scorePct は null 確定。answerSheetLog への書込は提出時の追記（AdvAnswerSheetRunner.tsx:75）のみで、採点結果を書き戻すUI・スクリプトは存在しない（scripts/ai-course/issue-answer-sheet.mjs は発行と --revoke のみ、paperId重複発行は128-129行で拒否）。よってWeChatで採点が返っても「確認中」が永久に残る。指摘どおり実在。

## FixSpec
【修正1: 文言変更（最小・状態を偽らない）】
対象: src/components/ai-course/adventure/AdvAnswerSheetRunner.tsx 415行
旧:
                  {r.scorePct !== null ? `${r.scorePct}%` : tx(lang, '先生が確認中', '老师核对中')}
新:
                  {r.scorePct !== null ? `${r.scorePct}%` : tx(lang, '採点は先生からWeChatで届きます', '评分由老师通过微信发给你')}

【修正2: テスト追随】
対象: src/components/ai-course/adventure/advAnswerSheetRunner.test.tsx 146行
旧:
    expect(screen.getByText(/先生が確認中/)).toBeTruthy();
新:
    expect(screen.getByText(/採点は先生からWeChatで届きます/)).toBeTruthy();

【修正3: 運用手順書へ追記】
対象: docs/ai-course/PILOT_OPERATIONS.md §6b、「# 問題そのものはWeChatで本人へ送る（アプリには問題を置かない）」を含むコードブロックの直後に追記:

> **採点の返し方**: 用紙JSONに `correctChoices`（全問ぶんの正解）を入れて発行した場合だけ、
> 提出直後にアプリが自動採点してスコアを表示する。正解を入れずに発行した用紙は、
> 提出履歴に「採点は先生からWeChatで届きます」と出続け、**あとからアプリへ採点結果を
> 書き戻す手段は無い**（同じpaperIdの再発行も拒否される）。この運用では採点は必ずWeChatで本人へ返すこと。

※恒久対応（answerSheetLogへの採点書き戻しスクリプト --paper --score）はパイロット中は不要。過剰実装しない。
