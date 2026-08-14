# p4-ops-release:OPS-3 (P1)

## Evidence
AdvShell.tsx:210-211（クエスト生成用）と 971-972（home表示用）の両方が `new Date(profile.examDateISO)`（UTC深夜）と `new Date(`${dateKey}T00:00:00`)`（ローカル深夜）を混在。TZ=Asia/Shanghai の node で実測再現: 2026-08-14→「115」（実残114日）、試験当日12-06→「1」、12-07以降→Math.max(0,…)で恒久「0」。表示は同:1037-1038「合格まであと◯日」。同じ値が advQuest.ts の buildWhy「試験まで◯日」と daysToExam<60 の追い込み判定へ流れる。AdvOnboarding.tsx:166 の `min={nowISO.slice(0, 10)}` もUTC日付のためUTC+8/9の早朝にローカル前日が選べる。

## FixSpec
対象: /Users/shocchan/badminton-aicourse/src/components/ai-course/adventure/AdvShell.tsx と AdvOnboarding.tsx。advQuest.ts は変更不要（負値をnullに丸めてから渡す）。

【編集1】AdvShell.tsx:53 `const dateKeyOf = ...` の直後にヘルパー追加:
/** 試験日までの残日数（ローカル深夜同士で比較・UTC混在させない）。当日=0、試験後は負 */
const daysToExamOf = (examDateISO: string | null, dateKey: string): number | null =>
  examDateISO
    ? Math.ceil((new Date(`${examDateISO}T00:00:00`).getTime() - new Date(`${dateKey}T00:00:00`).getTime()) / 86400000)
    : null;

【編集2】AdvShell.tsx:210-212（クエスト生成側）、旧:
      const daysToExam = profile.examDateISO
        ? Math.max(0, Math.ceil((new Date(profile.examDateISO).getTime() - new Date(`${dateKey}T00:00:00`).getTime()) / 86400000))
        : null;
新:
      // 試験後（負）はnull＝「試験まで◯日」文と追い込み配分を出さない（advQuest側は非負のみ受ける）
      const rawDays = daysToExamOf(profile.examDateISO, dateKey);
      const daysToExam = rawDays !== null && rawDays >= 0 ? rawDays : null;

【編集3】AdvShell.tsx:971-972（home側）、旧:
  const daysToExam = prof.examDateISO
    ? Math.max(0, Math.ceil((new Date(prof.examDateISO).getTime() - new Date(`${dateKey}T00:00:00`).getTime()) / 86400000)) : null;
新:
  const daysToExam = daysToExamOf(prof.examDateISO, dateKey);

【編集4】AdvShell.tsx:1034-1040 の表示、旧:
        {prof.goalType === 'conversation'
          ? tx(lang, '会話力を上げる', '提升会话能力')
          : daysToExam !== null
            ? tx(lang, `${prof.targetJlpt ?? ''}合格まであと${daysToExam}日`, `距离${prof.targetJlpt ?? ''}合格还有${daysToExam}天`)
            : tx(lang, `${prof.targetJlpt ?? ''}合格をめざす`, `目标：${prof.targetJlpt ?? ''}合格`)}
新:
        {prof.goalType === 'conversation'
          ? tx(lang, '会話力を上げる', '提升会话能力')
          : daysToExam === null
            ? tx(lang, `${prof.targetJlpt ?? ''}合格をめざす`, `目标：${prof.targetJlpt ?? ''}合格`)
            : daysToExam < 0
              ? tx(lang, '試験おつかれさまでした。次の目標を先生と決めましょう', '考试辛苦了。下一个目标和老师一起商量决定吧')
              : daysToExam === 0
                ? tx(lang, `今日が${prof.targetJlpt ?? ''}の試験日です。いってらっしゃい！`, `今天是${prof.targetJlpt ?? ''}的考试日。加油！`)
                : tx(lang, `${prof.targetJlpt ?? ''}合格まであと${daysToExam}日`, `距离${prof.targetJlpt ?? ''}合格还有${daysToExam}天`)}

【編集5】AdvOnboarding.tsx:166、旧: `min={nowISO.slice(0, 10)}` → 新: `min={new Date(nowISO).toLocaleDateString('sv-SE')}`（ローカル日付で当日以降のみ選択可に）
