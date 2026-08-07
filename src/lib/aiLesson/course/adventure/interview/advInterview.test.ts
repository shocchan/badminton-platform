// 帰化面接の表現特訓の受入テスト。
//
// いちばん守りたいこと:
// ① **発行された人だけに見える**
// ② **自分の答えを書くまで「声に出した」を記録できない**（回答例の丸暗記で練習した気にさせない）
// ③ 進捗は実測（書いた数・声に出した数）だけ。合否や%を出さない
import { describe, it, expect } from 'vitest';
import {
  emptyInterviewPrep, interviewPrepVisible, noteFor, worksheetFor,
  withMyAnswer, withSpokenPractice, withNotApplicable, withWorksheet,
  categoryProgress, interviewOverview, restoreInterviewPrep,
} from './advInterview';
import {
  INTERVIEW_QUESTIONS, WORKSHEET_PROMPTS, CATEGORY_ORDER,
  INTERVIEW_CATEGORY_LABEL, questionsByCategory,
} from './kikaInterviewBank';
import { defaultAdvProfile } from '../advProfile';

const NOW = '2026-08-07T10:00:00.000Z';

describe('問答バンクの健全性', () => {
  it('全質問が id重複なし・全カテゴリに1問以上ある', () => {
    const ids = INTERVIEW_QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const cat of CATEGORY_ORDER) {
      expect(questionsByCategory(cat).length, cat).toBeGreaterThan(0);
    }
  });

  it('全質問が intent（何を確認されているか）とポイントを ja/zh で持つ', () => {
    for (const q of INTERVIEW_QUESTIONS) {
      expect(q.questionJa.length, q.id).toBeGreaterThan(0);
      expect(q.questionHintZh.length, q.id).toBeGreaterThan(0);
      expect(q.intentJa.length, q.id).toBeGreaterThan(0);
      expect(q.intentZh.length, q.id).toBeGreaterThan(0);
      expect(q.pointJa.length, q.id).toBeGreaterThan(0);
      expect(q.pointZh.length, q.id).toBeGreaterThan(0);
      expect(q.modelAnswerJa.length, q.id).toBeGreaterThan(0);
    }
  });

  it('カテゴリ表示名が ja/zh そろっている', () => {
    for (const cat of CATEGORY_ORDER) {
      expect(INTERVIEW_CATEGORY_LABEL[cat].ja.length).toBeGreaterThan(0);
      expect(INTERVIEW_CATEGORY_LABEL[cat].zh.length).toBeGreaterThan(0);
    }
  });

  it('CEO資料由来の主要質問が入っている（来日きっかけ・違反歴・大きい入金）', () => {
    const all = INTERVIEW_QUESTIONS.map((q) => q.questionJa).join('');
    expect(all).toContain('日本に来よう');
    expect(all).toContain('交通違反');
    expect(all).toContain('大きい金額');
  });

  it('自分ノートは9項目・5セクション', () => {
    expect(WORKSHEET_PROMPTS.length).toBe(9);
    expect(new Set(WORKSHEET_PROMPTS.map((p) => p.sectionJa)).size).toBe(5);
  });
});

describe('可視性 — 発行された人だけ', () => {
  it('既定は見えない', () => {
    expect(interviewPrepVisible(defaultAdvProfile(NOW))).toBe(false);
  });

  it('enabledAt が立っていれば見える', () => {
    const p = defaultAdvProfile(NOW);
    expect(interviewPrepVisible({ ...p, interviewPrep: { ...p.interviewPrep, enabledAt: NOW } })).toBe(true);
  });
});

describe('特訓の記録', () => {
  it('自分の答えを保存できる', () => {
    const s = withMyAnswer(emptyInterviewPrep(), 'q06', '名前は王です。');
    expect(noteFor(s, 'q06').myAnswer).toBe('名前は王です。');
  });

  it('**答えが空のままでは「声に出した」を記録できない**', () => {
    const s0 = emptyInterviewPrep();
    expect(withSpokenPractice(s0, 'q06', NOW)).toBe(s0);
    const s1 = withMyAnswer(s0, 'q06', '   ');
    expect(withSpokenPractice(s1, 'q06', NOW)).toBe(s1);
  });

  it('答えを書けば記録でき、回数が増える', () => {
    let s = withMyAnswer(emptyInterviewPrep(), 'q06', '名前は王です。');
    s = withSpokenPractice(s, 'q06', NOW);
    s = withSpokenPractice(s, 'q06', NOW);
    expect(noteFor(s, 'q06').spokenCount).toBe(2);
    expect(noteFor(s, 'q06').lastPracticedAt).toBe(NOW);
  });

  it('notApplicable は conditional の質問だけ立てられる', () => {
    const s0 = emptyInterviewPrep();
    // q06（基本情報）は conditional でない → 変わらない
    expect(withNotApplicable(s0, 'q06', true)).toBe(s0);
    // q13（離婚理由）は conditional → 立つ
    const s1 = withNotApplicable(s0, 'q13', true);
    expect(noteFor(s1, 'q13').notApplicable).toBe(true);
  });

  it('自分ノートは本音と伝え方を別々に保存できる', () => {
    let s = withWorksheet(emptyInterviewPrep(), 'w1-1', { honne: 'ビザ更新が面倒' });
    s = withWorksheet(s, 'w1-1', { omote: '安定して日本で暮らしたい' });
    expect(worksheetFor(s, 'w1-1')).toEqual({ honne: 'ビザ更新が面倒', omote: '安定して日本で暮らしたい' });
  });
});

describe('進捗 — 実測だけ', () => {
  it('notApplicable の質問は分母から外れる', () => {
    const before = interviewOverview(emptyInterviewPrep());
    const s = withNotApplicable(emptyInterviewPrep(), 'q13', true);
    const after = interviewOverview(s);
    expect(after.totalQuestions).toBe(before.totalQuestions - 1);
  });

  it('書いた数・声に出した数が別々に数えられる', () => {
    let s = withMyAnswer(emptyInterviewPrep(), 'q06', '答え');
    s = withMyAnswer(s, 'q04', '答え');
    s = withSpokenPractice(s, 'q06', NOW);
    const ov = interviewOverview(s);
    expect(ov.answered).toBe(2);
    expect(ov.spoken).toBe(1);
  });

  it('自分ノートは「伝える言い方」まで書けて1項目完了（本音だけでは数えない）', () => {
    let s = withWorksheet(emptyInterviewPrep(), 'w1-1', { honne: '本音だけ' });
    expect(interviewOverview(s).worksheetDone).toBe(0);
    s = withWorksheet(s, 'w1-1', { omote: '伝え方' });
    expect(interviewOverview(s).worksheetDone).toBe(1);
  });

  it('カテゴリ進捗の合計が全体と一致する', () => {
    let s = emptyInterviewPrep();
    for (const q of INTERVIEW_QUESTIONS.slice(0, 5)) s = withMyAnswer(s, q.id, '答え');
    const cats = categoryProgress(s);
    expect(cats.reduce((n, c) => n + c.answered, 0)).toBe(interviewOverview(s).answered);
  });
});

describe('壊れたデータの復元', () => {
  it('正常データは往復して同じ', () => {
    let s = withMyAnswer(emptyInterviewPrep(), 'q06', '答え');
    s = withSpokenPractice(s, 'q06', NOW);
    s = { ...s, enabledAt: NOW };
    expect(restoreInterviewPrep(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it('壊れた値は安全側へ落ちる', () => {
    const s = restoreInterviewPrep({
      enabledAt: 123,
      notes: { q06: { myAnswer: 42, spokenCount: -5 }, broken: 'x' },
      worksheet: { 'w1-1': { honne: null, omote: ['x'] } },
    });
    expect(s.enabledAt).toBeNull();
    expect(noteFor(s, 'q06')).toEqual({ myAnswer: '', spokenCount: 0, lastPracticedAt: null, notApplicable: false });
    expect(worksheetFor(s, 'w1-1')).toEqual({ honne: '', omote: '' });
  });

  it('旧データ（interviewPrepなし）でもプロファイルが落ちない', () => {
    expect(defaultAdvProfile(NOW).interviewPrep).toEqual(emptyInterviewPrep());
  });
});
