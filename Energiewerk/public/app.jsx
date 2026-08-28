import React, { useEffect, useState, useCallback } from "react";

const STATUS_LABEL = {
  eingang: "Eingang",
  stammdaten_erfasst: "Stammdaten erfasst",
  u_wert_geprueft: "U-Wert geprüft",
  antrag_gestellt: "Antrag gestellt",
  vergabe_freigegeben: "Vergabe freigegeben",
  bescheid_erhalten: "Bescheid erhalten",
  rechnung_versendet: "Rechnung versendet",
  in_umsetzung: "In Umsetzung",
  verwendungsnachweis_faellig: "Verwendungsnachweis fällig",
  verwendungsnachweis_eingereicht: "Verwendungsnachweis eingereicht",
  festgesetzt: "Festgesetzt",
  abgeschlossen: "Abgeschlossen",
  abgelehnt: "Abgelehnt",
  storniert: "Storniert",
};

function formatEuro(betrag) {
  if (betrag == null) return "–";
  return betrag.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

function formatDatum(iso) {
  if (!iso) return "–";
  return new Date(iso).toLocaleDateString("de-DE");
}

async function ladeJson(url, optionen) {
  const antwort = await fetch(url, optionen);
  if (!antwort.ok) {
    const inhalt = await antwort.json().catch(() => ({}));
    throw new Error(inhalt.fehler || `Anfrage fehlgeschlagen (HTTP ${antwort.status})`);
  }
  return antwort.json();
}

// ----------------------------------------------------------------------------
// Startseite
// ----------------------------------------------------------------------------
function Startseite({ aufSpringeZuAuftraege }) {
  const [daten, setDaten] = useState(null);
  const [fehler, setFehler] = useState("");

  useEffect(() => {
    ladeJson("/api/dashboard").then(setDaten).catch((e) => setFehler(e.message));
  }, []);

  if (fehler) return <div className="leer">Fehler: {fehler}</div>;
  if (!daten) return <div className="leer">Lädt …</div>;

  const offeneVorgaenge = daten.gesamt - (daten.jeStatus.abgeschlossen || 0) - (daten.jeStatus.abgelehnt || 0) - (daten.jeStatus.storniert || 0);

  return (
    <div>
      <div className="kacheln">
        <div className="kachel" onClick={() => aufSpringeZuAuftraege({})}>
          <div className="zahl">{daten.gesamt}</div>
          <div className="label">Vorgänge gesamt</div>
        </div>
        <div className="kachel" onClick={() => aufSpringeZuAuftraege({})}>
          <div className="zahl">{offeneVorgaenge}</div>
          <div className="label">Offen / in Bearbeitung</div>
        </div>
        <div
          className="kachel warnung"
          onClick={() => aufSpringeZuAuftraege({ verwendungsnachweisUeberfaellig: true })}
        >
          <div className="zahl">{daten.verwendungsnachweisUeberfaellig}</div>
          <div className="label">Verwendungsnachweis überfällig</div>
        </div>
        <div
          className="kachel warnung"
          onClick={() => aufSpringeZuAuftraege({ zahlungUeberfaellig: true })}
        >
          <div className="zahl">{daten.zahlungUeberfaellig}</div>
          <div className="label">Zahlung überfällig</div>
        </div>
      </div>

      <div className="karte-panel">
        <h3>Vorgänge je Status</h3>
        <div className="feld-zeile">
          {Object.entries(daten.jeStatus).map(([status, anzahl]) => (
            <div
              className="feld"
              key={status}
              style={{ cursor: "pointer" }}
              onClick={() => aufSpringeZuAuftraege({ status })}
            >
              <div className="label">{STATUS_LABEL[status] || status}</div>
              {anzahl}
            </div>
          ))}
        </div>
      </div>

      <div className="karte-panel">
        <h3>Letzte Aktivitäten</h3>
        {daten.letzteAktivitaeten.length === 0 && <div className="leer">Noch keine Aktivitäten.</div>}
        {daten.letzteAktivitaeten.map((a, i) => (
          <div className="historie-eintrag" key={i}>
            <strong>{formatDatum(a.wann)}</strong> — {a.vorgangId}: {a.was} ({a.wer})
          </div>
        ))}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Auftragsverwaltung
// ----------------------------------------------------------------------------
function Auftragsverwaltung({ startFilter, aufFilterUebernommen }) {
  const [suche, setSuche] = useState("");
  const [status, setStatus] = useState("");
  const [nurVn, setNurVn] = useState(false);
  const [nurZahlung, setNurZahlung] = useState(false);
  const [vorgaenge, setVorgaenge] = useState([]);
  const [ausgewaehlterVorgang, setAusgewaehlterVorgang] = useState(null);
  const [fehler, setFehler] = useState("");

  useEffect(() => {
    if (!startFilter) return;
    setStatus(startFilter.status || "");
    setNurVn(Boolean(startFilter.verwendungsnachweisUeberfaellig));
    setNurZahlung(Boolean(startFilter.zahlungUeberfaellig));
    aufFilterUebernommen();
  }, [startFilter]);

  const laden = useCallback(() => {
    const params = new URLSearchParams();
    if (suche) params.set("q", suche);
    if (status) params.set("status", status);
    if (nurVn) params.set("verwendungsnachweisUeberfaellig", "1");
    if (nurZahlung) params.set("zahlungUeberfaellig", "1");
    ladeJson(`/api/vorgaenge?${params}`).then(setVorgaenge).catch((e) => setFehler(e.message));
  }, [suche, status, nurVn, nurZahlung]);

  useEffect(() => { laden(); }, [laden]);

  async function oeffneVorgang(id) {
    const v = await ladeJson(`/api/vorgaenge/${id}`);
    setAusgewaehlterVorgang(v);
  }

  async function aendereStatus(neuerStatus) {
    await ladeJson(`/api/vorgaenge/${ausgewaehlterVorgang.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: neuerStatus }),
    });
    await oeffneVorgang(ausgewaehlterVorgang.id);
    laden();
  }

  async function markiereBezahlt() {
    await ladeJson(`/api/vorgaenge/${ausgewaehlterVorgang.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ zahlungsstatus: "bezahlt" }),
    });
    await oeffneVorgang(ausgewaehlterVorgang.id);
    laden();
  }

  return (
    <div>
      <div className="suchleiste">
        <input
          type="text"
          placeholder="Suche nach Vorgangsnummer, BAFA-ID, Kunde oder Fensterbauer …"
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Alle Status</option>
          {Object.entries(STATUS_LABEL).map(([wert, label]) => (
            <option value={wert} key={wert}>{label}</option>
          ))}
        </select>
        <label className="filter">
          <input type="checkbox" checked={nurVn} onChange={(e) => setNurVn(e.target.checked)} />
          Verwendungsnachweis überfällig
        </label>
        <label className="filter">
          <input type="checkbox" checked={nurZahlung} onChange={(e) => setNurZahlung(e.target.checked)} />
          Zahlung überfällig
        </label>
      </div>

      {fehler && <div className="leer">Fehler: {fehler}</div>}

      <table>
        <thead>
          <tr>
            <th>Vorgang</th><th>Kunde</th><th>Fensterbauer</th><th>Status</th>
            <th>Bescheid</th><th>Rechnung fällig</th><th>Überfällig</th>
          </tr>
        </thead>
        <tbody>
          {vorgaenge.map((v) => (
            <tr key={v.id} className="klickbar" onClick={() => oeffneVorgang(v.id)}>
              <td>{v.id}</td>
              <td>{v.kundeName}</td>
              <td>{v.fensterbauerName}</td>
              <td><span className="badge status">{STATUS_LABEL[v.status] || v.status}</span></td>
              <td>{v.bescheid ? formatEuro(v.bescheid.betrag) : "–"}</td>
              <td>{v.rechnung ? formatDatum(v.rechnung.faelligkeitsdatum) : "–"}</td>
              <td>
                {v.verwendungsnachweisUeberfaellig && <span className="badge ueberfaellig">VN</span>}{" "}
                {v.zahlungUeberfaellig && <span className="badge ueberfaellig">Zahlung</span>}
              </td>
            </tr>
          ))}
          {vorgaenge.length === 0 && (
            <tr><td colSpan="7" className="leer">Keine Vorgänge gefunden.</td></tr>
          )}
        </tbody>
      </table>

      {ausgewaehlterVorgang && (
        <div className="karte-panel">
          <button className="schliessen" onClick={() => setAusgewaehlterVorgang(null)}>Schließen ✕</button>
          <h3>Vorgang {ausgewaehlterVorgang.id}</h3>
          <div className="feld-zeile">
            <div className="feld"><div className="label">Kunde</div>{ausgewaehlterVorgang.kunde?.vorname} {ausgewaehlterVorgang.kunde?.nachname}</div>
            <div className="feld"><div className="label">Fensterbauer</div>{ausgewaehlterVorgang.fensterbauer?.name}</div>
            <div className="feld"><div className="label">BAFA-Vorgangs-ID</div>{ausgewaehlterVorgang.bafaVorgangsId || "–"}</div>
            <div className="feld"><div className="label">Status</div>{STATUS_LABEL[ausgewaehlterVorgang.status]}</div>
          </div>
          <div className="feld-zeile">
            <div className="feld"><div className="label">Bescheid</div>{ausgewaehlterVorgang.bescheid ? formatEuro(ausgewaehlterVorgang.bescheid.betrag) : "–"}</div>
            <div className="feld"><div className="label">Rechnung</div>{ausgewaehlterVorgang.rechnung ? `${formatEuro(ausgewaehlterVorgang.rechnung.betrag)} (${ausgewaehlterVorgang.rechnung.zahlungsstatus})` : "–"}</div>
            <div className="feld"><div className="label">VN-Frist</div>{formatDatum(ausgewaehlterVorgang.verwendungsnachweisFrist)}</div>
          </div>

          <div>
            <select onChange={(e) => e.target.value && aendereStatus(e.target.value)} value="">
              <option value="">Status ändern zu …</option>
              {Object.entries(STATUS_LABEL).map(([wert, label]) => (
                <option value={wert} key={wert}>{label}</option>
              ))}
            </select>
            {ausgewaehlterVorgang.rechnung && ausgewaehlterVorgang.rechnung.zahlungsstatus !== "bezahlt" && (
              <button className="aktion sekundaer" onClick={markiereBezahlt}>Als bezahlt markieren</button>
            )}
          </div>

          <h3>Historie</h3>
          {ausgewaehlterVorgang.historie.map((h, i) => (
            <div className="historie-eintrag" key={i}>
              <strong>{formatDatum(h.wann)}</strong> — {h.was} ({h.wer})
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Kundenverwaltung
// ----------------------------------------------------------------------------
function Kundenverwaltung() {
  const [suche, setSuche] = useState("");
  const [kunden, setKunden] = useState([]);
  const [ausgewaehlt, setAusgewaehlt] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (suche) params.set("q", suche);
    ladeJson(`/api/kunden?${params}`).then(setKunden).catch(() => {});
  }, [suche]);

  async function oeffne(id) {
    const k = await ladeJson(`/api/kunden/${id}`);
    setAusgewaehlt(k);
  }

  return (
    <div>
      <div className="suchleiste">
        <input
          type="text"
          placeholder="Suche nach Name, Adresse, E-Mail oder Fensterbauer …"
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
        />
      </div>
      <table>
        <thead>
          <tr><th>Name</th><th>Ort</th><th>E-Mail</th><th>Fensterbauer</th></tr>
        </thead>
        <tbody>
          {kunden.map((k) => (
            <tr key={k.id} className="klickbar" onClick={() => oeffne(k.id)}>
              <td>{k.vorname} {k.nachname}{k.firma ? ` (${k.firma})` : ""}</td>
              <td>{k.plz} {k.ort}</td>
              <td>{k.email}</td>
              <td>{k.fensterbauerName}</td>
            </tr>
          ))}
          {kunden.length === 0 && <tr><td colSpan="4" className="leer">Keine Kunden gefunden.</td></tr>}
        </tbody>
      </table>

      {ausgewaehlt && (
        <div className="karte-panel">
          <button className="schliessen" onClick={() => setAusgewaehlt(null)}>Schließen ✕</button>
          <h3>{ausgewaehlt.vorname} {ausgewaehlt.nachname}</h3>
          <div className="feld-zeile">
            <div className="feld"><div className="label">Adresse</div>{ausgewaehlt.strasse}, {ausgewaehlt.plz} {ausgewaehlt.ort}</div>
            <div className="feld"><div className="label">E-Mail</div>{ausgewaehlt.email}</div>
            <div className="feld"><div className="label">Telefon</div>{ausgewaehlt.telefon}</div>
          </div>
          <h3>Vorgänge dieses Kunden</h3>
          {ausgewaehlt.vorgaenge.length === 0 && <div className="leer">Noch keine Vorgänge.</div>}
          {ausgewaehlt.vorgaenge.map((v) => (
            <div className="historie-eintrag" key={v.id}>
              {v.id} — {STATUS_LABEL[v.status] || v.status}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Fensterbauerverwaltung
// ----------------------------------------------------------------------------
function Fensterbauerverwaltung() {
  const [suche, setSuche] = useState("");
  const [liste, setListe] = useState([]);
  const [ausgewaehlt, setAusgewaehlt] = useState(null);
  const [neuName, setNeuName] = useState("");
  const [neuKuerzel, setNeuKuerzel] = useState("");
  const [neuEmail, setNeuEmail] = useState("");

  const laden = useCallback(() => {
    const params = new URLSearchParams();
    if (suche) params.set("q", suche);
    ladeJson(`/api/fensterbauer?${params}`).then(setListe).catch(() => {});
  }, [suche]);

  useEffect(() => { laden(); }, [laden]);

  async function oeffne(id) {
    const f = await ladeJson(`/api/fensterbauer/${id}`);
    setAusgewaehlt(f);
  }

  async function anlegen(e) {
    e.preventDefault();
    if (!neuName || !neuKuerzel) return;
    await ladeJson("/api/fensterbauer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: neuName, kuerzel: neuKuerzel, kontaktEmail: neuEmail }),
    });
    setNeuName(""); setNeuKuerzel(""); setNeuEmail("");
    laden();
  }

  return (
    <div>
      <div className="suchleiste">
        <input
          type="text"
          placeholder="Suche nach Name oder Kürzel …"
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
        />
      </div>

      <form className="form-neu" onSubmit={anlegen}>
        <input type="text" placeholder="Neuer Fensterbauer: Name" value={neuName} onChange={(e) => setNeuName(e.target.value)} />
        <input type="text" placeholder="Kürzel" value={neuKuerzel} onChange={(e) => setNeuKuerzel(e.target.value)} />
        <input type="text" placeholder="Kontakt-E-Mail" value={neuEmail} onChange={(e) => setNeuEmail(e.target.value)} />
        <button className="aktion" type="submit">Anlegen</button>
      </form>

      <table>
        <thead><tr><th>Name</th><th>Kürzel</th><th>Kontakt-E-Mail</th><th>Aktiv</th></tr></thead>
        <tbody>
          {liste.map((f) => (
            <tr key={f.id} className="klickbar" onClick={() => oeffne(f.id)}>
              <td>{f.name}</td><td>{f.kuerzel}</td><td>{f.kontaktEmail}</td><td>{f.aktiv ? "Ja" : "Nein"}</td>
            </tr>
          ))}
          {liste.length === 0 && <tr><td colSpan="4" className="leer">Keine Fensterbauer gefunden.</td></tr>}
        </tbody>
      </table>

      {ausgewaehlt && (
        <div className="karte-panel">
          <button className="schliessen" onClick={() => setAusgewaehlt(null)}>Schließen ✕</button>
          <h3>{ausgewaehlt.name}</h3>
          <div className="feld-zeile">
            <div className="feld"><div className="label">Kürzel</div>{ausgewaehlt.kuerzel}</div>
            <div className="feld"><div className="label">Kontakt-E-Mail (To/CC)</div>{ausgewaehlt.kontaktEmail}</div>
          </div>
          <h3>Zugeordnete Kunden ({ausgewaehlt.kunden.length})</h3>
          {ausgewaehlt.kunden.map((k) => (
            <div className="historie-eintrag" key={k.id}>{k.vorname} {k.nachname}</div>
          ))}
          <h3>Vorgänge ({ausgewaehlt.vorgaenge.length})</h3>
          {ausgewaehlt.vorgaenge.map((v) => (
            <div className="historie-eintrag" key={v.id}>{v.id} — {STATUS_LABEL[v.status] || v.status}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// App-Gerüst mit Reitern
// ----------------------------------------------------------------------------
export default function App() {
  const [reiter, setReiter] = useState("startseite");
  const [auftraegeFilter, setAuftraegeFilter] = useState(null);

  function springeZuAuftraegen(filter) {
    setAuftraegeFilter(filter);
    setReiter("auftraege");
  }

  return (
    <div>
      <header>
        <h1>⚡ Energiewerk</h1>
        <span className="untertitel">BAFA-Förderprozess für Fensterbauer — Prototyp</span>
      </header>
      <nav>
        {[
          ["startseite", "Startseite"],
          ["auftraege", "Aufträge"],
          ["kunden", "Kunden"],
          ["fensterbauer", "Fensterbauer"],
        ].map(([id, label]) => (
          <button
            key={id}
            className={reiter === id ? "aktiv" : ""}
            onClick={() => setReiter(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      <main>
        {reiter === "startseite" && <Startseite aufSpringeZuAuftraege={springeZuAuftraegen} />}
        {reiter === "auftraege" && (
          <Auftragsverwaltung
            startFilter={auftraegeFilter}
            aufFilterUebernommen={() => setAuftraegeFilter(null)}
          />
        )}
        {reiter === "kunden" && <Kundenverwaltung />}
        {reiter === "fensterbauer" && <Fensterbauerverwaltung />}
      </main>
    </div>
  );
}
