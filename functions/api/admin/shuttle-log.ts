interface Env {
  VITE_SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

interface LogRequestBody {
  count: number;
  venue?: string;
  note?: string;
  logged_at?: string;
  adminToken: string;
}

// Supabase auth JWT を service role key で検証する
async function isAuthorized(token: string, supabaseUrl: string, serviceKey: string): Promise<boolean> {
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: serviceKey,
      },
    });
    return res.ok;
  } catch {
    return false;
  }
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  let body: LogRequestBody;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid json' }), { status: 400 });
  }

  if (!body.adminToken || !(await isAuthorized(body.adminToken, env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY))) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }

  if (!Number.isInteger(body.count) || body.count <= 0) {
    return new Response(JSON.stringify({ error: 'count must be a positive integer' }), {
      status: 400,
    });
  }

  const payload = {
    count: body.count,
    venue: body.venue ?? null,
    note: body.note ?? null,
    logged_at: body.logged_at ?? new Date().toISOString().slice(0, 10),
  };

  const res = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/shuttle_retirement_log`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    return new Response(JSON.stringify({ error: 'insert failed', detail: errText }), {
      status: 502,
    });
  }

  const inserted = await res.json();
  return new Response(JSON.stringify({ ok: true, inserted }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
