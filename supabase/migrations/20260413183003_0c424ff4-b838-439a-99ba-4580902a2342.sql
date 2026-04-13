
-- Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Programar el cron job diario a las 3:00 AM UTC
SELECT cron.schedule(
  'daily-inventory-snapshot',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://kqqmuphmjvtlzqrbozfl.supabase.co/functions/v1/cron-inventory-snapshot',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtxcW11cGhtanZ0bHpxcmJvemZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4NTgyODEsImV4cCI6MjA4NDQzNDI4MX0.XG58D7HE58u3nXeZ77oy8dCOj6uoegvicS1TrUOOQDs"}'::jsonb,
    body := '{"time": "scheduled"}'::jsonb
  ) AS request_id;
  $$
);
