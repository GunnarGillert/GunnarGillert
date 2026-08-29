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
  fs.appendFile(DEBUG_LOG_PATH, `${new Date().toISOString()} [uncaughtException] ${fehler.message}\n`, () => {});
});
process.on("unhandledRejection", (fehler) => {
  console.error("Unerwartete abgelehnte Promise (Server läuft weiter):", fehler);
  fs.appendFile(DEBUG_LOG_PATH, `${new Date().toISOString()} [unhandledRejection] ${fehler?.message || fehler}\n`, () => {});
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

async function leseEinstellungen() {
  try {
    return JSON.parse(await fsp.readFile(SETTINGS_PATH, "utf8"));
  } catch {
    return { naechsteFallnummer: 1, fallnummernPraefix: "EW", anthropicApiKey: "" };
  }
}

async function schreibeEinstellungen(einstellungen) {
  await fsp.writeFile(SETTINGS_PATH, JSON.stringify(einstellungen, null, 2));
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
  "Angebot", "Antrag", "Bescheid", "Rechnung", "Zahlungsnachweis",
  "Verwendungsnachweis", "Festsetzungsbescheid", "Sonstiges",
];

const ERKENNUNGS_REIHENFOLGE = [
  ["zuwendungsbescheid", "Bescheid"],
  ["festsetzungsbescheid", "Festsetzungsbescheid"],
  ["verwendungsnachweis", "Verwendungsnachweis"],
  ["zahlungsnachweis", "Zahlungsnachweis"],
  ["projektbeschreibung", "Antrag"],
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

  const zusammenfassung = pruefung.ergebnis === "nicht_moeglich"
    ? `U-Wert-Prüfung für "${dokument.dateiname}" nicht möglich: ${v.uWertPruefung.fehler || "unbekannter Grund"}`
    : `U-Wert-Prüfung für "${dokument.dateiname}" automatisch durchgeführt: Ergebnis "${pruefung.ergebnis}"`;
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
  const { kundeId, fensterbauerId } = req.body;
  if (!kundeId || !fensterbauerId) {
    return res.status(400).json({ fehler: "Kunde und Fensterbauer sind Pflichtfelder." });
  }
  const id = await naechsteVorgangsnummer();
  const v = {
    id, bafaVorgangsId: "", kundeId, fensterbauerId, status: "eingang",
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
  const { status, zahlungsstatus } = req.body;
  const heute = new Date().toISOString().slice(0, 10);
  if (status && status !== v.status) {
    v.status = status;
    v.historie.push({ wer: "Sachbearbeiter", was: `Status geändert zu "${status}"`, wann: heute });
  }
  if (zahlungsstatus && v.rechnung) {
    v.rechnung.zahlungsstatus = zahlungsstatus;
    v.historie.push({ wer: "Sachbearbeiter", was: `Zahlungsstatus geändert zu "${zahlungsstatus}"`, wann: heute });
  }
  await schreibe(VORGAENGE_DIR, v.id, v);
  res.json(mitFlags(v));
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

app.use((fehler, req, res, next) => {
  if (fehler instanceof multer.MulterError) {
    return res.status(400).json({ fehler: `Upload fehlgeschlagen: ${fehler.message}` });
  }
  next(fehler);
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

seedFallsLeer()
  .then(() => {
    if (httpsOptionen) {
      const https = require("https");
      https.createServer(httpsOptionen, app).listen(PORT, () => {
        console.log(`\nEnergiewerk läuft (HTTPS): https://localhost:${PORT}`);
        console.log(`Daten liegen in: ${DATA_DIR}\n`);
      });
    } else {
      app.listen(PORT, () => {
        console.log(`\nEnergiewerk läuft: http://localhost:${PORT}`);
        console.log(`Daten liegen in: ${DATA_DIR}\n`);
      });
    }
  })
  .catch((fehler) => {
    console.error("Fehler beim Anlegen der Beispieldaten:", fehler);
    process.exit(1);
  });
