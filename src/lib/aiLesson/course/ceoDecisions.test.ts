// CEO判断（2026-07-30）の反映と、開いたままの人間ゲートの機械検証（§22）。
import { describe, it, expect } from 'vitest';
import decisions from '../../../../docs/ai-course/decisions/ceo-decisions-20260730.json';
import { aiCourseI18n } from '../../../locales/aiCourse';
import { WORLD_AREAS } from './rpg/worldAtlas';
import { CHAPTER1_LOCATIONS } from './rpg/chapter1Data';

const scanStrings = (obj: unknown, out: string[] = []): string[] => {
  if (typeof obj === 'string') { out.push(obj); return out; }
  if (typeof obj === 'function') return out;
  if (obj && typeof obj === 'object') for (const v of Object.values(obj)) scanStrings(v, out);
  return out;
};
const allDictStrings = [...scanStrings(aiCourseI18n.ja), ...scanStrings(aiCourseI18n.zh)];

describe('CEO決定の記録（decided/openの分離）', () => {
  it('主要判断がdecided/completedとして記録されている', () => {
    expect(decisions.decided.staging_whole_product_check).toBe('completed');
    expect(decisions.decided.world_name.value).toBe('ミナモ列島');
    expect(decisions.decided.chapter1_name.value).toBe('霧の港町');
    expect(decisions.decided.area_names.values).toHaveLength(10);
    expect(decisions.decided.n2_merge.merged['n2g-024']).toBe('n2g-023');
    expect(decisions.decided.n2_merge.merged['n2g-104']).toBe('n2g-102');
    expect(decisions.decided.materials_beta.status).toBe('provisionally_accepted_for_beta');
    expect(decisions.decided.visual_beta.status).toBe('provisionally_accepted_for_beta');
    expect(decisions.decided.support_channel.scopeA_learnerApp.value).toBe('info@kawabado.com');
  });
  it('人間しか閉じられないゲートはopenのまま（「全ゲート完了」と記録しない）', () => {
    // legal / 実機 / 本番承認 は人間の作業と判断が必須。AIの作業では閉じられない
    expect(decisions.openGates.legal).toBe('open');
    expect(decisions.openGates.physical_device_formal_verification).toBe('open');
    expect(decisions.openGates.production_approval).toBe('open');
    expect(decisions.notAllGatesComplete).toBe(true);
    expect(decisions.augustPilotProgram.allFiveComplete).toBe(false);
    // 5ゲート未完のうちはPhase B（8時間Sprint）を開始したと記録してはならない
    expect(decisions.augustPilotProgram.phaseB_started).toBe(false);
  });
  it('remote系ゲートの「closed」は実測evidenceが揃っている場合だけ許す', () => {
    // 2026-07-30に APPLY_SHARED_SUPABASE_MIGRATIONS を受けて実際に適用・検証した。
    // 「closedと書いたのに根拠がない」状態を防ぐため、closedならevidenceの実在を必須にする。
    const closable = ['remote_migration', 'remote_rls_verification'] as const;
    const g1 = decisions.augustPilotProgram.gate1_remote_db_rls_sync;
    for (const key of closable) {
      const v = decisions.openGates[key];
      expect(/^(open|closed_\d{4}-\d{2}-\d{2})$/.test(v), `${key} の値が不正: ${v}`).toBe(true);
      if (v === 'open') continue;
      expect(decisions.augustPilotProgram.approvalReceived).toBe('APPLY_SHARED_SUPABASE_MIGRATIONS');
      expect(g1.status).toBe('COMPLETE');
      expect(g1.evidence.appliedVersions).toEqual(['20260728000000', '20260728010000', '20260729000000']);
      expect(g1.evidence.remoteRlsMatrix).toMatch(/27\/27 PASS/);
      expect(g1.evidence.remoteSyncE2E).toMatch(/19\/19 PASS/);
      expect(g1.evidence.backupBeforeApply.length).toBeGreaterThan(0);
      // 既存learnerデータを壊していないことの記録
      expect(g1.evidence.baselineUnchanged).toMatch(/learners 1/);
      expect(g1.evidence.entitlementRowsMigrated).toBe(1);
    }
  });
  it('CEO入力待ちのゲートをCOMPLETEと記録していない', () => {
    const p = decisions.augustPilotProgram;
    for (const g of [p.gate2_physical_devices, p.gate3_legal_minimum, p.gate4_content_human_review]) {
      expect(g.status).toBe('INCOMPLETE');
      expect(g.blockedBy.length).toBeGreaterThan(0);
    }
  });
});

describe('旧名称のlearner-visible 0（§3）', () => {
  it('辞書・atlas・第1章から旧称（トオリミチ/ハタラキ区/はじまりの町）が消えている', () => {
    const banned = ['トオリミチ', 'ハタラキ区', 'はじまりの町', '初始小镇', '起始小镇'];
    for (const s of allDictStrings) for (const b of banned) expect(s.includes(b), `辞書に旧称: ${b} :: ${s.slice(0, 40)}`).toBe(false);
    for (const a of WORLD_AREAS) for (const b of banned) {
      expect(a.nameJa.includes(b), `atlas ja: ${a.areaId}`).toBe(false);
      expect(a.nameZh.includes(b), `atlas zh: ${a.areaId}`).toBe(false);
    }
    for (const l of CHAPTER1_LOCATIONS) for (const b of banned) expect(l.nameZh.includes(b)).toBe(false);
  });
  it('正式Area名10件がatlasに存在し、zhは「日本語固有名詞（gloss）」形式（方針B）', () => {
    const official = decisions.decided.area_names.values as string[];
    for (const name of official) {
      const hit = WORLD_AREAS.find(a => a.nameJa.split('（')[0] === name);
      expect(hit, `${name} がatlasにない`).toBeTruthy();
      expect(hit!.nameZh.startsWith(name), `${hit?.areaId} のnameZhが日本語固有名詞主表示でない`).toBe(true);
    }
  });
});

describe('Support窓口の適用範囲分離（CEO正式方針 2026-07-30）', () => {
  // 注意: 「AI日本語コース全体でWeChat=0」というテストは意図的に作らない。
  // 対象は【学習アプリ内（購入後learner向け）】のみ。LPの購入前相談導線は別方針（下のテスト）。
  it('A: 学習アプリ内のlearner-visible WeChat/Shocchance/微信 = 0', () => {
    const banned = ['WeChat', 'Shocchance', '微信'];
    for (const s of allDictStrings) for (const b of banned) expect(s.includes(b), `learner辞書に禁止語: ${b} :: ${s.slice(0, 40)}`).toBe(false);
  });
  it('A: 学習アプリ内の公開人間窓口は info@kawabado.com（ja/zh両方に表示文言あり）', () => {
    expect(aiCourseI18n.ja.support.email).toBe('info@kawabado.com');
    expect(aiCourseI18n.zh.support.email).toBe('info@kawabado.com');
    expect(aiCourseI18n.ja.support.contactByEmail.length).toBeGreaterThan(0);
    expect(aiCourseI18n.zh.support.contactByEmail.length).toBeGreaterThan(0);
  });
  it('B: LP（未購入者向け）の購入前WeChat相談導線は許可・維持されている', async () => {
    const { LP } = await import('../../../pages/ai-lesson/landing/lpContent');
    // 営業導線としてのWeChat IDは維持（learner appの禁止対象ではない）
    expect(LP.consultation.wechatIdPlaceholder).toBe('Shocchance');
    expect(LP.consultation.wechatLabel.ja.length).toBeGreaterThan(0);
    // メール相談の併記（維持または追加）
    expect(LP.consultation.email).toBe('info@kawabado.com');
    expect(LP.consultation.emailCta.ja.length).toBeGreaterThan(0);
    expect(LP.consultation.emailCta.zh.length).toBeGreaterThan(0);
  });
});
