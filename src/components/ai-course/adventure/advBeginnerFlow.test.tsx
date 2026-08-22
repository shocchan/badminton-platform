// @vitest-environment jsdom
// ひらがなしか読めない人（N5/N4目標）の入口の受入テスト（2026-08-22）。
//
// 直した2つの詰まり:
//  1. 目標にN5/N4を選んだ人にも、漢字だけの選択肢が並ぶ12問の診断が出ていた。
//     測れているのは実力ではなく「漢字が読めないこと」なので、診断を出さずに冒険へ通す。
//  2. 読解の**本文**にはふりがながあったが、**設問と選択肢**には無かった。
//     本文が読めても設問が読めなければ答えられない。聴解も同じ。
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { AdvOnboarding, type OnboardingOutcome } from './AdvOnboarding';
import { AdvReadingRunner } from './AdvReadingRunner';
import { AdvListeningRunner } from './AdvListeningRunner';
import type { DiagnosisPools } from '../../../lib/aiLesson/course/adventure/advDiagnosis';
import { readingSetsFor } from '../../../lib/aiLesson/course/adventure/reading/readingBank';
import { listeningSetsFor } from '../../../lib/aiLesson/course/adventure/listening/listeningBank';

const NOW = '2026-08-22T10:00:00.000Z';
/** 診断プールは空でよい（N3/N2で診断が出ることの確認は既存テストが持っている） */
const pools: DiagnosisPools = {
  foundationVocab: [], n3Vocab: [], n3Grammar: [], n2Grammar: [], basicGrammarN5: [], basicGrammarN4: [],
};

afterEach(cleanup);

/** 「つぎへ」相当のボタンを1つ押す（画面ごとに文言が違う） */
const advance = () => {
  const btn = screen.queryAllByRole('button')
    .find((b) => /^(つぎへ|未定のまま進む|決めていない)/.test(b.textContent ?? '') && !(b as HTMLButtonElement).disabled);
  if (!btn) return false;
  fireEvent.click(btn);
  return true;
};

/** 目的→目標→…→相棒 まで進める（相棒画面が出たら止まる） */
const walkToCompanion = (target: 'N5' | 'N4' | 'N3') => {
  const onComplete = vi.fn();
  render(<AdvOnboarding lang="ja" pools={pools} nowISO={NOW}
    onComplete={onComplete} onCancel={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'JLPTに合格したい' }));
  advance();
  fireEvent.click(within(screen.getByLabelText('目標レベル')).getByRole('button', { name: new RegExp(`^${target}`) }));
  for (let i = 0; i < 8 && !screen.queryByLabelText('旅の相棒'); i++) {
    if (!advance()) break;
  }
  expect(screen.queryByLabelText('旅の相棒'), '相棒画面まで進めなかった').toBeTruthy();
  return onComplete;
};

describe('N5/N4目標: 現在地診断（12問）を出さない', () => {
  for (const target of ['N5', 'N4'] as const) {
    it(`${target}を選ぶと、相棒のつぎが診断ではなく冒険の開始になる`, () => {
      walkToCompanion(target);
      expect(screen.queryByRole('button', { name: /つぎへ（現在地診断）/ })).toBeNull();
      expect(screen.getByRole('button', { name: /この内容で冒険を始める/ })).toBeTruthy();
      expect(screen.getByText(/現在地診断（12問）はありません/)).toBeTruthy();
    });
  }

  it('N3を選んだときは今までどおり診断へ進む', () => {
    walkToCompanion('N3');
    expect(screen.getByRole('button', { name: /つぎへ（現在地診断）/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /この内容で冒険を始める/ })).toBeNull();
  });

  it('診断なしで作ったルートは、現在地を断定せず基礎から始まる', () => {
    walkToCompanion('N5');
    fireEvent.click(screen.getByRole('button', { name: /この内容で冒険を始める/ }));
    // 測っていないことを言う。測ったふりをしない
    expect(screen.getByText(/現在地は測っていません/)).toBeTruthy();
    const route = screen.getByLabelText('攻略ルート');
    expect(route.textContent).toContain('未判定');
    expect(screen.getByRole('button', { name: /今日の冒険を始める/ })).toBeTruthy();
  });

  it('診断を出さなくても、始めるボタンで設定が完成した状態が親へ渡る', () => {
    const onComplete = walkToCompanion('N4');
    fireEvent.click(screen.getByRole('button', { name: /この内容で冒険を始める/ }));
    fireEvent.click(screen.getByRole('button', { name: /今日の冒険を始める/ }));
    expect(onComplete).toHaveBeenCalledTimes(1);
    const o = onComplete.mock.calls[0][0] as OnboardingOutcome;
    expect(o.targetJlpt).toBe('N4');
    expect(o.route.stages.length).toBeGreaterThan(0);
    // かな確認の入口条件（AdvShell が needs_assessment / pre_n5 で かなを出す）
    expect(o.diagnosis.knowledgeBand).toBe('needs_assessment');
    expect(o.diagnosis.askedQuestionKeys).toEqual([]);
  });
});

/** ルビ付きの要素から <rt> を除いた文字列（元の日本語に戻るはず） */
const textWithoutRuby = (el: Element): string => {
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll('rt').forEach((rt) => rt.remove());
  return clone.textContent ?? '';
};

describe('N5/N4: 設問と選択肢にふりがなが出る', () => {
  it('読解: 設問にも選択肢にもルビが出て、文字列は元のまま', () => {
    const set = readingSetsFor('N5').find((s) => /[一-鿿]/.test(s.questionJa))!;
    const { container } = render(
      <AdvReadingRunner lang="ja" sets={[set]} showRuby onFinish={vi.fn()} onClose={vi.fn()} />,
    );
    const question = Array.from(container.querySelectorAll('p[lang="ja"]'))
      .find((p) => textWithoutRuby(p) === set.questionJa)!;
    expect(question, '設問が見つからない').toBeTruthy();
    expect(question.querySelectorAll('rt').length).toBeGreaterThan(0);

    const buttons = Array.from(container.querySelectorAll('button'));
    for (const c of set.choices.filter((x) => /[一-鿿]/.test(x.textJa))) {
      const btn = buttons.find((b) => textWithoutRuby(b).trim() === c.textJa);
      expect(btn, `選択肢が見つからない: ${c.textJa}`).toBeTruthy();
      expect(btn!.querySelectorAll('rt').length, `選択肢にルビが無い: ${c.textJa}`).toBeGreaterThan(0);
    }
  });

  it('読解: N3以上（showRubyなし）では設問・選択肢ともルビ無し', () => {
    const set = readingSetsFor('N3')[0];
    const { container } = render(
      <AdvReadingRunner lang="ja" sets={[set]} onFinish={vi.fn()} onClose={vi.fn()} />,
    );
    expect(container.querySelectorAll('rt').length).toBe(0);
  });

  it('聴解: 場面説明・設問・選択肢にルビが出て、文字列は元のまま', () => {
    const set = listeningSetsFor('N5').find((s) => /[一-鿿]/.test(s.questionJa))!;
    const { container } = render(
      <AdvListeningRunner lang="ja" sets={[set]} showRuby onFinish={vi.fn()} onClose={vi.fn()} />,
    );
    const situation = Array.from(container.querySelectorAll('p'))
      .find((p) => textWithoutRuby(p) === set.situationJa);
    expect(situation?.querySelectorAll('rt').length ?? 0).toBeGreaterThan(0);
    const question = Array.from(container.querySelectorAll('p[lang="ja"]'))
      .find((p) => textWithoutRuby(p) === set.questionJa)!;
    expect(question.querySelectorAll('rt').length).toBeGreaterThan(0);
    for (const c of set.choices.filter((x) => /[一-鿿]/.test(x.textJa))) {
      const btn = Array.from(container.querySelectorAll('button'))
        .find((b) => textWithoutRuby(b).trim() === c.textJa);
      expect(btn, `選択肢が見つからない: ${c.textJa}`).toBeTruthy();
      expect(btn!.querySelectorAll('rt').length, `選択肢にルビが無い: ${c.textJa}`).toBeGreaterThan(0);
    }
  });

  it('聴解: N3以上（showRubyなし）ではルビ無し', () => {
    const set = listeningSetsFor('N3')[0];
    const { container } = render(
      <AdvListeningRunner lang="ja" sets={[set]} onFinish={vi.fn()} onClose={vi.fn()} />,
    );
    expect(container.querySelectorAll('rt').length).toBe(0);
  });
});
