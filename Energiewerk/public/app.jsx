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
  const [dokumenttypen, setDokumenttypen] = useState([]);
  const [hochladeLaeuft, setHochladeLaeuft] = useState(false);
  const [hochladeFehler, setHochladeFehler] = useState("");

  useEffect(() => { ladeJson("/api/dokumenttypen").then(setDokumenttypen).catch(() => {}); }, []);

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

  async function dateiHochladen(e) {
    const datei = e.target.files[0];
    e.target.value = "";
    if (!datei) return;
    setHochladeFehler("");
    setHochladeLaeuft(true);
    try {
      const formular = new FormData();
      formular.append("datei", datei);
      await ladeJson(`/api/vorgaenge/${ausgewaehlterVorgang.id}/dokumente`, { method: "POST", body: formular });
      await oeffneVorgang(ausgewaehlterVorgang.id);
    } catch (fehler) {
      setHochladeFehler(fehler.message);
    } finally {
      setHochladeLaeuft(false);
    }
  }

  async function dokumenttypSetzen(dokumentId, typ) {
    if (!typ) return;
    await ladeJson(`/api/vorgaenge/${ausgewaehlterVorgang.id}/dokumente/${dokumentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ typ }),
    });
    await oeffneVorgang(ausgewaehlterVorgang.id);
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
            <div className="feld"><div className="label">Fensterbauer</div>{ausgewaehlterVorgang.fensterbauer?.firma}</div>
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

          <h3>Unterlagen</h3>
          <div>
            <input type="file" onChange={dateiHochladen} disabled={hochladeLaeuft} />
            {hochladeLaeuft && <span> Wird hochgeladen und geprüft (Dateiname, ggf. Textebene/OCR + KI-Vorschlag) …</span>}
          </div>
          {hochladeFehler && <div className="leer">Fehler: {hochladeFehler}</div>}

          {(ausgewaehlterVorgang.dokumente || []).length === 0 && (
            <div className="leer">Noch keine Unterlagen hochgeladen.</div>
          )}
          {(ausgewaehlterVorgang.dokumente || []).map((d) => (
            <div className="historie-eintrag" key={d.id}>
              <div>
                <a href={`/api/vorgaenge/${ausgewaehlterVorgang.id}/dokumente/${d.id}/datei`} target="_blank" rel="noreferrer">
                  {d.dateiname}
                </a>{" "}
                <span className={`badge ${d.typ === "unbekannt" ? "unbekannt" : "status"}`}>{d.typ}</span>{" "}
                <span style={{ color: "#5c6b66" }}>{formatDatum(d.hochgeladenAm)}, {(d.groesse / 1024).toFixed(0)} KB</span>
              </div>
              {d.typ === "unbekannt" && (
                <div style={{ marginTop: 4 }}>
                  {d.kiVorschlag?.typ ? (
                    <span>
                      KI-Vorschlag: <strong>{d.kiVorschlag.typ}</strong>
                      {d.kiVorschlag.begruendung ? ` — ${d.kiVorschlag.begruendung}` : ""}{" "}
                      <button className="aktion sekundaer" style={{ padding: "2px 8px", fontSize: 12 }} onClick={() => dokumenttypSetzen(d.id, d.kiVorschlag.typ)}>
                        Übernehmen
                      </button>
                    </span>
                  ) : (
                    <span style={{ color: "#5c6b66" }}>Kein KI-Vorschlag möglich{d.kiVorschlag?.fehler ? ` (${d.kiVorschlag.fehler})` : ""}.</span>
                  )}{" "}
                  <select onChange={(e) => dokumenttypSetzen(d.id, e.target.value)} value="">
                    <option value="">oder Typ manuell wählen …</option>
                    {dokumenttypen.filter((t) => t !== "unbekannt").map((t) => <option value={t} key={t}>{t}</option>)}
                  </select>
                </div>
              )}
            </div>
          ))}

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
const LEERES_KONTAKT_FORMULAR = {
  vorname: "", nachname: "", firma: "", strasse: "", plz: "", ort: "", telefon: "", email: "", bemerkungen: "",
};

function Kundenverwaltung() {
  const [suche, setSuche] = useState("");
  const [kunden, setKunden] = useState([]);
  const [fensterbauerListe, setFensterbauerListe] = useState([]);
  const [ausgewaehlt, setAusgewaehlt] = useState(null);
  const [neu, setNeu] = useState({ ...LEERES_KONTAKT_FORMULAR, fensterbauerId: "" });

  const laden = useCallback(() => {
    const params = new URLSearchParams();
    if (suche) params.set("q", suche);
    ladeJson(`/api/kunden?${params}`).then(setKunden).catch(() => {});
  }, [suche]);

  useEffect(() => { laden(); }, [laden]);
  useEffect(() => { ladeJson("/api/fensterbauer").then(setFensterbauerListe).catch(() => {}); }, []);

  async function oeffne(id) {
    const k = await ladeJson(`/api/kunden/${id}`);
    setAusgewaehlt(k);
  }

  async function anlegen(e) {
    e.preventDefault();
    if (!neu.nachname || !neu.fensterbauerId) return;
    await ladeJson("/api/kunden", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(neu),
    });
    setNeu({ ...LEERES_KONTAKT_FORMULAR, fensterbauerId: "" });
    laden();
  }

  function feldAendern(feld) {
    return (e) => setNeu((vorher) => ({ ...vorher, [feld]: e.target.value }));
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

      <form className="form-neu" onSubmit={anlegen}>
        <input type="text" placeholder="Vorname" value={neu.vorname} onChange={feldAendern("vorname")} />
        <input type="text" placeholder="Name" value={neu.nachname} onChange={feldAendern("nachname")} />
        <input type="text" placeholder="Firma" value={neu.firma} onChange={feldAendern("firma")} />
        <input type="text" placeholder="Straße" value={neu.strasse} onChange={feldAendern("strasse")} />
        <input type="text" placeholder="PLZ" value={neu.plz} onChange={feldAendern("plz")} />
        <input type="text" placeholder="Ort" value={neu.ort} onChange={feldAendern("ort")} />
        <input type="text" placeholder="Telefonnummer" value={neu.telefon} onChange={feldAendern("telefon")} />
        <input type="text" placeholder="E-Mail" value={neu.email} onChange={feldAendern("email")} />
        <select value={neu.fensterbauerId} onChange={feldAendern("fensterbauerId")}>
          <option value="">Fensterbauer wählen …</option>
          {fensterbauerListe.map((f) => <option value={f.id} key={f.id}>{f.firma}</option>)}
        </select>
        <input type="text" placeholder="Bemerkungen" value={neu.bemerkungen} onChange={feldAendern("bemerkungen")} />
        <button className="aktion" type="submit">Anlegen</button>
      </form>

      <table>
        <thead>
          <tr><th>Name</th><th>Firma</th><th>Ort</th><th>Telefon</th><th>E-Mail</th><th>Fensterbauer</th></tr>
        </thead>
        <tbody>
          {kunden.map((k) => (
            <tr key={k.id} className="klickbar" onClick={() => oeffne(k.id)}>
              <td>{k.vorname} {k.nachname}</td>
              <td>{k.firma}</td>
              <td>{k.plz} {k.ort}</td>
              <td>{k.telefon}</td>
              <td>{k.email}</td>
              <td>{k.fensterbauerName}</td>
            </tr>
          ))}
          {kunden.length === 0 && <tr><td colSpan="6" className="leer">Keine Kunden gefunden.</td></tr>}
        </tbody>
      </table>

      {ausgewaehlt && (
        <div className="karte-panel">
          <button className="schliessen" onClick={() => setAusgewaehlt(null)}>Schließen ✕</button>
          <h3>{ausgewaehlt.vorname} {ausgewaehlt.nachname}{ausgewaehlt.firma ? ` (${ausgewaehlt.firma})` : ""}</h3>
          <div className="feld-zeile">
            <div className="feld"><div className="label">Adresse</div>{ausgewaehlt.strasse}, {ausgewaehlt.plz} {ausgewaehlt.ort}</div>
            <div className="feld"><div className="label">Telefon</div>{ausgewaehlt.telefon}</div>
            <div className="feld"><div className="label">E-Mail</div>{ausgewaehlt.email}</div>
          </div>
          {ausgewaehlt.bemerkungen && (
            <div className="feld-zeile">
              <div className="feld"><div className="label">Bemerkungen</div>{ausgewaehlt.bemerkungen}</div>
            </div>
          )}
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
  const [neu, setNeu] = useState({ ...LEERES_KONTAKT_FORMULAR, kuerzel: "" });

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
    if (!neu.firma || !neu.kuerzel) return;
    await ladeJson("/api/fensterbauer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(neu),
    });
    setNeu({ ...LEERES_KONTAKT_FORMULAR, kuerzel: "" });
    laden();
  }

  function feldAendern(feld) {
    return (e) => setNeu((vorher) => ({ ...vorher, [feld]: e.target.value }));
  }

  return (
    <div>
      <div className="suchleiste">
        <input
          type="text"
          placeholder="Suche nach Firma, Ansprechpartner oder Kürzel …"
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
        />
      </div>

      <form className="form-neu" onSubmit={anlegen}>
        <input type="text" placeholder="Firma" value={neu.firma} onChange={feldAendern("firma")} />
        <input type="text" placeholder="Kürzel" value={neu.kuerzel} onChange={feldAendern("kuerzel")} />
        <input type="text" placeholder="Vorname (Ansprechpartner)" value={neu.vorname} onChange={feldAendern("vorname")} />
        <input type="text" placeholder="Name (Ansprechpartner)" value={neu.nachname} onChange={feldAendern("nachname")} />
        <input type="text" placeholder="Straße" value={neu.strasse} onChange={feldAendern("strasse")} />
        <input type="text" placeholder="PLZ" value={neu.plz} onChange={feldAendern("plz")} />
        <input type="text" placeholder="Ort" value={neu.ort} onChange={feldAendern("ort")} />
        <input type="text" placeholder="Telefonnummer" value={neu.telefon} onChange={feldAendern("telefon")} />
        <input type="text" placeholder="E-Mail (To/CC)" value={neu.email} onChange={feldAendern("email")} />
        <input type="text" placeholder="Bemerkungen" value={neu.bemerkungen} onChange={feldAendern("bemerkungen")} />
        <button className="aktion" type="submit">Anlegen</button>
      </form>

      <table>
        <thead><tr><th>Firma</th><th>Ansprechpartner</th><th>Ort</th><th>Telefon</th><th>E-Mail</th><th>Aktiv</th></tr></thead>
        <tbody>
          {liste.map((f) => (
            <tr key={f.id} className="klickbar" onClick={() => oeffne(f.id)}>
              <td>{f.firma}</td>
              <td>{f.vorname} {f.nachname}</td>
              <td>{f.plz} {f.ort}</td>
              <td>{f.telefon}</td>
              <td>{f.email}</td>
              <td>{f.aktiv ? "Ja" : "Nein"}</td>
            </tr>
          ))}
          {liste.length === 0 && <tr><td colSpan="6" className="leer">Keine Fensterbauer gefunden.</td></tr>}
        </tbody>
      </table>

      {ausgewaehlt && (
        <div className="karte-panel">
          <button className="schliessen" onClick={() => setAusgewaehlt(null)}>Schließen ✕</button>
          <h3>{ausgewaehlt.firma} <span style={{ fontWeight: 400, fontSize: 13, color: "#5c6b66" }}>({ausgewaehlt.kuerzel})</span></h3>
          <div className="feld-zeile">
            <div className="feld"><div className="label">Ansprechpartner</div>{ausgewaehlt.vorname} {ausgewaehlt.nachname}</div>
            <div className="feld"><div className="label">Adresse</div>{ausgewaehlt.strasse}, {ausgewaehlt.plz} {ausgewaehlt.ort}</div>
            <div className="feld"><div className="label">Telefon</div>{ausgewaehlt.telefon}</div>
            <div className="feld"><div className="label">E-Mail (To/CC)</div>{ausgewaehlt.email}</div>
          </div>
          {ausgewaehlt.bemerkungen && (
            <div className="feld-zeile">
              <div className="feld"><div className="label">Bemerkungen</div>{ausgewaehlt.bemerkungen}</div>
            </div>
          )}
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
