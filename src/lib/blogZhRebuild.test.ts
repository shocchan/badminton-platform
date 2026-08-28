// translate-blog-zh（Edge Function）が本文HTMLを組み立て直す手順の回帰テスト。
//
// 守りたいのは「訳したら画像やリンクが消える／並びが変わる」が起きないこと。
// 2026-08-28に、中国語版だけ画像が2枚欠けた状態で公開されてしまったため、
// 同じ組み立て方をここで固定しておく。
// Deno側の実装（supabase/functions/translate-blog-zh/index.ts）と同じ式を使う。
import { describe, it, expect } from 'vitest';

const splitHtml = (html: string) => html.split(/(<[^>]+>)/);
const textIndexes = (parts: string[]) =>
  parts.map((p, i) => (!p.startsWith('<') && p.trim() ? i : -1)).filter(i => i >= 0);

/** 訳文を元のHTMLへ戻す（Edge Function と同じ手順） */
function rebuild(html: string, translated: string[]): string {
  const parts = splitHtml(html);
  const idxs = textIndexes(parts);
  if (idxs.length !== translated.length) throw new Error('segment count mismatch');
  const out = [...parts];
  idxs.forEach((partIndex, n) => {
    const orig = parts[partIndex];
    const lead = orig.slice(0, orig.length - orig.trimStart().length);
    const trail = orig.slice(orig.trimEnd().length);
    out[partIndex] = lead + translated[n].trim() + trail;
  });
  return out.join('');
}

const SAMPLE = [
  '<p>2026年8月27日、芝園公民館で開催しました！</p>',
  '<p></p>',
  '<span style="display: block; text-align: left;">',
  '<img src="https://example.supabase.co/storage/v1/object/public/blog-images/body/abc_w1600.webp"',
  ' width="400" style="width: 400px; max-width: 100%;"></span>',
  '<h2>🏆 大会結果</h2>',
  '<p>詳しくは<a href="/ja/blog/35"><strong>この記事</strong></a>に書きました。</p>',
].join('');

describe('中国語版の組み立て', () => {
  it('テキストノードだけを差し替え、タグ・画像・リンクは原文のまま', () => {
    const parts = splitHtml(SAMPLE);
    const idxs = textIndexes(parts);
    const zh = idxs.map((_, i) => `訳文${i}`);
    const out = rebuild(SAMPLE, zh);

    // 画像とリンクの数・URLが変わらない
    expect((out.match(/<img/g) || []).length).toBe((SAMPLE.match(/<img/g) || []).length);
    expect(out).toContain('blog-images/body/abc_w1600.webp');
    expect(out).toContain('href="/ja/blog/35"');
    expect(out).toContain('width: 400px; max-width: 100%;');
    // 日本語の本文は残っていない
    expect(out).not.toContain('芝園公民館で開催しました');
  });

  it('翻訳対象は空白でないテキストノードだけ', () => {
    const idxs = textIndexes(splitHtml(SAMPLE));
    const texts = idxs.map(i => splitHtml(SAMPLE)[i]);
    expect(texts).toEqual([
      '2026年8月27日、芝園公民館で開催しました！',
      '🏆 大会結果',
      '詳しくは',
      'この記事',
      'に書きました。',
    ]);
  });

  it('訳文の数が合わないときは組み立てず落とす（欠けた本文を保存しないため）', () => {
    expect(() => rebuild(SAMPLE, ['1つだけ'])).toThrow('segment count mismatch');
  });

  it('前後の空白は原文のものを保つ', () => {
    const html = '<p>\n  こんにちは  \n</p>';
    expect(rebuild(html, ['你好'])).toBe('<p>\n  你好  \n</p>');
  });
});
