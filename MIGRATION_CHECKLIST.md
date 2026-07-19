# Post-Migration Checklist

Here is a checklist of the manual steps you need to perform to finalize the transition to the new architecture.

- [ ] **Create Supabase Project:** Log in to Supabase and create a new project.
- [ ] **Run Database Migrations:** Run the 4 `.sql` scripts in `supabase/migrations/` sequentially in the Supabase SQL Editor.
- [ ] **Create Super Admin:** In the Supabase Dashboard, go to **Authentication > Users** and manually create a user (e.g. `admin@iic.vit.ac.in`). Copy their UUID, update the `supabase/seed.sql` file with this UUID, and run the seed script.
- [ ] **Setup Storage Buckets:** Create `event-posters` (Public), `certificates` (Private), and `cert-templates` (Private) buckets.
- [ ] **Deploy Edge Functions:** Use the Supabase CLI to deploy the three Edge Functions in the `supabase/functions/` directory.
- [ ] **Create Resend Account:** Sign up at Resend.com, get an API key, and set it as a secret in Supabase for the Edge Functions (`RESEND_API_KEY`).
- [ ] **Set Environment Variables:** Configure the `.env` file locally for testing, and set up the variables in Vercel for production.
- [ ] **Deploy to Vercel:** Push your repository to GitHub and link it to Vercel.

**Note on Legacy Files:**
All legacy PHP files and the MySQL schema have already been safely deleted from your codebase. The frontend remains exactly the same visually, but is now fully serverless!
