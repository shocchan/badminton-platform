// @vitest-environment jsdom
// マークシート画面の受入テスト。
//
// いちばん守りたいこと:
// - 問題文が画面に無い運用でも、迷わず記入→提出まで進める
// - 正解未登録なら「先生が確認します」（0%やスコアを出さない・原則13）
// - 中断した答案が profile から復元される
import { useState } from 'react';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { AdvAnswerSheetRunner } from './AdvAnswerSheetRunner';
import { defaultAdvProfile } from '../../../lib/aiLesson/course/adventure/advProfile';
import { startSession, type AnswerSheetPaper } from '../../../lib/aiLesson/course/adventure/advAnswerSheet';
import type { AdventureV2Profile } from '../../../lib/aiLesson/course/adventure/advTypes';

const NOW = '2026-08-02T10:00:00.000Z';

const paper = (over: Partial<AnswerSheetPaper> = {}): AnswerSheetPaper => ({
  paperId: 'p1',
  titleJa: '2023年12月 N2', titleZh: '2023年12月 N2',
  level: 'N2',
  noteJa: 'WeChatで送った画像を見てください', noteZh: '请看微信发的图片',
  sections: [
    { id: 's1', labelJa: '言語知識・読解', labelZh: '语言知识・阅读', questionCount: 3, choiceCount: 4, minutes: 105 },
  ],
  issuedAtISO: NOW,
  ...over,
});

const profileWith = (over: Partial<AdventureV2Profile> = {}): AdventureV2Profile => ({
  ...defaultAdvProfile(NOW),
  goalType: 'jlpt',
  targetJlpt: 'N2',
  answerSheets: [paper()],
  ...over,
});

/** onSave が実際に profile を更新する小さなハーネス（AdvShellのsaveと同じ振る舞い） */
const Harness = ({ initial, lang = 'ja', onBack = () => {} }: {
  initial: AdventureV2Profile; lang?: 'ja' | 'zh'; onBack?: () => void;
}) => {
  const [prof, setProf] = useState(initial);
  return <AdvAnswerSheetRunner lang={lang} profile={prof} onSave={setProf} onBack={onBack} />;
};

afterEach(() => cleanup());

describe('一覧', () => {
  it('届いている用紙が並び、問題はWeChat経由だと説明する', () => {
    render(<Harness initial={profileWith()} />);
    expect(screen.getByText('過去問の試験場')).toBeTruthy();
    expect(screen.getByText(/先生からWeChatで届いた問題を手元に置いて/)).toBeTruthy();
    expect(screen.getByText('2023年12月 N2')).toBeTruthy();
  });

  it('用紙0枚なら先生に相談する案内（行き止まりの空画面にしない）', () => {
    render(<Harness initial={profileWith({ answerSheets: [] })} />);
    expect(screen.getByText(/まだ答案用紙が届いていません/)).toBeTruthy();
  });
});

describe('開始〜記入〜提出', () => {
  const start = () => {
    render(<Harness initial={profileWith()} />);
    fireEvent.click(screen.getByText('2023年12月 N2'));
    // 説明画面: 先生の一言と時間の説明
    expect(screen.getByText(/WeChatで送った画像を見てください/)).toBeTruthy();
    expect(screen.getByText(/途中で閉じても時間は本番と同じように進み/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /手元に問題を用意して、始める/ }));
  };

  it('開始するとタイマーとマークシートが出る', () => {
    start();
    expect(screen.getByRole('timer')).toBeTruthy();
    expect(screen.getByRole('timer').textContent).toContain('105:00');
    expect(screen.getAllByRole('radiogroup')).toHaveLength(3);
  });

  it('番号を選べる・同じ番号をもう一度押すと消える', () => {
    start();
    const q1 = within(screen.getByRole('radiogroup', { name: '問1' }));
    fireEvent.click(q1.getByRole('radio', { name: '3' }));
    expect(q1.getByRole('radio', { name: '3' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(q1.getByRole('radio', { name: '3' }));
    expect(q1.getByRole('radio', { name: '3' }).getAttribute('aria-checked')).toBe('false');
  });

  it('未回答があると提出前に番号つきで警告する', () => {
    start();
    fireEvent.click(within(screen.getByRole('radiogroup', { name: '問2' })).getByRole('radio', { name: '1' }));
    fireEvent.click(screen.getByRole('button', { name: /提出へ進む/ }));
    expect(screen.getByText(/未回答が 2 問あります/)).toBeTruthy();
    expect(screen.getByText(/問題番号：1、3/)).toBeTruthy();
    // 戻って記入を続けられる
    fireEvent.click(screen.getByRole('button', { name: '記入へ戻る' }));
    expect(screen.getAllByRole('radiogroup')).toHaveLength(3);
  });

  it('**正解未登録なら提出後は「先生が確認します」**（スコアを出さない）', () => {
    start();
    fireEvent.click(within(screen.getByRole('radiogroup', { name: '問1' })).getByRole('radio', { name: '1' }));
    fireEvent.click(screen.getByRole('button', { name: /提出へ進む/ }));
    fireEvent.click(screen.getByRole('button', { name: 'これで提出する' }));
    expect(screen.getByText('答案を提出しました')).toBeTruthy();
    expect(screen.getByText(/採点は先生が確認してお返しします/)).toBeTruthy();
    expect(screen.queryByText(/%/)).toBeNull();
    expect(screen.getByText(/1 \/ 3 問に記入/)).toBeTruthy();
  });

  it('**提出後に自分の答えが見える＋スクショで先生へ送る導線**（答案を破棄しない・監査P0）', () => {
    start();
    fireEvent.click(within(screen.getByRole('radiogroup', { name: '問1' })).getByRole('radio', { name: '2' }));
    fireEvent.click(within(screen.getByRole('radiogroup', { name: '問3' })).getByRole('radio', { name: '4' }));
    fireEvent.click(screen.getByRole('button', { name: /提出へ進む/ }));
    fireEvent.click(screen.getByRole('button', { name: 'これで提出する' }));
    expect(screen.getByText('自分の答え')).toBeTruthy();
    expect(screen.getByText('1:2')).toBeTruthy();
    expect(screen.getByText('2:−')).toBeTruthy();
    expect(screen.getByText('3:4')).toBeTruthy();
    expect(screen.getByText(/スクリーンショットして、WeChatで先生に送ってください/)).toBeTruthy();
  });

  it('正解が登録されていれば自己採点の%が出る', () => {
    render(<Harness initial={profileWith({
      answerSheets: [paper({
        sections: [{ id: 's1', labelJa: 'A', labelZh: 'A', questionCount: 2, choiceCount: 4, minutes: 10, correctChoices: [1, 2] }],
      })],
    })} />);
    fireEvent.click(screen.getByText('2023年12月 N2'));
    fireEvent.click(screen.getByRole('button', { name: /手元に問題を用意して、始める/ }));
    fireEvent.click(within(screen.getByRole('radiogroup', { name: '問1' })).getByRole('radio', { name: '1' }));
    fireEvent.click(within(screen.getByRole('radiogroup', { name: '問2' })).getByRole('radio', { name: '4' }));
    fireEvent.click(screen.getByRole('button', { name: /提出へ進む/ }));
    fireEvent.click(screen.getByRole('button', { name: 'これで提出する' }));
    expect(screen.getByText('50%')).toBeTruthy();
    expect(screen.getByText(/答对 1 \/ 2 题|1 \/ 2 問正解/)).toBeTruthy();
  });

  it('提出すると履歴に残り、一覧に提出回数が出る', () => {
    start();
    fireEvent.click(screen.getByRole('button', { name: /提出へ進む/ }));
    fireEvent.click(screen.getByRole('button', { name: 'これで提出する' }));
    fireEvent.click(screen.getByRole('button', { name: '試験場へ戻る' }));
    expect(screen.getByText(/提出1回/)).toBeTruthy();
    expect(screen.getByText('これまでの提出')).toBeTruthy();
    expect(screen.getByText(/先生が確認中/)).toBeTruthy();
  });
});

describe('中断復帰', () => {
  it('**進行中の答案があれば一覧を出さず、同じ答案から再開する**', () => {
    const p = paper();
    const session = startSession(p, new Date().toISOString());
    const withAnswer = { ...session, answers: { s1: [2, null, null] } };
    render(<Harness initial={profileWith({ answerSheetSession: withAnswer })} />);
    // 一覧ではなくマークシートが出て、記入済みが残っている
    const q1 = within(screen.getByRole('radiogroup', { name: '問1' }));
    expect(q1.getByRole('radio', { name: '2' }).getAttribute('aria-checked')).toBe('true');
  });
});

describe('zh', () => {
  it('主要ラベルに日本語が残らない', () => {
    render(<Harness initial={profileWith()} lang="zh" />);
    expect(screen.getByText('真题考场')).toBeTruthy();
    fireEvent.click(screen.getByText('2023年12月 N2'));
    expect(screen.getByRole('button', { name: /备好手边的题目，开始/ })).toBeTruthy();
    expect(screen.queryByText('過去問の試験場')).toBeNull();
  });
});
