-- ============================================================
-- Migration v4: Freie Logo-Positionierung (X/Y) in pdf_vorlagen
-- Ausführen im Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Neue Spalten hinzufügen (falls noch nicht vorhanden)
ALTER TABLE pdf_vorlagen
  ADD COLUMN IF NOT EXISTS logo_offset_x INTEGER DEFAULT 100,
  ADD COLUMN IF NOT EXISTS logo_offset_y INTEGER DEFAULT 0;

-- 2. Bestehende Einträge updaten (Standard-Werte setzen, entspricht der
--    bisherigen visuellen Position: Logo oben rechts im Header)
UPDATE pdf_vorlagen
SET
  logo_offset_x = COALESCE(logo_offset_x, 100),
  logo_offset_y = COALESCE(logo_offset_y, 0)
WHERE logo_offset_x IS NULL OR logo_offset_y IS NULL;
