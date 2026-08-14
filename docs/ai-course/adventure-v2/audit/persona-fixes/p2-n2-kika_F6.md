# p2-n2-kika:F6 (P2)

## Evidence
実在を確認。weeklyDaysの非テスト参照をgrepで全数確認: AdvOnboarding.tsx(27,63,98,181=入力UI)・AdvShell.tsx:313(保存)・advTypes.ts:231・advProfile.ts:29,129(型と復元)のみ。advQuest.tsはdailyMinutesとdaysToExamのみ使用、advWeekly.ts・advHumanLesson.ts（週次日数はquestLog実測のweekDays）・残日数のどこからも読まれない。オンボーディングで週2/3/5/7日を選ばせながら製品挙動が一切変わらない「空撃ちの決断」が成立。

## FixSpec
最小対応（audit案どおり週次まとめに約束vs実測の1行。設問撤去は不要になる）。UI追加のみで純関数層advWeekly.tsは変更しない。

対象: src/components/ai-course/adventure/AdvShell.tsx の weekly ビュー内（797-810行のカード）。旧:
```
          {wk.estimatedMinutes !== null && (
            <p className="mt-1 text-xs text-gray-400">
              {tx(lang, `学習時間はおおよそ${wk.estimatedMinutes}分（設定した1日の時間からの目安です）`,
                `学习时间大约${wk.estimatedMinutes}分钟（根据设定的每日时长估算）`)}
            </p>
          )}
```
新:
```
          {wk.estimatedMinutes !== null && (
            <p className="mt-1 text-xs text-gray-400">
              {tx(lang, `学習時間はおおよそ${wk.estimatedMinutes}分（設定した1日の時間からの目安です）`,
                `学习时间大约${wk.estimatedMinutes}分钟（根据设定的每日时长估算）`)}
            </p>
          )}
          {/* オンボーディングで決めた「週◯日」を実測と並べる（聞いた決断を効かせる・原則17。週の途中でも嘘にならない事実表記） */}
          {prof.weeklyDays !== null && (
            <p className="mt-1 text-xs text-gray-500">
              {tx(lang, `はじめに決めた予定：週${prof.weeklyDays}日／今週ここまで：${wk.studyDays}日`,
                `一开始定的计划：每周${prof.weeklyDays}天／本周到目前：${wk.studyDays}天`)}
            </p>
          )}
```

設計メモ: 「予定どおり/足りない」の評価文言は入れない。週次まとめは週の途中でも開けるため、達成/未達の断定は月曜に必ず「未達」表示になり原則13に反する。「予定◯日／ここまで◯日」の並記なら常に事実。weeklyDaysはnumber|null（advTypes.ts:231）なのでnullガード必須（V2初期learnerはnull）。
