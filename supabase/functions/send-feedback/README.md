## send-feedback

This Supabase Edge Function sends in-app feedback emails through Resend.

### Required secrets

Set these before deploying:

- `RESEND_API_KEY`
- `FEEDBACK_FROM_EMAIL`
- `FEEDBACK_TO_EMAIL` (optional, defaults to `support@dishguru.app`)

Example:

```bash
supabase secrets set \
  RESEND_API_KEY=re_xxx \
  FEEDBACK_FROM_EMAIL=feedback@your-domain.com \
  FEEDBACK_TO_EMAIL=support@dishguru.app
```

### Deploy

```bash
supabase functions deploy send-feedback
```
