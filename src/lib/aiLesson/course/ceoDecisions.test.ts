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
    expect(decisions.decided.support_channel.value).toBe('info@kawabado.com');
  });
  it('人間ゲートはopenのまま（「全ゲート完了」と記録しない）', () => {
    expect(decisions.openGates.legal).toBe('open');
    expect(decisions.openGates.physical_device_formal_verification).toBe('open');
    expect(decisions.openGates.remote_migration).toBe('open');
    expect(decisions.openGates.remote_rls_verification).toBe('open');
    expect(decisions.openGates.production_approval).toBe('open');
    expect(decisions.notAllGatesComplete).toBe(true);
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

describe('Support窓口の統一（§5）', () => {
  it('learner辞書にWeChat/Shocchance/微信が0・info@kawabado.comが存在', () => {
    const banned = ['WeChat', 'Shocchance', '微信'];
    for (const s of allDictStrings) for (const b of banned) expect(s.includes(b), `辞書に禁止語: ${b} :: ${s.slice(0, 40)}`).toBe(false);
    expect(aiCourseI18n.ja.support.email).toBe('info@kawabado.com');
    expect(aiCourseI18n.zh.support.email).toBe('info@kawabado.com');
    expect(aiCourseI18n.ja.support.contactByEmail.length).toBeGreaterThan(0);
    expect(aiCourseI18n.zh.support.contactByEmail.length).toBeGreaterThan(0);
  });
});
