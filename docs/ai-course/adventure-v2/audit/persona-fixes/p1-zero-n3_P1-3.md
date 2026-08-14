# p1-zero-n3:P1-3 (P1)

## Evidence
3点とも実在を確認。①かな学習: src配下にひらがな・カタカナ・五十音の学習モジュールなし（該当grepはfoundationGrade.tsのかな正規化コメント、n2GrammarDraftsUnit10.tsの例文「あいうえお」等の偶発ヒットのみ）。②量: 基礎キャンプ(stg-foundation)は advRoute.ts 69-73行で area01+area02 = n3u-01-self(12語)+n3u-02-daily(18語)+n3u-05-adjpair(12語)=42語・文法0（n3UnitSpecs.ts実測）。全コース語彙は allVocabularyItems = fi-系78語 + N3_ITEMS 62語 = 140語（実測）。③教えない: N3UnitPanel.tsx 全文読了、explanationJa/explanationZh のrenderは0箇所。Stage1のteachは235-241行で displayForm＋同形漢字警告のみ（読み・意味・例文なし）。誤答時は245行 wrongRetry（aiCourse.ts 1362行ja/2900行zh「再想一想。这个词之后会出现在复习里。」）のみで正解も解説も出ない。誤答問題はqueue先頭に残る（unitRuntime.ts 153-163行）ため3択総当たりで進む構造。一方 AssessQuestion 型は explanationJa/Zh を保持し「解説は回答後にのみ表示する」とコメント（assessQuestionEngine.ts 24-26行）＝表示する設計だったが未実装。vocab_new stepの遷移先はAdvShell.tsx 1003-1005行→openArea→単元quiz直行でteach面なし（ことば図鑑VocabularyHubはlabPreview管理者ゲート内）。

## FixSpec
3部構成（A/Bはコード・Cは運用手順書）。

【A. 誤答時に解説を表示（src/components/ai-course/n3unit/N3UnitPanel.tsx）】
旧（245行）:
```tsx
            {wrongOnce && <p className="text-xs text-rose-600 mb-2">{t.n3u.wrongRetry}</p>}
```
新:
```tsx
            {wrongOnce && (
              <div className="mb-2 p-2 bg-rose-50 rounded-xl">
                <p className="text-xs text-rose-600">{t.n3u.wrongRetry}</p>
                <p className="text-sm text-gray-900 mt-1">{current.explanationJa}</p>
                <p className="text-xs text-gray-500">{current.explanationZh}</p>
              </div>
            )}
```
（誤答は既にanswerQuestionで誤答として記録済み＝復習送り済みなので、再挑戦時の解説表示はassessQuestionEngine.ts 24行の設計コメント「解説は回答後にのみ表示する」通り）。場面ミッション側も同様に、旧（325行）`{wrongOnce && <p className="text-xs text-rose-600 mb-2">{t.n3u.missionWrong}</p>}` を q.explanationJa/Zh 付きの同じdiv構造に変更。

【B. Stage1に「教えるカード」を挟む（同ファイル）】
state追加（99行 `const [wrongOnce, setWrongOnce] = useState(false);` の直後）:
```tsx
  const [taughtIds, setTaughtIds] = useState<Set<string>>(new Set());
```
224行からの問題フェーズIIFE内、`const profile = item ? cognateProfileFor(item) : null;` の直後に early return を追加:
```tsx
        if (state.phase === 'stage1' && item && !taughtIds.has(item.id)) {
          return (
            <div className="bg-white border border-gray-200 rounded-2xl p-4">
              <div className="mb-3 p-3 bg-slate-50 rounded-xl">
                <p className="text-xl font-bold text-gray-900">{item.displayForm}</p>
                <p className="text-sm text-gray-700 mt-0.5">{item.readingKana}</p>
                <p className="text-sm text-gray-900 mt-1.5">{item.meaningZh}</p>
                <p className="text-sm text-gray-800 mt-1.5">{item.exampleJa}</p>
                <p className="text-xs text-gray-500">{item.exampleZh}</p>
                {item.usageNoteZh && <p className="text-[11px] text-rose-700 mt-1">{item.usageNoteZh}</p>}
                {profile?.transferRiskZh && (
                  <p className="text-[11px] text-rose-700 mt-1">{t.n3u.cognateDiffers(profile.zhCognate ?? '')}</p>
                )}
              </div>
              <button type="button" onClick={() => setTaughtIds(new Set([...taughtIds, item.id]))}
                className="w-full min-h-12 bg-emerald-600 text-white rounded-2xl font-bold text-sm action-raised action-emerald touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
                {t.n3u.teachGotIt}
              </button>
            </div>
          );
        }
```
（カード確認後は既存の235-241行のdisplayForm-onlyボックス＋問題が出る＝assess面には答えを出さない原則を維持。taughtIdsは非永続でよい: リロード時に再表示されるのは安全側）
辞書キー追加（src/locales/aiCourse.ts、型はja objectから導出されるため2箇所のみ）:
- ja側 n3u ブロック内 1361行 `diagnosticHint: ...` の直後に追加: `teachGotIt: '覚えた（問題へ進む）',`
- zh側 n3u ブロック内 2899行 `diagnosticHint: ...` の直後に追加: `teachGotIt: '记住了（开始做题）',`

【C. かな学習は運用でカバー（docs/ai-course/PILOT_OPERATIONS.md）】§6b末尾の「**N3コースの人**には発行するものはない（文法・語彙・読解・聴解はV2に内蔵）。」（144行）の直後に全文挿入:
```
**ゼロ初心者（かな未習）の人**への注意: アプリにはひらがな・カタカナの学習モジュールが
まだ無く、基礎キャンプは漢字語の問題から始まる。かなが読めない人は最初の単元で詰まるため、
開始前に必ず:
1. WeChatで五十音表（ひらがな・カタカナ）と読み練習資料を送る
2. 最初の1週間は伴走メッセージで「1日1〜2行（あ行→か行…）」のかな練習を出す
3. かなが一通り読めるようになってから基礎キャンプへ誘導する
（アプリ内かな導入モジュールは開発バックログ。既存の readingKana / readingRomaji データから生成可能）
```
アプリ内かなモジュールの新規開発は今回のスコープに入れない（過剰な作り込み回避）。
