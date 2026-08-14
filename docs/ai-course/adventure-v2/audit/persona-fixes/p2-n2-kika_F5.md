# p2-n2-kika:F5 (P2)

## Evidence
実在を確認。AdvShell.tsx:210-212と971-972の両方で new Date(profile.examDateISO)（オンボーディングのinput type=date由来のdate-only文字列＝UTC午前0時解釈）− new Date(`${dateKey}T00:00:00`)（dateKeyOf=toLocaleDateString('sv-SE')のローカル日付をローカル解釈）をMath.ceil。UTC+8では差が常に N+8/24日となりceilでN+1。試験日2026-12-06の場合、中国時間の当日朝でも差=8h→ceil=1で「あと1日」、前日は32h→ceil=2。表示はAdvShell.tsx:1038とadvQuest.ts:218（buildWhy「試験まで◯日」）に波及。テストはdaysToExamを直接注入しており（advPersona.test.ts:68）AdvShell側の計算を検証するテストは無い。

## FixSpec
対象: src/components/ai-course/adventure/AdvShell.tsx（3 Edit、他ファイル変更不要）。

【Edit 1】ヘルパー追加（53行の直後）。旧:
```
const dateKeyOf = (d = new Date()): string => d.toLocaleDateString('sv-SE');
```
新:
```
const dateKeyOf = (d = new Date()): string => d.toLocaleDateString('sv-SE');
/**
 * 試験日までの残り日数。date-only文字列同士をUTC固定でパースして引く。
 * 片方をローカル解釈すると中国時間（UTC+8）で常に+1日ズレる（試験当日に「あと1日」）ため統一する。
 */
const daysUntilExam = (examDateISO: string, dateKey: string): number | null => {
  const exam = Date.parse(`${examDateISO.slice(0, 10)}T00:00:00Z`);
  const today = Date.parse(`${dateKey}T00:00:00Z`);
  if (!Number.isFinite(exam) || !Number.isFinite(today)) return null;
  return Math.max(0, Math.round((exam - today) / 86400000));
};
```

【Edit 2】quest生成側（210-212行）。旧:
```
      const daysToExam = profile.examDateISO
        ? Math.max(0, Math.ceil((new Date(profile.examDateISO).getTime() - new Date(`${dateKey}T00:00:00`).getTime()) / 86400000))
        : null;
```
新:
```
      const daysToExam = profile.examDateISO ? daysUntilExam(profile.examDateISO, dateKey) : null;
```

【Edit 3】Home表示側（971-972行）。旧:
```
  const daysToExam = prof.examDateISO
    ? Math.max(0, Math.ceil((new Date(prof.examDateISO).getTime() - new Date(`${dateKey}T00:00:00`).getTime()) / 86400000)) : null;
```
新:
```
  const daysToExam = prof.examDateISO ? daysUntilExam(prof.examDateISO, dateKey) : null;
```

挙動変化: 試験当日は「あと0日」表示になる（従来はTZにより1〜2日）。両者date-only同士のUTC固定差なのでDSTや端末TZの影響を受けない。examDateISO不正時はnull（従来はNaN日表示の潜在バグ）で「◯合格をめざす」フォールバック文言に落ちる。
