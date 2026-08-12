-- D3.2: Expliziter Abschlussstatus der aktiven, auftragsbezogenen
-- Nachkalkulation. Die Detailtabellen haben keine gemeinsame Kopfzeile;
-- deshalb gehört der genau einmal vorhandene Prozessstatus zum Auftrag.
--
-- Diese Migration wird bewusst separat vor dem Deployment angewendet.

BEGIN;

ALTER TABLE public.auftraege
  ADD COLUMN nachkalkulation_status text,
  ADD COLUMN nachkalkulation_abgeschlossen_am timestamptz;

-- Bestehende abgeschlossene Aufträge erhalten nur dann den finalen Status,
-- wenn mindestens eine positive IST-Position vorhanden ist. NULL/0-Positionen
-- gelten nicht als Nachweis einer bearbeiteten Nachkalkulation.
UPDATE public.auftraege a
SET nachkalkulation_status = CASE
  WHEN a.status = 'abgeschlossen' AND (
    EXISTS (
      SELECT 1
      FROM public.zeiteintraege z
      WHERE z.tenant_id = a.tenant_id
        AND z.auftrag_id = a.id
        AND COALESCE(z.dauer_minuten, 0) > 0
    )
    OR EXISTS (
      SELECT 1
      FROM public.nachkalkulation_stunden n
      WHERE n.tenant_id = a.tenant_id
        AND n.auftrag_id = a.id
        AND n.quelle = 'manuell'
        AND (COALESCE(n.ist_stunden, 0) > 0 OR COALESCE(n.total_chf, 0) > 0)
    )
    OR EXISTS (
      SELECT 1
      FROM public.nachkalkulation_material n
      WHERE n.tenant_id = a.tenant_id
        AND n.auftrag_id = a.id
        AND COALESCE(n.betrag_chf, 0) > 0
    )
    OR EXISTS (
      SELECT 1
      FROM public.nachkalkulation_fremdleistungen n
      WHERE n.tenant_id = a.tenant_id
        AND n.auftrag_id = a.id
        AND COALESCE(n.betrag_chf, 0) > 0
    )
    OR EXISTS (
      SELECT 1
      FROM public.nachkalkulation_soek n
      WHERE n.tenant_id = a.tenant_id
        AND n.auftrag_id = a.id
        AND COALESCE(n.total_chf, 0) > 0
    )
  ) THEN 'abgeschlossen'
  ELSE 'nicht_begonnen'
END
WHERE a.nachkalkulation_status IS NULL;

ALTER TABLE public.auftraege
  ALTER COLUMN nachkalkulation_status SET DEFAULT 'nicht_begonnen',
  ALTER COLUMN nachkalkulation_status SET NOT NULL,
  ADD CONSTRAINT auftraege_nachkalkulation_status_check
    CHECK (nachkalkulation_status IN ('nicht_begonnen', 'in_bearbeitung', 'abgeschlossen'));

CREATE INDEX auftraege_tenant_nachkalkulation_offen_idx
  ON public.auftraege (tenant_id, status, nachkalkulation_status, end_datum);

COMMIT;
