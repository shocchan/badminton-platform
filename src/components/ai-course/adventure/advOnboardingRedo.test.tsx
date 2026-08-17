// @vitest-environment jsdom
// 「冒険の準備をやり直す」（redo）の受入テスト。
//
// いちばん守りたいこと:
// - redoでは**記録が消えないことを明示**する（不安で押せない機能は無いのと同じ）
// - redoのキャンセルは「元の設定のまま戻る」＝従来ホームへ飛ばさない
// - 初回オンボーディングの文言・導線はredo導入後も変わらない（既存生徒の初回体験を壊さない）
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { AdvOnboarding } from './AdvOnboarding';
import type { DiagnosisPools } from '../../../lib/aiLesson/course/adventure/advDiagnosis';

const NOW = '2026-08-11T10:00:00.000Z';
const pools: DiagnosisPools = { foundationVocab: [], n3Vocab: [], n3Grammar: [], n2Grammar: [] };

const renderOnboarding = (redo: boolean) => {
  const onComplete = vi.fn();
  const onCancel = vi.fn();
  render(
    <AdvOnboarding lang="ja" pools={pools} nowISO={NOW} redo={redo}
      onComplete={onComplete} onCancel={onCancel} />,
  );
  return { onComplete, onCancel };
};

afterEach(cleanup);

describe('冒険の準備のやり直し（redo）', () => {
  it('redoでは「記録は消えない」ことを最初の画面で明示する', () => {
    renderOnboarding(true);
    expect(screen.getByText(/学習記録・攻略の実績は消えません/)).toBeTruthy();
  });

  it('redoのキャンセルは「元の設定のまま戻る」（従来ホームへ誘導しない）', () => {
    renderOnboarding(true);
    expect(screen.getByRole('button', { name: /やめて元の設定のまま戻る/ })).toBeTruthy();
    expect(screen.queryByText(/従来ホームへ/)).toBeNull();
  });

  it('初回（redoでない）は説明文が「あとで変えられます」で、キャンセル導線を出さない', () => {
    // 「いまはやめておく（従来ホームへ）」は撤去（2026-08-18 監査P1）。
    // 押すと旧コースのホームへ落ちるが、出す条件（progress.length>0）は旧コース歴を表さなかった
    renderOnboarding(false);
    expect(screen.getByText(/あとで変えられます/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /いまはやめておく/ })).toBeNull();
  });

  it('redoでも目的の選択肢は3つとも出る（初回と同じ選択の自由）', () => {
    renderOnboarding(true);
    const group = screen.getByLabelText('冒険の目的');
    expect(group.textContent).toContain('JLPT');
    expect(group.querySelectorAll('button').length).toBeGreaterThanOrEqual(3);
  });
});

describe('オンボーディングの「もどる」導線', () => {
  it('目標レベル画面から「ひとつ前にもどる」で目的選択へ戻れる（選択は保持）', () => {
    renderOnboarding(false);
    fireEvent.click(screen.getByRole('button', { name: 'JLPTに合格したい' }));
    fireEvent.click(screen.getByRole('button', { name: /つぎへ/ }));
    expect(screen.getByLabelText('目標レベル')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /ひとつ前にもどる/ }));
    // 目的選択に戻り、選んだ目的が選択状態のまま
    expect(screen.getByLabelText('冒険の目的')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'JLPTに合格したい' }).className).toContain('is-selected');
  });
});

describe('相棒の正式キャラ（ナツ/ハル/アキ）', () => {
  it('選択画面に3体が新しい名前で並ぶ（旧キャラ名は出ない）', () => {
    renderOnboarding(false);
    // 目的→レベル→受験日→スケジュール→先生→相棒 まで進む
    fireEvent.click(screen.getByRole('button', { name: 'JLPTに合格したい' }));
    fireEvent.click(screen.getByRole('button', { name: /つぎへ/ }));
    fireEvent.click(screen.getByRole('button', { name: /N3/ }));
    fireEvent.click(screen.getByRole('button', { name: /つぎへ/ }));
    fireEvent.click(screen.getByRole('button', { name: /未定のまま進む/ }));
    fireEvent.click(screen.getByRole('button', { name: /つぎへ/ }));       // schedule
    fireEvent.click(screen.getByRole('button', { name: /つぎへ/ }));       // teacher
    expect(screen.getByText('ナツ')).toBeTruthy();
    expect(screen.getByText('ハル')).toBeTruthy();
    expect(screen.getByText('アキ')).toBeTruthy();
    expect(screen.queryByText(/フク老師|ナミ|カジ/)).toBeNull();
  });
});

describe('診断完了時点の確定保存（onOutcomeReady・2026-08-15）', () => {
  it('診断が終わった瞬間にonOutcomeReadyが1回呼ばれる（披露画面のCTAを押す前）', () => {
    const onOutcomeReady = vi.fn();
    const onComplete = vi.fn();
    const onePool: DiagnosisPools = {
      foundationVocab: [{
        key: 'diag:q1', level: 'foundation', skill: 'vocabulary',
        promptJa: '設問', promptZh: '问题',
        choices: ['あ', 'い', 'う'], answerIndex: 0, explanationZh: '解说', refId: 'w1',
      }],
      n3Vocab: [], n3Grammar: [], n2Grammar: [],
    };
    render(
      <AdvOnboarding lang="ja" pools={onePool} nowISO={NOW}
        onComplete={onComplete} onCancel={vi.fn()} onOutcomeReady={onOutcomeReady} />,
    );
    // 目的→レベル→受験日→スケジュール→先生→相棒→診断へ（プール空=診断0問で即完了）
    fireEvent.click(screen.getByRole('button', { name: 'JLPTに合格したい' }));
    fireEvent.click(screen.getByRole('button', { name: /つぎへ/ }));
    fireEvent.click(screen.getByRole('button', { name: /N3/ }));
    fireEvent.click(screen.getByRole('button', { name: /つぎへ/ }));
    fireEvent.click(screen.getByRole('button', { name: /未定のまま進む/ }));
    fireEvent.click(screen.getByRole('button', { name: /つぎへ/ }));       // schedule
    fireEvent.click(screen.getByRole('button', { name: /つぎへ/ }));       // teacher
    fireEvent.click(screen.getByRole('button', { name: /つぎへ（現在地診断）/ }));
    fireEvent.click(screen.getByRole('button', { name: /診断を始める/ }));
    // 1問だけの診断を「わからない」で答える → 最終問題なのでoutcome確定 → 披露画面
    fireEvent.click(screen.getByRole('button', { name: /^わからない/ }));
    expect(onOutcomeReady).toHaveBeenCalledTimes(1);
    expect(onOutcomeReady.mock.calls[0][0].route).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled(); // CTAを押すまで画面遷移側は発火しない
  });
});

describe('V2の生徒に旧コースのホームへ出ていく口を出さない（2026-08-18 監査P1）', () => {
  it('初回のオンボーディングに「いまはやめておく（従来ホームへ）」を出さない', () => {
    // 出す条件だった progress.length>0 は「旧コース歴」を表さない（V2のAI会話1回で立つ）。
    // 押すと ?legacy が付いて旧コースのホーム（ミナモ列島）へ落ちるので、条件ごと撤去した
    render(
      <AdvOnboarding lang="ja" pools={pools} nowISO={NOW}
        onComplete={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.queryByRole('button', { name: /従来ホームへ/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /いまはやめておく/ })).toBeNull();
  });

  it('やり直し（redo）のキャンセルは残る（行き先は元の設定に戻すだけ）', () => {
    render(
      <AdvOnboarding lang="ja" pools={pools} nowISO={NOW} redo
        onComplete={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: /やめて元の設定のまま戻る/ })).toBeTruthy();
  });
});
