// @vitest-environment jsdom
// Chapter 1 Vertical Slice のUI完走E2E（§21・§22）。
// 学習完了→Quest進行→霧/解放→章末場面会話→Chapter完了までを実UIで通す。
// LLM・DB・remote には触れない。保存はsandboxキーのみであることも検証する。
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import Chapter1AdventurePanel from './Chapter1AdventurePanel';
import { CHAPTER1_QUESTS, CHAPTER1_FINALE_STEPS, CHAPTER1_LOCATIONS } from '../../../lib/aiLesson/course/rpg/chapter1Data';
import { RPG_SANDBOX_KEY } from '../../../lib/aiLesson/course/rpg/adventureState';
import { allVocabularyItems } from '../../../lib/aiLesson/course/foundationVocabBank';

afterEach(cleanup);
beforeEach(() => localStorage.clear());

const itemById = new Map(allVocabularyItems().map(i => [i.id, i]));

/** 現在のQuestを学習UI経由で正解し切る（intro画面→学習→完了画面まで） */
const clearQuestViaUi = (questOrder: number) => {
  const quest = CHAPTER1_QUESTS.find(q => q.order === questOrder)!;
  // Map上の第一CTA
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`Quest ${quest.order}.*を始める`) }));
  // Intro（シンプルモードでない場合のみ）→ 学習開始
  const start = screen.queryByRole('button', { name: '学習を始める' });
  if (start) fireEvent.click(start);
  // 各ことばの意味チェックに正解
  for (const itemId of quest.learningItemIds) {
    const item = itemById.get(itemId)!;
    fireEvent.click(screen.getByRole('button', { name: item.meaningZh }));
  }
  // 章末は場面会話
  if (quest.isChapterFinale) {
    for (const step of CHAPTER1_FINALE_STEPS) {
      fireEvent.click(screen.getByRole('button', { name: step.correctJa }));
    }
  }
  // Quest完了画面
  expect(screen.getByText(`Quest ${quest.order} 完了！`)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', {
    name: quest.isChapterFinale ? 'Chapter 1 の記録へ' : /マップへ（主人公が次の場所へ進みます）/ }));
};

describe('Chapter 1 playable vertical slice（UI完走E2E）', () => {
  it('学習内容・時間・完了条件が最初のQuest導線に明示される（§10）', () => {
    render(<Chapter1AdventurePanel onBack={() => {}} />);
    const q1 = CHAPTER1_QUESTS[0];
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`Quest 1.*を始める`) }));
    expect(screen.getByText(q1.learnGoalJa)).toBeTruthy();
    expect(screen.getByText(`約${q1.estimatedMinutes}分`)).toBeTruthy();
    expect(screen.getByText(q1.completionConditionJa)).toBeTruthy();
    expect(screen.getByText(q1.storyOutcomeJa)).toBeTruthy();
  });
  it('間違えると完了せず、正解のみで進む（Story Skipで学習完了しない）', () => {
    render(<Chapter1AdventurePanel onBack={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Quest 1.*を始める/ }));
    fireEvent.click(screen.getByRole('button', { name: '学習を始める' }));
    const first = itemById.get(CHAPTER1_QUESTS[0].learningItemIds[0])!;
    // わざと不正解（正解以外の選択肢）
    const wrong = screen.getAllByRole('button')
      .find(b => b.textContent && b.textContent !== first.meaningZh &&
        !b.textContent.includes('中断') && b.className.includes('border-gray-200'))!;
    fireEvent.click(wrong);
    expect(screen.getByText(/もう一度/)).toBeTruthy();
    expect(screen.queryByText('Quest 1 完了！')).toBeNull();
    // 正解で次へ
    fireEvent.click(screen.getByRole('button', { name: first.meaningZh }));
    expect(screen.getByText(/ことば 2／2/)).toBeTruthy();
  });
  it('5 Questを完走→霧が晴れ・人物解放・Story進行・Chapter完了（学習進行=物語進行）', () => {
    render(<Chapter1AdventurePanel onBack={() => {}} />);
    // 開始時: 未解放の場所は「？？？」・Quest2以降はロック
    expect(screen.getAllByText('？？？').length).toBeGreaterThanOrEqual(3);
    clearQuestViaUi(1);
    // Quest1完了で翔子先生と出会い、ことば通りが読めるようになる
    expect(screen.getByText('ことば通り')).toBeTruthy();
    expect(screen.getAllByTitle(/翔子先生/).length).toBeGreaterThanOrEqual(1);
    clearQuestViaUi(2);
    clearQuestViaUi(3);
    expect(screen.getByText('みなも広場')).toBeTruthy();
    expect(screen.getAllByTitle(/ハナさん/).length).toBeGreaterThanOrEqual(1);
    clearQuestViaUi(4);
    expect(screen.getByText('駅前')).toBeTruthy();
    clearQuestViaUi(5);
    // Chapter完了画面
    expect(screen.getByText(/Chapter 1「はじまりの町」完了/)).toBeTruthy();
    expect(screen.getByText(/完了Quest: 5／5/)).toBeTruthy();
    // 冒険値合計 = 20+20+25+25+40
    expect(screen.getByText(/冒険値: 130/)).toBeTruthy();
    // マップへ戻ると全場所が解放済み
    fireEvent.click(screen.getByRole('button', { name: 'マップへ戻る' }));
    for (const loc of CHAPTER1_LOCATIONS) expect(screen.getByText(loc.nameJa)).toBeTruthy();
  });
  it('章末の場面会話は誤答では進まない（10問テストではなく場面攻略）', () => {
    render(<Chapter1AdventurePanel onBack={() => {}} />);
    for (let i = 1; i <= 4; i++) clearQuestViaUi(i);
    const q5 = CHAPTER1_QUESTS[4];
    fireEvent.click(screen.getByRole('button', { name: /Quest 5.*を始める/ }));
    fireEvent.click(screen.getByRole('button', { name: '学習を始める' }));
    for (const itemId of q5.learningItemIds) {
      fireEvent.click(screen.getByRole('button', { name: itemById.get(itemId)!.meaningZh }));
    }
    // 場面会話1問目で誤答→進まない
    const step = CHAPTER1_FINALE_STEPS[0];
    const wrong = step.optionsJa.find(o => o !== step.correctJa)!;
    fireEvent.click(screen.getByRole('button', { name: wrong }));
    expect(screen.getByText(/伝わらなかったようです/)).toBeTruthy();
    expect(screen.queryByText('Quest 5 完了！')).toBeNull();
  });
  it('reloadで進行が復元される（resume）', () => {
    const first = render(<Chapter1AdventurePanel onBack={() => {}} />);
    clearQuestViaUi(1);
    clearQuestViaUi(2);
    first.unmount();
    render(<Chapter1AdventurePanel onBack={() => {}} />); // 再マウント=reload相当
    expect(screen.getByRole('button', { name: /Quest 3.*を始める/ })).toBeTruthy();
    expect(screen.getByText('ことば通り')).toBeTruthy();
  });
  it('シンプル学習モードではStoryを飛ばして学習へ直行できる', () => {
    render(<Chapter1AdventurePanel onBack={() => {}} />);
    fireEvent.click(screen.getByRole('checkbox', { name: /シンプル学習モード/ }));
    fireEvent.click(screen.getByRole('button', { name: /Quest 1.*を始める/ }));
    // Intro画面を経由せず、直接ことばの学習へ
    expect(screen.queryByRole('button', { name: '学習を始める' })).toBeNull();
    expect(screen.getByText(/ことば 1／2/)).toBeTruthy();
  });
  it('保存はsandboxキーのみ（learner系キーへ非接触）', () => {
    render(<Chapter1AdventurePanel onBack={() => {}} />);
    clearQuestViaUi(1);
    const keys = Object.keys(localStorage);
    expect(keys).toEqual([RPG_SANDBOX_KEY]);
  });
  it('冒険値の表示は習得度と区別されている（§7）', () => {
    render(<Chapter1AdventurePanel onBack={() => {}} />);
    expect(screen.getByTitle(/日本語の習得度ではありません/)).toBeTruthy();
    expect(screen.queryByText(/JLPT/)).toBeNull(); // Adventure表示にJLPTを出さない
  });
});
