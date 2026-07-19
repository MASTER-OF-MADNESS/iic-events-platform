# IIC Events Platform (V2 — Serverless Architecture)

A modern, serverless Event Management Platform for the Institution's Innovation Council (IIC) at VIT Vellore.

This platform has been entirely migrated from a legacy PHP/MySQL/XAMPP stack to a modern, highly scalable architecture using **Vite + Vanilla JS** on the frontend, and **Supabase (PostgreSQL + Auth + Storage + Edge Functions)** on the backend. 

## Features
- **Student Dashboard:** Register for events, view upcoming/past registrations, download certificates.
- **Admin Dashboard:** Full CRUD for events, dynamic registration forms, attendance tracking, and certificate generation.
- **Authentication:** Google OAuth restricted to `@vitstudent.ac.in` emails, plus email/password.
- **Certificate Engine:** Client-side HTML5 Canvas-based certificate generator with QR code verification.
- **Email Notifications:** Transactional emails powered by Supabase Edge Functions + Resend API.
- **Role-Based Access Control:** Secure Row Level Security (RLS) policies enforcing data boundaries between Students, Admins, and Super Admins.

## Technology Stack
- **Frontend:** HTML5, CSS3, Vanilla JavaScript (ES6 Modules)
- **Bundler:** Vite
- **Hosting:** Vercel
- **Backend / Database:** Supabase (PostgreSQL)
- **Auth:** Supabase Auth (JWT)
- **Storage:** Supabase Storage (Buckets for posters, certificates, templates)
- **Serverless Compute:** Supabase Edge Functions (Deno/TypeScript)

## Local Development Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Environment Variables**
   Copy `.env.example` to `.env` and fill in your Supabase project keys:
   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-public-key
   VITE_GOOGLE_CLIENT_ID=your-google-oauth-client-id
   VITE_ALLOWED_EMAIL_DOMAIN=vitstudent.ac.in
   ```

3. **Start Development Server**
   ```bash
   npm run dev
   ```
   The app will be available at `http://localhost:3000`.

## Architecture Highlights
- **Zero PHP:** All backend logic has been migrated. The UI directly queries PostgreSQL via PostgREST, heavily guarded by RLS policies.
- **Client-Side Image Processing:** The legacy PHP GD library certificate generation was completely replaced by a browser-native Canvas engine, reducing server load to zero.
- **Single Page Application Feel:** While using multi-page HTML, state and routing are smoothed out with modular JS and Supabase real-time auth state listeners.
