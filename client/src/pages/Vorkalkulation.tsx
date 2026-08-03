import { useParams, Redirect } from "wouter";

// Bug 2 final (Konsolidierung Vorkalkulation-Berechnung):
// Diese Datei enthielt frueher eine komplette eigene Zusammenfassungs-/
// Preisberechnung (ZusammenfassungBlock, NachkalkulationBlock, > 2000 Zeilen)
// mit mehreren Bugs:
//   1) Hilfsmaterial (und Hauptmaterial-Flaeche) fehlten in der Materialsumme.
//   2) Rabatt/Skonto wurden vom Offertpreis ABGEZOGEN statt wie vom Betrieb
//      vorgegeben als Aufschlag AUFGERECHNET.
//   3) Das lokale VkConfig-Interface hatte kein skonto_prozent-Feld, wodurch
//      Teile dieses toten Codes nicht einmal typkorrekt waren (TS-Fehler).
// Dieser gesamte Berechnungscode war im normalen Nutzerpfad nie erreichbar
// (kein Link im Frontend zeigt auf die parameterlose Route "/vorkalkulation";
// die einzig verlinkte Route "/auftraege/:id/kalkulation" hat immer eine id
// und wurde bereits vorher direkt weitergeleitet) und wurde daher ersatzlos
// entfernt, statt ihn weiter tot im Bundle mitzuschleppen.
//
// Es gibt jetzt nur noch diese Weiterleitung auf die tatsaechliche,
// konsolidierte Vorkalkulations-Seite: /vorkalkulation/:id (Kosten +
// Preisberechnung via der einzigen gemeinsamen Funktion
// berechneVorkalkulationsAngebotspreis in shared/schema.ts; von dort
// verlinkt: /nachkalkulation/:id fuer den Soll-Ist-Vergleich + Effektiv).
export default function VorkalkulationPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  if (id) {
    return <Redirect to={`/vorkalkulation/${id}`} />;
  }

  // Route "/vorkalkulation" ohne id ist im Frontend nirgends verlinkt.
  // Ohne Auftrag-Kontext gibt es hier nichts sinnvoll anzuzeigen.
  return <Redirect to="/vorkalkulation-uebersicht" />;
}
