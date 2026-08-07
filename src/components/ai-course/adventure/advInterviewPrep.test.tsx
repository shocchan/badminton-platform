// @vitest-environment jsdom
// 表現特訓画面の受入テスト。
//
// いちばん守りたいこと:
// - **回答例は最初は隠れている**（先に自分で考えさせる。丸暗記は面接で崩れる）
// - **自分の答えを書くまで「声に出した」を押せない**
// - 模擬面接の機能がこの画面に無い（先生の授業でやる）
import { useState } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { AdvInterviewPrep } from './AdvInterviewPrep';
import { defaultAdvProfile } from '../../../lib/aiLesson/course/adventure/advProfile';
import type { AdventureV2Profile } from '../../../lib/aiLesson/course/adventure/advTypes';

const NOW = '2026-08-07T10:00:00.000Z';

const enabledProfile = (): AdventureV2Profile => {
  const p = defaultAdvProfile(NOW);
  return { ...p, interviewPrep: { ...p.interviewPrep, enabledAt: NOW } };
};

const Harness = ({ initial, lang = 'ja' }: { initial: AdventureV2Profile; lang?: 'ja' | 'zh' }) => {
  const [prof, setProf] = useState(initial);
  return <AdvInterviewPrep lang={lang} profile={prof} onSave={setProf} onBack={() => {}} />;
};

afterEach(() => cleanup());

const openFirstQuestion = () => {
  render(<Harness initial={enabledProfile()} />);
  fireEvent.click(screen.getByText('基本情報の確認'));
  fireEvent.click(screen.getByText('お名前・ご住所・出身地を教えてください。'));
};

describe('広場', () => {
  it('目的と「模擬面接は先生の授業で」を明記する', () => {
    render(<Harness initial={enabledProfile()} />);
    expect(screen.getByText('帰化面接の表現特訓')).toBeTruthy();
    expect(screen.getByText(/模擬面接そのものは先生の授業で行います/)).toBeTruthy();
    // 丸暗記への注意
    expect(screen.getByText(/回答例はそのまま暗記しないでください/)).toBeTruthy();
  });

  it('進捗は実測の件数だけ（%やスコアを出さない）', () => {
    render(<Harness initial={enabledProfile()} />);
    expect(screen.getByText('自分の答えを書いた')).toBeTruthy();
    expect(screen.getByText('声に出して練習した')).toBeTruthy();
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it('8テーマと自分ノートが並ぶ', () => {
    render(<Harness initial={enabledProfile()} />);
    expect(screen.getByText('まず：自分ノート')).toBeTruthy();
    for (const label of ['基本情報の確認', '家族・親族', '違反・トラブル・納付', '帰化の動機・これから']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });
});

describe('1問の特訓', () => {
  it('**回答例は最初は隠れている**（押すと出る・注意書きつき）', () => {
    openFirstQuestion();
    expect(screen.queryByText(/名前は〇〇〇〇です/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /回答例を見る/ }));
    expect(screen.getByText(/名前は〇〇〇〇です/)).toBeTruthy();
    expect(screen.getByText(/中身は必ず自分の事実に置き換えてください/)).toBeTruthy();
  });

  it('「何を確認されているか」と「答え方のポイント」が最初から見える', () => {
    openFirstQuestion();
    expect(screen.getByText('この質問で確認されていること')).toBeTruthy();
    expect(screen.getByText(/申請書類との一致確認/)).toBeTruthy();
  });

  it('**答えを書くまで「声に出した」は押せない**', () => {
    openFirstQuestion();
    const btn = screen.getByRole('button', { name: /声に出して言えた/ });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/自分の答え/), { target: { value: '名前は王です。住所は東京都です。' } });
    expect((screen.getByRole('button', { name: /声に出して言えた/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('声に出した回数が記録され、一覧に反映される', () => {
    openFirstQuestion();
    fireEvent.change(screen.getByLabelText(/自分の答え/), { target: { value: '名前は王です。' } });
    fireEvent.click(screen.getByRole('button', { name: /声に出して言えた/ }));
    expect(screen.getByText(/×1/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /テーマへ戻る/ }));
    expect(screen.getByText(/声に出した 1回/)).toBeTruthy();
  });

  it('conditional の質問は「当てはまらない」で対象外にできる', () => {
    render(<Harness initial={enabledProfile()} />);
    fireEvent.click(screen.getByText('結婚・交際'));
    fireEvent.click(screen.getByText('結婚相手とはどのように知り合いましたか？'));
    fireEvent.click(screen.getByRole('checkbox', { name: /この質問は私には当てはまらない/ }));
    // 対象外にすると特訓UIが消える
    expect(screen.queryByLabelText(/自分の答え/)).toBeNull();
  });
});

describe('自分ノート', () => {
  it('本音→伝える言い方の2段で書ける。嘘作りではないと明記', () => {
    render(<Harness initial={enabledProfile()} />);
    fireEvent.click(screen.getByText('まず：自分ノート'));
    expect(screen.getByText(/嘘を作る作業ではありません/)).toBeTruthy();
    const honne = screen.getAllByLabelText(/本音の答え/)[0];
    fireEvent.change(honne, { target: { value: 'ビザ更新が面倒だから' } });
    const omote = screen.getAllByLabelText(/面接で伝える言い方/)[0];
    fireEvent.change(omote, { target: { value: '安定して日本で生活を続けたいからです' } });
    fireEvent.click(screen.getByRole('button', { name: /書けたぶんを保存して戻る/ }));
    expect(screen.getByText('1 / 9')).toBeTruthy();
  });
});

describe('zh', () => {
  it('主要ラベルが中国語になり、質問は日本語のまま（面接が日本語だから）', () => {
    render(<Harness initial={enabledProfile()} lang="zh" />);
    expect(screen.getByText('入籍面试表达特训')).toBeTruthy();
    fireEvent.click(screen.getByText('基本信息确认'));
    // 質問文は日本語のまま＋zhヒント
    expect(screen.getByText('お名前・ご住所・出身地を教えてください。')).toBeTruthy();
    expect(screen.getByText('询问姓名、住址、出生地')).toBeTruthy();
  });
});
