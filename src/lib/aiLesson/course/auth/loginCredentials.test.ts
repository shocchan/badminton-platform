import { describe, it, expect } from 'vitest';
import {
  normalizePassword, normalizeLoginId, checkPassword, generatePassword,
  generateLoginId, isLoginIdShape, canonicalLoginId, PASSWORD_LENGTH,
} from './loginCredentials';

/** 決定的な擬似乱数（テストで生成物を固定する） */
const seededInt = (seed: number) => {
  let s = seed >>> 0 || 1;
  return (max: number) => {
    s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0;
    return s % max;
  };
};

describe('パスワードの正規化（手入力の揺れを吸収する）', () => {
  it('全角英数字を半角へ寄せる', () => {
    expect(normalizePassword('Ｋ７Ｍ３Ｑ８')).toBe('K7M3Q8');
  });
  it('大文字小文字を区別しない', () => {
    expect(normalizePassword('k7m3q8')).toBe('K7M3Q8');
  });
  it('空白・全角空白・ハイフンを除去する（書き写しの癖）', () => {
    expect(normalizePassword('K7M3-Q8')).toBe('K7M3Q8');
    expect(normalizePassword('K7M3 Q8')).toBe('K7M3Q8');
    expect(normalizePassword('K7M3　Q8')).toBe('K7M3Q8');
  });
});

describe('パスワードの検査（§2）', () => {
  it('英数字混在の6文字を受け入れる', () => {
    const r = checkPassword('K7M3Q8');
    expect(r.ok).toBe(true);
    expect(r.normalized).toBe('K7M3Q8');
  });

  it('数字だけ6文字は拒否する', () => {
    const r = checkPassword('123456');
    expect(r.ok).toBe(false);
    expect(r.problems).toContain('needs_letter');
  });

  it('英字だけ6文字は拒否する', () => {
    const r = checkPassword('ABCDEF');
    expect(r.ok).toBe(false);
    expect(r.problems).toContain('needs_digit');
  });

  it('6文字ちょうどでなければ拒否する', () => {
    expect(checkPassword('K7M3Q').ok).toBe(false);
    expect(checkPassword('K7M3Q88').ok).toBe(false);
    expect(checkPassword('K7M3Q').problems).toContain('wrong_length');
  });

  it('記号は使えない', () => {
    const r = checkPassword('K7M3Q!');
    expect(r.ok).toBe(false);
    expect(r.problems).toContain('not_alphanumeric');
  });

  it('正規化してから判定する（全角・小文字・ハイフン入りでも通る）', () => {
    expect(checkPassword('ｋ７ｍ３ｑ８').ok).toBe(true);
    expect(checkPassword('k7m3-q8').ok).toBe(true);
  });
});

describe('パスワード生成（§2: 誤読しやすい文字を避ける）', () => {
  it('0 O 1 I L を含まない・英数字混在・6文字（1000回）', () => {
    const rnd = seededInt(20260803);
    for (let i = 0; i < 1000; i++) {
      const pw = generatePassword(rnd);
      expect(pw).toHaveLength(PASSWORD_LENGTH);
      expect(pw).not.toMatch(/[01OIL]/);
      expect(pw).toMatch(/[A-Z]/);
      expect(pw).toMatch(/[0-9]/);
      expect(checkPassword(pw).ok).toBe(true);
    }
  });

  it('英字が常に先頭に来るような偏りが無い', () => {
    const rnd = seededInt(7);
    let digitFirst = 0;
    for (let i = 0; i < 300; i++) {
      if (/^[0-9]/.test(generatePassword(rnd))) digitFirst += 1;
    }
    expect(digitFirst).toBeGreaterThan(0);   // シャッフルが効いている
  });
});

describe('ログインID', () => {
  it('MN-4K7Q の形で生成し、誤読文字を含まない', () => {
    const rnd = seededInt(99);
    for (let i = 0; i < 300; i++) {
      const id = generateLoginId(rnd);
      expect(id).toMatch(/^[A-Z]{2}-[A-Z0-9]{4}$/);
      expect(id).not.toMatch(/[01OIL]/);
      expect(isLoginIdShape(id)).toBe(true);
    }
  });

  it('小文字・全角・ハイフン無しでも同じIDとして扱う', () => {
    expect(canonicalLoginId('mn-4k7q')).toBe('MN-4K7Q');
    expect(canonicalLoginId('MN4K7Q')).toBe('MN-4K7Q');
    expect(canonicalLoginId('ＭＮ－４Ｋ７Ｑ')).toBe('MN-4K7Q');
    expect(normalizeLoginId(' mn-4k7q ')).toBe('MN-4K7Q');
  });
});
