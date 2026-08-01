// @vitest-environment jsdom
// 案内キャラクターの一貫性テスト。
//
// FAIL条件:
// - Provider で配った先生と違うアバターが出る
// - 画像が壊れたときに空表示になる
// - ja / zh でラベルが出ない
// - 既存の呼び出し（ShokoAvatar）が選択に追随しない
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { TeacherAvatar, TeacherProvider } from './TeacherAvatar';
import { ShokoAvatar } from './ShokoAvatar';
import { ALL_TEACHERS } from '../../lib/aiLesson/course/adventure/advTeacher';
import { CourseIllustration } from './CourseIllustration';

afterEach(() => cleanup());

const wrap = (teacherId: 'shoko' | 'yuto' | null, node: React.ReactNode) =>
  render(<TeacherProvider teacherId={teacherId}>{node}</TeacherProvider>);

describe('TeacherAvatar', () => {
  it('選んだ先生の画像とラベルを出す（ja）', () => {
    wrap('yuto', <TeacherAvatar size={40} lang="ja" />);
    const img = screen.getByAltText('悠斗先生') as HTMLImageElement;
    expect(img.getAttribute('src')).toContain('yuto-sensei');
  });

  it('選んだ先生の画像とラベルを出す（zh）', () => {
    wrap('yuto', <TeacherAvatar size={40} lang="zh" />);
    const img = screen.getByAltText('悠斗老师') as HTMLImageElement;
    expect(img.getAttribute('src')).toContain('yuto-sensei');
  });

  it('未選択は既定の先生（従来の見え方を保つ）', () => {
    wrap(null, <TeacherAvatar size={40} lang="ja" />);
    const img = screen.getByAltText('翔子先生') as HTMLImageElement;
    expect(img.getAttribute('src')).toContain('shoko-sensei');
  });

  it('**画像が読めなくてもモノグラムを出す**（空表示にしない）', () => {
    wrap('yuto', <TeacherAvatar size={40} lang="ja" />);
    const img = screen.getByAltText('悠斗先生');
    fireEvent.error(img);
    expect(screen.getByLabelText('悠斗先生').textContent).toBe('悠');
    expect(screen.queryByRole('img', { name: '悠斗先生' })).not.toBeNull();
  });

  it('**既存の ShokoAvatar 呼び出しも選択に追随する**（会話・復習・レポート画面の一貫性）', () => {
    wrap('yuto', <ShokoAvatar size={24} />);
    const img = screen.getByAltText('悠斗先生') as HTMLImageElement;
    expect(img.getAttribute('src')).toContain('yuto-sensei');
  });

  it('teacher を明示指定すると Provider より優先される（選択カード用）', () => {
    const shoko = ALL_TEACHERS.find((t) => t.id === 'shoko')!;
    wrap('yuto', <TeacherAvatar teacher={shoko} size={40} lang="ja" />);
    expect((screen.getByAltText('翔子先生') as HTMLImageElement).getAttribute('src')).toContain('shoko-sensei');
  });

  it('装飾用途（labeled=false）は読み上げ対象にしない', () => {
    wrap('shoko', <TeacherAvatar size={16} labeled={false} />);
    expect(screen.queryByAltText('翔子先生')).toBeNull();
  });
});

// FINAL COMPLETION §18: 場面イラスト・テキスト会話の話者名も選んだ先生に揃える。
// 画面のどこかに既定の先生が残ると「案内している人が誰か」がぶれる。
describe('場面イラストが選んだ先生に追随する', () => {
  it('未選択なら従来どおり翔子先生の専用ポーズを使う', () => {
    render(
      <TeacherProvider teacherId={null}>
        <CourseIllustration slot="complete" lang="ja" />
      </TeacherProvider>,
    );
    const img = screen.getByAltText('翔子先生が拍手して喜んでいる') as HTMLImageElement;
    expect(img.getAttribute('src')).toContain('shoko-sensei-cheer');
  });

  it('悠斗先生を選ぶと悠斗先生の絵とalt文になる（無いポーズはbaseへ落ちる）', () => {
    render(
      <TeacherProvider teacherId="yuto">
        <CourseIllustration slot="complete" lang="ja" />
      </TeacherProvider>,
    );
    const img = screen.getByAltText('悠斗先生が拍手して喜んでいる') as HTMLImageElement;
    expect(img.getAttribute('src')).toContain('yuto-sensei');
    expect(img.getAttribute('src')).not.toContain('shoko');
  });

  it('zh表示でも先生名が中国語になる', () => {
    render(
      <TeacherProvider teacherId="yuto">
        <CourseIllustration slot="roadmapGoal" lang="zh" />
      </TeacherProvider>,
    );
    expect(screen.getByAltText('悠斗老师用平板讲解')).toBeTruthy();
  });

  it('専用画像が無い用途は描画しない（無い絵をでっち上げない）', () => {
    const { container } = render(
      <TeacherProvider teacherId="yuto">
        <CourseIllustration slot="growth" lang="ja" />
      </TeacherProvider>,
    );
    expect(container.querySelector('img')).toBeNull();
  });

  it('装飾用途では読み上げ対象にしない', () => {
    render(
      <TeacherProvider teacherId="yuto">
        <CourseIllustration slot="complete" lang="ja" decorative />
      </TeacherProvider>,
    );
    const img = document.querySelector('img');
    expect(img?.getAttribute('alt')).toBe('');
    expect(img?.getAttribute('aria-hidden')).toBe('true');
  });
});
