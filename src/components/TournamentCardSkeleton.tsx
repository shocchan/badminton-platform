export const TournamentCardSkeleton = () => (
  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
    {/* ヘッダー */}
    <div className="bg-gray-100 px-4 sm:px-6 py-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="skeleton h-5 w-3/4 rounded-lg" />
        <div className="skeleton h-5 w-14 rounded-full flex-shrink-0" />
      </div>
      <div className="flex gap-2">
        <div className="skeleton h-5 w-12 rounded-full" />
        <div className="skeleton h-5 w-20 rounded-full" />
      </div>
    </div>

    {/* コンテンツ */}
    <div className="px-4 sm:px-6 py-5 flex flex-col flex-1 gap-4">
      {/* info grid */}
      <div className="grid grid-cols-2 gap-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className={i === 4 ? 'col-span-2' : ''}>
            <div className="skeleton h-3 w-16 rounded mb-1.5" />
            <div className="skeleton h-4 w-full rounded" />
          </div>
        ))}
      </div>

      {/* プログレスバー */}
      <div>
        <div className="flex justify-between mb-1.5">
          <div className="skeleton h-3 w-20 rounded" />
          <div className="skeleton h-5 w-16 rounded-full" />
        </div>
        <div className="skeleton h-2 w-full rounded-full" />
        <div className="flex justify-between mt-1">
          <div className="skeleton h-3 w-20 rounded" />
          <div className="skeleton h-3 w-16 rounded" />
        </div>
      </div>

      {/* マップリンク */}
      <div className="skeleton h-10 w-full rounded-xl" />

      {/* ボタン */}
      <div className="mt-auto skeleton h-12 w-full rounded-xl" />
    </div>
  </div>
);
