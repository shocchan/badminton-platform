// @vitest-environment jsdom
// 「自分の文章で復習」の画面が、実際に発行するパックで動くかを確かめる。
// 見たいのは3つ: 出題が出る／答えると記録が保存される／冒険のプロファイルを壊さない。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AdvPersonalPackRunner } from './AdvPersonalPackRunner';
import { defaultAdvProfile } from '../../../lib/aiLesson/course/adventure/advProfile';
import {
  restorePersonalPacks, recordFor,
} from '../../../lib/aiLesson/course/adventure/personal/advPersonalPack';
import type { AdventureV2Profile } from '../../../lib/aiLesson/course/adventure/advTypes';

const raw = JSON.parse(readFileSync(
  join(import.meta.dirname, '../../../../docs/ai-course/personal-packs/summer-20260824.json'), 'utf8',
));

const profileWithPack = (): AdventureV2Profile => ({
  ...defaultAdvProfile('2026-08-24T00:00:00.000Z'),
  enabled: true,
  personalPacks: restorePersonalPacks([raw]),
});

describe('自分の文章で復習（個人パック）', () => {
  afterEach(cleanup);

  it('広場に今日の復習と本文の入口が出る', () => {
    render(<AdvPersonalPackRunner lang="ja" profile={profileWithPack()} onSave={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByRole('heading', { name: raw.titleJa })).toBeTruthy();
    expect(screen.getByRole('button', { name: /今日の復習をする/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /自分の文章を読み返す/ })).toBeTruthy();
  });

  it('自分の文章を読み返せる（本文がそのまま出る）', () => {
    render(<AdvPersonalPackRunner lang="ja" profile={profileWithPack()} onSave={vi.fn()} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /自分の文章を読み返す/ }));
    // 見出しにも本文にも出るので、本文が出ていることだけを確かめる
    expect(screen.getByText(/娘とたくさん遊ぶことができて/)).toBeTruthy();
  });

  it('答えると正誤が出て、その1問ぶんだけが記録される（冒険側は変わらない）', () => {
    const prof = profileWithPack();
    const onSave = vi.fn();
    render(<AdvPersonalPackRunner lang="ja" profile={prof} onSave={onSave} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /今日の復習をする/ }));

    const first = prof.personalPacks[0]!.items[0]!;
    fireEvent.click(screen.getByRole('button', { name: first.answer }));

    expect(screen.getByText('正解！')).toBeTruthy();
    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0]![0] as AdventureV2Profile;
    expect(recordFor(saved.personalPack, prof.personalPacks[0]!.packId, first.id))
      .toMatchObject({ attempts: 1, correct: 1, streak: 1 });
    // 冒険の値には触れない
    expect(saved.xp).toBe(prof.xp);
    expect(saved.mastery).toBe(prof.mastery);
    expect(saved.route).toBe(prof.route);
    expect(saved.streak).toBe(prof.streak);
    expect(saved.personalPacks).toBe(prof.personalPacks);
  });

  it('中国語でも日本語のUI文言が残らない（主要ラベル）', () => {
    render(<AdvPersonalPackRunner lang="zh" profile={profileWithPack()} onSave={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByRole('button', { name: /开始今天的复习/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /重读自己的作文/ })).toBeTruthy();
  });
});
