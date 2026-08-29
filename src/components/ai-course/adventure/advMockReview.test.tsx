// @vitest-environment jsdom
// 模試の間違い直し画面。見たいのは「解説が読めること」と「無いものを有るふりをしないこと」。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { AdvMockReview } from './AdvMockReview';
import type { AdvMockLogEntry } from '../../../lib/aiLesson/course/adventure/advTypes';

const entry = (over: Partial<AdvMockLogEntry> = {}): AdvMockLogEntry => ({
  mockId: 'm1', dateKey: '2026-08-25', level: 'N2', mode: 'short',
  totalCorrect: 8, totalQuestions: 20, totalUnanswered: 0,
  sectionsFinishedInTime: 3, sectionCount: 3, skills: ['vocabulary'],
  completedAt: '2026-08-25T11:00:00.000Z',
  wrong: [{
    key: 'q1', sectionLabelJa: '言語知識', sectionLabelZh: '语言知识', index: 3,
    stemJa: '「挑戦」の読みは？', stemZh: '「挑戦」怎么读？', pickedTextJa: 'とうせん',
    correctTextJa: 'ちょうせん',
    whyJa: '「挑」は音読みで「ちょう」です。', whyZh: '「挑」音读为「ちょう」。',
  }],
  ...over,
});

describe('模試の間違い直し', () => {
  afterEach(cleanup);

  it('1回だけなら、開いてすぐ問題文・選んだ答え・正解・解説が読める', () => {
    render(<AdvMockReview lang="ja" mockLog={[entry()]} onBack={vi.fn()} />);
    expect(screen.getByText('「挑戦」の読みは？')).toBeTruthy();
    expect(screen.getByText(/✕ とうせん/)).toBeTruthy();
    expect(screen.getByText(/◯ ちょうせん/)).toBeTruthy();
    expect(screen.getByText('「挑」は音読みで「ちょう」です。')).toBeTruthy();
  });

  it('複数回あれば一覧から選ぶ（何問間違えたかが一覧で分かる）', () => {
    render(<AdvMockReview lang="ja"
      mockLog={[entry({ mockId: 'm1', dateKey: '2026-08-20' }), entry({ mockId: 'm2', dateKey: '2026-08-25' })]}
      onBack={vi.fn()} />);
    // 新しい順
    const buttons = screen.getAllByRole('button').filter((b) => b.textContent?.includes('2026-08-'));
    expect(buttons[0]?.textContent).toContain('2026-08-25');
    expect(buttons[0]?.textContent).toContain('間違い 1問');
    fireEvent.click(buttons[0]!);
    expect(screen.getByText('「挑戦」の読みは？')).toBeTruthy();
  });

  // 2026-08-29 CEO指摘: 解説だけでは復習にならない。そのとき何が並んでいたかが要る
  it('出題時の選択肢が全部読める（選んだもの・正解が印つきで分かる）', () => {
    render(<AdvMockReview lang="ja" mockLog={[entry({
      wrong: [{
        key: 'q1', sectionLabelJa: '言語知識', sectionLabelZh: '语言知识', index: 3,
        stemJa: '「挑戦」の読みは？', stemZh: '「挑戦」怎么读？',
        choicesJa: ['ちょうせん', 'とうせん', 'ちょうぜん', 'とうぜん'],
        pickedTextJa: 'とうせん', correctTextJa: 'ちょうせん',
        whyJa: '「挑」は音読みで「ちょう」です。', whyZh: '「挑」音读为「ちょう」。',
      }],
    })]} onBack={vi.fn()} />);
    for (const c of ['ちょうせん', 'とうせん', 'ちょうぜん', 'とうぜん']) {
      expect(screen.getAllByText(new RegExp(c)).length, c).toBeGreaterThan(0);
    }
    // 正解と自分の答えは印つきで区別できる（記号は別spanなので textContent で見る）
    const lines = [...document.querySelectorAll('li li')].map((el) => el.textContent ?? '');
    expect(lines.find((l) => l.includes('ちょうせん') && !l.includes('ちょうぜん'))).toContain('◯');
    expect(lines.find((l) => l.startsWith('✕とうせん'))).toBeTruthy();
  });

  it('読解は本文が、聴解は原稿が読める（無ければ何を間違えたか分からない）', () => {
    render(<AdvMockReview lang="ja" mockLog={[entry({
      wrong: [{
        key: 'r1', sectionLabelJa: '読解', sectionLabelZh: '阅读', index: 1,
        stemJa: '筆者が言いたいことは？', stemZh: '作者想说什么？',
        choicesJa: ['ア', 'イ'], pickedTextJa: 'イ', correctTextJa: 'ア',
        passageJa: '駅前の商店街は、平日の昼でも人が多い。',
        whyJa: '第2段落に書いてあります。', whyZh: '写在第2段。',
      }, {
        key: 'l1', sectionLabelJa: '聴解', sectionLabelZh: '听力', index: 2,
        stemJa: '男の人は何をしますか', stemZh: '男人要做什么',
        choicesJa: ['ア', 'イ'], pickedTextJa: null, correctTextJa: 'ア',
        situationJa: '会社で男の人と女の人が話しています。',
        transcriptJa: '男：この資料、明日までに直しておきます。',
        whyJa: '「直しておきます」と言っています。', whyZh: '他说「直しておきます」。',
      }],
    })]} onBack={vi.fn()} />);
    expect(screen.getByText(/駅前の商店街は/)).toBeTruthy();
    expect(screen.getByText(/この資料、明日までに直しておきます/)).toBeTruthy();
    expect(screen.getByText(/会社で男の人と女の人が話しています/)).toBeTruthy();
    // 未回答も分かる
    expect(screen.getByText(/未回答/)).toBeTruthy();
  });

  it('解説が残っていない古い回は「残っていない」と書く（作らない）', () => {
    render(<AdvMockReview lang="ja" mockLog={[entry({ wrong: undefined })]} onBack={vi.fn()} />);
    expect(screen.getByText(/解説を保存していません/)).toBeTruthy();
  });

  it('全問正解の回は「全問正解」と出す（0件の解説カードを出さない）', () => {
    render(<AdvMockReview lang="ja"
      mockLog={[entry({ wrong: [], totalCorrect: 20, totalQuestions: 20 })]} onBack={vi.fn()} />);
    expect(screen.getByText(/全問正解でした/)).toBeTruthy();
  });

  it('1回も終えていなければ、その理由まで書く（行き止まりにしない）', () => {
    render(<AdvMockReview lang="ja" mockLog={[]} onBack={vi.fn()} />);
    expect(screen.getByText(/まだ最後まで終えた模試がありません/)).toBeTruthy();
    expect(screen.getByText(/途中でやめた回は記録に入りません/)).toBeTruthy();
  });

  it('中国語では解説も中国語で出す', () => {
    render(<AdvMockReview lang="zh" mockLog={[entry()]} onBack={vi.fn()} />);
    expect(screen.getByText('「挑」音读为「ちょう」。')).toBeTruthy();
    expect(screen.getByText(/答对 8／20题/)).toBeTruthy();
  });
});
