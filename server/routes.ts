import type { Express, Request, Response } from "express";
import type { Server } from "node:http";
import multer from "multer";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import supabase from "./supabase";
import * as fs from "fs";
import * as path from "path";
import bcrypt from "bcryptjs";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";
import { fileURLToPath } from "url";

// Robust logo path resolution: works in both ESM (dev) and CJS (production build)
function getLogoPath(): string {
  // Try __dirname first (CJS / compiled output)
  if (typeof __dirname !== "undefined") {
    const p1 = path.join(__dirname, "schneggenburger-logo.jpg");
    if (fs.existsSync(p1)) return p1;
  }
  // Try import.meta.url (ESM dev)
  try {
    const metaUrl = import.meta?.url;
    if (metaUrl) {
      const p2 = path.join(path.dirname(fileURLToPath(metaUrl)), "schneggenburger-logo.jpg");
      if (fs.existsSync(p2)) return p2;
    }
  } catch {}
  // Fallback: search common locations relative to cwd
  const candidates = [
    path.join(process.cwd(), "server", "schneggenburger-logo.jpg"),
    path.join(process.cwd(), "dist", "schneggenburger-logo.jpg"),
    path.join(process.cwd(), "schneggenburger-logo.jpg"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0]; // best guess
}

function getFuhrwerkPath(): string {
  if (typeof __dirname !== "undefined") {
    const p1 = path.join(__dirname, "fuhrwerk-hintergrund.jpg");
    if (fs.existsSync(p1)) return p1;
  }
  try {
    const metaUrl = import.meta?.url;
    if (metaUrl) {
      const p2 = path.join(path.dirname(fileURLToPath(metaUrl)), "fuhrwerk-hintergrund.jpg");
      if (fs.existsSync(p2)) return p2;
    }
  } catch {}
  const candidates = [
    path.join(process.cwd(), "server", "fuhrwerk-hintergrund.jpg"),
    path.join(process.cwd(), "dist", "fuhrwerk-hintergrund.jpg"),
    path.join(process.cwd(), "fuhrwerk-hintergrund.jpg"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function nextNr(prefix: string, list: { nr?: string }[]): string {
  const year = new Date().getFullYear();
  const yearPrefix = `${prefix}-${year}-`;
  let max = 0;
  for (const item of list) {
    const nr = (item.nr || "").toString();
    if (nr.startsWith(yearPrefix)) {
      const num = parseInt(nr.slice(yearPrefix.length), 10);
      if (!isNaN(num) && num > max) max = num;
    }
  }
  return `${yearPrefix}${String(max + 1).padStart(4, "0")}`;
}

function asError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object') {
    const obj = e as any;
    // Supabase error objects have .message and .details/.hint
    if (obj.message) {
      const parts = [String(obj.message)];
      if (obj.details) parts.push(`Details: ${obj.details}`);
      if (obj.hint) parts.push(`Hint: ${obj.hint}`);
      if (obj.code) parts.push(`Code: ${obj.code}`);
      return parts.join(' | ');
    }
    return JSON.stringify(e);
  }
  return String(e);
}

// Helper: generate random backup codes
function generateBackupCodes(): string[] {
  return Array.from({ length: 8 }, () =>
    Math.random().toString(36).slice(2, 8).toUpperCase()
  );
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // ============= AUTH =============

  // Step 1: Login with username + password
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { benutzername, passwort } = req.body;
      if (!benutzername || !passwort)
        return res.status(400).json({ ok: false, message: "Benutzername und Passwort erforderlich" });

      const { data: user, error } = await supabase
        .from("app_benutzer")
        .select("*")
        .eq("benutzername", benutzername.toLowerCase().trim())
        .eq("aktiv", true)
        .single();

      if (error || !user)
        return res.status(401).json({ ok: false, message: "Benutzername oder Passwort falsch" });

      const pwOk = await bcrypt.compare(passwort, user.passwort_hash);
      if (!pwOk)
        return res.status(401).json({ ok: false, message: "Benutzername oder Passwort falsch" });

      // If 2FA is active, require TOTP step
      if (user.totp_aktiv) {
        return res.json({ ok: true, requires2fa: true, userId: user.id });
      }

      return res.json({
        ok: true,
        requires2fa: false,
        user: { id: user.id, benutzername: user.benutzername, rolle: user.rolle }
      });
    } catch (e) {
      return res.status(500).json({ ok: false, message: asError(e) });
    }
  });

  // Step 2: Verify TOTP code
  app.post("/api/auth/verify-2fa", async (req, res) => {
    try {
      const { userId, code } = req.body;
      if (!userId || !code)
        return res.status(400).json({ ok: false, message: "Fehlende Daten" });

      const { data: user } = await supabase
        .from("app_benutzer")
        .select("*")
        .eq("id", userId)
        .eq("aktiv", true)
        .single();

      if (!user) return res.status(401).json({ ok: false, message: "Benutzer nicht gefunden" });

      // Check backup codes first
      if (user.backup_codes && user.backup_codes.includes(code.toUpperCase())) {
        // Remove used backup code
        await supabase
          .from("app_benutzer")
          .update({ backup_codes: user.backup_codes.filter((c: string) => c !== code.toUpperCase()) })
          .eq("id", userId);
        return res.json({ ok: true, user: { id: user.id, benutzername: user.benutzername, rolle: user.rolle } });
      }

      // Verify TOTP
      const totp = new OTPAuth.TOTP({
        secret: OTPAuth.Secret.fromBase32(user.totp_secret),
        digits: 6,
        period: 30,
      });
      const delta = totp.validate({ token: code.replace(/\s/g, ""), window: 1 });
      if (delta === null)
        return res.status(401).json({ ok: false, message: "Falscher 2FA Code" });

      return res.json({
        ok: true,
        user: { id: user.id, benutzername: user.benutzername, rolle: user.rolle }
      });
    } catch (e) {
      return res.status(500).json({ ok: false, message: asError(e) });
    }
  });

  // Setup 2FA: generate secret + QR code
  app.post("/api/auth/setup-2fa", async (req, res) => {
    try {
      const { userId } = req.body;
      if (!userId) return res.status(400).json({ message: "userId fehlt" });

      const { data: user } = await supabase
        .from("app_benutzer")
        .select("benutzername")
        .eq("id", userId)
        .single();

      if (!user) return res.status(404).json({ message: "Benutzer nicht gefunden" });

      const secret = new OTPAuth.Secret({ size: 20 });
      const totp = new OTPAuth.TOTP({
        issuer: "AuftragsPro",
        label: user.benutzername,
        secret,
        digits: 6,
        period: 30,
      });

      const uri = totp.toString();
      const qrDataUrl = await QRCode.toDataURL(uri);
      const backupCodes = generateBackupCodes();

      // Store secret temporarily (not yet active)
      await supabase
        .from("app_benutzer")
        .update({ totp_secret: secret.base32, backup_codes: backupCodes })
        .eq("id", userId);

      return res.json({ ok: true, qrDataUrl, backupCodes, secret: secret.base32 });
    } catch (e) {
      return res.status(500).json({ message: asError(e) });
    }
  });

  // Confirm 2FA setup with a valid code
  app.post("/api/auth/confirm-2fa", async (req, res) => {
    try {
      const { userId, code } = req.body;
      const { data: user } = await supabase
        .from("app_benutzer")
        .select("totp_secret")
        .eq("id", userId)
        .single();

      if (!user?.totp_secret) return res.status(400).json({ message: "Kein Secret gefunden" });

      const totp = new OTPAuth.TOTP({
        secret: OTPAuth.Secret.fromBase32(user.totp_secret),
        digits: 6,
        period: 30,
      });
      const delta = totp.validate({ token: code.replace(/\s/g, ""), window: 1 });
      if (delta === null) return res.status(401).json({ ok: false, message: "Falscher Code" });

      await supabase
        .from("app_benutzer")
        .update({ totp_aktiv: true })
        .eq("id", userId);

      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ message: asError(e) });
    }
  });

  // Change own password
  app.post("/api/auth/passwort-aendern", async (req, res) => {
    try {
      const { userId, altesPasswort, neuesPasswort } = req.body;
      if (!userId || !altesPasswort || !neuesPasswort)
        return res.status(400).json({ message: "Fehlende Felder" });
      if (neuesPasswort.length < 6)
        return res.status(400).json({ message: "Passwort muss mindestens 6 Zeichen haben" });

      const { data: user } = await supabase
        .from("app_benutzer")
        .select("passwort_hash")
        .eq("id", userId)
        .single();

      if (!user) return res.status(404).json({ message: "Benutzer nicht gefunden" });
      const ok = await bcrypt.compare(altesPasswort, user.passwort_hash);
      if (!ok) return res.status(401).json({ message: "Altes Passwort falsch" });

      const hash = await bcrypt.hash(neuesPasswort, 12);
      await supabase
        .from("app_benutzer")
        .update({ passwort_hash: hash, aktualisiert: new Date().toISOString() })
        .eq("id", userId);

      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ message: asError(e) });
    }
  });

  // ============= BENUTZER VERWALTUNG (Admin only) =============

  app.get("/api/benutzer", async (_req, res) => {
    try {
      const { data } = await supabase
        .from("app_benutzer")
        .select("id, benutzername, rolle, totp_aktiv, aktiv, erstellt")
        .order("erstellt");
      return res.json(data || []);
    } catch (e) {
      return res.status(500).json({ message: asError(e) });
    }
  });

  app.post("/api/benutzer", async (req, res) => {
    try {
      const { benutzername, passwort, rolle } = req.body;
      if (!benutzername || !passwort)
        return res.status(400).json({ message: "Benutzername und Passwort erforderlich" });
      if (passwort.length < 6)
        return res.status(400).json({ message: "Passwort muss mindestens 6 Zeichen haben" });

      const hash = await bcrypt.hash(passwort, 12);
      const { data, error } = await supabase
        .from("app_benutzer")
        .insert({
          benutzername: benutzername.toLowerCase().trim(),
          passwort_hash: hash,
          rolle: rolle || "mitarbeiter",
        })
        .select("id, benutzername, rolle, totp_aktiv, aktiv, erstellt")
        .single();

      if (error) return res.status(400).json({ message: asError(error) });
      return res.json(data);
    } catch (e) {
      return res.status(500).json({ message: asError(e) });
    }
  });

  app.patch("/api/benutzer/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { benutzername, rolle, aktiv, passwort } = req.body;
      const updates: Record<string, unknown> = { aktualisiert: new Date().toISOString() };
      if (benutzername) updates.benutzername = benutzername.toLowerCase().trim();
      if (rolle) updates.rolle = rolle;
      if (aktiv !== undefined) updates.aktiv = aktiv;
      if (passwort) {
        if (passwort.length < 6) return res.status(400).json({ message: "Passwort muss mindestens 6 Zeichen haben" });
        updates.passwort_hash = await bcrypt.hash(passwort, 12);
      }
      const { data, error } = await supabase
        .from("app_benutzer")
        .update(updates)
        .eq("id", id)
        .select("id, benutzername, rolle, totp_aktiv, aktiv, erstellt")
        .single();
      if (error) return res.status(400).json({ message: asError(error) });
      return res.json(data);
    } catch (e) {
      return res.status(500).json({ message: asError(e) });
    }
  });

  app.delete("/api/benutzer/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await supabase.from("app_benutzer").delete().eq("id", id);
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ message: asError(e) });
    }
  });

  // Reset 2FA for a user (Admin)
  app.post("/api/benutzer/:id/reset-2fa", async (req, res) => {
    try {
      const { id } = req.params;
      await supabase
        .from("app_benutzer")
        .update({ totp_aktiv: false, totp_secret: null, backup_codes: null })
        .eq("id", id);
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ message: asError(e) });
    }
  });

  // ============= STATS =============
  app.get("/api/stats", async (_req, res) => {
    try {
      const { data, error } = await supabase
        .from("auftraege")
        .select("status");
      if (error) throw error;
      const rows = data || [];
      const gesamt = rows.length;
      const abgeschlossen = rows.filter(
        (r: any) => r.status === "abgeschlossen"
      ).length;
      const offen = rows.filter(
        (r: any) =>
          r.status === "anfrage" ||
          r.status === "angebot" ||
          r.status === "bestaetigt"
      ).length;
      const in_bearbeitung = rows.filter(
        (r: any) =>
          r.status === "in_arbeit" ||
          r.status === "qualitaet" ||
          r.status === "rechnung"
      ).length;
      res.json({ gesamt, offen, in_bearbeitung, abgeschlossen });
    } catch (e) {
      res.status(500).json({ message: asError(e) });
    }
  });

  // ============= AUFTRAEGE =============
  app.get("/api/auftraege", async (_req, res) => {
    try {
      const { data, error } = await supabase
        .from("auftraege")
        .select("*")
        .order("erstellt", { ascending: false });
      if (error) throw error;
      res.json(data || []);
    } catch (e) {
      res.status(500).json({ message: asError(e) });
    }
  });

  app.post("/api/auftraege", async (req, res) => {
    try {
      const body = req.body || {};
      // gen nr
      const { data: allRows } = await supabase
        .from("auftraege")
        .select("nr");
      const nr = nextNr("A", allRows || []);
      const id = uid();
      const now = new Date().toISOString();
      const row = {
        id,
        nr,
        titel: body.titel || "(Ohne Titel)",
        kunde: body.kunde || "",
        kunde_adresse: body.kunde_adresse || null,
        kunde_email: body.kunde_email || null,
        kunde_telefon: body.kunde_telefon || null,
        beschreibung: body.beschreibung || null,
        status: body.status || "anfrage",
        prioritaet: body.prioritaet || "normal",
        kategorie: body.kategorie || null,
        start_datum: body.start_datum || null,
        end_datum: body.end_datum || null,
        angebots_betrag:
          body.angebots_betrag !== undefined && body.angebots_betrag !== ""
            ? Number(body.angebots_betrag)
            : null,
        rechnungs_betrag:
          body.rechnungs_betrag !== undefined && body.rechnungs_betrag !== ""
            ? Number(body.rechnungs_betrag)
            : null,
        waehrung: body.waehrung || "CHF",
        verantwortlicher: body.verantwortlicher || null,
        erstellt: now,
        aktualisiert: now,
      };
      const { data, error } = await supabase
        .from("auftraege")
        .insert(row)
        .select()
        .single();
      if (error) throw error;
      // initial verlauf
      await supabase.from("verlauf").insert({
        id: uid(),
        auftrag_id: id,
        status: row.status,
        kommentar: "Auftrag erstellt",
        von: body.verantwortlicher || null,
        datum: now,
      });
      res.json(data);
    } catch (e) {
      res.status(500).json({ message: asError(e) });
    }
  });

  app.get("/api/auftraege/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { data: auftrag, error } = await supabase
        .from("auftraege")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      const { data: verlauf } = await supabase
        .from("verlauf")
        .select("*")
        .eq("auftrag_id", id)
        .order("datum", { ascending: false });
      const { data: notizen } = await supabase
        .from("notizen")
        .select("*")
        .eq("auftrag_id", id)
        .order("datum", { ascending: false });
      const { data: dokumente } = await supabase
        .from("dokumente")
        .select("id, auftrag_id, name, mime, size_bytes, kat, beschreibung, storage_path, datum")
        .eq("auftrag_id", id)
        .order("datum", { ascending: false });
      res.json({
        ...auftrag,
        verlauf: verlauf || [],
        notizen: notizen || [],
        dokumente: dokumente || [],
      });
    } catch (e) {
      res.status(500).json({ message: asError(e) });
    }
  });

  app.patch("/api/auftraege/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const body = req.body || {};
      const allowed: Record<string, any> = {};
      const fields = [
        "titel",
        "kunde",
        "kunde_adresse",
        "kunde_email",
        "kunde_telefon",
        "beschreibung",
        "status",
        "prioritaet",
        "kategorie",
        "start_datum",
        "end_datum",
        "angebots_betrag",
        "rechnungs_betrag",
        "waehrung",
        "verantwortlicher",
      ];
      for (const f of fields) {
        if (f in body) {
          let v = body[f];
          if ((f === "angebots_betrag" || f === "rechnungs_betrag") && v !== null && v !== "") {
            v = Number(v);
          }
          if (v === "") v = null;
          allowed[f] = v;
        }
      }
      allowed.aktualisiert = new Date().toISOString();
      const { data, error } = await supabase
        .from("auftraege")
        .update(allowed)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      res.json(data);
    } catch (e) {
      res.status(500).json({ message: asError(e) });
    }
  });

  app.patch("/api/auftraege/:id/status", async (req, res) => {
    try {
      const { id } = req.params;
      const { status, kommentar, von } = req.body || {};
      if (!status) return res.status(400).json({ message: "status required" });
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("auftraege")
        .update({ status, aktualisiert: now })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      await supabase.from("verlauf").insert({
        id: uid(),
        auftrag_id: id,
        status,
        kommentar: kommentar || `Status geändert zu ${status}`,
        von: von || null,
        datum: now,
      });
      res.json(data);
    } catch (e) {
      res.status(500).json({ message: asError(e) });
    }
  });

  app.delete("/api/auftraege/:id", async (req, res) => {
    try {
      const { id } = req.params;
      // best-effort cascade
      await supabase.from("dokument_daten").delete().in(
        "dokument_id",
        ((await supabase.from("dokumente").select("id").eq("auftrag_id", id)).data || []).map(
          (r: any) => r.id
        )
      );
      await supabase.from("dokumente").delete().eq("auftrag_id", id);
      await supabase.from("notizen").delete().eq("auftrag_id", id);
      await supabase.from("verlauf").delete().eq("auftrag_id", id);
      await supabase.from("rechnungen").delete().eq("auftrag_id", id);
      const { error } = await supabase.from("auftraege").delete().eq("id", id);
      if (error) throw error;
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: asError(e) });
    }
  });

  // ============= NOTIZEN =============
  app.get("/api/auftraege/:id/notizen", async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("notizen")
        .select("*")
        .eq("auftrag_id", req.params.id)
        .order("datum", { ascending: false });
      if (error) throw error;
      res.json(data || []);
    } catch (e) {
      res.status(500).json({ message: asError(e) });
    }
  });

  app.post("/api/auftraege/:id/notizen", async (req, res) => {
    try {
      const { id } = req.params;
      const { text, von } = req.body || {};
      if (!text) return res.status(400).json({ message: "text required" });
      const row = {
        id: uid(),
        auftrag_id: id,
        text,
        von: von || null,
        datum: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from("notizen")
        .insert(row)
        .select()
        .single();
      if (error) throw error;
      res.json(data);
    } catch (e) {
      res.status(500).json({ message: asError(e) });
    }
  });

  app.delete("/api/auftraege/:id/notizen/:nid", async (req, res) => {
    try {
      const { nid } = req.params;
      const { error } = await supabase.from("notizen").delete().eq("id", nid);
      if (error) throw error;
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: asError(e) });
    }
  });

  // ============= DOKUMENTE =============
  app.get("/api/auftraege/:id/dokumente", async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("dokumente")
        .select("id, auftrag_id, name, mime, size_bytes, kat, beschreibung, storage_path, datum")
        .eq("auftrag_id", req.params.id)
        .order("datum", { ascending: false });
      if (error) throw error;
      res.json(data || []);
    } catch (e) {
      res.status(500).json({ message: asError(e) });
    }
  });

  app.post(
    "/api/auftraege/:id/dokumente",
    upload.single("file"),
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const file = (req as any).file as Express.Multer.File | undefined;
        if (!file) return res.status(400).json({ message: "file required" });
        const did = uid();
        const row = {
          id: did,
          auftrag_id: id,
          name: file.originalname,
          mime: file.mimetype || "application/octet-stream",
          size_bytes: file.size,
          kat: req.body?.kat || null,
          beschreibung: req.body?.beschreibung || null,
          storage_path: null,
          datum: new Date().toISOString(),
        };
        const { data, error } = await supabase
          .from("dokumente")
          .insert(row)
          .select()
          .single();
        if (error) throw error;
        const b64 = file.buffer.toString("base64");
        const { error: e2 } = await supabase
          .from("dokument_daten")
          .insert({ dokument_id: did, data: b64 });
        if (e2) {
          await supabase.from("dokumente").delete().eq("id", did);
          throw e2;
        }
        res.json(data);
      } catch (e) {
        res.status(500).json({ message: asError(e) });
      }
    }
  );

  app.get(
    "/api/auftraege/:id/dokumente/:did/download",
    async (req, res) => {
      try {
        const { did } = req.params;
        const { data: doc, error } = await supabase
          .from("dokumente")
          .select("*")
          .eq("id", did)
          .single();
        if (error) throw error;
        const { data: dd, error: e2 } = await supabase
          .from("dokument_daten")
          .select("data")
          .eq("dokument_id", did)
          .single();
        if (e2) throw e2;
        const buf = Buffer.from(dd.data, "base64");
        res.setHeader("Content-Type", doc.mime || "application/octet-stream");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${encodeURIComponent(doc.name)}"`
        );
        res.send(buf);
      } catch (e) {
        res.status(500).json({ message: asError(e) });
      }
    }
  );

  app.delete("/api/auftraege/:id/dokumente/:did", async (req, res) => {
    try {
      const { did } = req.params;
      await supabase.from("dokument_daten").delete().eq("dokument_id", did);
      const { error } = await supabase.from("dokumente").delete().eq("id", did);
      if (error) throw error;
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: asError(e) });
    }
  });

  // ============= RECHNUNGEN =============
  app.get("/api/auftraege/:id/rechnungen", async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("rechnungen")
        .select("*")
        .eq("auftrag_id", req.params.id)
        .order("erstellt", { ascending: false });
      if (error) throw error;
      res.json(data || []);
    } catch (e) {
      res.status(500).json({ message: asError(e) });
    }
  });

  app.post("/api/auftraege/:id/rechnungen", async (req, res) => {
    try {
      const { id } = req.params;
      const body = req.body || {};
      const positionen = Array.isArray(body.positionen) ? body.positionen : [];
      const betrag = positionen.reduce(
        (s: number, p: any) =>
          s + (Number(p.menge) || 0) * (Number(p.einzelpreis) || 0),
        0
      );
      const { data: allRows } = await supabase.from("rechnungen").select("nr");
      const nr = body.nr || nextNr("R", allRows || []);
      const row = {
        id: uid(),
        auftrag_id: id,
        nr,
        betrag,
        waehrung: body.waehrung || "CHF",
        positionen,
        notiz: body.notiz || null,
        faellig_datum: body.faellig_datum || null,
        erstellt: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from("rechnungen")
        .insert(row)
        .select()
        .single();
      if (error) throw error;
      res.json(data);
    } catch (e) {
      res.status(500).json({ message: asError(e) });
    }
  });


  // ═══════════════════════════════════════════════════════════════════════════
  // ─── Zentraler PDF-HTML-Generator (nutzt pdf_vorlagen aus DB) ─────────────
  // ═══════════════════════════════════════════════════════════════════════════

  async function buildPdfHtml(docTyp: string, data: {
    titel: string;          // "OFFERTE", "RECHNUNG", etc.
    nummer: string;
    datum: string;
    faelligDatum?: string;
    gueltigBis?: string;
    empfaenger: string;
    empfaengerStrasse?: string;
    empfaengerPlzOrt?: string;
    firma: string;
    firmaAdresse: string;
    firmaPlzOrt: string;
    firmaTel: string;
    firmaEmail: string;
    positionen: any[];
    subtotal: number;
    mwstPct: number;
    mwstBetrag: number;
    total: number;
    einleitung?: string;
    schluss?: string;
    showTotals?: boolean;
    extraHtml?: string;
    mahngebuehr?: number;
    ansprechpersonIntern?: string;
    ansprechpersonExtern?: string;
    ansprechpersonManuell?: string;
  }): Promise<string> {
    // Vorlage aus DB laden (mit Retry + Logo-Fallback aus Offerte-Vorlage)
    let vd: any = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data: vdTry, error: vdErr } = await supabase.from("pdf_vorlagen").select("*").eq("doc_typ", docTyp).single();
      if (vdTry) { vd = vdTry; break; }
      if (vdErr) console.warn(`[PDF] Vorlage Laden Versuch ${attempt+1} (doc_typ=${docTyp}):`, vdErr.message);
      if (attempt < 2) await new Promise(r => setTimeout(r, 600));
    }
    if (!vd) console.error(`[PDF] Vorlage nach 3 Versuchen nicht gefunden (doc_typ=${docTyp})`);
    const v = vd || {};
    // Logo-Fallback: wenn aktuelle Vorlage kein Logo hat, hole es aus der Offerte-Vorlage
    if (!v.logo_data_url && docTyp !== "offerte") {
      const { data: offVorlage } = await supabase.from("pdf_vorlagen").select("logo_data_url,logo_scale,logo_pos").eq("doc_typ", "offerte").single();
      if (offVorlage?.logo_data_url) {
        v.logo_data_url = offVorlage.logo_data_url;
        if (!v.logo_scale) v.logo_scale = offVorlage.logo_scale;
        if (!v.logo_pos)   v.logo_pos   = offVorlage.logo_pos;
        console.log(`[PDF] Logo-Fallback aus Offerte-Vorlage verwendet für doc_typ=${docTyp}`);
      }
    }
    const hc  = v.header_color   || "#6b4c2a";
    const fc  = v.footer_color   || "#1a3a6b";
    const design     = v.design       || "A";
    const logoScale  = v.logo_scale   || 100;
    const logoUrl    = v.logo_data_url || null;
    const slogan     = v.slogan       || "Ihr Partner für Metallbau & Schreinerei";
    const logoPos    = v.logo_pos     || "links";
    const einl       = (v.einleitung !== undefined && v.einleitung !== null) ? v.einleitung : (data.einleitung || "");
    const schl       = (v.schluss !== undefined && v.schluss !== null) ? v.schluss : (data.schluss || "");
    const showContact= v.show_contact !== false;
    const showPageNum= v.show_page_num !== false;
    const wmUrl      = v.watermark_data_url || null;
    const wmOpacity  = ((v.watermark_opacity || 15) / 100).toFixed(2);
    const wmSize     = v.watermark_size || 60;
    const wmPos      = v.watermark_pos || "bottom";
    const showTotals = data.showTotals !== false;
    // Couvert-Fenster-Einstellungen nur für Offerte/Rechnung relevant
    const _useCovert = ["offerte", "rechnung", "mahnung"].includes(docTyp);
    const absenderPosH  = _useCovert ? (v.absender_pos_h  || "links") : "links";
    const absenderTopMm  = _useCovert ? (Number(v.absender_top_mm) || 55) : 20;
    const absenderLeftMm = _useCovert ? (Number(v.absender_left_mm) || 0) : 0;
    const fmtCHF = (n: number) => `CHF ${n.toFixed(2)}`;

    // Logo
    const lw = Math.round(70 * logoScale / 100);
    const lh = Math.round(45 * logoScale / 100);
    const logoHtml = logoUrl
      ? `<img src="${logoUrl}" style="max-width:${lw}px;max-height:${lh}px;object-fit:contain;display:block;" alt="Logo" />`
      : `<span style="font-size:14pt;font-weight:700;color:${hc};">${data.firma.substring(0,2).toUpperCase()}</span>`;

    // Wasserzeichen
    const wmPosMap: Record<string,string> = {
      "bottom":       "bottom:0;left:50%;transform:translateX(-50%)",
      "bottom-left":  "bottom:0;left:0",
      "bottom-right": "bottom:0;right:0",
      "center":       "top:50%;left:50%;transform:translate(-50%,-50%)",
      "top":          "top:0;left:50%;transform:translateX(-50%)",
      "full":         "top:0;left:0;width:100%;height:100%",
    };
    const wmStyle = wmPosMap[wmPos] || wmPosMap["bottom"];
    const wmHtml = wmUrl ? `<div style="position:absolute;${wmStyle};z-index:0;pointer-events:none;">
      <img src="${wmUrl}" style="opacity:${wmOpacity};${wmPos==="full"?`width:100%;height:100%;object-fit:cover`:`max-width:${wmSize}%;max-height:${wmSize}%;object-fit:contain`};display:block;" /></div>` : "";

    // Header
    let headerHtml = "";
    if (design === "B") {
      headerHtml = `<div style="background:${hc};color:#fff;padding:22px 40px 18px;display:flex;align-items:center;gap:16px;${logoPos==="rechts"?"flex-direction:row-reverse":""}">
        <div style="flex-shrink:0">${logoHtml}</div>
        <div><div style="font-size:15pt;font-weight:700;">${data.firma}</div><div style="font-size:9pt;opacity:0.85;">${slogan}</div></div>
      </div>`;
    } else if (design === "C") {
      headerHtml = `<div style="padding:16px 40px 6px;">${logoHtml}</div>`;
    } else if (design === "D") {
      // Zweifarbig: Linke Farbspalte — kein klassischer Header, wird im Body behandelt
      headerHtml = ``;
    } else if (design === "E") {
      // Elegant: Gradient-Linie
      headerHtml = `<div style="padding:20px 40px 10px;display:flex;align-items:center;justify-content:space-between;gap:16px;">
        <div style="flex-shrink:0">${logoHtml}<div style="font-size:8.5pt;color:#aaa;letter-spacing:0.1em;margin-top:3px;">${slogan.toUpperCase()}</div></div>
        <div style="text-align:right">
          <div style="font-size:13pt;font-weight:700;color:${hc};">${data.firma}</div>
          <div style="font-size:8.5pt;color:#888;">${data.firmaAdresse}, ${data.firmaPlzOrt}</div>
        </div>
      </div>
      <div style="height:3px;background:linear-gradient(90deg,${hc},${fc});margin:0 40px 0;border-radius:2px;"></div>`;
    } else if (design === "F") {
      // Box-Header: voller Farbblock
      headerHtml = `<div style="background:${hc};color:#fff;padding:22px 40px 18px;display:flex;align-items:flex-end;justify-content:space-between;gap:16px;${logoPos==="rechts"?"flex-direction:row-reverse":""}">
        <div style="flex-shrink:0">${logoHtml}<div style="font-size:8.5pt;opacity:0.75;margin-top:4px;">${slogan}</div></div>
        <div style="text-align:right">
          <div style="font-size:14pt;font-weight:800;letter-spacing:1px;">${data.firma}</div>
          <div style="font-size:8.5pt;opacity:0.8;">${data.firmaAdresse} · ${data.firmaPlzOrt}</div>
        </div>
      </div>`;
    } else {
      // Design A: Klassisch — Logo links, Dokument-Titel/Nr/Datum rechts (wie Frontend-Vorschau)
      headerHtml = `<div style="padding:20px 40px 14px;display:flex;align-items:flex-start;justify-content:space-between;gap:16px;${logoPos==="rechts"?"flex-direction:row-reverse":""}">
        <div style="flex-shrink:0">
          ${logoHtml}
          ${slogan ? `<div style="font-size:8pt;color:#888;margin-top:3px;">${slogan}</div>` : ""}
        </div>
        <div style="text-align:right">
          <div style="font-size:14pt;font-weight:700;color:#222;">${data.titel}</div>
          <div style="font-size:8.5pt;color:#555;margin-top:3px;">Nr: ${data.nummer}</div>
          <div style="font-size:8.5pt;color:#555;">Datum: ${data.datum}</div>
          ${data.faelligDatum ? `<div style="font-size:8.5pt;color:#555;">Fällig: ${data.faelligDatum}</div>` : ""}
          ${data.gueltigBis ? `<div style="font-size:8.5pt;color:#555;">Gültig bis: ${data.gueltigBis}</div>` : ""}
        </div>
      </div>
      <div style="height:2px;background:${hc};margin:0 40px 0;"></div>`;
    }

    // Positionen Tabelle
    const posHtml = data.positionen.map((p: any, i: number) => {
      const menge   = parseFloat(p.menge || p.anzahl || 1);
      const ep      = parseFloat(p.einzelpreis || p.preis || 0);
      const bet     = Number(p.total ?? p.betrag ?? (menge * ep));
      const einheit = p.einheit || "Stk.";

      // Beschreibung mit Unterpunkten:
      // Offerte: p.titel = Haupttitel, p.beschreibung = Unterzeilen (newline-getrennt)
      // Rechnung: p.beschreibung = erste Zeile Haupttitel, weitere Zeilen = Unterpunkte
      let haupttitel = "";
      let unterzeilen: string[] = [];

      if (p.titel) {
        // Offerte-Position: hat expliziten titel
        haupttitel = p.titel;
        const descLines = (p.beschreibung || "").split("\n").map((l: string) => l.trim()).filter(Boolean);
        unterzeilen = descLines;
      } else if (p.beschreibung) {
        // Rechnung-Position: beschreibung, erste Zeile = Titel
        const lines = p.beschreibung.split("\n").map((l: string) => l.trim()).filter(Boolean);
        haupttitel = lines[0] || "";
        unterzeilen = lines.slice(1);
      }

      // HTML für Beschreibungs-Zelle aufbauen
      const esc = (s: string) => s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
      let descHtml = `<span style="font-weight:600;color:#1a1a1a;">${esc(haupttitel)}</span>`;
      if (unterzeilen.length > 0) {
        descHtml += unterzeilen.map((z: string) =>
          `<br/><span style="font-size:8.5pt;color:#555;padding-left:8px;">– ${esc(z)}</span>`
        ).join("");
      }

      return `<tr style="border-bottom:1px solid #f0ebde">
        <td style="padding:7px 4px;color:#999;width:28px;vertical-align:top;">${(p.nr ?? i+1)}</td>
        <td style="padding:7px 4px;line-height:1.5;">${descHtml}</td>
        <td style="padding:7px 4px;text-align:right;color:#555;width:55px;vertical-align:top;">${menge % 1 === 0 ? menge.toFixed(0) : menge.toFixed(2)} ${einheit}</td>
        <td style="padding:7px 4px;text-align:right;color:#555;width:90px;vertical-align:top;">${fmtCHF(ep)}</td>
        <td style="padding:7px 4px;text-align:right;font-weight:600;width:90px;vertical-align:top;">${fmtCHF(bet)}</td>
      </tr>`;
    }).join("");

    // Totals
    const totalsHtml = showTotals ? `
      <div style="display:flex;justify-content:flex-end;margin-top:16px;">
        <div style="width:44%;font-size:9pt;">
          <div style="display:flex;justify-content:space-between;padding:3px 0"><span>Subtotal</span><span>${fmtCHF(data.subtotal)}</span></div>
          <div style="display:flex;justify-content:space-between;padding:3px 0"><span>MWST ${data.mwstPct.toFixed(1)}%</span><span>${fmtCHF(data.mwstBetrag)}</span></div>
          ${data.mahngebuehr ? `<div style="display:flex;justify-content:space-between;padding:3px 0"><span>Mahngebühr</span><span>${fmtCHF(data.mahngebuehr)}</span></div>` : ""}
          <div style="display:flex;justify-content:space-between;padding:5px 0;border-top:1.5px solid ${fc};margin-top:3px;font-weight:700;font-size:11pt;color:${fc}">
            <span>Total</span><span>${fmtCHF(data.total)}</span>
          </div>
        </div>
      </div>` : "";

    // Meta-Zeilen
    let metaHtml = `<span><b style="color:#999;font-weight:400">Datum: </b>${data.datum}</span>`;
    if (data.gueltigBis)  metaHtml += `&nbsp;&nbsp;<span><b style="color:#999;font-weight:400">Gültig bis: </b>${data.gueltigBis}</span>`;
    if (data.faelligDatum) metaHtml += `&nbsp;&nbsp;<span><b style="color:#999;font-weight:400">Zahlbar bis: </b>${data.faelligDatum}</span>`;

    // Footer — farbiger Balken wie in der Vorschau
    const footerHtml = design === "E"
      ? `<div style="margin-top:auto;">
          <div style="height:2px;background:linear-gradient(90deg,${fc},${hc});margin:0 40px;border-radius:2px;"></div>
          <div style="padding:8px 40px 14px;font-size:8pt;color:#999;font-style:italic;display:flex;justify-content:space-between;">
            ${showContact ? `<div>${data.firma} · ${data.firmaTel} · ${data.firmaEmail}</div>` : "<div></div>"}
            ${showPageNum ? `<div>Seite 1 / 1</div>` : ""}
          </div>
        </div>`
      : `<div style="margin-top:auto;">
          <div style="background:${fc};color:#fff;padding:6px 40px;font-size:8pt;display:flex;justify-content:space-between;align-items:center;-webkit-print-color-adjust:exact;print-color-adjust:exact;">
            ${showContact ? `<div>${data.firma} · ${data.firmaAdresse} · ${data.firmaPlzOrt} · ${data.firmaTel} · ${data.firmaEmail}</div>` : "<div></div>"}
            ${showPageNum ? `<div>Seite 1 / 1</div>` : ""}
          </div>
        </div>`;

    // Für Design A: Titel ist bereits im Header — nicht nochmals im Body zeigen
    const titelImHeader = design === "A";

    // Ansprechperson
    const apAktiv       = v.ansprechperson_aktiv !== false;
    const apLabel       = v.ansprechperson_label   || "Ansprechperson";
    const apQuelle      = v.ansprechperson_quelle  || "manuell";
    let ansprechperson  = "";
    if (apQuelle === "intern")  ansprechperson = data.ansprechpersonIntern || "";
    else if (apQuelle === "extern") ansprechperson = data.ansprechpersonExtern || "";
    else ansprechperson = data.ansprechpersonManuell || "";
    const apBlock = apAktiv && ansprechperson
      ? `<div style="font-size:9pt;color:#444;margin-bottom:8px;"><strong>${apLabel}:</strong> ${ansprechperson}</div>`
      : "";

    // Positionstexte (Spaltenbezeichnungen)
    const pt = (typeof v.positionstexte === "object" && v.positionstexte) ? v.positionstexte : {};
    const ptPos   = (pt as any).pos          || "Pos.";
    const ptBeschr= (pt as any).beschreibung || "Beschreibung";
    const ptMenge = (pt as any).menge        || "Menge";
    const ptPreis = (pt as any).preis        || "Preis";
    const ptTotal = (pt as any).total        || "Total";

    // Design D: Zweifarbig braucht speziellen Wrapper mit linker Spalte
    if (design === "D") {
      return `<!DOCTYPE html><html><head><meta charset="utf-8">
      <style>
        * { box-sizing:border-box; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; color-adjust:exact !important; }
        body { font-family:Arial,sans-serif;font-size:10pt;color:#222;margin:0;padding:0; }
        table { width:100%;border-collapse:collapse; }
        th { background:${hc};color:#fff;padding:8px 4px;text-align:left;font-size:8.5pt; }
        td { font-size:9pt; }
        .intro,.schluss { font-size:9pt;color:#444;white-space:pre-line; }
      </style></head>
      <body style="position:relative;display:flex;min-height:100vh;">
        ${wmHtml}
        <div style="width:22px;background:${hc};flex-shrink:0;display:flex;flex-direction:column;align-items:center;padding-top:20px;">
          ${logoUrl ? `<img src="${logoUrl}" style="width:16px;object-fit:contain;filter:brightness(0) invert(1);opacity:0.9;" />` : `<span style="color:white;font-weight:700;font-size:8pt;writing-mode:vertical-rl;transform:rotate(180deg);">${data.firma.substring(0,2).toUpperCase()}</span>`}
        </div>
        <div style="flex:1;display:flex;flex-direction:column;position:relative;z-index:1;">
          <div style="padding:18px 36px 10px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
              <div>
                <div style="font-size:14pt;font-weight:700;color:${hc};">${data.titel} Nr. ${data.nummer}</div>
                <div style="font-size:8.5pt;color:#555;margin-top:2px;">${data.firma} · ${data.firmaAdresse} · ${data.firmaPlzOrt}</div>
              </div>
              <div style="font-size:8.5pt;color:#555;text-align:right;line-height:1.6;">
                <div><b style="color:#999;font-weight:400">Datum: </b>${data.datum}</div>
                ${data.faelligDatum ? `<div><b style="color:#999;font-weight:400">Zahlbar bis: </b>${data.faelligDatum}</div>` : ""}
              </div>
            </div>
            <div style="height:2px;background:${hc};margin-bottom:12px;border-radius:1px;"></div>
            <div style="margin-bottom:12px;font-size:10pt;color:#333;">
              <div style="margin-top:${absenderTopMm - 20}mm;${absenderLeftMm > 0 ? `margin-left:${absenderLeftMm}mm;` : ""}text-align:left;line-height:1.55;">
                <div style="font-weight:600;">${data.empfaenger}</div>
                ${data.empfaengerStrasse ? `<div>${data.empfaengerStrasse}</div>` : ""}
                ${data.empfaengerPlzOrt  ? `<div>${data.empfaengerPlzOrt}</div>` : ""}
              </div>
            </div>
            ${apBlock}
            ${einl ? `<div class="intro" style="margin-bottom:12px;">${einl}</div>` : ""}
            <table>
              <thead><tr>
                <th style="width:28px">${ptPos}</th><th>${ptBeschr}</th>
                <th style="width:65px;text-align:right">${ptMenge}</th>
                <th style="width:90px;text-align:right">${ptPreis}</th>
                <th style="width:90px;text-align:right">${ptTotal}</th>
              </tr></thead>
              <tbody>${posHtml}</tbody>
            </table>
            ${totalsHtml}
            ${schl ? `<div class="schluss" style="margin-top:14px;">${schl}</div>` : ""}
          </div>
          ${footerHtml}
          ${data.extraHtml || ""}
        </div>
      </body></html>`;
    }

    // ─── Design G: Swiss Classic ─────────────────────────────────────────────
    if (design === "G") {
      return `<!DOCTYPE html><html><head><meta charset="utf-8">
      <style>
        * { box-sizing:border-box; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; color-adjust:exact !important; }
        body { font-family:Arial,Helvetica,sans-serif;font-size:10pt;color:#222;margin:0;padding:0; }
        table { width:100%;border-collapse:collapse; }
        th { background:#f5f5f5;color:#333;padding:8px 4px;text-align:left;font-size:8.5pt;border-bottom:1.5px solid #222; }
        td { font-size:9pt; }
        .intro,.schluss { font-size:9pt;color:#444;white-space:pre-line; }
      </style></head>
      <body style="position:relative;">
        ${wmHtml}
        <div style="position:relative;z-index:1;min-height:100vh;display:flex;flex-direction:column;">
          <div style="padding:28px 40px 0;border-top:2px solid ${hc};">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;${logoPos==="rechts"?"flex-direction:row-reverse;":""}">
              <div style="flex-shrink:0">
                ${logoHtml}
                ${slogan ? `<div style="font-size:8pt;color:#888;margin-top:3px;">${slogan}</div>` : ""}
              </div>
              <div style="text-align:right;font-size:8.5pt;color:#555;line-height:1.6;">
                <div style="font-weight:700;color:#222;">${data.firma}</div>
                <div>${data.firmaAdresse}</div>
                <div>${data.firmaPlzOrt}</div>
                <div>${data.firmaTel}</div>
                <div>${data.firmaEmail}</div>
              </div>
            </div>
            <div style="height:0.5px;background:#ccc;margin:16px 0 12px;"></div>
            <div style="font-size:8pt;color:#aaa;margin-bottom:3px;">${data.firma} · ${data.firmaAdresse} · ${data.firmaPlzOrt}</div>
            <div style="margin-top:${absenderTopMm - 20}mm;${absenderLeftMm > 0 ? `margin-left:${absenderLeftMm}mm;` : ""}margin-bottom:10mm;font-size:10pt;color:#333;text-align:left;line-height:1.55;">
              <div style="font-weight:600;">${data.empfaenger}</div>
              ${data.empfaengerStrasse ? `<div>${data.empfaengerStrasse}</div>` : ""}
              ${data.empfaengerPlzOrt  ? `<div>${data.empfaengerPlzOrt}</div>` : ""}
            </div>
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px;">
              <div style="font-size:15pt;font-weight:700;color:#111;">${data.titel} Nr. ${data.nummer}</div>
              <div style="font-size:8.5pt;color:#555;text-align:right;line-height:1.6;">
                <div><b style="color:#999;font-weight:400">Datum: </b>${data.datum}</div>
                ${data.gueltigBis ? `<div><b style="color:#999;font-weight:400">Gültig bis: </b>${data.gueltigBis}</div>` : ""}
                ${data.faelligDatum ? `<div><b style="color:#999;font-weight:400">Zahlbar bis: </b>${data.faelligDatum}</div>` : ""}
              </div>
            </div>
          </div>
          <div style="padding:0 40px;flex:1;">
            ${apBlock}
            ${einl ? `<div class="intro" style="margin-bottom:12px;">${einl}</div>` : ""}
            <table>
              <thead><tr>
                <th style="width:28px">${ptPos}</th><th>${ptBeschr}</th>
                <th style="width:65px;text-align:right">${ptMenge}</th>
                <th style="width:90px;text-align:right">${ptPreis}</th>
                <th style="width:90px;text-align:right">${ptTotal}</th>
              </tr></thead>
              <tbody>${posHtml}</tbody>
            </table>
            ${totalsHtml}
            ${schl ? `<div class="schluss" style="margin-top:14px;">${schl}</div>` : ""}
          </div>
          ${footerHtml}
          ${data.extraHtml || ""}
        </div>
      </body></html>`;
    }

    // ─── Design H: Helvetica Pro ─────────────────────────────────────────────
    if (design === "H") {
      return `<!DOCTYPE html><html><head><meta charset="utf-8">
      <style>
        * { box-sizing:border-box; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; color-adjust:exact !important; }
        body { font-family:Arial,Helvetica,sans-serif;font-size:10pt;color:#222;margin:0;padding:0; }
        table { width:100%;border-collapse:collapse; }
        th { background:white;color:#333;padding:8px 4px;text-align:left;font-size:8.5pt;border-bottom:1.5px solid #222; }
        td { font-size:9pt; }
        .intro,.schluss { font-size:9pt;color:#444;white-space:pre-line; }
      </style></head>
      <body style="position:relative;">
        ${wmHtml}
        <div style="position:relative;z-index:1;min-height:100vh;display:flex;flex-direction:column;">
          <div style="padding:22px 40px 0;${logoPos==="rechts"?"flex-direction:row-reverse;":""}">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;">
              <div style="flex-shrink:0">
                ${logoHtml}
                ${slogan ? `<div style="font-size:8pt;color:#aaa;margin-top:3px;">${slogan}</div>` : ""}
              </div>
              <div style="text-align:right;font-size:8pt;color:#aaa;line-height:1.6;">
                <div style="font-weight:700;color:#333;">${data.firma}</div>
                <div>${data.firmaAdresse} · ${data.firmaPlzOrt}</div>
              </div>
            </div>
            <div style="height:1.5px;background:#222;margin:10px 0 1px;"></div>
            <div style="height:0.5px;background:#bbb;margin-bottom:14px;"></div>
            <div style="margin-top:${absenderTopMm - 20}mm;${absenderLeftMm > 0 ? `margin-left:${absenderLeftMm}mm;` : ""}margin-bottom:10mm;font-size:10pt;color:#333;text-align:left;line-height:1.55;">
              <div style="font-weight:600;">${data.empfaenger}</div>
              ${data.empfaengerStrasse ? `<div>${data.empfaengerStrasse}</div>` : ""}
              ${data.empfaengerPlzOrt  ? `<div>${data.empfaengerPlzOrt}</div>` : ""}
            </div>
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px;">
              <div style="font-size:14pt;font-weight:700;color:#111;text-transform:uppercase;letter-spacing:1px;">${data.titel} Nr. ${data.nummer}</div>
              <div style="font-size:8pt;color:#777;text-align:right;line-height:1.6;">
                <div>${data.datum}</div>
                ${data.gueltigBis ? `<div>Gültig bis: ${data.gueltigBis}</div>` : ""}
                ${data.faelligDatum ? `<div>Zahlbar bis: ${data.faelligDatum}</div>` : ""}
              </div>
            </div>
          </div>
          <div style="padding:0 40px;flex:1;">
            ${apBlock}
            ${einl ? `<div class="intro" style="margin-bottom:12px;">${einl}</div>` : ""}
            <table>
              <thead><tr>
                <th style="width:28px">${ptPos}</th><th>${ptBeschr}</th>
                <th style="width:65px;text-align:right">${ptMenge}</th>
                <th style="width:90px;text-align:right">${ptPreis}</th>
                <th style="width:90px;text-align:right">${ptTotal}</th>
              </tr></thead>
              <tbody>${posHtml}</tbody>
            </table>
            ${totalsHtml}
            ${schl ? `<div class="schluss" style="margin-top:14px;">${schl}</div>` : ""}
          </div>
          ${footerHtml}
          ${data.extraHtml || ""}
        </div>
      </body></html>`;
    }

    // ─── Design I: Corporate Slim ─────────────────────────────────────────────
    if (design === "I") {
      return `<!DOCTYPE html><html><head><meta charset="utf-8">
      <style>
        * { box-sizing:border-box; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; color-adjust:exact !important; }
        body { font-family:Arial,Helvetica,sans-serif;font-size:10pt;color:#222;margin:0;padding:0; }
        table { width:100%;border-collapse:collapse; }
        th { background:${hc}20;color:#333;padding:8px 4px;text-align:left;font-size:8.5pt;border-bottom:1.5px solid ${hc}; }
        td { font-size:9pt; }
        .intro,.schluss { font-size:9pt;color:#444;white-space:pre-line; }
      </style></head>
      <body style="position:relative;display:flex;min-height:100vh;">
        ${wmHtml}
        <div style="width:5px;background:${hc};flex-shrink:0;z-index:2;"></div>
        <div style="flex:1;display:flex;flex-direction:column;position:relative;z-index:1;">
          <div style="padding:22px 36px 0;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;${logoPos==="rechts"?"flex-direction:row-reverse;":""}">
              <div style="flex-shrink:0">
                ${logoHtml}
                ${slogan ? `<div style="font-size:8pt;color:#999;margin-top:3px;">${slogan}</div>` : ""}
              </div>
              <div style="text-align:right;font-size:8pt;color:#777;line-height:1.6;">
                <div style="font-weight:700;color:#333;">${data.firma}</div>
                <div>${data.firmaAdresse} · ${data.firmaPlzOrt}</div>
              </div>
            </div>
            <div style="height:0.5px;background:#ccc;margin:14px 0;"></div>
            <div style="margin-top:${absenderTopMm - 20}mm;${absenderLeftMm > 0 ? `margin-left:${absenderLeftMm}mm;` : ""}margin-bottom:10mm;font-size:10pt;color:#333;text-align:left;line-height:1.55;">
              <div style="font-weight:600;">${data.empfaenger}</div>
              ${data.empfaengerStrasse ? `<div>${data.empfaengerStrasse}</div>` : ""}
              ${data.empfaengerPlzOrt  ? `<div>${data.empfaengerPlzOrt}</div>` : ""}
            </div>
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px;">
              <div style="font-size:14pt;font-weight:700;color:${hc};">${data.titel} Nr. ${data.nummer}</div>
              <div style="font-size:8.5pt;color:#555;text-align:right;line-height:1.6;">
                <div><b style="color:#999;font-weight:400">Datum: </b>${data.datum}</div>
                ${data.gueltigBis ? `<div><b style="color:#999;font-weight:400">Gültig bis: </b>${data.gueltigBis}</div>` : ""}
                ${data.faelligDatum ? `<div><b style="color:#999;font-weight:400">Zahlbar bis: </b>${data.faelligDatum}</div>` : ""}
              </div>
            </div>
          </div>
          <div style="padding:0 36px;flex:1;">
            ${apBlock}
            ${einl ? `<div class="intro" style="margin-bottom:12px;">${einl}</div>` : ""}
            <table>
              <thead><tr>
                <th style="width:28px">${ptPos}</th><th>${ptBeschr}</th>
                <th style="width:65px;text-align:right">${ptMenge}</th>
                <th style="width:90px;text-align:right">${ptPreis}</th>
                <th style="width:90px;text-align:right">${ptTotal}</th>
              </tr></thead>
              <tbody>${posHtml}</tbody>
            </table>
            ${totalsHtml}
            ${schl ? `<div class="schluss" style="margin-top:14px;">${schl}</div>` : ""}
          </div>
          ${footerHtml}
          ${data.extraHtml || ""}
        </div>
      </body></html>`;
    }

    return `<!DOCTYPE html><html><head><meta charset="utf-8">
    <style>
      * { box-sizing:border-box; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; color-adjust:exact !important; }
      body { font-family:${design === "E" ? "Georgia,serif" : "Arial,sans-serif"};font-size:10pt;color:#222;margin:0;padding:0; }
      table { width:100%;border-collapse:collapse; }
      th { background:${hc};color:#fff;padding:8px 4px;text-align:left;font-size:8.5pt; }
      td { font-size:9pt; }
      .intro,.schluss { font-size:9pt;color:#444;white-space:pre-line; }
    </style></head>
    <body style="position:relative;">
      ${wmHtml}
      <div style="position:relative;z-index:1;min-height:100vh;display:flex;flex-direction:column;">
        ${headerHtml}
        <div style="padding:14px 40px;flex:1;">
          <div style="margin-top:${absenderTopMm - 20}mm;${absenderLeftMm > 0 ? `margin-left:${absenderLeftMm}mm;` : ""}margin-bottom:6mm;font-size:10pt;color:#333;text-align:left;line-height:1.55;">
            <div style="font-weight:600;">${data.empfaenger}</div>
            ${data.empfaengerStrasse ? `<div>${data.empfaengerStrasse}</div>` : ""}
            ${data.empfaengerPlzOrt  ? `<div>${data.empfaengerPlzOrt}</div>` : ""}
          </div>
          ${!titelImHeader ? `<div style="font-size:16pt;font-weight:700;color:${fc};margin:12px 0 4px;">${data.titel} Nr. ${data.nummer}</div>
          <div style="font-size:8.5pt;color:#555;margin-bottom:10px;display:flex;flex-wrap:wrap;gap:16px;">${metaHtml}</div>` : ""}
          ${apBlock}
          ${einl ? `<div class="intro" style="margin-bottom:12px;">${einl}</div>` : ""}
          <table>
            <thead><tr>
              <th style="width:28px">${ptPos}</th><th>${ptBeschr}</th>
              <th style="width:65px;text-align:right">${ptMenge}</th>
              <th style="width:90px;text-align:right">${ptPreis}</th>
              <th style="width:90px;text-align:right">${ptTotal}</th>
            </tr></thead>
            <tbody>${posHtml}</tbody>
          </table>
          ${totalsHtml}
          ${schl ? `<div class="schluss" style="margin-top:14px;">${schl}</div>` : ""}
        </div>
        ${footerHtml}
      </div>
      ${data.extraHtml || ""}
    </body></html>`;
  }


  // Helper: Adresse-String in Strasse + PLZ/Ort aufteilen
  function splitAdresse(adresse: string): { strasse: string; plzOrt: string } {
    if (!adresse) return { strasse: "", plzOrt: "" };
    const lines = adresse.split(/\n|\r/).map(l => l.trim()).filter(Boolean);
    if (lines.length >= 2) {
      // Mehrzeilig: letzte Zeile ist PLZ/Ort oder letzte zwei zusammen
      const lastLine = lines[lines.length - 1];
      const secondLast = lines.length >= 3 ? lines[lines.length - 2] : null;
      // Wenn vorletzte Zeile nur PLZ (4-5 Stellen), merge mit letzter
      if (secondLast && /^\d{4,5}$/.test(secondLast)) {
        return {
          strasse: lines.slice(0, -2).join(", ") || lines[0],
          plzOrt: secondLast + " " + lastLine,
        };
      }
      return {
        strasse: lines.slice(0, -1).join(", "),
        plzOrt: lastLine,
      };
    }
    // Einzeilig: PLZ erkennen (4-5 Stellen)
    const plzMatch = adresse.match(/^(.+?)\s+(\d{4,5}\s+.+)$/);
    if (plzMatch) {
      return { strasse: plzMatch[1].trim(), plzOrt: plzMatch[2].trim() };
    }
    return { strasse: adresse, plzOrt: "" };
  }

  async function renderPdfFromHtml(
html: string): Promise<Buffer> {
    const puppeteer = await import("puppeteer");
    const execPath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
    const browser = await puppeteer.default.launch({
      executablePath: execPath,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    const pdfBuf = await page.pdf({ format: "A4", printBackground: true, margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" } });
    await browser.close();
    return Buffer.from(pdfBuf);
  }

  // ─── Rechnung PDF (Vorlage aus DB) ──────────────────────────────────────────
  app.post("/api/auftraege/:id/rechnungen/:rid/pdf", async (req, res) => {
    try {
      const { id, rid } = req.params;
      const { data: rechnung, error } = await supabase.from("rechnungen").select("*").eq("id", rid).single();
      if (error || !rechnung) return res.status(404).json({ message: "Rechnung nicht gefunden" });
      const { data: auftrag } = await supabase.from("auftraege").select("*").eq("id", id).single();

      // Quelldaten: Offerte falls verlinkt
      let quelleOfferte: any = null;
      const offIdMatch = (rechnung.notiz || "").match(/offerte_id:([^|]+)/);
      if (offIdMatch) {
        const { data: off } = await supabase.from("offerten").select("*").eq("id", offIdMatch[1]).single();
        if (off) quelleOfferte = off;
      }

      // Firmendaten
      const { data: settingsArr } = await supabase.from("einstellungen").select("schluessel,wert");
      const sMap: Record<string, string> = {};
      for (const s of (settingsArr || [])) sMap[s.schluessel] = s.wert;

      const empfaenger  = quelleOfferte?.empfaenger_name || auftrag?.kunde || rechnung.kunde_name || "";
      const _rawAdr     = auftrag?.kunde_adresse || "";
      const _splitAdr   = splitAdresse(_rawAdr);
      const empStrasse  = quelleOfferte?.empfaenger_strasse || _splitAdr.strasse || "";
      const empPlzOrt   = quelleOfferte?.empfaenger_plz_ort || _splitAdr.plzOrt || "";
      const positionen: any[] = Array.isArray(rechnung.positionen) ? rechnung.positionen : [];
      const subtotal    = positionen.reduce((s: number, p: any) => s + Number(p.total ?? p.betrag ?? (Number(p.menge||p.anzahl||1)*Number(p.einzelpreis||p.preis||0))), 0);
      const mwstPct     = 8.1;
      const mwstBetrag  = subtotal * (mwstPct / 100);
      const totalInkl   = subtotal + mwstBetrag;

      const datumStr = rechnung.erstellt
        ? new Date(rechnung.erstellt).toLocaleDateString("de-CH", { day:"2-digit", month:"long", year:"numeric" })
        : new Date().toLocaleDateString("de-CH", { day:"2-digit", month:"long", year:"numeric" });
      const faelligStr = rechnung.faellig_datum
        ? new Date(rechnung.faellig_datum).toLocaleDateString("de-CH", { day:"2-digit", month:"long", year:"numeric" })
        : undefined;

      // QR-Zahlschein (Schweizer Standard)
      const ibanRaw = sMap.bank_iban || "";
      const ibanMissing = !ibanRaw || ibanRaw.trim() === "";
      const iban = ibanRaw || "CH00 0000 0000 0000 0000 0";
      const ibanClean = iban.replace(/\s/g, "");
      const betragFormatted = totalInkl.toFixed(2);
      // QR-Code Daten (Swiss QR Bill Referenz-Format)
      const qrData = [
        "SPC", "0200", "1",
        ibanClean,
        "K", sMap.firmenname || "Schneggenburger GmbH",
        sMap.adresse || "Hefenhoferstrasse 7",
        (sMap.plz_ort || "8580 Sommeri").replace(/^(\d+)\s+(.+)$/, "$1 $2"),
        "", "", "CH",
        "", "", "", "", "", "", "",
        betragFormatted, "CHF",
        "K", empfaenger || "",
        empStrasse || "", empPlzOrt || "",
        "", "", "CH",
        "NON", "", "Rechnung " + (rechnung.nr || rid.substring(0,8)),
        "EPD"
      ].join("\n");
      let qrCodeDataUrl = "";
      try {
        const QRCodeLib = await import("qrcode");
        qrCodeDataUrl = await QRCodeLib.default.toDataURL(qrData, { errorCorrectionLevel: "M", width: 180, margin: 1 });
      } catch {}

      const qrZahlscheinHtml = `
        <div style="page-break-before:always;padding:20px 0 0 0;">
          <div style="border-top:2px solid #000;padding-top:16px;">
            ${ibanMissing ? `<div style="background:#fff3cd;border:1px solid #ffc107;padding:8px 12px;border-radius:4px;margin-bottom:12px;font-size:8.5pt;color:#856404;">⚠️ Bitte IBAN in Einstellungen hinterlegen damit der QR-Zahlschein korrekt generiert wird.</div>` : ""}
            <div style="font-size:9pt;font-weight:700;margin-bottom:10px;letter-spacing:1px;">ZAHLTEIL / SECTION DE PAIEMENT</div>
            <div style="display:flex;gap:20px;align-items:flex-start;">
              ${qrCodeDataUrl ? `<div style="flex-shrink:0;border:1px solid #ccc;padding:4px;"><img src="${qrCodeDataUrl}" style="width:100px;height:100px;display:block;" /></div>` : '<div style="width:100px;height:100px;border:2px solid #ccc;display:flex;align-items:center;justify-content:center;font-size:8pt;color:#666;">QR-Code</div>'}
              <div style="flex:1;font-size:8.5pt;">
                <div style="margin-bottom:6px;"><strong>Konto / Payable à</strong><br/>${iban}</div>
                <div style="margin-bottom:6px;"><strong>Zahlbar durch</strong><br/>${empfaenger}<br/>${empStrasse}<br/>${empPlzOrt}</div>
                <div style="margin-bottom:6px;"><strong>Währung / Betrag</strong><br/>CHF ${betragFormatted}</div>
                <div><strong>Mitteilung</strong><br/>Rechnung ${rechnung.nr || ""}</div>
              </div>
              <div style="flex-shrink:0;text-align:right;font-size:8pt;color:#888;">
                <div>Fällig: ${faelligStr || "30 Tage netto"}</div>
                <div style="margin-top:4px;">MWST: ${sMap.uid_nummer || "CHE-000.000.000 MWST"}</div>
              </div>
            </div>
          </div>
        </div>
      `;

      const html = await buildPdfHtml("rechnung", {
        titel: "RECHNUNG",
        nummer: rechnung.nr || rid.substring(0,8).toUpperCase(),
        datum: datumStr,
        faelligDatum: faelligStr,
        empfaenger,
        empfaengerStrasse: empStrasse,
        empfaengerPlzOrt: empPlzOrt,
        firma:        sMap.firmenname || "Schneggenburger GmbH",
        firmaAdresse: sMap.adresse    || "Hefenhoferstrasse 7",
        firmaPlzOrt:  sMap.plz_ort   || "8580 Sommeri",
        firmaTel:     sMap.telefon   || "071 411 16 87",
        firmaEmail:   sMap.email     || "info@schneggenburger.ch",
        positionen,
        subtotal, mwstPct, mwstBetrag, total: totalInkl,
        showTotals: true,
        extraHtml: "",
        ansprechpersonIntern: (req.body as any)?.ansprechpersonIntern || rechnung.ansprechperson_intern || auftrag?.verantwortlicher || "",
        ansprechpersonExtern: (req.body as any)?.ansprechpersonExtern || rechnung.ansprechperson_extern || auftrag?.ansprechperson || "",
      });

      const finalHtml = html.replace(/<\/body>\s*<\/html>/, qrZahlscheinHtml + "</body></html>");
      const pdfBuf = await renderPdfFromHtml(finalHtml);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="Rechnung-${rechnung.nr || rid}.pdf"`);
      res.send(pdfBuf);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });



  app.get("/api/rechnungen", async (_req, res) => {
    try {
      const { data, error } = await supabase
        .from("rechnungen")
        .select("*")
        .order("erstellt", { ascending: false });
      if (error) throw error;
      res.json(data || []);
    } catch (e) {
      res.status(500).json({ message: asError(e) });
    }
  });

  // ============= BANANA BUCHHALTUNG / Q3 EXPORT =============
  // Format: Banana Buchhaltung Schweiz (semicolon, Schweizer Dezimal mit Punkt)
  app.get("/api/export/q3", async (req, res) => {
    try {
      const { von, bis, zeitraum } = req.query as Record<string, string>;

      const heute = new Date();
      let datumVon: string;
      let datumBis: string;

      if (von && bis) {
        datumVon = von;
        datumBis = bis;
      } else if (zeitraum === "quartal") {
        const q = Math.floor(heute.getMonth() / 3);
        datumVon = new Date(heute.getFullYear(), q * 3, 1).toISOString().split("T")[0];
        datumBis = new Date(heute.getFullYear(), q * 3 + 3, 0).toISOString().split("T")[0];
      } else if (zeitraum === "monat") {
        datumVon = new Date(heute.getFullYear(), heute.getMonth(), 1).toISOString().split("T")[0];
        datumBis = new Date(heute.getFullYear(), heute.getMonth() + 1, 0).toISOString().split("T")[0];
      } else {
        datumVon = `${heute.getFullYear()}-01-01`;
        datumBis = `${heute.getFullYear()}-12-31`;
      }

      // Rechnungen laden (mit Auftragsdaten)
      const { data: rechnungen, error } = await supabase
        .from("rechnungen")
        .select("*")
        .gte("erstellt", datumVon)
        .lte("erstellt", datumBis + "T23:59:59")
        .order("erstellt", { ascending: true });
      if (error) throw error;

      // Auftraege für Kundennamen laden
      const auftragIds = [...new Set((rechnungen || []).map((r: any) => r.auftrag_id).filter(Boolean))];
      let auftraegeMap: Record<string, any> = {};
      if (auftragIds.length > 0) {
        const { data: auftraege } = await supabase.from("auftraege").select("id,nr,titel,kunde").in("id", auftragIds);
        for (const a of (auftraege || [])) auftraegeMap[a.id] = a;
      }

      const mwstSatz = 8.1;

      // Banana Buchhaltung Format:
      // Datum (DD.MM.YYYY) ; BelegNr ; Beschreibung ; Konto ; Gegenkonto ; Betrag (netto) ; MwSt-Code ; MwSt-Betrag
      // Spaltenbezeichnungen auf Deutsch (Banana Standard)
      const sep = ";";
      const csvLines: string[] = [];

      // Header-Info (Kommentarzeilen für Banana)
      csvLines.push(`Buchhaltungsexport Schneggenburger GmbH`);
      csvLines.push(`Zeitraum: ${datumVon} bis ${datumBis}`);
      csvLines.push(`Exportiert am: ${new Date().toLocaleDateString("de-CH")}`);
      csvLines.push(``);

      // Spaltenheader (Banana Buchhaltung Standard)
      csvLines.push([
        "Datum", "BelegNr", "Beschreibung", "Konto", "Gegenkonto",
        "Betrag (netto)", "MwSt-Satz %", "MwSt-Betrag", "Betrag (brutto)", "Waehrung"
      ].join(sep));

      // === AUSGANGSRECHNUNGEN ===
      csvLines.push(`=== Ausgangsrechnungen ===`);
      let totalAusgang = 0;
      for (const r of (rechnungen || [])) {
        const brutto = Number(r.betrag) || 0;
        const netto  = Math.round((brutto / (1 + mwstSatz / 100)) * 100) / 100;
        const mwst   = Math.round((brutto - netto) * 100) / 100;
        const auftrag = auftraegeMap[r.auftrag_id] || {};
        const datum  = r.erstellt
          ? new Date(r.erstellt).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" })
          : "";
        const beschr = [auftrag.titel, auftrag.kunde].filter(Boolean).join(" / ").replace(/;/g, ",") || "Rechnung";
        totalAusgang += brutto;

        csvLines.push([
          datum,
          r.nr || "",
          beschr,
          "1100",           // Debitoren (Schweizer KMU-Kontenplan)
          "3400",           // Dienstleistungserlös
          netto.toFixed(2),
          `${mwstSatz.toFixed(1)}%`,
          mwst.toFixed(2),
          brutto.toFixed(2),
          r.waehrung || "CHF"
        ].join(sep));
      }
      csvLines.push([`Total Ausgangsrechnungen`, "", "", "", "", "", "", "", totalAusgang.toFixed(2), "CHF"].join(sep));

      // === EINGANGSRECHNUNGEN ===
      const { data: eingang } = await supabase
        .from("eingangsrechnungen")
        .select("*")
        .gte("erstellt", datumVon)
        .lte("erstellt", datumBis + "T23:59:59")
        .order("erstellt", { ascending: true });

      if (eingang && eingang.length > 0) {
        csvLines.push(``);
        csvLines.push(`=== Eingangsrechnungen (Aufwand) ===`);
        let totalEingang = 0;
        for (const e of eingang) {
          const brutto = Number(e.betrag) || 0;
          const netto  = Math.round((brutto / (1 + mwstSatz / 100)) * 100) / 100;
          const mwst   = Math.round((brutto - netto) * 100) / 100;
          const datum  = e.erstellt
            ? new Date(e.erstellt).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" })
            : "";
          const beschr = (e.beschreibung || e.lieferant || "Eingangsrechnung").replace(/;/g, ",");
          totalEingang += brutto;

          csvLines.push([
            datum,
            e.nr || "",
            beschr,
            "2000",           // Kreditoren
            "4000",           // Aufwand
            netto.toFixed(2),
            `${mwstSatz.toFixed(1)}%`,
            mwst.toFixed(2),
            brutto.toFixed(2),
            e.waehrung || "CHF"
          ].join(sep));
        }
        csvLines.push([`Total Eingangsrechnungen`, "", "", "", "", "", "", "", totalEingang.toFixed(2), "CHF"].join(sep));
      }

      const csvContent = csvLines.join("\r\n");
      const filename = `Banana-Export_${datumVon}_${datumBis}.csv`;

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
      res.send("\uFEFF" + csvContent); // BOM für Excel-Kompatibilität
    } catch (e) {
      res.status(500).json({ message: asError(e) });
    }
  });

  // ============= VORLAGEN =============
  app.get("/api/vorlagen", async (_req, res) => {
    try {
      const { data, error } = await supabase
        .from("rechnungsvorlagen")
        .select("id, name, mime, size_bytes, aktiv, erstellt")
        .order("erstellt", { ascending: false });
      if (error) throw error;
      res.json(data || []);
    } catch (e) {
      res.status(500).json({ message: asError(e) });
    }
  });

  app.post(
    "/api/vorlagen",
    upload.single("file"),
    async (req: Request, res: Response) => {
      try {
        const file = (req as any).file as Express.Multer.File | undefined;
        if (!file) return res.status(400).json({ message: "file required" });
        // deactivate previous
        await supabase
          .from("rechnungsvorlagen")
          .update({ aktiv: false })
          .neq("id", "");
        const row = {
          id: uid(),
          name: file.originalname,
          mime: file.mimetype || "application/octet-stream",
          size_bytes: file.size,
          data: file.buffer.toString("base64"),
          aktiv: true,
          erstellt: new Date().toISOString(),
        };
        const { data, error } = await supabase
          .from("rechnungsvorlagen")
          .insert(row)
          .select("id, name, mime, size_bytes, aktiv, erstellt")
          .single();
        if (error) throw error;
        res.json(data);
      } catch (e) {
        res.status(500).json({ message: asError(e) });
      }
    }
  );

  app.get("/api/vorlagen/:vid/download", async (req, res) => {
    try {
      const { vid } = req.params;
      const { data, error } = await supabase
        .from("rechnungsvorlagen")
        .select("*")
        .eq("id", vid)
        .single();
      if (error) throw error;
      const buf = Buffer.from(data.data, "base64");
      res.setHeader("Content-Type", data.mime || "application/octet-stream");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${encodeURIComponent(data.name)}"`
      );
      res.send(buf);
    } catch (e) {
      res.status(500).json({ message: asError(e) });
    }
  });

  app.delete("/api/vorlagen/:vid", async (req, res) => {
    try {
      const { vid } = req.params;
      const { error } = await supabase
        .from("rechnungsvorlagen")
        .delete()
        .eq("id", vid);
      if (error) throw error;
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: asError(e) });
    }
  });

  // ─── Zeiterfassung ────────────────────────────────────────────────────────
  app.get("/api/auftraege/:id/zeit", async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("zeiteintraege")
        .select("*")
        .eq("auftrag_id", req.params.id)
        .order("datum", { ascending: false })
        .order("start_zeit", { ascending: false });
      if (error) throw error;
      res.json(data);
    } catch (e) {
      res.status(500).json({ message: asError(e) });
    }
  });

  app.post("/api/auftraege/:id/zeit", async (req, res) => {
    try {
      const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2);
      const { mitarbeiter, beschreibung, datum, start_zeit, end_zeit, ort, maschinenpark } = req.body;
      // Dauer berechnen
      let dauer_minuten = 0;
      if (start_zeit && end_zeit) {
        const [sh, sm] = start_zeit.split(":").map(Number);
        const [eh, em] = end_zeit.split(":").map(Number);
        dauer_minuten = (eh * 60 + em) - (sh * 60 + sm);
        if (dauer_minuten < 0) dauer_minuten = 0;
      }
      const eintrag = {
        id: uid(),
        auftrag_id: req.params.id,
        mitarbeiter: mitarbeiter || "",
        beschreibung: beschreibung || "",
        datum: datum || new Date().toISOString().slice(0, 10),
        start_zeit: start_zeit || "",
        end_zeit: end_zeit || "",
        dauer_minuten,
        ort: ort || null,
        maschinenpark: (ort === "Werkstatt" && maschinenpark) ? maschinenpark : null,
      };
      const { data, error } = await supabase
        .from("zeiteintraege")
        .insert(eintrag)
        .select()
        .single();
      if (error) throw error;
      res.json(data);
    } catch (e) {
      res.status(500).json({ message: asError(e) });
    }
  });

  app.delete("/api/auftraege/:id/zeit/:zid", async (req, res) => {
    try {
      const { error } = await supabase
        .from("zeiteintraege")
        .delete()
        .eq("id", req.params.zid);
      if (error) throw error;
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: asError(e) });
    }
  });

  // ─── Fotos / Bilddokumentation ────────────────────────────────────────────
  app.get("/api/fotos/:auftragId", async (req, res) => {
    try {
      const { data, error } = await supabase.from("foto_dokumentation").select("*").eq("auftrag_id", req.params.auftragId).order("erstellt", { ascending: false });
      if (error) throw error;
      res.json(data || []);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.post("/api/fotos/:auftragId", async (req, res) => {
    try {
      const f = { id: uid(), auftrag_id: req.params.auftragId, ...req.body };
      const { data, error } = await supabase.from("foto_dokumentation").insert(f).select().single();
      if (error) throw error;
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.delete("/api/fotos/:id", async (req, res) => {
    try {
      const { error } = await supabase.from("foto_dokumentation").delete().eq("id", req.params.id);
      if (error) throw error;
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ─── Formulare ───────────────────────────────────────────────────────────────
  app.get("/api/formulare", async (_req, res) => {
    try {
      const { data, error } = await supabase.from("formulare").select("*").order("erstellt", { ascending: false });
      if (error) throw error;
      res.json(data || []);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.post("/api/formulare", async (req, res) => {
    try {
      const f = { id: uid(), ...req.body };
      const { data, error } = await supabase.from("formulare").insert(f).select().single();
      if (error) throw error;
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.patch("/api/formulare/:id", async (req, res) => {
    try {
      const { data, error } = await supabase.from("formulare").update(req.body).eq("id", req.params.id).select().single();
      if (error) throw error;
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.delete("/api/formulare/:id", async (req, res) => {
    try {
      const { error } = await supabase.from("formulare").delete().eq("id", req.params.id);
      if (error) throw error;
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ─── Chat ─────────────────────────────────────────────────────────────────────
  // ─── Chat: Ungelesene Nachrichten (Timestamp-basiert, letzte 24h) ────────────
  app.get("/api/chat/ungelesen", async (req, res) => {
    try {
      const seit = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from("chat_nachrichten")
        .select("*", { count: "exact", head: true })
        .gte("erstellt", seit);
      res.json({ count: count || 0 });
    } catch (e) { res.json({ count: 0 }); }
  });

  // ─── Chat: Als gelesen markieren (Timestamp-basiert, Frontend trackt) ─────────
  app.post("/api/chat/als-gelesen", async (_req, res) => {
    // Kein gelesen-Flag in DB – Frontend trackt letzteGelesenZeit im State
    res.json({ ok: true, zeitstempel: new Date().toISOString() });
  });

  app.get("/api/chat/:auftragId", async (req, res) => {
    try {
      const { data, error } = await supabase.from("chat_nachrichten").select("*").eq("auftrag_id", req.params.auftragId).order("erstellt", { ascending: true });
      if (error) throw error;
      res.json(data || []);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.post("/api/chat/:auftragId", async (req, res) => {
    try {
      const n = { id: uid(), auftrag_id: req.params.auftragId, ...req.body };
      const { data, error } = await supabase.from("chat_nachrichten").insert(n).select().single();
      if (error) throw error;
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ─── Kunden ───────────────────────────────────────────────────────────────────
  app.get("/api/kunden/next-nr", async (_req, res) => {
    try {
      const year = new Date().getFullYear();
      const { data: allNr } = await supabase.from("kunden").select("nr");
      const maxNr = (allNr || []).reduce((mx: number, k: any) => {
        const m = String(k.nr || "").match(/K-\d{4}-(\d+)/);
        return m ? Math.max(mx, parseInt(m[1], 10)) : mx;
      }, 0);
      const nr = `K-${year}-${String(maxNr + 1).padStart(4, "0")}`;
      res.json({ nr });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.get("/api/kunden", async (_req, res) => {
    try {
      const { data, error } = await supabase.from("kunden").select("*").order("nachname", { ascending: true });
      if (error) throw error;
      res.json(data || []);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.post("/api/kunden", async (req, res) => {
    try {
      // Nächste Kundennummer generieren: K-YYYY-NNNN
      const year = new Date().getFullYear();
      const { data: allNr } = await supabase.from("kunden").select("nr");
      const maxNr = (allNr || []).reduce((mx: number, k: any) => {
        const m = String(k.nr || "").match(/K-\d{4}-(\d+)/);
        return m ? Math.max(mx, parseInt(m[1], 10)) : mx;
      }, 0);
      const nr = `K-${year}-${String(maxNr + 1).padStart(4, "0")}`;
      const k = { id: uid(), nr, ...req.body };
      const { data, error } = await supabase.from("kunden").insert(k).select().single();
      if (error) throw error;
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.patch("/api/kunden/:id", async (req, res) => {
    try {
      const { data, error } = await supabase.from("kunden").update(req.body).eq("id", req.params.id).select().single();
      if (error) throw error;
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.delete("/api/kunden/:id", async (req, res) => {
    try {
      const { error } = await supabase.from("kunden").delete().eq("id", req.params.id);
      if (error) throw error;
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ─── Mitarbeiter ─────────────────────────────────────────────────────────────
  app.get("/api/mitarbeiter", async (_req, res) => {
    try {
      const { data, error } = await supabase.from("mitarbeiter").select("*").order("nachname", { ascending: true });
      if (error) throw error;
      res.json(data || []);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.post("/api/mitarbeiter", async (req, res) => {
    try {
      const { vorname, nachname, email, telefon, position, stundensatz, eintrittsdatum, status, notiz } = req.body;
      const m = { id: uid(), vorname: vorname||'', nachname: nachname||'', email: email||'', telefon: telefon||'', position: position||'', stundensatz: stundensatz||0, eintrittsdatum: eintrittsdatum||'', status: status||'aktiv', notiz: notiz||'' };
      const { data, error } = await supabase.from("mitarbeiter").insert(m).select().single();
      if (error) throw error;
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.patch("/api/mitarbeiter/:id", async (req, res) => {
    try {
      const { data, error } = await supabase.from("mitarbeiter").update(req.body).eq("id", req.params.id).select().single();
      if (error) throw error;
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.delete("/api/mitarbeiter/:id", async (req, res) => {
    try {
      const { error } = await supabase.from("mitarbeiter").delete().eq("id", req.params.id);
      if (error) throw error;
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });


  // ─── Stempeluhr (globales Ein-/Ausstempeln) ──────────────────────────────────
  // GET aktiver Stempel eines Mitarbeiters (sucht per Name)
  app.get("/api/stempel/aktiv", async (req, res) => {
    try {
      const mitarbeiterName = req.query.mitarbeiter_name as string;
      if (!mitarbeiterName) return res.json(null);
      const { data } = await supabase
        .from("zeiteintraege")
        .select("*")
        .eq("mitarbeiter", mitarbeiterName)
        .is("end_zeit", null)
        .order("datum", { ascending: false })
        .limit(1)
        .maybeSingle();
      res.json(data || null);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // POST Einstempeln
  app.post("/api/stempel/ein", async (req, res) => {
    try {
      const { mitarbeiter_id, mitarbeiter_name, auftrag_id, beschreibung, ort, maschinenpark } = req.body;
      const now = new Date();
      // Datum und Uhrzeit in Europe/Zurich (Schweiz) — verhindert UTC-Offset-Fehler
      const datum = now.toLocaleDateString("sv-SE", { timeZone: "Europe/Zurich" }); // "2026-05-13"
      const start_zeit = now.toLocaleTimeString("de-CH", { timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }); // "07:30:45"
      const eintrag = {
        id: uid(),
        auftrag_id: auftrag_id || null,
        mitarbeiter: mitarbeiter_name || "",
        beschreibung: beschreibung || "Tagesarbeitszeit",
        datum,
        start_zeit,
        end_zeit: null,
        dauer_minuten: 0,
        ort: ort || null,
        maschinenpark: (ort === "Werkstatt" && maschinenpark) ? maschinenpark : null,
      };
      const { data, error } = await supabase.from("zeiteintraege").insert(eintrag).select().single();
      if (error) throw error;
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // POST Ausstempeln
  app.post("/api/stempel/aus", async (req, res) => {
    try {
      const { eintrag_id } = req.body;
      const now = new Date();
      const end_zeit = now.toLocaleTimeString("de-CH", { timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
      const { data: existing } = await supabase
        .from("zeiteintraege").select("*").eq("id", eintrag_id).single();
      let dauer_minuten = 0;
      if (existing?.start_zeit) {
        // Sekunden-genaue Berechnung — Format kann HH:MM oder HH:MM:SS sein
        const parseSecs = (t: string) => { const p = t.split(":").map(Number); return (p[0]||0)*3600 + (p[1]||0)*60 + (p[2]||0); };
        const diffSecs = parseSecs(end_zeit) - parseSecs(existing.start_zeit as string);
        dauer_minuten = Math.max(0, Math.round(diffSecs / 60));
      }
      const { data, error } = await supabase
        .from("zeiteintraege")
        .update({ end_zeit, dauer_minuten })
        .eq("id", eintrag_id)
        .select().single();
      if (error) throw error;
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // GET Monatsstunden je Mitarbeiter
  app.get("/api/zeiteintraege/monatsauswertung", async (req, res) => {
    try {
      const { jahr, monat, mitarbeiter_id } = req.query;
      let query = supabase.from("zeiteintraege").select("*");
      if (mitarbeiter_id) query = query.eq("mitarbeiter", mitarbeiter_id as string);
      if (jahr && monat) {
        const mo = String(monat).padStart(2, "0");
        query = query.gte("datum", `${jahr}-${mo}-01`).lte("datum", `${jahr}-${mo}-31`);
      }
      const { data, error } = await query.order("datum", { ascending: true });
      if (error) throw error;
      res.json(data || []);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // GET alle Zeiteintraege (Übersicht alle Mitarbeiter)
  app.get("/api/zeiteintraege", async (_req, res) => {
    try {
      const { data, error } = await supabase
        .from("zeiteintraege").select("*").order("datum", { ascending: false });
      if (error) throw error;
      res.json(data || []);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // POST allgemeiner Zeiteintrag (ohne oder mit Auftrag) — für Freie Tätigkeit
  app.post("/api/zeiteintraege", async (req, res) => {
    try {
      const { mitarbeiter, beschreibung, datum, start_zeit, end_zeit, auftrag_id, ort, maschinenpark } = req.body;
      let dauer_minuten = 0;
      if (start_zeit && end_zeit) {
        const parseSecs = (t: string) => { const p = t.split(":").map(Number); return (p[0]||0)*3600 + (p[1]||0)*60 + (p[2]||0); };
        dauer_minuten = Math.max(0, Math.round((parseSecs(end_zeit) - parseSecs(start_zeit)) / 60));
      }
      const eintrag = {
        id: uid(),
        auftrag_id: auftrag_id || null,
        mitarbeiter: mitarbeiter || "",
        beschreibung: beschreibung || "",
        datum: datum || new Date().toISOString().slice(0, 10),
        start_zeit: start_zeit || "",
        end_zeit: end_zeit || "",
        dauer_minuten,
        ort: ort || null,
        maschinenpark: (ort === "Werkstatt" && maschinenpark) ? maschinenpark : null,
      };
      const { data, error } = await supabase.from("zeiteintraege").insert(eintrag).select().single();
      if (error) throw error;
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });


  // ─── E-Mail Test ──────────────────────────────────────────────────────────────
  app.post("/api/email/test", async (req, res) => {
    try {
      const { smtp_host, smtp_port, smtp_user, smtp_passwort, smtp_von, smtp_ssl } = req.body;
      if (!smtp_host || !smtp_user || !smtp_passwort) {
        return res.json({ ok: false, message: "SMTP Host, Benutzer und Passwort sind erforderlich." });
      }
      const nodemailer = await import("nodemailer");
      const secure = smtp_ssl === "ssl";
      const transporter = nodemailer.createTransport({
        host: smtp_host,
        port: Number(smtp_port) || (secure ? 465 : 587),
        secure,
        auth: { user: smtp_user, pass: smtp_passwort },
      });
      await transporter.sendMail({
        from: smtp_von || smtp_user,
        to: smtp_user,
        subject: "AuftragsPro — SMTP Test",
        text: "SMTP-Verbindung erfolgreich konfiguriert.",
      });
      res.json({ ok: true, message: "Test-E-Mail wurde gesendet an " + smtp_user });
    } catch (e) { res.json({ ok: false, message: String(e) }); }
  });

  // ─── Einstellungen (Key/Value Store) ─────────────────────────────────────────
  app.get("/api/einstellungen", async (_req, res) => {
    try {
      const { data, error } = await supabase.from("einstellungen").select("schluessel,wert");
      if (error) throw error;
      res.json(data || []);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.get("/api/einstellungen/:key", async (req, res) => {
    try {
      const { data, error } = await supabase.from("einstellungen").select("wert").eq("schluessel", req.params.key).single();
      if (error) res.json({ wert: null });
      else res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.put("/api/einstellungen/:key", async (req, res) => {
    try {
      const { wert } = req.body;
      // upsert
      const { data: existing } = await supabase.from("einstellungen").select("schluessel").eq("schluessel", req.params.key).single();
      if (existing) {
        await supabase.from("einstellungen").update({ wert }).eq("schluessel", req.params.key);
      } else {
        await supabase.from("einstellungen").insert({ schluessel: req.params.key, wert, erstellt: new Date().toISOString() });
      }
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ─── Stundensätze CRUD ────────────────────────────────────────────────────────
  app.get("/api/stundensaetze", async (_req, res) => {
    try {
      const { data, error } = await supabase.from("stundensaetze").select("*").order("ort").order("maschinenpark");
      if (error) throw error;
      res.json(data || []);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.patch("/api/stundensaetze/:id", async (req, res) => {
    try {
      const { satz, bezeichnung, grundsatz } = req.body;
      const updateData: any = {
        satz: Number(satz),
        bezeichnung: bezeichnung || "",
        aktualisiert: new Date().toISOString(),
      };
      if (grundsatz !== undefined && grundsatz !== null) {
        updateData.grundsatz = Number(grundsatz);
      }
      const { data, error } = await supabase
        .from("stundensaetze")
        .update(updateData)
        .eq("id", req.params.id)
        .select().single();
      if (error) throw error;
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

    // ─── Kunden Auto-Sync: beim Auftrag speichern ────────────────────────────────
  app.post("/api/kunden/sync-from-auftrag", async (req, res) => {
    try {
      const { kunde, kunde_adresse, kunde_email, kunde_telefon } = req.body;
      if (!kunde?.trim()) return res.json({ synced: false });
      const { data: existing } = await supabase
        .from("kunden")
        .select("id")
        .ilike("nachname", `%${kunde.trim()}%`)
        .limit(1)
        .maybeSingle();
      if (existing) {
        const updates: any = {};
        if (kunde_adresse) updates.adresse = kunde_adresse.split("\n")[0];
        if (kunde_email) updates.email = kunde_email;
        if (kunde_telefon) updates.telefon = kunde_telefon;
        if (Object.keys(updates).length)
          await supabase.from("kunden").update(updates).eq("id", existing.id);
        return res.json({ synced: true, action: "updated", id: existing.id });
      }
      const nameParts = kunde.trim().split(" ");
      const nachname = nameParts.pop() || kunde.trim();
      const vorname = nameParts.join(" ");
      const year2 = new Date().getFullYear();
      const { data: allNr2 } = await supabase.from("kunden").select("nr");
      const maxNr2 = (allNr2 || []).reduce((mx: number, k: any) => {
        const m = String(k.nr || "").match(/K-\d{4}-(\d+)/);
        return m ? Math.max(mx, parseInt(m[1], 10)) : mx;
      }, 0);
      const autoNr = `K-${year2}-${String(maxNr2 + 1).padStart(4, "0")}`;
      const newKunde = {
        id: uid(),
        nr: autoNr,
        firma: "",
        vorname,
        nachname,
        email: kunde_email || "",
        telefon: kunde_telefon || "",
        adresse: kunde_adresse?.split("\n")[0] || "",
        plz: "",
        ort: "",
        notiz: "Automatisch aus Auftrag erstellt",
      };
      const { data, error } = await supabase.from("kunden").insert(newKunde).select().single();
      if (error) throw error;
      res.json({ synced: true, action: "created", id: data.id });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ─── Termine ─────────────────────────────────────────────────────────────────
  app.get("/api/termine", async (_req, res) => {
    try {
      const { data, error } = await supabase.from("termine").select("*").order("datum_von", { ascending: true });
      if (error) throw error;
      res.json(data || []);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.post("/api/termine", async (req, res) => {
    try {
      const t = { id: uid(), ...req.body };
      const { data, error } = await supabase.from("termine").insert(t).select().single();
      if (error) throw error;
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.patch("/api/termine/:id", async (req, res) => {
    try {
      const { data, error } = await supabase.from("termine").update(req.body).eq("id", req.params.id).select().single();
      if (error) throw error;
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.delete("/api/termine/:id", async (req, res) => {
    try {
      const { error } = await supabase.from("termine").delete().eq("id", req.params.id);
      if (error) throw error;
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ─── Plantafel ───────────────────────────────────────────────────────────────
  app.get("/api/plantafel", async (_req, res) => {
    try {
      const { data, error } = await supabase.from("plantafel").select("*").order("datum_von", { ascending: true });
      if (error) throw error;
      res.json(data || []);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.post("/api/plantafel", async (req, res) => {
    try {
      const p = { id: uid(), ...req.body };
      const { data, error } = await supabase.from("plantafel").insert(p).select().single();
      if (error) throw error;
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.delete("/api/plantafel/:id", async (req, res) => {
    try {
      const { error } = await supabase.from("plantafel").delete().eq("id", req.params.id);
      if (error) throw error;
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ─── Mahnwesen ───────────────────────────────────────────────────────────────
  app.get("/api/mahnungen", async (_req, res) => {
    try {
      const { data, error } = await supabase
        .from("mahnungen")
        .select("*")
        .order("erstellt", { ascending: false });
      if (error) throw error;
      // Map new DB fields (stufe/faellig_bis) to legacy frontend fields (mahnstufe/faellig_datum)
      const mapped = (data || []).map((m: any) => ({
        ...m,
        mahnstufe: m.mahnstufe ?? m.stufe ?? 1,
        faellig_datum: m.faellig_datum ?? m.faellig_bis ?? null,
      }));
      res.json(mapped);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.post("/api/mahnungen", async (req, res) => {
    try {
      const { auftrag_id, mahnstufe, betrag, faellig_datum, notiz } = req.body;
      const stufe = mahnstufe || 1;
      const faellig = faellig_datum || null;
      const eintrag = {
        id: uid(),
        auftrag_id,
        stufe,
        betrag: betrag || 0,
        faellig_bis: faellig,
        notiz: notiz || "",
        status: "offen",
        erstellt: new Date().toISOString(),
      };
      const { data, error } = await supabase.from("mahnungen").insert(eintrag).select().single();
      if (error) throw error;
      // Return with legacy fields for frontend compatibility
      res.json({ ...data, mahnstufe: data.stufe, faellig_datum: data.faellig_bis });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.patch("/api/mahnungen/:id", async (req, res) => {
    try {
      const updates: any = {};
      if (req.body.status) updates.status = req.body.status;
      if (req.body.status === "bezahlt") updates.bezahlt_datum = new Date().toISOString().slice(0, 10);
      if (req.body.status === "gesendet") updates.gesendet_datum = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase.from("mahnungen").update(updates).eq("id", req.params.id).select().single();
      if (error) throw error;
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.delete("/api/mahnungen/:id", async (req, res) => {
    try {
      const { error } = await supabase.from("mahnungen").delete().eq("id", req.params.id);
      if (error) throw error;
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ─── Mahnung PDF (Vorlage aus DB) ────────────────────────────────────────────
  app.post("/api/mahnungen/:id/pdf", async (req, res) => {
    try {
      const { id } = req.params;
      const { data: mahnung, error: mErr } = await supabase.from("mahnungen").select("*").eq("id", id).single();
      if (mErr || !mahnung) throw new Error("Mahnung nicht gefunden");

      // Verknüpfte Rechnung laden
      let rechnung: any = null;
      let auftrag: any = null;
      if (mahnung.rechnung_id) {
        const { data: r } = await supabase.from("rechnungen").select("*").eq("id", mahnung.rechnung_id).single();
        if (r) rechnung = r;
        if (r?.auftrag_id) {
          const { data: a } = await supabase.from("auftraege").select("*").eq("id", r.auftrag_id).single();
          if (a) auftrag = a;
        }
      }

      const { data: settingsArr } = await supabase.from("einstellungen").select("schluessel,wert");
      const sMap: Record<string, string> = {};
      for (const s of (settingsArr || [])) sMap[s.schluessel] = s.wert;

      const positionen: any[] = rechnung?.positionen && Array.isArray(rechnung.positionen) ? rechnung.positionen : [];
      const subtotal   = positionen.reduce((s: number, p: any) => s + Number(p.total ?? (Number(p.menge||0)*Number(p.einzelpreis||0))), 0);
      const mwstPct    = 8.1;
      const mwstBetrag = subtotal * (mwstPct / 100);
      const mahngebuehr = Number(mahnung.mahngebuehr || 0);
      const totalInkl  = subtotal + mwstBetrag + mahngebuehr;

      const datumStr = mahnung.erstellt
        ? new Date(mahnung.erstellt).toLocaleDateString("de-CH", { day: "2-digit", month: "long", year: "numeric" })
        : new Date().toLocaleDateString("de-CH", { day: "2-digit", month: "long", year: "numeric" });

      const empfaenger = mahnung.empfaenger_name || rechnung?.kunde_name || auftrag?.kunde_name || auftrag?.kunde || "";
      const stufe = mahnung.stufe ? ` (${mahnung.stufe}. Mahnung)` : "";

      const html = await buildPdfHtml("mahnung", {
        titel: "MAHNUNG" + stufe,
        nummer: mahnung.nr || rechnung?.nr || id.substring(0, 8).toUpperCase(),
        datum: datumStr,
        empfaenger,
        empfaengerStrasse: mahnung.empfaenger_strasse || rechnung?.empfaenger_strasse || "",
        empfaengerPlzOrt: mahnung.empfaenger_plz_ort || rechnung?.empfaenger_plz_ort || "",
        firma:        sMap.firmenname || "Schneggenburger GmbH",
        firmaAdresse: sMap.adresse    || "Hefenhoferstrasse 7",
        firmaPlzOrt:  sMap.plz_ort   || "8580 Sommeri",
        firmaTel:     sMap.telefon   || "071 411 16 87",
        firmaEmail:   sMap.email     || "info@schneggenburger.ch",
        positionen,
        subtotal, mwstPct, mwstBetrag,
        mahngebuehr: mahngebuehr > 0 ? mahngebuehr : undefined,
        total: totalInkl,
        showTotals: true,
      });

      const pdfBuf = await renderPdfFromHtml(html);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="Mahnung-${mahnung.nr || id}.pdf"`);
      res.send(pdfBuf);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ─── Vorkalkulation ───────────────────────────────────────────────────────────
  app.get("/api/kalkulation/:auftragId", async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("kalkulationen")
        .select("*")
        .eq("auftrag_id", req.params.auftragId)
        .order("erstellt", { ascending: true });
      if (error) throw error;
      res.json(data || []);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.post("/api/kalkulation/:auftragId", async (req, res) => {
    try {
      const { bezeichnung, typ, menge, einheit, einzelpreis, zuschlag_pct, betrag, notiz } = req.body;
      const pos = {
        id: uid(),
        auftrag_id: req.params.auftragId,
        bezeichnung: bezeichnung || "",
        typ: typ || "material",
        menge: menge || 1,
        einheit: einheit || "Stk",
        einzelpreis: einzelpreis || 0,
        zuschlag_pct: zuschlag_pct || 0,
        betrag: betrag || 0,
        notiz: notiz || "",
      };
      const { data, error } = await supabase.from("kalkulationen").insert(pos).select().single();
      if (error) throw error;
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.delete("/api/kalkulation/position/:id", async (req, res) => {
    try {
      const { error } = await supabase.from("kalkulationen").delete().eq("id", req.params.id);
      if (error) throw error;
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ─── Eingangsrechnungen ───────────────────────────────────────────────────────
  app.get("/api/eingangsrechnungen", async (_req, res) => {
    try {
      const { data, error } = await supabase
        .from("eingangsrechnungen")
        .select("*")
        .order("erstellt", { ascending: false });
      if (error) throw error;
      res.json(data || []);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.post("/api/eingangsrechnungen", async (req, res) => {
    try {
      const { lieferant, betrag, datum, faellig_datum, beschreibung, auftrag_id } = req.body;
      const eintrag = {
        id: uid(),
        lieferant: lieferant || "",
        betrag: betrag || 0,
        waehrung: "CHF",
        datum,
        faellig_datum: faellig_datum || null,
        beschreibung: beschreibung || "",
        auftrag_id: auftrag_id || null,
        status: "offen",
      };
      const { data, error } = await supabase.from("eingangsrechnungen").insert(eintrag).select().single();
      if (error) throw error;
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.patch("/api/eingangsrechnungen/:id", async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("eingangsrechnungen")
        .update({ status: req.body.status })
        .eq("id", req.params.id)
        .select().single();
      if (error) throw error;
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.delete("/api/eingangsrechnungen/:id", async (req, res) => {
    try {
      const { error } = await supabase.from("eingangsrechnungen").delete().eq("id", req.params.id);
      if (error) throw error;
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });


  // ═══════════════════════════════════════════════════════════════════════════
  // ─── OFFERTEN ──────────────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  app.get("/api/auftraege/:auftr_id/offerten", async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("offerten")
        .select("*")
        .eq("auftrag_id", req.params.auftr_id)
        .order("erstellt", { ascending: false });
      if (error) throw error;
      res.json(data || []);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.get("/api/offerten", async (_req, res) => {
    try {
      const { data, error } = await supabase
        .from("offerten")
        .select("*")
        .order("erstellt", { ascending: false });
      if (error) throw error;
      res.json(data || []);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.post("/api/auftraege/:auftr_id/offerten", async (req, res) => {
    try {
      const { data: allRows } = await supabase.from("offerten").select("nr");
      // Format: YY + 3-stellig laufend, z.B. 26001, 26002 …
      const yy = String(new Date().getFullYear()).slice(2);
      const prefix = yy;
      const maxSeq = (allRows || []).reduce((max: number, r: any) => {
        const nr = String(r.nr || "");
        if (nr.startsWith(prefix)) {
          const seq = parseInt(nr.slice(prefix.length), 10);
          if (!isNaN(seq) && seq > max) return seq;
        }
        return max;
      }, 0);
      const nextNr = `${prefix}${String(maxSeq + 1).padStart(3, "0")}`; // z.B. 26001
      const body = req.body;
      const eintrag = {
        id: uid(),
        auftrag_id: req.params.auftr_id,
        nr: nextNr,
        ansprechpartner: body.ansprechpartner || null,
        telefon: body.telefon || null,
        email: body.email || null,
        anrede: body.anrede || null,
        empfaenger_name: body.empfaenger_name || null,
        empfaenger_strasse: body.empfaenger_strasse || null,
        empfaenger_plz_ort: body.empfaenger_plz_ort || null,
        projekt_beschreibung: body.projekt_beschreibung || null,
        intro_text: body.intro_text || "Wir danken fuer Ihre Anfrage und erlauben uns, Ihnen fuer die beschriebenen Arbeiten folgende Offerte zu unterbreiten.",
        positionen: body.positionen || [],
        rabatt_prozent: body.rabatt_prozent ?? 0,
        mwst_prozent: body.mwst_prozent ?? 8.1,
        liefertermin: body.liefertermin || "nach Absprache",
        zahlungsbedingungen: body.zahlungsbedingungen || "30 Tage netto",
        gueltigkeit: body.gueltigkeit || "60 Tage",
        schluss_text: body.schluss_text || null,
        datum: body.datum || new Date().toISOString().slice(0, 10),
        status: "offen",
      };
      const { data, error } = await supabase.from("offerten").insert(eintrag).select().single();
      if (error) throw error;
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.patch("/api/offerten/:id", async (req, res) => {
    try {
      const allowed = ["ansprechpartner","telefon","email","anrede","empfaenger_name",
        "empfaenger_strasse","empfaenger_plz_ort","projekt_beschreibung","intro_text",
        "positionen","rabatt_prozent","mwst_prozent","liefertermin","zahlungsbedingungen",
        "gueltigkeit","schluss_text","datum","status"];
      const upd: any = {};
      for (const f of allowed) if (f in req.body) upd[f] = req.body[f];
      const { data, error } = await supabase.from("offerten").update(upd).eq("id", req.params.id).select().single();
      if (error) throw error;
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.delete("/api/offerten/:id", async (req, res) => {
    try {
      const { error } = await supabase.from("offerten").delete().eq("id", req.params.id);
      if (error) throw error;
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ─── Offerte → Rechnung umwandeln ───────────────────────────────────────────
  app.post("/api/offerten/:id/zu-rechnung", async (req, res) => {
    try {
      const { data: offerte, error } = await supabase
        .from("offerten").select("*").eq("id", req.params.id).single();
      if (error || !offerte) return res.status(404).json({ message: "Offerte nicht gefunden" });

      // Rechnungs-Nummer generieren
      const { data: allRows } = await supabase.from("rechnungen").select("nr");
      const nr = nextNr("R", allRows || []);

      // Positionen von Offerte übernehmen
      const positionen: any[] = Array.isArray(offerte.positionen) ? offerte.positionen : [];
      const betrag = positionen.reduce((s: number, p: any) =>
        s + Number(p.total || (Number(p.menge||0)*Number(p.einzelpreis||0))), 0);
      const rabattProzent = Number(offerte.rabatt_prozent) || 0;
      const totalExkl = betrag * (1 - rabattProzent/100);
      const totalInkl = totalExkl * (1 + (Number(offerte.mwst_prozent)||8.1)/100);

      // Rechnung erstellen — nur Felder die in der Tabelle existieren
      // Offerte-ID in notiz speichern damit PDF die Offerte-Daten nachladen kann
      const row = {
        id: uid(),
        auftrag_id: offerte.auftrag_id,
        nr,
        betrag: Math.round(totalInkl * 100) / 100,
        waehrung: "CHF",
        positionen,
        notiz: `offerte_id:${req.params.id}|Aus Offerte ${offerte.nr} erstellt`,
        erstellt: new Date().toISOString(),
      };
      const { data: rechnung, error: e2 } = await supabase
        .from("rechnungen").insert(row).select().single();
      if (e2) throw e2;

      // Offerte als "angenommen" markieren
      await supabase.from("offerten").update({ status: "angenommen" }).eq("id", req.params.id);

      res.json({ ok: true, rechnung });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });


  // ─── Keep-Alive Ping (verhindert Render Free Tier Sleep) ────────────────────
  app.get("/api/ping", (_req, res) => {
    res.json({ ok: true, ts: new Date().toISOString(), service: "AuftragsPro" });
  });

  // ─── Offerte PDF (Vorlage aus DB) ─────────────────────────────────────────────
  app.post("/api/offerten/:id/pdf", async (req, res) => {
    try {
      const { data: offerte, error } = await supabase.from("offerten").select("*").eq("id", req.params.id).single();
      if (error || !offerte) return res.status(404).json({ message: "Offerte nicht gefunden" });
      const { data: auftrag } = offerte.auftrag_id
        ? await supabase.from("auftraege").select("*").eq("id", offerte.auftrag_id).single()
        : { data: null };
      const { ansprechpersonIntern: bodyIntern, ansprechpersonExtern: bodyExtern } = req.body || {};

      const { data: settingsArr } = await supabase.from("einstellungen").select("schluessel,wert");
      const sMap: Record<string, string> = {};
      for (const s of (settingsArr || [])) sMap[s.schluessel] = s.wert;

      const positionen: any[] = Array.isArray(offerte.positionen) ? offerte.positionen : [];
      const subtotal   = positionen.reduce((s: number, p: any) => s + Number(p.total ?? (Number(p.menge||0)*Number(p.einzelpreis||0))), 0);
      const mwstPct    = Number(offerte.mwst_prozent) || 8.1;
      const mwstBetrag = subtotal * (mwstPct / 100);
      const totalInkl  = subtotal + mwstBetrag;

      const datumStr = offerte.datum
        ? new Date(offerte.datum).toLocaleDateString("de-CH", { day: "2-digit", month: "long", year: "numeric" })
        : new Date().toLocaleDateString("de-CH", { day: "2-digit", month: "long", year: "numeric" });
      const gueltigBisStr = offerte.gueltigkeit
        ? new Date(offerte.gueltigkeit).toLocaleDateString("de-CH", { day: "2-digit", month: "long", year: "numeric" })
        : undefined;

      const html = await buildPdfHtml("offerte", {
        titel: "OFFERTE",
        nummer: offerte.nr || req.params.id.substring(0, 8).toUpperCase(),
        datum: datumStr,
        gueltigBis: gueltigBisStr,
        empfaenger: offerte.empfaenger_name || offerte.anrede || "",
        empfaengerStrasse: offerte.empfaenger_strasse || "",
        empfaengerPlzOrt: offerte.empfaenger_plz_ort || "",
        firma:        sMap.firmenname || "Schneggenburger GmbH",
        firmaAdresse: sMap.adresse    || "Hefenhoferstrasse 7",
        firmaPlzOrt:  sMap.plz_ort   || "8580 Sommeri",
        firmaTel:     sMap.telefon   || "071 411 16 87",
        firmaEmail:   sMap.email     || "info@schneggenburger.ch",
        positionen,
        subtotal, mwstPct, mwstBetrag, total: totalInkl,
        einleitung: offerte.intro_text || "",
        schluss: offerte.schluss_text || "",
        showTotals: true,
        ansprechpersonIntern: bodyIntern || offerte.ansprechperson_intern || auftrag?.verantwortlicher || "",
        ansprechpersonExtern: bodyExtern || offerte.ansprechperson_extern || auftrag?.ansprechperson || "",
      });

      const pdfBuf = await renderPdfFromHtml(html);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="Offerte-${offerte.nr || req.params.id}.pdf"`);
      res.send(pdfBuf);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // PDF-Export für Offerte (GET) — nutzt buildPdfHtml() mit gespeicherter Vorlage
  app.get("/api/offerten/:id/pdf", async (req, res) => {
    try {
      const { data: offerte, error } = await supabase.from("offerten").select("*").eq("id", req.params.id).single();
      if (error || !offerte) return res.status(404).json({ message: "Offerte nicht gefunden" });
      const { data: auftrag } = offerte.auftrag_id
        ? await supabase.from("auftraege").select("*").eq("id", offerte.auftrag_id).single()
        : { data: null };

      const { data: settingsArr } = await supabase.from("einstellungen").select("schluessel,wert");
      const sMap: Record<string, string> = {};
      for (const s of (settingsArr || [])) sMap[s.schluessel] = s.wert;

      const positionen: any[] = Array.isArray(offerte.positionen) ? offerte.positionen : (typeof offerte.positionen === "string" ? JSON.parse(offerte.positionen) : []);
      const subtotal   = positionen.reduce((s: number, p: any) => s + Number(p.total ?? (Number(p.menge||0)*Number(p.einzelpreis||0))), 0);
      const mwstPct    = Number(offerte.mwst_prozent) || 8.1;
      const mwstBetrag = subtotal * (mwstPct / 100);
      const totalInkl  = subtotal + mwstBetrag;

      const datumStr = offerte.datum
        ? new Date(offerte.datum).toLocaleDateString("de-CH", { day: "2-digit", month: "long", year: "numeric" })
        : new Date().toLocaleDateString("de-CH", { day: "2-digit", month: "long", year: "numeric" });
      const gueltigBisStr = offerte.gueltigkeit
        ? new Date(offerte.gueltigkeit).toLocaleDateString("de-CH", { day: "2-digit", month: "long", year: "numeric" })
        : undefined;

      const html = await buildPdfHtml("offerte", {
        titel: "OFFERTE",
        nummer: offerte.offerten_nr || offerte.nr || req.params.id.substring(0, 8).toUpperCase(),
        datum: datumStr,
        gueltigBis: gueltigBisStr,
        empfaenger: offerte.empfaenger_name || offerte.anrede || offerte.kunde || "",
        empfaengerStrasse: offerte.empfaenger_strasse || "",
        empfaengerPlzOrt: offerte.empfaenger_plz_ort || "",
        firma:        sMap.firmenname || "Schneggenburger GmbH",
        firmaAdresse: sMap.adresse    || "Hefenhoferstrasse 7",
        firmaPlzOrt:  sMap.plz_ort   || "8580 Sommeri",
        firmaTel:     sMap.telefon   || "071 411 16 87",
        firmaEmail:   sMap.email     || "info@schneggenburger.ch",
        positionen,
        subtotal, mwstPct, mwstBetrag, total: totalInkl,
        einleitung: offerte.intro_text || "",
        schluss: offerte.schluss_text || "",
        showTotals: true,
        ansprechpersonIntern: offerte.ansprechperson_intern || auftrag?.verantwortlicher || "",
        ansprechpersonExtern: offerte.ansprechperson_extern || auftrag?.ansprechperson || "",
      });

      const pdfBuf = await renderPdfFromHtml(html);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="Offerte-${offerte.offerten_nr || offerte.nr || req.params.id}.pdf"`);
      res.send(pdfBuf);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });



  // ═══════════════════════════════════════════════════════════════════════════
  // ─── LOHNABRECHNUNG PDF ────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  app.post("/api/lohnabrechnung/pdf", async (req, res) => {
    try {
      const { mitarbeiter_name, monat, jahr, stundenansatz, inkl_dreizehnter, dreizehnter_ml, abzuege_total, nettolohn } = req.body;
      if (!mitarbeiter_name || !monat || !jahr)
        return res.status(400).json({ message: "Mitarbeiter, Monat und Jahr erforderlich" });

      const monPad  = String(monat).padStart(2, "0");
      const startDt = `${jahr}-${monPad}-01`;
      const endDt   = new Date(Number(jahr), Number(monat), 0).toISOString().slice(0,10);

      const { data: eintraege, error } = await supabase
        .from("zeiteintraege").select("*")
        .eq("mitarbeiter", mitarbeiter_name)
        .gte("datum", startDt).lte("datum", endDt)
        .order("datum", { ascending: true });
      if (error) throw error;

      const { data: settingsArr } = await supabase.from("einstellungen").select("schluessel,wert");
      const sMap: Record<string, string> = {};
      for (const s of (settingsArr || [])) sMap[s.schluessel] = s.wert;

      const rows: any[] = eintraege || [];
      const totalMin   = rows.reduce((s: number, r: any) => s + (r.dauer_minuten || 0), 0);
      const totalStd   = totalMin / 60;
      const ansatz     = Number(stundenansatz) || 0;
      const bruttoLohn = totalStd * ansatz;
      const dreizehnterML = Number(dreizehnter_ml) || 0;
      const inklDreizehnter = !!inkl_dreizehnter;
      const bruttoTotal = bruttoLohn + (inklDreizehnter ? dreizehnterML : 0);
      const nettoLohn   = Number(nettolohn) || 0;

      const mNamen = ["Januar","Februar","Maerz","April","Mai","Juni",
                      "Juli","August","September","Oktober","November","Dezember"];
      const mName  = mNamen[Number(monat)-1] || String(monat);
      const datumStr = new Date().toLocaleDateString("de-CH", { day: "2-digit", month: "long", year: "numeric" });

      // Zeiteintraege als Positionsliste aufbereiten
      const positionen = rows.map((r: any) => ({
        beschreibung: `${r.datum ? new Date(r.datum+"T00:00:00").toLocaleDateString("de-CH") : "-"}  ${(r.beschreibung||"").slice(0,40)}  ${r.start_zeit?.slice(0,5)||""}-${r.end_zeit?.slice(0,5)||""}`,
        menge: ((r.dauer_minuten||0)/60),
        einheit: "Std.",
        einzelpreis: ansatz,
        total: ((r.dauer_minuten||0)/60) * ansatz
      }));

      // Zusammenfassung als Extra-HTML
      const abzuege = [
        { label: "AHV (5.3%)", betrag: bruttoTotal * 0.053 },
        { label: "IV (1.4%)",  betrag: bruttoTotal * 0.014 },
        { label: "EO (0.5%)",  betrag: bruttoTotal * 0.005 },
        { label: "ALV (1.1%)", betrag: bruttoTotal * 0.011 },
      ];
      const abzuegeHTML = abzuege.map(a =>
        `<tr><td style="padding:2px 8px;color:#666;">- ${a.label}</td><td style="text-align:right;padding:2px 8px;color:#666;">CHF -${a.betrag.toFixed(2)}</td></tr>`
      ).join("");

      const extraHtml = `
        <div style="margin-top:16px;border-top:1px solid #ddd;padding-top:12px;">
          <table style="width:100%;font-size:9pt;border-collapse:collapse;margin-left:auto;max-width:280px;">
            <tr><td style="padding:2px 8px;font-weight:600;">Total Stunden:</td><td style="text-align:right;padding:2px 8px;font-weight:600;">${totalStd.toFixed(2)} Std.</td></tr>
            ${ansatz > 0 ? `<tr><td style="padding:2px 8px;">Stundenansatz:</td><td style="text-align:right;padding:2px 8px;">CHF ${ansatz.toFixed(2)}/Std.</td></tr>
            <tr><td style="padding:2px 8px;">Bruttolohn:</td><td style="text-align:right;padding:2px 8px;">CHF ${bruttoLohn.toFixed(2)}</td></tr>
            ${inklDreizehnter ? `<tr><td style="padding:2px 8px;">+ 13. ML (1/12):</td><td style="text-align:right;padding:2px 8px;">CHF ${dreizehnterML.toFixed(2)}</td></tr>
            <tr><td style="padding:2px 8px;">= Brutto Total:</td><td style="text-align:right;padding:2px 8px;">CHF ${bruttoTotal.toFixed(2)}</td></tr>` : ""}
            ${abzuegeHTML}
            <tr style="border-top:1px solid #999;"><td style="padding:4px 8px;font-weight:700;font-size:10pt;">= Nettolohn:</td><td style="text-align:right;padding:4px 8px;font-weight:700;font-size:10pt;">CHF ${nettoLohn.toFixed(2)}</td></tr>` : ""}
          </table>
        </div>`;

      const html = await buildPdfHtml("lohnabrechnung", {
        titel: "LOHNABRECHNUNG",
        nummer: `${mName} ${jahr}`,
        datum: datumStr,
        empfaenger: mitarbeiter_name,
        empfaengerStrasse: "",
        empfaengerPlzOrt: "",
        firma:        sMap.firmenname || "Schneggenburger GmbH",
        firmaAdresse: sMap.adresse    || "Hefenhoferstrasse 7",
        firmaPlzOrt:  sMap.plz_ort   || "8580 Sommeri",
        firmaTel:     sMap.telefon   || "071 411 16 87",
        firmaEmail:   sMap.email     || "info@schneggenburger.ch",
        positionen,
        subtotal: bruttoLohn,
        mwstPct: 0,
        mwstBetrag: 0,
        total: nettoLohn,
        showTotals: false,
        extraHtml,
      });

      const pdfBuf = await renderPdfFromHtml(html);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="Lohnabrechnung-${mitarbeiter_name}-${mName}-${jahr}.pdf"`);
      res.send(pdfBuf);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ─── Stundenabrechnung PDF (Vorlage aus DB) ─────────────────────────────────
  app.post("/api/stundenabrechnung/pdf", async (req, res) => {
    try {
      const { mitarbeiter_name, monat, jahr, von_datum, bis_datum } = req.body;

      const { data: settingsArr } = await supabase.from("einstellungen").select("schluessel,wert");
      const sMap: Record<string, string> = {};
      for (const s of (settingsArr || [])) sMap[s.schluessel] = s.wert;

      // Datum-Range bestimmen
      let startDt: string, endDt: string;
      if (von_datum && bis_datum) {
        startDt = von_datum; endDt = bis_datum;
      } else if (monat && jahr) {
        const monPad = String(monat).padStart(2, "0");
        startDt = `${jahr}-${monPad}-01`;
        endDt   = new Date(Number(jahr), Number(monat), 0).toISOString().slice(0,10);
      } else {
        // Aktueller Monat
        const now = new Date();
        startDt = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-01`;
        endDt   = new Date(now.getFullYear(), now.getMonth()+1, 0).toISOString().slice(0,10);
      }

      let query = supabase.from("zeiteintraege").select("*").gte("datum", startDt).lte("datum", endDt).order("datum", { ascending: true });
      if (mitarbeiter_name) query = query.eq("mitarbeiter", mitarbeiter_name);

      const { data: eintraege, error } = await query;
      if (error) throw error;

      const rows: any[] = eintraege || [];
      const totalMin = rows.reduce((s: number, r: any) => s + (r.dauer_minuten || 0), 0);
      const totalStd = totalMin / 60;

      const datumStr = new Date().toLocaleDateString("de-CH", { day: "2-digit", month: "long", year: "numeric" });
      const periodeStr = `${new Date(startDt).toLocaleDateString("de-CH")} - ${new Date(endDt).toLocaleDateString("de-CH")}`;

      const positionen = rows.map((r: any) => ({
        beschreibung: `${r.datum ? new Date(r.datum+"T00:00:00").toLocaleDateString("de-CH") : "-"}  ${r.mitarbeiter||""}  ${(r.beschreibung||"").slice(0,35)}`,
        menge: ((r.dauer_minuten||0)/60),
        einheit: "Std.",
        einzelpreis: 0,
        total: 0
      }));

      const extraHtml = `
        <div style="margin-top:16px;border-top:1px solid #ddd;padding-top:12px;text-align:right;">
          <span style="font-weight:700;font-size:10pt;">Total: ${totalStd.toFixed(2)} Stunden (${totalMin} Min.)</span>
        </div>`;

      const html = await buildPdfHtml("stundenabrechnung", {
        titel: "STUNDENABRECHNUNG",
        nummer: periodeStr,
        datum: datumStr,
        empfaenger: mitarbeiter_name || "Alle Mitarbeiter",
        empfaengerStrasse: "",
        empfaengerPlzOrt: "",
        firma:        sMap.firmenname || "Schneggenburger GmbH",
        firmaAdresse: sMap.adresse    || "Hefenhoferstrasse 7",
        firmaPlzOrt:  sMap.plz_ort   || "8580 Sommeri",
        firmaTel:     sMap.telefon   || "071 411 16 87",
        firmaEmail:   sMap.email     || "info@schneggenburger.ch",
        positionen,
        subtotal: 0, mwstPct: 0, mwstBetrag: 0, total: 0,
        showTotals: false,
        extraHtml,
      });

      const pdfBuf = await renderPdfFromHtml(html);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="Stundenabrechnung-${startDt}-${endDt}.pdf"`);
      res.send(pdfBuf);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ============= VORKALKULATION =============

  // GET stunden (Soll-Stunden pro Ort/Maschine)
  app.get("/api/vorkalkulation/:id/stunden", async (req, res) => {
    try {
      const { id } = req.params;
      const { data, error } = await supabase
        .from("vorkalkulation_stunden")
        .select("*")
        .eq("auftrag_id", id)
        .order("created_at", { ascending: true });
      if (error) return res.status(500).json({ message: asError(error) });
      res.json(data || []);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // PUT stunden — full replace (delete all + insert new)
  app.put("/api/vorkalkulation/:id/stunden", async (req, res) => {
    try {
      const { id } = req.params;
      const rows: any[] = Array.isArray(req.body) ? req.body : [];

      // Delete all existing rows for this auftrag
      const { error: delErr } = await supabase
        .from("vorkalkulation_stunden")
        .delete()
        .eq("auftrag_id", id);
      if (delErr) return res.status(500).json({ message: asError(delErr) });

      if (rows.length === 0) return res.json([]);

      // Insert fresh rows, strip _maschinenpark hack, use maschinenpark directly
      const toInsert = rows.map((r: any) => ({
        id: r.id || uid(),
        auftrag_id: id,
        ort: r.ort,
        maschinenpark: r.maschinenpark ?? r._maschinenpark ?? null,
        soll_stunden: Number(r.soll_stunden) || 0,
        stundensatz: Number(r.stundensatz) || 0,
      }));

      const { data, error } = await supabase
        .from("vorkalkulation_stunden")
        .insert(toInsert)
        .select();
      if (error) return res.status(500).json({ message: asError(error) });
      res.json(data || []);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // POST stunden — einzelne Zeile hinzufügen
  app.post("/api/vorkalkulation/:id/stunden", async (req, res) => {
    try {
      const { id } = req.params;
      const b = req.body;
      const row = {
        id: uid(),
        auftrag_id: id,
        ort: String(b.ort || "Avor"),
        maschinenpark: b.maschinenpark ?? null,
        bereich: b.bereich ?? null,
        unterkategorie: b.unterkategorie ?? null,
        bezeichnung: b.bezeichnung ?? null,
        soll_stunden: Number(b.soll_stunden) || 0,
        stundensatz: Number(b.stundensatz) || 0,
      };
      const { data, error } = await supabase
        .from("vorkalkulation_stunden")
        .insert(row)
        .select()
        .single();
      if (error) return res.status(500).json({ message: asError(error) });
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // DELETE stunden/:sid — einzelne Zeile löschen
  app.delete("/api/vorkalkulation/stunden/:sid", async (req, res) => {
    try {
      const { sid } = req.params;
      const { error } = await supabase
        .from("vorkalkulation_stunden")
        .delete()
        .eq("id", sid);
      if (error) return res.status(500).json({ message: asError(error) });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // GET material (Stückliste)
  app.get("/api/vorkalkulation/:id/material", async (req, res) => {
    try {
      const { id } = req.params;
      const { data, error } = await supabase
        .from("vorkalkulation_material")
        .select("*")
        .eq("auftrag_id", id)
        .order("pos", { ascending: true });
      if (error) return res.status(500).json({ message: asError(error) });
      res.json(data || []);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // POST material
  app.post("/api/vorkalkulation/:id/material", async (req, res) => {
    try {
      const { id } = req.params;
      const b = req.body;
      const row = {
        id: uid(),
        auftrag_id: id,
        pos: Number(b.pos) || 1,
        profil: String(b.profil || ""),
        bemerkung: String(b.bemerkung || ""),
        stueck: Number(b.stueck) || 1,
        laenge_mm: b.laenge_mm != null ? Number(b.laenge_mm) : null,
        kg_pro_m: b.kg_pro_m != null ? Number(b.kg_pro_m) : null,
        total_kg: b.total_kg != null ? Number(b.total_kg) : null,
        preis_pro_einheit: Number(b.preis_pro_einheit) || 0,
        total_chf: Number(b.total_chf) || 0,
      };
      const { data, error } = await supabase
        .from("vorkalkulation_material")
        .insert(row)
        .select()
        .single();
      if (error) return res.status(500).json({ message: asError(error) });
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // PATCH material/:mid
  app.patch("/api/vorkalkulation/:id/material/:mid", async (req, res) => {
    try {
      const { mid } = req.params;
      const b = req.body;
      const updates: any = {};
      if (b.pos !== undefined) updates.pos = Number(b.pos);
      if (b.profil !== undefined) updates.profil = String(b.profil);
      if (b.bemerkung !== undefined) updates.bemerkung = String(b.bemerkung);
      if (b.stueck !== undefined) updates.stueck = Number(b.stueck);
      if (b.laenge_mm !== undefined) updates.laenge_mm = b.laenge_mm != null ? Number(b.laenge_mm) : null;
      if (b.kg_pro_m !== undefined) updates.kg_pro_m = b.kg_pro_m != null ? Number(b.kg_pro_m) : null;
      if (b.total_kg !== undefined) updates.total_kg = b.total_kg != null ? Number(b.total_kg) : null;
      if (b.preis_pro_einheit !== undefined) updates.preis_pro_einheit = Number(b.preis_pro_einheit);
      if (b.total_chf !== undefined) updates.total_chf = Number(b.total_chf);
      const { data, error } = await supabase
        .from("vorkalkulation_material")
        .update(updates)
        .eq("id", mid)
        .select()
        .single();
      if (error) return res.status(500).json({ message: asError(error) });
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // DELETE material/:mid
  app.delete("/api/vorkalkulation/:id/material/:mid", async (req, res) => {
    try {
      const { mid } = req.params;
      const { error } = await supabase
        .from("vorkalkulation_material")
        .delete()
        .eq("id", mid);
      if (error) return res.status(500).json({ message: asError(error) });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // GET fremdleistungen
  app.get("/api/vorkalkulation/:id/fremdleistungen", async (req, res) => {
    try {
      const { id } = req.params;
      const { data, error } = await supabase
        .from("vorkalkulation_fremdleistungen")
        .select("*")
        .eq("auftrag_id", id)
        .order("created_at", { ascending: true });
      if (error) return res.status(500).json({ message: asError(error) });
      res.json(data || []);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // POST fremdleistungen
  app.post("/api/vorkalkulation/:id/fremdleistungen", async (req, res) => {
    try {
      const { id } = req.params;
      const b = req.body;
      const row = {
        id: uid(),
        auftrag_id: id,
        bezeichnung: String(b.bezeichnung || ""),
        anzahl: Number(b.anzahl) || 1,
        einheit: String(b.einheit || "Stk."),
        preis_pro_einheit: Number(b.preis_pro_einheit) || 0,
        total_chf: Number(b.total_chf) || 0,
      };
      const { data, error } = await supabase
        .from("vorkalkulation_fremdleistungen")
        .insert(row)
        .select()
        .single();
      if (error) return res.status(500).json({ message: asError(error) });
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // DELETE fremdleistungen/:fid
  app.delete("/api/vorkalkulation/:id/fremdleistungen/:fid", async (req, res) => {
    try {
      const { fid } = req.params;
      const { error } = await supabase
        .from("vorkalkulation_fremdleistungen")
        .delete()
        .eq("id", fid);
      if (error) return res.status(500).json({ message: asError(error) });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // GET soek
  app.get("/api/vorkalkulation/:id/soek", async (req, res) => {
    try {
      const { id } = req.params;
      const { data, error } = await supabase
        .from("vorkalkulation_soek")
        .select("*")
        .eq("auftrag_id", id)
        .order("created_at", { ascending: true });
      if (error) return res.status(500).json({ message: asError(error) });
      res.json(data || []);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // POST soek
  app.post("/api/vorkalkulation/:id/soek", async (req, res) => {
    try {
      const { id } = req.params;
      const b = req.body;
      const row = {
        id: uid(),
        auftrag_id: id,
        bezeichnung: String(b.bezeichnung || ""),
        anzahl: Number(b.anzahl) || 1,
        einheit: String(b.einheit || "Stk."),
        preis_pro_einheit: Number(b.preis_pro_einheit) || 0,
        total_chf: Number(b.total_chf) || 0,
      };
      const { data, error } = await supabase
        .from("vorkalkulation_soek")
        .insert(row)
        .select()
        .single();
      if (error) return res.status(500).json({ message: asError(error) });
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // DELETE soek/:sid
  app.delete("/api/vorkalkulation/:id/soek/:sid", async (req, res) => {
    try {
      const { sid } = req.params;
      const { error } = await supabase
        .from("vorkalkulation_soek")
        .delete()
        .eq("id", sid);
      if (error) return res.status(500).json({ message: asError(error) });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // GET config
  app.get("/api/vorkalkulation/:id/config", async (req, res) => {
    try {
      const { id } = req.params;
      const { data, error } = await supabase
        .from("vorkalkulation_config")
        .select("*")
        .eq("auftrag_id", id)
        .maybeSingle();
      if (error) return res.status(500).json({ message: asError(error) });
      // Return defaults if no config yet
      res.json(data || {
        auftrag_id: id,
        risiko_gewinn_prozent: 10,
        rabatt_prozent: 0,
        mwst_prozent: 8.1,
        notiz: "",
      });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // PUT config (upsert)
  app.put("/api/vorkalkulation/:id/config", async (req, res) => {
    try {
      const { id } = req.params;
      const b = req.body;

      // Check if config exists
      const { data: existing } = await supabase
        .from("vorkalkulation_config")
        .select("id")
        .eq("auftrag_id", id)
        .maybeSingle();

      const payload = {
        auftrag_id: id,
        risiko_gewinn_prozent: Number(b.risiko_gewinn_prozent) ?? 10,
        rabatt_prozent: Number(b.rabatt_prozent) ?? 0,
        mwst_prozent: Number(b.mwst_prozent) ?? 8.1,
        notiz: String(b.notiz || ""),
      };

      let result;
      if (existing) {
        result = await supabase
          .from("vorkalkulation_config")
          .update(payload)
          .eq("auftrag_id", id)
          .select()
          .single();
      } else {
        result = await supabase
          .from("vorkalkulation_config")
          .insert({ id: uid(), ...payload })
          .select()
          .single();
      }
      if (result.error) return res.status(500).json({ message: asError(result.error) });
      res.json(result.data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ============= NACHKALKULATION =============

  // GET nachkalkulation material
  app.get("/api/nachkalkulation/:id/material", async (req, res) => {
    try {
      const { id } = req.params;
      const { data, error } = await supabase
        .from("nachkalkulation_material")
        .select("*")
        .eq("auftrag_id", id)
        .order("created_at", { ascending: true });
      if (error) return res.status(500).json({ message: asError(error) });
      res.json(data || []);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // POST nachkalkulation material
  app.post("/api/nachkalkulation/:id/material", async (req, res) => {
    try {
      const { id } = req.params;
      const b = req.body;
      const row = {
        id: uid(),
        auftrag_id: id,
        bezeichnung: String(b.bezeichnung || ""),
        lieferant: String(b.lieferant || ""),
        betrag_chf: Number(b.betrag_chf) || 0,
        datum: String(b.datum || new Date().toISOString().slice(0, 10)),
        notiz: String(b.notiz || ""),
      };
      const { data, error } = await supabase
        .from("nachkalkulation_material")
        .insert(row)
        .select()
        .single();
      if (error) return res.status(500).json({ message: asError(error) });
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // DELETE nachkalkulation material/:mid
  app.delete("/api/nachkalkulation/:id/material/:mid", async (req, res) => {
    try {
      const { mid } = req.params;
      const { error } = await supabase
        .from("nachkalkulation_material")
        .delete()
        .eq("id", mid);
      if (error) return res.status(500).json({ message: asError(error) });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // GET nachkalkulation fremdleistungen
  app.get("/api/nachkalkulation/:id/fremdleistungen", async (req, res) => {
    try {
      const { id } = req.params;
      const { data, error } = await supabase
        .from("nachkalkulation_fremdleistungen")
        .select("*")
        .eq("auftrag_id", id)
        .order("created_at", { ascending: true });
      if (error) return res.status(500).json({ message: asError(error) });
      res.json(data || []);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // POST nachkalkulation fremdleistungen
  app.post("/api/nachkalkulation/:id/fremdleistungen", async (req, res) => {
    try {
      const { id } = req.params;
      const b = req.body;
      const row = {
        id: uid(),
        auftrag_id: id,
        bezeichnung: String(b.bezeichnung || ""),
        lieferant: String(b.lieferant || ""),
        betrag_chf: Number(b.betrag_chf) || 0,
        datum: String(b.datum || new Date().toISOString().slice(0, 10)),
        notiz: String(b.notiz || ""),
      };
      const { data, error } = await supabase
        .from("nachkalkulation_fremdleistungen")
        .insert(row)
        .select()
        .single();
      if (error) return res.status(500).json({ message: asError(error) });
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // DELETE nachkalkulation fremdleistungen/:fid
  app.delete("/api/nachkalkulation/:id/fremdleistungen/:fid", async (req, res) => {
    try {
      const { fid } = req.params;
      const { error } = await supabase
        .from("nachkalkulation_fremdleistungen")
        .delete()
        .eq("id", fid);
      if (error) return res.status(500).json({ message: asError(error) });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ============= KALKULATION PDF =============

  app.post("/api/auftraege/:id/kalkulation-pdf", async (req, res) => {
    try {
      const { id } = req.params;
      const typ = (req.query.typ as string) || "vorkalkulation";
      const isVK = typ === "vorkalkulation";

      // Load auftrag
      const { data: auftrag } = await supabase
        .from("auftraege")
        .select("*")
        .eq("id", id)
        .single();

      if (!auftrag) return res.status(404).json({ message: "Auftrag nicht gefunden" });

      // Load Firmendaten
      const { data: offSettingsArr2 } = await supabase.from("einstellungen").select("schluessel,wert");
      const offSMap: Record<string, string> = {};
      for (const s of (offSettingsArr2 || [])) offSMap[s.schluessel] = s.wert;

      // Load PDF-Vorlage (aus Einstellungen)
      const docTyp = typ === "vorkalkulation" ? "vorkalkulation" : "nachkalkulation";
      const { data: pdfVorlageRaw } = await supabase.from("pdf_vorlagen").select("*").eq("doc_typ", docTyp).single();
      const pdfVorlage = pdfVorlageRaw || {};

      // Load stundensaetze
      const { data: saetze = [] } = await supabase
        .from("stundensaetze")
        .select("*");

      function getOrtSatz(ort: string, maschine: string | null): number {
        const match = (saetze as any[]).find((s: any) => {
          if (ort === "Werkstatt") return s.ort === "Werkstatt" && s.maschinenpark === maschine;
          return s.ort === ort && !s.maschinenpark;
        });
        return match ? Number(match.satz) : 0;
      }

      // Load logo
      let logoBytes: Uint8Array | null = null;
      try { logoBytes = new Uint8Array(fs.readFileSync(getLogoPath())); } catch {}

      // PDF Setup
      const pdfDoc = await PDFDocument.create();
      const font  = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const fontB = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      let logoImg: any = null;
      if (logoBytes) { try { logoImg = await pdfDoc.embedJpg(logoBytes); } catch {} }

      const W = 595; const H = 842;
      const mL = 50; const mR = 50; const mT = 30;
      const pageW = W - mL - mR;
      const black = rgb(0, 0, 0);
      const grey  = rgb(0.45, 0.45, 0.45);
      // Use colors from pdf_vorlagen if set
      const hexToRgb = (hex: string) => {
        const r = parseInt(hex.slice(1,3),16)/255, g=parseInt(hex.slice(3,5),16)/255, b=parseInt(hex.slice(5,7),16)/255;
        return rgb(r,g,b);
      };
      const brown = pdfVorlage.header_color ? hexToRgb(pdfVorlage.header_color) : rgb(0.35, 0.20, 0.10);
      const lgrey = rgb(0.92, 0.92, 0.92);
      const orange = pdfVorlage.footer_color ? hexToRgb(pdfVorlage.footer_color) : rgb(0.91, 0.38, 0.04);

      function addPage() {
        const pg = pdfDoc.addPage([W, H]);
        const d = (t: string, x: number, y: number, sz: number, bold: boolean, col: any = black) =>
          pg.drawText(String(t), { x, y, size: sz, font: bold ? fontB : font, color: col });
        const ln = (x1: number, y1: number, x2: number, y2: number, t = 0.5, c = grey) =>
          pg.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: t, color: c });
        const rect = (x: number, y: number, w: number, h: number, col: any) =>
          pg.drawRectangle({ x, y, width: w, height: h, color: col });

        // Farbiger Header-Balken
        rect(0, H - 42, W, 42, brown);

        // Logo oben links im Header
        if (logoImg) {
          const ld = logoImg.scaleToFit(32, 32);
          pg.drawImage(logoImg, { x: mL, y: H - 38, width: ld.width, height: ld.height });
        }

        // Titel + Datum im Header (weiss)
        const white = rgb(1, 1, 1);
        d(isVK ? "VORKALKULATION" : "NACHKALKULATION / SOLL-IST-VERGLEICH", logoImg ? mL + 40 : mL, H - 20, 12, true, white);
        const datumNow = new Date().toLocaleDateString("de-CH", { day: "2-digit", month: "long", year: "numeric" });
        const datumStr = `Datum: ${datumNow}`;
        const datumW = font.widthOfTextAtSize(datumStr, 8);
        d(datumStr, W - mR - datumW, H - 20, 8, false, white);
        d(`Nr. ${auftrag.nr || ""}  ·  ${auftrag.titel || ""}`, logoImg ? mL + 40 : mL, H - 32, 8.5, false, rgb(0.95, 0.87, 0.75));

        // Auftragsdaten unterhalb Header
        let curY = H - 52;
        d(`Kunde: ${auftrag.kunde || "-"}`, mL, curY, 8.5, false, grey);
        curY -= 10;
        d((offSMap.firmenname||"Schneggenburger GmbH")+"  |  "+(offSMap.adresse||"Hefenhoferstrasse 7")+"  |  "+(offSMap.plz_ort||"8580 Sommeri"), mL, curY, 7.5, false, rgb(0.6, 0.6, 0.6));
        curY -= 4;
        ln(mL, curY, W - mR, curY, 0.5, grey);
        curY -= 10;

        return { pg, d, ln, rect, curY: () => curY, setY: (y: number) => { curY = y; }, decY: (n: number) => { curY -= n; } };
      }

      if (isVK) {
        // ─── VORKALKULATION PDF ────────────────────────────────────────────────
        const { data: stunden = [] } = await supabase.from("vorkalkulation_stunden").select("*").eq("auftrag_id", id);
        const { data: material = [] } = await supabase.from("vorkalkulation_material").select("*").eq("auftrag_id", id).order("pos");
        const { data: hilfsmaterial = [] } = await supabase.from("vorkalkulation_hilfsmaterial").select("*").eq("auftrag_id", id).order("pos");
        const { data: fremd = [] } = await supabase.from("vorkalkulation_fremdleistungen").select("*").eq("auftrag_id", id);
        const { data: soek = [] } = await supabase.from("vorkalkulation_soek").select("*").eq("auftrag_id", id);
        const { data: cfgRaw } = await supabase.from("vorkalkulation_config").select("*").eq("auftrag_id", id).maybeSingle();
        const cfg = cfgRaw || { risiko_gewinn_prozent: 10, rabatt_prozent: 0, mwst_prozent: 8.1 };

        // Totals
        const totalStunden = (stunden as any[]).reduce((s, r) => s + Number(r.soll_stunden) * Number(r.stundensatz), 0);
        const totalMaterial = (material as any[]).reduce((s, r) => s + Number(r.total_chf), 0);
        const totalHilfsmat = (hilfsmaterial as any[]).reduce((s, r) => s + Number(r.total_chf), 0);
        const totalFremd = (fremd as any[]).reduce((s, r) => s + Number(r.total_chf), 0);
        const totalSoek = (soek as any[]).reduce((s, r) => s + Number(r.total_chf), 0);
        const subtotal = totalStunden + totalMaterial + totalHilfsmat + totalFremd + totalSoek;
        const risikoAmt = subtotal * (Number(cfg.risiko_gewinn_prozent) / 100);
        const nettoVorRabatt = subtotal + risikoAmt;
        const rabattAmt = nettoVorRabatt * (Number(cfg.rabatt_prozent) / 100);
        const netto = nettoVorRabatt - rabattAmt;
        const mwstAmt = netto * (Number(cfg.mwst_prozent) / 100);
        const brutto = netto + mwstAmt;

        const fmt = (n: number) => `CHF ${n.toFixed(2)}`;

        const p1 = addPage();
        let y = p1.curY();

        // Section: Stunden
        p1.rect(mL, y - 2, pageW, 14, lgrey);
        p1.d("A – Stunden (Soll)", mL + 4, y, 9, true, brown);
        y -= 14;
        const cOrt = mL + 4; const cMasch = mL + 130; const cStd = mL + 280; const cSatz = mL + 340; const cTotal = W - mR;
        p1.rect(mL, y - 2, pageW, 12, rgb(0.97, 0.97, 0.97));
        p1.d("Ort", cOrt, y, 7.5, true, grey);
        p1.d("Maschinenpark", cMasch, y, 7.5, true, grey);
        p1.d("Std.", cStd, y, 7.5, true, grey);
        p1.d("Satz", cSatz, y, 7.5, true, grey);
        p1.d("Total CHF", cTotal - font.widthOfTextAtSize("Total CHF", 7.5), y, 7.5, true, grey);
        y -= 4; p1.ln(mL, y, W - mR, y, 0.4, grey); y -= 6;
        p1.setY(y);

        for (const r of (stunden as any[])) {
          const total = Number(r.soll_stunden) * Number(r.stundensatz);
          const totalStr = fmt(total);
          const sw = font.widthOfTextAtSize(totalStr, 8.5);
          p1.d(r.ort, cOrt, y, 8.5, false);
          p1.d(r.maschinenpark || "-", cMasch, y, 8.5, false);
          p1.d(String(r.soll_stunden), cStd, y, 8.5, false);
          p1.d(fmt(Number(r.stundensatz)), cSatz, y, 8.5, false);
          p1.d(totalStr, cTotal - sw, y, 8.5, false);
          y -= 13;
        }
        const stdStr = fmt(totalStunden);
        const stdSW = fontB.widthOfTextAtSize(stdStr, 9);
        p1.ln(W - mR - 120, y + 8, W - mR, y + 8, 0.5, grey);
        p1.d("Total Stunden:", W - mR - 120, y, 8.5, false, grey);
        p1.d(stdStr, cTotal - stdSW, y, 9, true);
        y -= 20;

        // Section: Material
        p1.rect(mL, y - 2, pageW, 14, lgrey);
        p1.d("B – Material / Stückliste", mL + 4, y, 9, true, brown);
        y -= 14;
        const cPos = mL + 4; const cProfil = mL + 35; const cBem = mL + 140; const cStk = mL + 275; const cPreis = mL + 320; const cMtotal = W - mR;
        p1.rect(mL, y - 2, pageW, 12, rgb(0.97, 0.97, 0.97));
        p1.d("Pos", cPos, y, 7.5, true, grey);
        p1.d("Profil", cProfil, y, 7.5, true, grey);
        p1.d("Bemerkung", cBem, y, 7.5, true, grey);
        p1.d("Stk.", cStk, y, 7.5, true, grey);
        p1.d("Preis", cPreis, y, 7.5, true, grey);
        p1.d("Total CHF", cMtotal - font.widthOfTextAtSize("Total CHF", 7.5), y, 7.5, true, grey);
        y -= 4; p1.ln(mL, y, W - mR, y, 0.4, grey); y -= 6;

        for (const r of (material as any[])) {
          const tStr = fmt(Number(r.total_chf));
          const tsw = font.widthOfTextAtSize(tStr, 8.5);
          p1.d(String(r.pos), cPos, y, 8.5, false);
          p1.d((r.profil || "").slice(0, 18), cProfil, y, 8.5, false);
          p1.d((r.bemerkung || "").slice(0, 22), cBem, y, 8.5, false);
          p1.d(String(r.stueck || 1), cStk, y, 8.5, false);
          p1.d(fmt(Number(r.preis_pro_einheit)), cPreis, y, 8.5, false);
          p1.d(tStr, cMtotal - tsw, y, 8.5, false);
          y -= 13;
        }
        const matStr = fmt(totalMaterial);
        const matSW = fontB.widthOfTextAtSize(matStr, 9);
        p1.ln(W - mR - 120, y + 8, W - mR, y + 8, 0.5, grey);
        p1.d("Total Material:", W - mR - 120, y, 8.5, false, grey);
        p1.d(matStr, cMtotal - matSW, y, 9, true);
        y -= 20;

        // Section: Hilfsmaterial (Sheet 2)
        if ((hilfsmaterial as any[]).length > 0) {
          p1.rect(mL, y - 2, pageW, 14, lgrey);
          p1.d("B2 – Hilfsmaterial (Sheet 2)", mL + 4, y, 9, true, brown);
          y -= 14;
          const cHKat = mL + 4; const cHBez = mL + 100; const cHLief = mL + 250; const cHMng = mL + 360; const cHPre = mL + 400; const cHTot = W - mR;
          p1.rect(mL, y - 2, pageW, 12, rgb(0.97, 0.97, 0.97));
          p1.d("Kategorie", cHKat, y, 7.5, true, grey);
          p1.d("Bezeichnung", cHBez, y, 7.5, true, grey);
          p1.d("Lieferant", cHLief, y, 7.5, true, grey);
          p1.d("Menge", cHMng, y, 7.5, true, grey);
          p1.d("Fr./Einh.", cHPre, y, 7.5, true, grey);
          p1.d("Total CHF", cHTot - font.widthOfTextAtSize("Total CHF", 7.5), y, 7.5, true, grey);
          y -= 4; p1.ln(mL, y, W - mR, y, 0.4, grey); y -= 6;
          for (const r of (hilfsmaterial as any[])) {
            const tStr = fmt(Number(r.total_chf));
            const tsw = font.widthOfTextAtSize(tStr, 8.5);
            p1.d((r.kategorie || "").slice(0, 15), cHKat, y, 8.5, false);
            p1.d((r.bezeichnung || "").slice(0, 22), cHBez, y, 8.5, false);
            p1.d((r.lieferant || "").slice(0, 18), cHLief, y, 8.5, false);
            p1.d(`${r.stueck || 1} ${r.einheit || "Stk"}`, cHMng, y, 8.5, false);
            p1.d(fmt(Number(r.preis_pro_einheit)), cHPre, y, 8.5, false);
            p1.d(tStr, cHTot - tsw, y, 8.5, false);
            y -= 13;
          }
          const hilfsStr = fmt(totalHilfsmat);
          const hilfsSW = fontB.widthOfTextAtSize(hilfsStr, 9);
          p1.ln(W - mR - 120, y + 8, W - mR, y + 8, 0.5, grey);
          p1.d("Total Hilfsmaterial:", W - mR - 130, y, 8.5, false, grey);
          p1.d(hilfsStr, cHTot - hilfsSW, y, 9, true);
          y -= 20;
        }

        // Section: Fremdleistungen
        p1.rect(mL, y - 2, pageW, 14, lgrey);
        p1.d("C – Fremdleistungen", mL + 4, y, 9, true, brown);
        y -= 14;
        const cFBez = mL + 4; const cFAnz = mL + 230; const cFEin = mL + 275; const cFPre = mL + 340; const cFTot = W - mR;
        p1.rect(mL, y - 2, pageW, 12, rgb(0.97, 0.97, 0.97));
        p1.d("Bezeichnung", cFBez, y, 7.5, true, grey);
        p1.d("Anz.", cFAnz, y, 7.5, true, grey);
        p1.d("Einheit", cFEin, y, 7.5, true, grey);
        p1.d("Preis", cFPre, y, 7.5, true, grey);
        p1.d("Total CHF", cFTot - font.widthOfTextAtSize("Total CHF", 7.5), y, 7.5, true, grey);
        y -= 4; p1.ln(mL, y, W - mR, y, 0.4, grey); y -= 6;

        for (const r of (fremd as any[])) {
          const tStr = fmt(Number(r.total_chf));
          const tsw = font.widthOfTextAtSize(tStr, 8.5);
          p1.d((r.bezeichnung || "").slice(0, 35), cFBez, y, 8.5, false);
          p1.d(String(r.anzahl), cFAnz, y, 8.5, false);
          p1.d(r.einheit || "", cFEin, y, 8.5, false);
          p1.d(fmt(Number(r.preis_pro_einheit)), cFPre, y, 8.5, false);
          p1.d(tStr, cFTot - tsw, y, 8.5, false);
          y -= 13;
        }
        const fremdStr = fmt(totalFremd);
        const fremdSW = fontB.widthOfTextAtSize(fremdStr, 9);
        p1.ln(W - mR - 120, y + 8, W - mR, y + 8, 0.5, grey);
        p1.d("Total Fremdleistungen:", W - mR - 140, y, 8.5, false, grey);
        p1.d(fremdStr, cFTot - fremdSW, y, 9, true);
        y -= 20;

        // Section: SOEK
        p1.rect(mL, y - 2, pageW, 14, lgrey);
        p1.d("D – Sondereinzelkosten / Spesen (SOEK)", mL + 4, y, 9, true, brown);
        y -= 14;
        const cSBez = mL + 4; const cSAnz = mL + 230; const cSEin = mL + 275; const cSPre = mL + 340; const cSTot = W - mR;
        p1.rect(mL, y - 2, pageW, 12, rgb(0.97, 0.97, 0.97));
        p1.d("Bezeichnung", cSBez, y, 7.5, true, grey);
        p1.d("Anz.", cSAnz, y, 7.5, true, grey);
        p1.d("Einheit", cSEin, y, 7.5, true, grey);
        p1.d("Preis", cSPre, y, 7.5, true, grey);
        p1.d("Total CHF", cSTot - font.widthOfTextAtSize("Total CHF", 7.5), y, 7.5, true, grey);
        y -= 4; p1.ln(mL, y, W - mR, y, 0.4, grey); y -= 6;

        for (const r of (soek as any[])) {
          const tStr = fmt(Number(r.total_chf));
          const tsw = font.widthOfTextAtSize(tStr, 8.5);
          p1.d((r.bezeichnung || "").slice(0, 35), cSBez, y, 8.5, false);
          p1.d(String(r.anzahl), cSAnz, y, 8.5, false);
          p1.d(r.einheit || "", cSEin, y, 8.5, false);
          p1.d(fmt(Number(r.preis_pro_einheit)), cSPre, y, 8.5, false);
          p1.d(tStr, cSTot - tsw, y, 8.5, false);
          y -= 13;
        }
        const soekStr = fmt(totalSoek);
        const soekSW = fontB.widthOfTextAtSize(soekStr, 9);
        p1.ln(W - mR - 120, y + 8, W - mR, y + 8, 0.5, grey);
        p1.d("Total SOEK:", W - mR - 120, y, 8.5, false, grey);
        p1.d(soekStr, cSTot - soekSW, y, 9, true);
        y -= 25;

        // Zusammenfassung
        p1.ln(mL, y, W - mR, y, 1.0, brown); y -= 14;
        p1.d("Zusammenfassung Vorkalkulation", mL, y, 10, true, brown); y -= 18;

        const summaryRow = (lbl: string, val: string, bold: boolean) => {
          p1.d(lbl, W - mR - 230, y, 9, false, grey);
          const vw = (bold ? fontB : font).widthOfTextAtSize(val, 9);
          p1.d(val, W - mR - vw, y, 9, bold);
          y -= 13;
        };

        summaryRow("Stunden:", fmt(totalStunden), false);
        summaryRow("Material:", fmt(totalMaterial), false);
        if (totalHilfsmat > 0) summaryRow("Hilfsmaterial:", fmt(totalHilfsmat), false);
        summaryRow("Fremdleistungen:", fmt(totalFremd), false);
        summaryRow("SOEK:", fmt(totalSoek), false);
        p1.ln(W - mR - 230, y + 8, W - mR, y + 8, 0.5, grey); y -= 5;
        summaryRow("Subtotal:", fmt(subtotal), true);
        summaryRow(`Risiko / Gewinn (${cfg.risiko_gewinn_prozent}%):`, fmt(risikoAmt), false);
        if (Number(cfg.rabatt_prozent) > 0) {
          summaryRow(`Rabatt (${cfg.rabatt_prozent}%):`, `-${fmt(rabattAmt)}`, false);
        }
        p1.ln(W - mR - 230, y + 8, W - mR, y + 8, 0.5, grey); y -= 5;
        summaryRow("Netto:", fmt(netto), false);
        summaryRow(`MWST (${cfg.mwst_prozent}%):`, fmt(mwstAmt), false);
        p1.ln(W - mR - 230, y + 8, W - mR, y + 8, 1.0, brown); y -= 5;

        // Brutto highlight
        p1.rect(W - mR - 230, y - 6, 230, 20, rgb(0.95, 0.90, 0.85));
        const bruttoStr = fmt(brutto);
        const bruttoSW = fontB.widthOfTextAtSize(bruttoStr, 11);
        p1.d("Offertpreis (brutto):", W - mR - 228, y, 9.5, true, brown);
        p1.d(bruttoStr, W - mR - bruttoSW, y, 11, true, orange);
        y -= 25;

        if (cfg.notiz) {
          p1.d("Notiz:", mL, y, 8.5, true, grey); y -= 12;
          p1.d(cfg.notiz.slice(0, 120), mL, y, 8.5, false, grey);
        }

        // Footer — farbiger Balken auf allen Seiten
        const white2 = rgb(1, 1, 1);
        for (const pg2 of pdfDoc.getPages()) {
          pg2.drawRectangle({ x: 0, y: 0, width: W, height: 22, color: brown });
          const firmaFull = (offSMap.firmenname||"Schneggenburger GmbH")+" · "+(offSMap.adresse||"Hefenhoferstrasse 7")+" · "+(offSMap.plz_ort||"8580 Sommeri")+" · "+(offSMap.telefon||"071 411 16 87");
          pg2.drawText(firmaFull, { x: mL, y: 7, size: 6.5, font, color: white2 });
          const erstelltStr = `Erstellt: ${new Date().toLocaleDateString("de-CH")}`;
          const erstelltW = font.widthOfTextAtSize(erstelltStr, 6.5);
          pg2.drawText(erstelltStr, { x: W - mR - erstelltW, y: 7, size: 6.5, font, color: white2 });
        }

      } else {
        // ─── NACHKALKULATION PDF (Soll-Ist-Vergleich) ─────────────────────────

        // Load VK data (Soll)
        const { data: vkStunden = [] } = await supabase.from("vorkalkulation_stunden").select("*").eq("auftrag_id", id);
        const { data: vkMaterial = [] } = await supabase.from("vorkalkulation_material").select("*").eq("auftrag_id", id);
        const { data: vkFremd = [] } = await supabase.from("vorkalkulation_fremdleistungen").select("*").eq("auftrag_id", id);
        const { data: vkSoek = [] } = await supabase.from("vorkalkulation_soek").select("*").eq("auftrag_id", id);
        const { data: cfgRaw2 } = await supabase.from("vorkalkulation_config").select("*").eq("auftrag_id", id).maybeSingle();
        const cfg2 = cfgRaw2 || { risiko_gewinn_prozent: 10, rabatt_prozent: 0, mwst_prozent: 8.1 };

        // Load NAKA data (Ist)
        const { data: zeiteintraege = [] } = await supabase.from("zeiteintraege").select("*").eq("auftrag_id", id);
        const { data: nakaMaterial = [] } = await supabase.from("nachkalkulation_material").select("*").eq("auftrag_id", id);
        const { data: nakaFremd = [] } = await supabase.from("nachkalkulation_fremdleistungen").select("*").eq("auftrag_id", id);

        const fmt = (n: number) => `CHF ${n.toFixed(2)}`;
        const fmtH = (min: number) => `${(min / 60).toFixed(2)} h`;

        // VK Totals
        const vkStundenCHF = (vkStunden as any[]).reduce((s, r) => s + Number(r.soll_stunden) * Number(r.stundensatz), 0);
        const vkMaterialCHF = (vkMaterial as any[]).reduce((s, r) => s + Number(r.total_chf), 0);
        const vkFremdCHF = (vkFremd as any[]).reduce((s, r) => s + Number(r.total_chf), 0);
        const vkSoekCHF = (vkSoek as any[]).reduce((s, r) => s + Number(r.total_chf), 0);
        const vkSubtotal = vkStundenCHF + vkMaterialCHF + vkFremdCHF + vkSoekCHF;
        const vkRisiko = vkSubtotal * (Number(cfg2.risiko_gewinn_prozent) / 100);
        const vkNorR = vkSubtotal + vkRisiko;
        const vkRabatt = vkNorR * (Number(cfg2.rabatt_prozent) / 100);
        const vkNetto = vkNorR - vkRabatt;
        const vkMwst = vkNetto * (Number(cfg2.mwst_prozent) / 100);
        const vkBrutto = vkNetto + vkMwst;

        // IST Totals
        // Group zeiteintraege by ort/maschinenpark
        const ortMap: Record<string, { minuten: number; satz: number }> = {};
        for (const z of (zeiteintraege as any[])) {
          const ort = z.ort || "Unbekannt";
          const masch = z.maschinenpark || null;
          const key = masch ? `${ort}::${masch}` : ort;
          const satz = getOrtSatz(ort, masch);
          if (!ortMap[key]) ortMap[key] = { minuten: 0, satz };
          ortMap[key].minuten += Number(z.dauer_minuten) || 0;
        }
        const istStundenCHF = Object.values(ortMap).reduce((s, v) => s + (v.minuten / 60) * v.satz, 0);
        const istTotalMinuten = (zeiteintraege as any[]).reduce((s, z) => s + (Number(z.dauer_minuten) || 0), 0);
        const istMaterialCHF = (nakaMaterial as any[]).reduce((s, r) => s + Number(r.betrag_chf), 0);
        const istFremdCHF = (nakaFremd as any[]).reduce((s, r) => s + Number(r.betrag_chf), 0);
        const istSubtotal = istStundenCHF + istMaterialCHF + istFremdCHF;

        const p1 = addPage();
        let y = p1.curY();

        // Soll-Ist Vergleich header row
        const cLbl = mL + 4; const cSoll = mL + 270; const cIst = mL + 380; const cAbw = W - mR;

        p1.rect(mL, y - 2, pageW, 14, lgrey);
        p1.d("Position", cLbl, y, 8, true, grey);
        p1.d("Soll (VK)", cSoll, y, 8, true, grey);
        p1.d("Ist (NAKA)", cIst, y, 8, true, grey);
        p1.d("Abweichung", cAbw - fontB.widthOfTextAtSize("Abweichung", 8), y, 8, true, grey);
        y -= 4; p1.ln(mL, y, W - mR, y, 0.4, grey); y -= 3;
        p1.setY(y);

        function siRow(lbl: string, soll: number, ist: number, isCHF: boolean, bold: boolean) {
          const abw = ist - soll;
          const sollStr = isCHF ? fmt(soll) : fmtH(soll * 60);
          const istStr = isCHF ? fmt(ist) : fmtH(ist * 60);
          const abwStr = (abw >= 0 ? "+" : "") + (isCHF ? fmt(abw) : fmtH(abw * 60));
          const col = abw > 0 ? rgb(0.75, 0.10, 0.10) : abw < 0 ? rgb(0.10, 0.55, 0.10) : black;
          const f = bold ? fontB : font;
          p1.d(lbl, cLbl, y, 9, bold);
          const sw1 = f.widthOfTextAtSize(sollStr, 9);
          const sw2 = f.widthOfTextAtSize(istStr, 9);
          const sw3 = font.widthOfTextAtSize(abwStr, 9);
          p1.d(sollStr, cSoll + 80 - sw1, y, 9, bold);
          p1.d(istStr, cIst + 80 - sw2, y, 9, bold);
          p1.d(abwStr, cAbw - sw3, y, 9, false, col);
          y -= 14;
        }

        // VK Soll-Stunden as hours
        const vkSollStunden = (vkStunden as any[]).reduce((s, r) => s + Number(r.soll_stunden), 0);
        const istStunden = istTotalMinuten / 60;
        siRow("Stunden (CHF)", vkStundenCHF, istStundenCHF, true, false);
        siRow("Stunden (h)", vkSollStunden, istStunden, false, false);
        y -= 4; p1.ln(mL, y + 8, W - mR, y + 8, 0.3, lgrey); y -= 4;
        siRow("Material (CHF)", vkMaterialCHF, istMaterialCHF, true, false);
        siRow("Fremdleistungen (CHF)", vkFremdCHF, istFremdCHF, true, false);
        siRow("SOEK (CHF)", vkSoekCHF, 0, true, false);
        y -= 4; p1.ln(mL, y + 8, W - mR, y + 8, 0.6, grey); y -= 4;
        siRow("Subtotal", vkSubtotal, istSubtotal, true, true);
        y -= 6;

        // Individual ort stunden breakdown
        p1.ln(mL, y + 8, W - mR, y + 8, 0.3, lgrey); y -= 4;
        p1.d("Stundendetail nach Ort", mL + 4, y, 8.5, true, brown); y -= 14;
        for (const [key, val] of Object.entries(ortMap)) {
          const ortLabel = key.replace("::", " · ");
          const std = val.minuten / 60;
          p1.d(`Ist – ${ortLabel}:`, cLbl, y, 8.5, false, grey);
          p1.d(`${std.toFixed(2)} h × CHF ${val.satz.toFixed(2)} = ${fmt(std * val.satz)}`, cSoll, y, 8.5, false);
          y -= 12;
        }
        y -= 10;

        // VK breakdown
        p1.d("VK-Offertpreis Referenz:", mL + 4, y, 8.5, true, brown); y -= 14;
        p1.d("Offertpreis (brutto):", W - mR - 230, y, 8.5, false, grey);
        const bruttoStr = fmt(vkBrutto);
        const bsw = fontB.widthOfTextAtSize(bruttoStr, 9);
        p1.d(bruttoStr, W - mR - bsw, y, 9, true, orange);
        y -= 14;

        const diffStr = (istSubtotal - vkSubtotal >= 0 ? "+" : "") + fmt(istSubtotal - vkSubtotal);
        const diffCol = istSubtotal > vkSubtotal ? rgb(0.75, 0.10, 0.10) : rgb(0.10, 0.55, 0.10);
        p1.d("Kosten-Abweichung (Ist–Soll):", W - mR - 230, y, 8.5, false, grey);
        const dsw = fontB.widthOfTextAtSize(diffStr, 9);
        p1.d(diffStr, W - mR - dsw, y, 9, true, diffCol);
        y -= 20;

        if ((nakaMaterial as any[]).length > 0) {
          p1.ln(mL, y + 4, W - mR, y + 4, 0.3, lgrey); y -= 8;
          p1.d("Ist-Material (erfasst)", mL + 4, y, 8.5, true, brown); y -= 14;
          for (const r of (nakaMaterial as any[])) {
            p1.d(`${(r.bezeichnung || "").slice(0, 30)} – ${r.lieferant || "-"}`, cLbl, y, 8.5, false);
            const ms = font.widthOfTextAtSize(fmt(Number(r.betrag_chf)), 8.5);
            p1.d(fmt(Number(r.betrag_chf)), W - mR - ms, y, 8.5, false);
            y -= 12;
          }
        }

        if ((nakaFremd as any[]).length > 0) {
          p1.ln(mL, y + 4, W - mR, y + 4, 0.3, lgrey); y -= 8;
          p1.d("Ist-Fremdleistungen (erfasst)", mL + 4, y, 8.5, true, brown); y -= 14;
          for (const r of (nakaFremd as any[])) {
            p1.d(`${(r.bezeichnung || "").slice(0, 30)} – ${r.lieferant || "-"}`, cLbl, y, 8.5, false);
            const fs2 = font.widthOfTextAtSize(fmt(Number(r.betrag_chf)), 8.5);
            p1.d(fmt(Number(r.betrag_chf)), W - mR - fs2, y, 8.5, false);
            y -= 12;
          }
        }

        // Footer
        const pg1 = pdfDoc.getPages()[0];
        const ftxt = `Nachkalkulation / Soll-Ist-Vergleich ${auftrag.nr} – Schneggenburger GmbH`;
        pg1.drawText(ftxt, { x: mL, y: 25, size: 7.5, font, color: grey });
        pg1.drawLine({ start: { x: mL, y: 38 }, end: { x: W - mR, y: 38 }, thickness: 0.3, color: grey });
        pg1.drawText(`Erstellt: ${new Date().toLocaleDateString("de-CH")}`, { x: W - mR - 80, y: 25, size: 7.5, font, color: grey });
      }

      const bytes = await pdfDoc.save();
      const filename = isVK
        ? `Vorkalkulation-${auftrag.nr}.pdf`
        : `Nachkalkulation-${auftrag.nr}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
      res.end(Buffer.from(bytes));
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });


  // ─── Ferien ───────────────────────────────────────────────────────────────────
  app.get("/api/ferien", async (_req, res) => {
    try {
      const { data, error } = await supabase
        .from("ferien")
        .select("*")
        .order("von", { ascending: false });
      if (error) throw error;
      // Mitarbeiter-Namen separat laden
      const { data: mitarbeiter } = await supabase.from("mitarbeiter").select("id, vorname, nachname");
      const result = (data || []).map((f: any) => {
        const ma = (mitarbeiter || []).find((m: any) => m.id === f.mitarbeiter_id);
        return { ...f, mitarbeiter_name: ma ? `${ma.vorname} ${ma.nachname}`.trim() : f.mitarbeiter_id };
      });
      res.json(result);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.post("/api/ferien", async (req, res) => {
    try {
      const { mitarbeiter_id, von, bis, typ, notiz } = req.body;
      const eintrag = {
        id: uid(),
        mitarbeiter_id,
        von,
        bis,
        typ: typ || "ferien",
        notiz: notiz || "",
        erstellt: new Date().toISOString(),
      };
      const { data, error } = await supabase.from("ferien").insert(eintrag).select().single();
      if (error) throw error;
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.patch("/api/ferien/:id", async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("ferien").update(req.body).eq("id", req.params.id).select().single();
      if (error) throw error;
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.delete("/api/ferien/:id", async (req, res) => {
    try {
      const { error } = await supabase.from("ferien").delete().eq("id", req.params.id);
      if (error) throw error;
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ─── Lieferanten ──────────────────────────────────────────────────────────────
  app.get("/api/lieferanten", async (_req, res) => {
    try {
      const { data, error } = await supabase
        .from("lieferanten").select("*").order("firma", { ascending: true });
      if (error) throw error;
      res.json(data || []);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.post("/api/lieferanten", async (req, res) => {
    try {
      const eintrag = { id: uid(), ...req.body, erstellt: new Date().toISOString() };
      const { data, error } = await supabase.from("lieferanten").insert(eintrag).select().single();
      if (error) throw error;
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.patch("/api/lieferanten/:id", async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("lieferanten").update(req.body).eq("id", req.params.id).select().single();
      if (error) throw error;
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.delete("/api/lieferanten/:id", async (req, res) => {
    try {
      const { error } = await supabase.from("lieferanten").delete().eq("id", req.params.id);
      if (error) throw error;
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ─── Materialbestellungen ─────────────────────────────────────────────────────
  app.get("/api/materialbestellungen", async (req, res) => {
    try {
      let query = supabase.from("materialbestellungen").select("*").order("erstellt", { ascending: false });
      if (req.query.auftrag_id) query = query.eq("auftrag_id", String(req.query.auftrag_id));
      const { data, error } = await query;
      if (error) throw error;
      res.json(data || []);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.post("/api/materialbestellungen", async (req, res) => {
    try {
      const eintrag = { id: uid(), ...req.body, erstellt: new Date().toISOString() };
      const { data, error } = await supabase.from("materialbestellungen").insert(eintrag).select().single();
      if (error) throw error;
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.patch("/api/materialbestellungen/:id", async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("materialbestellungen").update(req.body).eq("id", req.params.id).select().single();
      if (error) throw error;
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.delete("/api/materialbestellungen/:id", async (req, res) => {
    try {
      const { error } = await supabase.from("materialbestellungen").delete().eq("id", req.params.id);
      if (error) throw error;
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ─── Auftrag-Kommentare ───────────────────────────────────────────────────────
  app.get("/api/auftraege/:id/kommentare", async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("auftrag_kommentare")
        .select("*")
        .eq("auftrag_id", req.params.id)
        .order("erstellt", { ascending: true });
      if (error) throw error;
      res.json(data || []);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.post("/api/auftraege/:id/kommentare", async (req, res) => {
    try {
      const { autor, text } = req.body;
      const eintrag = {
        id: uid(),
        auftrag_id: req.params.id,
        autor: autor || "Unbekannt",
        text,
        erstellt: new Date().toISOString(),
      };
      const { data, error } = await supabase.from("auftrag_kommentare").insert(eintrag).select().single();
      if (error) throw error;
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.delete("/api/kommentare/:id", async (req, res) => {
    try {
      const { error } = await supabase.from("auftrag_kommentare").delete().eq("id", req.params.id);
      if (error) throw error;
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });


  // ═══ KALKULATION V6 ════════════════════════════════════════════════════════

  // VK Hilfsmaterial
  app.get("/api/kalkulation/:auftragsId/hilfsmaterial", async (req, res) => {
    const { auftragsId } = req.params;
    const { data, error } = await supabase.from("vorkalkulation_hilfsmaterial").select("*").eq("auftrag_id", auftragsId).order("pos");
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });
  app.post("/api/kalkulation/:auftragsId/hilfsmaterial", async (req, res) => {
    const { auftragsId } = req.params;
    const { data, error } = await supabase.from("vorkalkulation_hilfsmaterial").insert({ ...req.body, auftrag_id: auftragsId }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });
  app.put("/api/kalkulation/hilfsmaterial/:id", async (req, res) => {
    const { id } = req.params;
    const { data, error } = await supabase.from("vorkalkulation_hilfsmaterial").update(req.body).eq("id", id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });
  app.delete("/api/kalkulation/hilfsmaterial/:id", async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase.from("vorkalkulation_hilfsmaterial").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  // VK Hauptmaterial Flächenbezogen
  app.get("/api/kalkulation/:auftragsId/hauptmaterial-flaeche", async (req, res) => {
    const { auftragsId } = req.params;
    const { data, error } = await supabase.from("vorkalkulation_hauptmaterial_flaeche").select("*").eq("auftrag_id", auftragsId).order("pos");
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });
  app.post("/api/kalkulation/:auftragsId/hauptmaterial-flaeche", async (req, res) => {
    const { auftragsId } = req.params;
    const { data, error } = await supabase.from("vorkalkulation_hauptmaterial_flaeche").insert({ ...req.body, auftrag_id: auftragsId }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });
  app.put("/api/kalkulation/hauptmaterial-flaeche/:id", async (req, res) => {
    const { id } = req.params;
    const { data, error } = await supabase.from("vorkalkulation_hauptmaterial_flaeche").update(req.body).eq("id", id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });
  app.delete("/api/kalkulation/hauptmaterial-flaeche/:id", async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase.from("vorkalkulation_hauptmaterial_flaeche").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  // NK Stunden (IST) + Sync aus Zeiterfassung
  app.get("/api/kalkulation/:auftragsId/nk-stunden", async (req, res) => {
    const { auftragsId } = req.params;
    try {
      // Lade Stundensätze
      const { data: saetze = [] } = await supabase.from("stundensaetze").select("*");

      // 1. Live Zeiterfassung-Einträge aus zeiteintraege
      const { data: zeitData = [], error: zeitError } = await supabase
        .from("zeiteintraege").select("*").eq("auftrag_id", auftragsId).order("datum");
      if (zeitError) return res.status(500).json({ error: zeitError.message });

      const bereichMap: Record<string, string> = { "Avor": "Planung/AVOR", "Werkstatt": "Werkstatt", "Montage": "Montage" };
      const zeitRows = (zeitData as any[]).map((ze: any) => {
        const ortZe = ze.ort || "Montage";
        let satz = 0;
        if (ortZe === "Werkstatt") {
          const ws = (saetze as any[]).find((s: any) => s.ort === "Werkstatt" && !s.maschinenpark);
          satz = ws ? ((ws.grundsatz || 0) + (ws.satz || 0)) : 0;
          if (ze.maschinenpark) {
            const wm = (saetze as any[]).find((s: any) => s.ort === "Werkstatt" && s.maschinenpark === ze.maschinenpark);
            if (wm) satz = (wm.grundsatz || 0) + (wm.satz || 0);
          }
        } else {
          const match = (saetze as any[]).find((s: any) => s.ort === ortZe && !s.maschinenpark);
          satz = match ? (match.satz || 0) : 0;
        }
        const stunden = (ze.dauer_minuten || 0) / 60;
        const bereich = ze.bereich || bereichMap[ortZe] || ortZe;
        return {
          id: ze.id,
          auftrag_id: ze.auftrag_id,
          bereich,
          unterkategorie: ze.beschreibung || "",
          mitarbeiter_name: ze.mitarbeiter || "",
          datum: ze.datum,
          ist_stunden: stunden,
          stundensatz: satz,
          total_chf: stunden * satz,
          quelle: "zeiterfassung",
          zeiterfassung_id: ze.id,
          bemerkung: ze.beschreibung || "",
          ort: ze.ort,
          maschinenpark: ze.maschinenpark,
        };
      });

      // 2. Manuelle NK-Stunden
      const { data: manuelleData = [], error: manError } = await supabase
        .from("nachkalkulation_stunden").select("*").eq("auftrag_id", auftragsId).eq("quelle", "manuell").order("datum");
      if (manError) return res.status(500).json({ error: manError.message });

      // Zusammenführen: zuerst Zeiterfassung, dann manuelle
      const combined = [...zeitRows, ...(manuelleData as any[])];
      combined.sort((a: any, b: any) => (a.datum || "").localeCompare(b.datum || ""));
      res.json(combined);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });
  app.post("/api/kalkulation/:auftragsId/nk-stunden/sync-zeiterfassung", async (req, res) => {
    const { auftragsId } = req.params;
    const { data: zeitData = [], error: zeitError } = await supabase.from("zeiteintraege").select("*").eq("auftrag_id", auftragsId);
    if (zeitError) return res.status(500).json({ error: zeitError.message });
    const { data: saetze = [] } = await supabase.from("stundensaetze").select("*");
    let synced = 0;
    for (const ze of zeitData) {
      const { data: existing } = await supabase.from("nachkalkulation_stunden").select("id").eq("zeiterfassung_id", ze.id).single();
      if (existing) continue;
      // Korrekten Stundensatz nach Ort ermitteln
      const ortZe = ze.ort || "Montage";
      let satz = 0;
      if (ortZe === "Werkstatt") {
        const ws = (saetze as any[]).find((s: any) => s.ort === "Werkstatt" && !s.maschinenpark);
        satz = ws ? ((ws.grundsatz || 0) + (ws.satz || 0)) : 0;
        if (ze.maschinenpark) {
          const wm = (saetze as any[]).find((s: any) => s.ort === "Werkstatt" && s.maschinenpark === ze.maschinenpark);
          if (wm) satz = (wm.grundsatz || 0) + (wm.satz || 0);
        }
      } else {
        const match = (saetze as any[]).find((s: any) => s.ort === ortZe && !s.maschinenpark);
        satz = match ? (match.satz || 0) : 0;
      }
      const stunden = (ze.dauer_minuten || 0) / 60;
      // Bereich aus Ort ableiten
      const bereichMap: Record<string, string> = { "Avor": "Planung/AVOR", "Werkstatt": "Werkstatt", "Montage": "Montage" };
      const bereich = ze.bereich || bereichMap[ortZe] || ortZe;
      await supabase.from("nachkalkulation_stunden").insert({
        auftrag_id: auftragsId, bereich,
        mitarbeiter_name: ze.mitarbeiter || "", datum: ze.datum,
        ist_stunden: stunden, stundensatz: satz, total_chf: stunden * satz,
        quelle: "zeiterfassung", zeiterfassung_id: ze.id, bemerkung: ze.beschreibung || "",
      });
      synced++;
    }
    res.json({ synced });
  });
  app.post("/api/kalkulation/:auftragsId/nk-stunden", async (req, res) => {
    const { auftragsId } = req.params;
    const row = { ...req.body, auftrag_id: auftragsId, quelle: "manuell" };
    if (!row.total_chf) row.total_chf = (row.ist_stunden || 0) * (row.stundensatz || 0);
    const { data, error } = await supabase.from("nachkalkulation_stunden").insert(row).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });
  app.put("/api/kalkulation/nk-stunden/:id", async (req, res) => {
    const { id } = req.params;
    const row = { ...req.body };
    if (!row.total_chf) row.total_chf = (row.ist_stunden || 0) * (row.stundensatz || 0);
    const { data, error } = await supabase.from("nachkalkulation_stunden").update(row).eq("id", id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });
  app.delete("/api/kalkulation/nk-stunden/:id", async (req, res) => {
    const { id } = req.params;
    // Prüfen ob es ein Zeiterfassung-Eintrag ist (quelle=zeiterfassung → löscht aus zeiteintraege)
    const { data: row } = await supabase.from("nachkalkulation_stunden").select("quelle,zeiterfassung_id").eq("id", id).single();
    if (row && row.quelle === "zeiterfassung" && row.zeiterfassung_id) {
      const { error } = await supabase.from("zeiteintraege").delete().eq("id", row.zeiterfassung_id);
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ success: true, deleted_from: "zeiteintraege" });
    }
    const { error } = await supabase.from("nachkalkulation_stunden").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  // DELETE Zeiterfassung-Eintrag direkt (für NK IST-Stunden Live-View)
  app.delete("/api/kalkulation/nk-zeiterfassung/:zeitId", async (req, res) => {
    const { zeitId } = req.params;
    const { error } = await supabase.from("zeiteintraege").delete().eq("id", zeitId);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  // NK Material (IST)
  app.get("/api/kalkulation/:auftragsId/nk-material", async (req, res) => {
    const { auftragsId } = req.params;
    const { data, error } = await supabase.from("nachkalkulation_material").select("*").eq("auftrag_id", auftragsId).order("datum");
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });
  app.post("/api/kalkulation/:auftragsId/nk-material", async (req, res) => {
    const { auftragsId } = req.params;
    const { data, error } = await supabase.from("nachkalkulation_material").insert({ ...req.body, auftrag_id: auftragsId }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });
  app.put("/api/kalkulation/nk-material/:id", async (req, res) => {
    const { id } = req.params;
    const { data, error } = await supabase.from("nachkalkulation_material").update(req.body).eq("id", id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });
  app.delete("/api/kalkulation/nk-material/:id", async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase.from("nachkalkulation_material").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  // NK Fremdleistungen (IST)
  app.get("/api/kalkulation/:auftragsId/nk-fremd", async (req, res) => {
    const { auftragsId } = req.params;
    const { data, error } = await supabase.from("nachkalkulation_fremdleistungen").select("*").eq("auftrag_id", auftragsId).order("datum");
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });
  app.post("/api/kalkulation/:auftragsId/nk-fremd", async (req, res) => {
    const { auftragsId } = req.params;
    const { data, error } = await supabase.from("nachkalkulation_fremdleistungen").insert({ ...req.body, auftrag_id: auftragsId }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });
  app.put("/api/kalkulation/nk-fremd/:id", async (req, res) => {
    const { id } = req.params;
    const { data, error } = await supabase.from("nachkalkulation_fremdleistungen").update(req.body).eq("id", id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });
  app.delete("/api/kalkulation/nk-fremd/:id", async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase.from("nachkalkulation_fremdleistungen").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  // NK SOEK (IST)
  app.get("/api/kalkulation/:auftragsId/nk-soek", async (req, res) => {
    const { auftragsId } = req.params;
    const { data, error } = await supabase.from("nachkalkulation_soek").select("*").eq("auftrag_id", auftragsId).order("datum");
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });
  app.post("/api/kalkulation/:auftragsId/nk-soek", async (req, res) => {
    const { auftragsId } = req.params;
    const { data, error } = await supabase.from("nachkalkulation_soek").insert({ ...req.body, auftrag_id: auftragsId }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });
  app.put("/api/kalkulation/nk-soek/:id", async (req, res) => {
    const { id } = req.params;
    const { data, error } = await supabase.from("nachkalkulation_soek").update(req.body).eq("id", id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });
  app.delete("/api/kalkulation/nk-soek/:id", async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase.from("nachkalkulation_soek").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  // ═══ END KALKULATION V6 ═══════════════════════════════════════════

  // ─── Garantien ────────────────────────────────────────────────────────────────
  app.get("/api/garantien", async (req, res) => {
    try {
      let query = supabase.from("garantien").select("*").order("ablauf_datum", { ascending: true });
      if (req.query.auftrag_id) query = (query as any).eq("auftrag_id", String(req.query.auftrag_id));
      const { data, error } = await query;
      if (error) throw error;
      // Aufträge separat laden für Namen
      const { data: auftraege } = await supabase.from("auftraege").select("id, nr, titel");
      const result = (data || []).map((g: any) => {
        const a = (auftraege || []).find((x: any) => x.id === g.auftrag_id);
        return { ...g, auftrag_nr: a?.nr || '', auftrag_titel: a?.titel || '' };
      });
      res.json(result);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.get("/api/garantien/warnungen", async (_req, res) => {
    try {
      const { data, error } = await supabase.from("garantien").select("id,ablaufdatum").not("ablaufdatum", "is", null);
      if (error) throw error;
      const heute = new Date();
      const kritisch = (data || []).filter((g: any) => {
        const diff = Math.ceil((new Date(g.ablaufdatum).getTime() - heute.getTime()) / 86400000);
        return diff < 0 || diff <= 30;
      });
      res.json({ count: kritisch.length });
    } catch(e) { res.status(500).json({ count: 0 }); }
  });

  app.post("/api/garantien", async (req, res) => {
    try {
      const eintrag = { id: uid(), ...req.body, erstellt: new Date().toISOString() };
      const { data, error } = await supabase.from("garantien").insert(eintrag).select().single();
      if (error) throw error;
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.patch("/api/garantien/:id", async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("garantien").update(req.body).eq("id", req.params.id).select().single();
      if (error) throw error;
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.delete("/api/garantien/:id", async (req, res) => {
    try {
      const { error } = await supabase.from("garantien").delete().eq("id", req.params.id);
      if (error) throw error;
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ─── Lieferschein PDF (Vorlage aus DB) ─────────────────────────────────────────
  app.post("/api/auftraege/:id/lieferschein-pdf", async (req, res) => {
    try {
      const { id } = req.params;
      const { data: auftrag, error: aErr } = await supabase.from("auftraege").select("*").eq("id", id).single();
      if (aErr || !auftrag) throw new Error("Auftrag nicht gefunden");

      const { data: settingsArr } = await supabase.from("einstellungen").select("schluessel,wert");
      const sMap: Record<string, string> = {};
      for (const s of (settingsArr || [])) sMap[s.schluessel] = s.wert;

      // Positionen laden — zuerst Offerte, dann Rechnung als Fallback (JSONB-Spalten)
      let positionen: any[] = [];
      // Zuerst Offerte des Auftrags laden (hat vollständige Positionen mit Titel)
      const { data: offerten } = await supabase.from("offerten").select("positionen").eq("auftrag_id", id).order("erstellt", { ascending: false }).limit(1);
      if (offerten && offerten.length > 0 && Array.isArray(offerten[0].positionen) && offerten[0].positionen.length > 0) {
        positionen = offerten[0].positionen.map((p: any) => ({
          titel: p.titel || p.beschreibung || "",
          beschreibung: p.beschreibung || "",
          menge: p.menge || 1,
          einheit: p.einheit || "Stk.",
          einzelpreis: 0,
          total: 0,
        }));
      } else {
        // Fallback: Rechnungs-Positionen (JSONB)
        const { data: rechnungen } = await supabase.from("rechnungen").select("positionen").eq("auftrag_id", id).order("erstellt", { ascending: false }).limit(1);
        if (rechnungen && rechnungen.length > 0 && Array.isArray(rechnungen[0].positionen) && rechnungen[0].positionen.length > 0) {
          positionen = rechnungen[0].positionen.map((p: any) => ({
            titel: p.beschreibung || "",
            beschreibung: "",
            menge: p.menge || 1,
            einheit: p.einheit || "Stk.",
            einzelpreis: 0,
            total: 0,
          }));
        }
      }

      const datumStr = new Date().toLocaleDateString("de-CH", { day: "2-digit", month: "long", year: "numeric" });

      // Lieferschein: Sonderbereich mit Empfangsbestätigung
      const extraHtml = `
        <div style="margin-top:20px;padding-top:16px;border-top:1px solid #ddd;">
          <div style="display:flex;justify-content:space-between;gap:40px;margin-top:24px;">
            <div style="flex:1;">
              <div style="font-size:8pt;color:#999;margin-bottom:6px;">Empfangen am</div>
              <div style="border-bottom:1px solid #333;height:28px;"></div>
            </div>
            <div style="flex:1;">
              <div style="font-size:8pt;color:#999;margin-bottom:6px;">Unterschrift</div>
              <div style="border-bottom:1px solid #333;height:28px;"></div>
            </div>
          </div>
        </div>`;

      const html = await buildPdfHtml("lieferschein", {
        titel: "LIEFERSCHEIN",
        nummer: auftrag.nr || id.substring(0, 8).toUpperCase(),
        datum: datumStr,
        empfaenger: auftrag.kunde_name || auftrag.kunde || "",
        ...(() => { const s = splitAdresse(auftrag.kunde_adresse || ""); return { empfaengerStrasse: s.strasse, empfaengerPlzOrt: s.plzOrt }; })(),
        firma:        sMap.firmenname || "Schneggenburger GmbH",
        firmaAdresse: sMap.adresse    || "Hefenhoferstrasse 7",
        firmaPlzOrt:  sMap.plz_ort   || "8580 Sommeri",
        firmaTel:     sMap.telefon   || "071 411 16 87",
        firmaEmail:   sMap.email     || "info@schneggenburger.ch",
        positionen,
        subtotal: 0, mwstPct: 0, mwstBetrag: 0, total: 0,
        showTotals: false,
        extraHtml,
      });

      const pdfBuf = await renderPdfFromHtml(html);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="Lieferschein-${auftrag.nr || id}.pdf"`);
      res.send(pdfBuf);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ─── Auftragsbestätigung PDF (Vorlage aus DB) ──────────────────────────────────
  app.post("/api/auftraege/:id/auftragsbestaetigung-pdf", async (req, res) => {
    try {
      const { id } = req.params;
      const { data: auftrag, error: aErr } = await supabase.from("auftraege").select("*").eq("id", id).single();
      if (aErr || !auftrag) throw new Error("Auftrag nicht gefunden");

      const { data: settingsArr } = await supabase.from("einstellungen").select("schluessel,wert");
      const sMap: Record<string, string> = {};
      for (const s of (settingsArr || [])) sMap[s.schluessel] = s.wert;

      // Positionen aus verknüpfter Offerte oder Auftragspositionen
      let positionen: any[] = [];
      if (auftrag.offerte_id) {
        const { data: off } = await supabase.from("offerten").select("*").eq("id", auftrag.offerte_id).single();
        if (off?.positionen && Array.isArray(off.positionen)) positionen = off.positionen;
      }
      if (positionen.length === 0) {
        const { data: rechnungen } = await supabase.from("rechnungen").select("*").eq("auftrag_id", id).limit(1);
        if (rechnungen && rechnungen.length > 0 && Array.isArray(rechnungen[0].positionen)) {
          positionen = rechnungen[0].positionen;
        }
      }

      const subtotal   = positionen.reduce((s: number, p: any) => s + Number(p.total ?? (Number(p.menge||0)*Number(p.einzelpreis||0))), 0);
      const mwstPct    = 8.1;
      const mwstBetrag = subtotal * (mwstPct / 100);
      const totalInkl  = subtotal + mwstBetrag;

      const datumStr = new Date().toLocaleDateString("de-CH", { day: "2-digit", month: "long", year: "numeric" });
      const lieferDatum = auftrag.geplant_ende
        ? new Date(auftrag.geplant_ende).toLocaleDateString("de-CH", { day: "2-digit", month: "long", year: "numeric" })
        : undefined;

      const html = await buildPdfHtml("auftragsbestaetigung", {
        titel: "AUFTRAGSBESTÄTIGUNG",
        nummer: auftrag.nr || id.substring(0, 8).toUpperCase(),
        datum: datumStr,
        faelligDatum: lieferDatum,
        empfaenger: auftrag.kunde_name || auftrag.kunde || "",
        ...(() => { const s = splitAdresse(auftrag.kunde_adresse || ""); return { empfaengerStrasse: s.strasse, empfaengerPlzOrt: s.plzOrt }; })(),
        firma:        sMap.firmenname || "Schneggenburger GmbH",
        firmaAdresse: sMap.adresse    || "Hefenhoferstrasse 7",
        firmaPlzOrt:  sMap.plz_ort   || "8580 Sommeri",
        firmaTel:     sMap.telefon   || "071 411 16 87",
        firmaEmail:   sMap.email     || "info@schneggenburger.ch",
        positionen,
        subtotal, mwstPct, mwstBetrag, total: totalInkl,
        showTotals: positionen.length > 0,
        einleitung: `Wir bestätigen Ihnen hiermit den Auftrag ${auftrag.nr || ""} mit folgendem Inhalt:`,
        schluss: "Wir danken Ihnen fuer Ihren Auftrag und stehen fuer Rueckfragen gerne zur Verfuegung.\n\nFreundliche Gruesse\nSchneggenburger GmbH",
      });

      const pdfBuf = await renderPdfFromHtml(html);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="Auftragsbestaetigung-${auftrag.nr || id}.pdf"`);
      res.send(pdfBuf);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ─── Abnahmeprotokoll PDF ─────────────────────────────────────────────────────
  app.post("/api/auftraege/:id/abnahme-pdf", async (req, res) => {
    try {
      const { id } = req.params;
      const { data: auftrag, error: aErr } = await supabase.from("auftraege").select("*").eq("id", id).single();
      if (aErr || !auftrag) throw new Error("Auftrag nicht gefunden");

      const { data: garantien } = await supabase.from("garantien").select("*").eq("auftrag_id", id);

      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const fontB = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const page = pdfDoc.addPage([595.28, 841.89]);
      const { width: W, height: H } = page.getSize();

      const brown = rgb(0.42, 0.30, 0.17);
      const orange = rgb(0.91, 0.38, 0.04);
      const darkblue = rgb(0.10, 0.23, 0.42);
      const grey = rgb(0.5, 0.5, 0.5);
      const black = rgb(0, 0, 0);
      const lgrey = rgb(0.92, 0.92, 0.92);
      const mL = 40; const mR = 40;

      let logoImage: any = null;
      try {
        const logoPath = getLogoPath();
        if (fs.existsSync(logoPath)) {
          const logoBytes = fs.readFileSync(logoPath);
          logoImage = await pdfDoc.embedJpg(logoBytes);
        }
      } catch (_) {}

      if (logoImage) {
        const lDims = logoImage.scaleToFit(120, 40);
        page.drawImage(logoImage, { x: W - mR - lDims.width, y: H - 60, width: lDims.width, height: lDims.height });
      }

      page.drawText("ABNAHMEPROTOKOLL", { x: mL, y: H - 55, size: 20, font: fontB, color: darkblue });
      page.drawLine({ start: { x: mL, y: H - 65 }, end: { x: W - mR, y: H - 65 }, thickness: 1.5, color: orange });

      let y = H - 90;
      const infoItems = [
        ["Auftragsnummer", auftrag.nr || id],
        ["Kunde", auftrag.kunde || "—"],
        ["Datum", new Date().toLocaleDateString("de-CH")],
      ];
      for (const [label, val] of infoItems) {
        page.drawText(label + ":", { x: mL, y, size: 9, font, color: grey });
        page.drawText(String(val), { x: mL + 110, y, size: 9, font: fontB, color: black });
        y -= 16;
      }

      // Sections
      const sections = [
        { title: "Ausgeführte Arbeiten", lines: 5 },
        { title: "Mängel / Bemerkungen", lines: 5 },
        { title: "Garantieleistungen", lines: 4, extraContent: garantien },
      ];

      y -= 15;
      for (const sec of sections) {
        page.drawRectangle({ x: mL, y: y - 4, width: W - mL - mR, height: 16, color: darkblue });
        page.drawText(sec.title, { x: mL + 6, y, size: 10, font: fontB, color: rgb(1,1,1) });
        y -= 24;

        if (sec.extraContent && (sec.extraContent as any[]).length > 0) {
          for (const g of (sec.extraContent as any[])) {
            if (y < 120) break;
            page.drawText(`• ${(g.beschreibung || "").slice(0, 70)} (bis ${g.ablauf_datum || "??"})`, { x: mL + 4, y, size: 8.5, font, color: black });
            y -= 14;
          }
        }

        for (let i = 0; i < sec.lines; i++) {
          page.drawLine({ start: { x: mL, y }, end: { x: W - mR, y }, thickness: 0.3, color: lgrey });
          y -= 18;
        }
        y -= 8;
      }

      // Signatures
      y = 130;
      page.drawLine({ start: { x: mL, y }, end: { x: W - mR, y }, thickness: 0.5, color: grey });
      y -= 25;
      page.drawText("Auftragnehmer:", { x: mL, y, size: 9, font, color: grey });
      page.drawText("Auftraggeber:", { x: W/2 + 20, y, size: 9, font, color: grey });
      y -= 40;
      page.drawLine({ start: { x: mL, y }, end: { x: mL + 180, y }, thickness: 0.5, color: grey });
      page.drawLine({ start: { x: W/2 + 20, y }, end: { x: W/2 + 200, y }, thickness: 0.5, color: grey });
      y -= 10;
      page.drawText("Datum / Unterschrift", { x: mL, y, size: 7.5, font, color: grey });
      page.drawText("Datum / Unterschrift", { x: W/2 + 20, y, size: 7.5, font, color: grey });

      page.drawText(`Abnahmeprotokoll ${auftrag.nr || ""} – Schneggenburger GmbH`, { x: mL, y: 25, size: 7.5, font, color: grey });
      page.drawText(`Erstellt: ${new Date().toLocaleDateString("de-CH")}`, { x: W - mR - 80, y: 25, size: 7.5, font, color: grey });

      const bytes = await pdfDoc.save();
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="Abnahmeprotokoll-${auftrag.nr || id}.pdf"`);
      res.end(Buffer.from(bytes));
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ─── PDF Vorlagen ─────────────────────────────────────────────────────────────

  // GET alle Vorlagen (oder initialisiere defaults)
  app.get("/api/pdf-vorlagen", async (_req, res) => {
    try {
      const { data, error } = await supabase.from("pdf_vorlagen").select("*").order("doc_typ");
      if (error) return res.status(500).json({ message: error.message });
      
      // Falls noch keine Vorlagen existieren, defaults zurückgeben
      const docTypes = ["offerte", "rechnung", "mahnung", "lieferschein", "auftragsbestaetigung", "lohnabrechnung", "stundenabrechnung", "vorkalkulation", "nachkalkulation"];
      const defaultTexts: Record<string, { einleitung: string; schluss: string }> = {
        offerte: {
          einleitung: "Sehr geehrte Damen und Herren\n\nGerne unterbreiten wir Ihnen für die besprochenen Arbeiten folgende Offerte:",
          schluss: "Diese Offerte ist 30 Tage gültig. Wir freuen uns auf Ihren Auftrag.\n\nFreundliche Grüsse\nSchneggenburger GmbH"
        },
        rechnung: {
          einleitung: "Sehr geehrte Damen und Herren\n\nFür die ausgeführten Arbeiten erlauben wir uns, Ihnen folgenden Betrag in Rechnung zu stellen:",
          schluss: "Wir danken Ihnen für Ihren Auftrag und die termingerechte Zahlung.\n\nFreundliche Grüsse\nSchneggenburger GmbH"
        },
        mahnung: {
          einleitung: "Sehr geehrte Damen und Herren\n\nTrotz unserer Rechnung konnten wir bisher keinen Zahlungseingang feststellen. Wir bitten Sie höflich, den offenen Betrag innert 10 Tagen zu begleichen.",
          schluss: "Sollte sich Ihre Zahlung mit dieser Mahnung gekreuzt haben, betrachten Sie dieses Schreiben bitte als gegenstandslos.\n\nFreundliche Grüsse\nSchneggenburger GmbH"
        },
        lieferschein: {
          einleitung: "Sehr geehrte Damen und Herren\n\nWir liefern Ihnen folgende Positionen gemäss Auftrag:",
          schluss: "Bitte prüfen Sie die Lieferung und bestätigen Sie den Erhalt mit Ihrer Unterschrift.\n\nFreundliche Grüsse\nSchneggenburger GmbH"
        },
        auftragsbestaetigung: {
          einleitung: "Sehr geehrte Damen und Herren\n\nWir bestätigen Ihnen hiermit den erteilten Auftrag mit folgenden Positionen:",
          schluss: "Wir freuen uns auf die Zusammenarbeit und werden den Auftrag termingerecht ausführen.\n\nFreundliche Grüsse\nSchneggenburger GmbH"
        }
      };
      
      if (!data || data.length === 0) {
        // Defaults zurückgeben ohne in DB zu schreiben (Tabelle existiert vielleicht noch nicht)
        const defaults = docTypes.map(dt => ({
          id: dt,
          doc_typ: dt,
          design: "A",
          slogan: "Ihr Partner für Metallbau & Schreinerei",
          header_color: "#6b4c2a",
          footer_color: "#1a3a6b",
          logo_pos: "links",
          zahlungsfrist: dt === "mahnung" ? "10" : "30",
          mahngebuehr: "30.00",
          einleitung: defaultTexts[dt]?.einleitung || "",
          schluss: defaultTexts[dt]?.schluss || "",
          show_contact: true,
          show_page_num: true,
          logo_data_url: null,
          logo_scale: 100,
          watermark_data_url: null,
          watermark_opacity: 15,
          watermark_size: 60,
          watermark_pos: "bottom",
        }));
        return res.json(defaults);
      }
      
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // GET einzelne Vorlage by doc_typ
  app.get("/api/pdf-vorlagen/:docTyp", async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("pdf_vorlagen")
        .select("*")
        .eq("doc_typ", req.params.docTyp)
        .single();
      if (error || !data) return res.status(404).json({ message: "Nicht gefunden" });
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // PUT (upsert) Vorlage für einen doc_typ
  app.put("/api/pdf-vorlagen/:docTyp", async (req, res) => {
    try {
      const docTyp = req.params.docTyp;
      const allAllowed = ["offerte","rechnung","mahnung","lieferschein","auftragsbestaetigung","lohnabrechnung","stundenabrechnung","vorkalkulation","nachkalkulation"];
      if (!allAllowed.includes(docTyp)) return res.status(400).json({ message: `Ungültiger Dokumenttyp: ${docTyp}` });

      // Payload bereinigen (kein undefined, keine leeren Keys)
      const payload: Record<string, any> = { doc_typ: docTyp };
      for (const [k, v] of Object.entries(req.body)) {
        if (v !== undefined && k !== "id") payload[k] = v;
      }
      // updated_at nur wenn Spalte existiert (ignorieren falls nicht)
      try { payload.updated_at = new Date().toISOString(); } catch {}

      // Zuerst prüfen ob Eintrag bereits existiert
      const { data: existing } = await supabase.from("pdf_vorlagen").select("id").eq("doc_typ", docTyp).single();

      let result;
      if (existing) {
        // UPDATE
        const { data, error } = await supabase.from("pdf_vorlagen").update(payload).eq("doc_typ", docTyp).select().single();
        if (error) {
          console.error("[pdf-vorlagen PUT] update error:", error);
          return res.status(500).json({ message: error.message });
        }
        result = data;
      } else {
        // INSERT
        const { data, error } = await supabase.from("pdf_vorlagen").insert(payload).select().single();
        if (error) {
          console.error("[pdf-vorlagen PUT] insert error:", error);
          return res.status(500).json({ message: error.message });
        }
        result = data;
      }

      res.json(result);
    } catch (e) {
      console.error("[pdf-vorlagen PUT] exception:", e);
      res.status(500).json({ message: asError(e) });
    }
  });


  // ─── E-Mail Versand ───────────────────────────────────────────────────────────
  app.post("/api/email/send", async (req, res) => {
    try {
      const { to, subject, body, type, refId } = req.body;
      // SMTP-Config aus Key-Value-Tabelle laden (schluessel/wert)
      const { data: einstellungenArr } = await supabase.from("einstellungen").select("schluessel,wert");
      const sm: Record<string, string> = {};
      for (const e of (einstellungenArr || [])) sm[e.schluessel] = e.wert;

      const smtpHost = sm.smtp_host || "";
      const smtpPort = Number(sm.smtp_port) || 587;
      const smtpUser = sm.smtp_user || "";
      const smtpPass = sm.smtp_passwort || sm.smtp_pass || "";
      const smtpFrom = sm.smtp_von || sm.smtp_from || smtpUser || sm.email || "info@schneggenburger.ch";
      const smtpSsl  = sm.smtp_ssl || "starttls";

      if (!smtpHost || !smtpUser || !smtpPass) {
        return res.json({ ok: false, message: "SMTP nicht konfiguriert. Bitte in Einstellungen > E-Mail ausfüllen (Host, Benutzer, Passwort)." });
      }

      try {
        const nodemailer = await import("nodemailer");
        const secure = smtpSsl === "ssl" || smtpPort === 465;
        const transporter = nodemailer.default.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure,
          auth: { user: smtpUser, pass: smtpPass },
          tls: secure ? undefined : { ciphers: "SSLv3" },
        });
        await transporter.sendMail({
          from: `"${sm.firmenname || "AuftragsPro"}" <${smtpFrom}>`,
          to,
          subject,
          text: body,
          html: body ? `<div style="font-family:Arial,sans-serif;font-size:11pt;line-height:1.6;">${body.replace(/\n/g,"<br/>")}</div>` : undefined,
        });
        res.json({ ok: true, message: "E-Mail gesendet an " + to });
      } catch (nmErr: any) {
        console.error("SMTP Fehler:", nmErr.message);
        res.json({ ok: false, message: "SMTP-Fehler: " + (nmErr.message || "Verbindung fehlgeschlagen") });
      }
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });



  // ─── OFFERTE → AUFTRAG WORKFLOW ───────────────────────────────────────────────
  app.post("/api/offerten/:id/zu-auftrag", async (req, res) => {
    try {
      const { data: offerte, error: oErr } = await supabase
        .from("offerten")
        .select("*")
        .eq("id", req.params.id)
        .single();
      if (oErr || !offerte) return res.status(404).json({ message: "Offerte nicht gefunden" });

      // Bestehenden Auftrag laden für Nummernvergabe
      const { data: auftraege } = await supabase.from("auftraege").select("nr");
      const nr = nextNr("A", auftraege || []);

      const { data: neuerAuftrag, error: aErr } = await supabase.from("auftraege").insert({
        id: uid(),
        nr,
        titel: offerte.projekt_beschreibung || `Auftrag aus Offerte ${offerte.nr}`,
        kunde: offerte.empfaenger_name || "",
        status: "bestaetigt",
        prioritaet: "mittel",
        beschreibung: `Automatisch erstellt aus Offerte ${offerte.nr}`,
        adresse: [offerte.empfaenger_strasse, offerte.empfaenger_plz].filter(Boolean).join(", "),
        created_at: new Date().toISOString(),
      }).select().single();

      if (aErr) return res.status(500).json({ message: aErr.message });

      // Offerte mit Auftrag verknüpfen
      await supabase.from("offerten").update({ auftrag_id: neuerAuftrag.id, status: "angenommen" }).eq("id", req.params.id);

      res.json(neuerAuftrag);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ─── TAGESRAPPORTE ────────────────────────────────────────────────────────────
  app.get("/api/tagesrapporte", async (req, res) => {
    try {
      const { data, error } = await supabase.from("tagesrapporte").select("*").order("datum", { ascending: false });
      if (error) return res.status(500).json({ message: error.message });
      res.json(data || []);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.post("/api/tagesrapporte", async (req, res) => {
    try {
      const { data, error } = await supabase.from("tagesrapporte").insert({ ...req.body, id: uid() }).select().single();
      if (error) return res.status(500).json({ message: error.message });
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.delete("/api/tagesrapporte/:id", async (req, res) => {
    try {
      const { error } = await supabase.from("tagesrapporte").delete().eq("id", req.params.id);
      if (error) return res.status(500).json({ message: error.message });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ─── LAGERVERWALTUNG ──────────────────────────────────────────────────────────
  app.get("/api/lager", async (req, res) => {
    try {
      const { data, error } = await supabase.from("lager_artikel").select("*").order("bezeichnung");
      if (error) return res.status(500).json({ message: error.message });
      res.json(data || []);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.post("/api/lager", async (req, res) => {
    try {
      const { data, error } = await supabase.from("lager_artikel").insert({ ...req.body, id: uid() }).select().single();
      if (error) return res.status(500).json({ message: error.message });
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.put("/api/lager/:id", async (req, res) => {
    try {
      const { data, error } = await supabase.from("lager_artikel").update(req.body).eq("id", req.params.id).select().single();
      if (error) return res.status(500).json({ message: error.message });
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.delete("/api/lager/:id", async (req, res) => {
    try {
      const { error } = await supabase.from("lager_artikel").delete().eq("id", req.params.id);
      if (error) return res.status(500).json({ message: error.message });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.post("/api/lager/:id/buchung", async (req, res) => {
    try {
      const { typ, menge } = req.body;
      const { data: art } = await supabase.from("lager_artikel").select("bestand").eq("id", req.params.id).single();
      if (!art) return res.status(404).json({ message: "Artikel nicht gefunden" });
      const neuerBestand = typ === "eingang"
        ? Number(art.bestand) + Number(menge)
        : Math.max(0, Number(art.bestand) - Number(menge));
      const { data, error } = await supabase.from("lager_artikel").update({ bestand: neuerBestand }).eq("id", req.params.id).select().single();
      if (error) return res.status(500).json({ message: error.message });
      // Log buchung
      await supabase.from("lager_buchungen").insert({ id: uid(), artikel_id: req.params.id, typ, menge: Number(menge), notiz: req.body.notiz || null, bestand_nach: neuerBestand });
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ─── REKLAMATIONEN ────────────────────────────────────────────────────────────
  app.get("/api/reklamationen", async (req, res) => {
    try {
      const { data, error } = await supabase.from("reklamationen").select("*").order("gemeldet_am", { ascending: false });
      if (error) return res.status(500).json({ message: error.message });
      res.json(data || []);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.post("/api/reklamationen", async (req, res) => {
    try {
      const { data, error } = await supabase.from("reklamationen").insert({ ...req.body, id: uid() }).select().single();
      if (error) return res.status(500).json({ message: error.message });
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.put("/api/reklamationen/:id", async (req, res) => {
    try {
      const { data, error } = await supabase.from("reklamationen").update(req.body).eq("id", req.params.id).select().single();
      if (error) return res.status(500).json({ message: error.message });
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.delete("/api/reklamationen/:id", async (req, res) => {
    try {
      const { error } = await supabase.from("reklamationen").delete().eq("id", req.params.id);
      if (error) return res.status(500).json({ message: error.message });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ─── SUBUNTERNEHMER ───────────────────────────────────────────────────────────
  app.get("/api/subunternehmer", async (req, res) => {
    try {
      const { data, error } = await supabase.from("subunternehmer").select("*").order("firma");
      if (error) return res.status(500).json({ message: error.message });
      res.json(data || []);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.post("/api/subunternehmer", async (req, res) => {
    try {
      const { data, error } = await supabase.from("subunternehmer").insert({ ...req.body, id: uid() }).select().single();
      if (error) return res.status(500).json({ message: error.message });
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.put("/api/subunternehmer/:id", async (req, res) => {
    try {
      const { data, error } = await supabase.from("subunternehmer").update(req.body).eq("id", req.params.id).select().single();
      if (error) return res.status(500).json({ message: error.message });
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.delete("/api/subunternehmer/:id", async (req, res) => {
    try {
      const { error } = await supabase.from("subunternehmer").delete().eq("id", req.params.id);
      if (error) return res.status(500).json({ message: error.message });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ─── LIEFERTERMINE ────────────────────────────────────────────────────────────
  app.get("/api/liefertermine", async (req, res) => {
    try {
      const auftrag_id = req.query.auftrag_id as string | undefined;
      let q = supabase.from("liefertermine").select("*").order("erwartet_am");
      if (auftrag_id) q = q.eq("auftrag_id", auftrag_id);
      const { data, error } = await q;
      if (error) return res.status(500).json({ message: error.message });
      res.json(data || []);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.post("/api/liefertermine", async (req, res) => {
    try {
      const { data, error } = await supabase.from("liefertermine").insert({ ...req.body, id: uid() }).select().single();
      if (error) return res.status(500).json({ message: error.message });
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.put("/api/liefertermine/:id", async (req, res) => {
    try {
      const { data, error } = await supabase.from("liefertermine").update(req.body).eq("id", req.params.id).select().single();
      if (error) return res.status(500).json({ message: error.message });
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.delete("/api/liefertermine/:id", async (req, res) => {
    try {
      const { error } = await supabase.from("liefertermine").delete().eq("id", req.params.id);
      if (error) return res.status(500).json({ message: error.message });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ─── FIBU-EXPORT ──────────────────────────────────────────────────────────────
  app.get("/api/export/fibu", async (req, res) => {
    try {
      const { von, bis, typ } = req.query as any;
      let lines: string[] = [];
      if (!typ || typ === "ausgangsrechnungen") {
        let q = supabase.from("rechnungen").select("*").order("datum");
        if (von) q = q.gte("datum", von);
        if (bis) q = q.lte("datum", bis);
        const { data: rechnungen } = await q;
        lines.push("Typ;Nummer;Datum;Faellig;Empfaenger;Betrag_exkl;MWST_Betrag;Betrag_inkl;Bezahlt_am;Status");
        for (const r of (rechnungen || [])) {
          const exkl = (Number(r.betrag) / 1.081).toFixed(2);
          const mwst = (Number(r.betrag) - Number(exkl)).toFixed(2);
          lines.push(`Ausgangsrechnung;${r.nr || ""};${r.datum || ""};${r.faellig_datum || ""};${(r.empfaenger_name || "").replace(/;/g, " ")};${exkl};${mwst};${Number(r.betrag).toFixed(2)};${r.bezahlt_am || ""};${r.bezahlt_am ? "Bezahlt" : "Offen"}`);
        }
      }
      if (!typ || typ === "eingangsrechnungen") {
        let q2 = supabase.from("eingangsrechnungen").select("*").order("datum");
        if (von) q2 = q2.gte("datum", von);
        if (bis) q2 = q2.lte("datum", bis);
        const { data: eingang } = await q2;
        if (!typ) lines.push(""); // Leerzeile Trennung
        lines.push("Typ;Nummer;Datum;Faellig;Lieferant;Betrag_exkl;MWST_Betrag;Betrag_inkl;Status");
        for (const e of (eingang || [])) {
          const exkl = (Number(e.betrag) / 1.081).toFixed(2);
          const mwst = (Number(e.betrag) - Number(exkl)).toFixed(2);
          lines.push(`Eingangsrechnung;${e.nr || ""};${e.datum || ""};${e.faellig_datum || ""};${(e.lieferant || "").replace(/;/g, " ")};${exkl};${mwst};${Number(e.betrag).toFixed(2)};${e.status || "offen"}`);
        }
      }
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `inline; filename="FIBU-Export-${new Date().toISOString().slice(0,10)}.csv"`);
      res.send("\uFEFF" + lines.join("\r\n")); // BOM for Excel
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ─── PROJEKTSTATUS (public) ───────────────────────────────────────────────────
  app.get("/api/public/auftrag/:token", async (req, res) => {
    try {
      const { data, error } = await supabase.from("auftraege")
        .select("nr,titel,status,beschreibung,start_datum,end_datum,public_token")
        .eq("public_token", req.params.token)
        .single();
      if (error || !data) return res.status(404).json({ message: "Nicht gefunden" });
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.post("/api/auftraege/:id/generate-token", async (req, res) => {
    try {
      const token = uid() + uid();
      const { data, error } = await supabase.from("auftraege").update({ public_token: token }).eq("id", req.params.id).select("public_token").single();
      if (error) return res.status(500).json({ message: error.message });
      res.json({ token: data.public_token });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.delete("/api/auftraege/:id/generate-token", async (req, res) => {
    try {
      await supabase.from("auftraege").update({ public_token: null }).eq("id", req.params.id);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });


  return httpServer;
}
