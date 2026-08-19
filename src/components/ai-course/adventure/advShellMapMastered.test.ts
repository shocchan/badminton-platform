// AdvShell の配線の番人（2026-08-18 P0）。実測で見つかった2件の再発防止。
//
// ① 冒険マップへ渡す攻略済み集合が**台帳のtargetIDだけ**だった。
//    地図は `mastered.has(stage.stageId)` で判定するので、通常の学習で全束を攻略しても
//    「0地域攻略・まだ挑戦していません」のままだった（毎日満点でN5を52日で完走した
//    直後の地図が 0/3。ホームの攻略率100%と食い違っていた）。
// ② 錯題本の解き直し（`mistake-review`）が7日後の**確認バトルの対象**に選ばれていた。
//    これは学習対象IDではなく出題プールを持たないので、押すと0問で終わる。
//    解き直せる問題が少ない日（1問＝100%）が別の日に3回そろうと成立する。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('./AdvShell.tsx', import.meta.url), 'utf8');

describe('冒険マップへ渡す攻略済み集合', () => {
  it('stage攻略の導出値（deriveMasteredStageIds）を混ぜて渡している', () => {
    // 台帳のtargetIDだけを渡す形へ戻っていないこと
    expect(SRC).not.toMatch(/mastered=\{masteredTargetIds\(prof\.mastery, nowISO\)\}/);
    expect(SRC).toMatch(/mastered=\{mapMastered\}/);
    const decl = /const mapMastered =[\s\S]{0,220}?;\n/.exec(SRC);
    expect(decl, 'mapMastered の定義が見つからない').toBeTruthy();
    expect(decl![0]).toMatch(/mapStageDone/);
    expect(SRC).toMatch(/const mapStageDone = pools\s*\n?\s*\? deriveMasteredStageIds\(route, mapTargets/);
  });
});

describe('次の道カードの配線（2026-08-19）', () => {
  it('home と成長マップ（世界地図直下の枠）の両方に、同じ実測判定・同じCTAで出している', () => {
    // home 側の判定（pools未ロード時のstageDoneフォールバックでは成立しない＝偽陽性なし）
    expect(SRC).toMatch(/const nextRoad = nextRoadOf\(prof, route, stageDone\)/);
    // 地図側の判定（pools未ロードでは mapStageDone が空集合＝出ない側に安全）
    expect(SRC).toMatch(/const mapNextRoad = nextRoadOf\(prof, route, mapStageDone\)/);
    // 地図側は AdvAdventureMap の nextRoadSlot（世界地図直下の枠）へ入れている
    expect(SRC).toMatch(/nextRoadSlot=\{mapNextRoad/);
    // CTAは両所とも同一ハンドラ（文言・遷移が home と地図で割れない）
    expect((SRC.match(/onAdvance=\{advanceNextRoad\}/g) ?? []).length).toBe(2);
  });
});

describe('確認バトルの対象', () => {
  it('出題プールを持たない疑似target（読解・聴解・模試・錯題本）を対象にしない', () => {
    const filter = /includeTargetId: \(id\) =>[\s\S]{0,220}?,\n/.exec(SRC);
    expect(filter, 'includeTargetId が見つからない').toBeTruthy();
    expect(filter![0]).toMatch(/reading-\|listening-\|mock/);
    expect(filter![0]).toMatch(/id !== MISTAKE_TARGET_ID/);
  });
});

describe('読解・聴解の在庫を引くレベル', () => {
  it('N2/N3の2値へ丸めず、目標レベル（N5/N4を含む）で引く', () => {
    // `level` は模試用の2値。読解・聴解runnerがこれを使うと、
    // 今日の冒険が `read-n5-*` を対象だと言いながらN2の長文を出す（2026-08-18 実測）
    expect(SRC).toMatch(/const allR = readingSetsFor\(contentLevel\)/);
    expect(SRC).toMatch(/const allL = listeningSetsFor\(contentLevel\)/);
    expect(SRC).not.toMatch(/readingSetsFor\(level\)/);
    expect(SRC).not.toMatch(/listeningSetsFor\(level\)/);
  });
});
