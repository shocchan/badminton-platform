// @vitest-environment jsdom
// 設定画面の「冒険の設定」セクション（2026-08-16 メニュー整理）の受入テスト。
//
// いちばん守りたいこと:
// - V2有効（advActionsあり）のときだけ出る。旧コースの生徒には見せない
// - ボタンを押すと渡されたハンドラが呼ばれる（AdvShellのteacher/redo画面へつながる）
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { CourseSettings } from './CourseSettings';
import { aiCourseI18n } from '../../locales/aiCourse';
import type { Learner } from '../../lib/aiLesson/course/types';

const learner = {
  id: 'l1', displayName: 'テスト', difficultyLevel: 'normal',
  settings: {},
} as unknown as Learner;

const baseProps = {
  t: aiCourseI18n.ja,
  learner,
  onShowGuide: () => {},
  onSaveSettings: () => {},
  onSaveNickname: async () => true,
  onLogout: () => {},
  onBack: () => {},
};

afterEach(() => cleanup());

describe('冒険の設定セクション', () => {
  it('advActionsが渡されたときだけセクションが出て、押すとハンドラが呼ばれる', () => {
    const onTeacher = vi.fn();
    const onRedo = vi.fn();
    render(<CourseSettings {...baseProps} advActions={{
      title: '冒険の設定',
      items: [
        { label: '案内の先生を変える', onClick: onTeacher },
        { label: '目的・レベルを変える（準備をやり直す）', onClick: onRedo },
      ],
    }} />);
    expect(screen.getByText('冒険の設定')).toBeTruthy();
    screen.getByRole('button', { name: '案内の先生を変える' }).click();
    expect(onTeacher).toHaveBeenCalledTimes(1);
    screen.getByRole('button', { name: '目的・レベルを変える（準備をやり直す）' }).click();
    expect(onRedo).toHaveBeenCalledTimes(1);
  });

  it('advActionsなし（旧コースの生徒）にはセクションを出さない', () => {
    render(<CourseSettings {...baseProps} />);
    expect(screen.queryByText('冒険の設定')).toBeNull();
    expect(screen.queryByText('案内の先生を変える')).toBeNull();
  });
});
