import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { FileText, Upload, X, Save, Eye } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface PdfVorlage {
  doc_typ: string;
  design: string;
  slogan: string;
  header_color: string;
  footer_color: string;
  logo_pos: string;
  zahlungsfrist: string;
  mahngebuehr: string;
  einleitung: string;
  schluss: string;
  show_contact: boolean;
  show_page_num: boolean;
  logo_data_url: string | null;
  logo_scale: number;
  watermark_data_url: string | null;
  watermark_opacity: number;
  watermark_size: number;
  watermark_pos: string;
  absender_pos_h: string;   // "links" | "mitte" | "rechts"
  absender_top_mm: number;  // Abstand oben in mm (für Couvertfenster)
  absender_left_mm: number; // Abstand links in mm (horizontaler Versatz)
  // Ansprechperson
  ansprechperson_aktiv: boolean;
  ansprechperson_label: string;  // z.B. "Ansprechperson" oder "Sachbearbeiter"
  ansprechperson_quelle: string; // "manuell" | "intern" | "extern"
  // Block-Positionen
  block_positions: {
    header?: { top: number; left: number; width: number };
    empfaenger?: { top: number; left: number; width: number };
    meta?: { top: number; left: number; width: number; align: string };
    ansprechperson?: { top: number; left: number; width: number };
  };
  // Positionstexte
  positionstexte: {
    pos: string;
    beschreibung: string;
    menge: string;
    einheit: string;
    preis: string;
    total: string;
  };
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DOC_TYPES = [
  { key: "offerte", label: "Offerte" },
  { key: "rechnung", label: "Rechnung" },
  { key: "mahnung", label: "Mahnung" },
  { key: "lieferschein", label: "Lieferschein" },
  { key: "auftragsbestaetigung", label: "Auftragsbestätigung" },
  { key: "lohnabrechnung", label: "Lohnabrechnung" },
  { key: "stundenabrechnung", label: "Stundenabrechnung" },
  { key: "vorkalkulation", label: "Vorkalkulation" },
  { key: "nachkalkulation", label: "Nachkalkulation" },
];

const WATERMARK_POSITIONS = [
  { value: "bottom", label: "Unten Mitte" },
  { value: "bottom-left", label: "Unten Links" },
  { value: "bottom-right", label: "Unten Rechts" },
  { value: "center", label: "Mitte" },
  { value: "top", label: "Oben Mitte" },
  { value: "full", label: "Ganzes Blatt" },
];

const DEFAULT_VORLAGE = (doc_typ: string): PdfVorlage => ({
  doc_typ,
  design: "A",
  slogan: "Qualität & Verlässlichkeit",
  header_color: "#6b4c2a",
  footer_color: "#1a3a6b",
  logo_pos: "links",
  zahlungsfrist: "30",
  mahngebuehr: "30.00",
  einleitung: "Sehr geehrte Damen und Herren,\n\nvielen Dank für Ihr Vertrauen.",
  schluss: "Wir freuen uns auf Ihre Rückmeldung.\n\nMit freundlichen Grüssen\nSchneggenburger GmbH",
  show_contact: true,
  show_page_num: true,
  logo_data_url: null,
  logo_scale: 100,
  watermark_data_url: null,
  watermark_opacity: 15,
  watermark_size: 60,
  watermark_pos: "bottom",
  absender_pos_h: "links",
  absender_top_mm: 55,
  absender_left_mm: 0,
  ansprechperson_aktiv: true,
  ansprechperson_label: "Ansprechperson",
  ansprechperson_quelle: "manuell",
  block_positions: {},
  positionstexte: { pos: "Pos.", beschreibung: "Beschreibung", menge: "Menge", einheit: "Einheit", preis: "Preis", total: "Total" },
});

// ─── A4 Preview Renderer ─────────────────────────────────────────────────────

function getWatermarkStyle(pos: string, size: number, opacity: number): string {
  const opacityVal = opacity / 100;
  const sizeVal = `${size}%`;

  const baseStyle = `position:absolute;opacity:${opacityVal};pointer-events:none;`;

  if (pos === "full") {
    return `${baseStyle}inset:0;width:100%;height:100%;object-fit:cover;z-index:1;`;
  }

  const widthStyle = `width:${sizeVal};max-width:${sizeVal};`;

  switch (pos) {
    case "bottom":
      return `${baseStyle}${widthStyle}bottom:24px;left:50%;transform:translateX(-50%);z-index:1;`;
    case "bottom-left":
      return `${baseStyle}${widthStyle}bottom:24px;left:16px;z-index:1;`;
    case "bottom-right":
      return `${baseStyle}${widthStyle}bottom:24px;right:16px;z-index:1;`;
    case "center":
      return `${baseStyle}${widthStyle}top:50%;left:50%;transform:translate(-50%,-50%);z-index:1;`;
    case "top":
      return `${baseStyle}${widthStyle}top:24px;left:50%;transform:translateX(-50%);z-index:1;`;
    default:
      return `${baseStyle}${widthStyle}bottom:24px;left:50%;transform:translateX(-50%);z-index:1;`;
  }
}

function getDocTitle(docTyp: string): string {
  const titles: Record<string, string> = {
    offerte: "OFFERTE",
    rechnung: "RECHNUNG",
    mahnung: "MAHNUNG",
    lieferschein: "LIEFERSCHEIN",
    auftragsbestaetigung: "AUFTRAGSBESTÄTIGUNG",
    lohnabrechnung: "LOHNABRECHNUNG",
    stundenabrechnung: "STUNDENABRECHNUNG",
    vorkalkulation: "VORKALKULATION",
    nachkalkulation: "NACHKALKULATION",
  };
  return titles[docTyp] ?? docTyp.toUpperCase();
}

function getSampleRows(docTyp: string): string {
  if (docTyp === "lieferschein") {
    return `
      <tr style="border-bottom:1px solid #eee;">
        <td style="padding:3px 4px;">1</td>
        <td style="padding:3px 4px;">Holzplatte 200×100cm</td>
        <td style="padding:3px 4px;text-align:right;">2 St.</td>
        <td style="padding:3px 4px;text-align:right;">✓</td>
      </tr>
      <tr style="border-bottom:1px solid #eee;">
        <td style="padding:3px 4px;">2</td>
        <td style="padding:3px 4px;">Scharniere Stahl</td>
        <td style="padding:3px 4px;text-align:right;">8 St.</td>
        <td style="padding:3px 4px;text-align:right;">✓</td>
      </tr>
      <tr>
        <td style="padding:3px 4px;">3</td>
        <td style="padding:3px 4px;">Schrauben M6×30</td>
        <td style="padding:3px 4px;text-align:right;">24 St.</td>
        <td style="padding:3px 4px;text-align:right;">✓</td>
      </tr>
    `;
  }
  if (docTyp === "mahnung") {
    return `
      <tr style="border-bottom:1px solid #eee;">
        <td style="padding:3px 4px;">RE-2024-042</td>
        <td style="padding:3px 4px;">Offene Rechnung</td>
        <td style="padding:3px 4px;text-align:right;">01.03.2024</td>
        <td style="padding:3px 4px;text-align:right;">CHF 1'850.00</td>
      </tr>
      <tr style="border-bottom:1px solid #eee;">
        <td style="padding:3px 4px;"></td>
        <td style="padding:3px 4px;">Mahngebühr</td>
        <td style="padding:3px 4px;"></td>
        <td style="padding:3px 4px;text-align:right;">CHF 30.00</td>
      </tr>
    `;
  }
  return `
    <tr style="border-bottom:1px solid #eee;">
      <td style="padding:3px 4px;">1</td>
      <td style="padding:3px 4px;">Tischlerarbeit Eiche massiv</td>
      <td style="padding:3px 4px;text-align:right;">8 h</td>
      <td style="padding:3px 4px;text-align:right;">CHF 120.00</td>
      <td style="padding:3px 4px;text-align:right;">CHF 960.00</td>
    </tr>
    <tr style="border-bottom:1px solid #eee;">
      <td style="padding:3px 4px;">2</td>
      <td style="padding:3px 4px;">Material Holz & Beschläge</td>
      <td style="padding:3px 4px;text-align:right;">1 Psch.</td>
      <td style="padding:3px 4px;text-align:right;">CHF 340.00</td>
      <td style="padding:3px 4px;text-align:right;">CHF 340.00</td>
    </tr>
    <tr>
      <td style="padding:3px 4px;">3</td>
      <td style="padding:3px 4px;">Lieferung & Montage</td>
      <td style="padding:3px 4px;text-align:right;">1 Psch.</td>
      <td style="padding:3px 4px;text-align:right;">CHF 80.00</td>
      <td style="padding:3px 4px;text-align:right;">CHF 80.00</td>
    </tr>
  `;
}

function getSampleTableHeader(docTyp: string): string {
  if (docTyp === "lieferschein") {
    return `<tr style="background:#f5f5f5;font-weight:600;">
      <th style="padding:3px 4px;text-align:left;">Pos</th>
      <th style="padding:3px 4px;text-align:left;">Artikel</th>
      <th style="padding:3px 4px;text-align:right;">Menge</th>
      <th style="padding:3px 4px;text-align:right;">Geliefert</th>
    </tr>`;
  }
  if (docTyp === "mahnung") {
    return `<tr style="background:#f5f5f5;font-weight:600;">
      <th style="padding:3px 4px;text-align:left;">Beleg</th>
      <th style="padding:3px 4px;text-align:left;">Beschreibung</th>
      <th style="padding:3px 4px;text-align:right;">Datum</th>
      <th style="padding:3px 4px;text-align:right;">Betrag</th>
    </tr>`;
  }
  return `<tr style="background:#f5f5f5;font-weight:600;">
    <th style="padding:3px 4px;text-align:left;">Pos</th>
    <th style="padding:3px 4px;text-align:left;">Beschreibung</th>
    <th style="padding:3px 4px;text-align:right;">Menge</th>
    <th style="padding:3px 4px;text-align:right;">Preis</th>
    <th style="padding:3px 4px;text-align:right;">Total</th>
  </tr>`;
}

function renderA4Preview(vorlage: PdfVorlage, docTyp: string): string {
  const { design, header_color, footer_color, logo_pos, logo_data_url, logo_scale,
    watermark_data_url, watermark_opacity, watermark_size, watermark_pos,
    show_contact, show_page_num, slogan, einleitung, schluss, zahlungsfrist, mahngebuehr,
    absender_pos_h = "links", absender_top_mm = 55, absender_left_mm = 0 } = vorlage;

  const logoHtml = logo_data_url
    ? `<img src="${logo_data_url}" style="height:${Math.round(logo_scale * 0.28)}px;max-width:${Math.round(logo_scale * 0.6)}px;object-fit:contain;" alt="Logo"/>`
    : `<div style="width:${Math.round(logo_scale * 0.28)}px;height:${Math.round(logo_scale * 0.28)}px;background:${header_color};border-radius:3px;display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:${Math.round(logo_scale * 0.1)}px;">SG</div>`;

  const docTitle = getDocTitle(docTyp);

  const watermarkHtml = watermark_data_url
    ? `<img src="${watermark_data_url}" style="${getWatermarkStyle(watermark_pos, watermark_size, watermark_opacity)}" alt="Wasserzeichen"/>`
    : "";

  const contactHtml = show_contact
    ? `<span>Schneggenburger GmbH | Musterstrasse 1 | 8000 Zürich | info@schneggenburger.ch | +41 44 123 45 67</span>`
    : `<span>Schneggenburger GmbH</span>`;

  const pageNumHtml = show_page_num ? `<span>Seite 1 von 1</span>` : "";

  const tableHeader = getSampleTableHeader(docTyp);
  const tableRows = getSampleRows(docTyp);

  const totalsHtml = docTyp !== "lieferschein"
    ? `<div style="margin-top:6px;display:flex;justify-content:flex-end;">
        <table style="font-size:8px;min-width:140px;">
          <tr><td style="padding:1px 4px;">Subtotal</td><td style="padding:1px 4px;text-align:right;">CHF 1'380.00</td></tr>
          <tr><td style="padding:1px 4px;">MwSt. 7.7%</td><td style="padding:1px 4px;text-align:right;">CHF 106.26</td></tr>
          ${docTyp === "mahnung" ? `<tr><td style="padding:1px 4px;">Mahngebühr</td><td style="padding:1px 4px;text-align:right;">CHF ${mahngebuehr}</td></tr>` : ""}
          <tr style="font-weight:700;border-top:1px solid #333;">
            <td style="padding:2px 4px;">Total CHF</td>
            <td style="padding:2px 4px;text-align:right;">${docTyp === "mahnung" ? "1'986.26" : "1'486.26"}</td>
          </tr>
        </table>
      </div>`
    : "";

  const sampleInfo = docTyp === "mahnung"
    ? `<div style="background:#fff3cd;border:1px solid #f0ad4e;padding:4px 6px;border-radius:3px;margin-bottom:6px;font-size:7.5px;">
        <strong>1. Mahnung</strong> — Zahlungsfrist: ${zahlungsfrist} Tage ab Datum<br/>
        Bitte begleichen Sie den ausstehenden Betrag bis zum <strong>01.05.2024</strong>.
      </div>`
    : "";

  const footerHtml = `
    <div style="position:absolute;bottom:0;left:0;right:0;background:${footer_color};color:white;padding:4px 10px;display:flex;justify-content:space-between;align-items:center;font-size:7px;z-index:2;">
      ${contactHtml}
      ${pageNumHtml}
    </div>`;

  // ─── Design A: Klassisch ─────────────────────────────
  if (design === "A") {
    const logoLeft = logo_pos === "links";
    return `
      <div style="font-family:Arial,sans-serif;font-size:9px;color:#222;height:100%;position:relative;padding-bottom:22px;box-sizing:border-box;">
        ${watermarkHtml}
        <div style="padding:12px 14px 0 14px;position:relative;z-index:2;">
          <div style="display:flex;justify-content:${logoLeft ? "space-between" : "space-between"};align-items:flex-start;flex-direction:${logoLeft ? "row" : "row-reverse"};">
            <div>${logoHtml}${slogan ? `<div style="color:#888;font-size:7px;margin-top:2px;">${slogan}</div>` : ""}</div>
            <div style="text-align:right;font-size:7.5px;color:#555;line-height:1.5;">
              <div style="font-weight:700;font-size:11px;color:#222;">${docTitle}</div>
              <div>Nr: ${docTyp.substring(0,2).toUpperCase()}-2024-001</div>
              <div>Datum: 15.04.2024</div>
              ${docTyp === "offerte" || docTyp === "rechnung" ? `<div>Fällig: ${zahlungsfrist} Tage</div>` : ""}
            </div>
          </div>
          <div style="border-bottom:2px solid ${header_color};margin:8px 0 6px 0;"></div>
          <div style="margin-top:${Math.max(0,(absender_top_mm||55)-20)*2.286}px;margin-left:${(absender_left_mm||0)*2.286}px;font-size:7.5px;color:#555;margin-bottom:6px;${absender_pos_h==='rechts'?'text-align:right;':''}${absender_pos_h==='mitte'?'text-align:center;':''}">
            <div style="font-weight:600;color:#222;">Empfänger</div>
            <div>Musterfirma AG</div>
            <div>Musterstrasse 42</div>
            <div>8001 Zürich</div>
          </div>
          ${sampleInfo}
        ${vorlage.ansprechperson_aktiv 
          ? `<div style="font-size:7.5px;color:#444;margin-bottom:4px;">
              <strong>${vorlage.ansprechperson_label || 'Ansprechperson'}:</strong> [wird beim PDF-Erstellen gesetzt]
            </div>` 
          : ""}
        <div style="font-size:7.5px;margin-bottom:6px;color:#444;">${einleitung.replace(/\n/g, "<br/>")}</div>
          <table style="width:100%;border-collapse:collapse;font-size:7.5px;margin-bottom:4px;">
            <thead>${tableHeader}</thead>
            <tbody>${tableRows}</tbody>
          </table>
          ${totalsHtml}
          <div style="font-size:7.5px;margin-top:6px;color:#444;">${schluss.replace(/\n/g, "<br/>")}</div>
        </div>
        ${footerHtml}
      </div>`;
  }

  // ─── Design B: Modern ────────────────────────────────
  if (design === "B") {
    const logoLeft = logo_pos === "links";
    return `
      <div style="font-family:Arial,sans-serif;font-size:9px;color:#222;height:100%;position:relative;padding-bottom:22px;box-sizing:border-box;">
        ${watermarkHtml}
        <div style="background:${header_color};color:white;padding:10px 14px;display:flex;justify-content:${logoLeft ? "space-between" : "space-between"};align-items:center;flex-direction:${logoLeft ? "row" : "row-reverse"};position:relative;z-index:2;">
          <div>
            ${logo_data_url
              ? `<img src="${logo_data_url}" style="height:${Math.round(logo_scale * 0.22)}px;max-width:${Math.round(logo_scale * 0.5)}px;object-fit:contain;filter:brightness(0) invert(1);" alt="Logo"/>`
              : `<div style="font-weight:700;font-size:${Math.round(logo_scale * 0.1) + 2}px;letter-spacing:1px;">SG</div>`
            }
            ${slogan ? `<div style="font-size:7px;opacity:0.8;margin-top:2px;">${slogan}</div>` : ""}
          </div>
          <div style="text-align:right;font-size:7.5px;opacity:0.9;line-height:1.5;">
            <div style="font-weight:700;font-size:13px;letter-spacing:0.5px;">${docTitle}</div>
            <div>Nr: ${docTyp.substring(0,2).toUpperCase()}-2024-001</div>
            <div>15.04.2024</div>
          </div>
        </div>
        <div style="padding:8px 14px 0 14px;position:relative;z-index:2;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
            <div style="font-size:7.5px;color:#555;margin-left:${(absender_left_mm||0)*2.286}px;">
              <div style="font-weight:600;color:#222;">Empfänger</div>
              <div>Musterfirma AG</div>
              <div>Musterstrasse 42</div>
              <div>8001 Zürich</div>
            </div>
            ${docTyp === "offerte" || docTyp === "rechnung" ? `<div style="font-size:7.5px;color:#555;text-align:right;"><div>Zahlungsfrist: ${zahlungsfrist} Tage</div><div>Fällig: 15.05.2024</div></div>` : ""}
          </div>
          ${sampleInfo}
        ${vorlage.ansprechperson_aktiv 
          ? `<div style="font-size:7.5px;color:#444;margin-bottom:4px;">
              <strong>${vorlage.ansprechperson_label || 'Ansprechperson'}:</strong> [wird beim PDF-Erstellen gesetzt]
            </div>` 
          : ""}
        <div style="font-size:7.5px;margin-bottom:6px;color:#444;">${einleitung.replace(/\n/g, "<br/>")}</div>
          <table style="width:100%;border-collapse:collapse;font-size:7.5px;margin-bottom:4px;">
            <thead>${tableHeader}</thead>
            <tbody>${tableRows}</tbody>
          </table>
          ${totalsHtml}
          <div style="font-size:7.5px;margin-top:6px;color:#444;">${schluss.replace(/\n/g, "<br/>")}</div>
        </div>
        ${footerHtml}
      </div>`;
  }

  // ─── Design D: Zweifarbig (Linke Farbspalte) ───────────
  if (design === "D") {
    return `
      <div style="font-family:Arial,sans-serif;font-size:9px;color:#222;height:100%;position:relative;box-sizing:border-box;display:flex;">
        ${watermarkHtml}
        <div style="width:18px;background:${header_color};flex-shrink:0;display:flex;flex-direction:column;align-items:center;padding-top:14px;z-index:2;">
          ${logo_data_url
            ? `<img src="${logo_data_url}" style="width:14px;object-fit:contain;filter:brightness(0) invert(1);opacity:0.9;" alt="Logo"/>`
            : `<div style="color:white;font-weight:700;font-size:7px;writing-mode:vertical-rl;transform:rotate(180deg);opacity:0.9;">${docTitle.substring(0,3)}</div>`
          }
        </div>
        <div style="flex:1;padding:10px 12px 22px;position:relative;z-index:2;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
            <div>
              <div style="font-size:12px;font-weight:700;color:${header_color};">${docTitle}</div>
              <div style="font-size:7.5px;color:#888;">Nr: ${docTyp.substring(0,2).toUpperCase()}-2024-001 &nbsp;|&nbsp; 15.04.2024</div>
            </div>
            <div style="font-size:7px;color:#555;text-align:right;line-height:1.6;">
              <div style="font-weight:600;">Schneggenburger GmbH</div>
              <div>Musterstrasse 1</div>
              <div>8000 Zürich</div>
            </div>
          </div>
          <div style="border-top:2px solid ${header_color};margin-bottom:6px;"></div>
          <div style="font-size:7.5px;color:#555;margin-bottom:6px;margin-left:${(absender_left_mm||0)*2.286}px;">
            <div style="font-weight:600;color:#222;">Empfänger</div>
            <div>Musterfirma AG</div><div>Musterstrasse 42</div><div>8001 Zürich</div>
          </div>
          ${sampleInfo}
          ${vorlage.ansprechperson_aktiv 
            ? `<div style="font-size:7.5px;color:#444;margin-bottom:4px;">
                <strong>${vorlage.ansprechperson_label || 'Ansprechperson'}:</strong> [wird beim PDF-Erstellen gesetzt]
              </div>` 
            : ""}
          <div style="font-size:7.5px;margin-bottom:5px;color:#444;">${einleitung.replace(/\n/g, "<br/>")}</div>
          <table style="width:100%;border-collapse:collapse;font-size:7.5px;margin-bottom:4px;">
            <thead>${tableHeader}</thead>
            <tbody>${tableRows}</tbody>
          </table>
          ${totalsHtml}
          <div style="font-size:7.5px;margin-top:5px;color:#444;">${schluss.replace(/\n/g, "<br/>")}</div>
        </div>
        ${footerHtml}
      </div>`;
  }

  // ─── Design E: Elegant (Gradient-Linie) ──────────────
  if (design === "E") {
    return `
      <div style="font-family:Georgia,serif;font-size:9px;color:#222;height:100%;position:relative;padding-bottom:22px;box-sizing:border-box;">
        ${watermarkHtml}
        <div style="padding:14px 16px 0 16px;position:relative;z-index:2;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <div>
              ${logo_data_url
                ? `<img src="${logo_data_url}" style="height:${Math.round(logo_scale * 0.18)}px;max-width:${Math.round(logo_scale * 0.4)}px;object-fit:contain;" alt="Logo"/>`
                : `<div style="font-size:${Math.round(logo_scale * 0.1) + 4}px;font-weight:800;color:${header_color};letter-spacing:2px;">SG</div>`
              }
              ${slogan ? `<div style="font-size:6.5px;color:#aaa;letter-spacing:1px;margin-top:1px;">${slogan.toUpperCase()}</div>` : ""}
            </div>
            <div style="text-align:right;font-size:7.5px;color:#666;line-height:1.6;">
              <div style="font-size:11px;font-weight:700;color:${header_color};">${docTitle}</div>
              <div>Nr: ${docTyp.substring(0,2).toUpperCase()}-2024-001</div>
              <div>15.04.2024</div>
            </div>
          </div>
          <div style="height:2.5px;background:linear-gradient(90deg,${header_color},${footer_color});margin:5px 0;border-radius:2px;"></div>
          <div style="font-size:7.5px;color:#555;margin-bottom:6px;margin-left:${(absender_left_mm||0)*2.286}px;">
            <div style="font-weight:600;color:#222;font-style:italic;">Empfänger</div>
            <div>Musterfirma AG</div><div>Musterstrasse 42</div><div>8001 Zürich</div>
          </div>
          ${sampleInfo}
          ${vorlage.ansprechperson_aktiv 
            ? `<div style="font-size:7.5px;color:#444;margin-bottom:4px;">
                <strong>${vorlage.ansprechperson_label || 'Ansprechperson'}:</strong> [wird beim PDF-Erstellen gesetzt]
              </div>` 
            : ""}
          <div style="font-size:7.5px;margin-bottom:5px;color:#444;">${einleitung.replace(/\n/g, "<br/>")}</div>
          <table style="width:100%;border-collapse:collapse;font-size:7.5px;margin-bottom:4px;">
            <thead>${tableHeader}</thead>
            <tbody>${tableRows}</tbody>
          </table>
          ${totalsHtml}
          <div style="font-size:7.5px;margin-top:5px;color:#444;">${schluss.replace(/\n/g, "<br/>")}</div>
        </div>
        <div style="position:absolute;bottom:0;left:0;right:0;z-index:2;">
          <div style="height:2px;background:linear-gradient(90deg,${footer_color},${header_color});"></div>
          <div style="background:white;padding:4px 16px;display:flex;justify-content:space-between;font-size:6.5px;color:#999;font-style:italic;">
            ${show_contact ? `<span>Schneggenburger GmbH | Musterstrasse 1 | 8000 Zürich | info@schneggenburger.ch</span>` : `<span></span>`}
            ${show_page_num ? `<span>Seite 1 von 1</span>` : ""}
          </div>
        </div>
      </div>`;
  }

  // ─── Design F: Box-Header (voller Farbblock) ─────────
  if (design === "F") {
    const logoLeft = logo_pos === "links";
    return `
      <div style="font-family:Arial,sans-serif;font-size:9px;color:#222;height:100%;position:relative;padding-bottom:22px;box-sizing:border-box;">
        ${watermarkHtml}
        <div style="background:${header_color};padding:14px 16px 12px;position:relative;z-index:2;">
          <div style="display:flex;justify-content:space-between;align-items:flex-end;flex-direction:${logoLeft ? "row" : "row-reverse"};">
            <div>
              ${logo_data_url
                ? `<img src="${logo_data_url}" style="height:${Math.round(logo_scale * 0.2)}px;max-width:${Math.round(logo_scale * 0.45)}px;object-fit:contain;filter:brightness(0) invert(1);" alt="Logo"/>`
                : `<div style="font-size:${Math.round(logo_scale * 0.1) + 6}px;font-weight:900;color:white;letter-spacing:2px;">SG</div>`
              }
              ${slogan ? `<div style="font-size:6.5px;color:rgba(255,255,255,0.75);margin-top:2px;">${slogan}</div>` : ""}
            </div>
            <div style="text-align:right;">
              <div style="font-size:14px;font-weight:800;color:white;letter-spacing:1px;">${docTitle}</div>
              <div style="font-size:7px;color:rgba(255,255,255,0.8);margin-top:1px;">Nr: ${docTyp.substring(0,2).toUpperCase()}-2024-001 &nbsp;|&nbsp; 15.04.2024</div>
              ${docTyp === "offerte" || docTyp === "rechnung" ? `<div style="font-size:7px;color:rgba(255,255,255,0.8);">Fällig in ${zahlungsfrist} Tagen</div>` : ""}
            </div>
          </div>
        </div>
        <div style="padding:10px 16px 0;position:relative;z-index:2;">
          <div style="font-size:7.5px;color:#555;margin-bottom:6px;margin-left:${(absender_left_mm||0)*2.286}px;">
            <div style="font-weight:600;color:#222;">Empfänger</div>
            <div>Musterfirma AG</div><div>Musterstrasse 42</div><div>8001 Zürich</div>
          </div>
          ${sampleInfo}
          ${vorlage.ansprechperson_aktiv 
            ? `<div style="font-size:7.5px;color:#444;margin-bottom:4px;">
                <strong>${vorlage.ansprechperson_label || 'Ansprechperson'}:</strong> [wird beim PDF-Erstellen gesetzt]
              </div>` 
            : ""}
          <div style="font-size:7.5px;margin-bottom:5px;color:#444;">${einleitung.replace(/\n/g, "<br/>")}</div>
          <table style="width:100%;border-collapse:collapse;font-size:7.5px;margin-bottom:4px;">
            <thead>${tableHeader}</thead>
            <tbody>${tableRows}</tbody>
          </table>
          ${totalsHtml}
          <div style="font-size:7.5px;margin-top:5px;color:#444;">${schluss.replace(/\n/g, "<br/>")}</div>
        </div>
        ${footerHtml}
      </div>`;
  }

  // ─── Design G: Swiss Classic ─────────────────────────
  if (design === "G") {
    const logoLeft = logo_pos === "links";
    return `
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:9px;color:#222;height:100%;position:relative;padding-bottom:22px;box-sizing:border-box;">
        ${watermarkHtml}
        <div style="padding:12px 16px 0 16px;position:relative;z-index:2;">
          <div style="border-top:2px solid ${header_color};padding-top:8px;display:flex;justify-content:${logoLeft ? "space-between" : "space-between"};align-items:flex-start;flex-direction:${logoLeft ? "row" : "row-reverse"};">
            <div>
              ${logoHtml}
              ${slogan ? `<div style="color:#888;font-size:7px;margin-top:2px;">${slogan}</div>` : ""}
            </div>
            <div style="text-align:right;font-size:7px;color:#555;line-height:1.6;">
              <div style="font-weight:600;color:#333;">Schneggenburger GmbH</div>
              <div>Hefenhoferstrasse 7</div>
              <div>8580 Sommeri</div>
              <div>Tel. 071 411 16 87</div>
            </div>
          </div>
          <div style="border-bottom:0.5px solid #ccc;margin:8px 0;"></div>
          <div style="margin-top:${Math.max(0,(absender_top_mm||55)-20)*2.286}px;margin-left:${(absender_left_mm||0)*2.286}px;font-size:7px;color:#888;margin-bottom:8px;">
            <div>Schneggenburger GmbH &middot; Hefenhoferstrasse 7 &middot; 8580 Sommeri</div>
          </div>
          <div style="font-size:7.5px;color:#444;margin-bottom:10px;line-height:1.6;margin-left:${(absender_left_mm||0)*2.286}px;${absender_pos_h==='rechts'?'text-align:right;':''}${absender_pos_h==='mitte'?'text-align:center;':''}">
            <div style="font-weight:600;color:#222;">Musterfirma AG</div>
            <div>Musterstrasse 42</div>
            <div>8001 Z&uuml;rich</div>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;">
            <div style="font-size:13px;font-weight:700;color:#111;letter-spacing:0.5px;">${docTitle}</div>
            <div style="font-size:7.5px;color:#555;text-align:right;line-height:1.6;">
              <div>Nr: ${docTyp.substring(0,2).toUpperCase()}-2024-001</div>
              <div>Datum: 15.04.2024</div>
              ${docTyp === "offerte" || docTyp === "rechnung" ? `<div>F&auml;llig: ${zahlungsfrist} Tage</div>` : ""}
            </div>
          </div>
          ${sampleInfo}
        ${vorlage.ansprechperson_aktiv 
          ? `<div style="font-size:7.5px;color:#444;margin-bottom:4px;">
              <strong>${vorlage.ansprechperson_label || 'Ansprechperson'}:</strong> [wird beim PDF-Erstellen gesetzt]
            </div>` 
          : ""}
        <div style="font-size:7.5px;margin-bottom:6px;color:#444;">${einleitung.replace(/\n/g, "<br/>")}</div>
          <table style="width:100%;border-collapse:collapse;font-size:7.5px;margin-bottom:4px;">
            <thead>${tableHeader}</thead>
            <tbody>${tableRows}</tbody>
          </table>
          ${totalsHtml}
          <div style="font-size:7.5px;margin-top:6px;color:#444;">${schluss.replace(/\n/g, "<br/>")}</div>
        </div>
        ${footerHtml}
      </div>`;
  }

  // ─── Design H: Helvetica Pro ─────────────────────────
  if (design === "H") {
    const logoLeft = logo_pos === "links";
    return `
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:9px;color:#222;height:100%;position:relative;padding-bottom:22px;box-sizing:border-box;">
        ${watermarkHtml}
        <div style="padding:14px 16px 0 16px;position:relative;z-index:2;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-direction:${logoLeft ? "row" : "row-reverse"};margin-bottom:6px;">
            <div>
              ${logoHtml}
              ${slogan ? `<div style="color:#aaa;font-size:6.5px;margin-top:2px;letter-spacing:1px;text-transform:uppercase;">${slogan}</div>` : ""}
            </div>
            <div style="text-align:right;font-size:7px;color:#666;line-height:1.5;">
              <div style="font-weight:700;color:#222;">Schneggenburger GmbH</div>
              <div>Hefenhoferstrasse 7, 8580 Sommeri</div>
              <div>Tel. 071 411 16 87</div>
            </div>
          </div>
          <div style="height:1.5px;background:#222;margin-bottom:1px;"></div>
          <div style="height:0.5px;background:#bbb;margin-bottom:10px;"></div>
          <div style="font-size:7.5px;color:#444;margin-bottom:10px;line-height:1.6;margin-left:${(absender_left_mm||0)*2.286}px;">
            <div style="font-weight:600;color:#222;">Musterfirma AG</div>
            <div>Musterstrasse 42</div>
            <div>8001 Z&uuml;rich</div>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;">
            <div style="font-size:14px;font-weight:700;color:#111;text-transform:uppercase;letter-spacing:1.5px;">${docTitle}</div>
            <div style="font-size:7px;color:#777;text-align:right;line-height:1.6;">
              <div>Nr: ${docTyp.substring(0,2).toUpperCase()}-2024-001</div>
              <div>15.04.2024</div>
              ${docTyp === "offerte" || docTyp === "rechnung" ? `<div>F&auml;llig: ${zahlungsfrist} Tage</div>` : ""}
            </div>
          </div>
          ${sampleInfo}
        ${vorlage.ansprechperson_aktiv 
          ? `<div style="font-size:7.5px;color:#444;margin-bottom:4px;">
              <strong>${vorlage.ansprechperson_label || 'Ansprechperson'}:</strong> [wird beim PDF-Erstellen gesetzt]
            </div>` 
          : ""}
        <div style="font-size:7.5px;margin-bottom:6px;color:#444;">${einleitung.replace(/\n/g, "<br/>")}</div>
          <table style="width:100%;border-collapse:collapse;font-size:7.5px;margin-bottom:4px;">
            <thead>${tableHeader}</thead>
            <tbody>${tableRows}</tbody>
          </table>
          ${totalsHtml}
          <div style="font-size:7.5px;margin-top:6px;color:#444;">${schluss.replace(/\n/g, "<br/>")}</div>
        </div>
        <div style="position:absolute;bottom:0;left:0;right:0;z-index:2;">
          <div style="height:1.5px;background:#222;"></div>
          <div style="height:0.5px;background:#bbb;margin-bottom:1px;"></div>
          <div style="background:white;padding:4px 16px;display:flex;justify-content:space-between;font-size:6.5px;color:#888;">
            ${show_contact ? `<span>Schneggenburger GmbH &middot; Hefenhoferstrasse 7 &middot; 8580 Sommeri &middot; Tel. 071 411 16 87</span>` : `<span></span>`}
            ${show_page_num ? `<span>Seite 1 von 1</span>` : ""}
          </div>
        </div>
      </div>`;
  }

  // ─── Design I: Corporate Slim ─────────────────────────
  if (design === "I") {
    const logoLeft = logo_pos === "links";
    return `
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:9px;color:#222;height:100%;position:relative;box-sizing:border-box;display:flex;">
        ${watermarkHtml}
        <div style="width:4px;background:${header_color};flex-shrink:0;z-index:2;"></div>
        <div style="flex:1;padding:12px 14px 22px 12px;position:relative;z-index:2;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-direction:${logoLeft ? "row" : "row-reverse"};margin-bottom:6px;">
            <div>
              ${logoHtml}
              ${slogan ? `<div style="color:#999;font-size:6.5px;margin-top:2px;">${slogan}</div>` : ""}
            </div>
            <div style="text-align:right;font-size:7px;color:#666;line-height:1.6;">
              <div style="font-weight:700;color:#222;">Schneggenburger GmbH</div>
              <div>Hefenhoferstrasse 7</div>
              <div>8580 Sommeri</div>
            </div>
          </div>
          <div style="border-bottom:0.5px solid #ccc;margin-bottom:10px;"></div>
          <div style="font-size:7.5px;color:#444;margin-bottom:10px;line-height:1.6;margin-left:${(absender_left_mm||0)*2.286}px;">
            <div style="font-weight:600;color:#222;">Musterfirma AG</div>
            <div>Musterstrasse 42</div>
            <div>8001 Z&uuml;rich</div>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;">
            <div style="font-size:13px;font-weight:700;color:#111;">${docTitle}</div>
            <div style="font-size:7px;color:#777;text-align:right;line-height:1.6;">
              <div>Nr: ${docTyp.substring(0,2).toUpperCase()}-2024-001</div>
              <div>15.04.2024</div>
              ${docTyp === "offerte" || docTyp === "rechnung" ? `<div>F&auml;llig: ${zahlungsfrist} Tage</div>` : ""}
            </div>
          </div>
          ${sampleInfo}
        ${vorlage.ansprechperson_aktiv 
          ? `<div style="font-size:7.5px;color:#444;margin-bottom:4px;">
              <strong>${vorlage.ansprechperson_label || 'Ansprechperson'}:</strong> [wird beim PDF-Erstellen gesetzt]
            </div>` 
          : ""}
        <div style="font-size:7.5px;margin-bottom:6px;color:#444;">${einleitung.replace(/\n/g, "<br/>")}</div>
          <table style="width:100%;border-collapse:collapse;font-size:7.5px;margin-bottom:4px;">
            <thead>${tableHeader}</thead>
            <tbody>${tableRows}</tbody>
          </table>
          ${totalsHtml}
          <div style="font-size:7.5px;margin-top:5px;color:#444;">${schluss.replace(/\n/g, "<br/>")}</div>
        </div>
        ${footerHtml}
      </div>`;
  }

  // ─── Design C: Minimal ───────────────────────────────
  return `
    <div style="font-family:Arial,sans-serif;font-size:9px;color:#222;height:100%;position:relative;padding-bottom:22px;box-sizing:border-box;">
      ${watermarkHtml}
      <div style="padding:10px 14px 0 14px;position:relative;z-index:2;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px;">
          <div>
            ${logo_data_url
              ? `<img src="${logo_data_url}" style="height:${Math.round(logo_scale * 0.16)}px;max-width:${Math.round(logo_scale * 0.36)}px;object-fit:contain;" alt="Logo"/>`
              : `<div style="font-size:${Math.round(logo_scale * 0.09)}px;font-weight:700;color:${header_color};letter-spacing:1px;">SG</div>`
            }
          </div>
          <div style="font-size:7.5px;color:#888;text-align:right;line-height:1.5;">
            <div>Schneggenburger GmbH</div>
            <div>Musterstrasse 1, 8000 Zürich</div>
          </div>
        </div>
        <div style="border-top:1px solid #ddd;padding-top:6px;margin-bottom:6px;">
          <div style="font-size:12px;font-weight:300;color:#333;letter-spacing:0.5px;">${docTitle}</div>
          <div style="font-size:7.5px;color:#888;">Nr: ${docTyp.substring(0,2).toUpperCase()}-2024-001 &nbsp;|&nbsp; 15.04.2024</div>
        </div>
        <div style="font-size:7.5px;color:#555;margin-bottom:6px;margin-left:${(absender_left_mm||0)*2.286}px;">
          <div style="font-weight:600;color:#222;">Empfänger</div>
          <div>Musterfirma AG</div>
          <div>Musterstrasse 42</div>
          <div>8001 Zürich</div>
        </div>
        ${sampleInfo}
        ${vorlage.ansprechperson_aktiv 
          ? `<div style="font-size:7.5px;color:#444;margin-bottom:4px;">
              <strong>${vorlage.ansprechperson_label || 'Ansprechperson'}:</strong> [wird beim PDF-Erstellen gesetzt]
            </div>` 
          : ""}
        <div style="font-size:7.5px;margin-bottom:6px;color:#444;">${einleitung.replace(/\n/g, "<br/>")}</div>
        <table style="width:100%;border-collapse:collapse;font-size:7.5px;margin-bottom:4px;">
          <thead>${tableHeader}</thead>
          <tbody>${tableRows}</tbody>
        </table>
        ${totalsHtml}
        <div style="font-size:7.5px;margin-top:6px;color:#444;">${schluss.replace(/\n/g, "<br/>")}</div>
      </div>
      ${footerHtml}
    </div>`;
}

// ─── Slider Component ────────────────────────────────────────────────────────

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  onChange: (v: number) => void;
}

function StyledSlider({ label, value, min, max, unit = "%", onChange }: SliderProps) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <Label className="text-xs text-gray-600">{label}</Label>
        <span className="text-xs font-medium text-gray-700">{value}{unit}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-lg appearance-none cursor-pointer"
        style={{ accentColor: "#6b4c2a" }}
      />
    </div>
  );
}

// ─── Section Header ──────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2 mt-5 mb-2">
      <div className="h-px flex-1 bg-gray-200" />
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{title}</span>
      <div className="h-px flex-1 bg-gray-200" />
    </div>
  );
}

// ─── File Upload Field ───────────────────────────────────────────────────────

interface FileUploadProps {
  label: string;
  dataUrl: string | null;
  onUpload: (dataUrl: string) => void;
  onRemove: () => void;
  previewSize?: number;
}

function FileUploadField({ label, dataUrl, onUpload, onRemove, previewSize = 48 }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      if (result) onUpload(result);
    };
    reader.readAsDataURL(file);
    // Reset input so same file can be re-uploaded
    e.target.value = "";
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs text-gray-600">{label}</Label>
      <div className="flex items-center gap-2 flex-wrap">
        {dataUrl && (
          <img
            src={dataUrl}
            alt="Vorschau"
            style={{ height: previewSize, maxWidth: previewSize * 2, objectFit: "contain", border: "1px solid #e5e7eb", borderRadius: 4 }}
          />
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          className="text-xs h-7 px-2 gap-1"
        >
          <Upload className="w-3 h-3" />
          {dataUrl ? "Ändern" : "Hochladen"}
        </Button>
        {dataUrl && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
            className="text-xs h-7 px-2 gap-1 text-red-500 hover:text-red-600 hover:bg-red-50"
          >
            <X className="w-3 h-3" />
            Entfernen
          </Button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleChange}
        />
      </div>
    </div>
  );
}

// ─── Design Card ─────────────────────────────────────────────────────────────

interface DesignCardProps {
  id: string;
  title: string;
  description: string;
  selected: boolean;
  onClick: () => void;
  previewContent: React.ReactNode;
}

function DesignCard({ id, title, description, selected, onClick, previewContent }: DesignCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-lg border-2 p-1.5 text-left transition-all cursor-pointer ${
        selected ? "border-orange-500 bg-orange-50" : "border-gray-200 bg-white hover:border-gray-300"
      }`}
      style={{ borderColor: selected ? "#e8620a" : undefined }}
    >
      <div className="rounded overflow-hidden mb-1 bg-gray-50 border border-gray-100" style={{ height: 52 }}>
        {previewContent}
      </div>
      <div className="font-semibold text-xs truncate" style={{ color: selected ? "#e8620a" : "#374151", fontSize: 10 }}>{id}: {title}</div>
      <div className="leading-tight mt-0.5 truncate" style={{ fontSize: 9, color: "#9ca3af" }}>{description}</div>
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PdfVorlagenTab() {
  const { toast } = useToast();

  const [activeDoc, setActiveDoc] = useState<string>("offerte");
  const [vorlagen, setVorlagen] = useState<Record<string, PdfVorlage>>(() => {
    const init: Record<string, PdfVorlage> = {};
    DOC_TYPES.forEach(({ key }) => { init[key] = DEFAULT_VORLAGE(key); });
    return init;
  });

  // Tracks the last saved state per doc_typ (for "unsaved changes" indicator)
  const [savedVorlagen, setSavedVorlagen] = useState<Record<string, PdfVorlage>>({});

  // ─── Fetch all vorlagen ───────────────────────────────
  const { isLoading, data: fetchedVorlagen } = useQuery<PdfVorlage[]>({
    queryKey: ["/api/pdf-vorlagen"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/pdf-vorlagen");
      return res.json();
    },
  });

  // TanStack Query v5: onSuccess wurde entfernt → useEffect verwenden
  useEffect(() => {
    if (!fetchedVorlagen || !Array.isArray(fetchedVorlagen)) return;
    setVorlagen((prev) => {
      const next = { ...prev };
      fetchedVorlagen.forEach((v) => {
        if (v.doc_typ) next[v.doc_typ] = { ...DEFAULT_VORLAGE(v.doc_typ), ...v };
      });
      return next;
    });
    setSavedVorlagen((prev) => {
      const next = { ...prev };
      fetchedVorlagen.forEach((v) => {
        if (v.doc_typ) next[v.doc_typ] = { ...DEFAULT_VORLAGE(v.doc_typ), ...v };
      });
      return next;
    });
  }, [fetchedVorlagen]);

  // ─── Save mutation ────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async (vorlage: PdfVorlage) => {
      const res = await apiRequest("PUT", `/api/pdf-vorlagen/${vorlage.doc_typ}`, vorlage);
      return res.json();
    },
    onSuccess: (_saved: PdfVorlage, submitted: PdfVorlage) => {
      queryClient.invalidateQueries({ queryKey: ["/api/pdf-vorlagen"] });
      // Update savedVorlagen with the just-saved version (submitted kommt vom mutate-Aufruf)
      setSavedVorlagen((prev) => ({ ...prev, [submitted.doc_typ]: submitted }));
      toast({ title: "Vorlage gespeichert ✓", description: `${getDocTitle(submitted.doc_typ)} wurde erfolgreich gespeichert.` });
    },
    onError: () => {
      toast({ title: "Fehler beim Speichern", description: "Bitte versuchen Sie es erneut.", variant: "destructive" });
    },
  });

  const vorlage = vorlagen[activeDoc] ?? DEFAULT_VORLAGE(activeDoc);

  const updateVorlage = useCallback((updates: Partial<PdfVorlage>) => {
    setVorlagen((prev) => ({
      ...prev,
      [activeDoc]: { ...prev[activeDoc], ...updates },
    }));
  }, [activeDoc]);

  const handleSave = () => saveMutation.mutate(vorlage);

  // ─── Design preview mini content ─────────────────────
  const designPreviews = [
    {
      id: "A",
      title: "Klassisch",
      description: "Weisser BG, Trennlinie",
      previewContent: (
        <div style={{ padding: "4px 6px", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ width: 18, height: 10, background: vorlage.header_color, borderRadius: 2 }} />
            <div style={{ fontSize: 7, color: "#666" }}>RECHNUNG</div>
          </div>
          <div style={{ borderBottom: `1.5px solid ${vorlage.header_color}`, margin: "2px 0" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {[1, 2].map(i => <div key={i} style={{ height: 3, background: "#e5e7eb", borderRadius: 1, width: `${70 - i * 15}%` }} />)}
          </div>
        </div>
      ),
    },
    {
      id: "B",
      title: "Modern",
      description: "Farbiger Header-Balken",
      previewContent: (
        <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
          <div style={{ background: vorlage.header_color, color: "white", padding: "3px 6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ width: 14, height: 8, background: "rgba(255,255,255,0.4)", borderRadius: 1 }} />
            <div style={{ fontSize: 6.5, fontWeight: 700 }}>RECHNUNG</div>
          </div>
          <div style={{ padding: "3px 6px", display: "flex", flexDirection: "column", gap: 1.5, flex: 1 }}>
            {[1, 2].map(i => <div key={i} style={{ height: 3, background: "#e5e7eb", borderRadius: 1, width: `${65 - i * 10}%` }} />)}
          </div>
        </div>
      ),
    },
    {
      id: "C",
      title: "Minimal",
      description: "Nur kleines Logo",
      previewContent: (
        <div style={{ padding: "4px 6px", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ fontSize: 8, fontWeight: 700, color: vorlage.header_color }}>SG</div>
            <div style={{ fontSize: 6, color: "#aaa" }}>Schneggenburger</div>
          </div>
          <div style={{ borderTop: "1px solid #ddd", paddingTop: 2 }}>
            <div style={{ fontSize: 7, fontWeight: 300, color: "#555", letterSpacing: 0.5 }}>RECHNUNG</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {[1, 2].map(i => <div key={i} style={{ height: 2.5, background: "#e5e7eb", borderRadius: 1, width: `${60 - i * 10}%` }} />)}
          </div>
        </div>
      ),
    },
    {
      id: "D",
      title: "Zweifarbig",
      description: "Linke Farbspalte",
      previewContent: (
        <div style={{ height: "100%", display: "flex" }}>
          <div style={{ width: 14, background: vorlage.header_color, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 4 }}>
            <div style={{ width: 8, height: 8, background: "rgba(255,255,255,0.5)", borderRadius: "50%" }} />
          </div>
          <div style={{ flex: 1, padding: "3px 5px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 7, fontWeight: 700, color: vorlage.header_color }}>RECHNUNG</div>
              <div style={{ height: 1, background: vorlage.header_color, margin: "2px 0", opacity: 0.3 }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
              {[1, 2, 3].map(i => <div key={i} style={{ height: 2.5, background: "#e5e7eb", borderRadius: 1, width: `${75 - i * 12}%` }} />)}
            </div>
            <div style={{ height: 8, background: vorlage.footer_color, borderRadius: 1, opacity: 0.8 }} />
          </div>
        </div>
      ),
    },
    {
      id: "E",
      title: "Elegant",
      description: "Goldene Akzentlinie",
      previewContent: (
        <div style={{ padding: "4px 6px", height: "100%", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
            <div style={{ fontSize: 8, fontWeight: 800, color: vorlage.header_color, letterSpacing: 1 }}>SG</div>
            <div style={{ fontSize: 6, color: "#999", textAlign: "right" }}>
              <div style={{ fontWeight: 600 }}>RECHNUNG</div>
              <div>#2024-001</div>
            </div>
          </div>
          <div style={{ height: 2, background: `linear-gradient(90deg, ${vorlage.header_color}, ${vorlage.footer_color})`, borderRadius: 1, marginBottom: 4 }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 1.5, flex: 1 }}>
            {[1, 2, 3].map(i => <div key={i} style={{ height: 2.5, background: "#e5e7eb", borderRadius: 1, width: `${80 - i * 10}%` }} />)}
          </div>
          <div style={{ height: 1, background: `linear-gradient(90deg, ${vorlage.footer_color}, ${vorlage.header_color})`, borderRadius: 1, marginTop: 3 }} />
        </div>
      ),
    },
    {
      id: "F",
      title: "Box-Header",
      description: "Voller Farbblock oben",
      previewContent: (
        <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
          <div style={{ background: vorlage.header_color, padding: "5px 6px", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <div style={{ fontSize: 9, fontWeight: 800, color: "white", letterSpacing: 0.5 }}>SG</div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 7, fontWeight: 700, color: "white" }}>RECHNUNG</div>
              <div style={{ fontSize: 5.5, color: "rgba(255,255,255,0.7)" }}>Nr. 2024-001</div>
            </div>
          </div>
          <div style={{ flex: 1, padding: "4px 6px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
              {[1, 2, 3].map(i => <div key={i} style={{ height: 2.5, background: "#e5e7eb", borderRadius: 1, width: `${70 - i * 10}%` }} />)}
            </div>
            <div style={{ background: vorlage.footer_color, height: 10, borderRadius: 1 }} />
          </div>
        </div>
      ),
    },
    {
      id: "G",
      title: "Swiss Classic",
      description: "Schweizer Geschäftsbrief",
      previewContent: (
        <div style={{ padding: "4px 6px", height: "100%", display: "flex", flexDirection: "column", background: "white" }}>
          <div style={{ borderTop: `2px solid ${vorlage.header_color}`, paddingTop: 3 }}>
            <div style={{ fontSize: 6.5, color: "#333", fontWeight: 600 }}>Schneggenburger GmbH</div>
            <div style={{ fontSize: 5.5, color: "#888" }}>Hefenhoferstr. 7 · 8580 Sommeri</div>
          </div>
          <div style={{ margin: "3px 0", borderBottom: "0.5px solid #ddd" }} />
          <div style={{ fontSize: 7, color: "#555", marginBottom: 2 }}>
            <div>Musterfirma AG, 8001 Zürich</div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 2 }}>
            <div style={{ fontSize: 8, fontWeight: 700, color: "#111" }}>RECHNUNG</div>
            <div style={{ fontSize: 5.5, color: "#888" }}>15.04.2024</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {[1, 2].map(i => <div key={i} style={{ height: 2.5, background: "#e8e8e8", borderRadius: 1, width: `${65 - i * 10}%` }} />)}
          </div>
        </div>
      ),
    },
    {
      id: "H",
      title: "Helvetica Pro",
      description: "Klare Linien, kein Farb-Header",
      previewContent: (
        <div style={{ padding: "4px 6px", height: "100%", display: "flex", flexDirection: "column", background: "white" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ fontSize: 9, fontWeight: 800, color: "#111", letterSpacing: 0.5 }}>SG</div>
            <div style={{ fontSize: 5.5, color: "#aaa", textAlign: "right" }}>Schneggenburger GmbH</div>
          </div>
          <div style={{ height: 1, background: "#222", margin: "2px 0 1px 0" }} />
          <div style={{ height: "0.5px", background: "#ccc", marginBottom: 3 }} />
          <div style={{ fontSize: 8, fontWeight: 700, color: "#111", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 }}>Rechnung</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            {[1, 2, 3].map(i => <div key={i} style={{ height: 2.5, background: "#e8e8e8", borderRadius: 1, width: `${72 - i * 10}%` }} />)}
          </div>
        </div>
      ),
    },
    {
      id: "I",
      title: "Corporate Slim",
      description: "Dezenter Akzent, sachlich",
      previewContent: (
        <div style={{ padding: "0", height: "100%", display: "flex", flexDirection: "column", background: "white" }}>
          <div style={{ display: "flex" }}>
            <div style={{ width: 3, background: vorlage.header_color, flexShrink: 0 }} />
            <div style={{ flex: 1, padding: "4px 5px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                <div style={{ fontSize: 6.5, fontWeight: 700, color: "#222" }}>Schneggenburger GmbH</div>
                <div style={{ fontSize: 5.5, color: "#aaa" }}>8580 Sommeri</div>
              </div>
              <div style={{ borderBottom: "0.5px solid #ddd", marginBottom: 3 }} />
              <div style={{ fontSize: 8, fontWeight: 700, color: "#111", marginBottom: 2 }}>RECHNUNG</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                {[1, 2, 3].map(i => <div key={i} style={{ height: 2.5, background: "#e8e8e8", borderRadius: 1, width: `${70 - i * 10}%` }} />)}
              </div>
            </div>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Tab navigation */}
      <div className="flex gap-1 flex-wrap border-b border-gray-200 pb-1">
        {DOC_TYPES.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveDoc(key)}
            className={`px-3 py-1.5 rounded-t-md text-sm font-medium transition-colors whitespace-nowrap ${
              activeDoc === key
                ? "text-white"
                : "text-gray-600 hover:text-gray-800 hover:bg-gray-100"
            }`}
            style={activeDoc === key ? { background: "#6b4c2a" } : undefined}
          >
            <span className="flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              {label}
            </span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid gap-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ─── Left: Config ─────────────────────────── */}
          <div className="space-y-1 max-h-[calc(100vh-260px)] overflow-y-auto pr-1">

            {/* Design */}
            <SectionHeader title="Design" />
            <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
              {designPreviews.map((dp) => (
                <DesignCard
                  key={dp.id}
                  id={dp.id}
                  title={dp.title}
                  description={dp.description}
                  selected={vorlage.design === dp.id}
                  onClick={() => updateVorlage({ design: dp.id })}
                  previewContent={dp.previewContent}
                />
              ))}
            </div>

            {/* Header */}
            <SectionHeader title="Header" />
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-gray-600">Header-Farbe</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={vorlage.header_color}
                    onChange={(e) => updateVorlage({ header_color: e.target.value })}
                    className="w-8 h-8 rounded cursor-pointer border border-gray-300"
                    style={{ padding: 2 }}
                  />
                  <Input
                    value={vorlage.header_color}
                    onChange={(e) => updateVorlage({ header_color: e.target.value })}
                    className="h-8 text-xs font-mono"
                    maxLength={7}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-gray-600">Footer-Farbe</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={vorlage.footer_color}
                    onChange={(e) => updateVorlage({ footer_color: e.target.value })}
                    className="w-8 h-8 rounded cursor-pointer border border-gray-300"
                    style={{ padding: 2 }}
                  />
                  <Input
                    value={vorlage.footer_color}
                    onChange={(e) => updateVorlage({ footer_color: e.target.value })}
                    className="h-8 text-xs font-mono"
                    maxLength={7}
                  />
                </div>
              </div>
            </div>
            <div className="space-y-1 mt-2">
              <Label className="text-xs text-gray-600">Slogan / Untertitel</Label>
              <Input
                value={vorlage.slogan}
                onChange={(e) => updateVorlage({ slogan: e.target.value })}
                placeholder="z.B. Qualität & Verlässlichkeit"
                className="h-8 text-xs"
              />
            </div>

            {/* Logo */}
            <SectionHeader title="Logo" />
            <FileUploadField
              label="Logo-Datei"
              dataUrl={vorlage.logo_data_url}
              onUpload={(url) => updateVorlage({ logo_data_url: url })}
              onRemove={() => updateVorlage({ logo_data_url: null })}
              previewSize={40}
            />
            <div className="mt-2">
              <Label className="text-xs text-gray-600 block mb-1">Logo-Position</Label>
              <div className="flex gap-2">
                {(["links", "rechts"] as const).map((pos) => (
                  <button
                    key={pos}
                    type="button"
                    onClick={() => updateVorlage({ logo_pos: pos })}
                    className={`flex-1 py-1 px-2 rounded text-xs border transition-colors capitalize ${
                      vorlage.logo_pos === pos
                        ? "text-white border-transparent"
                        : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                    }`}
                    style={vorlage.logo_pos === pos ? { background: "#6b4c2a", borderColor: "#6b4c2a" } : undefined}
                  >
                    {pos}
                  </button>
                ))}
              </div>
            </div>
            {vorlage.logo_data_url && (
              <div className="mt-2">
                <StyledSlider
                  label="Logo-Grösse"
                  value={vorlage.logo_scale}
                  min={30}
                  max={200}
                  onChange={(v) => updateVorlage({ logo_scale: v })}
                />
              </div>
            )}

            {/* Dokument-Texte */}
            <SectionHeader title="Dokument-Texte" />
            <div className="space-y-2">
              {(activeDoc === "rechnung" || activeDoc === "offerte") && (
                <div className="space-y-1">
                  <Label className="text-xs text-gray-600">Zahlungsfrist (Tage)</Label>
                  <Input
                    value={vorlage.zahlungsfrist}
                    onChange={(e) => updateVorlage({ zahlungsfrist: e.target.value })}
                    placeholder="30"
                    className="h-8 text-xs"
                    type="number"
                    min="1"
                  />
                </div>
              )}
              {activeDoc === "mahnung" && (
                <div className="space-y-1">
                  <Label className="text-xs text-gray-600">Mahngebühr (CHF)</Label>
                  <Input
                    value={vorlage.mahngebuehr}
                    onChange={(e) => updateVorlage({ mahngebuehr: e.target.value })}
                    placeholder="30.00"
                    className="h-8 text-xs"
                  />
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs text-gray-600">Einleitung</Label>
                <textarea
                  value={vorlage.einleitung}
                  onChange={(e) => updateVorlage({ einleitung: e.target.value })}
                  rows={3}
                  className="w-full border border-gray-200 rounded-md p-2 text-xs resize-y focus:outline-none focus:ring-1"
                  style={{ focusRingColor: "#6b4c2a" } as React.CSSProperties}
                  placeholder="Einleitungstext..."
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-gray-600">Schluss / Grussformel</Label>
                <textarea
                  value={vorlage.schluss}
                  onChange={(e) => updateVorlage({ schluss: e.target.value })}
                  rows={3}
                  className="w-full border border-gray-200 rounded-md p-2 text-xs resize-y focus:outline-none focus:ring-1"
                  placeholder="Schlusstext..."
                />
              </div>
            </div>

            {/* Wasserzeichen */}
            <SectionHeader title="Wasserzeichen" />
            <FileUploadField
              label="Wasserzeichen-Datei"
              dataUrl={vorlage.watermark_data_url}
              onUpload={(url) => updateVorlage({ watermark_data_url: url })}
              onRemove={() => updateVorlage({ watermark_data_url: null })}
              previewSize={36}
            />
            {vorlage.watermark_data_url && (
              <div className="space-y-3 mt-2">
                <StyledSlider
                  label="Transparenz"
                  value={vorlage.watermark_opacity}
                  min={5}
                  max={100}
                  onChange={(v) => updateVorlage({ watermark_opacity: v })}
                />
                <StyledSlider
                  label="Grösse"
                  value={vorlage.watermark_size}
                  min={20}
                  max={100}
                  onChange={(v) => updateVorlage({ watermark_size: v })}
                />
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-600">Position</Label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {WATERMARK_POSITIONS.map(({ value, label }) => (
                      <label
                        key={value}
                        className={`flex items-center gap-1.5 p-1.5 rounded border cursor-pointer text-xs transition-colors ${
                          vorlage.watermark_pos === value
                            ? "border-orange-400 bg-orange-50 text-orange-700"
                            : "border-gray-200 text-gray-600 hover:border-gray-300"
                        }`}
                        style={vorlage.watermark_pos === value ? { borderColor: "#e8620a" } : undefined}
                      >
                        <input
                          type="radio"
                          name={`watermark_pos_${activeDoc}`}
                          value={value}
                          checked={vorlage.watermark_pos === value}
                          onChange={() => updateVorlage({ watermark_pos: value })}
                          className="sr-only"
                        />
                        <div
                          className={`w-3 h-3 rounded-full border flex-shrink-0 flex items-center justify-center ${
                            vorlage.watermark_pos === value ? "border-orange-500" : "border-gray-300"
                          }`}
                          style={vorlage.watermark_pos === value ? { borderColor: "#e8620a" } : undefined}
                        >
                          {vorlage.watermark_pos === value && (
                            <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#e8620a" }} />
                          )}
                        </div>
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Absender / Couvert-Fenster */}
            <SectionHeader title="Absender / Couvert-Fenster" />
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-600">Horizontale Ausrichtung</Label>
                <div className="flex gap-2">
                  {([["links", "Links"], ["mitte", "Mitte"], ["rechts", "Rechts"]] as const).map(([val, lbl]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => updateVorlage({ absender_pos_h: val })}
                      className={`flex-1 py-1 px-2 rounded text-xs border transition-colors ${
                        vorlage.absender_pos_h === val
                          ? "text-white border-transparent"
                          : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                      }`}
                      style={vorlage.absender_pos_h === val ? { background: "#6b4c2a", borderColor: "#6b4c2a" } : undefined}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-gray-600">Abstand oben (mm)</Label>
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number"
                      min={20}
                      max={120}
                      value={vorlage.absender_top_mm}
                      onChange={(e) => updateVorlage({ absender_top_mm: Number(e.target.value) })}
                      className="h-8 text-xs w-20"
                    />
                    <span className="text-xs text-gray-400">mm</span>
                  </div>
                  <p className="text-xs text-gray-400">Standard: 55 mm</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-gray-600">Abstand links (mm)</Label>
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number"
                      min={0}
                      max={150}
                      value={vorlage.absender_left_mm ?? 0}
                      onChange={(e) => updateVorlage({ absender_left_mm: Number(e.target.value) })}
                      className="h-8 text-xs w-20"
                    />
                    <span className="text-xs text-gray-400">mm</span>
                  </div>
                  <p className="text-xs text-gray-400">Standard: 0 mm</p>
                </div>
              </div>
              <p className="text-xs text-gray-400">Typisches Couvert-Fenster: 45–55 mm oben, 20–30 mm links.</p>
            </div>

            {/* Ansprechperson */}
            <SectionHeader title="Ansprechperson" />
            <div className="space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <div
                  onClick={() => updateVorlage({ ansprechperson_aktiv: !vorlage.ansprechperson_aktiv })}
                  className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer flex-shrink-0`}
                  style={{ background: vorlage.ansprechperson_aktiv ? "#6b4c2a" : "#e5e7eb" }}
                >
                  <div
                    className="w-3.5 h-3.5 bg-white rounded-full absolute top-0.5 transition-transform shadow"
                    style={{ transform: vorlage.ansprechperson_aktiv ? "translateX(18px)" : "translateX(2px)" }}
                  />
                </div>
                <span className="text-xs text-gray-600">Ansprechperson anzeigen</span>
              </label>
              {vorlage.ansprechperson_aktiv && (
                <div className="space-y-2 pl-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-600">Bezeichnung / Label</Label>
                    <Input
                      value={vorlage.ansprechperson_label}
                      onChange={(e) => updateVorlage({ ansprechperson_label: e.target.value })}
                      placeholder="z.B. Ansprechperson, Sachbearbeiter"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-gray-600">Quelle (beim Erstellen von Dokumenten)</Label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {([
                        ["intern", "Intern (Mitarbeiter)"],
                        ["extern", "Extern (Kundenkontakt)"],
                        ["manuell", "Manuell eingeben"],
                      ] as const).map(([val, lbl]) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => updateVorlage({ ansprechperson_quelle: val })}
                          className={`py-1.5 px-2 rounded text-xs border transition-colors text-center ${
                            vorlage.ansprechperson_quelle === val
                              ? "text-white border-transparent"
                              : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                          }`}
                          style={vorlage.ansprechperson_quelle === val ? { background: "#6b4c2a", borderColor: "#6b4c2a" } : undefined}
                        >
                          {lbl}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-gray-400">
                      {vorlage.ansprechperson_quelle === "intern" && "Übernimmt den zugewiesenen Mitarbeiter aus dem Auftrag."}
                      {vorlage.ansprechperson_quelle === "extern" && "Übernimmt den Kundenkontakt (Ansprechperson beim Kunden)."}
                      {vorlage.ansprechperson_quelle === "manuell" && "Manuell beim Erstellen des Dokuments eingeben."}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Block-Positionen */}
            <SectionHeader title="Block-Positionen" />
            <p className="text-xs text-gray-400 mb-2">Verschiebe Blöcke durch Eingabe der mm-Werte. Drag & Drop in der Vorschau folgt in der nächsten Version.</p>
            <div className="space-y-3">
              {([
                ["header", "Header (Logo + Firmeninfo)"],
                ["empfaenger", "Empfänger-Adresse"],
                ["meta", "Datum / Nr. / Fälligkeit"],
                ["ansprechperson", "Ansprechperson-Block"],
              ] as const).map(([block, label]) => {
                const pos = (vorlage.block_positions as any)?.[block] || { top: 0, left: 0 };
                return (
                  <div key={block} className="border border-gray-100 rounded-md p-2.5 space-y-2">
                    <Label className="text-xs font-semibold text-gray-700">{label}</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs text-gray-500">Oben (mm)</Label>
                        <Input
                          type="number"
                          min={0}
                          max={250}
                          value={pos.top || 0}
                          onChange={(e) => updateVorlage({
                            block_positions: {
                              ...vorlage.block_positions,
                              [block]: { ...pos, top: Number(e.target.value) }
                            }
                          })}
                          className="h-7 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-gray-500">Links (mm)</Label>
                        <Input
                          type="number"
                          min={0}
                          max={190}
                          value={pos.left || 0}
                          onChange={(e) => updateVorlage({
                            block_positions: {
                              ...vorlage.block_positions,
                              [block]: { ...pos, left: Number(e.target.value) }
                            }
                          })}
                          className="h-7 text-xs"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Positionstexte */}
            <SectionHeader title="Positionstexte (Tabellenspalten)" />
            <div className="grid grid-cols-2 gap-2">
              {([
                ["pos", "Pos."],
                ["beschreibung", "Beschreibung"],
                ["menge", "Menge"],
                ["einheit", "Einheit"],
                ["preis", "Preis"],
                ["total", "Total"],
              ] as const).map(([field, placeholder]) => (
                <div key={field} className="space-y-1">
                  <Label className="text-xs text-gray-600 capitalize">{placeholder}</Label>
                  <Input
                    value={(vorlage.positionstexte as any)?.[field] ?? placeholder}
                    onChange={(e) => updateVorlage({
                      positionstexte: {
                        ...(vorlage.positionstexte || {}),
                        [field]: e.target.value
                      }
                    })}
                    placeholder={placeholder}
                    className="h-7 text-xs"
                  />
                </div>
              ))}
            </div>

            {/* Footer */}
            <SectionHeader title="Footer" />
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <div
                  onClick={() => updateVorlage({ show_contact: !vorlage.show_contact })}
                  className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer flex-shrink-0 ${
                    vorlage.show_contact ? "" : "bg-gray-200"
                  }`}
                  style={vorlage.show_contact ? { background: "#6b4c2a" } : undefined}
                >
                  <div
                    className="w-3.5 h-3.5 bg-white rounded-full absolute top-0.5 transition-transform shadow"
                    style={{ transform: vorlage.show_contact ? "translateX(18px)" : "translateX(2px)" }}
                  />
                </div>
                <span className="text-xs text-gray-600">Kontaktdaten im Footer anzeigen</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <div
                  onClick={() => updateVorlage({ show_page_num: !vorlage.show_page_num })}
                  className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer flex-shrink-0 ${
                    vorlage.show_page_num ? "" : "bg-gray-200"
                  }`}
                  style={vorlage.show_page_num ? { background: "#6b4c2a" } : undefined}
                >
                  <div
                    className="w-3.5 h-3.5 bg-white rounded-full absolute top-0.5 transition-transform shadow"
                    style={{ transform: vorlage.show_page_num ? "translateX(18px)" : "translateX(2px)" }}
                  />
                </div>
                <span className="text-xs text-gray-600">Seitennummer anzeigen</span>
              </label>
            </div>

            {/* Spacer */}
            <div className="h-4" />
          </div>

          {/* ─── Right: Live Preview ───────────────────── */}
          <div className="lg:sticky lg:top-4 self-start">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <Eye className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-600">Live-Vorschau</span>
              <span className="text-xs px-2 py-0.5 rounded font-medium" style={{ background: "#f3f4f6", color: "#6b4c2a" }}>{getDocTitle(activeDoc)}</span>
              {(() => {
                const saved = savedVorlagen[activeDoc];
                const isUnsaved = saved
                  ? JSON.stringify({ ...vorlage, logo_data_url: null, watermark_data_url: null }) !==
                    JSON.stringify({ ...saved, logo_data_url: null, watermark_data_url: null })
                  : false;
                return isUnsaved ? (
                  <span className="text-xs px-2 py-0.5 rounded" style={{ background: "#fef3c7", color: "#92400e" }}>● Ungespeichert</span>
                ) : saved ? (
                  <span className="text-xs px-2 py-0.5 rounded" style={{ background: "#d1fae5", color: "#065f46" }}>✓ Gespeichert</span>
                ) : null;
              })()}
            </div>
            <div
              style={{
                width: "100%",
                maxWidth: 480,
                aspectRatio: "1 / 1.4142",
                background: "white",
                boxShadow: "0 4px 24px rgba(0,0,0,0.13), 0 1.5px 6px rgba(0,0,0,0.08)",
                overflow: "hidden",
                fontSize: 9,
                position: "relative",
                borderRadius: 3,
              }}
              dangerouslySetInnerHTML={{ __html: renderA4Preview(vorlage, activeDoc) }}
            />
            <p className="text-xs text-gray-400 mt-2">Vorschau zeigt das aktuelle Design mit Beispieldaten.</p>
          </div>
        </div>
      )}

      {/* Save button */}
      <div className="flex justify-end pt-2 border-t border-gray-100">
        <Button
          onClick={handleSave}
          disabled={saveMutation.isPending}
          className="gap-2 text-white"
          style={{ background: "#6b4c2a", borderColor: "#6b4c2a" }}
        >
          <Save className="w-4 h-4" />
          {saveMutation.isPending ? "Speichert..." : "Vorlage speichern"}
        </Button>
      </div>
    </div>
  );
}
