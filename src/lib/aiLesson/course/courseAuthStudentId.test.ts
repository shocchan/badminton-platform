// ID＋パスワードログインの受入テスト（純関数部分）。
// いちばん守りたいこと:
// - IDは英小文字数字のみ（メールアドレスとして必ず妥当になる・なりすまし文字を入れない）
// - `.invalid` を使わない（QA fixture専用の目印。実生徒に使うとseed系ガードを素通りする）
import { describe, it, expect } from 'vitest';
import { isValidStudentId, studentIdToEmail, STUDENT_ID_DOMAIN, loginEmailFor } from './courseAuth';

describe('生徒ID→内部メール変換', () => {
  it('英小文字はじまり・英小文字数字3〜20字だけを許す', () => {
    expect(isValidStudentId('li')).toBe(true);       // 2字から許可（例: 李さん=li）
    expect(isValidStudentId('a')).toBe(false);       // 1字は不可
    expect(isValidStudentId('summer')).toBe(true);
    expect(isValidStudentId('andy2026')).toBe(true);
    expect(isValidStudentId('1abc')).toBe(false);    // 数字はじまり不可
    expect(isValidStudentId('Li')).toBe(true);       // 大文字は小文字化して判定
    expect(isValidStudentId('a b')).toBe(false);
    expect(isValidStudentId('a@b.com')).toBe(false); // メール直接入力は不可
    expect(isValidStudentId('')).toBe(false);
  });

  it('内部メールは自社ドメイン・小文字化される', () => {
    expect(studentIdToEmail('Summer')).toBe(`summer@${STUDENT_ID_DOMAIN}`);
  });

  it('**`.invalid` ドメインを使わない**（QA fixtureの目印と衝突させない）', () => {
    expect(STUDENT_ID_DOMAIN.endsWith('.invalid')).toBe(false);
    expect(STUDENT_ID_DOMAIN).toBe('id.badminton-platform.pages.dev');
  });
});

/*
 * ID＝申込時のメールアドレス（2026-09-09 CEO決定）。
 * 合成メールでは (a) 再設定メールを送れない (b) バド側のマイページに出ない
 * の2つが起きていたので、購入者のIDは実メールになった。
 * **これまでの生徒の短いIDも同じ欄でそのまま通す**（既存を壊さない）。
 */
describe('loginEmailFor', () => {
  it('これまでの短いIDは自ドメインを足す', () => {
    expect(loginEmailFor('summer')).toBe(`summer@${STUDENT_ID_DOMAIN}`);
    expect(loginEmailFor(' SUMMER ')).toBe(`summer@${STUDENT_ID_DOMAIN}`);
  });

  it('メールアドレスはそのまま使う', () => {
    expect(loginEmailFor('you@example.com')).toBe('you@example.com');
    expect(loginEmailFor(' You@Example.COM ')).toBe('you@example.com');
    expect(loginEmailFor('a.b+c@qq.com')).toBe('a.b+c@qq.com');
  });

  it('自ドメインを貼られてもIDとして扱う（前からの救済を壊さない）', () => {
    expect(loginEmailFor(`kaiwa@${STUDENT_ID_DOMAIN}`)).toBe(`kaiwa@${STUDENT_ID_DOMAIN}`);
  });

  it('IDでもメールでもないものは null（ログインを試みない）', () => {
    for (const bad of ['', '   ', 'a', '@example.com', 'you@', 'you@example', 'ある人']) {
      expect(loginEmailFor(bad), bad).toBe(null);
    }
  });
});
