// @vitest-environment jsdom
// おかえりカードが守ること。
// ここは見た目の話ではなく、**言ってはいけないことを言わない**ための固定。
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { AdvDailyCheckin } from './AdvDailyCheckin';
import { PROVERBS } from '../../../lib/aiLesson/course/adventure/advProverbs';
import { todayProverb } from '../../../lib/aiLesson/course/adventure/advDailyGift';

afterEach(cleanup);

const visit = (days: string[]) => ({ days, lastCardKey: null });
const noop = () => {};

const renderCard = (days: string[], lang: 'ja' | 'zh' = 'ja', todayKey = '2026-09-07') =>
  render(
    <AdvDailyCheckin
      lang={lang} visit={visit(days)} todayKey={todayKey} seed="learner-1"
      onStart={noop} onClose={noop}
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
  it('その日のことばの本文・よみ・例文がそろって出る', () => {
    const p = todayProverb('2026-09-07', 'learner-1');
    renderCard(['2026-09-07']);
    expect(screen.getByText(p.ja)).toBeTruthy();
    expect(screen.getByText(p.yomi)).toBeTruthy();
    expect(screen.getByText(p.exampleJa)).toBeTruthy();
  });

  it('中国語で開くと中国語の意味が出る', () => {
    const p = todayProverb('2026-09-07', 'learner-1');
    renderCard(['2026-09-07'], 'zh');
    expect(screen.getByText(p.meaningZh)).toBeTruthy();
  });

  it('件数の表示が実在の件数と一致する（数字を作らない）', () => {
    renderCard(['2026-09-07']);
    expect(screen.getByText(new RegExp(`/ ${PROVERBS.length}`))).toBeTruthy();
  });
});

describe('行き止まりにしない', () => {
  it('「今日の冒険へ」と「今日はここまで」の両方がある', () => {
    let started = 0; let closed = 0;
    render(
      <AdvDailyCheckin
        lang="ja" visit={visit(['2026-09-07'])} todayKey="2026-09-07"
        onStart={() => { started += 1; }} onClose={() => { closed += 1; }}
      />,
    );
    fireEvent.click(screen.getByText('今日の冒険へ'));
    fireEvent.click(screen.getByText('今日はここまでにする'));
    expect([started, closed]).toEqual([1, 1]);
  });
});
