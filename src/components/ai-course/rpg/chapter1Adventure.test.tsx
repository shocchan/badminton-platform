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
import { UNIT1_QUESTIONS } from '../../../lib/aiLesson/course/foundationUnit1';
import { UNIT5_QUESTIONS } from '../../../lib/aiLesson/course/foundationUnit5';
import { UNIT6_QUESTIONS } from '../../../lib/aiLesson/course/foundationUnit6';

const questionById = new Map([...UNIT1_QUESTIONS, ...UNIT5_QUESTIONS, ...UNIT6_QUESTIONS].map(q => [q.id, q]));

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
  // 文法ミッション（ルール理解→確認問題→産出の順に正解）
  for (const m of quest.grammarRequirements ?? []) {
    fireEvent.click(screen.getByRole('button', { name: '確認問題へ' }));
    for (const qid of m.questionIds) {
      const question = questionById.get(qid)!;
      fireEvent.click(screen.getByRole('button', { name: question.choices![question.answerIndex!] }));
    }
    for (const tok of m.production.tokens) {
      fireEvent.click(screen.getByRole('button', { name: tok }));
    }
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
    expect(screen.getAllByText('ことば通り').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByTitle(/翔子先生/).length).toBeGreaterThanOrEqual(1);
    clearQuestViaUi(2);
    clearQuestViaUi(3);
    expect(screen.getAllByText('みなも広場').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByTitle(/ハナさん/).length).toBeGreaterThanOrEqual(1);
    clearQuestViaUi(4);
    expect(screen.getAllByText('駅前').length).toBeGreaterThanOrEqual(1);
    clearQuestViaUi(5);
    // Chapter完了画面
    expect(screen.getByText(/Chapter 1「はじまりの町」完了/)).toBeTruthy();
    expect(screen.getByText(/完了Quest: 5／5/)).toBeTruthy();
    // 冒険値合計 = 20+20+25+25+40
    expect(screen.getByText(/冒険値: 130/)).toBeTruthy();
    // マップへ戻ると全場所が解放済み
    fireEvent.click(screen.getByRole('button', { name: 'マップへ戻る' }));
    for (const loc of CHAPTER1_LOCATIONS) expect(screen.getAllByText(loc.nameJa).length).toBeGreaterThanOrEqual(1);
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
    expect(screen.getAllByText('ことば通り').length).toBeGreaterThanOrEqual(1);
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

describe('文法ミッション（§10）', () => {
  it('Quest2はルール理解→確認問題→産出を通し、誤答・誤順では進まない', () => {
    render(<Chapter1AdventurePanel onBack={() => {}} />);
    clearQuestViaUi(1);
    const q2 = CHAPTER1_QUESTS[1];
    fireEvent.click(screen.getByRole('button', { name: /Quest 2.*を始める/ }));
    fireEvent.click(screen.getByRole('button', { name: '学習を始める' }));
    for (const itemId of q2.learningItemIds) {
      fireEvent.click(screen.getByRole('button', { name: itemById.get(itemId)!.meaningZh }));
    }
    // ルール画面（実在のFoundationRuleが表示される）
    expect(screen.getByText('名詞＋です／ではありません')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '確認問題へ' }));
    // 確認問題: 誤答→進まない
    const question = questionById.get('fq-u2')!;
    const wrongChoice = question.choices!.find((_, i) => i !== question.answerIndex)!;
    fireEvent.click(screen.getByRole('button', { name: wrongChoice }));
    expect(screen.getByText(/もう一度考えて/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: question.choices![question.answerIndex!] }));
    // 産出: 誤順→リセットされ進まない
    const tokens = q2.grammarRequirements![0].production.tokens;
    fireEvent.click(screen.getByRole('button', { name: tokens[1] })); // 「は」から始める（誤順）
    for (const tok of [tokens[0], tokens[2], tokens[3]]) {
      fireEvent.click(screen.getByRole('button', { name: tok }));
    }
    expect(screen.getByText(/順番が違ったようです/)).toBeTruthy();
    expect(screen.queryByText('Quest 2 完了！')).toBeNull();
    // 正順で完了
    for (const tok of tokens) fireEvent.click(screen.getByRole('button', { name: tok }));
    expect(screen.getByText('Quest 2 完了！')).toBeTruthy();
  });
});

describe('復習Quest「再会」（§11）', () => {
  it('時間経過後だけ手紙が現れ、別文脈の再確認で霧が晴れ、XPは1日1回', () => {
    render(<Chapter1AdventurePanel onBack={() => {}} />);
    clearQuestViaUi(1);
    // 期限前は再会導線が出ない
    expect(screen.queryByText(/ハナさんからの手紙/)).toBeNull();
    // 検証用の時間送りを4回（12日）→ review_needed発生
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByRole('button', { name: /時間を＋3日/ }));
    expect(screen.getByText(/ハナさんからの手紙/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '手紙を読む' }));
    expect(screen.getByText(/覚えていますか/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '確かめに行く' }));
    // 別文脈: 例文の中で意味を確認（先生・会う）
    const xpBefore = Number(screen.getByText(/^冒険値 /).textContent!.replace(/[^0-9]/g, ''));
    for (const itemId of CHAPTER1_QUESTS[0].learningItemIds) {
      const item = itemById.get(itemId)!;
      expect(screen.getByText(item.exampleJa)).toBeTruthy(); // 初回カードではなく例文文脈
      fireEvent.click(screen.getByRole('button', { name: item.meaningZh }));
    }
    expect(screen.getByText(/再会できました/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'マップで確かめる' }));
    // 霧が晴れ、再会導線が消える。完了Quest・XPは維持＋報酬
    expect(screen.queryByText(/ハナさんからの手紙/)).toBeNull();
    expect(screen.getByText(/✓ Quest 1/)).toBeTruthy();
    const xpAfter = Number(screen.getByText(/^冒険値 /).textContent!.replace(/[^0-9]/g, ''));
    expect(xpAfter).toBe(xpBefore + 15);
  });
});

describe('Accessibility（§15）', () => {
  it('aria-live・マップaria-label・現在地/目的地/Fog状態のテキストがある', () => {
    const { container } = render(<Chapter1AdventurePanel onBack={() => {}} />);
    expect(container.querySelector('[aria-live="polite"]')).toBeTruthy();
    expect(screen.getByRole('img', { name: /はじまりの町のマップ。現在地は/ })).toBeTruthy();
    expect(screen.getByText('現在地:')).toBeTruthy();
    expect(screen.getByText('次の目的地:')).toBeTruthy();
    expect(screen.getAllByText(/霧の中/).length).toBeGreaterThanOrEqual(1); // Fog状態のテキスト併記
  });
  it('Quest完了と帰還でaria-liveへ解放・移動が通知される', () => {
    const { container } = render(<Chapter1AdventurePanel onBack={() => {}} />);
    const quest = CHAPTER1_QUESTS[0];
    fireEvent.click(screen.getByRole('button', { name: /Quest 1.*を始める/ }));
    fireEvent.click(screen.getByRole('button', { name: '学習を始める' }));
    for (const itemId of quest.learningItemIds) {
      fireEvent.click(screen.getByRole('button', { name: itemById.get(itemId)!.meaningZh }));
    }
    const live = container.querySelector('[aria-live="polite"]')!;
    expect(live.textContent).toContain('Quest1完了'); // 解放通知
    fireEvent.click(screen.getByRole('button', { name: /マップへ（主人公が次の場所へ進みます）/ }));
    expect(live.textContent).toContain('進みます'); // 自動移動の通知
  });
});
