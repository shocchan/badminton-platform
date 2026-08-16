// ログインID入力の正規化（2026-08-16 CEO報告: フルメールを貼ってログイン失敗）の受入テスト。
import { describe, it, expect } from 'vitest';
import { normalizeStudentIdInput, isValidStudentId, studentIdToEmail } from './courseAuth';

describe('normalizeStudentIdInput', () => {
  it('フルの自ドメインメールを貼ってもIDに剥がれる', () => {
    expect(normalizeStudentIdInput('kaiwa@id.badminton-platform.pages.dev')).toBe('kaiwa');
    expect(normalizeStudentIdInput('  Summer@id.badminton-platform.pages.dev ')).toBe('summer');
  });

  it('素のIDはそのまま（前後空白と大文字だけ整える）', () => {
    expect(normalizeStudentIdInput(' kaiwa ')).toBe('kaiwa');
    expect(normalizeStudentIdInput('Li')).toBe('li');
  });

  it('別ドメインのメールはIDにならない（検証で弾かれる）', () => {
    const v = normalizeStudentIdInput('someone@gmail.com');
    expect(isValidStudentId(v)).toBe(false);
  });

  it('剥がした結果は正しいメールに戻る（往復）', () => {
    const id = normalizeStudentIdInput('andy@id.badminton-platform.pages.dev');
    expect(isValidStudentId(id)).toBe(true);
    expect(studentIdToEmail(id)).toBe('andy@id.badminton-platform.pages.dev');
  });
});
