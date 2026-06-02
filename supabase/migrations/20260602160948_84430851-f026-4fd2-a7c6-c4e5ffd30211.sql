CREATE OR REPLACE FUNCTION public.relatorio_showroom_kpis_comparado(
  _date_from timestamptz DEFAULT NULL,
  _date_to timestamptz DEFAULT NULL,
  _prev_from timestamptz DEFAULT NULL,
  _prev_to timestamptz DEFAULT NULL,
  _loja text DEFAULT 'todos',
  _tipo text DEFAULT 'todos'
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    COALESCE(
      (SELECT jsonb_object_agg(key || '_atual', value)
         FROM jsonb_each(public.relatorio_showroom_kpis(_date_from, _date_to, _loja, _tipo)::jsonb)),
      '{}'::jsonb
    )
    || CASE
         WHEN _prev_from IS NULL OR _prev_to IS NULL THEN '{}'::jsonb
         ELSE COALESCE(
           (SELECT jsonb_object_agg(key || '_anterior', value)
              FROM jsonb_each(public.relatorio_showroom_kpis(_prev_from, _prev_to, _loja, _tipo)::jsonb)),
           '{}'::jsonb)
       END;
$$;

CREATE OR REPLACE FUNCTION public.relatorio_vendedor_kpis_comparado(
  _user_id uuid,
  _date_from timestamptz DEFAULT NULL,
  _date_to timestamptz DEFAULT NULL,
  _prev_from timestamptz DEFAULT NULL,
  _prev_to timestamptz DEFAULT NULL,
  _loja text DEFAULT 'todos'
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    COALESCE(
      (SELECT jsonb_object_agg(key || '_atual', value)
         FROM jsonb_each(public.relatorio_vendedor_kpis(_user_id, _date_from, _date_to, _loja)::jsonb)),
      '{}'::jsonb
    )
    || CASE
         WHEN _prev_from IS NULL OR _prev_to IS NULL THEN '{}'::jsonb
         ELSE COALESCE(
           (SELECT jsonb_object_agg(key || '_anterior', value)
              FROM jsonb_each(public.relatorio_vendedor_kpis(_user_id, _prev_from, _prev_to, _loja)::jsonb)),
           '{}'::jsonb)
       END;
$$;

CREATE OR REPLACE FUNCTION public.relatorio_avaliacoes_kpis_comparado(
  _date_from timestamptz DEFAULT NULL,
  _date_to timestamptz DEFAULT NULL,
  _prev_from timestamptz DEFAULT NULL,
  _prev_to timestamptz DEFAULT NULL,
  _loja text DEFAULT 'todos'
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    COALESCE(
      (SELECT jsonb_object_agg(key || '_atual', value)
         FROM jsonb_each(public.relatorio_avaliacoes_kpis(_date_from, _date_to, _loja)::jsonb)),
      '{}'::jsonb
    )
    || CASE
         WHEN _prev_from IS NULL OR _prev_to IS NULL THEN '{}'::jsonb
         ELSE COALESCE(
           (SELECT jsonb_object_agg(key || '_anterior', value)
              FROM jsonb_each(public.relatorio_avaliacoes_kpis(_prev_from, _prev_to, _loja)::jsonb)),
           '{}'::jsonb)
       END;
$$;

CREATE OR REPLACE FUNCTION public.relatorio_estoque_kpis_comparado(
  p_cutoff timestamptz,
  p_prev_cutoff timestamptz DEFAULT NULL,
  p_loja text DEFAULT 'todos',
  p_tipo text DEFAULT 'todos'
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    COALESCE(
      (SELECT jsonb_object_agg(key || '_atual', value)
         FROM jsonb_each(public.relatorio_estoque_kpis(p_cutoff, p_loja, p_tipo)::jsonb)),
      '{}'::jsonb
    )
    || CASE
         WHEN p_prev_cutoff IS NULL THEN '{}'::jsonb
         ELSE COALESCE(
           (SELECT jsonb_object_agg(key || '_anterior', value)
              FROM jsonb_each(public.relatorio_estoque_kpis(p_prev_cutoff, p_loja, p_tipo)::jsonb)),
           '{}'::jsonb)
       END;
$$;

GRANT EXECUTE ON FUNCTION public.relatorio_showroom_kpis_comparado(timestamptz, timestamptz, timestamptz, timestamptz, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.relatorio_vendedor_kpis_comparado(uuid, timestamptz, timestamptz, timestamptz, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.relatorio_avaliacoes_kpis_comparado(timestamptz, timestamptz, timestamptz, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.relatorio_estoque_kpis_comparado(timestamptz, timestamptz, text, text) TO authenticated;