import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { supabase } from '../../services/supabaseClient';
import { PreEntryModal } from '../../components/PreEntryModal';
import { EntryForm } from '../../components/EntryForm';
import { useLanguage } from '../../contexts/LanguageContext';
import type { Tournament } from '../../types';

// 申し込み専用ページ。
// 以前は大会詳細ページ上のモーダルだったが、スマホでの安定感・ブラウザ戻る対応・
// URL共有のためページ化した。決済/メール送信ロジックは EntryForm 内で従来と同一。
export const TournamentEntryPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { lang } = useLanguage();
  const zh = lang === 'zh';
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [entryCount, setEntryCount] = useState(0);
  const [loading, setLoading] = useState(true);
  // 直リンク流入でもルール確認を必ず挟む
  const [rulesAccepted, setRulesAccepted] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const { data: t } = await supabase.from('tournaments').select('*').eq('id', id).single();
      if (t) {
        setTournament(t);
        const { count } = await supabase
          .from('entries')
          .select('*', { count: 'exact', head: true })
          .eq('tournament_id', id)
          .eq('status', 'confirmed');
        setEntryCount(count ?? 0);
      }
      setLoading(false);
    };
    fetchData();
  }, [id]);

  const detailPath = `/${lang}/tournaments/${id}`;

  if (loading) return (
    <div className="max-w-md mx-auto px-4 py-8">
      <div className="skeleton h-6 w-40 rounded-lg mb-4" />
      <div className="skeleton h-96 w-full rounded-2xl" />
    </div>
  );

  // 申し込み不可の状態は詳細ページへ戻す（締切・満員はEntryForm/詳細側が扱う）
  if (!tournament || (tournament.visibility ?? 'published') === 'draft' || tournament.status !== 'active') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="text-4xl mb-4">🏸</div>
        <p className="text-gray-500 mb-6">{zh ? '目前无法报名此大会' : 'この大会は現在お申し込みできません'}</p>
        <Link to={`/${lang}/`} className="text-blue-600 hover:underline">← {zh ? '返回首页' : 'トップへ戻る'}</Link>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>{`${zh ? '报名' : '申し込み'} | ${tournament.title}`}</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <main className="max-w-2xl mx-auto px-4 py-8">
        <button
          onClick={() => navigate(detailPath)}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-5 transition-colors"
        >
          ← {zh ? '返回大会详情' : '大会詳細に戻る'}
        </button>

        {!rulesAccepted ? (
          <PreEntryModal
            tournament={tournament}
            onConfirm={() => setRulesAccepted(true)}
            onClose={() => navigate(detailPath)}
          />
        ) : (
          <EntryForm
            tournament={tournament}
            entryCount={entryCount}
            onClose={() => navigate(detailPath)}
          />
        )}
      </main>
    </>
  );
};

export default TournamentEntryPage;
