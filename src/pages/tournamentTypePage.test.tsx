// @vitest-environment jsdom
// 種目別の恒常ページ（2026-08-24）。
//
// 【このページが解いている問題】
// 大会は終わるとトップの一覧から消える＝開催するほど資産が消えていく。
// 「ミックスダブルス 大会 埼玉」のような種目＋地域の検索に受け皿が無かった。
//
// 【固定したいこと】
// 1. ルート順: `tournaments/singles` が `tournaments/:id` に吸われない
// 2. 開催予定が上、過去は畳んで下（＝過去大会で今の大会が見えづらくならない）
// 3. **参加人数を出さない**（実績が薄い時期に「参加0人」を出さない）
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TOURNAMENT_TYPES, tournamentTypeBySlug, tournamentTypeByEventType } from '../lib/tournamentTypes';

afterEach(cleanup);

const app = readFileSync(join(__dirname, '../App.tsx'), 'utf8');
const page = readFileSync(join(__dirname, 'TournamentTypePage.tsx'), 'utf8');
/** コメントを除いたコード部分（「〜は出さない」と書いた説明文を誤検出しないため） */
const pageCode = page
  .split('\n')
  .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
  .join('\n');

describe('ルート順（吸われないこと）', () => {
  it('種目のルートが tournaments/:id より前にある', () => {
    const idIdx = app.indexOf('path="tournaments/:id"');
    expect(idIdx, 'tournaments/:id のルートが無い').toBeGreaterThan(-1);
    for (const t of TOURNAMENT_TYPES) {
      const slugIdx = app.indexOf(`path="tournaments/${t.slug}"`);
      expect(slugIdx, `tournaments/${t.slug} のルートが無い`).toBeGreaterThan(-1);
      expect(slugIdx, `tournaments/${t.slug} が :id より後ろにあると :id に吸われる`).toBeLessThan(idIdx);
    }
  });

  it('全種目にルートがある（定義だけ足してルートを忘れる、を防ぐ）', () => {
    for (const t of TOURNAMENT_TYPES) {
      expect(app).toContain(`slug="${t.slug}"`);
    }
  });
});

describe('種目の定義', () => {
  it('slug から引ける', () => {
    for (const t of TOURNAMENT_TYPES) {
      expect(tournamentTypeBySlug(t.slug)?.eventType).toBe(t.eventType);
    }
    expect(tournamentTypeBySlug('unknown')).toBeNull();
    expect(tournamentTypeBySlug(undefined)).toBeNull();
  });

  it('DBの event_type から引ける（大会詳細から戻すため）', () => {
    for (const t of TOURNAMENT_TYPES) {
      expect(tournamentTypeByEventType(t.eventType)?.slug).toBe(t.slug);
    }
    expect(tournamentTypeByEventType('存在しない種目')).toBeNull();
  });

  it('ja/zh の両方が埋まっている（中国語画面に日本語が出ない）', () => {
    for (const t of TOURNAMENT_TYPES) {
      for (const field of [t.name, t.title, t.description, t.h1, t.lead]) {
        expect(field.ja.length, `${t.slug} の ja が空`).toBeGreaterThan(0);
        expect(field.zh.length, `${t.slug} の zh が空`).toBeGreaterThan(0);
        expect(field.ja, `${t.slug}: ja と zh が同じ＝訳し忘れ`).not.toBe(field.zh);
      }
      expect(t.faq.length, `${t.slug} にFAQが無い`).toBeGreaterThan(0);
      expect(t.facts.length, `${t.slug} に参加条件が無い`).toBeGreaterThan(0);
    }
  });
});

describe('過去大会で今の大会を埋もれさせない', () => {
  it('開催予定の見出しが、過去の開催より前にある', () => {
    const upcoming = page.indexOf("'開催予定'");
    const pastBlock = page.indexOf('これまでの開催');
    expect(upcoming).toBeGreaterThan(-1);
    expect(pastBlock).toBeGreaterThan(-1);
    expect(upcoming, '過去の開催が開催予定より上にある').toBeLessThan(pastBlock);
  });

  it('過去の開催は <details> で畳む', () => {
    expect(page, '畳まないと過去大会がページを占有する').toMatch(/<details[\s\S]{0,400}これまでの開催/);
  });

  it('過去の表示件数に上限がある', () => {
    expect(page).toContain('MAX_PAST_SHOWN');
    expect(page, '上限を超えたぶんは件数だけ伝える').toMatch(/past\.length > MAX_PAST_SHOWN/);
  });
});

describe('出さない数字', () => {
  it('参加人数・申込数を表示しない', () => {
    for (const ng of ['entryCount', 'entries.length', '参加人数', '申込数', '参加者数']) {
      expect(pageCode, `実績が薄い時期に ${ng} を出すべきでない`).not.toContain(ng);
    }
  });
});

describe('描画', () => {
  it('見出しと参加条件が出る', async () => {
    const { TournamentTypePage } = await import('./TournamentTypePage');
    render(
      <MemoryRouter initialEntries={['/ja/tournaments/singles']}>
        <HelmetProvider>
          <TournamentTypePage slug="singles" />
        </HelmetProvider>
      </MemoryRouter>,
    );
    expect(screen.getByText('シングルス大会（川口・蕨）')).toBeTruthy();
    expect(screen.getByText('参加のしかた')).toBeTruthy();
  });

  it('中国語では中国語で出る', async () => {
    const { TournamentTypePage } = await import('./TournamentTypePage');
    const { LanguageProvider } = await import('../contexts/LanguageContext');
    render(
      <MemoryRouter initialEntries={['/zh/tournaments/mixed-doubles']}>
        <HelmetProvider>
          <LanguageProvider>
            <TournamentTypePage slug="mixed-doubles" />
          </LanguageProvider>
        </HelmetProvider>
      </MemoryRouter>,
    );
    expect(screen.getByText('混合双打比赛（川口・蕨）')).toBeTruthy();
  });
});
