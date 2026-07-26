import { describe, it, expect } from 'vitest';
import {
  initialChatConvState, willBeClosing, applyChatTurn, composeTutorText, toGuidedState,
} from './courseChatTurn';

const turn = (over: Partial<Parameters<typeof composeTutorText>[0]> = {}) => ({
  reaction: '上司に説明しようとしたけれど、緊張したんですね。',
  correction: null as string | null,
  question: 'どの部分がいちばん難しかったですか？' as string | null,
  shouldClose: false,
  closingMessage: null as string | null,
  ...over,
});

describe('LLM会話状態機械（クライアント側ガード）', () => {
  it('willBeClosing: 次の送信が最終ターンなら true（8ターン制の二重ガード）', () => {
    const s = initialChatConvState(8);
    expect(willBeClosing(s)).toBe(false);
    expect(willBeClosing({ ...s, studentTurns: 6 })).toBe(false);
    expect(willBeClosing({ ...s, studentTurns: 7 })).toBe(true);  // 8ターン目=最終
    expect(willBeClosing({ ...s, closingAnnounced: true })).toBe(true);
  });

  it('applyChatTurn: ターン加算・出題質問の記録・closing/doneの遷移', () => {
    let s = initialChatConvState(8);
    const r1 = applyChatTurn(s, turn());
    expect(r1.studentTurns).toBe(1);
    expect(r1.asked).toEqual(['どの部分がいちばん難しかったですか？']);
    expect(r1.done).toBe(false);
    s = { ...r1, studentTurns: 6 };
    const r2 = applyChatTurn(s, turn({ question: '最後の質問です か？' }));
    expect(r2.closingAnnounced).toBe(true); // 7ターン目=maxTurns-1 で終盤フラグ
    const r3 = applyChatTurn(r2, turn({ question: null, shouldClose: true, closingMessage: 'まとめましょう。' }));
    expect(r3.done).toBe(true);
  });

  it('askedは直近10件のみ保持（トークン肥大防止）', () => {
    let s = initialChatConvState(20);
    for (let i = 0; i < 12; i++) s = applyChatTurn(s, turn({ question: `質問${i}？` }));
    expect(s.asked.length).toBe(10);
    expect(s.asked[0]).toBe('質問2？');
  });

  it('composeTutorText: 反応→訂正→質問の順に1つの吹き出しへ', () => {
    expect(composeTutorText(turn())).toBe('上司に説明しようとしたけれど、緊張したんですね。\nどの部分がいちばん難しかったですか？');
    expect(composeTutorText(turn({ correction: '「説明しました」の方が自然です。' })))
      .toContain('✏️ 「説明しました」の方が自然です。');
  });

  it('composeTutorText: shouldClose時は質問を出さずclosingMessageを出す', () => {
    const text = composeTutorText(turn({
      shouldClose: true, closingMessage: 'これで今日の会話をまとめましょう。',
      question: 'この質問は出てはいけない？',
    }));
    expect(text).toContain('まとめましょう');
    expect(text).not.toContain('出てはいけない');
  });

  it('toGuidedState: フォールバック時にターン数と段階を引き継ぐ（8ターン保証を維持）', () => {
    const s = { ...initialChatConvState(8), studentTurns: 5 };
    const g = toGuidedState(s);
    expect(g.turn).toBe(5);
    expect(g.maxTurns).toBe(8);
    expect(g.phase).toBe('talking');
    expect(toGuidedState({ ...s, closingAnnounced: true }).phase).toBe('closingAnnounced');
    expect(toGuidedState({ ...s, done: true }).phase).toBe('done');
  });
});
