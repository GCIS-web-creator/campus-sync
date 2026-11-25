-- Profile Studio v4: private image uploads, custom name styling, and accessory slots.
-- Additive only: all existing URL fields, achievement IDs, RLS policies and user rows remain intact.

ALTER TABLE public.student_profile_customizations
  ADD COLUMN IF NOT EXISTS studio jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS avatar_path text,
  ADD COLUMN IF NOT EXISTS banner_path text;

ALTER TABLE public.student_profile_customizations
  DROP CONSTRAINT IF EXISTS student_profile_studio_object_check;
ALTER TABLE public.student_profile_customizations
  ADD CONSTRAINT student_profile_studio_object_check
  CHECK (jsonb_typeof(studio) = 'object');

ALTER TABLE public.student_profile_customizations
  DROP CONSTRAINT IF EXISTS student_profile_avatar_path_check;
ALTER TABLE public.student_profile_customizations
  ADD CONSTRAINT student_profile_avatar_path_check
  CHECK (avatar_path IS NULL OR avatar_path ~ ('^' || user_id::text || '/avatar/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$'));

ALTER TABLE public.student_profile_customizations
  DROP CONSTRAINT IF EXISTS student_profile_banner_path_check;
ALTER TABLE public.student_profile_customizations
  ADD CONSTRAINT student_profile_banner_path_check
  CHECK (banner_path IS NULL OR banner_path ~ ('^' || user_id::text || '/banner/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$'));

-- Private bucket: uploaded images are only exposed through short-lived signed URLs
-- issued by the authenticated Next.js route after profile visibility checks.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('profile-images', 'profile-images', false, 2097152, ARRAY['image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 2097152,
  allowed_mime_types = ARRAY['image/webp'];

DROP POLICY IF EXISTS profile_images_own_insert ON storage.objects;
CREATE POLICY profile_images_own_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'profile-images' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS profile_images_own_update ON storage.objects;
CREATE POLICY profile_images_own_update
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'profile-images' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'profile-images' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS profile_images_own_delete ON storage.objects;
CREATE POLICY profile_images_own_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'profile-images' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS profile_images_own_read ON storage.objects;
CREATE POLICY profile_images_own_read
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'profile-images' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Extend the existing server-side equipment validator. New decorations remain locked
-- until they are explicitly granted in student_profile_unlocks; this migration grants none.
CREATE OR REPLACE FUNCTION public.validate_student_profile_equipment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_badge text;
  v_avatar_deco text;
  v_profile_effect text;
  v_stops jsonb;
  v_stop text;
  v_angle numeric;
  v_stroke numeric;
  v_shadow numeric;
  v_glow numeric;
  v_weight numeric;
  v_spacing numeric;
BEGIN
  IF new.frame_style <> 'basic' AND NOT EXISTS (
    SELECT 1 FROM public.student_profile_unlocks u
    WHERE u.user_id = new.user_id
      AND u.cosmetic_id = 'frame_' || new.frame_style
  ) THEN
    RAISE EXCEPTION 'このプロフィール枠はまだ解放されていません。';
  END IF;

  IF new.avatar_effect <> 'none' AND NOT EXISTS (
    SELECT 1 FROM public.student_profile_unlocks u
    WHERE u.user_id = new.user_id
      AND u.cosmetic_id = 'effect_' || new.avatar_effect
  ) THEN
    RAISE EXCEPTION 'このアイコン演出はまだ解放されていません。';
  END IF;

  FOREACH v_badge IN ARRAY COALESCE(new.equipped_badges, ARRAY[]::text[])
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.student_profile_unlocks u
      WHERE u.user_id = new.user_id
        AND u.cosmetic_id = v_badge
    ) THEN
      RAISE EXCEPTION '所持していないバッジは装備できません。';
    END IF;
  END LOOP;

  IF new.studio IS NULL OR jsonb_typeof(new.studio) <> 'object' THEN
    RAISE EXCEPTION 'プロフィール装飾データが正しくありません。';
  END IF;

  IF new.studio ? 'equipped' THEN
    IF jsonb_typeof(new.studio->'equipped') <> 'object' THEN
      RAISE EXCEPTION 'プロフィール装飾スロットが正しくありません。';
    END IF;
    v_avatar_deco := NULLIF(new.studio #>> '{equipped,avatar_deco}', '');
    v_profile_effect := NULLIF(new.studio #>> '{equipped,profile_effect}', '');

    IF v_avatar_deco IS NOT NULL THEN
      IF v_avatar_deco NOT IN (
        'deco-sakura-fubuki','deco-sea-ripple','deco-forest-wreath','deco-meadow-flowers',
        'deco-space','deco-star','deco-mech','deco-rain','deco-rabbit','deco-plush','deco-emoji'
      ) OR NOT EXISTS (
        SELECT 1 FROM public.student_profile_unlocks u
        WHERE u.user_id = new.user_id AND u.cosmetic_id = v_avatar_deco
      ) THEN
        RAISE EXCEPTION 'このアイコン装飾はまだ解放されていません。';
      END IF;
    END IF;

    IF v_profile_effect IS NOT NULL THEN
      IF v_profile_effect NOT IN (
        'fx-sakura-drift','fx-sea-spray','fx-forest-light','fx-meadow-wind',
        'fx-space','fx-star','fx-mech','fx-rain','fx-rabbit','fx-plush','fx-emoji'
      ) OR NOT EXISTS (
        SELECT 1 FROM public.student_profile_unlocks u
        WHERE u.user_id = new.user_id AND u.cosmetic_id = v_profile_effect
      ) THEN
        RAISE EXCEPTION 'このバナー効果はまだ解放されていません。';
      END IF;
    END IF;
  END IF;

  IF new.studio ? 'name_appearance' THEN
    IF jsonb_typeof(new.studio->'name_appearance') <> 'object' THEN
      RAISE EXCEPTION '名前のカスタムスタイルが正しくありません。';
    END IF;
    v_stops := new.studio #> '{name_appearance,stops}';
    IF v_stops IS NOT NULL THEN
      IF jsonb_typeof(v_stops) <> 'array' OR jsonb_array_length(v_stops) < 1 OR jsonb_array_length(v_stops) > 8 THEN
        RAISE EXCEPTION 'グラデーション色は1〜8色で指定してください。';
      END IF;
      FOR v_stop IN SELECT jsonb_array_elements_text(v_stops)
      LOOP
        IF v_stop IS NULL OR v_stop !~ '^#[0-9A-Fa-f]{6}
          RAISE EXCEPTION 'グラデーション色の形式が正しくありません。';
        END IF;
      END LOOP;
    END IF;

    v_angle := COALESCE(NULLIF(new.studio #>> '{name_appearance,angle}', '')::numeric, 90);
    v_stroke := COALESCE(NULLIF(new.studio #>> '{name_appearance,stroke}', '')::numeric, 0);
    v_shadow := COALESCE(NULLIF(new.studio #>> '{name_appearance,shadow}', '')::numeric, 0);
    v_glow := COALESCE(NULLIF(new.studio #>> '{name_appearance,glow}', '')::numeric, 0);
    v_weight := COALESCE(NULLIF(new.studio #>> '{name_appearance,weight}', '')::numeric, 700);
    v_spacing := COALESCE(NULLIF(new.studio #>> '{name_appearance,spacing}', '')::numeric, 0);
    IF v_angle < 0 OR v_angle > 360 OR v_stroke < 0 OR v_stroke > 8
       OR v_shadow < 0 OR v_shadow > 24 OR v_glow < 0 OR v_glow > 24
       OR v_weight < 300 OR v_weight > 900 OR v_spacing < -2 OR v_spacing > 12 THEN
      RAISE EXCEPTION '名前のカスタムスタイルの範囲が正しくありません。';
    END IF;
    IF COALESCE(new.studio #>> '{name_appearance,strokeColor}', '#ffffff') !~ '^#[0-9A-Fa-f]{6}$' THEN
      RAISE EXCEPTION '縁取り色の形式が正しくありません。';
    END IF;
  END IF;

  new.updated_at := now();
  RETURN new;
END;
$function$;
 THEN
          RAISE EXCEPTION 'グラデーション色の形式が正しくありません。';
        END IF;
      END LOOP;
    END IF;

    v_angle := COALESCE(NULLIF(new.studio #>> '{name_appearance,angle}', '')::numeric, 90);
    v_stroke := COALESCE(NULLIF(new.studio #>> '{name_appearance,stroke}', '')::numeric, 0);
    v_shadow := COALESCE(NULLIF(new.studio #>> '{name_appearance,shadow}', '')::numeric, 0);
    v_glow := COALESCE(NULLIF(new.studio #>> '{name_appearance,glow}', '')::numeric, 0);
    v_weight := COALESCE(NULLIF(new.studio #>> '{name_appearance,weight}', '')::numeric, 700);
    v_spacing := COALESCE(NULLIF(new.studio #>> '{name_appearance,spacing}', '')::numeric, 0);
    IF v_angle < 0 OR v_angle > 360 OR v_stroke < 0 OR v_stroke > 8
       OR v_shadow < 0 OR v_shadow > 24 OR v_glow < 0 OR v_glow > 24
       OR v_weight < 300 OR v_weight > 900 OR v_spacing < -2 OR v_spacing > 12 THEN
      RAISE EXCEPTION '名前のカスタムスタイルの範囲が正しくありません。';
    END IF;
    IF COALESCE(new.studio #>> '{name_appearance,strokeColor}', '#ffffff') !~ '^#[0-9A-Fa-f]{6}$' THEN
      RAISE EXCEPTION '縁取り色の形式が正しくありません。';
    END IF;
  END IF;

  new.updated_at := now();
  RETURN new;
END;
$function$;
