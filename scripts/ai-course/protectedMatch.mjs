/**
 * 保護対象の識別子が**その識別子として**SQLに出てくるか（2026-09-12 CEO報告で修正）。
 *
 * 以前は単純な部分一致だったため、エリさん `eli@id.…` への書き込みが
 * 李さんの `li@id.…` に当たり「matched: li@id.…」と**別人の名前で**止まっていた。
 * 止まる方向の誤検知なので取り違えて消す事故にはならないが、
 * 監査ログに違う人が記録されるので、誰に何をしたかを後から追えなくなる。
 *
 * 前後がメール・UUIDに使う文字でないときだけ一致とみなす（引用符・空白・行頭行末など）。
 * 判定を緩める変更なので、**保護が外れないこと**を protectedMatch.test.mjs で固定している。
 */
const ID_CHAR = /[A-Za-z0-9._%+-]/;

const containsIdentifier = (haystack, needle) => {
  if (needle === '') return false;
  for (let from = 0; from <= haystack.length; from += 1) {
    const i = haystack.indexOf(needle, from);
    if (i < 0) return false;
    const before = i > 0 ? haystack[i - 1] : '';
    const after = i + needle.length < haystack.length ? haystack[i + needle.length] : '';
    if (!ID_CHAR.test(before) && !ID_CHAR.test(after)) return true;
    from = i;
  }
  return false;
};

/** SQL（小文字化済み）に出てくる保護対象を全部返す。監査ログに出すのでヒットは1件に絞らない */
export const matchedIdentifiers = (lowerSql, ids) =>
  (ids ?? []).map((x) => String(x).toLowerCase()).filter((x) => containsIdentifier(lowerSql, x));
