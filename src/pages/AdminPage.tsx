import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTournaments } from '../hooks/useTournaments';
import { useBlogPosts } from '../hooks/useBlogPosts';
import { supabase } from '../services/supabaseClient';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { ResizableImage } from '../extensions/ResizableImage';
import type { Tournament, BlogPost, Entry } from '../types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const EDGE_BASE = SUPABASE_URL.replace('supabase.co', 'supabase.co/functions/v1');
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

type Tab = 'tournaments' | 'blog' | 'entries' | 'activities' | 'members';

interface Member {
  id: string;
  member_number: number;
  name: string;
  charge_balance: number;
  active: boolean;
}

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
  cancel_deadline: null as unknown as string,
  description: '',
  edition: null,
  status: 'active',
  visibility: 'draft' as 'draft' | 'unlisted' | 'published',
  payment_required: false,
  payment_deadline: undefined,
  bank_account: '',
  paypay_id: '',
  venue_address: '',
};

// ── ツールバーボタン ──────────────────────────────────────
function TBtn({ onClick, active, title, children }: { onClick: () => void; active?: boolean; title?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
        active ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      {children}
    </button>
  );
}

// ── リッチテキストエディタ（白テーマ）─────────────────────
function RichEditor({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const imgInputRef = useRef<HTMLInputElement>(null);
  const [imgUploading, setImgUploading] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      ResizableImage,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: '本文を入力してください…' }),
    ],
    content: value || '',
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: 'outline-none min-h-[320px] px-4 py-3 text-gray-800 leading-relaxed prose prose-sm max-w-none',
      },
    },
  });

  // valueが外部から変わった時（編集開始時）に同期
  const isFirstMount = useRef(true);
  useEffect(() => {
    if (isFirstMount.current) { isFirstMount.current = false; return; }
  }, []);

  const setLink = useCallback(() => {
    const url = window.prompt('URLを入力してください');
    if (!url) return;
    editor?.chain().focus().setLink({ href: url }).run();
  }, [editor]);

  const handleImageFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !editor) return;
    if (file.size > 10 * 1024 * 1024) { alert('ファイルサイズは10MB以下にしてください'); return; }
    setImgUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const filename = `body/${Date.now()}.${ext}`;
      const { data, error } = await supabase.storage.from('blog-images').upload(filename, file, { upsert: false });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('blog-images').getPublicUrl(data.path);
      editor.commands.insertContent({ type: 'image', attrs: { src: urlData.publicUrl, width: 400 } });
    } catch (err) {
      alert('画像のアップロードに失敗しました: ' + (err instanceof Error ? err.message : '不明なエラー'));
    } finally {
      setImgUploading(false);
    }
  }, [editor]);

  if (!editor) return null;

  return (
    <div className="rounded-xl border border-gray-300 overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500">
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-gray-200 bg-gray-50">
        <TBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} title="見出し1">H1</TBtn>
        <TBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="見出し2">H2</TBtn>
        <TBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="見出し3">H3</TBtn>
        <div className="w-px h-5 bg-gray-300 mx-1" />
        <TBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="太字"><b>B</b></TBtn>
        <TBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="斜体"><i>I</i></TBtn>
        <div className="w-px h-5 bg-gray-300 mx-1" />
        <TBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="箇条書き">・</TBtn>
        <TBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="番号付きリスト">1.</TBtn>
        <div className="w-px h-5 bg-gray-300 mx-1" />
        <TBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="引用">❝</TBtn>
        <TBtn onClick={setLink} active={editor.isActive('link')} title="リンク">🔗</TBtn>
        <TBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="区切り線">—</TBtn>
        <div className="w-px h-5 bg-gray-300 mx-1" />
        <TBtn onClick={() => imgInputRef.current?.click()} title="画像を挿入">
          {imgUploading ? <span className="inline-block w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" /> : '🖼'}
        </TBtn>
        <input ref={imgInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageFile} />
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

// ── Markdownエディタ（白テーマ）──────────────────────────
function MarkdownEditor({ value, onChange }: { value: string; onChange: (md: string) => void }) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      rows={16}
      className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 text-sm resize-y font-mono"
      placeholder={'Markdownで本文を入力してください\n\n## 見出し\n\n本文テキスト'}
    />
  );
}

// ── タグ入力（白テーマ）──────────────────────────────────
function TagInput({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [input, setInput] = useState('');

  const add = () => {
    const val = input.trim();
    if (val && !tags.includes(val)) onChange([...tags, val]);
    setInput('');
  };

  return (
    <div className="flex flex-wrap gap-2 items-center px-3 py-2 rounded-xl border border-gray-300 min-h-[46px] focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 bg-white">
      {tags.map(tag => (
        <span key={tag} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
          #{tag}
          <button type="button" onClick={() => onChange(tags.filter(t => t !== tag))} className="ml-0.5 hover:text-red-500 text-xs leading-none">×</button>
        </span>
      ))}
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } if (e.key === ',') { e.preventDefault(); add(); } }}
        onBlur={add}
        placeholder={tags.length === 0 ? 'タグを入力してEnter' : '+ タグを追加'}
        className="flex-1 min-w-[120px] bg-transparent outline-none text-sm text-gray-700 placeholder:text-gray-400"
      />
    </div>
  );
}

// ── 公開ステータス切り替え（白テーマ）────────────────────
function StatusToggle({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const options = [
    { value: 'draft', label: '🔒 下書き', desc: '非公開' },
    { value: 'published', label: '🌐 公開', desc: '全員に表示' },
  ];
  return (
    <div className="flex gap-2">
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`flex-1 py-2.5 px-3 rounded-xl border text-sm font-semibold transition-all ${
            value === opt.value
              ? opt.value === 'published'
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-gray-400 bg-gray-100 text-gray-700'
              : 'border-gray-200 text-gray-400 hover:border-gray-300'
          }`}
        >
          {opt.label}
          <span className="block text-xs font-normal opacity-70">{opt.desc}</span>
        </button>
      ))}
    </div>
  );
}

const EMPTY_POST: Omit<BlogPost, 'id' | 'created_at' | 'updated_at'> = {
  title: '',
  content: '',
  content_type: 'html',
  excerpt: '',
  image_url: '',
  tags: [],
  status: 'published',
  youtube_url: '',
  external_url: '',
  published_at: '',
};

// ── 活動管理タブ ──────────────────────────────────────────────
interface Activity {
  id: string;
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  location: string;
  capacity: number;
  price: number;
  status: 'open' | 'closed' | 'cancelled';
  address?: string;
  notes?: string;
  archived_at?: string | null;
  created_at: string;
  view_count?: number;
}

interface ActivityEntry {
  id: string;
  activity_id: string;
  name: string;
  member_type: 'member' | 'normal';
  source: 'line' | 'wechat' | 'web';
  cancel_code: string;
  quantity: number;
  status: 'confirmed' | 'waitlist';
  notes: string;
  created_at: string;
}

const EMPTY_ACTIVITY: Omit<Activity, 'id' | 'created_at'> = {
  title: '',
  date: '',
  start_time: '17:00',
  end_time: '19:00',
  location: '',
  capacity: 16,
  price: 600,
  status: 'open',
  address: '',
  notes: '当日現金払い または PayPay（ID：shocchance）払い可：600円\n※チャージは2000円から（次回以降の申し込みは「チャージ済み会員」を選択してください。）',
};

const autoTitle = (date: string, start: string, end: string, location: string) => {
  if (!date || !location) return '';
  const d = new Date(date);
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  return `${d.getMonth()+1}/${d.getDate()}（${days[d.getDay()]}）${location} ${start.slice(0,5)}-${end.slice(0,5)}`;
};

const formatDateJP = (dateStr: string) => {
  const d = new Date(dateStr);
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  return `${d.getMonth() + 1}/${d.getDate()}(${days[d.getDay()]})`;
};

const sourceLabel = (s: string) => s === 'line' ? '📱 LINE' : s === 'wechat' ? '💬 WeChat' : '🌐 サイト';

const ActivityAdminTab = ({ groupId, groupSlug }: { groupId?: string; groupSlug?: string }) => {
  const isChaoxianzuTab = !!groupSlug;
  const INITIAL_ACTIVITY = isChaoxianzuTab
    ? { ...EMPTY_ACTIVITY, notes: '' }
    : EMPTY_ACTIVITY;

  const [activities, setActivities] = useState<Activity[]>([]);
  const [entries, setEntries] = useState<Record<string, ActivityEntry[]>>({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Omit<Activity, 'id' | 'created_at'>>(INITIAL_ACTIVITY);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [copyToast, setCopyToast] = useState('');

  const fetchAll = useCallback(async () => {
    let query = supabase.from('activities').select('*').order('date', { ascending: true });
    if (groupId) query = query.eq('group_id', groupId);
    const { data: acts } = await query;
    if (acts) {
      setActivities(acts);
      if (acts.length) {
        const { data: ents } = await supabase
          .from('activity_entries')
          .select('*')
          .in('activity_id', acts.map((a: Activity) => a.id))
          .order('created_at', { ascending: true });
        if (ents) {
          const grouped: Record<string, ActivityEntry[]> = {};
          for (const e of ents) {
            if (!grouped[e.activity_id]) grouped[e.activity_id] = [];
            grouped[e.activity_id].push(e);
          }
          setEntries(grouped);
        }
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleSave = async () => {
    if (!form.date) { setSaveError('日付を入力してください'); return; }
    setSaving(true);
    setSaveError('');
    const title = autoTitle(form.date, form.start_time, form.end_time, form.location);

    if (groupSlug) {
      // chaoxianzu: SECURITY DEFINER RPC経由
      const { error } = await supabase.rpc('admin_upsert_activity', {
        p_group_slug: groupSlug,
        p_edit_id: editId || null,
        p_title: title,
        p_date: form.date,
        p_start_time: form.start_time,
        p_end_time: form.end_time,
        p_location: form.location,
        p_capacity: form.capacity,
        p_price: form.price,
        p_status: form.status,
        p_address: form.address || '',
        p_notes: form.notes || '',
      });
      setSaving(false);
      if (error) { setSaveError(`保存エラー: ${error.message}`); return; }
    } else {
      // kawaguchi-warabi: 直接保存（Supabase Auth認証済み）
      const payload = { ...form, title };
      const { error } = editId
        ? await supabase.from('activities').update(payload).eq('id', editId)
        : await supabase.from('activities').insert(payload);
      setSaving(false);
      if (error) { setSaveError(`保存エラー: ${error.message}`); return; }
    }

    setShowForm(false);
    setEditId(null);
    setForm(INITIAL_ACTIVITY);
    fetchAll();
  };

  const handleEdit = (a: Activity) => {
    setEditId(a.id);
    setForm({ title: a.title, date: a.date, start_time: a.start_time, end_time: a.end_time, location: a.location, capacity: a.capacity, price: a.price, status: a.status, address: a.address || '', notes: a.notes || '' });
    setShowForm(true);
  };

  const handleArchive = async (id: string) => {
    if (!confirm('この活動をアーカイブしますか？データは保持されます。')) return;
    if (groupSlug) {
      await supabase.rpc('admin_archive_activity', { p_id: id, p_group_slug: groupSlug });
    } else {
      await supabase.from('activities').update({ archived_at: new Date().toISOString() }).eq('id', id);
    }
    fetchAll();
  };

  const handleUnarchive = async (id: string) => {
    if (groupSlug) {
      await supabase.rpc('admin_unarchive_activity', { p_id: id, p_group_slug: groupSlug });
    } else {
      await supabase.from('activities').update({ archived_at: null }).eq('id', id);
    }
    fetchAll();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('完全削除しますか？申し込みデータも削除されます。この操作は取り消せません。')) return;
    if (groupSlug) {
      await supabase.rpc('admin_delete_activity', { p_id: id, p_group_slug: groupSlug });
    } else {
      await supabase.from('activities').delete().eq('id', id);
    }
    fetchAll();
  };

  const copyWechatText = (a: Activity, actEntries: ActivityEntry[]) => {
    const suffixes = ['①', '②', '③'];
    const rows = actEntries.flatMap(e =>
      Array.from({ length: e.quantity }, (_, i) => ({
        name: e.quantity > 1 ? `${e.name}${suffixes[i] ?? i+1}` : e.name,
        notes: e.notes || '',
      }))
    );
    const header = `【${a.title}】`;
    const lines = rows.map((r, i) => `【${i+1}】姓名: ${r.name}; 备注: ${r.notes}`).join('\n');
    navigator.clipboard.writeText(`${header}\n${lines}`);
    setCopyToast('コピーしました！');
    setTimeout(() => setCopyToast(''), 2000);
  };

  const exportExcel = async (a: Activity, actEntries: ActivityEntry[]) => {
    const { utils, writeFile } = await import('xlsx');
    const suffixes = ['①', '②', '③'];
    const rows = actEntries.flatMap(e =>
      Array.from({ length: e.quantity }, (_, i) => ({
        '番号': '',
        '姓名': e.quantity > 1 ? `${e.name}${suffixes[i] ?? i+1}` : e.name,
        '種別': e.member_type === 'member' ? '会員' : '通常',
        '状態': e.status === 'waitlist' ? '補欠' : '確定',
        '流入元': sourceLabel(e.source).replace(/[📱💬🌐]\s?/g, ''),
        '備考': e.notes || '',
        '申込日時': new Date(e.created_at).toLocaleString('ja-JP'),
      }))
    );
    rows.forEach((r, i) => { r['番号'] = String(i + 1); });
    const ws = utils.json_to_sheet(rows);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, '参加者リスト');
    writeFile(wb, `${a.title}_参加者リスト.xlsx`);
  };

  const activeActivities = activities.filter(a => !a.archived_at);
  const archivedActivities = activities.filter(a => a.archived_at);
  const displayActivities = showArchived ? archivedActivities : activeActivities;

  if (loading) return <div className="py-10 text-center text-gray-400">読み込み中...</div>;

  return (
    <div>
      {copyToast && (
        <div className="fixed top-4 right-4 z-50 bg-gray-800 text-white text-sm px-4 py-2 rounded-xl shadow-lg">
          {copyToast}
        </div>
      )}
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-gray-800">活動管理</h2>
          <button
            onClick={() => setShowArchived(!showArchived)}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${showArchived ? 'bg-gray-700 text-white border-gray-700' : 'text-gray-500 border-gray-300 hover:bg-gray-50'}`}
          >
            {showArchived ? '▶ アクティブに戻る' : `📦 アーカイブ（${archivedActivities.length}件）`}
          </button>
        </div>
        <button
          onClick={() => { setShowForm(true); setEditId(null); setForm(INITIAL_ACTIVITY); }}
          className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          ＋ 活動を追加
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
          <h3 className="font-bold text-gray-800 mb-1">{editId ? '活動を編集' : '活動を作成'}</h3>
          {/* タイトルプレビュー */}
          <p className="text-xs text-gray-400 mb-4">
            タイトル自動生成：
            <span className="font-medium text-gray-600 ml-1">
              {autoTitle(form.date, form.start_time, form.end_time, form.location) || '日付・場所・時間を入力すると自動生成されます'}
            </span>
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">日付</label>
              <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">場所名</label>
              <input type="text" value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))}
                placeholder="幸栄公民館"
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">開始時刻</label>
              <input type="time" value={form.start_time} onChange={e => setForm(p => ({ ...p, start_time: e.target.value }))}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">終了時刻</label>
              <input type="time" value={form.end_time} onChange={e => setForm(p => ({ ...p, end_time: e.target.value }))}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">定員</label>
              <input type="number" value={form.capacity} onChange={e => setForm(p => ({ ...p, capacity: Number(e.target.value) }))}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">料金（円）</label>
              <input type="number" value={form.price} onChange={e => setForm(p => ({ ...p, price: Number(e.target.value) }))}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">住所</label>
              <input type="text" value={form.address || ''} onChange={e => setForm(p => ({ ...p, address: e.target.value }))}
                placeholder="埼玉県川口市幸町2-1-1"
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">支払い方法・備考</label>
              <textarea value={form.notes || ''} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                placeholder="当日現金払い（600円）またはPayPay払い可"
                rows={2}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ステータス</label>
              <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value as Activity['status'] }))}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                <option value="open">受付中</option>
                <option value="closed">締め切り</option>
                <option value="cancelled">中止</option>
              </select>
            </div>
          </div>
          {saveError && <p className="text-red-500 text-sm mt-3">{saveError}</p>}
          <div className="flex gap-3 mt-4 justify-end">
            <button onClick={() => { setShowForm(false); setEditId(null); setSaveError(''); }}
              className="px-5 py-2 border border-gray-300 rounded-xl text-sm hover:bg-gray-50">キャンセル</button>
            <button onClick={handleSave} disabled={saving}
              className="px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      )}

      {activities.length === 0 && (
        <div className="text-center py-16 text-gray-400">{showArchived ? 'アーカイブされた活動はありません' : '活動がありません'}</div>
      )}

      {displayActivities.map(a => {
        const actEntries = entries[a.id] || [];
        const used = actEntries.reduce((sum, e) => sum + e.quantity, 0);
        const remaining = a.capacity - used;
        const expanded = expandedId === a.id;

        const bySource = { line: { member: 0, normal: 0 }, wechat: { member: 0, normal: 0 }, web: { member: 0, normal: 0 } };
        for (const e of actEntries) {
          bySource[e.source][e.member_type] += e.quantity;
        }
        const memberTotal = actEntries.filter(e => e.member_type === 'member').reduce((s, e) => s + e.quantity, 0);
        const normalTotal = actEntries.filter(e => e.member_type === 'normal').reduce((s, e) => s + e.quantity, 0);

        return (
          <div key={a.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-gray-900">{a.title}</h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  {formatDateJP(a.date)}　{a.start_time.slice(0,5)}〜{a.end_time.slice(0,5)}　{a.location}
                </p>
                <p className="text-sm text-gray-500">¥{a.price.toLocaleString()} ／ 定員{a.capacity}人</p>
              </div>
              <div className="flex gap-2 flex-shrink-0 ml-3 flex-wrap justify-end">
                {!a.archived_at && <>
                  <button onClick={() => { const base = groupId ? `/chaoxianzu` : ''; navigator.clipboard.writeText(`https://kawabado.com${base}/activity/${a.id}`); setCopyToast('🇯🇵URLコピー'); setTimeout(()=>setCopyToast(''),2000); }} className="text-xs text-gray-500 hover:underline" title="日本語URL">🇯🇵URL</button>
                  <button onClick={() => { const base = groupId ? `/chaoxianzu` : ''; navigator.clipboard.writeText(`https://kawabado.com${base}/activity-cn/${a.id}?from=wechat`); setCopyToast('🇨🇳URLコピー'); setTimeout(()=>setCopyToast(''),2000); }} className="text-xs text-gray-500 hover:underline" title="中国語URL">🇨🇳URL</button>
                  <button onClick={() => copyWechatText(a, actEntries)} className="text-xs text-purple-500 hover:underline" title="WeChatテキストコピー">📋WeChat</button>
                  <button onClick={() => exportExcel(a, actEntries)} className="text-xs text-green-600 hover:underline" title="Excel出力">📊Excel</button>
                  <button onClick={() => handleEdit(a)} className="text-xs text-blue-500 hover:underline">編集</button>
                  <button onClick={() => {
                    setEditId(null);
                    setForm({ title: '', date: '', start_time: a.start_time, end_time: a.end_time, location: a.location, capacity: a.capacity, price: a.price, status: 'open', address: a.address || '', notes: a.notes || '' });
                    setShowForm(true);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }} className="text-xs text-teal-500 hover:underline">📋複製</button>
                  <button onClick={() => handleArchive(a.id)} className="text-xs text-orange-400 hover:underline">📦アーカイブ</button>
                </>}
                {a.archived_at && <>
                  <button onClick={() => handleUnarchive(a.id)} className="text-xs text-blue-400 hover:underline">↩ 復元</button>
                  <button onClick={() => handleDelete(a.id)} className="text-xs text-red-400 hover:underline">完全削除</button>
                </>}
              </div>
            </div>

            {/* 集計 */}
            <div className="mt-3 bg-gray-50 rounded-xl p-4 text-sm">
              <div className="flex items-center gap-2 mb-2">
                <span className="font-medium text-gray-800">総申込: {used}/{a.capacity}人</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${remaining <= 0 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                  {remaining <= 0 ? '満員' : `残り${remaining}枠`}
                </span>
                {a.view_count != null && (
                  <span className="text-xs text-gray-400 ml-auto">👁 閲覧数: {a.view_count}</span>
                )}
              </div>
              <div className="space-y-1 text-gray-600 border-t border-gray-200 pt-2">
                {(['line', 'wechat', 'web'] as const).map(src => {
                  const total = bySource[src].member + bySource[src].normal;
                  if (total === 0) return null;
                  return (
                    <p key={src}>{sourceLabel(src)}：{total}人（会員{bySource[src].member} / 通常{bySource[src].normal}）</p>
                  );
                })}
              </div>
              <p className="border-t border-gray-200 pt-2 mt-2 text-gray-700 font-medium">
                会員合計: {memberTotal}人　通常合計: {normalTotal}人
              </p>
            </div>

            {/* 申し込み者リスト */}
            <button
              onClick={() => setExpandedId(expanded ? null : a.id)}
              className="text-xs text-blue-500 mt-2 hover:underline"
            >
              {expanded ? '▲ 閉じる' : `▼ 申し込み者一覧（${actEntries.length}件）`}
            </button>
            {expanded && actEntries.length > 0 && (() => {
              // 1人ずつ展開した行を生成
              const suffixes = ['①', '②', '③'];
              const rows = actEntries.flatMap(e =>
                Array.from({ length: e.quantity }, (_, idx) => ({ entry: e, idx, suffix: e.quantity > 1 ? suffixes[idx] ?? String(idx+1) : '' }))
              );
              let rowNum = 0;
              return (
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left px-2 py-1.5 text-xs text-gray-500 font-medium">#</th>
                        <th className="text-left px-2 py-1.5 text-xs text-gray-500 font-medium">名前</th>
                        <th className="text-left px-2 py-1.5 text-xs text-gray-500 font-medium">種別</th>
                        <th className="text-left px-2 py-1.5 text-xs text-gray-500 font-medium">状態</th>
                        <th className="text-left px-2 py-1.5 text-xs text-gray-500 font-medium">流入元</th>
                        <th className="text-left px-2 py-1.5 text-xs text-gray-500 font-medium">備考</th>
                        <th className="text-left px-2 py-1.5 text-xs text-gray-500 font-medium">日時</th>
                        <th className="px-2 py-1.5"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(({ entry: e, idx, suffix }) => {
                        rowNum++;
                        return (
                          <tr key={`${e.id}-${idx}`} className={`border-b border-gray-50 hover:bg-gray-50 ${e.status === 'waitlist' ? 'bg-yellow-50/50' : ''}`}>
                            <td className="px-2 py-2 text-gray-400">{rowNum}</td>
                            <td className="px-2 py-2 font-medium text-gray-800">{e.name}{suffix}</td>
                            <td className="px-2 py-2">
                              <span className={`text-xs px-1.5 py-0.5 rounded-full ${e.member_type === 'member' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                                {e.member_type === 'member' ? '会員' : '通常'}
                              </span>
                            </td>
                            <td className="px-2 py-2">
                              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${e.status === 'waitlist' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'}`}>
                                {e.status === 'waitlist' ? '補欠' : '確定'}
                              </span>
                            </td>
                            <td className="px-2 py-2 text-gray-500">{sourceLabel(e.source)}</td>
                            <td className="px-2 py-2 text-gray-500 text-xs max-w-[120px] truncate" title={e.notes}>{e.notes || '-'}</td>
                            <td className="px-2 py-2 text-gray-400 text-xs whitespace-nowrap">
                              {new Date(e.created_at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td className="px-2 py-2">
                              <button
                                onClick={async () => {
                                  if (!confirm(`「${e.name}${suffix}」を削除しますか？`)) return;
                                  if (e.quantity <= 1) {
                                    await supabase.from('activity_entries').delete().eq('id', e.id);
                                  } else {
                                    await supabase.from('activity_entries').update({ quantity: e.quantity - 1 }).eq('id', e.id);
                                  }
                                  fetchAll();
                                }}
                                className="text-xs text-red-400 hover:text-red-600 hover:underline"
                              >
                                削除
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        );
      })}
    </div>
  );
};

export const AdminPage = ({ groupSlug }: { groupSlug?: string }) => {
  const isChaoxianzu = groupSlug === 'chaoxianzu';

  // chaoxianzu用シンプルパスワード認証（RPC経由でサーバー側照合）
  const [cxPassword, setCxPassword] = useState('');
  const [cxAuthed, setCxAuthed] = useState(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('cx_admin_auth') === 'true';
    }
    return false;
  });
  const [cxAuthError, setCxAuthError] = useState('');
  const [cxLogging, setCxLogging] = useState(false);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [groupIdLoaded, setGroupIdLoaded] = useState(false);

  useEffect(() => {
    const slug = isChaoxianzu ? 'chaoxianzu' : 'kawaguchi-warabi';
    supabase
      .rpc('get_group_id', { group_slug: slug })
      .then(({ data }) => {
        if (data) setGroupId(data);
        setGroupIdLoaded(true);
      });
  }, [isChaoxianzu]);

  const handleCxLogin = async () => {
    if (!cxPassword) return;
    setCxLogging(true);
    setCxAuthError('');
    const { data, error } = await supabase.rpc('check_group_password', {
      group_slug: 'chaoxianzu',
      password: cxPassword,
    });
    setCxLogging(false);
    if (error) { setCxAuthError('エラーが発生しました'); return; }
    if (data === true) {
      sessionStorage.setItem('cx_admin_auth', 'true');
      setCxAuthed(true);
    } else {
      setCxAuthError('パスワードが間違っています');
    }
  };

  const { isAuthenticated, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>(isChaoxianzu ? 'activities' : 'tournaments');

  const { tournaments, loading: tLoading, createTournament, updateTournament, deleteTournament } = useTournaments();
  const { blogPosts, loading: bLoading, createPost, updatePost, deletePost } = useBlogPosts({ includeScheduled: true });
  const [entries, setEntries] = useState<(Entry & { tournaments?: { title: string } })[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [newEntryNotice, setNewEntryNotice] = useState<string | null>(null);
  const [showCancelled, setShowCancelled] = useState(false);

  // 会員管理
  const [members, setMembers] = useState<Member[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [memberAddModalOpen, setMemberAddModalOpen] = useState(false);
  const [memberEditTarget, setMemberEditTarget] = useState<Member | null>(null);
  const [newMemberNumber, setNewMemberNumber] = useState('');
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberBalance, setNewMemberBalance] = useState('0');
  const [editMemberForm, setEditMemberForm] = useState<Partial<Member>>({});
  const [memberOpError, setMemberOpError] = useState('');

  const [showTournamentForm, setShowTournamentForm] = useState(false);
  const [editingTournament, setEditingTournament] = useState<Tournament | null>(null);
  const [tournamentForm, setTournamentForm] = useState(EMPTY_TOURNAMENT);
  const [tournamentError, setTournamentError] = useState<string | null>(null);
  const [tournamentSuccess, setTournamentSuccess] = useState(false);

  // 削除確認ダイアログ
  const [deleteConfirmTournament, setDeleteConfirmTournament] = useState<Tournament | null>(null);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('');

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
    if (isChaoxianzu) return;
    if (!authLoading && !isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, authLoading, navigate, isChaoxianzu]);

  useEffect(() => {
    if (isChaoxianzu) return;
    if (activeTab === 'entries') fetchEntries();
    if (activeTab === 'members') fetchMembers();
  }, [activeTab, isChaoxianzu]);

  // ── リアルタイム申し込み通知 ──
  useEffect(() => {
    if (isChaoxianzu) return;
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

  const fetchMembers = async () => {
    setMembersLoading(true);
    const { data } = await supabase
      .from('members')
      .select('*')
      .order('member_number', { ascending: true });
    setMembers((data || []) as Member[]);
    setMembersLoading(false);
  };

  const handleAddMember = async () => {
    setMemberOpError('');
    if (!newMemberNumber || !newMemberName.trim()) {
      setMemberOpError('会員番号と名前は必須です');
      return;
    }
    const { error } = await supabase.from('members').insert({
      member_number: parseInt(newMemberNumber),
      name: newMemberName.trim(),
      charge_balance: parseInt(newMemberBalance) || 0,
      active: true,
    });
    if (error) { setMemberOpError(error.message); return; }
    setMemberAddModalOpen(false);
    setNewMemberNumber(''); setNewMemberName(''); setNewMemberBalance('0');
    fetchMembers();
  };

  const handleUpdateMember = async (id: string, updates: Partial<Member>) => {
    await supabase.from('members').update(updates).eq('id', id);
    fetchMembers();
  };

  const callAdminFunction = async (action: 'cancel' | 'promote', entry_id: number) => {
    const res = await fetch(`${EDGE_BASE}/process-admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_KEY}` },
      body: JSON.stringify({ action, entry_id }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? `HTTP ${res.status}`);
    }
    return res.json();
  };

  const handlePromoteWaitlist = async (entryId: number, entryName: string) => {
    if (!confirm(`${entryName}さんをキャンセル待ちから繰り上げ当選にしますか？\n（参加確定メールが送信されます）`)) return;
    try {
      await callAdminFunction('promote', entryId);
      await fetchEntries();
      alert(`✅ ${entryName}さんを繰り上げ当選にしました。確定メールを送信しました。`);
    } catch (err) {
      console.error(err);
      alert('繰り上げ処理に失敗しました: ' + (err as Error).message);
    }
  };

  const handleCancelEntry = async (entryId: number, entryName: string) => {
    if (!confirm(`${entryName}さんの申し込みをキャンセルしますか？\nこの操作は取り消せません。`)) return;
    try {
      await callAdminFunction('cancel', entryId);
      await fetchEntries();
    } catch (err) {
      console.error(err);
      alert('キャンセル処理に失敗しました: ' + (err as Error).message);
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
      edition: t.edition ?? null,
      visibility: (t.visibility ?? 'published') as 'draft' | 'unlisted' | 'published',
    });
    setShowTournamentForm(true);
  };

  const handleDeleteTournament = (t: Tournament) => {
    setDeleteConfirmTournament(t);
    setDeleteConfirmInput('');
  };

  const handleDeleteTournamentConfirm = async () => {
    if (!deleteConfirmTournament) return;
    try {
      await deleteTournament(deleteConfirmTournament.id);
      setDeleteConfirmTournament(null);
      setDeleteConfirmInput('');
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

      // リッチエディタでは空の場合 <p></p> になるため実質空チェック
      const bodyText = postForm.content.replace(/<[^>]*>/g, '').trim();
      if (!bodyText && postForm.content_type === 'html') {
        setPostError('本文を入力してください');
        return;
      }

      const cleanForm = {
        ...postForm,
        image_url: finalImageUrl || undefined,
        excerpt: postForm.excerpt || undefined,
        youtube_url: postForm.youtube_url || undefined,
        external_url: postForm.external_url || undefined,
        tags: postForm.tags?.length ? postForm.tags : [],
        status: postForm.status || 'published',
        content_type: postForm.content_type || 'html',
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
      content_type: p.content_type || 'html',
      excerpt: p.excerpt || '',
      image_url: p.image_url || '',
      image_position: p.image_position || 'center center',
      tags: p.tags || [],
      status: p.status || 'published',
      youtube_url: p.youtube_url || '',
      external_url: p.external_url || '',
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

  if (authLoading && !isChaoxianzu) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // chaoxianzu: パスワード未認証の場合はログイン画面を表示
  if (isChaoxianzu && !cxAuthed) {
    return (
      <main className="max-w-sm mx-auto px-4 py-20">
        <h1 className="text-xl font-bold text-gray-900 mb-6 text-center">管理画面ログイン</h1>
        <p className="text-sm text-gray-500 mb-4 text-center">在日朝鮮族バドミントン協会</p>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <input
            type="password"
            value={cxPassword}
            onChange={e => setCxPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCxLogin()}
            placeholder="管理パスワード"
            className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-400"
            autoFocus
          />
          {cxAuthError && <p className="text-red-500 text-xs mb-3">{cxAuthError}</p>}
          <button
            onClick={handleCxLogin}
            disabled={cxLogging || !cxPassword}
            className="w-full bg-blue-600 text-white py-2.5 rounded-xl font-medium text-sm hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {cxLogging ? '確認中...' : 'ログイン'}
          </button>
        </div>
      </main>
    );
  }

  const formatDate = (str: string) => str ? new Date(str).toLocaleDateString('ja-JP') : '';

  return (
    <main className="max-w-6xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">管理画面</h1>
      {isChaoxianzu && (
        <p className="text-sm text-gray-500 mb-4">在日朝鮮族バドミントン協会</p>
      )}

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
        {(isChaoxianzu
          ? [['activities', '活動管理']] as [Tab, string][]
          : [['tournaments', '大会案内'], ['blog', 'ブログ'], ['entries', 'エントリー確認'], ['activities', '活動管理'], ['members', '会員管理']] as [Tab, string][]
        ).map(([key, label]) => (
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">第〇回（任意）</label>
                  <input
                    type="number"
                    min={1}
                    value={tournamentForm.edition ?? ''}
                    onChange={e => setTournamentForm(p => ({...p, edition: e.target.value ? Number(e.target.value) : null}))}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="例：1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">キャンセル期限</label>
                  <div className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 text-gray-500">
                    大会日の14日前（自動計算）
                  </div>
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">公開設定</label>
                  <select
                    value={tournamentForm.visibility ?? 'draft'}
                    onChange={e => setTournamentForm(p => ({...p, visibility: e.target.value as 'draft' | 'unlisted' | 'published'}))}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="draft">🔒 非公開（draft）</option>
                    <option value="unlisted">🔗 限定公開（unlisted）</option>
                    <option value="published">✅ 公開（published）</option>
                  </select>
                  <p className="text-xs text-gray-400 mt-1">非公開：一覧・URLともに非表示　限定公開：URLのみアクセス可　公開：全員に表示</p>
                </div>
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
                        <div className="flex flex-col gap-1">
                          <span className={`text-xs px-2 py-1 rounded-full font-medium w-fit ${t.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {t.status === 'active' ? '開催予定' : '中止'}
                          </span>
                          {(() => {
                            const v = t.visibility ?? 'published';
                            if (v === 'draft')     return <span className="text-xs px-2 py-1 rounded-full font-medium w-fit bg-gray-100 text-gray-600">🔒 非公開</span>;
                            if (v === 'unlisted')  return <span className="text-xs px-2 py-1 rounded-full font-medium w-fit bg-orange-100 text-orange-700">🔗 限定公開</span>;
                            return null;
                          })()}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => handleEditTournament(t)} className="text-blue-600 hover:underline mr-3">編集</button>
                        <button onClick={() => handleDeleteTournament(t)} className="text-red-500 hover:underline">削除</button>
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">サムネイル画像</label>
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
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-gray-700">本文 *</label>
                    <div className="flex gap-1">
                      {(['html', 'markdown'] as const).map(mode => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setPostForm(p => ({...p, content_type: mode}))}
                          className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                            postForm.content_type === mode
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {mode === 'html' ? '✍️ リッチテキスト' : '📝 Markdown'}
                        </button>
                      ))}
                    </div>
                  </div>
                  {postForm.content_type === 'markdown'
                    ? <MarkdownEditor value={postForm.content} onChange={v => setPostForm(p => ({...p, content: v}))} />
                    : <RichEditor key={editingPost?.id ?? 'new'} value={postForm.content} onChange={v => setPostForm(p => ({...p, content: v}))} />
                  }
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">YouTube URL</label>
                    <input
                      type="url"
                      value={postForm.youtube_url || ''}
                      onChange={e => setPostForm(p => ({...p, youtube_url: e.target.value}))}
                      className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="https://youtube.com/watch?v=..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">外部リンクURL</label>
                    <input
                      type="url"
                      value={postForm.external_url || ''}
                      onChange={e => setPostForm(p => ({...p, external_url: e.target.value}))}
                      className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="https://..."
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">タグ</label>
                  <TagInput tags={postForm.tags || []} onChange={tags => setPostForm(p => ({...p, tags}))} />
                  <p className="text-xs text-gray-400 mt-1">Enterまたはカンマで追加</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">公開ステータス</label>
                  <StatusToggle value={postForm.status || 'published'} onChange={v => setPostForm(p => ({...p, status: v as 'draft' | 'published'}))} />
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
                    {imageUploading ? '画像アップロード中...' : postForm.status === 'draft' ? '下書き保存' : '公開する'}
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
                    <th className="text-left px-4 py-3 font-medium text-gray-600">ステータス</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">公開日</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">👁 閲覧数</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {blogPosts.map(p => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{p.title}</td>
                      <td className="px-4 py-3">
                        {p.status === 'draft'
                          ? <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600 font-medium">🔒 下書き</span>
                          : <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700 font-medium">🌐 公開</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-gray-600">{formatDate(p.published_at)}</td>
                      <td className="px-4 py-3 text-gray-500">{p.view_count ?? 0}</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => handleEditPost(p)} className="text-blue-600 hover:underline mr-3">編集</button>
                        <button onClick={() => handleDeletePost(p.id)} className="text-red-500 hover:underline">削除</button>
                      </td>
                    </tr>
                  ))}
                  {blogPosts.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400">記事がありません</td></tr>
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
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-gray-800">エントリー一覧</h2>
              <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showCancelled}
                  onChange={e => setShowCancelled(e.target.checked)}
                  className="rounded"
                />
                取消済みも表示
              </label>
            </div>
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
                  {entries.filter(e => showCancelled || e.status !== 'cancelled').map((entry) => (
                    <tr key={entry.id} className={`hover:bg-gray-50 ${entry.status === 'cancelled' ? 'opacity-40 bg-gray-50' : ''}`}>
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
      {/* Activities Tab */}
      {activeTab === 'activities' && (
        !groupIdLoaded
          ? <div className="py-10 text-center text-gray-400">読み込み中...</div>
          : !groupId
            ? <div className="py-10 text-center text-red-400">グループ情報の取得に失敗しました。ページを再読み込みしてください。</div>
            : <ActivityAdminTab groupId={groupId} groupSlug={isChaoxianzu ? 'chaoxianzu' : undefined} />
      )}

      {/* Members Tab */}
      {activeTab === 'members' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-gray-800">会員管理</h2>
            <button
              onClick={() => { setMemberOpError(''); setMemberAddModalOpen(true); }}
              className="bg-yellow-500 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-yellow-600 transition-colors"
            >
              ＋ 新規会員追加
            </button>
          </div>

          {membersLoading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-4 border-yellow-200 border-t-yellow-500 rounded-full animate-spin" />
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs font-semibold text-gray-500">
                    <th className="px-4 py-3">番号</th>
                    <th className="px-4 py-3">名前</th>
                    <th className="px-4 py-3">チャージ残高</th>
                    <th className="px-4 py-3">状態</th>
                    <th className="px-4 py-3">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {members.map(m => (
                    <tr key={m.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-gray-600">{m.member_number}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{m.name}</td>
                      <td className="px-4 py-3 text-gray-800">¥{m.charge_balance.toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          m.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {m.active ? '有効' : '無効'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => { setMemberEditTarget(m); setEditMemberForm({ name: m.name, charge_balance: m.charge_balance, active: m.active }); setMemberOpError(''); }}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          編集
                        </button>
                      </td>
                    </tr>
                  ))}
                  {members.length === 0 && (
                    <tr><td colSpan={5} className="text-center py-8 text-gray-400">会員データがありません</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* 新規会員追加モーダル */}
          {memberAddModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/40" onClick={() => setMemberAddModalOpen(false)} />
              <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
                <h3 className="font-bold text-gray-900 mb-4">新規会員追加</h3>
                {memberOpError && <p className="text-red-500 text-xs mb-3">{memberOpError}</p>}
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">会員番号 *</label>
                    <input type="number" value={newMemberNumber} onChange={e => setNewMemberNumber(e.target.value)}
                      className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
                      placeholder="例：25" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">名前 *</label>
                    <input type="text" value={newMemberName} onChange={e => setNewMemberName(e.target.value)}
                      className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
                      placeholder="例：小海" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">初期チャージ残高（円）</label>
                    <input type="number" value={newMemberBalance} onChange={e => setNewMemberBalance(e.target.value)}
                      className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
                      placeholder="0" />
                  </div>
                </div>
                <div className="flex gap-3 mt-5">
                  <button onClick={() => setMemberAddModalOpen(false)}
                    className="flex-1 py-2.5 rounded-xl border border-gray-300 text-sm font-medium text-gray-600 hover:bg-gray-50">
                    キャンセル
                  </button>
                  <button onClick={handleAddMember}
                    className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white bg-yellow-500 hover:bg-yellow-600">
                    追加する
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 会員編集モーダル */}
          {memberEditTarget && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/40" onClick={() => setMemberEditTarget(null)} />
              <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
                <h3 className="font-bold text-gray-900 mb-1">会員編集</h3>
                <p className="text-xs text-gray-500 mb-4">会員番号: {memberEditTarget.member_number}</p>
                {memberOpError && <p className="text-red-500 text-xs mb-3">{memberOpError}</p>}
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">名前</label>
                    <input type="text" value={editMemberForm.name ?? ''} onChange={e => setEditMemberForm(f => ({ ...f, name: e.target.value }))}
                      className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">チャージ残高（円）</label>
                    <div className="flex gap-2 items-center">
                      <input type="number" value={editMemberForm.charge_balance ?? 0}
                        onChange={e => setEditMemberForm(f => ({ ...f, charge_balance: parseInt(e.target.value) || 0 }))}
                        className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400" />
                      <button onClick={() => setEditMemberForm(f => ({ ...f, charge_balance: (f.charge_balance ?? 0) + 600 }))}
                        className="px-3 py-2 rounded-xl bg-green-100 text-green-700 text-xs font-bold hover:bg-green-200 whitespace-nowrap">
                        ＋¥600
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="memberActive" checked={editMemberForm.active ?? true}
                      onChange={e => setEditMemberForm(f => ({ ...f, active: e.target.checked }))}
                      className="w-4 h-4 accent-yellow-500" />
                    <label htmlFor="memberActive" className="text-sm text-gray-700">有効</label>
                  </div>
                </div>
                <div className="flex gap-3 mt-5">
                  <button onClick={() => setMemberEditTarget(null)}
                    className="flex-1 py-2.5 rounded-xl border border-gray-300 text-sm font-medium text-gray-600 hover:bg-gray-50">
                    キャンセル
                  </button>
                  <button onClick={async () => {
                    await handleUpdateMember(memberEditTarget.id, editMemberForm);
                    setMemberEditTarget(null);
                  }}
                    className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white bg-yellow-500 hover:bg-yellow-600">
                    保存する
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 大会削除確認モーダル */}
      {deleteConfirmTournament && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDeleteConfirmTournament(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <span className="text-red-600 text-lg">🗑</span>
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-base">大会を削除しますか？</h3>
                <p className="text-xs text-gray-500 mt-0.5">この操作は取り消せません</p>
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
              <p className="text-sm font-medium text-red-800 break-words">{deleteConfirmTournament.title}</p>
              <p className="text-xs text-red-600 mt-0.5">{deleteConfirmTournament.event_date} ・ {deleteConfirmTournament.location}</p>
            </div>

            <p className="text-sm text-gray-600 mb-2">
              確認のため、大会名を下に入力してください：
            </p>
            <p className="text-xs text-gray-400 mb-2 font-mono bg-gray-50 px-3 py-1.5 rounded-lg break-words">
              {deleteConfirmTournament.title}
            </p>
            <input
              type="text"
              value={deleteConfirmInput}
              onChange={e => setDeleteConfirmInput(e.target.value)}
              placeholder="大会名を入力..."
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 mb-4"
              autoFocus
            />

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setDeleteConfirmTournament(null); setDeleteConfirmInput(''); }}
                className="px-5 py-2 border border-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={handleDeleteTournamentConfirm}
                disabled={deleteConfirmInput !== deleteConfirmTournament.title}
                className="px-5 py-2 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                削除する
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};
