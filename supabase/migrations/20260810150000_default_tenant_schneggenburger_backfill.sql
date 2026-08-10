insert into public.tenants (slug, name, status)
values ('schneggenburger', 'Schneggenburger GmbH', 'aktiv')
on conflict (slug) do nothing;

update public.auftraege
set tenant_id = (select id from public.tenants where slug = 'schneggenburger')
where tenant_id is null;

update public.verlauf
set tenant_id = (select id from public.tenants where slug = 'schneggenburger')
where tenant_id is null;

update public.notizen
set tenant_id = (select id from public.tenants where slug = 'schneggenburger')
where tenant_id is null;

update public.dokumente
set tenant_id = (select id from public.tenants where slug = 'schneggenburger')
where tenant_id is null;

update public.dokument_daten
set tenant_id = (select id from public.tenants where slug = 'schneggenburger')
where tenant_id is null;

update public.rechnungen
set tenant_id = (select id from public.tenants where slug = 'schneggenburger')
where tenant_id is null;

update public.zeiteintraege
set tenant_id = (select id from public.tenants where slug = 'schneggenburger')
where tenant_id is null;

update public.mahnungen
set tenant_id = (select id from public.tenants where slug = 'schneggenburger')
where tenant_id is null;

update public.kalkulationen
set tenant_id = (select id from public.tenants where slug = 'schneggenburger')
where tenant_id is null;

update public.eingangsrechnungen
set tenant_id = (select id from public.tenants where slug = 'schneggenburger')
where tenant_id is null;

update public.offerten
set tenant_id = (select id from public.tenants where slug = 'schneggenburger')
where tenant_id is null;

update public.auftrag_kommentare
set tenant_id = (select id from public.tenants where slug = 'schneggenburger')
where tenant_id is null;

update public.garantien
set tenant_id = (select id from public.tenants where slug = 'schneggenburger')
where tenant_id is null;

update public.tagesrapporte
set tenant_id = (select id from public.tenants where slug = 'schneggenburger')
where tenant_id is null;

update public.reklamationen
set tenant_id = (select id from public.tenants where slug = 'schneggenburger')
where tenant_id is null;

update public.liefertermine
set tenant_id = (select id from public.tenants where slug = 'schneggenburger')
where tenant_id is null;

update public.auftrag_schritte
set tenant_id = (select id from public.tenants where slug = 'schneggenburger')
where tenant_id is null;

update public.auftrag_schritt_fotos
set tenant_id = (select id from public.tenants where slug = 'schneggenburger')
where tenant_id is null;

update public.auftrag_positionen
set tenant_id = (select id from public.tenants where slug = 'schneggenburger')
where tenant_id is null;

update public.aufgaben
set tenant_id = (select id from public.tenants where slug = 'schneggenburger')
where tenant_id is null;

update public.rechnungsvorlagen
set tenant_id = (select id from public.tenants where slug = 'schneggenburger')
where tenant_id is null;

update public.foto_dokumentation
set tenant_id = (select id from public.tenants where slug = 'schneggenburger')
where tenant_id is null;

update public.formulare
set tenant_id = (select id from public.tenants where slug = 'schneggenburger')
where tenant_id is null;

update public.chat_nachrichten
set tenant_id = (select id from public.tenants where slug = 'schneggenburger')
where tenant_id is null;

update public.pdf_vorlagen
set tenant_id = (select id from public.tenants where slug = 'schneggenburger')
where tenant_id is null;

update public.kunden
set tenant_id = (select id from public.tenants where slug = 'schneggenburger')
where tenant_id is null;

update public.mitarbeiter
set tenant_id = (select id from public.tenants where slug = 'schneggenburger')
where tenant_id is null;

update public.termine
set tenant_id = (select id from public.tenants where slug = 'schneggenburger')
where tenant_id is null;

update public.plantafel
set tenant_id = (select id from public.tenants where slug = 'schneggenburger')
where tenant_id is null;

update public.ferien
set tenant_id = (select id from public.tenants where slug = 'schneggenburger')
where tenant_id is null;

update public.lieferanten
set tenant_id = (select id from public.tenants where slug = 'schneggenburger')
where tenant_id is null;

update public.materialbestellungen
set tenant_id = (select id from public.tenants where slug = 'schneggenburger')
where tenant_id is null;

update public.stundensaetze
set tenant_id = (select id from public.tenants where slug = 'schneggenburger')
where tenant_id is null;

update public.einstellungen
set tenant_id = (select id from public.tenants where slug = 'schneggenburger')
where tenant_id is null;

update public.auftrag_status_pipeline
set tenant_id = (select id from public.tenants where slug = 'schneggenburger')
where tenant_id is null;

update public.lager_artikel
set tenant_id = (select id from public.tenants where slug = 'schneggenburger')
where tenant_id is null;

update public.lager_buchungen
set tenant_id = (select id from public.tenants where slug = 'schneggenburger')
where tenant_id is null;

update public.subunternehmer
set tenant_id = (select id from public.tenants where slug = 'schneggenburger')
where tenant_id is null;

update public.vorkalkulation_stunden
set tenant_id = (select id from public.tenants where slug = 'schneggenburger')
where tenant_id is null;

update public.vorkalkulation_material
set tenant_id = (select id from public.tenants where slug = 'schneggenburger')
where tenant_id is null;

update public.vorkalkulation_hilfsmaterial
set tenant_id = (select id from public.tenants where slug = 'schneggenburger')
where tenant_id is null;

update public.vorkalkulation_hauptmaterial_flaeche
set tenant_id = (select id from public.tenants where slug = 'schneggenburger')
where tenant_id is null;

update public.vorkalkulation_fremdleistungen
set tenant_id = (select id from public.tenants where slug = 'schneggenburger')
where tenant_id is null;

update public.vorkalkulation_soek
set tenant_id = (select id from public.tenants where slug = 'schneggenburger')
where tenant_id is null;

update public.vorkalkulation_config
set tenant_id = (select id from public.tenants where slug = 'schneggenburger')
where tenant_id is null;

update public.vorkalkulation
set tenant_id = (select id from public.tenants where slug = 'schneggenburger')
where tenant_id is null;

update public.vk_hauptmaterial
set tenant_id = (select id from public.tenants where slug = 'schneggenburger')
where tenant_id is null;

update public.vk_hilfsmaterial
set tenant_id = (select id from public.tenants where slug = 'schneggenburger')
where tenant_id is null;

update public.vk_fremdleistungen
set tenant_id = (select id from public.tenants where slug = 'schneggenburger')
where tenant_id is null;

update public.vk_stunden
set tenant_id = (select id from public.tenants where slug = 'schneggenburger')
where tenant_id is null;

update public.vk_soek
set tenant_id = (select id from public.tenants where slug = 'schneggenburger')
where tenant_id is null;

update public.nachkalkulation
set tenant_id = (select id from public.tenants where slug = 'schneggenburger')
where tenant_id is null;

update public.nk_positionen
set tenant_id = (select id from public.tenants where slug = 'schneggenburger')
where tenant_id is null;

update public.nk_stunden
set tenant_id = (select id from public.tenants where slug = 'schneggenburger')
where tenant_id is null;

update public.nachkalkulation_stunden
set tenant_id = (select id from public.tenants where slug = 'schneggenburger')
where tenant_id is null;

update public.nachkalkulation_material
set tenant_id = (select id from public.tenants where slug = 'schneggenburger')
where tenant_id is null;

update public.nachkalkulation_fremdleistungen
set tenant_id = (select id from public.tenants where slug = 'schneggenburger')
where tenant_id is null;

update public.nachkalkulation_soek
set tenant_id = (select id from public.tenants where slug = 'schneggenburger')
where tenant_id is null;
