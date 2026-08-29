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

const UWERT_ERGEBNIS_LABEL = {
  konform: "Konform",
  nicht_konform: "Nicht konform",
  unsicher: "Unsicher",
  nicht_moeglich: "Nicht möglich",
};

const UWERT_ERGEBNIS_KLASSE = {
  konform: "status",
  nicht_konform: "ueberfaellig",
  unsicher: "unbekannt",
  nicht_moeglich: "unbekannt",
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

// Datei-Upload per Klick (Standard-Dateiauswahl) ODER per Drag & Drop auf
// dieselbe Fläche - beide Wege rufen denselben onDatei(datei)-Callback auf.
function Dateiablage({ onDatei, hochladeLaeuft, accept }) {
  const [ziehtUeber, setZiehtUeber] = useState(false);

  function dateiUebernehmen(datei) {
    if (!datei || hochladeLaeuft) return;
    onDatei(datei);
  }

  return (
    <div
      className={`dropzone${ziehtUeber ? " aktiv" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setZiehtUeber(true); }}
      onDragLeave={() => setZiehtUeber(false)}
      onDrop={(e) => {
        e.preventDefault();
        setZiehtUeber(false);
        dateiUebernehmen(e.dataTransfer.files[0]);
      }}
    >
      <input
        type="file"
        accept={accept}
        disabled={hochladeLaeuft}
        onChange={(e) => {
          const datei = e.target.files[0];
          e.target.value = "";
          dateiUebernehmen(datei);
        }}
      />
      <span className="dropzone-hinweis">oder Datei hierher ziehen</span>
    </div>
  );
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

  async function dateiHochladen(datei) {
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

          <h3>U-Wert-Prüfung</h3>
          {ausgewaehlterVorgang.uWertPruefung ? (
            <div className="feld-zeile">
              <div className="feld">
                <div className="label">Ergebnis</div>
                <span className={`badge ${UWERT_ERGEBNIS_KLASSE[ausgewaehlterVorgang.uWertPruefung.ergebnis] || "unbekannt"}`}>
                  {UWERT_ERGEBNIS_LABEL[ausgewaehlterVorgang.uWertPruefung.ergebnis] || ausgewaehlterVorgang.uWertPruefung.ergebnis}
                </span>
              </div>
              <div className="feld"><div className="label">Geprüft am</div>{formatDatum(ausgewaehlterVorgang.uWertPruefung.geprueftAm)}</div>
              {ausgewaehlterVorgang.uWertPruefung.begruendung && (
                <div className="feld"><div className="label">Begründung</div>{ausgewaehlterVorgang.uWertPruefung.begruendung}</div>
              )}
              {ausgewaehlterVorgang.uWertPruefung.gefundeneUWerte?.length > 0 && (
                <div className="feld"><div className="label">Gefundene U-Werte</div>{ausgewaehlterVorgang.uWertPruefung.gefundeneUWerte.join(", ")}</div>
              )}
              {ausgewaehlterVorgang.uWertPruefung.fehler && (
                <div className="feld"><div className="label">Hinweis</div>{ausgewaehlterVorgang.uWertPruefung.fehler}</div>
              )}
            </div>
          ) : (
            <div className="leer">Noch keine Prüfung (läuft automatisch, sobald ein Dokument als „Angebot" hochgeladen bzw. zugeordnet wird).</div>
          )}

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
          <Dateiablage onDatei={dateiHochladen} hochladeLaeuft={hochladeLaeuft} />
          {hochladeLaeuft && <div className="leer">Wird hochgeladen und geprüft (Dateiname, ggf. Textebene/OCR + KI-Vorschlag) …</div>}
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
// Einstellungen
// ----------------------------------------------------------------------------
function Einstellungen() {
  const [merkblatt, setMerkblatt] = useState(undefined);
  const [hochladeLaeuft, setHochladeLaeuft] = useState(false);
  const [hochladeFehler, setHochladeFehler] = useState("");

  const [einstellungen, setEinstellungen] = useState(undefined);
  const [claudeKey, setClaudeKey] = useState("");
  const [claudeStatus, setClaudeStatus] = useState("");
  const [claudeTestLaeuft, setClaudeTestLaeuft] = useState(false);

  const [praefix, setPraefix] = useState("");
  const [naechsteNummer, setNaechsteNummer] = useState("");
  const [auftragsnummerStatus, setAuftragsnummerStatus] = useState("");

  const [smtp, setSmtp] = useState({ host: "", port: 465, verschluesselung: "ssl", benutzername: "", absenderName: "", absenderEmail: "" });
  const [smtpPasswort, setSmtpPasswort] = useState("");
  const [smtpStatus, setSmtpStatus] = useState("");

  const [github, setGithub] = useState({ owner: "", repo: "", branch: "" });
  const [githubToken, setGithubToken] = useState("");
  const [githubStatus, setGithubStatus] = useState("");
  const [updateInfo, setUpdateInfo] = useState(null);
  const [updatePruefungLaeuft, setUpdatePruefungLaeuft] = useState(false);

  const laden = useCallback(() => {
    ladeJson("/api/einstellungen/merkblatt").then(setMerkblatt).catch(() => setMerkblatt(null));
    ladeJson("/api/einstellungen").then((e) => {
      setEinstellungen(e);
      setPraefix(e.fallnummernPraefix);
      setNaechsteNummer(String(e.naechsteFallnummer));
      setSmtp(e.smtp);
      setGithub(e.github);
    }).catch(() => {});
  }, []);

  useEffect(() => { laden(); }, [laden]);

  async function dateiHochladen(datei) {
    if (!datei) return;
    setHochladeFehler("");
    setHochladeLaeuft(true);
    try {
      const formular = new FormData();
      formular.append("datei", datei);
      await ladeJson("/api/einstellungen/merkblatt", { method: "POST", body: formular });
      laden();
    } catch (fehler) {
      setHochladeFehler(fehler.message);
    } finally {
      setHochladeLaeuft(false);
    }
  }

  async function claudeSpeichern() {
    setClaudeStatus("Speichert …");
    try {
      await ladeJson("/api/einstellungen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anthropicApiKey: claudeKey }),
      });
      setClaudeKey("");
      setClaudeStatus("Gespeichert.");
      laden();
    } catch (fehler) {
      setClaudeStatus(`Fehler: ${fehler.message}`);
    }
  }

  async function claudeVerbindungTesten() {
    setClaudeTestLaeuft(true);
    setClaudeStatus("");
    try {
      const ergebnis = await ladeJson("/api/einstellungen/verbindung-testen", { method: "POST" });
      setClaudeStatus(ergebnis.meldung);
    } catch (fehler) {
      setClaudeStatus(`Fehler: ${fehler.message}`);
    } finally {
      setClaudeTestLaeuft(false);
    }
  }

  async function auftragsnummerSpeichern() {
    setAuftragsnummerStatus("Speichert …");
    try {
      await ladeJson("/api/einstellungen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fallnummernPraefix: praefix, naechsteFallnummer: parseInt(naechsteNummer, 10) || 1 }),
      });
      setAuftragsnummerStatus("Gespeichert.");
      laden();
    } catch (fehler) {
      setAuftragsnummerStatus(`Fehler: ${fehler.message}`);
    }
  }

  async function smtpSpeichern() {
    setSmtpStatus("Speichert …");
    try {
      await ladeJson("/api/einstellungen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ smtp }),
      });
      setSmtpStatus("Gespeichert. Passwort bitte separat als SMTP_PASSWORT in der .env hinterlegen.");
      laden();
    } catch (fehler) {
      setSmtpStatus(`Fehler: ${fehler.message}`);
    }
  }

  async function githubSpeichern() {
    setGithubStatus("Speichert …");
    try {
      await ladeJson("/api/einstellungen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ github, githubToken }),
      });
      setGithubToken("");
      setGithubStatus("Gespeichert.");
      laden();
    } catch (fehler) {
      setGithubStatus(`Fehler: ${fehler.message}`);
    }
  }

  async function nachUpdatesSuchen() {
    setUpdatePruefungLaeuft(true);
    setUpdateInfo(null);
    try {
      const ergebnis = await ladeJson("/api/update/pruefen");
      setUpdateInfo(ergebnis);
    } catch (fehler) {
      setUpdateInfo({ hinweis: `Fehler: ${fehler.message}` });
    } finally {
      setUpdatePruefungLaeuft(false);
    }
  }

  return (
    <div>
      <div className="karte-panel">
        <h3>Merkblatt (KfW) für die U-Wert-Prüfung</h3>
        <p style={{ color: "#5c6b66", fontSize: 13.5 }}>
          Referenzdokument, gegen das hochgeladene Angebote automatisch auf die zulässigen
          U-Werte geprüft werden (siehe Auftragsverwaltung → Unterlagen). Muss eine durchsuchbare
          PDF sein (keine reine Scan-PDF ohne Textebene). Ein neuer Upload ersetzt das bisherige
          Merkblatt.
        </p>

        {merkblatt === undefined && <div className="leer">Lädt …</div>}
        {merkblatt === null && <div className="leer">Noch kein Merkblatt hinterlegt.</div>}
        {merkblatt && (
          <div className="feld-zeile">
            <div className="feld">
              <div className="label">Aktuell hinterlegt</div>
              <a href="/api/einstellungen/merkblatt/datei" target="_blank" rel="noreferrer">{merkblatt.dateiname}</a>
            </div>
            <div className="feld"><div className="label">Hochgeladen am</div>{formatDatum(merkblatt.hochgeladenAm)}</div>
            <div className="feld"><div className="label">Größe</div>{(merkblatt.groesse / 1024).toFixed(0)} KB</div>
          </div>
        )}

        <div style={{ marginTop: 10 }}>
          <Dateiablage onDatei={dateiHochladen} hochladeLaeuft={hochladeLaeuft} accept="application/pdf" />
          {hochladeLaeuft && <div className="leer">Wird hochgeladen und ausgelesen …</div>}
        </div>
        {hochladeFehler && <div className="leer">Fehler: {hochladeFehler}</div>}
      </div>

      <div className="karte-panel">
        <h3>Claude-API</h3>
        <p style={{ color: "#5c6b66", fontSize: 13.5 }}>
          Wird für die automatische Dokumenttyp-Erkennung und die U-Wert-Prüfung genutzt. Der
          Key bleibt ausschließlich serverseitig gespeichert.
        </p>
        <div className="feld-zeile">
          <div className="feld">
            <div className="label">API-Key {einstellungen?.anthropicApiKeyGesetzt ? "(hinterlegt)" : ""}</div>
            <input type="text" placeholder="sk-ant-…" value={claudeKey} onChange={(e) => setClaudeKey(e.target.value)} style={{ minWidth: 320 }} />
          </div>
        </div>
        <button className="aktion" onClick={claudeSpeichern}>Speichern</button>
        <button className="aktion sekundaer" onClick={claudeVerbindungTesten} disabled={claudeTestLaeuft}>
          {claudeTestLaeuft ? "Testet …" : "Verbindung testen"}
        </button>
        {claudeStatus && <div style={{ marginTop: 6, fontSize: 13.5 }}>{claudeStatus}</div>}
      </div>

      <div className="karte-panel">
        <h3>Auftragsnummer</h3>
        <div className="feld-zeile">
          <div className="feld">
            <div className="label">Präfix</div>
            <input type="text" placeholder="EW" value={praefix} onChange={(e) => setPraefix(e.target.value)} style={{ width: 80 }} />
          </div>
          <div className="feld">
            <div className="label">Nächste laufende Nummer</div>
            <input type="number" min="1" value={naechsteNummer} onChange={(e) => setNaechsteNummer(e.target.value)} style={{ width: 120 }} />
          </div>
        </div>
        <button className="aktion" onClick={auftragsnummerSpeichern}>Speichern</button>
        {auftragsnummerStatus && <div style={{ marginTop: 6, fontSize: 13.5 }}>{auftragsnummerStatus}</div>}
      </div>

      <div className="karte-panel">
        <h3>E-Mail-Versand (SMTP)</h3>
        <p style={{ color: "#5c6b66", fontSize: 13.5 }}>
          Für den künftigen automatischen Mailversand (Vergabe-Mitteilung, Bescheid-Weiterleitung,
          Rechnungsversand - siehe README, noch nicht umgesetzt). Passwort steht aus
          Sicherheitsgründen nur lokal in der .env (SMTP_PASSWORT).
        </p>
        <div className="feld-zeile">
          <div className="feld">
            <div className="label">SMTP-Server</div>
            <input type="text" value={smtp.host} onChange={(e) => setSmtp({ ...smtp, host: e.target.value })} />
          </div>
          <div className="feld">
            <div className="label">Port</div>
            <input type="number" value={smtp.port} onChange={(e) => setSmtp({ ...smtp, port: parseInt(e.target.value, 10) || 465 })} style={{ width: 90 }} />
          </div>
          <div className="feld">
            <div className="label">Verschlüsselung</div>
            <select value={smtp.verschluesselung} onChange={(e) => setSmtp({ ...smtp, verschluesselung: e.target.value })}>
              <option value="ssl">SSL/TLS (Port meist 465)</option>
              <option value="starttls">STARTTLS (Port meist 587)</option>
            </select>
          </div>
        </div>
        <div className="feld-zeile">
          <div className="feld">
            <div className="label">Benutzername</div>
            <input type="text" value={smtp.benutzername} onChange={(e) => setSmtp({ ...smtp, benutzername: e.target.value })} />
          </div>
          <div className="feld">
            <div className="label">Absendername</div>
            <input type="text" value={smtp.absenderName} onChange={(e) => setSmtp({ ...smtp, absenderName: e.target.value })} />
          </div>
          <div className="feld">
            <div className="label">Absender-E-Mail-Adresse</div>
            <input type="text" value={smtp.absenderEmail} onChange={(e) => setSmtp({ ...smtp, absenderEmail: e.target.value })} />
          </div>
        </div>
        <button className="aktion" onClick={smtpSpeichern}>Speichern</button>
        {smtpStatus && <div style={{ marginTop: 6, fontSize: 13.5 }}>{smtpStatus}</div>}
      </div>

      <div className="karte-panel">
        <h3>GitHub-Repo (für Aktualisieren)</h3>
        <p style={{ color: "#5c6b66", fontSize: 13.5 }}>
          Wird von Update.bat benutzt, um die neueste Version zu laden. Ein Token ist nur nötig,
          falls das Repository privat ist.
        </p>
        <div className="feld-zeile">
          <div className="feld">
            <div className="label">Owner</div>
            <input type="text" value={github.owner} onChange={(e) => setGithub({ ...github, owner: e.target.value })} />
          </div>
          <div className="feld">
            <div className="label">Repository</div>
            <input type="text" value={github.repo} onChange={(e) => setGithub({ ...github, repo: e.target.value })} />
          </div>
          <div className="feld">
            <div className="label">Branch (leer = Standard-Branch)</div>
            <input type="text" value={github.branch} onChange={(e) => setGithub({ ...github, branch: e.target.value })} />
          </div>
          <div className="feld">
            <div className="label">Zugriffstoken (nur bei privatem Repo nötig) {einstellungen?.githubTokenGesetzt ? "(hinterlegt)" : ""}</div>
            <input type="text" placeholder="unverändert lassen = alten Wert behalten" value={githubToken} onChange={(e) => setGithubToken(e.target.value)} style={{ minWidth: 260 }} />
          </div>
        </div>
        <button className="aktion" onClick={githubSpeichern}>Speichern</button>
        <button className="aktion sekundaer" onClick={nachUpdatesSuchen} disabled={updatePruefungLaeuft}>
          {updatePruefungLaeuft ? "Prüft …" : "Nach Updates suchen"}
        </button>
        {githubStatus && <div style={{ marginTop: 6, fontSize: 13.5 }}>{githubStatus}</div>}
        <p style={{ color: "#5c6b66", fontSize: 12.5, marginTop: 10 }}>
          Prüft nur, ob eine neuere Version vorliegt - installiert nichts automatisch. Eine
          gefundene neue Version muss anschließend manuell über Update.bat (als Administrator)
          installiert werden.
        </p>
        {updateInfo?.installierteVersion && (
          <div style={{ fontSize: 13.5 }}>
            Aktuell installierte Version: Commit {updateInfo.installierteVersion.commit}
            {updateInfo.installierteVersion.branch ? ` (Branch ${updateInfo.installierteVersion.branch})` : ""}
            {updateInfo.installierteVersion.installiertAm ? ` - installiert am ${formatDatum(updateInfo.installierteVersion.installiertAm)}` : ""}
          </div>
        )}
        {updateInfo?.hinweis && <div style={{ fontSize: 13.5, marginTop: 4 }}>{updateInfo.hinweis}</div>}
        {updateInfo?.fehler && <div style={{ fontSize: 13.5, marginTop: 4, color: "#b3261e" }}>Fehler: {updateInfo.fehler}</div>}
      </div>
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
          ["einstellungen", "Einstellungen"],
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
        {reiter === "einstellungen" && <Einstellungen />}
      </main>
    </div>
  );
}
