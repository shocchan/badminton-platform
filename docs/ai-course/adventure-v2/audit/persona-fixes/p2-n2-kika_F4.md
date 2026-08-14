# p2-n2-kika:F4 (P1)

## Evidence
実在を確認。kikaInterviewBank.tsのINTERVIEW_QUESTIONSは実カウント30問（+WORKSHEET_PROMPTS 9件）。advQuest.ts・advWeekly.ts・advHumanLesson.ts・advMapModel.tsにinterview参照0件をgrepで確認（非テスト参照はAdvShell/AdvInterviewPrep/AdvAdventureMap/advProfile/advTypes/advInterview/kikaInterviewBankのみ）。入口は成長マップ「特別な場所」（AdvAdventureMap.tsx:530-553）とHome折りたたみ内SubLink（AdvShell.tsx:1252-1256、badge無し）の2つで共に第二階層。PILOT_OPERATIONS.md §9は「レッスン前に見るのは『先生レッスンの準備』の3件だけでよい」と明記しており、そこに面接進捗が一切出ないため、本人・CEO双方から構造的に忘れられる。

## FixSpec
最小改修3点＋運用手順書1点。今日の冒険への混入はしない（canon原則4のため見送りで正しい）。

【Edit A】src/components/ai-course/adventure/AdvShell.tsx:40 import。旧:
```
import { interviewPrepVisible } from '../../../lib/aiLesson/course/adventure/interview/advInterview';
```
新:
```
import { interviewOverview, interviewPrepVisible } from '../../../lib/aiLesson/course/adventure/interview/advInterview';
```

【Edit B】AdvShell.tsx:1251-1256 Home折りたたみリンクに未練習バッジ。旧:
```
            {/* 帰化面接の表現特訓。発行された人だけ */}
            {interviewPrepVisible(prof) && (
              <SubLink lang={lang}
                label={tx(lang, '帰化面接の表現特訓', '入籍面试表达特训')}
                onClick={() => setView('interview')} />
            )}
```
新:
```
            {/* 帰化面接の表現特訓。発行された人だけ。バッジ＝まだ声に出す練習をしていない問題数 */}
            {interviewPrepVisible(prof) && (
              <SubLink lang={lang}
                label={tx(lang, '帰化面接の表現特訓', '入籍面试表达特训')}
                badge={(() => { const o = interviewOverview(prof.interviewPrep); return o.totalQuestions - o.spoken; })()}
                onClick={() => setView('interview')} />
            )}
```
※SubLinkはbadge?: numberを受けamber丸バッジ表示（AdvShell.tsx:1309-1322）。notApplicable分はinterviewOverviewのtotalから除外済みなので過大表示しない。

【Edit C】src/lib/aiLesson/course/adventure/advHumanLesson.ts に面接進捗を追加。
C-1 import（7行目の直後）。旧:
```
import { EXAM_SKILL_LABELS, EXAM_SKILLS, type ExamSkill } from './advExamSkills';
```
新:
```
import { EXAM_SKILL_LABELS, EXAM_SKILLS, type ExamSkill } from './advExamSkills';
import { interviewOverview, interviewPrepVisible } from './interview/advInterview';
```
C-2 interface（34-37行）。旧:
```
  /** 先生向け: 目標試験・試験日 */
  targetLevel: string | null;
  examDateISO: string | null;
}
```
新:
```
  /** 先生向け: 目標試験・試験日 */
  targetLevel: string | null;
  examDateISO: string | null;
  /** 帰化面接特訓の進捗（発行された人だけ。未発行はnull）。先生が授業で必ず拾うための1行 */
  interview: { total: number; answered: number; spoken: number } | null;
}
```
C-3 buildLessonPrepSummary（109行のreturn直前に挿入＋return末尾に追加）。旧:
```
  return {
    generatedAt: nowISO,
```
新:
```
  const interview = interviewPrepVisible(profile)
    ? (() => {
      const o = interviewOverview(profile.interviewPrep);
      return { total: o.totalQuestions, answered: o.answered, spoken: o.spoken };
    })()
    : null;

  return {
    generatedAt: nowISO,
```
旧:
```
    targetLevel: profile.targetJlpt,
    examDateISO: profile.examDateISO,
  };
```
新:
```
    targetLevel: profile.targetJlpt,
    examDateISO: profile.examDateISO,
    interview,
  };
```

【Edit D】AdvShell.tsx prep画面（752-773行）に1行表示。旧:
```
            {s.learnerViewJa.length === 0 && <li>{tx(lang, 'まだデータが少ないです。冒険を続けると候補が出ます。', '数据还不多。继续冒险后会出现候选。')}</li>}
          </ul>
        </div>
```
新:
```
            {s.learnerViewJa.length === 0 && <li>{tx(lang, 'まだデータが少ないです。冒険を続けると候補が出ます。', '数据还不多。继续冒险后会出现候选。')}</li>}
          </ul>
          {/* 帰化面接特訓の進捗。今日の冒険に混ぜない代わりに、先生レッスンで必ず拾う（原則10） */}
          {s.interview && (
            <p className="mt-2 text-sm text-gray-700">
              {tx(lang,
                `帰化面接の特訓：自分の答え ${s.interview.answered}/${s.interview.total}・声に出す練習 ${s.interview.spoken}/${s.interview.total}`,
                `入籍面试特训：自己的答案 ${s.interview.answered}/${s.interview.total}・开口练习 ${s.interview.spoken}/${s.interview.total}`)}
            </p>
          )}
        </div>
```

【Edit E】docs/ai-course/PILOT_OPERATIONS.md §9末尾に追記。旧:
```
レッスン前に見るのは**「先生レッスンの準備」の3件だけでよい**。
学習履歴を全部見る必要はない（canon §7: AIが量を、人が難所を担当する）。
```
新:
```
レッスン前に見るのは**「先生レッスンの準備」の3件だけでよい**。
学習履歴を全部見る必要はない（canon §7: AIが量を、人が難所を担当する）。

**N2+帰化面接コースの人だけ追加**: 同じ「先生レッスンの準備」画面に
「帰化面接の特訓：自分の答え ◯/30・声に出す練習 ◯/30」が出る。
数字が前回から動いていなければ、授業で面接特訓を一緒に開いて1問すすめる
（アプリは今日の冒険に面接を混ぜない設計なので、ここで人が拾わないと放置される）。
```

検証: advBridge.test.ts（buildLessonPrepSummaryのテスト）はフィールド個別assertのみなので追加フィールドで壊れない。未発行learnerでinterview=nullになること（defaultAdvProfileはenabledAt=null）を確認。
