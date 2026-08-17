// @vitest-environment jsdom
// 会話前の旅立ちカード（FOREST FIRST §12）: 場所・相手・目的・目標表現・所要時間の提示と開始導線。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { aiCourseI18n } from '../../../locales/aiCourse';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { KatariPortIntro } from './KatariPortIntro';
import { TeacherProvider } from '../TeacherAvatar';

afterEach(cleanup);

const baseProps = {
  purposeJa: '以前と今の変化を説明する',
  targetExpression: '〜ようになりました',
  estimatedMinutes: 3,
  remainingToday: 5,
  onStartVoice: () => {},
  onStartText: () => {},
  onBack: () => {},
};

describe('KatariPortIntro（会話の港・会話前カード）', () => {
  it('場所・相手・目的・目標表現・所要時間・残回数を表示する', () => {
    render(<KatariPortIntro t={aiCourseI18n.ja} {...baseProps} />);
    expect(screen.getByText('カタリ港（会話の港）')).toBeTruthy();
    expect(screen.getByText('翔子先生（ことばの案内人）')).toBeTruthy();
    expect(screen.getByText('以前と今の変化を説明する')).toBeTruthy();
    expect(screen.getByText('「〜ようになりました」')).toBeTruthy();
    expect(screen.getByText('約3分')).toBeTruthy();
    expect(screen.getByText('5回')).toBeTruthy();
  });

  it('**選択中の先生のアイコンを出す**（翔子固定だと悠斗先生選択者に女性が出る・2026-08-17 CEO報告）', () => {
    const { container } = render(
      <TeacherProvider teacherId="yuto">
        <KatariPortIntro t={aiCourseI18n.ja} {...baseProps} />
      </TeacherProvider>,
    );
    const img = container.querySelector('img');
    expect(img?.getAttribute('src') ?? '', '悠斗先生のアバター画像が出ること').toContain('yuto');
  });

  it('**進行中セッションがあれば復旧選択肢を出す**（2026-08-16 CEO報告「押しても無反応」の解消）', () => {
    const onDiscard = vi.fn(); const onCancel = vi.fn();
    render(<KatariPortIntro t={aiCourseI18n.ja} {...baseProps}
      recovery={{ mode: 'voice' }} onDiscardActive={onDiscard} onCancelRecovery={onCancel} />);
    // 開始ボタンの代わりに復旧パネルが出る（押せないボタンを残さない）
    expect(screen.queryByText('声で会話を始める')).toBeNull();
    expect(screen.getByText('前回のレッスンが途中のままです')).toBeTruthy();
    fireEvent.click(screen.getByText('前のレッスンを終了して、この会話を始める'));
    expect(onDiscard).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('いまはやめておく'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('**開始できなかった理由を画面に出す**（黙って無反応にしない・原則15）', () => {
    render(<KatariPortIntro t={aiCourseI18n.ja} {...baseProps} startError="今日の回数を使い切りました" />);
    expect(screen.getByRole('alert').textContent).toContain('今日の回数を使い切りました');
  });

  it('声・テキスト・もどるの3導線が動く（会話エンジンには触れない）', () => {
    const onVoice = vi.fn(); const onText = vi.fn(); const onBack = vi.fn();
    render(<KatariPortIntro t={aiCourseI18n.ja} {...baseProps} onStartVoice={onVoice} onStartText={onText} onBack={onBack} />);
    fireEvent.click(screen.getByText('声で会話を始める'));
    fireEvent.click(screen.getByText('テキストで話す'));
    fireEvent.click(screen.getByText('ミナモ列島の地図へ'));
    expect(onVoice).toHaveBeenCalledTimes(1);
    expect(onText).toHaveBeenCalledTimes(1);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('starting中はCTAをdisableして二重開始を防ぐ', () => {
    const onVoice = vi.fn();
    render(<KatariPortIntro t={aiCourseI18n.ja} {...baseProps} starting onStartVoice={onVoice} />);
    fireEvent.click(screen.getByText('声で会話を始める'));
    expect(onVoice).not.toHaveBeenCalled();
  });
});
