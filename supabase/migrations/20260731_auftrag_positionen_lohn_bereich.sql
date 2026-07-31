-- Expliziter Zielbereich einer Lohn-Position in der Vorkalkulation.
-- Ersetzt das bisherige Erraten des Bereichs aus der Bezeichnung.
-- Werte: 'Avor::', 'Werkstatt::Kleine Maschinen', 'Werkstatt::Mittlere Maschinen',
--        'Werkstatt::Grosse Maschinen', 'Montage::'
-- NULL = noch nicht zugeordnet (Altbestand); wird beim Import nachgefragt.
ALTER TABLE auftrag_positionen
  ADD COLUMN IF NOT EXISTS lohn_bereich TEXT;
