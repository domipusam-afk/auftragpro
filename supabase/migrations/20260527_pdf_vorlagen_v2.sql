-- ============================================================
-- Migration: PDF-Vorlagen Constraint erweitern
-- Ausführen im Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Alten Constraint entfernen
ALTER TABLE pdf_vorlagen 
  DROP CONSTRAINT IF EXISTS pdf_vorlagen_doc_typ_check;

-- 2. Neuen Constraint mit allen 7 Typen
ALTER TABLE pdf_vorlagen 
  ADD CONSTRAINT pdf_vorlagen_doc_typ_check 
  CHECK (doc_typ IN (
    'offerte',
    'rechnung', 
    'mahnung',
    'lieferschein',
    'auftragsbestaetigung',
    'lohnabrechnung',
    'stundenabrechnung'
  ));

-- 3. Neue Einträge einfügen
INSERT INTO pdf_vorlagen (doc_typ, design, header_color, footer_color, logo_pos, zahlungsfrist, mahngebuehr, einleitung, schluss, show_contact, show_page_num, logo_scale, watermark_opacity, watermark_size, watermark_pos)
VALUES 
  ('lohnabrechnung',    'A', '#6b4c2a', '#1a3a6b', 'links', '30', '0.00', '', '', true, true, 100, 15, 60, 'bottom'),
  ('stundenabrechnung', 'A', '#6b4c2a', '#1a3a6b', 'links', '30', '0.00', '', '', true, true, 100, 15, 60, 'bottom')
ON CONFLICT (doc_typ) DO NOTHING;
