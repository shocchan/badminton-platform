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
