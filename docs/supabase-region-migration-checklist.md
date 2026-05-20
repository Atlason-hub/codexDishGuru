# Supabase Region Migration Checklist

This checklist is tailored to DishGuru for moving from the current Supabase
project in Sydney to a new parallel project in a closer region, testing it,
and then cutting production over safely.

Current project ref:
- `snbreqnndprgbfgiiynd`

Current observed region:
- `Oceania (Sydney)`

Recommended target region:
- Europe, preferably the closest stable region available for your users

## Goal

Create a parallel Supabase project in Europe, migrate data and configuration,
wire the app and hosted pages to the new project for testing, validate the
full flow, and only then move production over.

## High-Level Plan

1. Create a new Supabase project in Europe
2. Export/migrate database schema and data
3. Migrate storage files
4. Recreate auth, secrets, and project configuration
5. Deploy Edge Functions to the new project
6. Wire a staging/test build to the new project
7. Run full end-to-end QA
8. Switch production app and hosted pages to the new project

## Phase 1: Create the Parallel Project

Create a new Supabase project in Europe.

Capture these new values:
- new project ref
- new Supabase URL
- new anon key
- new service role key

Keep the old Sydney project live during the full migration and test period.

## Phase 2: Database Migration

Move all schema and data from the old project to the new one.

Items to migrate:
- tables
- indexes
- functions / RPCs
- triggers
- policies
- RLS settings
- extensions
- seed/reference data

Important custom data areas in DishGuru include:
- `AppUsers`
- `companies`
- `dish_associations`
- any favorites tables
- any admin access tables
- `dish_reports`

Make sure the new project preserves:
- RLS policies
- explicit grants for Data API access on new custom tables
- RPCs used by the mobile app

After migration, verify:
- row counts on key tables
- RPCs execute successfully
- guest/global dish logic still works

## Phase 3: Storage Migration

Move all storage buckets and objects.

Buckets to verify:
- `companies`
- dish image buckets
- avatar/profile image buckets
- any other bucket used in production

Why this matters:
- the app builds many public asset URLs from Supabase storage
- missing storage migration will break logos, avatars, and dish images

After migration, verify:
- company logos load
- user avatars load
- dish images load
- uploaded image paths still match DB rows

## Phase 4: Auth and Project-Level Configuration

Recreate the project-level settings in the new Supabase project.

Verify and recreate:
- auth email templates
- email confirmation settings
- password reset settings
- site URL
- redirect URLs / allow-list
- any SMTP/provider settings if used
- auth providers if any exist beyond email/password
- JWT/auth defaults if customized

Important DishGuru hosted auth flows depend on these:
- email confirmation
- password reset
- hosted auth bridge pages
- hosted account deletion pages

## Phase 5: Edge Functions and Secrets

Redeploy Edge Functions to the new project.

Currently present in repo:
- `supabase/functions/send-feedback/index.ts`

Secrets to recreate in the new project:
- `RESEND_API_KEY`
- `FEEDBACK_FROM_EMAIL`
- `FEEDBACK_TO_EMAIL`

Then deploy:
- `send-feedback`

After deploy, verify:
- in-app feedback sends successfully
- no mail app opens
- feedback arrives at `support@dishguru.app`

## Phase 6: Repo Touchpoints to Rewire

These files are currently hardcoded to the old Supabase project URL and must be
updated when switching to the new project.

### Mobile app hardcoded project URLs

- `DishGuru/lib/supabase.ts`
- `DishGuru/lib/logo.ts`
- `DishGuru/components/AppHeader.tsx`
- `DishGuru/app/index.tsx`

### Hosted auth / account deletion pages hardcoded project URLs

- `auth-link.html`
- `auth-link-en.html`
- `account-delete.html`
- `account-delete-en.html`
- `legal-site/auth-link.html`
- `legal-site/auth-link-en.html`
- `legal-site/account-delete.html`
- `legal-site/account-delete-en.html`

### Admin web env-driven Supabase config

- `admin-web/src/config.ts`
- `admin-web/src/supabaseClient.ts`
- `admin-web/src/auth.tsx`

### Admin web server/API routes that depend on new env values

- `admin-web/api/company-users.ts`
- `admin-web/api/dish-reports.ts`
- `admin-web/api/logo.ts`
- `admin-web/api/guest-feed.ts`
- `admin-web/api/admin-access.ts`
- `admin-web/api/companies.ts`

## Phase 7: Recommended Wiring Strategy

Do not cut production over immediately.

Recommended order:

1. Keep current production project live
2. Create a test branch or staging config
3. Point only the test build and hosted staging pages to the new Europe project
4. Validate the full product on the new project
5. Only then update production

## Phase 8: Suggested Staging/Test Configuration

Before the final cutover, create a staging wiring layer:

### Mobile app

Prefer replacing hardcoded Supabase URLs with config/env values so staging and
production can be switched without editing many files again.

Best places to improve later:
- move mobile app Supabase URL/key into env/config
- move storage base URL derivation off hardcoded project ref

### Hosted pages

Create staging variants or temporarily point local copies to the new project for:
- account deletion
- auth-link email confirmation/recovery pages

### Admin web

Set staging env values:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Phase 9: End-to-End QA Checklist

Run all of these against the new Europe project before production cutover.

### Auth
- sign up with a valid company email
- sign up with an invalid domain and verify the correct error message
- email confirmation
- sign in
- sign out
- forgot password
- password reset via hosted page
- account deletion in-app
- account deletion hosted page

### Guest mode
- browse as guest
- global dishes load
- guest logo loads
- guest relaunch path works

### Home/feed
- cold start
- warm start
- favorites
- home tabs (`מנות` / `מסעדות`)
- restaurant expansion
- dish page
- edit dish page

### Upload / camera
- open camera
- upload new dish
- edit dish image
- save review
- long review text

### Storage/media
- company logo loads
- avatar loads
- dish images load
- long-press image preview works

### Reporting / feedback
- dish report submit
- feedback email send in background

### Admin web
- admin login/access
- companies listing
- logo upload/update
- dish reports
- guest feed endpoint

## Phase 10: Production Cutover

After staging passes:

1. Update mobile app to new Supabase URL/key
2. Update hosted auth/delete pages to the new project URL/key
3. Update admin-web env vars to the new project
4. Redeploy hosted pages/admin-web
5. Build new iOS and Android binaries if needed
6. Monitor auth, storage, feedback, and first-load behavior

## Phase 11: Rollback Plan

Keep rollback simple.

Before production cutover:
- do not delete the old Sydney project
- keep old secrets and configs documented
- keep the previous app build path recoverable

If something fails after cutover:
- restore app/web config to old project
- redeploy hosted pages/admin-web
- ship a hotfix build only if needed

## Biggest Risks for DishGuru

1. Hardcoded Supabase project URLs in multiple app/web files
2. Storage migration mismatch causing broken logos/images
3. Hosted auth/delete pages still pointing at the old project
4. Auth template/redirect mismatch
5. Missing service-role envs/secrets in admin-web or Edge Functions

## Strong Recommendation

Before or during this migration, convert the mobile app’s Supabase URL usage
from hardcoded values to config/env-driven values. This will make:
- staging much easier
- production cutover safer
- future migrations much less painful

## Suggested Immediate Next Steps

1. Create the new Europe project
2. Record the new:
   - project ref
   - URL
   - anon key
   - service role key
3. Migrate database + storage
4. Ask Codex to help replace hardcoded project URLs with staging-friendly config
5. Wire a test build and hosted test pages to the new project
6. Run the QA checklist above
