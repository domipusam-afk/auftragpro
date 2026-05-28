-- ============================================================
-- Migration v3: Absender-Position Felder in pdf_vorlagen
-- Ausführen im Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Neue Spalten hinzufügen (falls noch nicht vorhanden)
ALTER TABLE pdf_vorlagen
  ADD COLUMN IF NOT EXISTS absender_pos_h   TEXT DEFAULT 'links',
  ADD COLUMN IF NOT EXISTS absender_top_mm  INTEGER DEFAULT 55;

-- 2. Bestehende Einträge updaten (Standard-Werte setzen)
UPDATE pdf_vorlagen
SET
  absender_pos_h  = COALESCE(absender_pos_h, 'links'),
  absender_top_mm = COALESCE(absender_top_mm, 55)
WHERE absender_pos_h IS NULL OR absender_top_mm IS NULL;
