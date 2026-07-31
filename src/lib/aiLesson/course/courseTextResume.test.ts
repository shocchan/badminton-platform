import { describe, it, expect } from 'vitest';
import { segmentWithReadings, deriveAskedQuestions, buildResumeFromUtterances } from './courseTextResume';

describe('readingAids の安全なruby分割', () => {
  it('該当語だけをreading付きセグメントにする', () => {
    const segs = segmentWithReadings('印象に残った経験を話しましょう', [
      { text: '印象', reading: 'いんしょう' },
      { text: '経験', reading: 'けいけん' },
    ]);
    expect(segs).toEqual([
      { text: '印象', reading: 'いんしょう' },
      { text: 'に残った' },
      { text: '経験', reading: 'けいけん' },
      { text: 'を話しましょう' },
    ]);
  });

  it('同じ語には最初の1回だけ付ける', () => {
    const segs = segmentWithReadings('経験と経験', [{ text: '経験', reading: 'けいけん' }]);
    expect(segs.filter((s) => s.reading).length).toBe(1);
  });

  it('本文に無い語・空のaidsは無視（プレーン1セグメント）', () => {
    expect(segmentWithReadings('こんにちは', [{ text: '印象', reading: 'いんしょう' }]))
      .toEqual([{ text: 'こんにちは' }]);
    expect(segmentWithReadings('こんにちは', [])).toEqual([{ text: 'こんにちは' }]);
  });

  it('HTMLらしき文字列もテキストとして扱う（注入対策の前提）', () => {
    const segs = segmentWithReadings('<b>印象</b>', [{ text: '印象', reading: 'いんしょう' }]);
    // タグはただの文字列として周辺セグメントに残る（エスケープはReactの描画に任せる）
    expect(segs.map((s) => s.text).join('')).toBe('<b>印象</b>');
  });
});

describe('出題済み質問の復元', () => {
  it('先生の発話から？で終わる末尾文を質問として抽出', () => {
    const asked = deriveAskedQuestions([
      '会社のことですね。それはいつのことですか？',
      'なるほど。相手はどんな反応でしたか？',
      'ありがとうございます。今日はここまでにしましょう。', // 質問なし
    ]);
    expect(asked).toEqual(['それはいつのことですか？', '相手はどんな反応でしたか？']);
  });

  it('最大10件に制限', () => {
    const texts = Array.from({ length: 15 }, (_, i) => `質問その${i}ですか？`);
    expect(deriveAskedQuestions(texts).length).toBe(10);
  });
});

describe('保存済み発話からの端末間復元', () => {
  const utt = (speaker: string, transcript: string) => ({ speaker, transcript });

  it('msgs・ターン数・出題済み質問を復元する', () => {
    const r = buildResumeFromUtterances([
      utt('tutor', '今日のテーマは「理由の説明」です。最近どうですか？'),
      utt('student', '昨日、会社でミスをしました'),
      utt('tutor', '大変でしたね。それはいつのことですか？'),
      utt('student', '先週の金曜日です'),
      utt('system', 'connected'),           // system発話は除外
      utt('tutor', ''),                      // 空発話は除外
    ], 8);
    expect(r.msgs.length).toBe(4);
    expect(r.chatState.studentTurns).toBe(2);
    expect(r.chatState.asked).toContain('それはいつのことですか？');
    expect(r.chatState.closingAnnounced).toBe(false);
    expect(r.chatState.done).toBe(false);
  });

  it('最大ターン付近では closing/done を正しく再判定（8ターン保証を維持）', () => {
    const seven = Array.from({ length: 7 }, (_, i) => [
      utt('tutor', `質問${i}？`), utt('student', `答え${i}`),
    ]).flat();
    expect(buildResumeFromUtterances(seven, 8).chatState.closingAnnounced).toBe(true);
    const eight = [...seven, utt('tutor', '最後？'), utt('student', '最後の答え')];
    expect(buildResumeFromUtterances(eight, 8).chatState.done).toBe(true);
  });

  it('空の履歴でも安全（新規と同じ初期状態）', () => {
    const r = buildResumeFromUtterances([], 8);
    expect(r.msgs).toEqual([]);
    expect(r.chatState.studentTurns).toBe(0);
    expect(r.chatState.done).toBe(false);
  });
});
