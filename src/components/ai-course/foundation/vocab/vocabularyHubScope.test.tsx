// @vitest-environment jsdom
// B: 図鑑トップ再設計のUIテスト（ヘッダー・11フィルター＋検索・レベル別表示・RPG接続・ja/zh）。
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { VocabularyHub } from './VocabularyHub';
import { VocabularyHubHeader } from './VocabularyHubHeader';
import { aiCourseI18n } from '../../../../locales/aiCourse';
import { allVocabularyItems } from '../../../../lib/aiLesson/course/foundationVocabBank';
import { vocabCanonicalStats, unitLinksFor } from '../../../../lib/aiLesson/course/vocabCanonical';
import { aggregateCognates } from '../../../../lib/aiLesson/course/vocabularyPacks';

afterEach(cleanup);
beforeEach(() => { window.sessionStorage.clear(); });
const t = aiCourseI18n.ja;
const tz = aiCourseI18n.zh;
const base = { t, onBack: () => {}, onGoConversation: () => {}, labPreview: false };
const stats = vocabCanonicalStats();
const emptyCounts = { unseen: stats.total, learning: 0, reviewing: 0, retained_candidate: 0 } as const;
const emptyCompletion = {
  requiredConfirmed: 0, requiredTotal: stats.roles.required,
  highRiskConfirmed: 0, highRiskTotal: stats.highRisk,
  requiredUsed: 0, requiredReviewConnected: 0, complete: false,
} as const;

describe('VocabularyHubHeader（純表示・ハーネス単体レンダリング可能）', () => {
  it('タイトル・スコープ・内訳・進捗・状態・免責・書庫の位置づけを表示する', () => {
    render(<VocabularyHubHeader t={t} stats={stats} stateCounts={{ ...emptyCounts }}
      completion={{ ...emptyCompletion }} tier="beginner" />);
    expect(screen.getByText(t.vocabScope.scopeTitle)).toBeTruthy();
    expect(screen.getByText(t.vocabScope.scopeSub(stats.total))).toBeTruthy();
    expect(screen.getByText(t.vocabScope.breakdown(stats.foundation, stats.n3Prep))).toBeTruthy();
    expect(screen.getByText(t.vocabScope.started(0, stats.total))).toBeTruthy();
    expect(screen.getByText(`${t.vocabScope.stateUnseen} ${stats.total}`)).toBeTruthy();
    expect(screen.getByText(t.vocabScope.disclaimer(stats.total))).toBeTruthy();
    expect(screen.getByText(t.vocabScope.libraryNote)).toBeTruthy();
  });
  it('「全部終えた」の定義4条件を数値で表示する（カードを開いた数ではない）', () => {
    render(<VocabularyHubHeader t={t} stats={stats} stateCounts={{ ...emptyCounts }}
      completion={{ ...emptyCompletion }} tier="beginner" />);
    expect(screen.getByText(`・${t.vocabScope.doneDefConfirm(0, stats.roles.required)}`)).toBeTruthy();
    expect(screen.getByText(`・${t.vocabScope.doneDefHighRisk(0, stats.highRisk)}`)).toBeTruthy();
    expect(screen.getByText(`・${t.vocabScope.doneDefUse(0, stats.roles.required)}`)).toBeTruthy();
    expect(screen.getByText(`・${t.vocabScope.doneDefReview(0, stats.roles.required)}`)).toBeTruthy();
  });
  it('上級ティアだけ上級者向け案内を表示（beginnerでは出さない）', () => {
    const { rerender } = render(<VocabularyHubHeader t={t} stats={stats} stateCounts={{ ...emptyCounts }}
      completion={{ ...emptyCompletion }} tier="beginner" />);
    expect(screen.queryByText(t.vocabScope.advancedNotice)).toBeNull();
    rerender(<VocabularyHubHeader t={t} stats={stats} stateCounts={{ ...emptyCounts }}
      completion={{ ...emptyCompletion }} tier="advanced" />);
    expect(screen.getByText(t.vocabScope.advancedNotice)).toBeTruthy();
    expect(screen.getByText(t.vocabScope.advancedLinks)).toBeTruthy();
  });
  it('N3ティアはN3準備からの案内を表示', () => {
    render(<VocabularyHubHeader t={t} stats={stats} stateCounts={{ ...emptyCounts }}
      completion={{ ...emptyCompletion }} tier="n3" />);
    expect(screen.getByText(t.vocabScope.n3Notice)).toBeTruthy();
  });
  it('zhでは中国語のスコープ文言になる', () => {
    render(<VocabularyHubHeader t={tz} stats={stats} stateCounts={{ ...emptyCounts }}
      completion={{ ...emptyCompletion }} tier="beginner" />);
    expect(screen.getByText(tz.vocabScope.scopeTitle)).toBeTruthy();
    expect(screen.getByText(tz.vocabScope.disclaimer(stats.total))).toBeTruthy();
  });
});

describe('図鑑トップの統合（ヘッダー＋11フィルター＋検索併用）', () => {
  it('トップにヘッダーとフィルター11種・検索欄が並ぶ（触るまで一覧は出さない）', () => {
    render(<VocabularyHub {...base} />);
    expect(screen.getByText(t.vocabScope.scopeTitle)).toBeTruthy();
    expect(screen.getByText(t.vocabScope.filterHeading)).toBeTruthy();
    for (const label of Object.values(t.vocabScope.filters)) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
    expect(screen.getByPlaceholderText(t.vocabScope.searchInFilter)).toBeTruthy();
    // 触るまで件数・一覧は出さない（トップを長大化させない）
    expect(screen.queryByText(t.vocabScope.resultCount(allVocabularyItems().length))).toBeNull();
  });
  it('「同形語注意」を押すとfalse friendの実数で絞り込まれる', () => {
    render(<VocabularyHub {...base} />);
    fireEvent.click(screen.getByRole('button', { name: t.vocabScope.filters.falseFriend }));
    const n = aggregateCognates(allVocabularyItems()).false_friend;
    expect(screen.getByText(t.vocabScope.resultCount(n))).toBeTruthy();
  });
  it('フィルターと検索の併用で0件になったら空メッセージを出す', () => {
    render(<VocabularyHub {...base} />);
    fireEvent.click(screen.getByRole('button', { name: t.vocabScope.filters.falseFriend }));
    fireEvent.change(screen.getByPlaceholderText(t.vocabScope.searchInFilter), { target: { value: 'zzzzz' } });
    expect(screen.getByText(t.vocabScope.emptyResult)).toBeTruthy();
  });
  it('検索だけでも一覧が出る（例:「水」）', () => {
    render(<VocabularyHub {...base} />);
    fireEvent.change(screen.getByPlaceholderText(t.vocabScope.searchInFilter), { target: { value: '水' } });
    expect(screen.getByRole('button', { name: '水' })).toBeTruthy();
  });
  it('「覚えた（自己申告）」フィルターには申告であることの注記が付く', () => {
    render(<VocabularyHub {...base} />);
    fireEvent.click(screen.getByRole('button', { name: t.vocabScope.filters.selfKnown }));
    expect(screen.getByText(t.vocabScope.selfKnownNote)).toBeTruthy();
    expect(screen.getByText(t.vocabScope.resultCount(0))).toBeTruthy();
  });
  it('learnerLevel=N2で上級者向け案内がトップに出る', () => {
    render(<VocabularyHub {...base} learnerLevel="N2" />);
    expect(screen.getByText(t.vocabScope.advancedNotice)).toBeTruthy();
  });
  it('zhロケール: フィルターも中国語で表示される', () => {
    render(<VocabularyHub {...base} t={tz} />);
    expect(screen.getByRole('button', { name: tz.vocabScope.filters.all })).toBeTruthy();
    expect(screen.getByRole('button', { name: tz.vocabScope.filters.falseFriend })).toBeTruthy();
    expect(screen.getByText(tz.vocabScope.scopeTitle)).toBeTruthy();
  });
  it('jaトップの既存3ブロック（パック・今日・カテゴリー）は残る', () => {
    render(<VocabularyHub {...base} />);
    expect(screen.getByText(t.vocab.packHeading)).toBeTruthy();
    expect(screen.getByText(t.vocab.todayWordsHeading)).toBeTruthy();
    expect(screen.getByText(t.vocab.categoriesHeading)).toBeTruthy();
  });
});

describe('詳細画面のRPG接続（この語を使う場所・実データのみ）', () => {
  it('カードを開くと実在の単元名で「この語を使う場所」が出る', () => {
    const item = allVocabularyItems()[0];
    const links = unitLinksFor(item.id);
    expect(links.length).toBeGreaterThan(0);
    render(<VocabularyHub {...base} initial={{ view: 'detail', itemId: item.id }} />);
    expect(screen.getByText(t.vocabScope.whereUsed)).toBeTruthy();
    // 単元タイトル（実データ）が含まれる
    const first = links[0];
    expect(screen.getByText(new RegExp(first.spec.titleJa))).toBeTruthy();
  });
  it('zhでは単元タイトルがzhで出る', () => {
    const item = allVocabularyItems()[0];
    const first = unitLinksFor(item.id)[0];
    render(<VocabularyHub {...base} t={tz} initial={{ view: 'detail', itemId: item.id }} />);
    expect(screen.getByText(tz.vocabScope.whereUsed)).toBeTruthy();
    expect(screen.getByText(new RegExp(first.spec.titleZh))).toBeTruthy();
  });
});
