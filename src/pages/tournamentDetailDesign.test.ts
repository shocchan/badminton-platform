// 大会詳細ページのデザイン決定を固定する（2026-08-24）。
//
// 【なぜテストにするか】
// 2026-08-14 に「原色で安っぽい・枠がバラバラ」というCEO指摘を受けて
// ネイビー1枚カードへ刷新した。ところがその変更は別ワークツリーのブランチに
// 入ったままデプロイ元から外れ、本番は紫グラデーション＋絵文字の旧版に戻っていた
// （CEO再指摘 2026-08-24）。同じ差し戻しを三度目にしないため、
// 「何をやめたか」をソースに対して機械で確かめる。
//
// 設計原則（CEO承認済み・memory: kawabado-detail-redesign）:
//   ①外枠はページに1つ。中は罫線区切り
//   ②レベル別の色分け廃止＝全大会ネイビー
//   ③強調色はアンバー1色。赤はエラー専用
//   ④アイコンは lucide 線画。**絵文字は使わない**
//   ⑤内側の角丸は外枠より小さい
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const page = readFileSync(join(__dirname, 'TournamentDetailPage.tsx'), 'utf8');
const css = readFileSync(join(__dirname, '../index.css'), 'utf8');

describe('ブランドトークン', () => {
  it('kb-navy / kb-blue が定義されている（クラス名だけあって色が無い、を防ぐ）', () => {
    for (const token of ['--color-kb-navy', '--color-kb-navy-soft', '--color-kb-blue', '--color-kb-blue-deep']) {
      expect(css, `${token} が index.css に無い`).toContain(token);
    }
  });

  it('ネイビーの実値が変わっていない', () => {
    expect(css).toContain('--color-kb-navy: #16324F');
  });
});

describe('大会詳細ページ', () => {
  it('ヘッダーがネイビー（紫グラデーションに戻っていない）', () => {
    expect(page, 'bg-kb-navy が無い＝刷新前に戻っている').toContain('bg-kb-navy');
    expect(page, '紫グラデーションのヘッダーは廃止した')
      .not.toMatch(/from-purple|via-purple|to-purple|bg-purple-6/);
  });

  it('情報行のアイコンは lucide 線画（絵文字を使わない）', () => {
    // 旧版は 📅🕐📍💰⚠️ を icon 文字列として並べていた
    for (const emoji of ['📅', '🕐', '📍', '💰', '⚠️', '👥', '💴']) {
      expect(page, `情報行に絵文字 ${emoji} が戻っている`).not.toContain(`icon: '${emoji}'`);
    }
    for (const icon of ['Calendar', 'Clock', 'MapPin', 'Wallet']) {
      expect(page, `lucide の ${icon} を使っていない`).toContain(icon);
    }
  });

  it('レベル別の色分けをしていない（全大会ネイビー）', () => {
    expect(page, 'levelConfig による色分けは詳細ページでは廃止した').not.toContain('levelConfig');
  });

  it('申込CTAが存在する（デザインを直して導線を消す、をしない）', () => {
    expect(page).toMatch(/この大会に申し込む|申し込む/);
  });

  it('締切は共通ロジックから引く（ページ内に14日をベタ書きしない）', () => {
    expect(page, '締切計算は entryDeadline に集約する').toContain("from '../lib/entryDeadline'");
    expect(page, 'ページ内で 14 日を直接引き算しない').not.toMatch(/getDate\(\)\s*-\s*14/);
  });

  it('検索向けのタグを落としていない（刷新でSEOを壊さない）', () => {
    for (const must of ['canonical', 'EventSchema', 'Breadcrumbs', 'Helmet']) {
      expect(page, `${must} が消えている`).toContain(must);
    }
  });
});
