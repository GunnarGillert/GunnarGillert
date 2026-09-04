// ============================================================================
// Energiewerk – lokaler Server (Prototyp)
// BAFA-Förderprozessverwaltung für Fensterbauer-Kunden (Maler Luft).
// Läuft komplett lokal, Datenordner soll später auf SharePoint/OneDrive
// liegen (DATA_DIR) - Aufbau bewusst analog zu Parkwerk.
//
// Prototyp-Stand: Startseite (Kennzahlen), Auftrags-, Kunden- und
// Fensterbauerverwaltung mit Suche/Filter, Unterlagen-Upload am Vorgang mit
// automatischer Erkennung (Dateiname, bei Bedarf PDF-Textebene/OCR + KI-
// Vorschlag). Login, Mailversand, PDF/E-Rechnung und der eigenständige
// Eingangs-Ordner-Watcher aus der Skizze (Energiewerk/README.md) sind hier
// noch NICHT umgesetzt.
// ============================================================================

require("dotenv").config();
const express = require("express");
// Patcht express.Router (siehe unten app.get/post/patch), damit ein Fehler
// in einem async-Routen-Handler automatisch bei der Fehler-Middleware
// landet, statt die Anfrage lautlos haengen zu lassen - Express 4 tut das
// von sich aus NICHT (anders als Express 5). Muss nach express, aber vor
// den Routen-Definitionen eingebunden werden.
require("express-async-errors");
const multer = require("multer");
const { PDFParse } = require("pdf-parse");
const { createWorker } = require("tesseract.js");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const crypto = require("crypto");

const app = express();

// Server steht evtl. hinter einem Reverse Proxy (Caddy/nginx für HTTPS) -
// dann muss die echte Client-IP korrekt erkannt werden. TRUST_PROXY=1 in
// der .env setzen, falls genutzt (siehe Caddyfile.beispiel).
if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);

app.use(express.json({ limit: "5mb" }));

// Protokolliert jede Anfrage (Methode, Pfad, Status, Dauer) in debug.log -
// damit sich ein gemeldetes Problem nachvollziehen lässt, ohne dass jemand
// die Browser-Entwicklerkonsole öffnen oder den Netzwerk-Tab mitschneiden
// muss. Läuft VOR den Routen, protokolliert aber erst nach der Antwort
// (über den "finish"-Event), damit Status und Dauer feststehen.
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    debugLog("request", `${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - start}ms)`);
  });
  next();
});

const PORT = process.env.PORT || 4000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "Energiewerk-Daten");

const COLLECTIONS_DIR = path.join(DATA_DIR, "collections");
const FENSTERBAUER_DIR = path.join(COLLECTIONS_DIR, "fensterbauer");
const KUNDEN_DIR = path.join(COLLECTIONS_DIR, "kunden");
const VORGAENGE_DIR = path.join(COLLECTIONS_DIR, "vorgaenge");
const DOKUMENTE_DIR = path.join(COLLECTIONS_DIR, "dokumente");
const LOGS_DIR = path.join(DATA_DIR, "logs");
const DEBUG_LOG_PATH = path.join(LOGS_DIR, "debug.log");
const SETTINGS_PATH = path.join(DATA_DIR, "settings.json");
const MERKBLATT_DIR = path.join(DATA_DIR, "merkblatt");
const MERKBLATT_DATEI = path.join(MERKBLATT_DIR, "merkblatt.pdf");

for (const dir of [DATA_DIR, COLLECTIONS_DIR, FENSTERBAUER_DIR, KUNDEN_DIR, VORGAENGE_DIR, DOKUMENTE_DIR, LOGS_DIR, MERKBLATT_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

// tesseract.js wirft einen Netzwerkfehler beim (Nach-)Laden der
// Sprachdaten standardmäßig unbehandelt (asynchron außerhalb der
// umgebenden Promise) - ohne dieses Sicherheitsnetz würde ein einzelner
// OCR-Versuch ohne Internetzugriff den ganzen Server abschießen. Selbes
// Problem und derselbe Fix wie bei Parkwerk.
process.on("uncaughtException", (fehler) => {
  console.error("Unerwarteter Fehler (Server läuft weiter):", fehler);
  debugLog("uncaughtException", fehler.stack || fehler.message);
});
process.on("unhandledRejection", (fehler) => {
  console.error("Unerwartete abgelehnte Promise (Server läuft weiter):", fehler);
  debugLog("unhandledRejection", fehler?.stack || fehler?.message || String(fehler));
});

function debugLog(bereich, nachricht) {
  const zeile = `${new Date().toISOString()} [${bereich}] ${nachricht}`;
  console.log(zeile);
  fs.appendFile(DEBUG_LOG_PATH, zeile + "\n", () => {});
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ----------------------------------------------------------------------------
// Datei-basierte Collections (wie bei Parkwerk: ein JSON pro Datensatz)
// ----------------------------------------------------------------------------
async function leseAlle(dir) {
  const dateien = (await fsp.readdir(dir)).filter((d) => d.endsWith(".json"));
  const eintraege = await Promise.all(
    dateien.map(async (datei) => JSON.parse(await fsp.readFile(path.join(dir, datei), "utf8")))
  );
  return eintraege;
}

async function leseEins(dir, id) {
  try {
    return JSON.parse(await fsp.readFile(path.join(dir, `${id}.json`), "utf8"));
  } catch {
    return null;
  }
}

async function schreibe(dir, id, eintrag) {
  await fsp.writeFile(path.join(dir, `${id}.json`), JSON.stringify(eintrag, null, 2));
  return eintrag;
}

async function loesche(dir, id) {
  try {
    await fsp.unlink(path.join(dir, `${id}.json`));
  } catch (fehler) {
    if (fehler.code !== "ENOENT") throw fehler;
  }
}

function leereEinstellungen() {
  return {
    naechsteFallnummer: 1,
    fallnummernPraefix: "EW",
    anthropicApiKey: "",
    smtp: { host: "smtp.strato.de", port: 465, verschluesselung: "ssl", benutzername: "", absenderName: "", absenderEmail: "" },
    github: { owner: "GunnarGillert", repo: "Maler_Luft", branch: "" },
    githubToken: "",
  };
}

async function leseEinstellungen() {
  try {
    return JSON.parse(await fsp.readFile(SETTINGS_PATH, "utf8"));
  } catch {
    return leereEinstellungen();
  }
}

async function schreibeEinstellungen(einstellungen) {
  await fsp.writeFile(SETTINGS_PATH, JSON.stringify(einstellungen, null, 2));
}

// Blendet Secrets aus, bevor Einstellungen an den Client gehen - der Client
// erfährt nur, OB ein Wert hinterlegt ist (für die Anzeige "(hinterlegt)"),
// nie den Wert selbst. Wie bei Parkwerk.
function maskiereEinstellungen(einstellungen) {
  const { anthropicApiKey, githubToken, ...rest } = einstellungen;
  const smtp = einstellungen.smtp || {};
  const github = einstellungen.github || {};
  return {
    ...rest,
    fallnummernPraefix: einstellungen.fallnummernPraefix || "EW",
    naechsteFallnummer: einstellungen.naechsteFallnummer || 1,
    anthropicApiKeyGesetzt: Boolean(anthropicApiKey || process.env.ANTHROPIC_API_KEY),
    smtp: {
      host: smtp.host || "smtp.strato.de",
      port: smtp.port || 465,
      verschluesselung: smtp.verschluesselung || "ssl",
      benutzername: smtp.benutzername || "",
      absenderName: smtp.absenderName || "",
      absenderEmail: smtp.absenderEmail || "",
    },
    github: {
      owner: github.owner || "GunnarGillert",
      repo: github.repo || "Maler_Luft",
      branch: github.branch || "",
    },
    githubTokenGesetzt: Boolean(githubToken || process.env.GITHUB_TOKEN),
  };
}

function formatDatumDe(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("de-DE");
}

async function naechsteVorgangsnummer() {
  const einstellungen = await leseEinstellungen();
  const jahr = new Date().getFullYear();
  const nummer = einstellungen.naechsteFallnummer || 1;
  einstellungen.naechsteFallnummer = nummer + 1;
  await schreibeEinstellungen(einstellungen);
  return `${einstellungen.fallnummernPraefix || "EW"}-${jahr}-${String(nummer).padStart(5, "0")}`;
}

// ----------------------------------------------------------------------------
// Abgeleitete Flags (nicht gespeichert, wie bei Parkwerks "Zahlung
// überfällig" - aus Frist + heutigem Datum berechnet)
// ----------------------------------------------------------------------------
const ABGESCHLOSSENE_STATI = new Set(["verwendungsnachweis_eingereicht", "festgesetzt", "abgeschlossen", "abgelehnt", "storniert"]);

function mitFlags(vorgang) {
  const heute = new Date().toISOString().slice(0, 10);
  const verwendungsnachweisUeberfaellig = Boolean(
    vorgang.verwendungsnachweisFrist &&
    vorgang.verwendungsnachweisFrist < heute &&
    !ABGESCHLOSSENE_STATI.has(vorgang.status)
  );
  const zahlungUeberfaellig = Boolean(
    vorgang.rechnung &&
    vorgang.rechnung.faelligkeitsdatum &&
    vorgang.rechnung.faelligkeitsdatum < heute &&
    vorgang.rechnung.zahlungsstatus !== "bezahlt" &&
    vorgang.status !== "storniert" &&
    vorgang.status !== "abgelehnt"
  );
  return { ...vorgang, verwendungsnachweisUeberfaellig, zahlungUeberfaellig };
}

// ----------------------------------------------------------------------------
// Suche (einfacher In-Memory-Filter, wie bei Parkwerk - keine Datenbank nötig)
// ----------------------------------------------------------------------------
function enthaeltText(werte, suchtext) {
  const q = suchtext.trim().toLowerCase();
  if (!q) return true;
  return werte.some((wert) => String(wert || "").toLowerCase().includes(q));
}

// ----------------------------------------------------------------------------
// Automatische Dokumenttyp-Erkennung beim Upload (Namenskonvention aus
// README.md: "<Dokumenttyp>_<VorgangsID>_<Datum>.pdf" - hier bewusst als
// Schlüsselwort-Suche im gesamten Dateinamen umgesetzt, nicht nur als
// striktes Präfix, damit auch abweichend benannte Scans (z. B. vom
// Scanner vergebene Namen) noch erkannt werden. Reihenfolge ist wichtig:
// spezifischere Begriffe (z. B. "zuwendungsbescheid") müssen vor
// allgemeineren ("bescheid") geprüft werden.
// ----------------------------------------------------------------------------
const DOKUMENTTYPEN = [
  "Angebot", "Antrag", "Vollmacht", "U-Wert-Nachweis", "Bescheid", "Rechnung",
  "Zahlungsnachweis", "Verwendungsnachweis", "Festsetzungsbescheid", "Sonstiges",
];

const ERKENNUNGS_REIHENFOLGE = [
  ["zuwendungsbescheid", "Bescheid"],
  ["festsetzungsbescheid", "Festsetzungsbescheid"],
  ["verwendungsnachweis", "Verwendungsnachweis"],
  ["zahlungsnachweis", "Zahlungsnachweis"],
  ["u-wert-nachweis", "U-Wert-Nachweis"],
  ["u-wertnachweis", "U-Wert-Nachweis"],
  ["uwert-nachweis", "U-Wert-Nachweis"],
  ["uwertnachweis", "U-Wert-Nachweis"],
  ["u_wert_nachweis", "U-Wert-Nachweis"],
  ["projektbeschreibung", "Antrag"],
  ["vollmacht", "Vollmacht"],
  ["angebot", "Angebot"],
  ["antrag", "Antrag"],
  ["bescheid", "Bescheid"],
  ["rechnung", "Rechnung"],
];

function erkenneDokumenttyp(dateiname) {
  const name = dateiname.toLowerCase();
  for (const [schluesselwort, typ] of ERKENNUNGS_REIHENFOLGE) {
    if (name.includes(schluesselwort)) return typ;
  }
  return null;
}

function sichererDateiname(dateiname) {
  return dateiname.replace(/[^A-Za-z0-9._äöüÄÖÜß -]/g, "_");
}

function mitZeitlimit(promise, ms, fehlermeldung) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(fehlermeldung)), ms)),
  ]);
}

// ----------------------------------------------------------------------------
// Textauszug aus der hochgeladenen Datei - für Dateien, deren Typ sich
// nicht schon am Dateinamen erkennen ließ, als Grundlage für den
// KI-Vorschlag. Reihenfolge wie bei Parkwerks Kundenantworten-Texterkennung:
// bei PDFs zuerst die eingebettete Textebene (funktioniert ohne
// Internetzugang), erst bei Bildern direkt OCR. Eine reine Scan-PDF ohne
// Textebene wird in diesem Prototyp NICHT zusätzlich gerastert/per OCR
// gelesen (siehe "Bekannte Grenzen" in der README) - das bräuchte eine
// zusätzliche PDF-Rasterisierung, die hier bewusst ausgespart wurde.
// ----------------------------------------------------------------------------
async function extrahiereText(buffer, dateiname) {
  const nameKlein = dateiname.toLowerCase();
  if (nameKlein.endsWith(".pdf")) {
    const parser = new PDFParse({ data: buffer });
    try {
      const ergebnis = await parser.getText();
      const text = (ergebnis.text || "").replace(/^--\s*\d+\s*of\s*\d+\s*--$/gm, "").trim();
      if (text.length > 20) return { text: text.slice(0, 4000), fehler: null };
      return { text: "", fehler: "Kein Text in der PDF-Textebene gefunden (vermutlich reiner Scan ohne OCR-Rasterisierung in diesem Prototyp)." };
    } catch (fehler) {
      debugLog("ocr", `PDF-Textebene konnte nicht gelesen werden: ${fehler.message}`);
      return { text: "", fehler: `PDF konnte nicht gelesen werden: ${fehler.message}` };
    } finally {
      await parser.destroy().catch(() => {});
    }
  }
  if (/\.(jpe?g|png)$/i.test(nameKlein)) {
    let worker;
    try {
      // Feste Zeitgrenze zusätzlich zum globalen Sicherheitsnetz oben:
      // tesseract.js meldet einen fehlenden Internetzugriff beim
      // Sprachdaten-Download teils nicht als normale Promise-Ablehnung,
      // sondern als unbehandeltes Worker-Event - ohne Zeitlimit würde die
      // Anfrage sonst unbegrenzt hängen bleiben.
      worker = await mitZeitlimit(createWorker("deu"), 15000, "Zeitlimit beim Initialisieren der Texterkennung überschritten.");
      const { data } = await mitZeitlimit(worker.recognize(buffer), 30000, "Zeitlimit bei der Texterkennung überschritten.");
      return { text: (data.text || "").trim().slice(0, 4000), fehler: null };
    } catch (fehler) {
      debugLog("ocr", `OCR fehlgeschlagen (evtl. kein Internetzugriff für Sprachdaten): ${fehler.message}`);
      return { text: "", fehler: `Texterkennung (OCR) fehlgeschlagen (evtl. kein Internetzugriff für Sprachdaten): ${fehler.message}` };
    } finally {
      if (worker) await worker.terminate().catch(() => {});
    }
  }
  return { text: "", fehler: "Für diesen Dateityp gibt es in diesem Prototyp keine Texterkennung." };
}

async function fetchMitZeitlimit(url, optionen, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...optionen, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ----------------------------------------------------------------------------
// KI-Vorschlag für den Dokumenttyp, wenn die Dateinamen-Erkennung nichts
// gefunden hat - wie bei Parkwerks KI-Textvorschlag ausschließlich
// serverseitig über die Anthropic-API, der Key verlässt den Server nie.
// ----------------------------------------------------------------------------
async function holeKiVorschlag(text, dateiname) {
  const einstellungen = await leseEinstellungen();
  const apiKey = einstellungen.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { typ: null, begruendung: null, fehler: "Kein Claude-API-Key hinterlegt (Einstellungen bzw. ANTHROPIC_API_KEY)." };
  if (!text) return { typ: null, begruendung: null, fehler: "Kein Text aus der Datei extrahierbar." };

  try {
    const antwort = await fetchMitZeitlimit("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 300,
        messages: [{
          role: "user",
          content: `Dateiname: "${dateiname}"\n\nTextauszug aus der Datei:\n"""\n${text}\n"""\n\n` +
            `Welcher der folgenden Dokumenttypen passt am besten: ${DOKUMENTTYPEN.join(", ")}? ` +
            `Antworte AUSSCHLIESSLICH mit einem JSON-Objekt der Form ` +
            `{"typ": "einer der genannten Dokumenttypen", "begruendung": "ein Satz"} ohne weiteren Text.`,
        }],
      }),
    }, 20000);

    if (!antwort.ok) {
      return { typ: null, begruendung: null, fehler: `Claude-API antwortete mit HTTP ${antwort.status}.` };
    }
    const daten = await antwort.json();
    const rohtext = daten.content?.[0]?.text || "";
    const treffer = rohtext.match(/\{[\s\S]*\}/);
    if (!treffer) return { typ: null, begruendung: null, fehler: "Antwort der KI enthielt kein auswertbares JSON." };

    const geparst = JSON.parse(treffer[0]);
    if (!DOKUMENTTYPEN.includes(geparst.typ)) {
      return { typ: null, begruendung: geparst.begruendung || null, fehler: "KI schlug einen nicht vorgesehenen Dokumenttyp vor." };
    }
    return { typ: geparst.typ, begruendung: geparst.begruendung || "", fehler: null };
  } catch (fehler) {
    return { typ: null, begruendung: null, fehler: `KI-Anfrage fehlgeschlagen: ${fehler.message}` };
  }
}

// ----------------------------------------------------------------------------
// U-Wert-Prüfung: Angebots-Text gegen das hinterlegte Merkblatt (KfW) prüfen.
// Ergebnis wird IMMER am Vorgang gespeichert (auch wenn die Prüfung nicht
// möglich war) - das ist der Compliance-Nachweis, kein reines UI-Feedback.
// ----------------------------------------------------------------------------
async function holeUWertPruefung(angebotText, merkblattText) {
  const einstellungen = await leseEinstellungen();
  const apiKey = einstellungen.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ergebnis: "nicht_moeglich", begruendung: null, gefundeneUWerte: [], fehler: "Kein Claude-API-Key hinterlegt (Einstellungen bzw. ANTHROPIC_API_KEY)." };
  if (!merkblattText) return { ergebnis: "nicht_moeglich", begruendung: null, gefundeneUWerte: [], fehler: "Kein Merkblatt in den Einstellungen hinterlegt." };
  if (!angebotText) return { ergebnis: "nicht_moeglich", begruendung: null, gefundeneUWerte: [], fehler: "Kein Text aus dem Angebot extrahierbar." };

  try {
    const antwort = await fetchMitZeitlimit("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 500,
        messages: [{
          role: "user",
          content: `Merkblatt (Referenz für zulässige U-Werte):\n"""\n${merkblattText}\n"""\n\n` +
            `Angebot (zu prüfen):\n"""\n${angebotText}\n"""\n\n` +
            `Prüfe, ob die im Angebot genannten U-Werte der Fenster die im Merkblatt genannten ` +
            `Anforderungen einhalten. Antworte AUSSCHLIESSLICH mit einem JSON-Objekt der Form ` +
            `{"ergebnis": "konform" | "nicht_konform" | "unsicher", "gefundeneUWerte": ["..."], ` +
            `"begruendung": "ein bis zwei Sätze"} ohne weiteren Text. Nutze "unsicher", wenn sich im ` +
            `Angebot keine eindeutigen U-Werte finden lassen.`,
        }],
      }),
    }, 30000);

    if (!antwort.ok) {
      return { ergebnis: "nicht_moeglich", begruendung: null, gefundeneUWerte: [], fehler: `Claude-API antwortete mit HTTP ${antwort.status}.` };
    }
    const daten = await antwort.json();
    const rohtext = daten.content?.[0]?.text || "";
    const treffer = rohtext.match(/\{[\s\S]*\}/);
    if (!treffer) return { ergebnis: "nicht_moeglich", begruendung: null, gefundeneUWerte: [], fehler: "Antwort der KI enthielt kein auswertbares JSON." };

    const geparst = JSON.parse(treffer[0]);
    if (!["konform", "nicht_konform", "unsicher"].includes(geparst.ergebnis)) {
      return { ergebnis: "nicht_moeglich", begruendung: geparst.begruendung || null, gefundeneUWerte: [], fehler: "KI lieferte kein auswertbares Ergebnis." };
    }
    return {
      ergebnis: geparst.ergebnis,
      begruendung: geparst.begruendung || "",
      gefundeneUWerte: Array.isArray(geparst.gefundeneUWerte) ? geparst.gefundeneUWerte : [],
      fehler: null,
    };
  } catch (fehler) {
    return { ergebnis: "nicht_moeglich", begruendung: null, gefundeneUWerte: [], fehler: `KI-Anfrage fehlgeschlagen: ${fehler.message}` };
  }
}

// Liest den Angebots-Text aus der bereits gespeicherten Datei (nicht mehr
// aus dem Upload-Buffer, damit dieselbe Funktion auch beim NACHTRÄGLICHEN
// manuellen Zuordnen eines Dokuments zu "Angebot" greift) und führt die
// U-Wert-Prüfung durch. Ergebnis + Historieneintrag werden direkt am
// übergebenen Vorgangs-Objekt gesetzt; Aufrufer ist für das Speichern
// (schreibe(...)) verantwortlich.
async function fuehreUWertPruefungDurch(v, dokument) {
  const heute = new Date().toISOString().slice(0, 10);
  const einstellungen = await leseEinstellungen();
  const merkblattText = einstellungen.merkblatt?.text || null;

  let angebotText = "";
  let extraktionsFehler = null;
  try {
    const buffer = await fsp.readFile(path.join(DOKUMENTE_DIR, v.id, dokument.gespeicherterDateiname));
    const ergebnis = await extrahiereText(buffer, dokument.dateiname);
    angebotText = ergebnis.text;
    extraktionsFehler = ergebnis.fehler;
  } catch (fehler) {
    extraktionsFehler = `Angebot konnte nicht gelesen werden: ${fehler.message}`;
  }

  const pruefung = angebotText || merkblattText
    ? await holeUWertPruefung(angebotText, merkblattText)
    : { ergebnis: "nicht_moeglich", begruendung: null, gefundeneUWerte: [], fehler: extraktionsFehler || "Kein Merkblatt hinterlegt." };

  v.uWertPruefung = {
    ergebnis: pruefung.ergebnis,
    begruendung: pruefung.begruendung,
    gefundeneUWerte: pruefung.gefundeneUWerte,
    fehler: pruefung.fehler || (!angebotText ? extraktionsFehler : null),
    dokumentId: dokument.id,
    geprueftAm: heute,
  };

  let zusammenfassung;
  if (pruefung.ergebnis === "nicht_moeglich") {
    zusammenfassung = `U-Wert-Prüfung für "${dokument.dateiname}" nicht möglich: ${v.uWertPruefung.fehler || "unbekannter Grund"}`;
  } else {
    // Ausführlicher als nur das Ergebnis, damit sich der Verlauf einer
    // Prüfung (z. B. bei einem später ersetzten Angebot) allein aus der
    // Historie nachvollziehen lässt - die "U-Wert-Prüfung"-Box am Vorgang
    // zeigt ja immer nur den zuletzt gespeicherten Stand.
    const einzelheiten = [`Ergebnis "${pruefung.ergebnis}"`];
    if (pruefung.gefundeneUWerte.length === 1) {
      einzelheiten.push(`gefundener U-Wert: ${pruefung.gefundeneUWerte[0]}`);
    } else if (pruefung.gefundeneUWerte.length > 1) {
      const aufzaehlung = pruefung.gefundeneUWerte.map((wert, i) => `${i + 1}. ${wert}`).join("; ");
      einzelheiten.push(`gefundene U-Werte: ${aufzaehlung}`);
    }
    if (pruefung.begruendung) {
      einzelheiten.push(`Begründung: ${pruefung.begruendung}`);
    }
    zusammenfassung = `U-Wert-Prüfung für "${dokument.dateiname}" automatisch durchgeführt: ${einzelheiten.join(" – ")}`;
  }
  v.historie.push({ wer: "System", was: zusammenfassung, wann: heute });
}

// ----------------------------------------------------------------------------
// Beispieldaten (nur beim allerersten Start, wenn noch nichts angelegt ist -
// damit sich der Prototyp sofort ausprobieren lässt)
// ----------------------------------------------------------------------------
async function seedFallsLeer() {
  const vorhandeneFensterbauer = await leseAlle(FENSTERBAUER_DIR);
  if (vorhandeneFensterbauer.length > 0) return;

  const fensterbauer = [
    { id: crypto.randomUUID(), vorname: "Thomas", nachname: "Weber", firma: "Fenster Weber GmbH", strasse: "Industriestraße 8", plz: "63654", ort: "Büdingen", telefon: "06042 88012", email: "buero@fenster-weber.example", bemerkungen: "", kuerzel: "WEB", aktiv: true },
    { id: crypto.randomUUID(), vorname: "Sabine", nachname: "Schmidt", firma: "Schmidt Fensterbau", strasse: "Gewerbering 3", plz: "63667", ort: "Nidda", telefon: "06043 99021", email: "info@schmidt-fensterbau.example", bemerkungen: "", kuerzel: "SCH", aktiv: true },
    { id: crypto.randomUUID(), vorname: "Frank", nachname: "Krause", firma: "Hessen-Fenster Krause", strasse: "Am Steinbruch 15", plz: "63636", ort: "Brachttal", telefon: "06054 71234", email: "kontakt@hessen-fenster-krause.example", bemerkungen: "Bevorzugt Rückrufe nach 14 Uhr.", kuerzel: "KRA", aktiv: true },
  ];
  for (const f of fensterbauer) await schreibe(FENSTERBAUER_DIR, f.id, f);

  const kunden = [
    { id: crypto.randomUUID(), vorname: "Anna", nachname: "Becker", firma: "", strasse: "Marktstraße 4", plz: "63654", ort: "Büdingen", telefon: "06042 1234", email: "anna.becker@example.com", bemerkungen: "", fensterbauerId: fensterbauer[0].id },
    { id: crypto.randomUUID(), vorname: "Jürgen", nachname: "Hoffmann", firma: "", strasse: "Am Bahnhof 12", plz: "63667", ort: "Nidda", telefon: "06043 5678", email: "j.hoffmann@example.com", bemerkungen: "Ist tagsüber schlecht erreichbar, lieber abends anrufen.", fensterbauerId: fensterbauer[1].id },
    { id: crypto.randomUUID(), vorname: "Petra", nachname: "Schulz", firma: "Schulz Immobilien", strasse: "Ringstraße 9", plz: "63636", ort: "Brachttal", telefon: "06054 4321", email: "p.schulz@example.com", bemerkungen: "", fensterbauerId: fensterbauer[2].id },
    { id: crypto.randomUUID(), vorname: "Michael", nachname: "Vogt", firma: "", strasse: "Hauptstraße 51", plz: "63654", ort: "Büdingen", telefon: "06042 9876", email: "m.vogt@example.com", bemerkungen: "", fensterbauerId: fensterbauer[0].id },
  ];
  for (const k of kunden) await schreibe(KUNDEN_DIR, k.id, k);

  const heute = new Date();
  const vorTagen = (n) => new Date(heute.getTime() - n * 86400000).toISOString().slice(0, 10);
  const inTagen = (n) => new Date(heute.getTime() + n * 86400000).toISOString().slice(0, 10);

  const vorgaenge = [
    {
      id: "EW-2026-00001", bafaVorgangsId: "BAFA-778812", kundeId: kunden[0].id, fensterbauerId: fensterbauer[0].id,
      status: "in_umsetzung",
      uWertPruefung: { ergebnis: "konform", geprueftAm: vorTagen(40) },
      bescheid: { betrag: 3200, datum: vorTagen(35) },
      rechnung: { betrag: 3200, faelligkeitsdatum: vorTagen(5), zahlungsstatus: "offen" },
      verwendungsnachweisFrist: inTagen(60),
      dokumente: [],
      historie: [{ wer: "System", was: "Vorgang angelegt", wann: vorTagen(50) }],
    },
    {
      id: "EW-2026-00002", bafaVorgangsId: "BAFA-779034", kundeId: kunden[1].id, fensterbauerId: fensterbauer[1].id,
      status: "verwendungsnachweis_faellig",
      uWertPruefung: { ergebnis: "konform", geprueftAm: vorTagen(90) },
      bescheid: { betrag: 5100, datum: vorTagen(85) },
      rechnung: { betrag: 5100, faelligkeitsdatum: vorTagen(60), zahlungsstatus: "bezahlt" },
      verwendungsnachweisFrist: vorTagen(3),
      dokumente: [],
      historie: [{ wer: "System", was: "Vorgang angelegt", wann: vorTagen(100) }],
    },
    {
      id: "EW-2026-00003", bafaVorgangsId: "", kundeId: kunden[2].id, fensterbauerId: fensterbauer[2].id,
      status: "u_wert_geprueft",
      uWertPruefung: { ergebnis: "konform", geprueftAm: vorTagen(2) },
      bescheid: null,
      rechnung: null,
      verwendungsnachweisFrist: null,
      dokumente: [],
      historie: [{ wer: "System", was: "Vorgang angelegt", wann: vorTagen(4) }],
    },
    {
      id: "EW-2026-00004", bafaVorgangsId: "BAFA-780112", kundeId: kunden[3].id, fensterbauerId: fensterbauer[0].id,
      status: "abgeschlossen",
      uWertPruefung: { ergebnis: "konform", geprueftAm: vorTagen(200) },
      bescheid: { betrag: 4400, datum: vorTagen(190) },
      rechnung: { betrag: 4400, faelligkeitsdatum: vorTagen(170), zahlungsstatus: "bezahlt" },
      verwendungsnachweisFrist: vorTagen(90),
      dokumente: [],
      historie: [{ wer: "System", was: "Vorgang angelegt", wann: vorTagen(210) }],
    },
  ];
  for (const v of vorgaenge) await schreibe(VORGAENGE_DIR, v.id, v);

  // Ohne diese Zeile würde der erste ECHT angelegte Vorgang wieder bei
  // "EW-2026-00001" beginnen (Standardwert aus leereEinstellungen()) und
  // damit den gleichnamigen Beispiel-Vorgang oben stillschweigend
  // überschreiben (schreibe() legt Dateien pro ID an, keine Warnung bei
  // Kollision). Deshalb den Zähler auf die nächste freie Nummer setzen.
  const einstellungen = await leseEinstellungen();
  einstellungen.naechsteFallnummer = vorgaenge.length + 1;
  await schreibeEinstellungen(einstellungen);
}

// ----------------------------------------------------------------------------
// API: Fensterbauer
// ----------------------------------------------------------------------------
app.get("/api/fensterbauer", async (req, res) => {
  const q = String(req.query.q || "");
  const alle = await leseAlle(FENSTERBAUER_DIR);
  const gefiltert = alle.filter((f) =>
    enthaeltText([f.firma, f.vorname, f.nachname, f.kuerzel, f.email, f.ort], q)
  );
  gefiltert.sort((a, b) => a.firma.localeCompare(b.firma));
  res.json(gefiltert);
});

app.get("/api/fensterbauer/:id", async (req, res) => {
  const f = await leseEins(FENSTERBAUER_DIR, req.params.id);
  if (!f) return res.status(404).json({ fehler: "Fensterbauer nicht gefunden." });
  const kunden = (await leseAlle(KUNDEN_DIR)).filter((k) => k.fensterbauerId === f.id);
  const vorgaenge = (await leseAlle(VORGAENGE_DIR)).filter((v) => v.fensterbauerId === f.id).map(mitFlags);
  res.json({ ...f, kunden, vorgaenge });
});

app.post("/api/fensterbauer", async (req, res) => {
  const { vorname, nachname, firma, strasse, plz, ort, telefon, email, bemerkungen, kuerzel } = req.body;
  if (!firma || !kuerzel) return res.status(400).json({ fehler: "Firma und Kürzel sind Pflichtfelder." });
  const f = {
    id: crypto.randomUUID(), vorname: vorname || "", nachname: nachname || "", firma,
    strasse: strasse || "", plz: plz || "", ort: ort || "", telefon: telefon || "", email: email || "",
    bemerkungen: bemerkungen || "", kuerzel, aktiv: true,
  };
  await schreibe(FENSTERBAUER_DIR, f.id, f);
  res.status(201).json(f);
});

app.patch("/api/fensterbauer/:id", async (req, res) => {
  const f = await leseEins(FENSTERBAUER_DIR, req.params.id);
  if (!f) return res.status(404).json({ fehler: "Fensterbauer nicht gefunden." });
  const { vorname, nachname, firma, kuerzel, strasse, plz, ort, telefon, email, bemerkungen, aktiv } = req.body;
  if (firma !== undefined && !firma) return res.status(400).json({ fehler: "Firma darf nicht leer sein." });
  if (kuerzel !== undefined && !kuerzel) return res.status(400).json({ fehler: "Kürzel darf nicht leer sein." });
  if (firma !== undefined) f.firma = firma;
  if (kuerzel !== undefined) f.kuerzel = kuerzel;
  if (vorname !== undefined) f.vorname = vorname;
  if (nachname !== undefined) f.nachname = nachname;
  if (strasse !== undefined) f.strasse = strasse;
  if (plz !== undefined) f.plz = plz;
  if (ort !== undefined) f.ort = ort;
  if (telefon !== undefined) f.telefon = telefon;
  if (email !== undefined) f.email = email;
  if (bemerkungen !== undefined) f.bemerkungen = bemerkungen;
  if (aktiv !== undefined) f.aktiv = Boolean(aktiv);
  await schreibe(FENSTERBAUER_DIR, f.id, f);
  res.json(f);
});

app.delete("/api/fensterbauer/:id", async (req, res) => {
  const f = await leseEins(FENSTERBAUER_DIR, req.params.id);
  if (!f) return res.status(404).json({ fehler: "Fensterbauer nicht gefunden." });
  const hatKunden = (await leseAlle(KUNDEN_DIR)).some((k) => k.fensterbauerId === f.id);
  if (hatKunden) {
    return res.status(400).json({ fehler: "Fensterbauer hat noch zugeordnete Kunden - diese zuerst löschen oder einem anderen Fensterbauer zuordnen." });
  }
  const hatVorgaenge = (await leseAlle(VORGAENGE_DIR)).some((v) => v.fensterbauerId === f.id);
  if (hatVorgaenge) {
    return res.status(400).json({ fehler: "Fensterbauer hat noch zugeordnete Vorgänge - diese zuerst löschen." });
  }
  await loesche(FENSTERBAUER_DIR, f.id);
  res.status(204).end();
});

// ----------------------------------------------------------------------------
// API: Kunden
// ----------------------------------------------------------------------------
app.get("/api/kunden", async (req, res) => {
  const q = String(req.query.q || "");
  const alle = await leseAlle(KUNDEN_DIR);
  const fensterbauerListe = await leseAlle(FENSTERBAUER_DIR);
  const fensterbauerNachId = Object.fromEntries(fensterbauerListe.map((f) => [f.id, f]));
  const angereichert = alle.map((k) => ({ ...k, fensterbauerName: fensterbauerNachId[k.fensterbauerId]?.firma || "" }));
  const gefiltert = angereichert.filter((k) =>
    enthaeltText([k.vorname, k.nachname, k.firma, k.email, k.ort, k.fensterbauerName], q)
  );
  gefiltert.sort((a, b) => a.nachname.localeCompare(b.nachname));
  res.json(gefiltert);
});

app.get("/api/kunden/:id", async (req, res) => {
  const k = await leseEins(KUNDEN_DIR, req.params.id);
  if (!k) return res.status(404).json({ fehler: "Kunde nicht gefunden." });
  const vorgaenge = (await leseAlle(VORGAENGE_DIR)).filter((v) => v.kundeId === k.id).map(mitFlags);
  res.json({ ...k, vorgaenge });
});

app.post("/api/kunden", async (req, res) => {
  const { vorname, nachname, firma, strasse, plz, ort, telefon, email, bemerkungen, fensterbauerId } = req.body;
  if (!nachname || !fensterbauerId) {
    return res.status(400).json({ fehler: "Nachname und Fensterbauer sind Pflichtfelder." });
  }
  const k = {
    id: crypto.randomUUID(), vorname: vorname || "", nachname, firma: firma || "",
    strasse: strasse || "", plz: plz || "", ort: ort || "", telefon: telefon || "", email: email || "",
    bemerkungen: bemerkungen || "", fensterbauerId,
  };
  await schreibe(KUNDEN_DIR, k.id, k);
  res.status(201).json(k);
});

app.patch("/api/kunden/:id", async (req, res) => {
  const k = await leseEins(KUNDEN_DIR, req.params.id);
  if (!k) return res.status(404).json({ fehler: "Kunde nicht gefunden." });
  const { vorname, nachname, firma, strasse, plz, ort, telefon, email, bemerkungen, fensterbauerId } = req.body;
  if (nachname !== undefined && !nachname) return res.status(400).json({ fehler: "Nachname darf nicht leer sein." });
  if (fensterbauerId !== undefined && !fensterbauerId) return res.status(400).json({ fehler: "Fensterbauer darf nicht leer sein." });
  if (vorname !== undefined) k.vorname = vorname;
  if (nachname !== undefined) k.nachname = nachname;
  if (firma !== undefined) k.firma = firma;
  if (strasse !== undefined) k.strasse = strasse;
  if (plz !== undefined) k.plz = plz;
  if (ort !== undefined) k.ort = ort;
  if (telefon !== undefined) k.telefon = telefon;
  if (email !== undefined) k.email = email;
  if (bemerkungen !== undefined) k.bemerkungen = bemerkungen;
  if (fensterbauerId !== undefined) k.fensterbauerId = fensterbauerId;
  await schreibe(KUNDEN_DIR, k.id, k);
  res.json(k);
});

app.delete("/api/kunden/:id", async (req, res) => {
  const k = await leseEins(KUNDEN_DIR, req.params.id);
  if (!k) return res.status(404).json({ fehler: "Kunde nicht gefunden." });
  const hatVorgaenge = (await leseAlle(VORGAENGE_DIR)).some((v) => v.kundeId === k.id);
  if (hatVorgaenge) {
    return res.status(400).json({ fehler: "Kunde hat noch zugeordnete Vorgänge - diese zuerst löschen." });
  }
  await loesche(KUNDEN_DIR, k.id);
  res.status(204).end();
});

// ----------------------------------------------------------------------------
// API: Vorgänge (Aufträge)
// ----------------------------------------------------------------------------
app.get("/api/vorgaenge", async (req, res) => {
  const q = String(req.query.q || "");
  const status = String(req.query.status || "");
  const nurVnUeberfaellig = req.query.verwendungsnachweisUeberfaellig === "1";
  const nurZahlungUeberfaellig = req.query.zahlungUeberfaellig === "1";

  const [alle, kundenListe, fensterbauerListe] = await Promise.all([
    leseAlle(VORGAENGE_DIR), leseAlle(KUNDEN_DIR), leseAlle(FENSTERBAUER_DIR),
  ]);
  const kundeNachId = Object.fromEntries(kundenListe.map((k) => [k.id, k]));
  const fensterbauerNachId = Object.fromEntries(fensterbauerListe.map((f) => [f.id, f]));

  let angereichert = alle.map((v) => {
    const kunde = kundeNachId[v.kundeId];
    const fensterbauer = fensterbauerNachId[v.fensterbauerId];
    return mitFlags({
      ...v,
      kundeName: kunde ? `${kunde.vorname} ${kunde.nachname}`.trim() : "",
      fensterbauerName: fensterbauer ? fensterbauer.firma : "",
    });
  });

  if (status) angereichert = angereichert.filter((v) => v.status === status);
  if (nurVnUeberfaellig) angereichert = angereichert.filter((v) => v.verwendungsnachweisUeberfaellig);
  if (nurZahlungUeberfaellig) angereichert = angereichert.filter((v) => v.zahlungUeberfaellig);
  angereichert = angereichert.filter((v) =>
    enthaeltText([v.id, v.bafaVorgangsId, v.kundeName, v.fensterbauerName], q)
  );
  angereichert.sort((a, b) => b.id.localeCompare(a.id));
  res.json(angereichert);
});

app.get("/api/vorgaenge/:id", async (req, res) => {
  const v = await leseEins(VORGAENGE_DIR, req.params.id);
  if (!v) return res.status(404).json({ fehler: "Vorgang nicht gefunden." });
  const kunde = await leseEins(KUNDEN_DIR, v.kundeId);
  const fensterbauer = await leseEins(FENSTERBAUER_DIR, v.fensterbauerId);
  res.json({ ...mitFlags(v), kunde, fensterbauer });
});

app.post("/api/vorgaenge", async (req, res) => {
  const { kundeId, fensterbauerId, bafaVorgangsId } = req.body;
  if (!kundeId || !fensterbauerId) {
    return res.status(400).json({ fehler: "Kunde und Fensterbauer sind Pflichtfelder." });
  }
  const id = await naechsteVorgangsnummer();
  const v = {
    id, bafaVorgangsId: bafaVorgangsId || "", kundeId, fensterbauerId, status: "eingang",
    uWertPruefung: null, bescheid: null, rechnung: null, verwendungsnachweisFrist: null,
    dokumente: [],
    historie: [{ wer: "Sachbearbeiter", was: "Vorgang angelegt", wann: new Date().toISOString().slice(0, 10) }],
  };
  await schreibe(VORGAENGE_DIR, v.id, v);
  res.status(201).json(v);
});

app.patch("/api/vorgaenge/:id", async (req, res) => {
  const v = await leseEins(VORGAENGE_DIR, req.params.id);
  if (!v) return res.status(404).json({ fehler: "Vorgang nicht gefunden." });
  const { status, zahlungsstatus, bafaVorgangsId } = req.body;
  const heute = new Date().toISOString().slice(0, 10);
  if (status && status !== v.status) {
    v.status = status;
    v.historie.push({ wer: "Sachbearbeiter", was: `Status geändert zu "${status}"`, wann: heute });
  }
  if (zahlungsstatus && v.rechnung) {
    v.rechnung.zahlungsstatus = zahlungsstatus;
    v.historie.push({ wer: "Sachbearbeiter", was: `Zahlungsstatus geändert zu "${zahlungsstatus}"`, wann: heute });
  }
  if (bafaVorgangsId !== undefined && bafaVorgangsId !== v.bafaVorgangsId) {
    v.bafaVorgangsId = bafaVorgangsId;
    v.historie.push({ wer: "Sachbearbeiter", was: `BAFA-Vorgangs-ID geändert zu "${bafaVorgangsId || "–"}"`, wann: heute });
  }
  await schreibe(VORGAENGE_DIR, v.id, v);
  res.json(mitFlags(v));
});

app.delete("/api/vorgaenge/:id", async (req, res) => {
  const v = await leseEins(VORGAENGE_DIR, req.params.id);
  if (!v) return res.status(404).json({ fehler: "Vorgang nicht gefunden." });
  await loesche(VORGAENGE_DIR, v.id);
  await fsp.rm(path.join(DOKUMENTE_DIR, v.id), { recursive: true, force: true });
  res.status(204).end();
});

// ----------------------------------------------------------------------------
// API: Unterlagen-Upload am Vorgang - automatische Erkennung des
// Dokumenttyps aus dem Dateinamen (s. erkenneDokumenttyp oben), Ablage
// unter collections/dokumente/<VorgangsID>/. Wird der Typ nicht erkannt,
// landet das Dokument trotzdem im Vorgang (Typ "unbekannt") und muss über
// PATCH .../dokumente/:dokumentId manuell zugeordnet werden - analog zu
// Parkwerks Import-Diagnose ("klar anzeigen statt stillschweigend
// ignorieren", siehe README.md).
// ----------------------------------------------------------------------------
app.post("/api/vorgaenge/:id/dokumente", upload.single("datei"), async (req, res) => {
  const v = await leseEins(VORGAENGE_DIR, req.params.id);
  if (!v) return res.status(404).json({ fehler: "Vorgang nicht gefunden." });
  if (!req.file) return res.status(400).json({ fehler: "Keine Datei empfangen." });

  const dokumentId = crypto.randomUUID();
  const heute = new Date().toISOString().slice(0, 10);
  const erkannterTyp = erkenneDokumenttyp(req.file.originalname);
  const gespeicherterDateiname = `${dokumentId}_${sichererDateiname(req.file.originalname)}`;
  const zielOrdner = path.join(DOKUMENTE_DIR, v.id);

  await fsp.mkdir(zielOrdner, { recursive: true });
  await fsp.writeFile(path.join(zielOrdner, gespeicherterDateiname), req.file.buffer);

  // Dateiname allein reicht nicht zur Erkennung -> Text extrahieren
  // (PDF-Textebene bzw. OCR bei Bildern) und einen KI-Vorschlag einholen.
  // Läuft bewusst NACH dem Speichern der Datei, damit ein langsamer/
  // fehlschlagender KI-Aufruf den eigentlichen Upload nicht verhindert.
  let kiVorschlag = null;
  if (!erkannterTyp) {
    const { text, fehler: extraktionsFehler } = await extrahiereText(req.file.buffer, req.file.originalname);
    kiVorschlag = text
      ? await holeKiVorschlag(text, req.file.originalname)
      : { typ: null, begruendung: null, fehler: extraktionsFehler };
  }

  const dokument = {
    id: dokumentId,
    dateiname: req.file.originalname,
    gespeicherterDateiname,
    typ: erkannterTyp || "unbekannt",
    groesse: req.file.size,
    hochgeladenAm: heute,
    kiVorschlag,
  };
  v.dokumente = v.dokumente || [];
  v.dokumente.push(dokument);

  let historieText;
  if (erkannterTyp) {
    historieText = `Dokument "${req.file.originalname}" hochgeladen (automatisch erkannt als "${erkannterTyp}")`;
  } else if (kiVorschlag?.typ) {
    historieText = `Dokument "${req.file.originalname}" hochgeladen (Dateiname nicht erkannt, KI schlägt anhand des Inhalts "${kiVorschlag.typ}" vor)`;
  } else {
    historieText = `Dokument "${req.file.originalname}" hochgeladen (Typ nicht erkannt, kein KI-Vorschlag möglich: ${kiVorschlag?.fehler || "unbekannter Grund"}) - manuelle Zuordnung nötig`;
  }
  v.historie.push({ wer: "Sachbearbeiter", was: historieText, wann: heute });

  // Automatischer U-Wert-Abgleich, sobald ein Dokument als "Angebot"
  // eingeht - läuft NACH dem Upload-Historieneintrag, damit die
  // Reihenfolge in der Historie nachvollziehbar bleibt.
  if (dokument.typ === "Angebot") {
    await fuehreUWertPruefungDurch(v, dokument);
  }

  await schreibe(VORGAENGE_DIR, v.id, v);
  res.status(201).json(mitFlags(v));
});

app.patch("/api/vorgaenge/:id/dokumente/:dokumentId", async (req, res) => {
  const v = await leseEins(VORGAENGE_DIR, req.params.id);
  if (!v) return res.status(404).json({ fehler: "Vorgang nicht gefunden." });
  const dokument = (v.dokumente || []).find((d) => d.id === req.params.dokumentId);
  if (!dokument) return res.status(404).json({ fehler: "Dokument nicht gefunden." });
  const { typ } = req.body;
  if (!DOKUMENTTYPEN.includes(typ)) return res.status(400).json({ fehler: "Unbekannter Dokumenttyp." });

  const heute = new Date().toISOString().slice(0, 10);
  const warVorherAngebot = dokument.typ === "Angebot";
  dokument.typ = typ;
  v.historie.push({
    wer: "Sachbearbeiter",
    was: `Dokumenttyp von "${dokument.dateiname}" manuell auf "${typ}" gesetzt`,
    wann: heute,
  });

  // Wurde ein Dokument nachträglich (z. B. nach KI-Vorschlag) als
  // "Angebot" bestätigt, läuft der U-Wert-Abgleich jetzt nach - nicht
  // erneut, falls es schon vorher "Angebot" war und nur umbenannt wurde.
  if (typ === "Angebot" && !warVorherAngebot) {
    await fuehreUWertPruefungDurch(v, dokument);
  }

  await schreibe(VORGAENGE_DIR, v.id, v);
  res.json(mitFlags(v));
});

app.get("/api/vorgaenge/:id/dokumente/:dokumentId/datei", async (req, res) => {
  const v = await leseEins(VORGAENGE_DIR, req.params.id);
  if (!v) return res.status(404).json({ fehler: "Vorgang nicht gefunden." });
  const dokument = (v.dokumente || []).find((d) => d.id === req.params.dokumentId);
  if (!dokument) return res.status(404).json({ fehler: "Dokument nicht gefunden." });
  res.download(path.join(DOKUMENTE_DIR, v.id, dokument.gespeicherterDateiname), dokument.dateiname);
});

app.get("/api/dokumenttypen", (req, res) => res.json(DOKUMENTTYPEN));

// ----------------------------------------------------------------------------
// API: Einstellungen - Claude-API, Auftragsnummer, SMTP, GitHub-Update
// ----------------------------------------------------------------------------
app.get("/api/einstellungen", async (req, res) => {
  const einstellungen = await leseEinstellungen();
  res.json(maskiereEinstellungen(einstellungen));
});

app.post("/api/einstellungen", async (req, res) => {
  // Leere Platzhalter für maskierte Secrets nicht versehentlich über die
  // echten, bereits gespeicherten Werte schreiben ("unverändert lassen" in
  // der Oberfläche - wie bei Parkwerk).
  const eingabe = { ...req.body };
  if (!eingabe.anthropicApiKey) delete eingabe.anthropicApiKey;
  if (!eingabe.githubToken) delete eingabe.githubToken;

  const einstellungen = await leseEinstellungen();
  const neu = { ...einstellungen, ...eingabe };
  if (eingabe.smtp) neu.smtp = { ...einstellungen.smtp, ...eingabe.smtp };
  if (eingabe.github) neu.github = { ...einstellungen.github, ...eingabe.github };
  await schreibeEinstellungen(neu);
  debugLog("einstellungen", `Einstellungen aktualisiert: ${Object.keys(eingabe).join(", ")}`);
  res.json(maskiereEinstellungen(neu));
});

app.post("/api/einstellungen/verbindung-testen", async (req, res) => {
  const einstellungen = await leseEinstellungen();
  const apiKey = einstellungen.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.json({ ok: false, meldung: "Kein API-Key hinterlegt." });
  try {
    const antwort = await fetchMitZeitlimit("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 8, messages: [{ role: "user", content: "Hallo" }] }),
    }, 20000);
    res.json({ ok: antwort.ok, meldung: antwort.ok ? "Verbindung erfolgreich." : `Fehler: HTTP ${antwort.status}` });
  } catch (fehler) {
    res.json({ ok: false, meldung: fehler.message });
  }
});

// Zeigt nur an, ob eine neuere Version vorliegt - installiert NICHTS
// automatisch (wie bei Parkwerk: ein automatischer Selbst-Update während
// des Betriebs wäre riskant, solange mehrere Personen gleichzeitig
// arbeiten - die tatsächliche Installation bleibt bewusst manuell über
// Update.bat).
async function leseInstallierteVersion() {
  try {
    const daten = JSON.parse(await fsp.readFile(path.join(__dirname, "version-info.json"), "utf8"));
    return daten.commitSha ? { commit: daten.commitSha.slice(0, 7), branch: daten.branch, installiertAm: daten.installiertAm } : null;
  } catch {
    return null;
  }
}

app.get("/api/update/pruefen", async (req, res) => {
  const installierteVersion = await leseInstallierteVersion();
  try {
    const einstellungen = await leseEinstellungen();
    const { owner, repo, branch } = einstellungen.github || {};
    // Bei einem privaten Repo antwortet GitHub auf unauthentifizierte
    // Anfragen bewusst mit 404 statt 403 (verrät die Existenz privater
    // Repos nicht) - das Token muss deshalb tatsächlich mitgeschickt
    // werden. .env (GITHUB_TOKEN) hat Vorrang vor dem in den Einstellungen
    // gespeicherten Token.
    const token = process.env.GITHUB_TOKEN || einstellungen.githubToken;
    const headers = {
      "User-Agent": "Energiewerk",
      Accept: "application/vnd.github+json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    const zweig = branch || (await (async () => {
      const antwort = await fetchMitZeitlimit(`https://api.github.com/repos/${owner}/${repo}`, { headers }, 15000);
      if (!antwort.ok) throw new Error(`Repository nicht erreichbar (HTTP ${antwort.status})`);
      return (await antwort.json()).default_branch;
    })());

    const commitAntwort = await fetchMitZeitlimit(`https://api.github.com/repos/${owner}/${repo}/commits/${zweig}`, { headers }, 15000);
    if (!commitAntwort.ok) throw new Error(`Commit-Abfrage fehlgeschlagen (HTTP ${commitAntwort.status})`);
    const commitDaten = await commitAntwort.json();
    const aktuellerCommit = commitDaten.sha;
    const commitDatum = commitDaten.commit?.committer?.date;

    if (!installierteVersion) {
      return res.json({
        statusBekannt: false,
        installierteVersion: null,
        neuesteVersion: { commit: aktuellerCommit.slice(0, 7), datum: commitDatum },
        hinweis: "Die aktuell installierte Version ist nicht bekannt (vermutlich eine Erstinstallation ohne " +
          "Update.ps1). Neuester Stand auf GitHub: Commit " + aktuellerCommit.slice(0, 7) + " vom " +
          formatDatumDe(commitDatum) + ". Bei Unsicherheit: Update.bat ausführen, das installiert immer den " +
          "aktuellen Stand.",
      });
    }

    if (aktuellerCommit.startsWith(installierteVersion.commit)) {
      return res.json({ statusBekannt: true, installierteVersion, neueVersionVerfuegbar: false, hinweis: "Energiewerk ist bereits auf dem neuesten Stand." });
    }

    res.json({
      statusBekannt: true,
      neueVersionVerfuegbar: true,
      neuesteVersion: { commit: aktuellerCommit.slice(0, 7), datum: commitDatum },
      installierteVersion,
      hinweis: `Eine neuere Version ist verfügbar (Commit ${aktuellerCommit.slice(0, 7)} vom ${formatDatumDe(commitDatum)}). ` +
        "Bitte Update.bat manuell als Administrator ausführen, um zu aktualisieren.",
    });
  } catch (fehler) {
    // Bewusst HTTP 200 (statt 500): der GitHub-Abgleich ist fehlgeschlagen,
    // aber installierteVersion ist rein lokal ermittelt und bleibt gültig.
    res.json({ statusBekannt: Boolean(installierteVersion), installierteVersion, fehler: fehler.message });
  }
});

// ----------------------------------------------------------------------------
// API: Einstellungen - Merkblatt (KfW) für die U-Wert-Prüfung
// ----------------------------------------------------------------------------
app.get("/api/einstellungen/merkblatt", async (req, res) => {
  const einstellungen = await leseEinstellungen();
  if (!einstellungen.merkblatt) return res.json(null);
  const { dateiname, hochgeladenAm, groesse } = einstellungen.merkblatt;
  res.json({ dateiname, hochgeladenAm, groesse });
});

app.post("/api/einstellungen/merkblatt", upload.single("datei"), async (req, res) => {
  if (!req.file) return res.status(400).json({ fehler: "Keine Datei empfangen." });
  if (!req.file.originalname.toLowerCase().endsWith(".pdf")) {
    return res.status(400).json({ fehler: "Das Merkblatt muss ein PDF sein." });
  }

  const { text, fehler: extraktionsFehler } = await extrahiereText(req.file.buffer, req.file.originalname);
  if (!text) {
    return res.status(400).json({
      fehler: `PDF konnte nicht gelesen werden - vermutlich ein reiner Scan ohne Textebene (${extraktionsFehler || "kein Text gefunden"}). ` +
        `Bitte eine durchsuchbare PDF-Version des Merkblatts hochladen.`,
    });
  }

  await fsp.writeFile(MERKBLATT_DATEI, req.file.buffer);
  const einstellungen = await leseEinstellungen();
  einstellungen.merkblatt = {
    dateiname: req.file.originalname,
    hochgeladenAm: new Date().toISOString().slice(0, 10),
    groesse: req.file.size,
    text,
  };
  await schreibeEinstellungen(einstellungen);
  debugLog("einstellungen", `Merkblatt aktualisiert: "${req.file.originalname}" (${req.file.size} Bytes)`);
  res.status(201).json({ dateiname: einstellungen.merkblatt.dateiname, hochgeladenAm: einstellungen.merkblatt.hochgeladenAm, groesse: einstellungen.merkblatt.groesse });
});

app.get("/api/einstellungen/merkblatt/datei", async (req, res) => {
  const einstellungen = await leseEinstellungen();
  if (!einstellungen.merkblatt) return res.status(404).json({ fehler: "Kein Merkblatt hinterlegt." });
  res.download(MERKBLATT_DATEI, einstellungen.merkblatt.dateiname);
});

// ----------------------------------------------------------------------------
// API: Startseite / Dashboard
// ----------------------------------------------------------------------------
app.get("/api/dashboard", async (req, res) => {
  const alle = (await leseAlle(VORGAENGE_DIR)).map(mitFlags);
  const jeStatus = {};
  for (const v of alle) jeStatus[v.status] = (jeStatus[v.status] || 0) + 1;
  res.json({
    gesamt: alle.length,
    jeStatus,
    verwendungsnachweisUeberfaellig: alle.filter((v) => v.verwendungsnachweisUeberfaellig).length,
    zahlungUeberfaellig: alle.filter((v) => v.zahlungUeberfaellig).length,
    letzteAktivitaeten: alle
      .flatMap((v) => v.historie.map((h) => ({ ...h, vorgangId: v.id })))
      .sort((a, b) => b.wann.localeCompare(a.wann))
      .slice(0, 8),
  });
});

// Zentrale Fehler-Middleware - fängt sowohl synchrone Fehler als auch
// (dank express-async-errors oben) Fehler aus async-Routen-Handlern ab.
// Ohne diese Middleware würde ein unerwarteter Fehler in einer Route nur
// Express' generische HTML-Fehlerseite ohne jedes Protokoll erzeugen -
// genau die Art von "stille Anfrage, keine Erklärung", die zuletzt beim
// Windows-Test schon beim Start selbst für Verwirrung gesorgt hat.
app.use((fehler, req, res, next) => {
  if (fehler instanceof multer.MulterError) {
    return res.status(400).json({ fehler: `Upload fehlgeschlagen: ${fehler.message}` });
  }
  debugLog("fehler", `${req.method} ${req.originalUrl} -> ${fehler.stack || fehler.message}`);
  if (res.headersSent) return next(fehler);
  res.status(500).json({ fehler: "Interner Serverfehler. Details stehen im Protokoll (logs/debug.log)." });
});

// ----------------------------------------------------------------------------
// Statische Oberfläche
// ----------------------------------------------------------------------------
app.use(express.static(path.join(__dirname, "public"), {
  setHeaders(res, dateipfad) {
    if (dateipfad.endsWith("bundle.js") || dateipfad.endsWith("index.html")) {
      res.setHeader("Cache-Control", "no-cache");
    }
  },
}));

// HTTPS lässt sich auf zwei Arten einrichten (wie bei Parkwerk/Farbwerk):
//  - HTTPS_CERT_PATH/HTTPS_KEY_PATH (PEM-Dateien) - typisch bei einem
//    "echten", auf einen Domainnamen ausgestellten Zertifikat (z. B. von
//    Let's Encrypt/certbot).
//  - HTTPS_PFX_PATH/HTTPS_PFX_PASSPHRASE (eine .pfx-Datei) - wird von
//    Install.ps1 automatisch erzeugt, wenn bei der Installation "HTTPS-
//    Zertifikat jetzt erstellen?" mit Ja beantwortet wird.
// Ohne eine der beiden läuft der Server per HTTP - dann sollte ein Reverse
// Proxy wie Caddy davor für HTTPS sorgen (siehe Caddyfile.beispiel).
let httpsOptionen = null;
if (process.env.HTTPS_CERT_PATH && process.env.HTTPS_KEY_PATH) {
  httpsOptionen = {
    cert: fs.readFileSync(process.env.HTTPS_CERT_PATH),
    key: fs.readFileSync(process.env.HTTPS_KEY_PATH),
  };
} else if (process.env.HTTPS_PFX_PATH) {
  httpsOptionen = {
    pfx: fs.readFileSync(process.env.HTTPS_PFX_PATH),
    passphrase: process.env.HTTPS_PFX_PASSPHRASE || "",
  };
}

// Zusätzlicher, unverschlüsselter HTTP-Port neben HTTPS: Der Server läuft
// nur im internen LAN, das selbstsignierte Zertifikat lässt sich aber nicht
// auf jedem Client-Rechner vorab als vertrauenswürdig einrichten - über
// HTTP_PORT (Standard 80) kommt man dann testweise/ausnahmsweise auch ganz
// ohne Zertifikatswarnung drauf (z. B. http://energiewerk/ statt
// https://energiewerk/). Nur relevant, wenn HTTPS überhaupt aktiv ist -
// ohne HTTPS läuft der Server ohnehin schon unverschlüsselt auf PORT.
// Über HTTP_PORT=0 (oder leer) in der .env abschaltbar.
const HTTP_PORT = process.env.HTTP_PORT !== undefined ? process.env.HTTP_PORT.trim() : "80";

// Gibt bei "listen EADDRINUSE"/"listen EACCES" eine konkrete, auf Windows
// zugeschnittene Handlungsanweisung aus statt nur den rohen Node-Fehler -
// das war beim ersten echten Windows-Test genau die Stelle, an der
// Energiewerk kommentarlos mit Exit-Code 1 abgebrochen ist (Start.ps1
// protokollierte bis dahin nur "Exit-Code 1", ohne die eigentliche
// Fehlermeldung - siehe Start.ps1 für den zugehörigen Logging-Fix).
function behandleListenFehler(fehler) {
  if (fehler.code === "EADDRINUSE") {
    console.error(`\nFEHLER: Port ${PORT} ist bereits belegt.`);
    console.error(`Ein anderes Programm nutzt Port ${PORT} bereits (z. B. IIS, ein anderer`);
    console.error(`lokaler Webserver, oder eine zweite Energiewerk-Instanz).`);
    console.error(`Prüfen mit: netstat -ano | findstr :${PORT}`);
    console.error(`Alternativ in der .env einen anderen Port eintragen (z. B. PORT=4020).\n`);
  } else if (fehler.code === "EACCES") {
    console.error(`\nFEHLER: Keine Berechtigung für Port ${PORT}.`);
    console.error(`Prüfen, ob der Port reserviert ist: netsh http show urlacl`);
    console.error(`bzw.: netsh int ipv4 show excludedportrange protocol=tcp`);
    console.error(`Alternativ in der .env einen anderen Port eintragen (z. B. PORT=4020).\n`);
  } else {
    console.error(`\nFEHLER beim Starten des Servers: ${fehler.message}\n`);
  }
  process.exit(1);
}

debugLog("start", `Energiewerk startet - Node ${process.version} auf ${process.platform}, PORT=${PORT}, ` +
  `HTTPS=${httpsOptionen ? "ja" : "nein"}, HTTP_PORT=${httpsOptionen && HTTP_PORT && HTTP_PORT !== "0" ? HTTP_PORT : "aus"}, ` +
  `DATA_DIR=${DATA_DIR}, ANTHROPIC_API_KEY (.env)=${process.env.ANTHROPIC_API_KEY ? "gesetzt" : "nicht gesetzt"}`);

seedFallsLeer()
  .then(() => {
    if (httpsOptionen) {
      const https = require("https");
      https.createServer(httpsOptionen, app)
        .on("error", behandleListenFehler)
        .listen(PORT, () => {
          console.log(`\nEnergiewerk läuft (HTTPS): https://localhost:${PORT}`);
          console.log(`Daten liegen in: ${DATA_DIR}\n`);
        });

      // Zweiter, unverschlüsselter Listener auf HTTP_PORT (Standard 80) -
      // bewusst OHNE Weiterleitung auf HTTPS, damit man im internen LAN
      // testweise/ausnahmsweise auch ohne Zertifikatswarnung reinkommt.
      // Scheitert dieser zusätzliche Port (z. B. weil 80 schon von IIS
      // belegt ist oder fehlende Rechte), läuft Energiewerk trotzdem ganz
      // normal über HTTPS weiter - anders als beim Hauptport oben führt
      // das hier NICHT zum Abbruch (behandleListenFehler wird bewusst
      // nicht verwendet).
      if (HTTP_PORT && HTTP_PORT !== "0" && Number(HTTP_PORT) !== Number(PORT)) {
        app.listen(Number(HTTP_PORT), () => {
          console.log(`Energiewerk läuft zusätzlich unverschlüsselt (HTTP): http://localhost:${HTTP_PORT}`);
        }).on("error", (fehler) => {
          console.error(`\nHinweis: Zusätzlicher HTTP-Port ${HTTP_PORT} konnte nicht geöffnet werden (${fehler.code || fehler.message}).`);
          console.error(`Energiewerk läuft trotzdem normal über HTTPS (Port ${PORT}) weiter.`);
          console.error(`Prüfen mit: netstat -ano | findstr :${HTTP_PORT}`);
          console.error(`Alternativ HTTP_PORT in der .env anpassen oder mit HTTP_PORT=0 abschalten.\n`);
          debugLog("start", `Zusätzlicher HTTP_PORT ${HTTP_PORT} fehlgeschlagen: ${fehler.stack || fehler.message}`);
        });
      }
    } else {
      app.listen(PORT, () => {
        console.log(`\nEnergiewerk läuft: http://localhost:${PORT}`);
        console.log(`Daten liegen in: ${DATA_DIR}\n`);
      }).on("error", behandleListenFehler);
    }
  })
  .catch((fehler) => {
    console.error("Fehler beim Anlegen der Beispieldaten:", fehler);
    process.exit(1);
  });
