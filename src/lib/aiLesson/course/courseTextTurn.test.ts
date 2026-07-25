import { describe, it, expect } from 'vitest';
import {
  initialTextTurnState, nextTextTurn, wantsToEnd, isUnclear, buildReflection,
  TEXT_MAX_TURNS_DEFAULT,
} from './courseTextTurn';
import type { TextTurnState } from './courseTextTurn';
import type { Mission } from './types';

// テスト用ミッション（実データに依存しない最小形）
const mission = {
  id: 'w01m1', week: 1, order: 1, category: 'experience',
  titleJa: '職場で理由を説明する', titleZh: '在职场说明理由',
  targetExpression: '〜ので', detect: 'ので',
  meaningZh: '因为〜', simpleExample: '電車が遅れたので、遅刻しました',
  openingQuestion: '最近、理由を説明したことはありますか？',
  followUpQuestions: ['それはいつのことですか？', '相手はどんな反応でしたか？', 'その時、どう思いましたか？'],
  hintLevels: ['「〜ので」を使ってみましょう'],
  alternateScenes: ['友達との約束'],
  estimatedMinutes: 3,
} as unknown as Mission;

const send = (state: TextTurnState, text: string) => nextTextTurn(state, text, mission);

/** 返答内の質問数（？/?の数）。エンジンは常に1以下を保証する */
const questionCount = (s: string) => (s.match(/[？?]/g) ?? []).length;

describe('テキスト会話エンジン: 基本保証', () => {
  it('1応答につき質問は1つ以下（ケース網羅）', () => {
    let st = initialTextTurnState();
    const inputs = ['昨日、会社でミスをしました', '上司に説明しました', 'とても緊張しました', '電車が遅れたので、遅刻しました'];
    for (const inp of inputs) {
      const r = send(st, inp);
      expect(questionCount(r.text), `入力「${inp}」の返答: ${r.text}`).toBeLessThanOrEqual(1);
      st = r.state;
    }
  });

  it('同じfollowUp質問を繰り返さない', () => {
    let st = initialTextTurnState(20); // ターン上限を広げてネタ切れ動作を見る
    const asked: string[] = [];
    for (let i = 0; i < 5; i++) {
      const r = send(st, `昨日、仕事でいろいろありました（${i}回目）`);
      st = r.state;
      asked.push(r.text);
    }
    // followUpQuestions は3つ。3回で使い切り、4回目以降は closing 誘導になり同一質問は再出題されない
    for (const q of mission.followUpQuestions) {
      const times = asked.filter((a) => a.includes(q)).length;
      expect(times, `「${q}」の出題回数`).toBeLessThanOrEqual(1);
    }
  });

  it('ケースA: 発言内容（会社・ミス）に反応してから質問する', () => {
    const r = send(initialTextTurnState(), '昨日、会社でミスをしました');
    expect(r.text).toContain('会社'); // トピックを拾う
    expect(r.text).toMatch(/大変でしたね/); // 感情を拾う
    expect(questionCount(r.text)).toBe(1);
  });

  it('ケースC: 目標表現ヒット → 褒めて別場面へ1回だけ誘導', () => {
    const r = send(initialTextTurnState(), '電車が遅れたので、遅刻しました');
    expect(r.targetHit).toBe(true);
    expect(r.text).toContain('いいですね');
    expect(r.text).toContain('友達との約束');
    // 2回目のヒットは closing へ寄せる
    const r2 = send(r.state, '雨が降ったので、家にいました');
    expect(r2.state.phase).toBe('closingAnnounced');
  });

  it('ケースD: 短い相づち「はい」→ 同じ質問を繰り返さず具体例を提示', () => {
    const r = send(initialTextTurnState(), 'はい');
    expect(r.text).toContain(mission.simpleExample);
    expect(r.state.unclearStreak).toBe(1);
  });

  it('ケースH: 理解不能が2回連続 → まとめの選択肢を提示（無限ループしない）', () => {
    const r1 = send(initialTextTurnState(), 'はい');
    const r2 = send(r1.state, 'うん');
    expect(r2.offerSummary).toBe(true);
    expect(r2.text).toContain('まとめる');
  });

  it('ケースF: 終了希望 → 新しい質問を出さずまとめへ', () => {
    const r = send(initialTextTurnState(), 'もう終わりたいです');
    expect(r.state.phase).toBe('done');
    expect(r.offerSummary).toBe(true);
    expect(questionCount(r.text)).toBe(0);
  });

  it('ケースG: 最大ターンで必ず終了する（無限会話なし）', () => {
    let st = initialTextTurnState(); // maxTurns=8
    let last = send(st, '最初の話です。仕事のことです');
    st = last.state;
    for (let i = 2; i <= TEXT_MAX_TURNS_DEFAULT + 2; i++) {
      last = send(st, `${i}回目の話です。今日はいろいろありました`);
      st = last.state;
      if (st.phase === 'done') break;
    }
    expect(st.phase).toBe('done');
    expect(st.turn).toBeLessThanOrEqual(TEXT_MAX_TURNS_DEFAULT);
    expect(last.offerSummary).toBe(true);
    expect(questionCount(last.text)).toBe(0); // 終了宣言後に質問なし
  });

  it('closing宣言（あと1つ）→ 次の返答で終了・新規質問なし', () => {
    const st: TextTurnState = { ...initialTextTurnState(), turn: 6 }; // 次で7=maxTurns-1
    const announce = send(st, '今日は上司と話しました');
    expect(announce.state.phase).toBe('closingAnnounced');
    expect(announce.text).toContain('あと1つ');
    const final = send(announce.state, '楽しかったです');
    expect(final.state.phase).toBe('done');
    expect(final.offerSummary).toBe(true);
    expect(questionCount(final.text)).toBe(0);
  });

  it('done後の保険応答は会話を再開しない', () => {
    const done: TextTurnState = { ...initialTextTurnState(), phase: 'done', turn: 8 };
    const r = send(done, 'まだ話したいです');
    expect(r.offerSummary).toBe(true);
    expect(questionCount(r.text)).toBe(0);
  });
});

describe('テキスト会話エンジン: 検知ヘルパー', () => {
  it('wantsToEnd: ja/zh の終了希望を検知', () => {
    expect(wantsToEnd('もう終わりたいです')).toBe(true);
    expect(wantsToEnd('今日は終了します')).toBe(true);
    expect(wantsToEnd('不想说了')).toBe(true);
    expect(wantsToEnd('想结束')).toBe(true);
    // 一般文を誤検知しない（終了の意思表明パターンに限定）
    expect(wantsToEnd('仕事が終わってから勉強します')).toBe(false);
    expect(wantsToEnd('映画は終わりました')).toBe(false);
    expect(wantsToEnd('昨日は楽しかったです')).toBe(false);
  });

  it('isUnclear: 相づち・極短文を検知', () => {
    expect(isUnclear('はい')).toBe(true);
    expect(isUnclear('うん')).toBe(true);
    expect(isUnclear('嗯')).toBe(true);
    expect(isUnclear('昨日、会社に行きました')).toBe(false);
  });

  it('buildReflection: 感情＋トピックを拾う／拾えなければ相づち', () => {
    expect(buildReflection('上司との会話が難しいです')).toContain('上司');
    expect(buildReflection('上司との会話が難しいです')).toContain('大変');
    expect(buildReflection('試験に合格できました')).toContain('良かった');
    expect(buildReflection('あれをそれしました')).toBe('なるほど。');
  });
});
