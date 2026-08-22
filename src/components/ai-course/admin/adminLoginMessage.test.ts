// 「ログインして何をするんだっけ？」への答えを画面に出す（2026-08-23 CEO実機報告）。
//
// 一度もログインしていない人にすることは1つ＝ログイン情報を送ること。
// その文面を管理画面で作って渡す。パスワードは保存していないので**文面に入れない**。
import { describe, it, expect } from 'vitest';
import { loginMessage } from './AdminStudentDetail';

describe('生徒へ送るログイン案内', () => {
  it('学習URL・学習ID・中国語の案内が入る', () => {
    const m = loginMessage('wang');
    expect(m).toContain('https://study.kawabado.com/zh/ai-course');
    expect(m).toContain('学習ID: wang');
    expect(m).toContain('学习ID：wang');
  });

  it('パスワードは入れない（保存していないものを書いたふりをしない）', () => {
    const m = loginMessage('wang');
    expect(m).toContain('（ここに貼る）');
    expect(m).not.toMatch(/パスワード: [^（\n]/);
  });
});
