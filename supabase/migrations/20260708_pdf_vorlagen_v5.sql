ALTER TABLE pdf_vorlagen
  ADD COLUMN IF NOT EXISTS slogan_offset_x INTEGER DEFAULT 0;

UPDATE pdf_vorlagen
SET slogan_offset_x = COALESCE(slogan_offset_x, 0)
WHERE slogan_offset_x IS NULL;
