-- D2.1: Per-user, per-tenant dashboard widget and reminder preferences.
-- This migration is intentionally not applied by the application deployment.

BEGIN;

CREATE TABLE public.dashboard_user_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  visible_widgets jsonb NOT NULL DEFAULT
    '["kpi_auftraege","kpi_offerten","kpi_finanzen","umsatz_charts","faelligkeits_warnungen","neueste_auftraege","dringende_auftraege"]'::jsonb,
  widget_order jsonb NOT NULL DEFAULT
    '["kpi_auftraege","kpi_offerten","kpi_finanzen","umsatz_charts","faelligkeits_warnungen","neueste_auftraege","dringende_auftraege"]'::jsonb,
  reminder_settings jsonb NOT NULL DEFAULT
    '{"vorkalkulation_fehlt":true,"auftrag_ohne_termin":true,"rechnung_ueberfaellig":true,"angebot_ohne_antwort":true}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dashboard_user_preferences_tenant_user_key UNIQUE (tenant_id, user_id),
  CONSTRAINT dashboard_user_preferences_visible_widgets_array
    CHECK (jsonb_typeof(visible_widgets) = 'array'),
  CONSTRAINT dashboard_user_preferences_widget_order_array
    CHECK (jsonb_typeof(widget_order) = 'array'),
  CONSTRAINT dashboard_user_preferences_reminder_settings_object
    CHECK (jsonb_typeof(reminder_settings) = 'object')
);

CREATE INDEX dashboard_user_preferences_tenant_user_idx
  ON public.dashboard_user_preferences (tenant_id, user_id);

ALTER TABLE public.dashboard_user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY dashboard_user_preferences_own_row
ON public.dashboard_user_preferences
FOR ALL
TO authenticated
USING (
  user_id = auth.uid()
  AND tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
)
WITH CHECK (
  user_id = auth.uid()
  AND tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
);

COMMIT;
