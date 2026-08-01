-- =========================================================
-- Troca de senha obrigatória no primeiro acesso
-- Rode este bloco inteiro no SQL Editor do Supabase.
-- =========================================================

-- 1. Nova coluna (default true para novos registros)
ALTER TABLE public.people
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT true;

-- 2. Quem já usa o app hoje (já tem auth_user_id) não é afetado
UPDATE public.people
SET must_change_password = false
WHERE auth_user_id IS NOT NULL;

-- 3. Ao vincular pela primeira vez um auth_user_id a uma pessoa,
--    exigir troca de senha automaticamente.
CREATE OR REPLACE FUNCTION public.people_flag_first_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.auth_user_id IS NOT NULL AND OLD.auth_user_id IS NULL THEN
    NEW.must_change_password := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_people_flag_first_link ON public.people;
CREATE TRIGGER trg_people_flag_first_link
  BEFORE UPDATE OF auth_user_id ON public.people
  FOR EACH ROW
  EXECUTE FUNCTION public.people_flag_first_link();
