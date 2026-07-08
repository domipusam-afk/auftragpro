ALTER TABLE pdf_vorlagen
  ADD COLUMN IF NOT EXISTS fusstext TEXT DEFAULT '';

UPDATE pdf_vorlagen
SET fusstext = COALESCE(fusstext, '')
WHERE fusstext IS NULL;
