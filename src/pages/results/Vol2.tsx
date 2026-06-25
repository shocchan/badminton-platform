import { Helmet } from 'react-helmet-async'

export default function Vol2Results() {
  return (
    <>
      <Helmet>
        <title>第2回大会 結果 | 川口・蕨バド交流杯</title>
        <meta name="description" content="第2回川口・蕨バド交流杯ミックスダブルス夜の部（2026年6月25日）の試合結果・総当たりスコア表。" />
      </Helmet>

      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="mb-8">
          <p className="text-sm text-gray-500 mb-1">2026年6月25日（水）川口市芝園公民館</p>
          <h1 className="text-2xl font-bold text-gray-900">
            第2回 川口・蕨バド交流杯<br />
            <span className="text-lg font-medium text-gray-600">ミックスダブルス 夜の部 — 結果</span>
          </h1>
        </div>

        <h2 className="text-base font-semibold text-gray-700 mb-3">■ 総当たりスコア表</h2>
        <div className="overflow-x-auto mb-6">
          <img
            src="/images/vol2/results-table.png"
            alt="第2回大会 総当たりスコア表"
            className="w-full rounded shadow"
          />
        </div>

        <div className="mt-8 pt-6 border-t border-gray-100 text-center">
          <a href="/blog" className="text-sm text-blue-600 hover:underline">← 大会レポートブログに戻る</a>
        </div>
      </div>
    </>
  )
}
