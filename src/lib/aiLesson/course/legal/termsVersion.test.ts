// 規約の版の上げ忘れを検出する。
//
// 申込記録には `termsVersion` しか残らない。本文だけ書き換えて版を据え置くと、
// 「この人が同意した内容」を後から復元できなくなる（＝証拠にならない）。
// そこで本文のハッシュを版に紐づけ、ズレたら落とす。
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { TERMS_VERSION, TERMS_CONTENT_HASH } from './termsVersion';
import { buildLegalPages, LEGAL_PAGE_IDS } from './legalContent';
import { LEGAL_FACTS } from './legalFacts';

/** 法務本文（ja/zh の全ページ）＋事実 から作る安定したハッシュ */
const currentHash = (): string => {
  const parts: string[] = [];
  for (const lang of ['ja', 'zh'] as const) {
    for (const page of buildLegalPages(lang)) {
      parts.push(page.id, page.title, page.intro);
      for (const s of page.sections) {
        // 未確定（null）の項目は落ちるので、確定した本文だけがハッシュに入る
        parts.push(s.heading, ...s.body.filter((b): b is string => b !== null));
      }
    }
  }
  // 事実（価格・返金方針など）も同意対象なので含める
  parts.push(JSON.stringify(LEGAL_FACTS));
  return createHash('sha256').update(parts.join('')).digest('hex').slice(0, 16);
};

describe('規約の版', () => {
  it('形式は YYYY-MM-DD.N', () => {
    expect(TERMS_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
  });

  it('全ページ分のハッシュを作れる（ページが増減しても落ちない）', () => {
    expect(LEGAL_PAGE_IDS.length).toBeGreaterThan(0);
    expect(currentHash()).toHaveLength(16);
  });

  it('**本文を変えたら版も上げる**（据え置きを検出する）', () => {
    const now = currentHash();
    expect(
      TERMS_CONTENT_HASH,
      [
        '',
        '法務本文または法務事実が変わっています。',
        '申込記録には termsVersion しか残らないので、版を据え置くと',
        '「この人が同意した内容」を後から復元できなくなります。',
        '',
        '対応:',
        `  1. TERMS_VERSION を進める（いまは ${TERMS_VERSION}）`,
        `  2. TERMS_CONTENT_HASH を '${now}' に更新する`,
        '',
      ].join('\n'),
    ).toBe(now);
  });
});
