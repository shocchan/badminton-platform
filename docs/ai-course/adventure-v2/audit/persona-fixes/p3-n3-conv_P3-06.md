# p3-n3-conv:P3-06 (P2)

## Evidence
確認済み。/Users/shocchan/badminton-aicourse/src/lib/aiLesson/course/adventure/advMapModel.ts:348-352 で combined は [...exam, ...conv] 連結（hybrid は examFirst=true）。同 395-406 で firstOpen（＝試験レイヤーの現在stage）より後ろは一律 unlockJa『先に◯◯を攻略します』＋action差替『今日の冒険を進める』になり、会話12地域全部が「ことばの霧の中」表示。hybrid のタブ既定は combined（availableRouteKinds advMapModel.ts:427 → ['combined','exam','conversation']、AdvAdventureMap.tsx:114-115 kinds[0]）。会話タブでは同じ今週地域が current になり resolveAction（AdvAdventureMap.tsx:165-176）で「AI会話を始める」が押せる＝同一地域の可否が2タブで矛盾。実際は conversationAvailable=!!plan && remaining>0（AiCoursePage.tsx:1072、10回/日）で今日から可能。副次バグも確認: 攻略済み(done)の会話地域も i>firstOpen なら『先に◯◯を攻略します』の unlock 文言が付く。

## FixSpec
■修正: src/lib/aiLesson/course/adventure/advMapModel.ts buildAdventureMap 内。combined では会話レイヤーを並走レーン扱いにし、霧の対象から外す。
アンカー（現コード、364-365行目）:
  const withState = regions.map((r, i) => {
    if (i === firstOpen) {
新コード（2行の間に挿入）:
  const withState = regions.map((r, i) => {
    // 会話レイヤーは並走レーン（総合ルート時）。試験stageの攻略待ちにしない:
    // 会話は今日から使える（10回/日）事実と地図の表示を矛盾させない（原則13・迷子防止）。
    if (routeKind === 'combined' && r.layer === 'conversation' && i !== firstOpen) {
      if (r.state === 'done') return r;
      if (r.id === `conv-w${currentWeek}`) {
        // 今週の会話地域: 霧にせず「AI会話を始める」CTAを保つ（会話タブと同じ扱い）
        return { ...r, state: 'next' as RegionState };
      }
      const wk = Number(r.id.replace('conv-w', ''));
      return {
        ...r,
        unlockJa: `会話の旅は週ごとに進みます。第${wk}週になると開きます`,
        unlockZh: `会话之旅按周推进。到第${wk}周开启`,
        action: todayAction(
          '会話は今週のぶんから順に進みます。今週の会話はAI会話ミッションでできます',
          '会话从本周的部分开始依次推进。本周的会话可以在AI会话任务中进行',
          '今日の冒険を進める', '继续今天的冒险',
        ),
      };
    }
    if (i === firstOpen) {

実装メモ: ①今週の会話地域は conversationRegions（advMapModel.ts:316-321）が持つ action kind='conversation'（「AI会話を始める」）をそのまま保持し、state だけ 'next'（チップ「次の目的地」）にする。current は試験レイヤーの1つに保つ（「現在地は必ず1つ」のcanonを守る）。conversationAvailable=false の日は AdvAdventureMap.resolveAction:165-171 が既に今日の冒険へ倒すので行き止まりにならない。②done の会話地域を素通しすることで、既存の「攻略済みなのに『先に◯◯を攻略します』が付く」副次バグも直る。③これで『次の目的地』チップが試験側(firstOpen+1)と会話側で2つ並び得るが、並走レーンの表現として許容（気になる場合のみ後続で専用stateを検討。今回は追加しない）。テスト: advMapModel のテストに「hybrid+combined で conv-w{currentWeek} が locked でなく action.kind==='conversation' を保つ」「combined の done 会話地域に unlockJa が付かない」を1ケースずつ追加。
