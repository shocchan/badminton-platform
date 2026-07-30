// @vitest-environment jsdom
// Phase B-2 検収: 会話文脈140語が「データにある」だけでなく、
// 実際のlearner runtime（VocabularyHubの練習画面）から読み出されていることを固定する。
//
// データ側の網羅・重複・訳漏れは conversationContextual.test.ts が担保する。
// こちらは「画面に出るか」「対象語固有の文脈が出るか」「ja/zhが切り替わるか」
// 「対象表現を使うと会話が進むか」を、正準分類から選んだ代表語で実証する。
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { VocabularyHub } from './VocabularyHub';
import { aiCourseI18n } from '../../../../locales/aiCourse';
import { allVocabularyItems } from '../../../../lib/aiLesson/course/foundationVocabBank';
import { N3_ITEMS } from '../../../../lib/aiLesson/course/foundationVocabN3';
import { levelMetaOf } from '../../../../lib/aiLesson/course/vocabularyLevelMeta';
import { practiceForItem } from '../../../../lib/aiLesson/course/vocabConversationPractice';
import type { FoundationItem } from '../../../../lib/aiLesson/course/foundationVocab';

afterEach(cleanup);
beforeEach(() => { window.sessionStorage.clear(); window.localStorage.clear(); });

const items = allVocabularyItems();
const n3Ids = new Set(N3_ITEMS.map((i) => i.id));
// 同じ語が複数分類の代表になると「8分類を見た」が嘘になるので、選んだ語は次から除外する。
const taken = new Set<string>();
const first = (pred: (i: FoundationItem) => boolean): FoundationItem => {
  const hit = items.find((i) => !taken.has(i.id) && pred(i));
  if (!hit) throw new Error('代表語が正準データに存在しない（分類変更時はこのテストを見直す）');
  taken.add(hit.id);
  return hit;
};

/** 正準分類から代表語を選ぶ。ID直書きにすると分類変更で嘘のPASSになるため、条件で引く。 */
const REPRESENTATIVES: { label: string; item: FoundationItem }[] = [
  { label: 'foundation動詞', item: first((i) => !n3Ids.has(i.id) && i.partOfSpeech === 'verb') },
  { label: 'foundation名詞', item: first((i) => !n3Ids.has(i.id) && i.partOfSpeech === 'noun') },
  { label: 'foundationい形容詞', item: first((i) => !n3Ids.has(i.id) && i.partOfSpeech === 'iAdj') },
  { label: 'foundationな形容詞', item: first((i) => !n3Ids.has(i.id) && i.partOfSpeech === 'naAdj') },
  { label: 'N3語', item: first((i) => n3Ids.has(i.id)) },
  { label: 'false friend', item: first((i) => levelMetaOf(i.id).cognate === 'false_friend') },
  { label: 'partial overlap（部分重なり）', item: first((i) => levelMetaOf(i.id).cognate === 'partial_overlap') },
  { label: '日本語固有語（高リスク）', item: first((i) => levelMetaOf(i.id).cognate === 'japanese_specific') },
];

describe('会話文脈のruntime接続（Phase B-2 検収）', () => {
  it('代表8分類をすべて別々の語で検証している（同じ語の使い回しではない）', () => {
    expect(REPRESENTATIVES).toHaveLength(8);
    const ids = REPRESENTATIVES.map((r) => r.item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const { label, item } of REPRESENTATIVES) {
    it(`${label}（${item.id}）: 練習画面に「その語だけの」文脈がruntimeから出る`, () => {
      const practice = practiceForItem(item.id);
      expect(practice).toBeTruthy();
      render(<VocabularyHub t={aiCourseI18n.ja} onBack={() => {}} initial={{ view: 'practice', itemId: item.id }} />);
      // データ由来のtheme/starterが画面に出ている＝genericへ落ちていない
      expect(screen.getByText(practice!.themeJa)).toBeTruthy();
      expect(screen.getByText(practice!.starterQuestionJa)).toBeTruthy();
    });

    it(`${label}（${item.id}）: 中国語表示では中国語の文脈が出る`, () => {
      const practice = practiceForItem(item.id)!;
      render(<VocabularyHub t={aiCourseI18n.zh} onBack={() => {}} initial={{ view: 'practice', itemId: item.id }} />);
      expect(screen.getByText(practice.themeZh)).toBeTruthy();
      expect(screen.getByText(practice.starterQuestionZh)).toBeTruthy();
    });
  }

  it('対象表現を使うと会話が進み、followUpがそのまま出る（fallbackに落ちない）', () => {
    const item = REPRESENTATIVES[0].item;
    const practice = practiceForItem(item.id)!;
    render(<VocabularyHub t={aiCourseI18n.ja} onBack={() => {}} initial={{ view: 'practice', itemId: item.id }} />);
    fireEvent.click(screen.getByText(aiCourseI18n.ja.vocab.practiceStart));
    // 開始直後はstarterがAI発話として出る
    expect(screen.getAllByText(practice.starterQuestionJa).length).toBeGreaterThanOrEqual(1);
    const box = document.querySelector('input, textarea') as HTMLInputElement;
    expect(box).toBeTruthy();
    fireEvent.change(box, { target: { value: `わたしは${practice.targetExpressions[0].replace('〜', '')}` } });
    const form = box.closest('form');
    if (form) fireEvent.submit(form); else fireEvent.keyDown(box, { key: 'Enter', code: 'Enter' });
    // 対象表現を使えたので、その語のfollowUp（generic文言ではない）へ進む
    expect(screen.getAllByText(practice.followUpQuestionJa).length).toBeGreaterThanOrEqual(1);
  });

  it('全140語が練習画面へ到達できる（itemById未登録による黙殺なし）', () => {
    const known = new Set(items.map((i) => i.id));
    const unreachable = [...known].filter((id) => !practiceForItem(id));
    expect(unreachable).toEqual([]);
    expect(known.size).toBe(140);
  });
});
