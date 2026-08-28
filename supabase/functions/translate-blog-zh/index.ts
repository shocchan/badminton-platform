// ブログ記事の中国語版を自動生成する。
//
// 日本語版を書いて公開したら、中国語版も同じ形で出したい。手で訳し直していると
// 「日本語版だけ画像を足して中国語版が古いまま」が起きる（2026-08-28に実際に発生した）。
//
// 本文HTMLはタグを翻訳に触れさせない。テキストノードだけを抜き出して訳し、
// 元のHTMLに戻す。画像URL・リンク・style は1文字も変わらない。
// 訳した時点の日本語本文のハッシュを保存し、日本語が更新されたら作り直せるようにする。
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = Deno.env.get("BLOG_TRANSLATE_MODEL") ?? "gpt-4o";
/** 1回のリクエストで送るセグメント数。長い記事は分割して送る */
const CHUNK = 40;

/** タグとテキストに分解する */
const splitHtml = (html: string) => html.split(/(<[^>]+>)/);

const textIndexes = (parts: string[]) =>
  parts.map((p, i) => (!p.startsWith("<") && p.trim() ? i : -1)).filter((i) => i >= 0);

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const SYSTEM = [
  "あなたは日本語から簡体字中国語への翻訳者です。",
  "バドミントンサークル kawabado（川口・蕨バドミントン交流会）のブログ記事を訳します。",
  "",
  "厳守すること:",
  "- 入力は JSON 配列。要素数と同じ数の配列だけを返す（説明文を書かない）。",
  "- i番目の訳を i番目に入れる。並べ替え・統合・分割をしない。",
  "- 日本の人名・地名・施設名・大会名は日本語表記のまま残す（例: 芝園公民館、川口・蕨バド交流杯、西田 元）。",
  "- 絵文字・記号・数字・スコア表記（21-15 など）はそのまま残す。",
  "- URL とメールアドレスは翻訳しない。",
  "- 話し言葉のトーンを保つ。硬い書き言葉にしない。",
].join("\n");

async function translateBatch(texts: string[], apiKey: string): Promise<string[]> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `次の配列を訳し、{"items": [...]} の形で返してください。\n${JSON.stringify(texts)}`,
        },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error("translate API error:", res.status, body.slice(0, 300));
    throw new Error("translation_api_failed");
  }
  const data = await res.json();
  const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
  const items = parsed.items ?? parsed.result ?? parsed.translations;
  if (!Array.isArray(items) || items.length !== texts.length) {
    console.error("translate length mismatch:", texts.length, Array.isArray(items) ? items.length : typeof items);
    throw new Error("translation_length_mismatch");
  }
  return items.map((v: unknown) => String(v ?? ""));
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status,
    });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const apiKey = Deno.env.get("OPENAI_API_KEY")?.trim();
    if (!apiKey) return json({ error: "翻訳機能が設定されていません" }, 503);

    // 管理者だけが実行できる（無関係な人にAPIを叩かせない）
    const authHeader = req.headers.get("Authorization") ?? "";
    const userToken = authHeader.replace(/^Bearer\s+/i, "");
    if (!userToken || userToken === anonKey) {
      return json({ error: "管理者としてログインしてください" }, 401);
    }
    const meRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${userToken}` },
    });
    const me = await meRes.json();
    if (!meRes.ok || !me?.id) return json({ error: "管理者としてログインしてください" }, 401);

    const dbHeaders = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    };
    const adminRes = await fetch(
      `${supabaseUrl}/rest/v1/site_admins?user_id=eq.${me.id}&select=user_id`,
      { headers: dbHeaders },
    );
    if (!(await adminRes.json())?.length) {
      return json({ error: "この操作は管理者のみ実行できます" }, 403);
    }

    const { post_id, force } = await req.json();
    if (!post_id) return json({ error: "post_id は必須です" }, 400);

    const postRes = await fetch(
      `${supabaseUrl}/rest/v1/blog_posts?id=eq.${post_id}` +
        `&select=id,title,excerpt,content,content_type,content_zh,content_zh_hash`,
      { headers: dbHeaders },
    );
    const post = (await postRes.json())?.[0];
    if (!post) return json({ error: "記事が見つかりません" }, 404);

    const hash = await sha256(`${post.title} ${post.excerpt ?? ""} ${post.content}`);
    // すでに最新の日本語版から作られた中国語版があるなら作り直さない（APIを無駄に叩かない）
    if (!force && post.content_zh && post.content_zh_hash === hash) {
      return json({ skipped: true, reason: "already_up_to_date" });
    }

    const isHtml = post.content_type !== "markdown";
    const parts = isHtml ? splitHtml(post.content) : [post.content];
    const idxs = isHtml ? textIndexes(parts) : [0];

    // タイトルと抜粋も同じ流れで訳す（先頭2つに混ぜる）
    const sources = [post.title, post.excerpt ?? "", ...idxs.map((i) => parts[i])];

    const translated: string[] = [];
    for (let i = 0; i < sources.length; i += CHUNK) {
      translated.push(...(await translateBatch(sources.slice(i, i + CHUNK), apiKey)));
    }

    const titleZh = translated[0];
    const excerptZh = translated[1];
    const bodyZh = translated.slice(2);
    if (bodyZh.length !== idxs.length) return json({ error: "翻訳結果の数が合いません" }, 502);

    let contentZh: string;
    if (isHtml) {
      const out = [...parts];
      idxs.forEach((partIndex, n) => {
        const orig = parts[partIndex];
        const lead = orig.slice(0, orig.length - orig.trimStart().length);
        const trail = orig.slice(orig.trimEnd().length);
        out[partIndex] = lead + bodyZh[n].trim() + trail;
      });
      contentZh = out.join("");
    } else {
      contentZh = bodyZh[0];
    }

    // 画像が落ちていないことを保存前に確認する（欠けた中国語版を公開しない）
    const countImg = (s: string) => (s.match(/<img/g) || []).length;
    if (isHtml && countImg(contentZh) !== countImg(post.content)) {
      console.error("image count mismatch", countImg(post.content), countImg(contentZh));
      return json({ error: "翻訳結果の本文構造が一致しません。中国語版は更新していません。" }, 502);
    }

    const upRes = await fetch(`${supabaseUrl}/rest/v1/blog_posts?id=eq.${post.id}`, {
      method: "PATCH",
      headers: dbHeaders,
      body: JSON.stringify({
        title_zh: titleZh,
        excerpt_zh: excerptZh,
        content_zh: contentZh,
        content_zh_hash: hash,
        updated_at: new Date().toISOString(),
      }),
    });
    if (!upRes.ok) {
      console.error("blog_posts update error:", await upRes.text());
      return json({ error: "中国語版の保存に失敗しました" }, 500);
    }

    return json({ success: true, title_zh: titleZh, segments: bodyZh.length });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("translate-blog-zh error:", msg);
    if (msg === "translation_length_mismatch") {
      return json({ error: "翻訳結果の数が合いませんでした。もう一度お試しください。" }, 502);
    }
    return json({ error: "翻訳中にエラーが発生しました" }, 500);
  }
});
