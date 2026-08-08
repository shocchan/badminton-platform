// @vitest-environment jsdom
// V2招待の名前だけ入口（監査P1: 二重回答の解消）。
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { CourseNameOnlyHearing } from './CourseNameOnlyHearing';
import { V2_INVITE_DEFAULT_ANSWERS } from '../../lib/aiLesson/course/courseDiagnosis';

afterEach(cleanup);

describe('V2招待の入口 — 名前だけ聞く', () => {
  it('質問は名前だけ。8問ヒアリングの質問が出ない', () => {
    render(<CourseNameOnlyHearing lang="ja" onComplete={() => {}} />);
    expect(screen.getByText(/お名前だけ教えてください/)).toBeTruthy();
    // このあとの冒険の準備で決める、と予告する（二重に聞かない理由の説明）
    expect(screen.getByText(/このあとの「冒険の準備」で一緒に決めます/)).toBeTruthy();
    expect(screen.queryByText(/質問 1 \/ 8/)).toBeNull();
    expect(screen.queryByText(/主な目標/)).toBeNull();
  });

  it('名前が空のままでは進めない。入力すると進める', () => {
    const onComplete = vi.fn();
    render(<CourseNameOnlyHearing lang="ja" onComplete={onComplete} />);
    const btn = screen.getByRole('button', { name: /冒険の準備へ進む/ });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/お名前/), { target: { value: '  ワン  ' } });
    fireEvent.click(screen.getByRole('button', { name: /冒険の準備へ進む/ }));
    expect(onComplete).toHaveBeenCalledWith('ワン'); // 前後の空白は落とす
  });

  it('zhでは日本語が残らない', () => {
    render(<CourseNameOnlyHearing lang="zh" onComplete={() => {}} />);
    expect(screen.getByText('初次见面！')).toBeTruthy();
    expect(screen.getByRole('button', { name: /进入冒险准备/ })).toBeTruthy();
    expect(screen.queryByText(/お名前/)).toBeNull();
  });
});

describe('V2招待の中立初期値', () => {
  it('レベルを推定で決めつけない（unknown）・試験日を勝手に置かない', () => {
    expect(V2_INVITE_DEFAULT_ANSWERS.level).toBe('unknown');
    expect(V2_INVITE_DEFAULT_ANSWERS.examDateISO).toBeNull();
    expect(V2_INVITE_DEFAULT_ANSWERS.badminton).toBe(false);
  });
});
