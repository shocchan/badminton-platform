# p2-n2-kika:F2 (P1)

## Evidence
実在を確認。AdvAnswerSheetRunner.tsx:62でlastResultはローカルstate、82-153の結果画面（「自分の答え」一覧119-142・スクショ案内135-141）はlastResultのみで描画。145-148の「試験場へ戻る」がsetLastResult(null)で即破棄。answerSheetLogにはchoicesが永続化済み（advAnswerSheet.ts:84・221「必ず結果に写し取る」、restoreSheetLog:349-364も復元）だが、閲覧UIは406-421のクリック不可<li>のみ（日付と「先生が確認中」だけ）。answerSheetLogの全参照をgrepで確認：Runner内3箇所＋advTypes/advProfileのみで、choicesを表示する画面は他に存在しない。スクショ失敗＝答案閲覧不能で原則15違反が成立。

## FixSpec
対象: src/components/ai-course/adventure/AdvAnswerSheetRunner.tsx（pressFx・ChevronRightはimport済みで追加import不要）。

【Edit 1】state追加。旧:
```
  const [lastResult, setLastResult] = useState<AnswerSheetResult | null>(null);
```
新:
```
  const [lastResult, setLastResult] = useState<AnswerSheetResult | null>(null);
  // 過去の提出の見返し（answerSheetLogから）。提出直後と同じ画面で答案を再表示する
  const [reviewResult, setReviewResult] = useState<AnswerSheetResult | null>(null);
```

【Edit 2】結果ブロック冒頭。旧:
```
  /* ── 結果 ── */
  if (lastResult) {
```
新:
```
  /* ── 結果（提出直後 or 「これまでの提出」からの見返し） ── */
  const shownResult = lastResult ?? reviewResult;
  if (shownResult) {
```
※ブロック内の残りの `lastResult.` 参照（89,92,93,106,125,135行）はすべて `shownResult.` に置換（下記Edit 3-7に含む）。

【Edit 3】見出し。旧:
```
        <h1 className="text-xl font-bold text-gray-900">{tx(lang, '答案を提出しました', '答案已提交')}</h1>
        <p className="mt-1 text-sm text-gray-600">{tx(lang, lastResult.titleJa, lastResult.titleZh)}</p>
```
新:
```
        <h1 className="text-xl font-bold text-gray-900">
          {lastResult
            ? tx(lang, '答案を提出しました', '答案已提交')
            : tx(lang, '提出した答案', '已提交的答案')}
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          {tx(lang, shownResult.titleJa, shownResult.titleZh)}・{shownResult.submittedAtISO.slice(0, 10)}
        </p>
```

【Edit 4】スコア。旧:
```
          {lastResult.scorePct !== null ? (
            <p className="text-4xl font-bold text-blue-800">{lastResult.scorePct}%</p>
```
新:
```
          {shownResult.scorePct !== null ? (
            <p className="text-4xl font-bold text-blue-800">{shownResult.scorePct}%</p>
```

【Edit 5】科目別dl。旧: `{lastResult.sections.map((s) => (`（106行・dl内）→ 新: `{shownResult.sections.map((s) => (`

【Edit 6】「自分の答え」一覧（125-134行）。旧:
```
            {lastResult.sections.map((s) => (
              <div key={`c-${s.id}`} className="mt-1.5">
                <p className="text-[11px] text-gray-500">{tx(lang, s.labelJa, s.labelZh)}</p>
                <p className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 font-mono text-[13px] leading-relaxed text-gray-800">
                  {s.choices.map((c, qi) => (
                    <span key={qi} className={c == null ? 'text-gray-400' : ''}>{qi + 1}:{c ?? '−'}</span>
                  ))}
                </p>
              </div>
            ))}
```
新:
```
            {shownResult.sections.map((s) => (
              <div key={`c-${s.id}`} className="mt-1.5">
                <p className="text-[11px] text-gray-500">{tx(lang, s.labelJa, s.labelZh)}</p>
                {s.choices.length > 0 ? (
                  <p className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 font-mono text-[13px] leading-relaxed text-gray-800">
                    {s.choices.map((c, qi) => (
                      <span key={qi} className={c == null ? 'text-gray-400' : ''}>{qi + 1}:{c ?? '−'}</span>
                    ))}
                  </p>
                ) : (
                  // choicesを保存していなかった旧形式の記録（restoreSheetLogが空配列で埋める）
                  <p className="mt-0.5 text-xs text-gray-400">
                    {tx(lang, 'この提出は古い記録のため、答えの中身は残っていません。',
                      '这次提交是旧记录，答案内容没有保留。')}
                  </p>
                )}
              </div>
            ))}
```

【Edit 7】スクショ案内（135-141行）。旧:
```
            {lastResult.scorePct === null && (
              <p className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-xs leading-relaxed text-blue-900">
                {tx(lang,
                  'この画面をスクリーンショットして、WeChatで先生に送ってください。先生が採点してお返しします。',
                  '请把此页面截图，通过微信发给老师。老师批改后会反馈给你。')}
              </p>
            )}
```
新:
```
            {shownResult.scorePct === null && (
              <p className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-xs leading-relaxed text-blue-900">
                {tx(lang,
                  'この画面をスクリーンショットして、WeChatで先生に送ってください。先生が採点してお返しします。送り忘れても大丈夫：この答案は「これまでの提出」からいつでも見返せます。',
                  '请把此页面截图，通过微信发给老师。老师批改后会反馈给你。就算忘了发也没关系：这份答案随时可以在「过往提交」中再次查看。')}
              </p>
            )}
```

【Edit 8】戻るボタン（145-148行）。旧:
```
          onClick={() => { setLastResult(null); setOpenPaperId(null); }}>
```
新:
```
          onClick={() => { setLastResult(null); setReviewResult(null); setOpenPaperId(null); }}>
```

【Edit 9】「これまでの提出」（406-421行）をタップ可能に。旧:
```
      {profile.answerSheetLog.length > 0 && (
        <div className={`${card} mt-4`}>
          <p className="text-sm font-bold text-gray-900">{tx(lang, 'これまでの提出', '过往提交')}</p>
          <ul className="mt-1 space-y-1">
            {[...profile.answerSheetLog].reverse().slice(0, 5).map((r, i) => (
              <li key={`${r.paperId}-${r.submittedAtISO}-${i}`} className="flex justify-between gap-2 text-sm">
                <span className="min-w-0 truncate text-gray-700">{tx(lang, r.titleJa, r.titleZh)}</span>
                <span className="shrink-0 text-gray-500">
                  {r.submittedAtISO.slice(0, 10)}・
                  {r.scorePct !== null ? `${r.scorePct}%` : tx(lang, '先生が確認中', '老师核对中')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
```
新:
```
      {profile.answerSheetLog.length > 0 && (
        <div className={`${card} mt-4`}>
          <p className="text-sm font-bold text-gray-900">{tx(lang, 'これまでの提出', '过往提交')}</p>
          <p className="mt-0.5 text-xs text-gray-500">
            {tx(lang, 'タップすると、そのときの答案を見返せます。', '点按可查看当时填写的答案。')}
          </p>
          <ul className="mt-1 space-y-1.5">
            {[...profile.answerSheetLog].reverse().slice(0, 5).map((r, i) => (
              <li key={`${r.paperId}-${r.submittedAtISO}-${i}`}>
                <button type="button" onClick={() => setReviewResult(r)}
                  className={`${pressFx} action-secondary flex w-full min-h-[44px] items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-left text-sm`}>
                  <span className="min-w-0 truncate text-gray-700">{tx(lang, r.titleJa, r.titleZh)}</span>
                  <span className="flex shrink-0 items-center gap-1 text-gray-500">
                    {r.submittedAtISO.slice(0, 10)}・
                    {r.scorePct !== null ? `${r.scorePct}%` : tx(lang, '先生が確認中', '老师核对中')}
                    <ChevronRight className="h-4 w-4 text-gray-400" aria-hidden />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
```

検証: src/components/ai-course/adventure/advAnswerSheetRunner.test.tsx を実行（既存テストが提出フローを踏むため）。可能なら「ログ行タップ→『自分の答え』が表示される」テストを1本追加。
