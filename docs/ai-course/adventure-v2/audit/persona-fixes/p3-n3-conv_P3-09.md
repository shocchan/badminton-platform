# p3-n3-conv:P3-09 (P2)

## Evidence
確認済み。step一覧は非インタラクティブな li（AdvShell.tsx:1153-1174、onClickなし）で、stepの実行経路は主要CTA runStep(nextStepIdx)（1183-1189）のみ。conversation_mission で props.conversationAvailable=false のとき runStep は stepNotice『…他のstepを先に進めるか、明日また試してください』を出すだけ（992-998）で、他のstepへ進むUIが存在せず案内が実行不能（原則15）。conversationAvailable=!!plan && remaining>0（AiCoursePage.tsx:1072）、buildLessonPlan は全ミッション消化で null（courseEngine.ts:224）も確認＝半年契約終盤で恒常発生し得る。quest生成（AdvShell.tsx:222-236）は会話可否を見ずに会話stepを入れる。補足（監査の根拠より狭い点）: remaining=0 でもその日に completed セッションが1件あれば自動マーク（AdvShell.tsx:272-278）で解消するため、実害は『中断/エラーで回数だけ消費した日』と『plan=null（枯渇）』の2ケース。ただしどちらも実在する行き止まりで、後者は恒常。

## FixSpec
最小修正 = stepNotice に「このstepを飛ばす」出口を付ける（新規state不要・スキップは復習の言い直しstepのskippable前例＝advRestate §14 と同じ扱い）。plan null 時の会話step生成抑止は新propの配線が必要で、スキップ導線だけで行き止まりは解消するため今回はやらない。

■修正1: src/components/ai-course/adventure/AdvShell.tsx — 通知文言を出口に合わせて更新（995-997行目）。
アンカー（現コード）:
      setStepNotice(tx(lang,
        'いまAI会話を始められません（今日の回数を使い切ったか、準備中です）。他のstepを先に進めるか、明日また試してください。',
        '现在无法开始AI会话（今天的次数已用完，或正在准备中）。可以先做其他步骤，或明天再试。'));
新コード:
      setStepNotice(tx(lang,
        'いまAI会話を始められません（今日の回数を使い切ったか、準備中です）。下のボタンでこのstepを飛ばして、先へ進めます。',
        '现在无法开始AI会话（今天的次数已用完，或正在准备中）。可以点下面的按钮跳过这一步，继续后面的内容。'));

■修正2: AdvShell.tsx — stepNotice 表示ブロックにスキップ導線を追加（1197-1201行目）。
アンカー（現コード）:
          {stepNotice && (
            <p role="status" className="mt-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
              {stepNotice}
            </p>
          )}
新コード:
          {stepNotice && (
            <div role="status" className="mt-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2">
              <p className="text-xs leading-relaxed text-amber-900">{stepNotice}</p>
              {/* 案内を実行不能にしない出口（原則15）: 会話が使えない日はこのstepを飛ばして後続（言い直し等）へ進める */}
              {nextStep?.kind === 'conversation_mission' && !props.conversationAvailable && (
                <button type="button"
                  className={`${pressFx} action-amber mt-2 w-full min-h-[44px] rounded-xl border border-amber-400 bg-white px-3 py-2 text-sm font-bold text-amber-900`}
                  onClick={() => { markStep(nextStepIdx); setStepNotice(null); }}>
                  {tx(lang, 'AI会話を飛ばして次へ進む', '跳过AI会话，继续下一步')}
                </button>
              )}
            </div>
          )}

実装メモ: ①nextStep / nextStepIdx / markStep / pressFx はすべて同スコープに既存（973-975行目・38行目）。②markStep はstepを✓にするが、会話が使えない日の明示スキップなので許容（advRestate の skippable と同思想。気になるなら文言どおり「飛ばした」ことがstepNoticeで直前に伝わっている）。③スキップ後は nextStepIdx が次のstep（言い直し等）へ進み、CTAが復活する。quest が会話stepのみ（advQuest.ts の空クエスト防止fallback）の場合はスキップで allDone→complete画面へ進み、これも行き止まりにならない。
