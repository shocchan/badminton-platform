// @vitest-environment jsdom
// おかえりカードが守ること。
// ここは見た目の話ではなく、**言ってはいけないことを言わない**ための固定。
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { AdvDailyCheckin } from './AdvDailyCheckin';
import type { ComponentProps } from 'react';
import { PROVERBS } from '../../../lib/aiLesson/course/adventure/advProverbs';

afterEach(cleanup);

const visit = (days: string[]) => ({ days, lastCardKey: null });
const noop = () => {};
const P = PROVERBS[0];

const renderCard = (
  days: string[], lang: 'ja' | 'zh' = 'ja', todayKey = '2026-09-07',
  extra: Partial<ComponentProps<typeof AdvDailyCheckin>> = {},
) =>
  render(
    <AdvDailyCheckin
      lang={lang} visit={visit(days)} todayKey={todayKey}
      proverb={P} collected={3} learned={1} isLearned={false} onToggleLearned={noop}
      onStart={noop} onClose={noop} {...extra}
    />,
  );

describe('迎え方', () => {
  it('久しぶりの人には日数を出し、今日の分量を小さくする', () => {
    renderCard(['2026-08-24', '2026-09-07']);
    expect(screen.getByText(/14日ぶり/)).toBeTruthy();
    expect(screen.getByText(/3分だけ/)).toBeTruthy();
  });

  it('初めての人に「◯日ぶり」と言わない', () => {
    renderCard(['2026-09-07']);
    expect(screen.queryByText(/日ぶり/)).toBeNull();
  });

  it('責める言葉をどこにも出さない（サボった・切れた・失った）', () => {
    for (const days of [['2026-08-24', '2026-09-07'], ['2026-09-06', '2026-09-07'], ['2026-09-07']]) {
      cleanup();
      const { container } = renderCard(days);
      const text = container.textContent ?? '';
      for (const ng of ['サボ', '切れ', '失', 'できていません', 'だめ']) {
        expect(text.includes(ng), `${ng} が出ている`).toBe(false);
      }
    }
  });
});

describe('スタンプ台紙', () => {
  it('「来た日」であって「勉強した日」とは書かない', () => {
    const { container } = renderCard(['2026-09-05', '2026-09-07']);
    expect(screen.getAllByText(/来た日/).length).toBeGreaterThan(0);
    expect((container.textContent ?? '').includes('勉強した日')).toBe(false);
  });

  it('中国語では中国語の見出しになる', () => {
    renderCard(['2026-09-07'], 'zh');
    expect(screen.getByText(/来过的日子/)).toBeTruthy();
  });
});

describe('今日のことば', () => {
  it('渡されたことばの本文・よみ・例文がそろって出る', () => {
    renderCard(['2026-09-07']);
    expect(screen.getByText(P.ja)).toBeTruthy();
    expect(screen.getByText(P.yomi)).toBeTruthy();
    expect(screen.getByText(P.exampleJa)).toBeTruthy();
  });

  it('中国語で開くと中国語の意味が出る', () => {
    renderCard(['2026-09-07'], 'zh');
    expect(screen.getByText(P.meaningZh)).toBeTruthy();
  });

  it('集めた数の分母が実在の件数と一致する（数字を作らない）', () => {
    renderCard(['2026-09-07']);
    expect(screen.getByText(new RegExp(`/ ${PROVERBS.length}`))).toBeTruthy();
  });
});

describe('ことば集め（第2版）', () => {
  it('「おぼえた」を押すと親に伝わる', () => {
    let got: boolean | null = null;
    renderCard(['2026-09-07'], 'ja', '2026-09-07', { onToggleLearned: (v) => { got = v; } });
    fireEvent.click(screen.getByText('おぼえた'));
    expect(got).toBe(true);
  });

  it('おぼえた状態では「あとでもう一度出ます」と伝える（何が起きるか書く）', () => {
    renderCard(['2026-09-07'], 'ja', '2026-09-07', { isLearned: true });
    expect(screen.getByText(/あとでもう一度出ます/)).toBeTruthy();
  });

  it('節目に達した日だけ祝う', () => {
    const { container } = renderCard(['2026-09-07']);
    expect((container.textContent ?? '').includes('集めました')).toBe(false);
    cleanup();
    renderCard(['2026-09-07'], 'ja', '2026-09-07', { milestone: 10 });
    expect(screen.getByText(/ことばを10個 集めました/)).toBeTruthy();
  });

  it('前におぼえたことばは、意味を隠して出す（押すまで答えを見せない）', () => {
    const recall = PROVERBS[1];
    renderCard(['2026-09-07'], 'ja', '2026-09-07', { recall });
    expect(screen.getByText(recall.ja)).toBeTruthy();
    expect(screen.queryByText(recall.meaningJa)).toBeNull();
    fireEvent.click(screen.getByText('答えを見る'));
    expect(screen.getByText(recall.meaningJa)).toBeTruthy();
  });

  it('「おぼえた」が測定結果だと誤解させる書き方をしない', () => {
    const { container } = renderCard(['2026-09-07'], 'ja', '2026-09-07', { learned: 5 });
    const text = container.textContent ?? '';
    for (const ng of ['習得済み', 'マスター', '定着率', '正解率']) {
      expect(text.includes(ng), `${ng} が出ている`).toBe(false);
    }
  });
});

describe('行き止まりにしない', () => {
  it('「今日の冒険へ」と「今日はここまで」の両方がある', () => {
    let started = 0; let closed = 0;
    render(
      <AdvDailyCheckin
        lang="ja" visit={visit(['2026-09-07'])} todayKey="2026-09-07"
        proverb={P} collected={1} learned={0} isLearned={false} onToggleLearned={noop}
        onStart={() => { started += 1; }} onClose={() => { closed += 1; }}
      />,
    );
    fireEvent.click(screen.getByText('今日の冒険へ'));
    fireEvent.click(screen.getByText('今日はここまでにする'));
    expect([started, closed]).toEqual([1, 1]);
  });
});
