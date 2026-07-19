-- =============================================================================
-- IIC Events Platform
-- Migration 004: Supabase Storage Bucket Policies
-- =============================================================================
-- Run AFTER creating the buckets in Dashboard or via CLI.
-- Bucket names: event-posters, certificates, cert-templates
-- =============================================================================

-- =============================================================================
-- BUCKET: event-posters
-- Public read (anyone can see event posters), admin write only
-- =============================================================================

-- Allow anyone to view event posters (public CDN)
create policy "event_posters_public_read"
  on storage.objects for select
  using (bucket_id = 'event-posters');

-- Only admins can upload/update posters
create policy "event_posters_admin_upload"
  on storage.objects for insert
  with check (
    bucket_id = 'event-posters'
    and auth.role() = 'authenticated'
    and public.is_admin()
  );

create policy "event_posters_admin_update"
  on storage.objects for update
  using (
    bucket_id = 'event-posters'
    and public.is_admin()
  );

create policy "event_posters_admin_delete"
  on storage.objects for delete
  using (
    bucket_id = 'event-posters'
    and public.is_admin()
  );

-- =============================================================================
-- BUCKET: certificates
-- Authenticated read (own only via signed URL), admin write
-- =============================================================================

-- Users can download their own certificate; admins download any
create policy "certificates_authenticated_read"
  on storage.objects for select
  using (
    bucket_id = 'certificates'
    and (
      public.is_admin()
      or (
        auth.role() = 'authenticated'
        -- Path format: certificates/{event_id}/{cert_number}.png
        -- We rely on signed URLs generated server-side; this is a broad auth check
        and auth.uid() is not null
      )
    )
  );

-- Only admins (Edge Functions with service role) can write certificates
create policy "certificates_admin_write"
  on storage.objects for insert
  with check (
    bucket_id = 'certificates'
    and public.is_admin()
  );

create policy "certificates_admin_update"
  on storage.objects for update
  using (
    bucket_id = 'certificates'
    and public.is_admin()
  );

create policy "certificates_admin_delete"
  on storage.objects for delete
  using (
    bucket_id = 'certificates'
    and public.is_admin()
  );

-- =============================================================================
-- BUCKET: cert-templates
-- Admin read/write only. Students never access raw templates.
-- =============================================================================

create policy "cert_templates_admin_all"
  on storage.objects for select
  using (
    bucket_id = 'cert-templates'
    and public.is_admin()
  );

create policy "cert_templates_admin_write"
  on storage.objects for insert
  with check (
    bucket_id = 'cert-templates'
    and public.is_admin()
  );

create policy "cert_templates_admin_update"
  on storage.objects for update
  using (
    bucket_id = 'cert-templates'
    and public.is_admin()
  );

create policy "cert_templates_admin_delete"
  on storage.objects for delete
  using (
    bucket_id = 'cert-templates'
    and public.is_admin()
  );
