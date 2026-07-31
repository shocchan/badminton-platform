// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { VocabularyHub } from './VocabularyHub';
import { aiCourseI18n } from '../../../../locales/aiCourse';
import { allVocabularyItems, vocabByCategory } from '../../../../lib/aiLesson/course/foundationVocabBank';

afterEach(cleanup);
beforeEach(() => { window.sessionStorage.clear(); });
const t = aiCourseI18n.ja;
const base = { t, onBack: () => {}, onGoConversation: () => {}, labPreview: true };

describe('ことば図鑑トップ（§7・3ブロック構成）', () => {
  it('パック・今日のことば・カテゴリーの3ブロック＋非保存表記（復習はロードマップへ集約・2E-1 §26）', () => {
    render(<VocabularyHub {...base} />);
    expect(screen.getByText(t.vocab.packHeading)).toBeTruthy();
    expect(screen.getByText(t.vocab.todayWordsHeading)).toBeTruthy();
    expect(screen.getByText(t.vocab.categoriesHeading)).toBeTruthy();
    expect(screen.queryByText(t.vocab.reviewHeading)).toBeNull(); // 同じ進捗の重複表示をしない（§26）
    expect(screen.getByText(t.vocab.notSavedVocab)).toBeTruthy();
    // 内部レビュー入口はことば画面内のみ（利用者向けナビに出さない・§14）
    expect(screen.getByText(t.vocab.internalReviewEntry)).toBeTruthy();
    // トップへ大きな検索欄・全語一覧を出さない（§31・§7）
    expect(screen.queryByPlaceholderText(t.vocab.searchPlaceholder)).toBeNull();
  });
  it('learner（labPreview=false）には内部レビュー・sandbox・冒険の内部入口を出さない（FOREST FIRST）', () => {
    render(<VocabularyHub {...base} labPreview={false} />);
    // 学習機能は見える
    expect(screen.getByText(t.vocab.todayWordsHeading)).toBeTruthy();
    // 内部入口はDOM自体なし
    expect(screen.queryByText(t.vocab.internalReviewEntry)).toBeNull();
    expect(screen.queryByText(t.vocab.decisionConsoleEntry)).toBeNull();
    expect(screen.queryByText(t.vocab.connectivityEntry)).toBeNull();
    expect(screen.queryByText(t.vocab.onoDraftsEntry)).toBeNull();
    expect(screen.queryByText(t.vocab.n3GrammarDraftsEntry)).toBeNull();
    expect(screen.queryByText(t.vocab.adventureEntry)).toBeNull();
    expect(screen.queryByText(t.vocab.sandboxEntry)).toBeNull();
  });
  it('learnerのURL復元で内部viewを指定してもtopへ戻す', () => {
    render(<VocabularyHub {...base} labPreview={false} initial={{ view: 'decisions' }} />);
    expect(screen.getByText(t.vocab.todayWordsHeading)).toBeTruthy();
  });
  it('優先4カテゴリ（動詞/い形/な形/名詞）が大きく・語数付きで表示される', () => {
    render(<VocabularyHub {...base} />);
    expect(screen.getByText(t.vocab.catVerbs)).toBeTruthy();
    expect(screen.getByText(t.vocab.catIAdj)).toBeTruthy();
    expect(screen.getByText(t.vocab.catNaAdj)).toBeTruthy();
    expect(screen.getByText(t.vocab.catNouns)).toBeTruthy();
    expect(screen.getByText(t.vocab.wordsCount(vocabByCategory(allVocabularyItems(), 'verbs').length))).toBeTruthy(); // 動詞（実数）
  });
  it('zhでもトップが表示される', () => {
    render(<VocabularyHub {...base} t={aiCourseI18n.zh} />);
    expect(screen.getByText(aiCourseI18n.zh.vocab.todayWordsHeading)).toBeTruthy();
  });
});

describe('カテゴリ・詳細・自己評価（§18-§21）', () => {
  it('動詞カテゴリで語彙カード（読み・意味・状態）が並ぶ', async () => {
    render(<VocabularyHub {...base} initial={{ view: 'category', category: 'verbs' }} />);
    await waitFor(() => expect(screen.getByText('行く')).toBeTruthy());
    expect(screen.getByText('帰る')).toBeTruthy();
    expect(screen.getAllByText(t.vocab.states.unseen).length).toBeGreaterThan(5);
  });
  it('詳細画面: 覚えた/まだ不安を切替可能・変更できる・encounterが記録される', async () => {
    render(<VocabularyHub {...base} initial={{ view: 'detail', itemId: 'fi-iku' }} />);
    await waitFor(() => expect(screen.getByText(t.vocab.detailUsage)).toBeTruthy());
    fireEvent.click(screen.getByText(t.vocab.selfKnownBtn));
    const raw = JSON.parse(window.sessionStorage.getItem('ai_course_vocab_preview_v1')!);
    expect(raw.entries['fi-iku'].selfAssessment).toBe('self_known');
    fireEvent.click(screen.getByText(t.vocab.needsReviewBtn));
    const raw2 = JSON.parse(window.sessionStorage.getItem('ai_course_vocab_preview_v1')!);
    expect(raw2.entries['fi-iku'].selfAssessment).toBe('needs_review');
    expect(raw2.entries['fi-iku'].encounterCount).toBeGreaterThanOrEqual(1);
  });
  it('反対語リンク: 大きい⇔小さいを行き来できる', async () => {
    render(<VocabularyHub {...base} initial={{ view: 'detail', itemId: 'fi-ookii' }} />);
    await waitFor(() => expect(screen.getByText(/小さい/)).toBeTruthy());
  });
  it('不正itemIdはことばトップへ正規化（§59）', async () => {
    const states: unknown[] = [];
    render(<VocabularyHub {...base} initial={{ view: 'detail', itemId: 'fi-bogus' }} onStateChange={(s) => states.push(s)} />);
    await waitFor(() => expect(screen.getByText(t.vocab.todayWordsHeading)).toBeTruthy());
    expect(states).toContainEqual({ view: 'top', category: null, itemId: null });
  });
});

describe('今日の3語フロー（§25-§26）', () => {
  it('画像カード→意味確認（タップ選択）→覚えた/まだ不安→次の語', async () => {
    render(<VocabularyHub {...base} initial={{ view: 'daily' }} />);
    await waitFor(() => expect(screen.getByText(t.vocab.dailyStep(1, 3))).toBeTruthy());
    // カード表示→確認へ
    fireEvent.click(screen.getByText(t.vocab.detailCheck));
    await waitFor(() => expect(screen.getByText(t.lab.check)).toBeTruthy());
    // 選択肢（意味）が3択・タップのみ
    const buttons = screen.getAllByRole('button').filter((b) => b.className.includes('border-2'));
    expect(buttons.length).toBe(3);
    fireEvent.click(buttons[0]);
    fireEvent.click(screen.getByText(t.lab.check));
    await waitFor(() => expect(screen.getByText(t.lab.next)).toBeTruthy());
    fireEvent.click(screen.getByText(t.lab.next));
    // 自己評価（§2: 評価前は次へ非表示・評価後に「次のことばへ」出現）
    await waitFor(() => expect(screen.getByText(t.vocab.selfPrompt)).toBeTruthy());
    expect(screen.queryByText(t.vocab.nextWord)).toBeNull();
    fireEvent.click(screen.getByText(t.vocab.selfKnownBtn));
    await waitFor(() => expect(screen.getByText(t.vocab.nextWord)).toBeTruthy());
    fireEvent.click(screen.getByText(t.vocab.nextWord));
    await waitFor(() => expect(screen.getByText(t.vocab.dailyStep(2, 3))).toBeTruthy());
  });
  it('決定的理由が表示される（架空AI分析なし）・同日は同じ3語', async () => {
    const r1 = render(<VocabularyHub {...base} initial={{ view: 'daily' }} />);
    await waitFor(() => expect(screen.getByText(t.vocab.dailyStep(1, 3))).toBeTruthy());
    expect(screen.getByText(t.vocab.reasons.core_a)).toBeTruthy();
    r1.unmount();
    // 再マウント（リロード相当）でも同じ日の3語は固定
    const raw = JSON.parse(window.sessionStorage.getItem('ai_course_vocab_preview_v1')!);
    expect(raw.dailyWords.itemIds.length).toBe(3);
    render(<VocabularyHub {...base} initial={{ view: 'daily' }} />);
    await waitFor(() => expect(screen.getByText(t.vocab.dailyStep(1, 3))).toBeTruthy());
    const raw2 = JSON.parse(window.sessionStorage.getItem('ai_course_vocab_preview_v1')!);
    expect(raw2.dailyWords.itemIds).toEqual(raw.dailyWords.itemIds);
  });
});

describe('順次ナビゲーション（§2-§3）', () => {
  it('詳細: 自己評価前はsticky内が2択・「次のことばへ」非表示、評価後に出現し次の動詞へ進む', async () => {
    render(<VocabularyHub {...base} initial={{ view: 'detail', category: 'verbs', itemId: 'fi-iku' }} />);
    await waitFor(() => expect(screen.getByText(t.vocab.selfPrompt)).toBeTruthy());
    expect(screen.queryByText(t.vocab.nextWord)).toBeNull();
    fireEvent.click(screen.getByText(t.vocab.selfKnownBtn));
    await waitFor(() => expect(screen.getByText(t.vocab.nextWord)).toBeTruthy());
    // 進行状況（動詞 1 / 27）と保存表示
    expect(screen.getByText(t.vocab.categoryProgress(t.vocab.catVerbs, 4, vocabByCategory(allVocabularyItems(), 'verbs').length))).toBeTruthy();
    expect(screen.getAllByText(new RegExp(t.vocab.savedNote)).length).toBeGreaterThanOrEqual(1);
    fireEvent.click(screen.getByText(t.vocab.nextWord));
    // 動詞一覧2番目（来る）へ・カテゴリ順維持
    await waitFor(() => expect(screen.getByText(t.vocab.categoryProgress(t.vocab.catVerbs, 5, vocabByCategory(allVocabularyItems(), 'verbs').length))).toBeTruthy());
    // 自己評価は変更可能・重複レコードなし（entriesは同一キー上書き）
    const raw = JSON.parse(window.sessionStorage.getItem('ai_course_vocab_preview_v1')!);
    expect(raw.entries['fi-iku'].selfAssessment).toBe('self_known');
  });
  it('カテゴリ最後の語では「一覧へ戻る」になり一覧へ遷移する', async () => {
    render(<VocabularyHub {...base} initial={{ view: 'detail', category: 'naAdj', itemId: vocabByCategory(allVocabularyItems(), 'naAdj').slice(-1)[0].id }} />);
    await waitFor(() => expect(screen.getByText(t.vocab.selfPrompt)).toBeTruthy());
    fireEvent.click(screen.getByText(t.vocab.needsReviewBtn));
    const back = await screen.findByText(t.vocab.backToList(t.vocab.catNaAdj));
    fireEvent.click(back);
    await waitFor(() => expect(screen.getByText('好き')).toBeTruthy()); // な形一覧
  });
  it('直接URL（カテゴリ文脈なし）でも同品詞カテゴリで安全に次へ進める（§3E）', async () => {
    render(<VocabularyHub {...base} initial={{ view: 'detail', itemId: 'fi-sumu' }} />);
    await waitFor(() => expect(screen.getByText(t.vocab.selfPrompt)).toBeTruthy());
    expect(screen.getByText(t.vocab.categoryProgress(t.vocab.catVerbs, 1, vocabByCategory(allVocabularyItems(), 'verbs').length))).toBeTruthy();
  });
});

describe('語彙会話練習（§7-§12）', () => {
  it('住む: CTA→開始画面（テーマ・最初の質問「今、どこに住んでいますか？」）→対象表現で応答が進む', async () => {
    render(<VocabularyHub {...base} initial={{ view: 'practice', itemId: 'fi-sumu' }} />);
    await waitFor(() => expect(screen.getByText(t.vocab.practiceTitle('住む'))).toBeTruthy());
    expect(screen.getByText('今住んでいる場所について話す')).toBeTruthy();
    expect(screen.getByText('今、どこに住んでいますか？')).toBeTruthy();
    fireEvent.click(screen.getByText(t.vocab.practiceStart));
    // starter質問が表示され、対象表現を含む回答で praise + followUp
    await waitFor(() => expect(screen.getAllByText('今、どこに住んでいますか？').length).toBeGreaterThanOrEqual(1));
    const input = screen.getByPlaceholderText(t.vocab.practiceInput);
    fireEvent.change(input, { target: { value: '東京に住んでいます' } });
    fireEvent.click(screen.getByText(t.vocab.practiceSend));
    await waitFor(() => expect(screen.getByText(t.vocab.practiceUsedTarget('に住んでいます'))).toBeTruthy());
    expect(screen.getByText('前は どこに住んでいましたか？')).toBeTruthy();
    // 会話・週進行・XPストアへ書かない（語彙storeのみ）
    expect(window.sessionStorage.getItem('ai_course_foundation_preview_v1')).toBeNull();
  });
  it('対象表現なしの回答にはヒント（〜を使って言ってみましょう）を返す', async () => {
    render(<VocabularyHub {...base} initial={{ view: 'practice', itemId: 'fi-iku' }} />);
    fireEvent.click(await screen.findByText(t.vocab.practiceStart));
    const input = screen.getByPlaceholderText(t.vocab.practiceInput);
    fireEvent.change(input, { target: { value: '横浜です' } });
    fireEvent.click(screen.getByText(t.vocab.practiceSend));
    await waitFor(() => expect(screen.getByText(t.vocab.practiceTryTarget('に行きます'))).toBeTruthy());
  });
  it('3P-3で全140語に練習が付いたため、旧・練習なし語（fi-kusuri）にもCTAが出る', async () => {
    // 虚偽CTA禁止（練習が無ければ出さない）のロジック自体は残っているが、
    // 実データに練習なし語が無くなったため、存在確認のみ行う
    render(<VocabularyHub {...base} initial={{ view: 'detail', category: 'nouns', itemId: 'fi-kusuri' }} />);
    await waitFor(() => expect(screen.getByText(t.vocab.detailUsage)).toBeTruthy());
    expect(screen.queryByText(t.vocab.practiceCta)).toBeTruthy();
  });
});

describe('目標・パック・レベル表示（§33-§46）', () => {
  it('トップに目標・現在のパック（実データ78語）・状態が表示される（内訳はロードマップへ・§26）', () => {
    render(<VocabularyHub {...base} />);
    expect(screen.getByText(t.vocab.goalHeading)).toBeTruthy();
    expect(screen.getAllByText(t.vocab.tracks.life_basic).length).toBeGreaterThanOrEqual(1); // 表示＋select option
    expect(screen.getByText('生活・会話の基礎')).toBeTruthy();
    expect(screen.getAllByText(new RegExp('0 / 78')).length).toBeGreaterThanOrEqual(1); // 実Item数から計算
    expect(screen.getByText(t.vocab.packStates.not_started)).toBeTruthy();
    expect(screen.getByText(`${t.vocab.viewRoadmap} →`)).toBeTruthy(); // 詳細内訳はロードマップで
  });
  it('目標をN2準備へ変更できる（推定根拠なしに自動確定しない・本人変更）', () => {
    render(<VocabularyHub {...base} />);
    fireEvent.change(screen.getByLabelText(t.vocab.changeGoal), { target: { value: 'n2_prep' } });
    expect(screen.getAllByText(t.vocab.tracks.n2_prep).length).toBeGreaterThanOrEqual(1);
    const raw = JSON.parse(window.sessionStorage.getItem('ai_course_vocab_preview_v1')!);
    expect(raw.settings.track).toBe('n2_prep');
  });
  it('transparent_same（中国）は意味近い注意＋読み確認ポイントを表示・false friend（先生）は注意表示', async () => {
    const r1 = render(<VocabularyHub {...base} initial={{ view: 'detail', itemId: 'fi-chugoku' }} />);
    await waitFor(() => expect(screen.getByText(t.vocab.cognateSame)).toBeTruthy());
    r1.unmount();
    render(<VocabularyHub {...base} initial={{ view: 'detail', itemId: 'fi-sensei' }} />);
    await waitFor(() => expect(screen.getByText(new RegExp(t.vocab.cognateDiff))).toBeTruthy());
  });
});

describe('語彙ロードマップ・診断（Phase 2D §9-§10・§20-§21）', () => {
  it('ロードマップ: 目標・現在パック・2本の分離バー・診断CTA・次のパック（N3準備）', async () => {
    window.sessionStorage.setItem('ai_course_vocab_preview_v1', JSON.stringify({ schemaVersion: 1, entries: {}, dailyWords: null, settings: { track: 'n2_prep', furigana: 'hard_only' } }));
    render(<VocabularyHub {...base} initial={{ view: 'roadmap' }} />);
    await waitFor(() => expect(screen.getAllByText(t.vocab.tracks.n2_prep).length).toBeGreaterThanOrEqual(1));
    expect(screen.getByText(t.vocab.n2Note)).toBeTruthy(); // N2の正直な表示（§9）
    expect(screen.getByText('生活・会話の基礎')).toBeTruthy();
    expect(screen.getByText('N3準備・語彙拡張')).toBeTruthy(); // 次のパック
    expect(screen.getByText(t.vocab.n3PackNote)).toBeTruthy(); // 公式語彙と誤解させない
    expect(screen.getAllByText(t.vocab.statStarted).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(t.vocab.statVerifiedLabel).length).toBeGreaterThanOrEqual(1); // 分離バー
    expect(screen.getByText(new RegExp(t.vocab.diagnosticCta))).toBeTruthy();
  });
  it('診断: タップ回答→次元別に記録（v1ストアはv2へ移行・自己申告と混在しない）', async () => {
    // v1形式で書いてもv2へ安全に移行される（§29移行テスト）
    window.sessionStorage.setItem('ai_course_vocab_preview_v1', JSON.stringify({ schemaVersion: 1, entries: {}, dailyWords: null, settings: { track: 'n2_prep', furigana: 'hard_only' } }));
    render(<VocabularyHub {...base} initial={{ view: 'diagnostic' }} />);
    await waitFor(() => expect(screen.getByText(t.lab.check)).toBeTruthy());
    // 次元ラベルが表示される（読み/意味/使い方等・§5）
    expect(Object.values(t.vocab.diagDims).some((label) => screen.queryByText(label as string))).toBe(true);
    // 1問回答（choice→確認）
    const choices = screen.getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') !== null);
    fireEvent.click(choices[0]);
    fireEvent.click(screen.getByText(t.lab.check));
    await waitFor(() => expect(screen.getByText(t.lab.next)).toBeTruthy());
    const raw = JSON.parse(window.sessionStorage.getItem('ai_course_vocab_preview_v1')!);
    expect(raw.schemaVersion).toBe(2);
    const diag = raw.diagnostics['pack-life-basic-1'];
    expect(Object.keys(diag).length).toBe(1);
    const entry = Object.values(diag)[0] as { dims: Record<string, string> };
    const dimStates = Object.values(entry.dims);
    expect(dimStates.length).toBe(1);
    expect(['confirmed', 'needs_review']).toContain(dimStates[0]);
  });
});
