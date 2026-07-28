-- =========================================================
-- PeopleZenith — rebrand + hierarquia + avatares
-- Rode este bloco inteiro no SQL Editor do Supabase.
-- =========================================================

-- 1. Novas colunas em people
ALTER TABLE public.people
  ADD COLUMN IF NOT EXISTS diretoria text,
  ADD COLUMN IF NOT EXISTS avatar_url text;

-- CHECK dos valores fixos de diretoria
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'people_diretoria_check'
  ) THEN
    ALTER TABLE public.people
      ADD CONSTRAINT people_diretoria_check
      CHECK (diretoria IS NULL OR diretoria IN (
        'Diretoria de Benefícios',
        'Diretoria de Finanças',
        'Superintendência'
      ));
  END IF;
END $$;

-- 2. Backfill: infere diretoria a partir do campo `area` (Gerência)
UPDATE public.people
SET diretoria = CASE
  WHEN area ILIKE '%benef%'          THEN 'Diretoria de Benefícios'
  WHEN area ILIKE '%finan%'          THEN 'Diretoria de Finanças'
  WHEN area ILIKE '%administr%'
    OR area ILIKE '%tecnolog%'
    OR area ILIKE '%contabil%'
    OR area ILIKE '%orçament%' OR area ILIKE '%orcament%'
    OR area ILIKE '%secretar%'       THEN 'Superintendência'
  ELSE diretoria
END
WHERE diretoria IS NULL AND area IS NOT NULL;

-- 3. Bucket público de avatares
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Policies: leitura pública, upload/update por usuário autenticado
DROP POLICY IF EXISTS "avatars public read"   ON storage.objects;
DROP POLICY IF EXISTS "avatars auth insert"   ON storage.objects;
DROP POLICY IF EXISTS "avatars auth update"   ON storage.objects;
DROP POLICY IF EXISTS "avatars auth delete"   ON storage.objects;

CREATE POLICY "avatars public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

CREATE POLICY "avatars auth insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars');

CREATE POLICY "avatars auth update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars');

CREATE POLICY "avatars auth delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars');
