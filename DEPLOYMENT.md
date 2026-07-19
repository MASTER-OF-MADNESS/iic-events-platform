# Production Deployment Guide

Follow these steps to deploy the IIC Events Platform to production.

## 1. Supabase Setup (Database & Backend)

1. Create a new project on [Supabase](https://supabase.com).
2. Go to **SQL Editor** in the Supabase Dashboard.
3. Execute the SQL files from the `supabase/migrations/` folder **in exact order**:
   - `001_initial_schema.sql`
   - `002_rls_policies.sql`
   - `003_functions.sql`
   - `004_storage_policies.sql`
4. Run the `supabase/seed.sql` script to create your Super Admin account and test events. (Make sure to follow the instructions in the file to create the auth user first!).

## 2. Supabase Storage Setup
1. Go to **Storage** in the Supabase Dashboard.
2. Create three new buckets:
   - `event-posters` (Make this bucket **Public**)
   - `certificates` (Keep this **Private**)
   - `cert-templates` (Keep this **Private**)

## 3. Edge Functions Deployment
1. Install the [Supabase CLI](https://supabase.com/docs/guides/cli/getting-started).
2. Login to the CLI: `supabase login`
3. Link your project: `supabase link --project-ref your-project-id`
4. Deploy the functions:
   ```bash
   supabase functions deploy send-registration-email
   supabase functions deploy send-certificate-email
   supabase functions deploy admin-operations
   ```
5. Set the secrets for the Edge Functions in the Supabase Dashboard (Settings > Edge Functions > Secrets):
   - `RESEND_API_KEY`: Your Resend API key for sending emails.

## 4. Frontend Deployment (Vercel)

1. Push this codebase to a GitHub repository.
2. Log in to [Vercel](https://vercel.com) and click **Add New Project**.
3. Import your GitHub repository.
4. **Environment Variables**: Add the following variables in the Vercel deployment settings:
   - `VITE_SUPABASE_URL`: (From Supabase Settings > API)
   - `VITE_SUPABASE_ANON_KEY`: (From Supabase Settings > API)
   - `VITE_GOOGLE_CLIENT_ID`: (Your Google OAuth Client ID)
   - `VITE_ALLOWED_EMAIL_DOMAIN`: `vitstudent.ac.in`
   - `VITE_APP_URL`: The URL Vercel assigns you (e.g., `https://iic-events.vercel.app`)
5. **Build Command**: Vercel will automatically detect Vite and run `npm run build`.
6. Click **Deploy**.

## 5. Final Configuration
1. Go to Supabase Dashboard > **Authentication** > **URL Configuration**.
2. Add your Vercel URL (e.g., `https://iic-events.vercel.app`) to the **Site URL** and **Redirect URLs**.
3. Go to **Authentication** > **Providers** > **Google** and ensure your Client ID and Secret are configured for Google OAuth.
