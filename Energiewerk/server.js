// ============================================================================
// Energiewerk – lokaler Server (Prototyp)
// BAFA-Förderprozessverwaltung für Fensterbauer-Kunden (Maler Luft).
// Läuft komplett lokal, Datenordner soll später auf SharePoint/OneDrive
// liegen (DATA_DIR) - Aufbau bewusst analog zu Parkwerk.
//
// Prototyp-Stand: Startseite (Kennzahlen), Auftrags-, Kunden- und
// Fensterbauerverwaltung mit Suche/Filter. Login, Mailversand, KI-Anbindung,
// PDF/E-Rechnung und der Eingangs-Ordner-Watcher aus der Skizze
// (Energiewerk/README.md) sind hier noch NICHT umgesetzt.
// ============================================================================

require("dotenv").config();
const express = require("express");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const crypto = require("crypto");

const app = express();
app.use(express.json({ limit: "5mb" }));

const PORT = process.env.PORT || 4000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "Energiewerk-Daten");

const COLLECTIONS_DIR = path.join(DATA_DIR, "collections");
const FENSTERBAUER_DIR = path.join(COLLECTIONS_DIR, "fensterbauer");
const KUNDEN_DIR = path.join(COLLECTIONS_DIR, "kunden");
const VORGAENGE_DIR = path.join(COLLECTIONS_DIR, "vorgaenge");
const SETTINGS_PATH = path.join(DATA_DIR, "settings.json");

for (const dir of [DATA_DIR, COLLECTIONS_DIR, FENSTERBAUER_DIR, KUNDEN_DIR, VORGAENGE_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

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
    return { naechsteFallnummer: 1, fallnummernPraefix: "EW" };
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
// Beispieldaten (nur beim allerersten Start, wenn noch nichts angelegt ist -
// damit sich der Prototyp sofort ausprobieren lässt)
// ----------------------------------------------------------------------------
async function seedFallsLeer() {
  const vorhandeneFensterbauer = await leseAlle(FENSTERBAUER_DIR);
  if (vorhandeneFensterbauer.length > 0) return;

  const fensterbauer = [
    { id: crypto.randomUUID(), name: "Fenster Weber GmbH", kuerzel: "WEB", kontaktEmail: "buero@fenster-weber.example", aktiv: true },
    { id: crypto.randomUUID(), name: "Schmidt Fensterbau", kuerzel: "SCH", kontaktEmail: "info@schmidt-fensterbau.example", aktiv: true },
    { id: crypto.randomUUID(), name: "Hessen-Fenster Krause", kuerzel: "KRA", kontaktEmail: "kontakt@hessen-fenster-krause.example", aktiv: true },
  ];
  for (const f of fensterbauer) await schreibe(FENSTERBAUER_DIR, f.id, f);

  const kunden = [
    { id: crypto.randomUUID(), vorname: "Anna", nachname: "Becker", firma: "", strasse: "Marktstraße 4", plz: "63654", ort: "Büdingen", email: "anna.becker@example.com", telefon: "06042 1234", fensterbauerId: fensterbauer[0].id },
    { id: crypto.randomUUID(), vorname: "Jürgen", nachname: "Hoffmann", firma: "", strasse: "Am Bahnhof 12", plz: "63667", ort: "Nidda", email: "j.hoffmann@example.com", telefon: "06043 5678", fensterbauerId: fensterbauer[1].id },
    { id: crypto.randomUUID(), vorname: "Petra", nachname: "Schulz", firma: "Schulz Immobilien", strasse: "Ringstraße 9", plz: "63636", ort: "Brachttal", email: "p.schulz@example.com", telefon: "06054 4321", fensterbauerId: fensterbauer[2].id },
    { id: crypto.randomUUID(), vorname: "Michael", nachname: "Vogt", firma: "", strasse: "Hauptstraße 51", plz: "63654", ort: "Büdingen", email: "m.vogt@example.com", telefon: "06042 9876", fensterbauerId: fensterbauer[0].id },
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
      historie: [{ wer: "System", was: "Vorgang angelegt", wann: vorTagen(50) }],
    },
    {
      id: "EW-2026-00002", bafaVorgangsId: "BAFA-779034", kundeId: kunden[1].id, fensterbauerId: fensterbauer[1].id,
      status: "verwendungsnachweis_faellig",
      uWertPruefung: { ergebnis: "konform", geprueftAm: vorTagen(90) },
      bescheid: { betrag: 5100, datum: vorTagen(85) },
      rechnung: { betrag: 5100, faelligkeitsdatum: vorTagen(60), zahlungsstatus: "bezahlt" },
      verwendungsnachweisFrist: vorTagen(3),
      historie: [{ wer: "System", was: "Vorgang angelegt", wann: vorTagen(100) }],
    },
    {
      id: "EW-2026-00003", bafaVorgangsId: "", kundeId: kunden[2].id, fensterbauerId: fensterbauer[2].id,
      status: "u_wert_geprueft",
      uWertPruefung: { ergebnis: "konform", geprueftAm: vorTagen(2) },
      bescheid: null,
      rechnung: null,
      verwendungsnachweisFrist: null,
      historie: [{ wer: "System", was: "Vorgang angelegt", wann: vorTagen(4) }],
    },
    {
      id: "EW-2026-00004", bafaVorgangsId: "BAFA-780112", kundeId: kunden[3].id, fensterbauerId: fensterbauer[0].id,
      status: "abgeschlossen",
      uWertPruefung: { ergebnis: "konform", geprueftAm: vorTagen(200) },
      bescheid: { betrag: 4400, datum: vorTagen(190) },
      rechnung: { betrag: 4400, faelligkeitsdatum: vorTagen(170), zahlungsstatus: "bezahlt" },
      verwendungsnachweisFrist: vorTagen(90),
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
  const gefiltert = alle.filter((f) => enthaeltText([f.name, f.kuerzel, f.kontaktEmail], q));
  gefiltert.sort((a, b) => a.name.localeCompare(b.name));
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
  const { name, kuerzel, kontaktEmail } = req.body;
  if (!name || !kuerzel) return res.status(400).json({ fehler: "Name und Kürzel sind Pflichtfelder." });
  const f = { id: crypto.randomUUID(), name, kuerzel, kontaktEmail: kontaktEmail || "", aktiv: true };
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
  const angereichert = alle.map((k) => ({ ...k, fensterbauerName: fensterbauerNachId[k.fensterbauerId]?.name || "" }));
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
  const { vorname, nachname, firma, strasse, plz, ort, email, telefon, fensterbauerId } = req.body;
  if (!nachname || !fensterbauerId) {
    return res.status(400).json({ fehler: "Nachname und Fensterbauer sind Pflichtfelder." });
  }
  const k = {
    id: crypto.randomUUID(), vorname: vorname || "", nachname, firma: firma || "",
    strasse: strasse || "", plz: plz || "", ort: ort || "", email: email || "", telefon: telefon || "",
    fensterbauerId,
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
      fensterbauerName: fensterbauer ? fensterbauer.name : "",
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

seedFallsLeer()
  .then(() => {
    app.listen(PORT, () => console.log(`Energiewerk-Prototyp läuft auf http://localhost:${PORT}`));
  })
  .catch((fehler) => {
    console.error("Fehler beim Anlegen der Beispieldaten:", fehler);
    process.exit(1);
  });
