// V2の復習は「閉じても消えない」ものだけにする（2026-09-09 CEO決定・C）。
//
// なぜ:
//   旧コースの語彙クイック復習（vocabSpacedReview）は **sessionStorage にしか保存しない**。
//   正式なDB保存（vocabPersistence.ts）は「まだどこからもimportしない」と本人が書いてある草案のまま。
//   V2の生徒をそこへ出すと「復習できているように見えて、タブを閉じると予定が消える」ものを
//   売ることになる。V2の復習は錯題本（mastery台帳＝DBのjsonb）に一本化する。
//
// このテストは**構造**を守る（画面の見た目ではなく、どこへ保存されるか）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

describe('旧SRS（sessionStorage）はV2の導線から外れている', () => {
  const page = read('src/pages/ai-lesson/AiCoursePage.tsx');

  it('復習を開く導線は、V2では錯題本（mistakes）へ行く', () => {
    // openReview の中で advOn のときに 'mistakes' を要求していること
    const m = page.match(/const openReview = \(\) => \{[\s\S]*?\n {2}\};/);
    expect(m, 'openReview が見つからない（名前が変わったらこのテストも直す）').toBeTruthy();
    expect(m![0]).toContain("view: 'mistakes'");
    expect(m![0]).not.toContain('openVocabQuickReview');
  });

  it('語彙クイック復習は旧コース（庭園）からしか開かれない', () => {
    // 呼び出しは定義1か所＋庭園1か所だけ。増えたらこのテストで気づく
    const calls = [...page.matchAll(/openVocabQuickReview/g)];
    expect(calls).toHaveLength(2);
    expect(page).toContain('onOpenVocabReview={openVocabQuickReview}');
  });

  it('旧SRSが sessionStorage 保存のままであることを明示している（変わったらここも直す）', () => {
    const registry = read('src/lib/aiLesson/course/courseStorageRegistry.ts');
    expect(registry).toContain("storage: 'session'");
    const persistence = read('src/lib/aiLesson/course/persistence/vocabPersistence.ts');
    // 「未接続」の草案のままなら、V2をつなげてはいけない
    expect(persistence).toContain('まだどこからもimportしない');
  });
});

describe('V2の復習は台帳（DB保存）から作られる', () => {
  it('錯題本は mastery 台帳から導出している（別の保存先を持たない）', () => {
    const notebook = read('src/lib/aiLesson/course/adventure/advMistakeNotebook.ts');
    expect(notebook).toContain('AdvMasteryLedger');
    // 本文・予定を別に持ち出していない＝台帳が消えない限り復習も消えない
    expect(notebook).not.toContain('sessionStorage');
    expect(notebook).not.toContain('localStorage');
  });
});
