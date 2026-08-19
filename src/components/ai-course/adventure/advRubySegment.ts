// ふりがな（ルビ）の純関数層（2026-08-19 新設。描画は AdvRuby.tsx）。
// JaTermText.tsx / jaTermSegment.ts と同じ分け方: componentファイルには関数exportを置かない。
//
// 読みデータの形式は2種類:
// 1. 注釈付き本文（読解 ReadingSet.rubyJa）: 漢字の連なりを `[表記|よみ]` で囲んだ本文全文。
//    例: '【ロッカーを[使|つか]う[方|かた]へ】'
//    注釈を剥がすと元の本文と完全一致すること（advRuby.test.tsx が全件で機械検査）。
// 2. かな全文（文法draftの furigana）: 文全体をひらがなにし文節を半角スペースで区切った文字列
//    （例 'きょうは びょういんに いきます。'）。alignFurigana が漢字との対応を復元する。
//    復元は「かな部分が完全一致で並ぶ」ときだけ成功し、少しでも合わなければ null（＝出さない）。

export interface AdvRubySegment {
  text: string;
  reading?: string;
}

/** 漢字（々〆ヶ含む）。ルビの対象になる文字 */
const KANJI_RE = /[㐀-鿿豈-﫿々〆ヶ]/;
const KANJI_RUN_RE = /[㐀-鿿豈-﫿々〆ヶ]+/g;
/** ひらがな（読みとして許す文字。長音は読みでは使わない） */
const HIRAGANA_ONLY_RE = /^[ぁ-ゖー]+$/;

export const hasKanji = (s: string): boolean => KANJI_RE.test(s);

/** 注釈 `[表記|よみ]` を分解する。注釈の外はそのままのsegmentになる */
export const parseRubyAnnotated = (annotated: string): AdvRubySegment[] => {
  const out: AdvRubySegment[] = [];
  const re = /\[([^[\]|]+)\|([^[\]|]+)\]/g;
  let last = 0;
  for (let m = re.exec(annotated); m; m = re.exec(annotated)) {
    if (m.index > last) out.push({ text: annotated.slice(last, m.index) });
    out.push({ text: m[1], reading: m[2] });
    last = m.index + m[0].length;
  }
  if (last < annotated.length) out.push({ text: annotated.slice(last) });
  return out;
};

/** 注釈を剥がして元の本文に戻す（本文一致の機械検査に使う） */
export const stripRuby = (annotated: string): string =>
  parseRubyAnnotated(annotated).map((s) => s.text).join('');

/** カタカナ→ひらがな折りたたみ（かな全文との照合用。長音・記号はそのまま） */
const foldKana = (s: string): string =>
  s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

/**
 * 「かな全文」furigana を本文と突き合わせ、漢字の連なりごとの読みを復元する。
 * 本文のかな・記号が furigana 側と1文字でも食い違えば null（誤読を出さないための全断念）。
 *
 * furigana の半角/全角スペースは文節の区切りとして**境界に使う**（捨てない）:
 * 1つの漢字runの読みが文節の切れ目をまたぐことは無いので、
 * 「国に帰りたい」×「くにに かえりたいです」のような曖昧な割り方
 * （国=く/帰=にかえ）をスペースが排除する。残る曖昧ケースは
 * バックトラックで「後続がすべて一致する最短の読み」を選ぶ。
 */
export const alignFurigana = (textJa: string, kanaLine: string): AdvRubySegment[] | null => {
  // 全角スペース（U+3000）も文節区切りとして半角へ寄せる
  const reading = foldKana(kanaLine).replace(/\u3000/g, ' ');
  const isSpace = (c: string | undefined): boolean => c === ' ';
  // 本文を「漢字の連なり」と「それ以外」の run に分ける
  const runs: { kanji: boolean; text: string }[] = [];
  let rest = textJa;
  while (rest.length > 0) {
    KANJI_RUN_RE.lastIndex = 0;
    const m = KANJI_RUN_RE.exec(rest);
    if (!m) { runs.push({ kanji: false, text: rest }); break; }
    if (m.index > 0) runs.push({ kanji: false, text: rest.slice(0, m.index) });
    runs.push({ kanji: true, text: m[0] });
    rest = rest.slice(m.index + m[0].length);
  }
  const skipSpaces = (pos: number): number => {
    while (isSpace(reading[pos])) pos++;
    return pos;
  };
  // run列を reading に対して再帰的に割り付ける。
  // allowCross=false: 漢字runの読みは文節スペースをまたげない（曖昧さの排除が最優先）。
  // allowCross=true : 「毎朝七時」×「まいあさ しちじに」のように、**ひと続きの漢字の中に**
  //                   文節の切れ目が来る複合語のための再試行。またいだ読みはスペース抜きで返す
  const solve = (runIdx: number, pos: number, acc: AdvRubySegment[], allowCross: boolean): AdvRubySegment[] | null => {
    pos = skipSpaces(pos);
    if (runIdx === runs.length) return pos === reading.length ? acc : null;
    const run = runs[runIdx];
    if (!run.kanji) {
      // 本文側のかな・記号は1文字ずつ一致で消費（furigana側の文節スペースは読み飛ばす）
      for (const ch of run.text) {
        pos = skipSpaces(pos);
        if (ch === ' ' || ch === '　') continue; // 本文側のスペースはfurigana側に無くてもよい
        if (reading[pos] !== foldKana(ch)) return null;
        pos++;
      }
      return solve(runIdx + 1, pos, [...acc, { text: run.text }], allowCross);
    }
    // 漢字run: 読みは1文字以上のひらがな。短い候補から試し、後続全体が一致した最初の解を採る
    let p = pos;
    let buf = '';
    while (p < reading.length) {
      const c = reading[p];
      if (isSpace(c)) {
        if (!allowCross) break;
        p++;
        continue;
      }
      if (!HIRAGANA_ONLY_RE.test(c)) break;
      buf += c;
      p++;
      const solved = solve(runIdx + 1, p, [...acc, { text: run.text, reading: buf }], allowCross);
      if (solved) return solved;
    }
    return null;
  };
  return solve(0, 0, [], false) ?? solve(0, 0, [], true);
};
