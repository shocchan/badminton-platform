// レポートの中身を増やした分を守るテスト（2026-08-26 ファネル監査 P2）。
//
// 直した実測の問題:
//   1. corrections.noteZh は schema で **required** なのに、プロンプトに説明が一行も無かった。
//      何を書く欄なのかモデルに伝えていないので、中身がその日その日で変わっていた。
//      「なぜそう直すのか」を中国語で言う欄だと明記する。
//   2. レポートが「できた／直そう」だけで、練習が日本の生活のどこで効くのか書かれていなかった。
//      usableSceneJa / usableSceneZh を足す。
//
// strict モードの制約（properties ⊆ required）は reportSchemaStrict.test.ts が別に見ている。
// ここは「指示が消えていないか」だけを見る。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(resolve(process.cwd(), 'supabase/functions/ai-lesson-report/index.ts'), 'utf8');

describe('ai-lesson-report のプロンプト', () => {
  it('noteZh が何を書く欄か指示されている', () => {
    expect(SRC).toContain('noteZh');
    // 「理由を書く」と明示されていること（無いとモデルが直し方の指示を書く）
    expect(SRC).toMatch(/noteZh[\s\S]{0,400}理由/);
  });

  it('noteZh の指示が中国語で書かせるものになっている', () => {
    expect(SRC).toMatch(/noteZh[\s\S]{0,300}(簡体字中国語|中国語)/);
  });

  it('日本で使える場面をレポートに出す指示がある', () => {
    expect(SRC).toContain('usableSceneJa');
    expect(SRC).toContain('usableSceneZh');
    expect(SRC).toMatch(/usableSceneJa[\s\S]{0,300}日本の生活/);
  });

  it('作り話をさせない歯止めがある（思いつかなければ null）', () => {
    expect(SRC).toMatch(/usableSceneJa[\s\S]{0,400}(思いつかなければ null|関係のない場面を作らない)/);
  });

  it('null を許す型なので「無し」を表せる（strict の required に入れても壊れない）', () => {
    expect(SRC).toMatch(/usableSceneJa: \{ type: \["string", "null"\]/);
    expect(SRC).toMatch(/usableSceneZh: \{ type: \["string", "null"\]/);
  });
});

describe('会話中のヒント（言い方がわからない）', () => {
  const VOICE = readFileSync(resolve(process.cwd(), 'src/components/ai-course/CourseVoiceLesson.tsx'), 'utf8');
  // コメントで誤検出しないよう本文だけを見る
  const code = VOICE.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

  it('既存の sendCue に乗せている（realtime の張り方を変えていない）', () => {
    expect(code).toMatch(/askForHint[\s\S]{0,900}sendCue/);
  });

  it('接続中のときだけ押せる', () => {
    expect(code).toMatch(/askForHint = useCallback\(\(\) => \{\s*if \(status !== 'connected'/);
  });

  it('ヒントを使うとレポートが「ヒントあり」になることを画面で伝えている', () => {
    expect(code).toContain('tv.stuckNote');
    const ja = readFileSync(resolve(process.cwd(), 'src/locales/aiCourse.ts'), 'utf8');
    expect(ja).toMatch(/stuckNote: '※ ヒントを使って言えた場合/);
    expect(ja).toMatch(/stuckNote: '※ 用了提示后说出来的/);
  });

  it('使われた回数が測れる（hint_requested を記録する）', () => {
    expect(code).toContain("logCourseEvent('hint_requested'");
    const events = readFileSync(resolve(process.cwd(), 'src/lib/aiLesson/course/courseEvents.ts'), 'utf8');
    expect(events).toContain("'hint_requested'");
  });
});
