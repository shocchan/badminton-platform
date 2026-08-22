// 設問・選択肢・聴解のふりがな（2026-08-22）の機械検査。
//
// 守るもの:
//  1. N5/N4 の設問・選択肢・場面説明・スクリプトに**全部**ふりがなが付く（付かない字を残さない）
//  2. 注釈を剥がすと元の文字列に戻る（表示が壊れない）
//  3. ふりがなはかなだけ（漢字やアルファベットのふりがなは出さない）
//  4. 読みが手書きの本文ルビと食い違わない（同じ語が場所によって違う読みにならない）
//  5. 読みを答えにする問題にふりがなを出さない（答え漏れ）
import { describe, it, expect } from 'vitest';
import { ALL_LISTENING_SETS } from './listening/listeningBank';
import { ALL_READING_SETS } from './reading/readingBank';
import { annotateRuby, missingRuns, lookupRun } from './advRubyAuto';
import {
  RUBY_RUNS_FROM_PASSAGE, RUBY_RUNS_EXTRA, RUBY_RUNS_DEFAULT, RUBY_CONTEXT_RULES, RUBY_TEXT_OVERRIDES,
} from './advRubyDict';
import { stripRuby, parseRubyAnnotated } from '../../../../components/ai-course/adventure/advRubySegment';

const KANJI = /[一-鿿々]/;
const KANA_ONLY = /^[ぁ-んァ-ヶー・]+$/;

type Row = { setId: string; field: string; text: string };

/** N5/N4 で画面に出る日本語（本文をのぞく。本文は手書きの rubyJa がある） */
const rows: Row[] = [];
for (const s of ALL_LISTENING_SETS) {
  if (s.sourceLevel !== 'N5' && s.sourceLevel !== 'N4') continue;
  rows.push({ setId: s.setId, field: 'question', text: s.questionJa });
  rows.push({ setId: s.setId, field: 'situation', text: s.situationJa });
  rows.push({ setId: s.setId, field: 'transcript', text: s.transcriptJa });
  s.choices.forEach((c, i) => rows.push({ setId: s.setId, field: `choice${i}`, text: c.textJa }));
}
for (const s of ALL_READING_SETS) {
  if (s.sourceLevel !== 'N5' && s.sourceLevel !== 'N4') continue;
  rows.push({ setId: s.setId, field: 'question', text: s.questionJa });
  s.choices.forEach((c, i) => rows.push({ setId: s.setId, field: `choice${i}`, text: c.textJa }));
}
const withKanji = rows.filter((r) => r.text && KANJI.test(r.text));

describe('N5/N4の設問・選択肢: ふりがなが全部付く', () => {
  it('対象が十分にある（教材を消したら気づく）', () => {
    expect(withKanji.length).toBeGreaterThanOrEqual(1500);
  });

  it('漢字を含む文字列すべてにふりがなが付く', () => {
    const bad = withKanji
      .filter((r) => annotateRuby(r.text) === null)
      .map((r) => `${r.setId} ${r.field}: 辞書に無い連なり ${missingRuns(r.text).join('・')} — ${r.text}`);
    expect(bad, `辞書に足りない語がある（scripts/ai-course/check-ruby-coverage.ts で一覧が出る）:\n${bad.slice(0, 20).join('\n')}`).toEqual([]);
  });

  it('注釈を剥がすと元の文字列に戻る', () => {
    for (const r of withKanji) {
      const a = annotateRuby(r.text)!;
      expect(stripRuby(a), `${r.setId} ${r.field}`).toBe(r.text);
    }
  });

  it('ふりがなはかなだけ（漢字・英数字のふりがなを出さない）', () => {
    for (const r of withKanji) {
      for (const seg of parseRubyAnnotated(annotateRuby(r.text)!)) {
        if (!seg.reading) continue;
        expect(KANA_ONLY.test(seg.reading), `${r.setId} ${r.field}: 「${seg.text}」のふりがな「${seg.reading}」がかなではない`).toBe(true);
      }
    }
  });

  it('かなだけの文字列にはふりがなを付けない（null を返す）', () => {
    expect(annotateRuby('ここでまってください。')).toBeNull();
    expect(annotateRuby('')).toBeNull();
  });
});

describe('辞書そのものの検査', () => {
  const entries: [string, string][] = [
    ...Object.entries(RUBY_RUNS_FROM_PASSAGE),
    ...Object.entries(RUBY_RUNS_EXTRA),
    ...Object.entries(RUBY_RUNS_DEFAULT),
    ...RUBY_CONTEXT_RULES.map((r) => [r.run, r.annotation] as [string, string]),
    ...Object.entries(RUBY_TEXT_OVERRIDES),
  ];

  it('値の注釈を剥がすとキーに一致する（書き間違いを見つける）', () => {
    for (const [key, annotated] of entries) {
      expect(stripRuby(annotated), `辞書の「${key}」の値が壊れている: ${annotated}`).toBe(key);
    }
  });

  it('ふりがなはかなだけ', () => {
    for (const [key, annotated] of entries) {
      for (const seg of parseRubyAnnotated(annotated)) {
        if (!seg.reading) continue;
        expect(KANA_ONLY.test(seg.reading), `辞書の「${key}」: ふりがな「${seg.reading}」がかなではない`).toBe(true);
      }
    }
  });

  it('同じ連なりを2か所で違う読みにしていない', () => {
    const seen = new Map<string, string>();
    for (const [table, obj] of [['本文由来', RUBY_RUNS_FROM_PASSAGE], ['追加', RUBY_RUNS_EXTRA]] as const) {
      for (const [run, annotated] of Object.entries(obj)) {
        const prev = seen.get(run);
        expect(prev === undefined || prev === annotated, `「${run}」が ${table} で二重定義（${prev} と ${annotated}）`).toBe(true);
        seen.set(run, annotated);
      }
    }
  });
});

/**
 * 手書きの本文ルビ（rubyJa）を正解として、エンジンの読みを突き合わせる。
 * 対象は**設問・選択肢に実際に出てくる文脈**だけ。本文にしか出ない文脈
 * （「開きます」＝あく/ひらく のように書き方が同じで意味が違うもの）は
 * エンジンを使わないので対象外にする。
 */
describe('手書き本文ルビとの突き合わせ', () => {
  it('設問・選択肢に出る文脈では、手書きの読みと一致する', () => {
    // 設問・選択肢に出てくる (連なり, 直後3字, 直前3字) を集める
    const used = new Set<string>();
    const RUN_RE = /[一-鿿々]+/g;
    for (const r of withKanji) {
      RUN_RE.lastIndex = 0;
      for (let m = RUN_RE.exec(r.text); m; m = RUN_RE.exec(r.text)) {
        const end = m.index + m[0].length;
        used.add(`${m[0]}\t${r.text.slice(end, end + 3)}\t${r.text.slice(Math.max(0, m.index - 3), m.index)}`);
      }
    }
    const diffs: string[] = [];
    for (const s of ALL_READING_SETS) {
      if (!s.rubyJa) continue;
      const re = /\[([^[\]|]+)\|([^[\]|]+)\]/g;
      for (let m = re.exec(s.rubyJa); m; m = re.exec(s.rubyJa)) {
        const before = stripRuby(s.rubyJa.slice(0, m.index));
        const next = stripRuby(s.rubyJa.slice(m.index + m[0].length)).slice(0, 3);
        const prev = before.slice(-3);
        if (!used.has(`${m[1]}\t${next}\t${prev}`)) continue;
        const got = lookupRun(m[1], next, prev);
        if (got !== null && got !== `[${m[1]}|${m[2]}]`) {
          diffs.push(`${s.setId}: 「${m[1]}」直前「${prev}」直後「${next}」 手書き=${m[2]} 辞書=${got}`);
        }
      }
    }
    expect([...new Set(diffs)], '本文の手書きルビと辞書の読みが食い違う').toEqual([]);
  });
});

describe('答え漏れ: 読みそのものを答えにする問題が無い', () => {
  it('N5/N4の読解・聴解の設問は「読み方」を問うていない', () => {
    const asksReading = /読み方|よみかた|なんと読|何と読|読みます/;
    const bad: string[] = [];
    for (const s of ALL_READING_SETS) {
      if (s.sourceLevel !== 'N5' && s.sourceLevel !== 'N4') continue;
      if (asksReading.test(s.questionJa)) bad.push(`${s.setId}: ${s.questionJa}`);
    }
    for (const s of ALL_LISTENING_SETS) {
      if (s.sourceLevel !== 'N5' && s.sourceLevel !== 'N4') continue;
      if (asksReading.test(s.questionJa)) bad.push(`${s.setId}: ${s.questionJa}`);
    }
    expect(bad, 'ふりがなが答えになってしまう設問がある').toEqual([]);
  });
});
