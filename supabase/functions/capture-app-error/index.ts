const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

const clean = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';

const scrub = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.slice(0, 20).map(scrub);
  if (!value || typeof value !== 'object') return typeof value === 'string' ? value.slice(0, 500) : value;
  const output: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>).slice(0, 30)) {
    if (/password|token|authorization|cookie|secret|group.?code|base64|image/i.test(key)) {
      output[key] = '[REDACTED]';
    } else {
      output[key] = scrub(nested);
    }
  }
  return output;
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (Number(request.headers.get('content-length') ?? '0') > 30_000) return json({ error: 'Payload too large' }, 413);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !serviceRole) return json({ error: 'Server configuration missing' }, 500);

    const payload = await request.json() as Record<string, unknown>;
    const message = clean(payload.message, 2000);
    if (!message) return json({ error: 'Error message required' }, 400);

    const authorization = request.headers.get('authorization') ?? '';
    const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? '';
    let userId: string | null = null;
    if (token && !token.startsWith('sb_publishable_')) {
      const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: { apikey: serviceRole, Authorization: `Bearer ${token}` },
      });
      if (userResponse.ok) {
        const user = await userResponse.json() as { id?: string };
        userId = user.id ?? null;
      }
    }

    let companyId: string | null = null;
    let groupId: string | null = null;
    if (userId) {
      const profileResponse = await fetch(
        `${supabaseUrl}/rest/v1/AppUsers?select=company_id,group_id&user_id=eq.${encodeURIComponent(userId)}&order=updated_at.desc&limit=1`,
        { headers: { apikey: serviceRole, Authorization: `Bearer ${serviceRole}` } },
      );
      if (profileResponse.ok) {
        const profiles = await profileResponse.json() as Array<{ company_id?: string | null; group_id?: string | null }>;
        companyId = profiles[0]?.company_id ?? null;
        groupId = profiles[0]?.group_id ?? null;
      }
    }

    const stack = clean(payload.stack, 8000);
    const screen = clean(payload.screen, 300);
    const appVersion = clean(payload.appVersion, 40);
    const fingerprintSource = `${message}\n${stack.split('\n').slice(0, 4).join('\n')}\n${screen}\n${appVersion}`;
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(fingerprintSource));
    const fingerprint = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
    const installId = clean(payload.clientInstallId, 100);
    const forwardedIp = clean(request.headers.get('x-forwarded-for')?.split(',')[0], 80);
    const clientKey = userId ? `user:${userId}` : `guest:${installId || forwardedIp || 'unknown'}`;

    const rpcResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/record_app_error`, {
      method: 'POST',
      headers: { apikey: serviceRole, Authorization: `Bearer ${serviceRole}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_fingerprint: fingerprint,
        p_error_message: message,
        p_stack_trace: stack || null,
        p_screen: screen || null,
        p_action: clean(payload.action, 200) || null,
        p_user_id: userId,
        p_company_id: companyId,
        p_group_id: groupId,
        p_client_install_id: installId || null,
        p_app_version: appVersion || null,
        p_build_version: clean(payload.buildVersion, 40) || null,
        p_platform: clean(payload.platform, 30) || null,
        p_os_version: clean(payload.osVersion, 80) || null,
        p_expo_version: clean(payload.expoVersion, 40) || null,
        p_context: scrub(payload.context ?? {}),
        p_client_key: clientKey,
      }),
    });
    if (!rpcResponse.ok) {
      const detail = await rpcResponse.text();
      return json({ error: detail.includes('rate exceeded') ? 'Rate limit exceeded' : 'Unable to record error' }, detail.includes('rate exceeded') ? 429 : 500);
    }
    return json({ ok: true });
  } catch {
    return json({ error: 'Invalid error payload' }, 400);
  }
});
