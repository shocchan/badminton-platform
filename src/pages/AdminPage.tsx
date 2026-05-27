import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTournaments } from '../hooks/useTournaments';
import { useBlogPosts } from '../hooks/useBlogPosts';
import { supabase } from '../services/supabaseClient';
import type { Tournament, BlogPost, Entry } from '../types';

type Tab = 'tournaments' | 'blog' | 'entries';

// ブログカードの表示比率（h-48 ≈ 192px、3カラムで約384px幅 → 2:1）
const CARD_ASPECT = 2;

// ISO文字列(UTC)をdatetime-local input用のローカル時間文字列に変換
const toLocalInput = (iso: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 16);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const parsePosPercent = (pos: string): [number, number] => {
  const parts = (pos || '50% 50%').split(' ');
  const p = (s: string) => {
    if (!s) return 50;
    if (s === 'left' || s === 'top') return 0;
    if (s === 'center') return 50;
    if (s === 'right' || s === 'bottom') return 100;
    return parseFloat(s) || 50;
  };
  return [p(parts[0]), p(parts[1])];
};

// レベル×種目から参加費を自動算出
const calcEntryFee = (level: string, eventType: string): number => {
  const isDoubles = eventType.includes('ダブルス');
  if (!isDoubles) return 1500;          // シングルス
  if (level === '超初級') return 3000;  // 超初級ダブルス（シャトル込み）
  return 2000;                          // その他ダブルス・混合
};

const EMPTY_TOURNAMENT: Omit<Tournament, 'id' | 'created_at' | 'updated_at'> = {
  title: '',
  level: '超初級',
  event_type: 'シングルス',
  location: '',
  event_date: '',
  start_time: '',
  end_time: '',
  capacity: 16,
  entry_fee: calcEntryFee('超初級', 'シングルス'),
  cancel_deadline: '',
  description: '',
  status: 'active',
  payment_required: false,
  payment_deadline: undefined,
  bank_account: '',
  paypay_id: '',
  venue_address: '',
};

const EMPTY_POST: Omit<BlogPost, 'id' | 'created_at' | 'updated_at'> = {
  title: '',
  content: '',
  excerpt: '',
  image_url: '',
  published_at: '',
};

export const AdminPage = () => {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('tournaments');

  const { tournaments, loading: tLoading, createTournament, updateTournament, deleteTournament } = useTournaments();
  const { blogPosts, loading: bLoading, createPost, updatePost, deletePost } = useBlogPosts({ includeScheduled: true });
  const [entries, setEntries] = useState<(Entry & { tournaments?: { title: string } })[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [newEntryNotice, setNewEntryNotice] = useState<string | null>(null);

  const [showTournamentForm, setShowTournamentForm] = useState(false);
  const [editingTournament, setEditingTournament] = useState<Tournament | null>(null);
  const [tournamentForm, setTournamentForm] = useState(EMPTY_TOURNAMENT);
  const [tournamentError, setTournamentError] = useState<string | null>(null);
  const [tournamentSuccess, setTournamentSuccess] = useState(false);

  const [showPostForm, setShowPostForm] = useState(false);
  const [editingPost, setEditingPost] = useState<BlogPost | null>(null);
  const [postForm, setPostForm] = useState(EMPTY_POST);
  const [postError, setPostError] = useState<string | null>(null);
  const [postSuccess, setPostSuccess] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [isScheduled, setIsScheduled] = useState(false);
  const [imgNaturalSize, setImgNaturalSize] = useState({ w: 0, h: 0 });
  const [cropDragging, setCropDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ mx: 0, my: 0, px: 50, py: 50 });
  const cropContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, authLoading, navigate]);

  useEffect(() => {
    if (activeTab === 'entries') {
      fetchEntries();
    }
  }, [activeTab]);

  // ── リアルタイム申し込み通知 ──
  useEffect(() => {
    if (!isAuthenticated) return;
    const channel = supabase
      .channel('entries-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'entries' },
        async (payload) => {
          // 大会名を取得して通知
          const { data: t } = await supabase
            .from('tournaments')
            .select('title')
            .eq('id', payload.new.tournament_id)
            .single();
          const msg = `🏸 新しい申し込み！${t?.title ? `「${t.title}」` : ''}に ${payload.new.name} さんが申し込みました`;
          setNewEntryNotice(msg);
          setTimeout(() => setNewEntryNotice(null), 6000);
          // ブラウザ通知（許可されている場合）
          if (Notification.permission === 'granted') {
            new Notification('新規申し込み', { body: msg, icon: '/favicon.ico' });
          } else if (Notification.permission === 'default') {
            Notification.requestPermission();
          }
          // エントリー一覧を開いていればリフレッシュ
          if (activeTab === 'entries') fetchEntries();
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isAuthenticated, activeTab]);

  const fetchEntries = async () => {
    setEntriesLoading(true);
    const { data } = await supabase
      .from('entries')
      .select('*, tournaments(title)')
      .order('created_at', { ascending: false });
    setEntries((data || []) as (Entry & { tournaments?: { title: string } })[]);
    setEntriesLoading(false);
  };

  const handlePromoteWaitlist = async (entryId: number, entryName: string) => {
    if (!confirm(`${entryName}さんをキャンセル待ちから繰り上げ当選にしますか？\n（参加確定メールが送信されます）`)) return;
    try {
      await supabase.from('entries').update({ status: 'confirmed' }).eq('id', entryId);
      await fetchEntries();
    } catch (err) {
      alert('繰り上げ処理に失敗しました');
    }
  };

  const handleCancelEntry = async (entryId: number, entryName: string) => {
    if (!confirm(`${entryName}さんの申し込みをキャンセルしますか？`)) return;
    try {
      await supabase.from('entries').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('id', entryId);
      await fetchEntries();
    } catch (err) {
      alert('キャンセル処理に失敗しました');
    }
  };

  const handleTournamentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTournamentError(null);
    try {
      if (editingTournament) {
        await updateTournament(editingTournament.id, tournamentForm);
      } else {
        await createTournament(tournamentForm);
      }
      setShowTournamentForm(false);
      setEditingTournament(null);
      setTournamentForm(EMPTY_TOURNAMENT);
      setTournamentSuccess(true);
      setTimeout(() => setTournamentSuccess(false), 3000);
    } catch (err: unknown) {
      setTournamentError(err instanceof Error ? err.message : '保存に失敗しました');
    }
  };

  const handleEditTournament = (t: Tournament) => {
    setEditingTournament(t);
    setTournamentForm({
      title: t.title,
      level: t.level,
      event_type: t.event_type,
      location: t.location,
      event_date: t.event_date,
      start_time: t.start_time,
      end_time: t.end_time,
      capacity: t.capacity,
      entry_fee: t.entry_fee,
      cancel_deadline: t.cancel_deadline,
      description: t.description || '',
      status: t.status,
      payment_required: t.payment_required,
      payment_deadline: t.payment_deadline,
      bank_account: t.bank_account || '',
      paypay_id: t.paypay_id || '',
      venue_address: t.venue_address || '',
    });
    setShowTournamentForm(true);
  };

  const handleDeleteTournament = async (id: number) => {
    if (!confirm('この大会を削除しますか？')) return;
    try {
      await deleteTournament(id);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '削除に失敗しました');
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setImgNaturalSize({ w: 0, h: 0 });
    setPostForm(p => ({...p, image_position: '50% 50%'}));
  };

  const getCropRect = (imgAspect: number, posX: number, posY: number) => {
    if (imgAspect >= CARD_ASPECT) {
      const cropW = (CARD_ASPECT / imgAspect) * 100;
      return { left: posX * (100 - cropW) / 100, top: 0, width: cropW, height: 100 };
    } else {
      const cropH = (imgAspect / CARD_ASPECT) * 100;
      return { left: 0, top: posY * (100 - cropH) / 100, width: 100, height: cropH };
    }
  };

  const startCropDrag = (mx: number, my: number) => {
    const [px, py] = parsePosPercent(postForm.image_position || '50% 50%');
    setCropDragging(true);
    setDragStart({ mx, my, px, py });
  };

  const moveCropDrag = (mx: number, my: number) => {
    if (!cropDragging || !cropContainerRef.current || imgNaturalSize.w === 0) return;
    const rect = cropContainerRef.current.getBoundingClientRect();
    const imgAspect = imgNaturalSize.w / imgNaturalSize.h;
    const dx = mx - dragStart.mx;
    const dy = my - dragStart.my;
    let newPx = dragStart.px, newPy = dragStart.py;
    if (imgAspect >= CARD_ASPECT) {
      const cropWpx = rect.width * (CARD_ASPECT / imgAspect);
      const maxPx = rect.width - cropWpx;
      if (maxPx > 0) newPx = Math.max(0, Math.min(100, dragStart.px + (dx / maxPx) * 100));
    } else {
      const cropHpx = rect.height * (imgAspect / CARD_ASPECT);
      const maxPy = rect.height - cropHpx;
      if (maxPy > 0) newPy = Math.max(0, Math.min(100, dragStart.py + (dy / maxPy) * 100));
    }
    setPostForm(p => ({...p, image_position: `${Math.round(newPx)}% ${Math.round(newPy)}%`}));
  };

  const uploadImage = async (file: File): Promise<string> => {
    const ext = file.name.split('.').pop();
    const fileName = `${Date.now()}.${ext}`;
    const { data, error } = await supabase.storage
      .from('blog-images')
      .upload(fileName, file, { upsert: true });
    if (error) throw error;
    const { data: urlData } = supabase.storage
      .from('blog-images')
      .getPublicUrl(data.path);
    return urlData.publicUrl;
  };

  const handlePostSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPostError(null);
    try {
      let finalImageUrl = postForm.image_url;

      if (imageFile) {
        setImageUploading(true);
        finalImageUrl = await uploadImage(imageFile);
        setImageUploading(false);
      }

      const cleanForm = {
        ...postForm,
        image_url: finalImageUrl || undefined,
        excerpt: postForm.excerpt || undefined,
        published_at: postForm.published_at || new Date().toISOString(),
      };

      if (editingPost) {
        await updatePost(editingPost.id, cleanForm);
      } else {
        await createPost(cleanForm);
      }
      setShowPostForm(false);
      setEditingPost(null);
      setPostForm(EMPTY_POST);
      setImageFile(null);
      setImagePreview(null);
      setIsScheduled(false);
      setPostSuccess(true);
      setTimeout(() => setPostSuccess(false), 3000);
    } catch (err: unknown) {
      setImageUploading(false);
      const msg = (err as { message?: string })?.message ?? '保存に失敗しました';
      setPostError(msg);
    }
  };

  const handleEditPost = (p: BlogPost) => {
    setEditingPost(p);
    const futureDate = new Date(p.published_at) > new Date();
    setIsScheduled(futureDate);
    setPostForm({
      title: p.title,
      content: p.content,
      excerpt: p.excerpt || '',
      image_url: p.image_url || '',
      image_position: p.image_position || 'center center',
      published_at: futureDate ? p.published_at : '',
    });
    setImageFile(null);
    setImagePreview(p.image_url || null);
    setShowPostForm(true);
  };

  const handleDeletePost = async (id: number) => {
    if (!confirm('この記事を削除しますか？')) return;
    try {
      await deletePost(id);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '削除に失敗しました');
    }
  };

  if (authLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const formatDate = (str: string) => str ? new Date(str).toLocaleDateString('ja-JP') : '';

  return (
    <main className="max-w-6xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">管理画面</h1>

      {/* リアルタイム通知バナー */}
      {newEntryNotice && (
        <div className="fixed top-20 right-4 z-50 max-w-sm bg-green-600 text-white px-4 py-3 rounded-2xl shadow-xl flex items-start gap-3 animate-bounce">
          <span className="text-xl flex-shrink-0">🏸</span>
          <p className="text-sm font-medium leading-snug">{newEntryNotice}</p>
          <button onClick={() => setNewEntryNotice(null)} className="text-white/70 hover:text-white ml-1 flex-shrink-0">✕</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-8 w-fit">
        {([['tournaments', '大会案内'], ['blog', 'ブログ'], ['entries', 'エントリー確認']] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === key ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tournaments Tab */}
      {activeTab === 'tournaments' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-gray-800">大会一覧</h2>
            <button
              onClick={() => { setEditingTournament(null); setTournamentForm(EMPTY_TOURNAMENT); setShowTournamentForm(true); }}
              className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              ＋ 新規作成
            </button>
          </div>

          {tournamentSuccess && <div className="bg-green-50 text-green-700 px-4 py-3 rounded-xl text-sm mb-4">保存しました ✅</div>}

          {showTournamentForm && (
            <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-6 shadow-sm">
              <h3 className="font-bold text-gray-900 mb-4">{editingTournament ? '大会を編集' : '新規大会作成'}</h3>
              {tournamentError && <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl mb-4">{tournamentError}</div>}
              <form onSubmit={handleTournamentSubmit} className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">タイトル *</label>
                  <input
                    required
                    value={tournamentForm.title}
                    onChange={e => setTournamentForm(p => ({...p, title: e.target.value}))}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="《初級OP》シングルス大会"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">レベル *</label>
                  <select
                    required
                    value={tournamentForm.level}
                    onChange={e => {
                      const level = e.target.value;
                      setTournamentForm(p => ({...p, level, entry_fee: calcEntryFee(level, p.event_type)}));
                    }}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {['超初級', '初級', '中級', 'オープン'].map(l => <option key={l}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">イベントタイプ *</label>
                  <select
                    required
                    value={tournamentForm.event_type}
                    onChange={e => {
                      const eventType = e.target.value;
                      setTournamentForm(p => ({...p, event_type: eventType, entry_fee: calcEntryFee(p.level, eventType)}));
                    }}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {['シングルス', 'ダブルス', '混合ダブルス'].map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">開催日 *</label>
                  <input
                    required
                    type="date"
                    value={tournamentForm.event_date}
                    onChange={e => setTournamentForm(p => ({...p, event_date: e.target.value}))}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">会場名 *</label>
                  <input
                    required
                    value={tournamentForm.location}
                    onChange={e => setTournamentForm(p => ({...p, location: e.target.value}))}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="川口市立体育館"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    住所
                    <span className="text-xs text-gray-400 font-normal ml-1">（マップ表示に使用）</span>
                  </label>
                  <input
                    type="text"
                    value={tournamentForm.venue_address || ''}
                    onChange={e => setTournamentForm(p => ({...p, venue_address: e.target.value}))}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="埼玉県川口市〇〇1-2-3"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">開始時間 *</label>
                  <input
                    required
                    type="time"
                    value={tournamentForm.start_time}
                    onChange={e => setTournamentForm(p => ({...p, start_time: e.target.value}))}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">終了時間 *</label>
                  <input
                    required
                    type="time"
                    value={tournamentForm.end_time}
                    onChange={e => setTournamentForm(p => ({...p, end_time: e.target.value}))}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    参加費（円）
                    <span className="text-xs text-blue-500 font-normal ml-1">※レベル×種目から自動設定</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      required
                      type="number"
                      value={tournamentForm.entry_fee}
                      onChange={e => setTournamentForm(p => ({...p, entry_fee: Number(e.target.value)}))}
                      className="w-full border-2 border-blue-300 bg-blue-50 rounded-xl px-3 py-2 text-sm font-bold text-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => setTournamentForm(p => ({...p, entry_fee: calcEntryFee(p.level, p.event_type)}))}
                      className="text-xs text-blue-600 hover:text-blue-800 whitespace-nowrap border border-blue-300 rounded-lg px-2 py-1.5"
                    >
                      リセット
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">定員 *</label>
                  <input
                    required
                    type="number"
                    value={tournamentForm.capacity}
                    onChange={e => setTournamentForm(p => ({...p, capacity: Number(e.target.value)}))}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">キャンセル期限 *</label>
                  <input
                    required
                    type="date"
                    value={tournamentForm.cancel_deadline}
                    onChange={e => setTournamentForm(p => ({...p, cancel_deadline: e.target.value}))}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
                    <input
                      type="checkbox"
                      checked={tournamentForm.payment_required}
                      onChange={e => setTournamentForm(p => ({...p, payment_required: e.target.checked}))}
                      className="rounded"
                    />
                    事前支払いが必要
                  </label>
                </div>
                {tournamentForm.payment_required && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">支払い期限 *</label>
                      <input
                        type="date"
                        value={tournamentForm.payment_deadline || ''}
                        onChange={e => setTournamentForm(p => ({...p, payment_deadline: e.target.value}))}
                        className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">PayPay ID</label>
                      <input
                        type="text"
                        value={tournamentForm.paypay_id}
                        onChange={e => setTournamentForm(p => ({...p, paypay_id: e.target.value}))}
                        className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="例：user123"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">銀行口座情報</label>
                      <textarea
                        value={tournamentForm.bank_account}
                        onChange={e => setTournamentForm(p => ({...p, bank_account: e.target.value}))}
                        rows={2}
                        className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                        placeholder="例：○○銀行 支店 普通預金 1234567"
                      />
                    </div>
                  </>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ステータス</label>
                  <select
                    value={tournamentForm.status}
                    onChange={e => setTournamentForm(p => ({...p, status: e.target.value as 'active' | 'cancelled'}))}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="active">開催予定</option>
                    <option value="cancelled">中止</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">説明文（HTML可）</label>
                  <textarea
                    value={tournamentForm.description}
                    onChange={e => setTournamentForm(p => ({...p, description: e.target.value}))}
                    rows={4}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>
                <div className="col-span-2 flex gap-3 justify-end">
                  <button
                    type="button"
                    onClick={() => { setShowTournamentForm(false); setEditingTournament(null); }}
                    className="px-5 py-2 border border-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
                  >
                    キャンセル
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors"
                  >
                    保存
                  </button>
                </div>
              </form>
            </div>
          )}

          {tLoading ? (
            <div className="flex justify-center py-10">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">タイトル</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">開催日</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">ステータス</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {tournaments.map(t => (
                    <tr key={t.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{t.title}</td>
                      <td className="px-4 py-3 text-gray-600">{formatDate(t.event_date)}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${t.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {t.status === 'active' ? '開催予定' : '中止'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => handleEditTournament(t)} className="text-blue-600 hover:underline mr-3">編集</button>
                        <button onClick={() => handleDeleteTournament(t.id)} className="text-red-500 hover:underline">削除</button>
                      </td>
                    </tr>
                  ))}
                  {tournaments.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-10 text-center text-gray-400">大会がありません</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Blog Tab */}
      {activeTab === 'blog' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-gray-800">ブログ記事一覧</h2>
            <button
              onClick={() => { setEditingPost(null); setPostForm(EMPTY_POST); setShowPostForm(true); }}
              className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              ＋ 新規記事
            </button>
          </div>

          {postSuccess && <div className="bg-green-50 text-green-700 px-4 py-3 rounded-xl text-sm mb-4">保存しました ✅</div>}

          {showPostForm && (
            <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-6 shadow-sm">
              <h3 className="font-bold text-gray-900 mb-4">{editingPost ? '記事を編集' : '新規記事作成'}</h3>
              {postError && <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl mb-4">{postError}</div>}
              <form onSubmit={handlePostSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">タイトル *</label>
                  <input
                    required
                    value={postForm.title}
                    onChange={e => setPostForm(p => ({...p, title: e.target.value}))}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="5/23 初級OP 大会結果"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">抜粋（一覧表示用）</label>
                  <input
                    value={postForm.excerpt}
                    onChange={e => setPostForm(p => ({...p, excerpt: e.target.value}))}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="記事の概要..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">画像</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageSelect}
                    className="w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-600 hover:file:bg-blue-100 cursor-pointer"
                  />
                  {imagePreview && (
                    <div className="mt-2 space-y-1">
                      <p className="text-xs text-gray-400">
                        青枠の範囲が実際に表示される部分です。ドラッグして調整してください
                      </p>
                      <div
                        ref={cropContainerRef}
                        className={`relative w-full overflow-hidden rounded-xl border border-gray-200 select-none ${cropDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                        style={{ aspectRatio: imgNaturalSize.w > 0 ? `${imgNaturalSize.w}/${imgNaturalSize.h}` : '16/9' }}
                        onMouseDown={e => { e.preventDefault(); startCropDrag(e.clientX, e.clientY); }}
                        onMouseMove={e => moveCropDrag(e.clientX, e.clientY)}
                        onMouseUp={() => setCropDragging(false)}
                        onMouseLeave={() => setCropDragging(false)}
                        onTouchStart={e => { const t = e.touches[0]; startCropDrag(t.clientX, t.clientY); }}
                        onTouchMove={e => { e.preventDefault(); const t = e.touches[0]; moveCropDrag(t.clientX, t.clientY); }}
                        onTouchEnd={() => setCropDragging(false)}
                      >
                        <img
                          src={imagePreview}
                          alt="crop preview"
                          className="w-full h-full"
                          style={{ display: 'block', objectFit: 'contain' }}
                          onLoad={e => {
                            const img = e.currentTarget;
                            setImgNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
                          }}
                          draggable={false}
                        />
                        {imgNaturalSize.w > 0 && (() => {
                          const [px, py] = parsePosPercent(postForm.image_position || '50% 50%');
                          const { left, top, width, height } = getCropRect(imgNaturalSize.w / imgNaturalSize.h, px, py);
                          return (
                            <>
                              {/* 暗いオーバーレイ（4辺） */}
                              {top > 0 && <div className="absolute inset-x-0 top-0 bg-black/50 pointer-events-none" style={{ height: `${top}%` }} />}
                              {top + height < 100 && <div className="absolute inset-x-0 bottom-0 bg-black/50 pointer-events-none" style={{ height: `${100 - top - height}%` }} />}
                              {left > 0 && <div className="absolute bg-black/50 pointer-events-none" style={{ top: `${top}%`, height: `${height}%`, left: 0, width: `${left}%` }} />}
                              {left + width < 100 && <div className="absolute bg-black/50 pointer-events-none" style={{ top: `${top}%`, height: `${height}%`, right: 0, width: `${100 - left - width}%` }} />}
                              {/* 青い枠（表示範囲） */}
                              <div
                                className="absolute border-2 border-blue-400 pointer-events-none"
                                style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }}
                              >
                                {/* 四隅のハンドル */}
                                {([[0,0],[100,0],[0,100],[100,100]] as [number,number][]).map(([x, y], i) => (
                                  <div key={i} className="absolute w-3 h-3 bg-blue-400 rounded-sm"
                                    style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%,-50%)' }} />
                                ))}
                                {/* 中央ラベル */}
                                <div className="absolute inset-0 flex items-end justify-end p-1">
                                  <span className="text-xs text-blue-300 bg-black/30 px-1 rounded">表示範囲</span>
                                </div>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setImageFile(null);
                          setImagePreview(null);
                          setImgNaturalSize({ w: 0, h: 0 });
                          setPostForm(p => ({...p, image_url: '', image_position: '50% 50%'}));
                        }}
                        className="text-xs text-red-500 hover:underline"
                      >
                        × 画像を削除
                      </button>
                    </div>
                  )}
                </div>
                <div>
                  <label className="flex items-center gap-3 text-sm font-medium text-gray-700 mb-2 cursor-pointer select-none">
                    <div
                      onClick={() => {
                        const next = !isScheduled;
                        setIsScheduled(next);
                        if (!next) setPostForm(p => ({...p, published_at: ''}));
                      }}
                      className={`relative w-10 h-6 rounded-full transition-colors ${isScheduled ? 'bg-blue-500' : 'bg-gray-300'}`}
                    >
                      <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${isScheduled ? 'translate-x-4' : ''}`} />
                    </div>
                    予約投稿
                    {!isScheduled && <span className="text-xs font-normal text-green-600 bg-green-50 px-2 py-0.5 rounded-full">即時公開</span>}
                  </label>
                  {isScheduled && (
                    <input
                      type="datetime-local"
                      value={postForm.published_at ? toLocalInput(postForm.published_at) : ''}
                      onChange={e => setPostForm(p => ({
                        ...p,
                        published_at: e.target.value ? new Date(e.target.value).toISOString() : ''
                      }))}
                      className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">本文（HTML可） *</label>
                  <textarea
                    required
                    value={postForm.content}
                    onChange={e => setPostForm(p => ({...p, content: e.target.value}))}
                    rows={8}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>
                <div className="flex gap-3 justify-end">
                  <button
                    type="button"
                    onClick={() => { setShowPostForm(false); setEditingPost(null); setImageFile(null); setImagePreview(null); setIsScheduled(false); }}
                    className="px-5 py-2 border border-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
                    disabled={imageUploading}
                  >
                    キャンセル
                  </button>
                  <button
                    type="submit"
                    disabled={imageUploading}
                    className="px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {imageUploading && (
                      <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    )}
                    {imageUploading ? '画像アップロード中...' : '公開'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {bLoading ? (
            <div className="flex justify-center py-10">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">タイトル</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">公開日</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {blogPosts.map(p => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{p.title}</td>
                      <td className="px-4 py-3 text-gray-600">{formatDate(p.published_at)}</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => handleEditPost(p)} className="text-blue-600 hover:underline mr-3">編集</button>
                        <button onClick={() => handleDeletePost(p.id)} className="text-red-500 hover:underline">削除</button>
                      </td>
                    </tr>
                  ))}
                  {blogPosts.length === 0 && (
                    <tr><td colSpan={3} className="px-4 py-10 text-center text-gray-400">記事がありません</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Entries Tab */}
      {activeTab === 'entries' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-gray-800">エントリー一覧</h2>
            <button
              onClick={() => {
                const statusLabel = (s: string) => s === 'confirmed' ? '確定' : s === 'waitlist' ? 'キャンセル待ち' : s === 'cancelled' ? 'キャンセル' : '確定';
                const header = ['ステータス', '大会名', '参加者名', 'ペア名', 'メール', '電話番号', '備考', '申込日'];
                const rows = entries.map(e => [
                  statusLabel(e.status || 'confirmed'),
                  e.tournaments?.title || '',
                  e.name,
                  e.partner_name || '',
                  e.email,
                  e.phone || '',
                  e.notes || '',
                  formatDate(e.entry_date),
                ]);
                const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
                const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `entries_${new Date().toISOString().slice(0,10)}.csv`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              disabled={entries.length === 0}
              className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
            >
              ⬇ CSVエクスポート
            </button>
          </div>
          {entriesLoading ? (
            <div className="flex justify-center py-10">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">ステータス</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">大会名</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">参加者名</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">ペア名</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">電話番号</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">メール</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">備考</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">申込日</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {entries.map((entry) => (
                    <tr key={entry.id} className={`hover:bg-gray-50 ${entry.status === 'cancelled' ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-3">
                        {entry.status === 'confirmed' && (
                          <span className="text-xs px-2 py-1 rounded-full font-medium bg-green-100 text-green-700">確定</span>
                        )}
                        {entry.status === 'waitlist' && (
                          <span className="text-xs px-2 py-1 rounded-full font-medium bg-amber-100 text-amber-700">待機</span>
                        )}
                        {entry.status === 'cancelled' && (
                          <span className="text-xs px-2 py-1 rounded-full font-medium bg-gray-100 text-gray-500">取消</span>
                        )}
                        {!entry.status && (
                          <span className="text-xs px-2 py-1 rounded-full font-medium bg-green-100 text-green-700">確定</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{entry.tournaments?.title || '-'}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{entry.name}</td>
                      <td className="px-4 py-3 text-gray-500">{entry.partner_name || '-'}</td>
                      <td className="px-4 py-3 text-gray-600">{entry.phone || '-'}</td>
                      <td className="px-4 py-3 text-gray-600">{entry.email}</td>
                      <td className="px-4 py-3 text-gray-500">{entry.notes || '-'}</td>
                      <td className="px-4 py-3 text-gray-500">{formatDate(entry.entry_date)}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {entry.status === 'waitlist' && (
                          <button
                            onClick={() => handlePromoteWaitlist(entry.id, entry.name)}
                            className="text-xs text-green-600 hover:underline mr-2 font-medium"
                          >
                            繰り上げ
                          </button>
                        )}
                        {(entry.status === 'confirmed' || entry.status === 'waitlist' || !entry.status) && (
                          <button
                            onClick={() => handleCancelEntry(entry.id, entry.name)}
                            className="text-xs text-red-500 hover:underline"
                          >
                            取消
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {entries.length === 0 && (
                    <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-400">エントリーがありません</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </main>
  );
};
