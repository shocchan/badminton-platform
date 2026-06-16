import { createClient } from '@supabase/supabase-js';

interface Env {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
}

export async function onRequest(context: { env: Env }) {
  try {
    // VITE_ プレフィックスあり・なし両方を試みる（CF Pages設定名の違いに対応）
    const supabaseUrl = context.env.VITE_SUPABASE_URL || context.env.SUPABASE_URL || '';
    const supabaseKey = context.env.VITE_SUPABASE_ANON_KEY || context.env.SUPABASE_ANON_KEY || '';

    let tournaments: { id: number; updated_at: string }[] = [];

    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { data } = await supabase
        .from('tournaments')
        .select('id, updated_at')
        .eq('visibility', 'published');
      tournaments = data || [];
    }

    const staticUrls = [
      { path: '',              priority: '1.0', freq: 'weekly' },
      { path: 'activity',      priority: '0.9', freq: 'weekly' },
      { path: 'level-guide',   priority: '0.8', freq: 'monthly' },
      { path: 'faq',           priority: '0.8', freq: 'monthly' },
      { path: 'blog',          priority: '0.7', freq: 'weekly' },
      { path: 'cancel-policy', priority: '0.5', freq: 'monthly' },
    ];

    const langs = ['ja', 'zh'];
    let urls = '';

    for (const lang of langs) {
      for (const u of staticUrls) {
        const loc = u.path === ''
          ? `https://kawabado.com/${lang}/`
          : `https://kawabado.com/${lang}/${u.path}`;
        urls += `
  <url>
    <loc>${loc}</loc>
    <changefreq>${u.freq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`;
      }

      for (const t of tournaments) {
        urls += `
  <url>
    <loc>https://kawabado.com/${lang}/tournaments/${t.id}</loc>
    <lastmod>${t.updated_at}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>`;
      }
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}
</urlset>`;

    return new Response(xml, {
      headers: { 'Content-Type': 'application/xml; charset=utf-8' },
    });
  } catch (err) {
    // エラーをXMLコメントとして返す（デバッグ用）
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?>\n<!-- sitemap error: ${msg} -->\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`,
      {
        status: 200,
        headers: { 'Content-Type': 'application/xml; charset=utf-8' },
      }
    );
  }
}
