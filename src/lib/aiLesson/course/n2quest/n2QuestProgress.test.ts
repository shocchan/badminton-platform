// N2攻略の進捗・決定的シャッフル・使用練習判定のテスト（FOREST FIRST §10-§11）。
import { describe, it, expect } from 'vitest';
import {
  readItemProgress, markRecognized, markProduced, itemDone, unitQuestProgress,
  shuffleRecognition, productionUsesTarget, N2_QUEST_KEY_PREFIX,
} from './n2QuestProgress';
import { N2_GRAMMAR_DRAFTS } from '../n2GrammarDrafts';

const memStore = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    keys: () => [...m.keys()],
  };
};

describe('N2ItemProgress（localStorageのみ・自動昇格なし）', () => {
  it('未学習→recognized→producedの順に進み、二重markで時刻が上書きされない', () => {
    const s = memStore();
    expect(readItemProgress(s, 'n2g-001')).toEqual({ recognizedAtMs: null, producedAtMs: null });
    markRecognized(s, 'n2g-001', 100);
    markRecognized(s, 'n2g-001', 999);
    expect(readItemProgress(s, 'n2g-001').recognizedAtMs).toBe(100);
    expect(itemDone(s, 'n2g-001')).toBe(false);
    markProduced(s, 'n2g-001', 200);
    expect(itemDone(s, 'n2g-001')).toBe(true);
    expect(s.keys()).toEqual([N2_QUEST_KEY_PREFIX + 'n2g-001']);
  });

  it('壊れた保存値は「未学習」として扱う（行き止まりにしない）', () => {
    const s = memStore();
    s.setItem(N2_QUEST_KEY_PREFIX + 'n2g-002', '{broken');
    expect(readItemProgress(s, 'n2g-002')).toEqual({ recognizedAtMs: null, producedAtMs: null });
  });

  it('unitQuestProgress: 全項目完了でcomplete', () => {
    const s = memStore();
    const items = [{ grammarId: 'a' }, { grammarId: 'b' }];
    expect(unitQuestProgress(s, items)).toEqual({ done: 0, total: 2, complete: false });
    markRecognized(s, 'a', 1); markProduced(s, 'a', 2);
    markRecognized(s, 'b', 3); markProduced(s, 'b', 4);
    expect(unitQuestProgress(s, items)).toEqual({ done: 2, total: 2, complete: true });
  });
});

describe('shuffleRecognition（決定的・正解保存）', () => {
  it('同じgrammarIdなら常に同じ並び・正解の中身は不変', () => {
    const opts = ['正解', 'ダミー1', 'ダミー2', 'ダミー3'];
    const a = shuffleRecognition('n2g-010', opts, 0);
    const b = shuffleRecognition('n2g-010', opts, 0);
    expect(a).toEqual(b);
    expect(a.options[a.answerIndex]).toBe('正解');
    expect([...a.options].sort()).toEqual([...opts].sort());
  });

  it('全180件で正解位置が特定位置へ偏らない（answerIndex=0固定の答え漏洩を防ぐ）', () => {
    const counts = [0, 0, 0, 0];
    for (const d of N2_GRAMMAR_DRAFTS) {
      const s = shuffleRecognition(d.grammarId, d.recognition.options, d.recognition.answerIndex);
      expect(s.options[s.answerIndex]).toBe(d.recognition.options[d.recognition.answerIndex]);
      counts[s.answerIndex]++;
    }
    // 4択で最頻位置が全体の半分を超えない（決定的だが位置が散る）
    expect(Math.max(...counts)).toBeLessThan(N2_GRAMMAR_DRAFTS.length / 2);
    expect(counts.every(c => c > 0)).toBe(true);
  });
});

describe('productionUsesTarget（使えたことを認める判定）', () => {
  const draft = { production: { promptJa: '', promptZh: '', expected: ['〜にあたって'], acceptable: ['にあたり'] } };
  it('expected/acceptableのいずれかを含めば true（〜は除去して照合）', () => {
    expect(productionUsesTarget(draft, '新生活を始めるにあたって、準備をしました。')).toBe(true);
    expect(productionUsesTarget(draft, '開店にあたり、ご挨拶します。')).toBe(true);
  });
  it('含まなければ false・空入力も false', () => {
    expect(productionUsesTarget(draft, '今日はいい天気です。')).toBe(false);
    expect(productionUsesTarget(draft, '   ')).toBe(false);
  });
  it('matchKeysも照合に使う（活用で語尾が変わる文型）', () => {
    const d2 = { production: { promptJa: '', promptZh: '', expected: ['〜ざるを得ない'], acceptable: [] }, matchKeys: ['ざるを得'] };
    expect(productionUsesTarget(d2, '行かざるを得なかった。')).toBe(true);
  });
});
