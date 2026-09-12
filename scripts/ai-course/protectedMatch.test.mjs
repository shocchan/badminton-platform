// 実在生徒の保護判定（remote-sql.mjs の --write ガード）。
//
// 判定を「部分一致」から「識別子としての一致」に緩めたので、
// **保護が外れていないこと**をここで固定する。外れると実在生徒のデータを
// 確認なしで書き換えられてしまう（2026-08-15 監査P1の再発）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { matchedIdentifiers } from './protectedMatch.mjs';

const LIST = JSON.parse(readFileSync(join(import.meta.dirname, 'data/protected-learners.json'), 'utf8'));
const ids = LIST.identifiers;
const m = (sql) => matchedIdentifiers(sql.toLowerCase(), ids);

describe('保護対象の判定', () => {
  it('本人を狙った書き込みは**必ず止まる**', () => {
    for (const id of ids) {
      expect(m(`update ai_learners set settings='{}' where email = '${id}'`), id).toContain(id);
    }
  });

  it('リストの全員が、引用符なし・改行の中でも拾える', () => {
    for (const id of ids) {
      expect(m(`delete from ai_learners\nwhere email = ${id}\n`), id).toContain(id);
      expect(m(`-- ${id} を直す\nupdate ai_learners set x=1;`), id).toContain(id);
    }
  });

  it('ドメイン一括パターンも拾う（生徒全員に当たり得るため）', () => {
    const bulk = matchedIdentifiers(
      "delete from ai_learners where email like '%@id.badminton-platform.pages.dev'".toLowerCase(),
      LIST.bulkPatterns);
    expect(bulk.length).toBeGreaterThan(0);
  });

  it('**別人に誤爆しない**（eli への書き込みが li として記録されていた）', () => {
    const hits = m("update ai_learners set settings='{}' where email = 'eli@id.badminton-platform.pages.dev'");
    expect(hits, 'エリさんが拾えていない').toContain('eli@id.badminton-platform.pages.dev');
    expect(hits, '李さんとして記録されている').not.toContain('li@id.badminton-platform.pages.dev');
  });

  it('関係ない生徒のSQLでは何も拾わない', () => {
    expect(m("update ai_learners set settings='{}' where email = 'testqa@id.badminton-platform.pages.dev'"))
      .toEqual([]);
  });

  it('メールの一部が偶然一致しただけでは拾わない', () => {
    expect(m("select * from t where email = 'xxli@id.badminton-platform.pages.dev'")).toEqual([]);
    expect(m("select * from t where email = 'li@id.badminton-platform.pages.development'")).toEqual([]);
  });
});
