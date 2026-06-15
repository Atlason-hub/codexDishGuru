const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type FeedbackPayload = {
  message?: string;
  email?: string | null;
  locale?: string | null;
  platform?: string | null;
  pathname?: string | null;
  isGuestMode?: boolean;
  userId?: string | null;
  subject?: string | null;
  title?: string | null;
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const fromEmail = Deno.env.get('FEEDBACK_FROM_EMAIL');
    const toEmail = Deno.env.get('FEEDBACK_TO_EMAIL') ?? 'support@dishguru.app';

    if (!resendApiKey || !fromEmail) {
      return new Response(JSON.stringify({ error: 'Missing feedback email configuration' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload = (await request.json()) as FeedbackPayload;
    const message = payload.message?.trim() ?? '';
    if (!message) {
      return new Response(JSON.stringify({ error: 'Feedback message is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const submittedAt = new Date().toISOString();
    const subjectLine = payload.subject?.trim() || 'DishGuru Feedback';
    const heading = payload.title?.trim() || 'New DishGuru feedback';
    const emailLabel = payload.email?.trim() || 'Guest';
    const localeLabel = payload.locale?.trim() || 'unknown';
    const platformLabel = payload.platform?.trim() || 'unknown';
    const pathLabel = payload.pathname?.trim() || '/';
    const userIdLabel = payload.userId?.trim() || 'none';
    const guestLabel = payload.isGuestMode ? 'yes' : 'no';
    const safeMessage = message
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');

    const textBody = [
      heading,
      '',
      `Submitted at: ${submittedAt}`,
      `Email: ${emailLabel}`,
      `User ID: ${userIdLabel}`,
      `Guest mode: ${guestLabel}`,
      `Locale: ${localeLabel}`,
      `Platform: ${platformLabel}`,
      `Screen: ${pathLabel}`,
      '',
      'Feedback:',
      message,
    ].join('\n');

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f1a17;">
        <h2 style="margin: 0 0 16px;">${heading}</h2>
        <p><strong>Submitted at:</strong> ${submittedAt}</p>
        <p><strong>Email:</strong> ${emailLabel}</p>
        <p><strong>User ID:</strong> ${userIdLabel}</p>
        <p><strong>Guest mode:</strong> ${guestLabel}</p>
        <p><strong>Locale:</strong> ${localeLabel}</p>
        <p><strong>Platform:</strong> ${platformLabel}</p>
        <p><strong>Screen:</strong> ${pathLabel}</p>
        <hr style="margin: 20px 0; border: 0; border-top: 1px solid #ddd;" />
        <p style="white-space: pre-wrap;"><strong>Feedback:</strong><br />${safeMessage}</p>
      </div>
    `;

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [toEmail],
        subject: payload.email ? `${subjectLine} - ${payload.email}` : subjectLine,
        text: textBody,
        html: htmlBody,
        reply_to: payload.email?.trim() || undefined,
      }),
    });

    if (!resendResponse.ok) {
      const errorText = await resendResponse.text();
      return new Response(JSON.stringify({ error: errorText || 'Failed to send feedback email' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const resendPayload = (await resendResponse.json().catch(() => null)) as
      | { id?: string | null }
      | null;
    const resendId = resendPayload?.id?.trim() || null;

    return new Response(JSON.stringify({ ok: true, resendId }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unexpected error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
