// @vitest-environment jsdom
// 行き止まりと離脱（2026-08-18 監査P1）。守りたいのは4つ。
//
// ① 聴解: 端末で音声が鳴らないと選択肢が永久にdisabled、戻る口も無い＝完全な行き止まりだった。
//    いまは「答えられる／この問題を飛ばせる／やめて戻れる」の3つが必ずある。
// ② 「結果を見る」を押したら結果が出る（押した瞬間に画面が消える＝バグに見える、を作らない）。
// ③ バトル・読解・聴解に実行中の離脱口があり、**そこまで解いたぶんは記録される**。
// ④ 途中でやめた回は「解いたぶんだけ」の記録。やっていない残りを誤答にも完了にもしない。
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { AdvListeningRunner } from './AdvListeningRunner';
import { AdvReadingRunner } from './AdvReadingRunner';
import { AdvBattleRunner } from './AdvBattleRunner';
import type { ListeningSet } from '../../../lib/aiLesson/course/adventure/listening/listeningTypes';
import type { ReadingSet } from '../../../lib/aiLesson/course/adventure/reading/readingTypes';
import type { AdvBattleQuestion } from '../../../lib/aiLesson/course/adventure/advVariants';

const lset = (i: number, playLimit: 1 | 2 = 2): ListeningSet => ({
  setId: `ls${i}`,
  sourceLevel: 'N3',
  listeningType: 'taskComprehension',
  audioAsset: `/audio/ls${i}.m4a`,
  transcriptJa: `原稿${i}`,
  situationJa: `場面${i}`,
  situationZh: `场景${i}`,
  questionJa: `聴解設問${i}`,
  questionZh: `听力问题${i}`,
  choices: [
    { choiceId: `l${i}-ok`, textJa: `聴解の正解${i}`, isCorrect: true },
    { choiceId: `l${i}-x1`, textJa: `聴解の誤答A${i}`, isCorrect: false, whyWrongJa: 'ちがう' },
    { choiceId: `l${i}-x2`, textJa: `聴解の誤答B${i}`, isCorrect: false, whyWrongJa: 'ちがう' },
    { choiceId: `l${i}-x3`, textJa: `聴解の誤答C${i}`, isCorrect: false, whyWrongJa: 'ちがう' },
  ],
  explanationJa: '解説',
  explanationZh: '解说',
  difficulty: 2,
  durationSeconds: 30,
  playLimit,
  reviewState: 'authored',
  sourceId: `src-ls${i}`,
});

const rset = (i: number): ReadingSet => ({
  setId: `rs${i}`,
  sourceLevel: 'N3',
  readingType: 'shortPassage',
  passageJa: `本文${i}です。`,
  contextZh: `场景${i}`,
  questionJa: `読解設問${i}`,
  questionZh: `阅读问题${i}`,
  choices: [
    { choiceId: `r${i}-ok`, textJa: `読解の正解${i}`, isCorrect: true },
    { choiceId: `r${i}-x1`, textJa: `読解の誤答A${i}`, isCorrect: false, whyWrongJa: 'ちがう' },
    { choiceId: `r${i}-x2`, textJa: `読解の誤答B${i}`, isCorrect: false, whyWrongJa: 'ちがう' },
    { choiceId: `r${i}-x3`, textJa: `読解の誤答C${i}`, isCorrect: false, whyWrongJa: 'ちがう' },
  ],
  rationaleSpan: `本文${i}です。`,
  explanationJa: '解説',
  explanationZh: '解说',
  difficulty: 2,
  estimatedSeconds: 60,
  reviewState: 'authored',
  variantId: `rs${i}-v`,
});

const bq = (i: number, type: string): AdvBattleQuestion => ({
  key: `t:q${i}`,
  type,
  level: 'n3',
  skill: 'grammar',
  examSection: 'languageKnowledge',
  targetJapanese: `対象${i}`,
  questionJa: `設問${i}`,
  questionZh: `问题${i}`,
  choices: [
    { choiceId: `q${i}-ok`, textJa: 'バトルの正解', isCorrect: true },
    { choiceId: `q${i}-x1`, textJa: 'バトルのちがう一', isCorrect: false },
    { choiceId: `q${i}-x2`, textJa: 'バトルのちがう二', isCorrect: false },
    { choiceId: `q${i}-x3`, textJa: 'バトルのちがう三', isCorrect: false },
  ],
  explanation: {
    meaningJa: '意味', meaningZh: '意思',
    whyCorrectJa: '正解の理由', whyCorrectZh: '正确的理由',
    exampleJa: null, exampleZh: null,
    sourceItemId: `src-${i}`, sourceLabel: `出典${i}`,
  },
  sourceItemId: `src-${i}`,
  difficulty: 2,
  timed: false,
  variantId: `q${i}-v`,
  reviewState: 'authored',
  status: 'authored',
});

const click = (name: RegExp) => fireEvent.click(screen.getByRole('button', { name }));

afterEach(cleanup);

// ── ① 聴解の行き止まり ──
describe('聴解: 音声が鳴らない端末でも詰まらない', () => {
  let playMock: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    // jsdom は HTMLMediaElement.play を実装していないので、端末側の挙動をここで作る
    playMock = vi.spyOn(HTMLMediaElement.prototype, 'play');
  });
  afterEach(() => { playMock.mockRestore(); });

  it('再生に失敗したら、選択肢が押せるようになり「この問題を飛ばす」も出る', async () => {
    playMock.mockRejectedValue(new Error('no audio'));
    render(<AdvListeningRunner lang="ja" sets={[lset(1), lset(2)]} onFinish={vi.fn()} onClose={vi.fn()} />);

    // 再生前は聞いてから答えてもらう（ここは従来どおり）
    expect(screen.getByRole('button', { name: /聴解の正解1/ }).hasAttribute('disabled')).toBe(true);

    click(/音声を再生する/);
    await waitFor(() => expect(screen.getByText(/音声を再生できませんでした/)).toBeTruthy());

    // 失敗したら答えられる（永久disabledの行き止まりにしない）
    expect(screen.getByRole('button', { name: /聴解の正解1/ }).hasAttribute('disabled')).toBe(false);
    // 聞けなかった問題は飛ばせる（誤答にしない）
    expect(screen.getByRole('button', { name: /この問題を飛ばす/ })).toBeTruthy();
  });

  it('全問を飛ばしたら、理由つきで呼び出し側へ返す（記録は作らない）', async () => {
    playMock.mockRejectedValue(new Error('no audio'));
    const onFinish = vi.fn();
    const onClose = vi.fn();
    render(<AdvListeningRunner lang="ja" sets={[lset(1), lset(2)]} onFinish={onFinish} onClose={onClose} />);

    click(/音声を再生する/);
    await waitFor(() => expect(screen.getByText(/音声を再生できませんでした/)).toBeTruthy());
    click(/この問題を飛ばす/);

    // 2問目へ進んでいる
    expect(screen.getByText('2/2')).toBeTruthy();
    click(/音声を再生する/);
    await waitFor(() => expect(screen.getByText(/音声を再生できませんでした/)).toBeTruthy());
    click(/この問題を飛ばす/);

    // 1問も解けていないので記録は作らない。理由を渡して呼び出し側が出口を出す
    expect(onFinish).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledWith('audio-unavailable');
  });

  it('画面から出る口が必ずある（上部ナビを探させない）', () => {
    playMock.mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<AdvListeningRunner lang="ja" sets={[lset(1)]} onFinish={vi.fn()} onClose={onClose} />);
    click(/やめて冒険にもどる/);
    expect(onClose).toHaveBeenCalled();
  });

  it('途中でやめると、答えた問題だけが記録される', async () => {
    playMock.mockResolvedValue(undefined);
    const onFinish = vi.fn();
    render(<AdvListeningRunner lang="ja" sets={[lset(1), lset(2)]} onFinish={onFinish} onClose={vi.fn()} />);
    click(/音声を再生する/);
    await waitFor(() => expect(screen.getByRole('button', { name: /聴解の正解1/ }).hasAttribute('disabled')).toBe(false));
    click(/聴解の正解1/);
    click(/ここでやめる/);

    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0][0]).toMatchObject({
      correct: 1, total: 1, keys: ['listen:ls1'], wrongKeys: [], partial: true,
    });
    expect(screen.getByText('聴解の結果')).toBeTruthy();
  });

  it('一度鳴ったあとにエラーが出ても、答えられる状態から後退しない', async () => {
    playMock.mockResolvedValue(undefined);
    const { container } = render(
      <AdvListeningRunner lang="ja" sets={[lset(1, 2)]} onFinish={vi.fn()} onClose={vi.fn()} />,
    );
    click(/音声を再生する/);
    await waitFor(() => expect(screen.getByRole('button', { name: /聴解の正解1/ }).hasAttribute('disabled')).toBe(false));

    // 再生後にメディアエラー → 「もう一度試す」を押しても再生回数は戻らない（＝答えられるまま）
    const audio = container.querySelector('audio');
    expect(audio).toBeTruthy();
    fireEvent.error(audio!);
    click(/もう一度試す/);
    expect(screen.getByRole('button', { name: /聴解の正解1/ }).hasAttribute('disabled')).toBe(false);
  });
});

// ── ②③④ 読解 ──
describe('読解: 結果が出る・途中でやめても解いたぶんは残る', () => {
  it('「結果を見る」で結果画面が出る（記録してから、本人の操作で閉じる）', () => {
    const onFinish = vi.fn();
    const onClose = vi.fn();
    render(<AdvReadingRunner lang="ja" sets={[rset(1), rset(2), rset(3)]} onFinish={onFinish} onClose={onClose} />);

    click(/読解の正解1/); click(/つぎの問題/);
    click(/読解の正解2/); click(/つぎの問題/);
    click(/読解の正解3/); click(/結果を見る/);

    // 結果を見せずにホームへ飛ばさない
    expect(screen.getByText('読解の結果')).toBeTruthy();
    expect(screen.getByText(/正解 3\/3問/)).toBeTruthy();
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0][0]).toMatchObject({ correct: 3, total: 3, partial: false });
    expect(onClose).not.toHaveBeenCalled();

    click(/冒険にもどる/);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('途中でやめると、解いた問題だけが記録される（残りは誤答にしない）', () => {
    const onFinish = vi.fn();
    render(<AdvReadingRunner lang="ja" sets={[rset(1), rset(2), rset(3)]} onFinish={onFinish} onClose={vi.fn()} />);

    click(/読解の正解1/); click(/つぎの問題/);
    click(/読解の誤答A2/);          // 2問目は誤答のまま、まだ「つぎの問題」は押さない
    click(/ここでやめる/);

    expect(onFinish).toHaveBeenCalledTimes(1);
    const r = onFinish.mock.calls[0][0] as {
      correct: number; total: number; keys: string[]; wrongKeys: string[]; partial: boolean;
    };
    expect(r.partial).toBe(true);
    expect(r.total).toBe(2);
    expect(r.correct).toBe(1);
    expect(r.keys).toEqual(['read:rs1', 'read:rs2']);
    expect(r.wrongKeys).toEqual(['read:rs2']);       // 解いていない3問目は入らない
  });

  it('1問も解いていなければ記録を作らずに閉じる', () => {
    const onFinish = vi.fn();
    const onClose = vi.fn();
    render(<AdvReadingRunner lang="ja" sets={[rset(1)]} onFinish={onFinish} onClose={onClose} />);
    click(/やめて冒険にもどる/);
    expect(onFinish).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('出題が0件のときは理由つきで返す（呼び出し側が飛ばす出口を出せる）', () => {
    const onClose = vi.fn();
    render(<AdvReadingRunner lang="ja" sets={[]} onFinish={vi.fn()} onClose={onClose} />);
    click(/もどる/);
    expect(onClose).toHaveBeenCalledWith('no-questions');
  });
});

// ── ③④ バトル ──
describe('バトル: 途中でやめても解いたぶんが残る', () => {
  const pool = () => new Map<string, AdvBattleQuestion[]>([
    ['t1', Array.from({ length: 8 }, (_, i) => bq(i, i % 2 === 0 ? 'rec' : 'use'))],
  ]);

  it('2問解いてやめると、その2問だけが記録され、攻略には数えない', () => {
    const onFinish = vi.fn();
    render(
      <AdvBattleRunner
        lang="ja" tier="normal" targetId="t1" targetLabel="対象" targetIds={['t1']}
        pool={pool()} seenKeys={new Set()} recentWrongKeys={new Set()} priorAttempts={[]}
        dateKey="2026-08-18" nowISO="2026-08-18T10:00:00.000Z" level="N3"
        onFinish={onFinish} onClose={vi.fn()} />,
    );
    click(/^バトルの正解$/); click(/つぎの問題/);
    click(/^バトルの正解$/);            // 2問目は選んだだけ（まだ「つぎの問題」は押していない）
    click(/ここでやめる/);

    expect(screen.getByText('ここまでを記録しました')).toBeTruthy();
    expect(onFinish).toHaveBeenCalledTimes(1);
    const attempt = onFinish.mock.calls[0][0] as {
      partial?: boolean; questionKeys: string[]; wrongKeys?: string[]; scorePct: number;
    };
    expect(attempt.partial).toBe(true);
    expect(attempt.questionKeys.length).toBe(2);      // 出題されていない残りは載らない
    expect(attempt.wrongKeys).toEqual([]);            // 未提示の問題を誤答にしない
    expect(attempt.scorePct).toBe(100);
  });

  it('1問も解いていなければ記録を作らずに閉じる', () => {
    const onFinish = vi.fn();
    const onClose = vi.fn();
    render(
      <AdvBattleRunner
        lang="ja" tier="normal" targetId="t1" targetLabel="対象" targetIds={['t1']}
        pool={pool()} seenKeys={new Set()} recentWrongKeys={new Set()} priorAttempts={[]}
        dateKey="2026-08-18" nowISO="2026-08-18T10:00:00.000Z" level="N3"
        onFinish={onFinish} onClose={onClose} />,
    );
    click(/やめて冒険にもどる/);
    expect(onFinish).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('出題が0件のときは理由つきで返す（押す→戻る→また同じCTAの無限ループにしない）', () => {
    const onClose = vi.fn();
    render(
      <AdvBattleRunner
        lang="ja" tier="normal" targetId="t1" targetLabel="対象" targetIds={['t1']}
        pool={new Map()} seenKeys={new Set()} recentWrongKeys={new Set()} priorAttempts={[]}
        dateKey="2026-08-18" nowISO="2026-08-18T10:00:00.000Z" level="N3"
        onFinish={vi.fn()} onClose={onClose} />,
    );
    click(/もどる/);
    expect(onClose).toHaveBeenCalledWith('no-questions');
  });
});
