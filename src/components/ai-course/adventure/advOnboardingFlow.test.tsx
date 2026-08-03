// @vitest-environment jsdom
// CEO報告の3点（2026-08-03）を固定する。
//   1. 選んだ相棒が、そのあと一度も出てこない
//   2. 診断に作文があって、日本語を入力できない人が入口で詰まる
//   3. 診断のあと「冒険の準備をしています…」から進まない

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { COMPANIONS, companionById, companionSvg } from '../../../lib/aiLesson/course/adventure/advCompanion';

const src = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');
const SHELL = src('src/components/ai-course/adventure/AdvShell.tsx');
const ONBOARDING = src('src/components/ai-course/adventure/AdvOnboarding.tsx');

describe('1. 選んだ相棒が学習画面に出る', () => {
  it('相棒3種すべてに、名前・挨拶・絵がある', () => {
    expect(COMPANIONS.length).toBe(3);
    for (const c of COMPANIONS) {
      expect(c.nameJa, c.id).toBeTruthy();
      expect(c.nameZh, c.id).toBeTruthy();
      expect(c.greetJa, c.id).toBeTruthy();
      expect(c.greetZh, c.id).toBeTruthy();
      expect(companionSvg(c.id), c.id).toContain('<svg');
    }
  });

  it('未選択でも既定の相棒が返る（画面が空にならない）', () => {
    expect(companionById(null).id).toBeTruthy();
    expect(companionById(undefined).nameJa).toBeTruthy();
  });

  it('今日の冒険の画面が、相棒を実際に描いている', () => {
    // 「保存しているだけで誰も読んでいない」状態に戻らないようにする
    expect(SHELL).toContain('CompanionLine');
    expect(SHELL).toMatch(/companionSvg/);
    expect(SHELL).toMatch(/prof\.companionId/);
  });
});

describe('2. 診断に作文を置かない', () => {
  it('作文の入力欄と設問が残っていない', () => {
    expect(ONBOARDING).not.toContain('CONV_PROMPTS');
    expect(ONBOARDING).not.toContain('日本語で書いてみましょう');
    expect(ONBOARDING).not.toContain('書くのはスキップ');
    expect(ONBOARDING).not.toContain('<textarea');
  });

  it('診断の案内文が、作文があるように読めない', () => {
    // 「第2戦：日本語で2文だけ書く」が残っていて、入力できない人を不安にさせていた
    expect(ONBOARDING).not.toContain('第2戦');
    expect(ONBOARDING).not.toContain('2文だけ書く');
    expect(ONBOARDING).toContain('日本語の入力はありません');
  });

  it('診断の段階に conv が無い（12問のあとは攻略ルートへ）', () => {
    const phases = ONBOARDING.match(/^type Phase = (.+);$/m)?.[1] ?? '';
    expect(phases, 'Phase 定義が見つからない').not.toBe('');
    expect(phases).not.toContain("'conv'");
    expect(phases).toContain("'route'");
  });
});

describe('3. 今日の冒険が読み込めないまま止まらない', () => {
  it('取得の依存が、オブジェクトの同一性ではなく中身の鍵になっている', () => {
    // profile.route / profile.mastery は render のたびに作り直されるので、
    // そのまま依存にすると取得が毎回キャンセルされて quest が null のまま止まる
    expect(SHELL).toContain('routeKey');
    expect(SHELL).toContain('masteryKey');
    expect(SHELL).not.toMatch(/\[needsOnboarding, profile\?\.route, profile\?\.mastery/);
  });

  it('取得に失敗したら、読み込み中ではなくやり直せる案内を出す', () => {
    expect(SHELL).toContain('questFailed');
    expect(SHELL).toContain('もう一度読み込む');
    // 失敗を黙って握りつぶす形（早期 return だけ）に戻っていないこと
    expect(SHELL).not.toContain('if (!ctRes.ok) return;');
  });
});
