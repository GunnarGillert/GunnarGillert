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
  if (antwort.status === 204) return null;
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
function Auftragsverwaltung({ startFilter, aufFilterUebernommen, startVorgangId, aufVorgangUebernommen }) {
  const [suche, setSuche] = useState("");
  const [status, setStatus] = useState("");
  const [nurVn, setNurVn] = useState(false);
  const [nurZahlung, setNurZahlung] = useState(false);
  const [vorgaenge, setVorgaenge] = useState([]);
  const [ausgewaehlterVorgang, setAusgewaehlterVorgang] = useState(null);
  const [bafaVorgangsIdEntwurf, setBafaVorgangsIdEntwurf] = useState("");
  const [bafaSpeichernStatus, setBafaSpeichernStatus] = useState("");
  const [uWertBegruendungEntwurf, setUWertBegruendungEntwurf] = useState("");
  const [uWertUeberschreibenStatus, setUWertUeberschreibenStatus] = useState("");
  const [fehler, setFehler] = useState("");
  const [dokumenttypen, setDokumenttypen] = useState([]);
  const [hochladeLaeuft, setHochladeLaeuft] = useState(false);
  const [hochladeFehler, setHochladeFehler] = useState("");
  const [kundenListe, setKundenListe] = useState([]);
  const [neuerAuftrag, setNeuerAuftrag] = useState({ kundeId: "", bafaVorgangsId: "" });
  const [anlegenFehler, setAnlegenFehler] = useState("");
  const [rechnungenDesVorgangs, setRechnungenDesVorgangs] = useState([]);

  useEffect(() => { ladeJson("/api/dokumenttypen").then(setDokumenttypen).catch(() => {}); }, []);
  useEffect(() => { ladeJson("/api/kunden").then(setKundenListe).catch(() => {}); }, []);

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
    setBafaVorgangsIdEntwurf(v.bafaVorgangsId || "");
    setBafaSpeichernStatus("");
    setUWertBegruendungEntwurf("");
    setUWertUeberschreibenStatus("");
    ladeJson(`/api/rechnungen?vorgangId=${id}`).then(setRechnungenDesVorgangs).catch(() => setRechnungenDesVorgangs([]));
  }

  useEffect(() => {
    if (!startVorgangId) return;
    oeffneVorgang(startVorgangId);
    aufVorgangUebernommen();
  }, [startVorgangId]);

  async function bafaIdSpeichern(e) {
    e.preventDefault();
    setBafaSpeichernStatus("Speichert …");
    try {
      await ladeJson(`/api/vorgaenge/${ausgewaehlterVorgang.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bafaVorgangsId: bafaVorgangsIdEntwurf }),
      });
      await oeffneVorgang(ausgewaehlterVorgang.id);
      setBafaSpeichernStatus("Gespeichert.");
      laden();
    } catch (fehler) {
      setBafaSpeichernStatus(`Fehler: ${fehler.message}`);
    }
  }

  async function uWertAufKonformSetzen(e) {
    e.preventDefault();
    if (!uWertBegruendungEntwurf.trim()) {
      setUWertUeberschreibenStatus("Fehler: Begründung ist Pflichtfeld.");
      return;
    }
    setUWertUeberschreibenStatus("Speichert …");
    try {
      await ladeJson(`/api/vorgaenge/${ausgewaehlterVorgang.id}/uwert-pruefung`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ begruendung: uWertBegruendungEntwurf }),
      });
      await oeffneVorgang(ausgewaehlterVorgang.id);
      laden();
    } catch (fehler) {
      setUWertUeberschreibenStatus(`Fehler: ${fehler.message}`);
    }
  }

  async function vorgangLoeschen() {
    if (!window.confirm(`Vorgang "${ausgewaehlterVorgang.id}" wirklich unwiderruflich löschen? Alle hochgeladenen Unterlagen werden mit gelöscht.`)) return;
    try {
      await ladeJson(`/api/vorgaenge/${ausgewaehlterVorgang.id}`, { method: "DELETE" });
      setAusgewaehlterVorgang(null);
      laden();
    } catch (fehler) {
      window.alert("Fehler beim Löschen: " + fehler.message);
    }
  }

  async function auftragAnlegen(e) {
    e.preventDefault();
    const kunde = kundenListe.find((k) => k.id === neuerAuftrag.kundeId);
    if (!kunde) {
      setAnlegenFehler("Bitte einen Kunden auswählen.");
      return;
    }
    setAnlegenFehler("");
    try {
      const v = await ladeJson("/api/vorgaenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kundeId: kunde.id,
          fensterbauerId: kunde.fensterbauerId,
          bafaVorgangsId: neuerAuftrag.bafaVorgangsId,
        }),
      });
      setNeuerAuftrag({ kundeId: "", bafaVorgangsId: "" });
      laden();
      await oeffneVorgang(v.id);
    } catch (fehler) {
      setAnlegenFehler(fehler.message);
    }
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

      <form className="form-neu" onSubmit={auftragAnlegen}>
        <select
          value={neuerAuftrag.kundeId}
          onChange={(e) => setNeuerAuftrag((v) => ({ ...v, kundeId: e.target.value }))}
        >
          <option value="">Kunde wählen …</option>
          {kundenListe.map((k) => (
            <option value={k.id} key={k.id}>{k.vorname} {k.nachname} ({k.fensterbauerName})</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="BAFA-Vorgangs-ID (optional)"
          value={neuerAuftrag.bafaVorgangsId}
          onChange={(e) => setNeuerAuftrag((v) => ({ ...v, bafaVorgangsId: e.target.value }))}
        />
        <button className="aktion" type="submit">Neuer Auftrag</button>
      </form>
      {anlegenFehler && <div className="leer">Fehler: {anlegenFehler}</div>}

      {fehler && <div className="leer">Fehler: {fehler}</div>}

      <table>
        <thead>
          <tr>
            <th>Vorgang</th><th>Kunde</th><th>Fensterbauer</th><th>Status</th>
            <th>U-Wert-Prüfung</th>
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
              <td>
                {v.uWertPruefung ? (
                  <span className={`badge ${UWERT_ERGEBNIS_KLASSE[v.uWertPruefung.ergebnis] || "unbekannt"}`}>
                    {UWERT_ERGEBNIS_LABEL[v.uWertPruefung.ergebnis] || v.uWertPruefung.ergebnis}
                  </span>
                ) : "–"}
              </td>
              <td>{v.bescheid ? formatEuro(v.bescheid.betrag) : "–"}</td>
              <td>{v.rechnung ? formatDatum(v.rechnung.faelligkeitsdatum) : "–"}</td>
              <td>
                {v.verwendungsnachweisUeberfaellig && <span className="badge ueberfaellig">VN</span>}{" "}
                {v.zahlungUeberfaellig && <span className="badge ueberfaellig">Zahlung</span>}
              </td>
            </tr>
          ))}
          {vorgaenge.length === 0 && (
            <tr><td colSpan="8" className="leer">Keine Vorgänge gefunden.</td></tr>
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
            <div className="feld">
              <div className="label">BAFA-Vorgangs-ID</div>
              <form style={{ display: "flex", gap: 6 }} onSubmit={bafaIdSpeichern}>
                <input
                  type="text"
                  style={{ width: 140 }}
                  value={bafaVorgangsIdEntwurf}
                  onChange={(e) => setBafaVorgangsIdEntwurf(e.target.value)}
                />
                <button className="aktion sekundaer" style={{ padding: "2px 8px", fontSize: 12, margin: 0 }} type="submit">
                  Speichern
                </button>
              </form>
              {bafaSpeichernStatus && <span style={{ fontSize: 12, color: "#5c6b66" }}>{bafaSpeichernStatus}</span>}
            </div>
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
                <div className="feld">
                  <div className="label">
                    {ausgewaehlterVorgang.uWertPruefung.gefundeneUWerte.length === 1 ? "Gefundener U-Wert" : "Gefundene U-Werte"}
                  </div>
                  {ausgewaehlterVorgang.uWertPruefung.gefundeneUWerte.length === 1 ? (
                    ausgewaehlterVorgang.uWertPruefung.gefundeneUWerte[0]
                  ) : (
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {ausgewaehlterVorgang.uWertPruefung.gefundeneUWerte.map((wert, i) => <li key={i}>{wert}</li>)}
                    </ul>
                  )}
                </div>
              )}
              {ausgewaehlterVorgang.uWertPruefung.fehler && (
                <div className="feld"><div className="label">Hinweis</div>{ausgewaehlterVorgang.uWertPruefung.fehler}</div>
              )}
            </div>
          ) : (
            <div className="leer">Noch keine Prüfung (läuft automatisch, sobald ein Dokument als „Angebot" hochgeladen bzw. zugeordnet wird).</div>
          )}

          {ausgewaehlterVorgang.uWertPruefung?.manuellUeberschrieben && (
            <div className="leer" style={{ textAlign: "left" }}>
              Manuell auf „konform" gesetzt am {formatDatum(ausgewaehlterVorgang.uWertPruefung.manuellUeberschrieben.wann)}
              {" "}(ursprüngliches Ergebnis: {UWERT_ERGEBNIS_LABEL[ausgewaehlterVorgang.uWertPruefung.manuellUeberschrieben.vorherigesErgebnis] || ausgewaehlterVorgang.uWertPruefung.manuellUeberschrieben.vorherigesErgebnis}).
              Begründung: {ausgewaehlterVorgang.uWertPruefung.manuellUeberschrieben.begruendung}
            </div>
          )}

          {ausgewaehlterVorgang.uWertPruefung && ["unsicher", "nicht_konform"].includes(ausgewaehlterVorgang.uWertPruefung.ergebnis) && (
            <form style={{ marginTop: 6 }} onSubmit={uWertAufKonformSetzen}>
              <div className="feld">
                <div className="label">Trotzdem als konform bestätigen (Begründung Pflicht)</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <input
                    type="text"
                    style={{ minWidth: 280, flex: 1 }}
                    placeholder="z. B. U-Werte händisch mit Herstellerdatenblatt abgeglichen, Grenzwert eingehalten"
                    value={uWertBegruendungEntwurf}
                    onChange={(e) => setUWertBegruendungEntwurf(e.target.value)}
                  />
                  <button className="aktion sekundaer" style={{ margin: 0 }} type="submit">Als konform setzen</button>
                </div>
              </div>
              {uWertUeberschreibenStatus && <div className="leer">{uWertUeberschreibenStatus}</div>}
            </form>
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
            <button className="aktion gefahr" onClick={vorgangLoeschen}>Vorgang löschen</button>
          </div>

          <h3>Rechnungen</h3>
          {rechnungenDesVorgangs.length === 0 ? (
            <div className="leer">Noch keine Rechnungen zu diesem Auftrag erstellt (siehe Reiter „Rechnungen").</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Belegnummer</th><th>Art</th><th>Belegdatum</th><th>Fällig am</th><th>Endbetrag</th><th>Zahlungsstatus</th>
                </tr>
              </thead>
              <tbody>
                {rechnungenDesVorgangs.map((r) => (
                  <tr key={r.id}>
                    <td><a href={`/api/rechnungen/${r.id}/pdf`} target="_blank" rel="noreferrer">{r.belegnummer}</a></td>
                    <td>{r.typ}</td>
                    <td>{formatDatum(r.belegdatum)}</td>
                    <td>{formatDatum(r.faelligkeitsdatum)}</td>
                    <td>{formatEuro(r.endbetrag)}</td>
                    <td><span className={`badge ${r.zahlungsstatus === "bezahlt" ? "status" : "unbekannt"}`}>{r.zahlungsstatus}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

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
                  )}
                </div>
              )}
              <div style={{ marginTop: 4 }}>
                <select onChange={(e) => dokumenttypSetzen(d.id, e.target.value)} value="">
                  <option value="">{d.typ === "unbekannt" ? "Typ manuell wählen …" : "Typ ändern zu …"}</option>
                  {dokumenttypen.filter((t) => t !== "unbekannt" && t !== d.typ).map((t) => <option value={t} key={t}>{t}</option>)}
                </select>
              </div>
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

function Kundenverwaltung({ aufSpringeZuVorgang }) {
  const [suche, setSuche] = useState("");
  const [kunden, setKunden] = useState([]);
  const [fensterbauerListe, setFensterbauerListe] = useState([]);
  const [ausgewaehlt, setAusgewaehlt] = useState(null);
  const [bearbeitung, setBearbeitung] = useState(null);
  const [speichernStatus, setSpeichernStatus] = useState("");
  const [neu, setNeu] = useState({ ...LEERES_KONTAKT_FORMULAR, fensterbauerId: "" });
  const [anlegenFehler, setAnlegenFehler] = useState("");

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
    const { vorname, nachname, firma, strasse, plz, ort, telefon, email, bemerkungen, fensterbauerId } = k;
    setBearbeitung({ vorname, nachname, firma, strasse, plz, ort, telefon, email, bemerkungen, fensterbauerId });
    setSpeichernStatus("");
  }

  async function anlegen(e) {
    e.preventDefault();
    if (!neu.nachname || !neu.fensterbauerId) {
      setAnlegenFehler("Name und Fensterbauer sind Pflichtfelder.");
      return;
    }
    setAnlegenFehler("");
    try {
      await ladeJson("/api/kunden", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(neu),
      });
      setNeu({ ...LEERES_KONTAKT_FORMULAR, fensterbauerId: "" });
      laden();
    } catch (fehler) {
      setAnlegenFehler(fehler.message);
    }
  }

  function feldAendern(feld) {
    return (e) => setNeu((vorher) => ({ ...vorher, [feld]: e.target.value }));
  }

  function bearbeitungsFeldAendern(feld) {
    return (e) => setBearbeitung((vorher) => ({ ...vorher, [feld]: e.target.value }));
  }

  async function speichern(e) {
    e.preventDefault();
    if (!bearbeitung.nachname || !bearbeitung.fensterbauerId) return;
    setSpeichernStatus("Speichert …");
    try {
      const aktualisiert = await ladeJson(`/api/kunden/${ausgewaehlt.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bearbeitung),
      });
      setAusgewaehlt((vorher) => ({ ...vorher, ...aktualisiert }));
      setSpeichernStatus("Gespeichert.");
      laden();
    } catch (fehler) {
      setSpeichernStatus(`Fehler: ${fehler.message}`);
    }
  }

  async function loeschen() {
    if (!window.confirm(`Kunde "${ausgewaehlt.vorname} ${ausgewaehlt.nachname}" wirklich unwiderruflich löschen?`)) return;
    try {
      await ladeJson(`/api/kunden/${ausgewaehlt.id}`, { method: "DELETE" });
      setAusgewaehlt(null);
      laden();
    } catch (fehler) {
      window.alert("Fehler beim Löschen: " + fehler.message);
    }
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
      {anlegenFehler && <div className="leer">Fehler: {anlegenFehler}</div>}

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

      {ausgewaehlt && bearbeitung && (
        <div className="karte-panel">
          <button className="schliessen" onClick={() => setAusgewaehlt(null)}>Schließen ✕</button>
          <h3>{ausgewaehlt.vorname} {ausgewaehlt.nachname}{ausgewaehlt.firma ? ` (${ausgewaehlt.firma})` : ""}</h3>

          <form className="form-neu" onSubmit={speichern}>
            <input type="text" placeholder="Vorname" value={bearbeitung.vorname} onChange={bearbeitungsFeldAendern("vorname")} />
            <input type="text" placeholder="Name" value={bearbeitung.nachname} onChange={bearbeitungsFeldAendern("nachname")} />
            <input type="text" placeholder="Firma" value={bearbeitung.firma} onChange={bearbeitungsFeldAendern("firma")} />
            <input type="text" placeholder="Straße" value={bearbeitung.strasse} onChange={bearbeitungsFeldAendern("strasse")} />
            <input type="text" placeholder="PLZ" value={bearbeitung.plz} onChange={bearbeitungsFeldAendern("plz")} />
            <input type="text" placeholder="Ort" value={bearbeitung.ort} onChange={bearbeitungsFeldAendern("ort")} />
            <input type="text" placeholder="Telefonnummer" value={bearbeitung.telefon} onChange={bearbeitungsFeldAendern("telefon")} />
            <input type="text" placeholder="E-Mail" value={bearbeitung.email} onChange={bearbeitungsFeldAendern("email")} />
            <select value={bearbeitung.fensterbauerId} onChange={bearbeitungsFeldAendern("fensterbauerId")}>
              <option value="">Fensterbauer wählen …</option>
              {fensterbauerListe.map((f) => <option value={f.id} key={f.id}>{f.firma}</option>)}
            </select>
            <input type="text" placeholder="Bemerkungen" value={bearbeitung.bemerkungen} onChange={bearbeitungsFeldAendern("bemerkungen")} />
            <button className="aktion" type="submit">Speichern</button>
            <button className="aktion gefahr" type="button" onClick={loeschen}>Löschen</button>
          </form>
          {speichernStatus && <div className="leer">{speichernStatus}</div>}

          <h3>Vorgänge dieses Kunden</h3>
          {ausgewaehlt.vorgaenge.length === 0 && <div className="leer">Noch keine Vorgänge.</div>}
          {ausgewaehlt.vorgaenge.map((v) => (
            <div className="historie-eintrag klickbar" key={v.id} onClick={() => aufSpringeZuVorgang(v.id)}>
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
function Fensterbauerverwaltung({ aufSpringeZuVorgang }) {
  const [suche, setSuche] = useState("");
  const [liste, setListe] = useState([]);
  const [ausgewaehlt, setAusgewaehlt] = useState(null);
  const [bearbeitung, setBearbeitung] = useState(null);
  const [speichernStatus, setSpeichernStatus] = useState("");
  const [neu, setNeu] = useState({ ...LEERES_KONTAKT_FORMULAR, kuerzel: "" });
  const [anlegenFehler, setAnlegenFehler] = useState("");

  const laden = useCallback(() => {
    const params = new URLSearchParams();
    if (suche) params.set("q", suche);
    ladeJson(`/api/fensterbauer?${params}`).then(setListe).catch(() => {});
  }, [suche]);

  useEffect(() => { laden(); }, [laden]);

  async function oeffne(id) {
    const f = await ladeJson(`/api/fensterbauer/${id}`);
    setAusgewaehlt(f);
    const { vorname, nachname, firma, kuerzel, strasse, plz, ort, telefon, email, bemerkungen, aktiv } = f;
    setBearbeitung({ vorname, nachname, firma, kuerzel, strasse, plz, ort, telefon, email, bemerkungen, aktiv });
    setSpeichernStatus("");
  }

  async function anlegen(e) {
    e.preventDefault();
    if (!neu.firma || !neu.kuerzel) {
      setAnlegenFehler("Firma und Kürzel sind Pflichtfelder.");
      return;
    }
    setAnlegenFehler("");
    try {
      await ladeJson("/api/fensterbauer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(neu),
      });
      setNeu({ ...LEERES_KONTAKT_FORMULAR, kuerzel: "" });
      laden();
    } catch (fehler) {
      setAnlegenFehler(fehler.message);
    }
  }

  function feldAendern(feld) {
    return (e) => setNeu((vorher) => ({ ...vorher, [feld]: e.target.value }));
  }

  function bearbeitungsFeldAendern(feld) {
    return (e) => setBearbeitung((vorher) => ({ ...vorher, [feld]: e.target.value }));
  }

  async function speichern(e) {
    e.preventDefault();
    if (!bearbeitung.firma || !bearbeitung.kuerzel) return;
    setSpeichernStatus("Speichert …");
    try {
      const aktualisiert = await ladeJson(`/api/fensterbauer/${ausgewaehlt.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bearbeitung),
      });
      setAusgewaehlt((vorher) => ({ ...vorher, ...aktualisiert }));
      setSpeichernStatus("Gespeichert.");
      laden();
    } catch (fehler) {
      setSpeichernStatus(`Fehler: ${fehler.message}`);
    }
  }

  async function loeschen() {
    if (!window.confirm(`Fensterbauer "${ausgewaehlt.firma}" wirklich unwiderruflich löschen?`)) return;
    try {
      await ladeJson(`/api/fensterbauer/${ausgewaehlt.id}`, { method: "DELETE" });
      setAusgewaehlt(null);
      laden();
    } catch (fehler) {
      window.alert("Fehler beim Löschen: " + fehler.message);
    }
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
      {anlegenFehler && <div className="leer">Fehler: {anlegenFehler}</div>}

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

      {ausgewaehlt && bearbeitung && (
        <div className="karte-panel">
          <button className="schliessen" onClick={() => setAusgewaehlt(null)}>Schließen ✕</button>
          <h3>{ausgewaehlt.firma} <span style={{ fontWeight: 400, fontSize: 13, color: "#5c6b66" }}>({ausgewaehlt.kuerzel})</span></h3>

          <form className="form-neu" onSubmit={speichern}>
            <input type="text" placeholder="Firma" value={bearbeitung.firma} onChange={bearbeitungsFeldAendern("firma")} />
            <input type="text" placeholder="Kürzel" value={bearbeitung.kuerzel} onChange={bearbeitungsFeldAendern("kuerzel")} />
            <input type="text" placeholder="Vorname (Ansprechpartner)" value={bearbeitung.vorname} onChange={bearbeitungsFeldAendern("vorname")} />
            <input type="text" placeholder="Name (Ansprechpartner)" value={bearbeitung.nachname} onChange={bearbeitungsFeldAendern("nachname")} />
            <input type="text" placeholder="Straße" value={bearbeitung.strasse} onChange={bearbeitungsFeldAendern("strasse")} />
            <input type="text" placeholder="PLZ" value={bearbeitung.plz} onChange={bearbeitungsFeldAendern("plz")} />
            <input type="text" placeholder="Ort" value={bearbeitung.ort} onChange={bearbeitungsFeldAendern("ort")} />
            <input type="text" placeholder="Telefonnummer" value={bearbeitung.telefon} onChange={bearbeitungsFeldAendern("telefon")} />
            <input type="text" placeholder="E-Mail (To/CC)" value={bearbeitung.email} onChange={bearbeitungsFeldAendern("email")} />
            <input type="text" placeholder="Bemerkungen" value={bearbeitung.bemerkungen} onChange={bearbeitungsFeldAendern("bemerkungen")} />
            <label className="filter">
              <input
                type="checkbox"
                checked={bearbeitung.aktiv}
                onChange={(e) => setBearbeitung((vorher) => ({ ...vorher, aktiv: e.target.checked }))}
              />
              Aktiv
            </label>
            <button className="aktion" type="submit">Speichern</button>
            <button className="aktion gefahr" type="button" onClick={loeschen}>Löschen</button>
          </form>
          {speichernStatus && <div className="leer">{speichernStatus}</div>}

          <h3>Zugeordnete Kunden ({ausgewaehlt.kunden.length})</h3>
          {ausgewaehlt.kunden.map((k) => (
            <div className="historie-eintrag" key={k.id}>{k.vorname} {k.nachname}</div>
          ))}
          <h3>Vorgänge ({ausgewaehlt.vorgaenge.length})</h3>
          {ausgewaehlt.vorgaenge.map((v) => (
            <div className="historie-eintrag klickbar" key={v.id} onClick={() => aufSpringeZuVorgang(v.id)}>
              {v.id} — {STATUS_LABEL[v.status] || v.status}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Rechnungsverwaltung - selbst erstellte Rechnungen (z. B. Energieberatung
// an den Kunden), unabhängig von den unter "Unterlagen" hochgeladenen
// FREMDEN Rechnungen (Dokumenttypen "Rechnung Lieferant"/"Rechnung
// Energieberatung").
// ----------------------------------------------------------------------------
const LEERE_RECHNUNGSPOSITION = { menge: 1, einheit: "", artikelNr: "", leistung: "", einzelpreis: "" };

function Rechnungsverwaltung({ aufSpringeZuVorgang }) {
  const [rechnungen, setRechnungen] = useState([]);
  const [vorgaenge, setVorgaenge] = useState([]);
  const [artikelListe, setArtikelListe] = useState([]);
  const [neu, setNeu] = useState({
    vorgangId: "", typ: "Energieberatung", belegdatum: new Date().toISOString().slice(0, 10),
    mwstSatz: 19, positionen: [{ ...LEERE_RECHNUNGSPOSITION }],
  });
  const [anlegenFehler, setAnlegenFehler] = useState("");
  const [anlegenLaeuft, setAnlegenLaeuft] = useState(false);
  const [neuerArtikel, setNeuerArtikel] = useState({ artikelNr: "", bezeichnung: "", einheit: "", einzelpreis: "" });
  const [artikelFehler, setArtikelFehler] = useState("");

  const laden = useCallback(() => {
    ladeJson("/api/rechnungen").then(setRechnungen).catch(() => {});
  }, []);
  useEffect(() => { laden(); }, [laden]);
  useEffect(() => { ladeJson("/api/vorgaenge").then(setVorgaenge).catch(() => {}); }, []);

  const artikelLaden = useCallback(() => {
    ladeJson("/api/artikel").then(setArtikelListe).catch(() => {});
  }, []);
  useEffect(() => { artikelLaden(); }, [artikelLaden]);

  function positionAendern(index, feld, wert) {
    setNeu((vorher) => ({
      ...vorher,
      positionen: vorher.positionen.map((p, i) => (i === index ? { ...p, [feld]: wert } : p)),
    }));
  }
  function positionHinzufuegen() {
    setNeu((vorher) => ({ ...vorher, positionen: [...vorher.positionen, { ...LEERE_RECHNUNGSPOSITION }] }));
  }
  function positionEntfernen(index) {
    setNeu((vorher) => ({ ...vorher, positionen: vorher.positionen.filter((_, i) => i !== index) }));
  }
  function artikelUebernehmen(index, artikelId) {
    const artikel = artikelListe.find((a) => a.id === artikelId);
    if (!artikel) return;
    setNeu((vorher) => ({
      ...vorher,
      positionen: vorher.positionen.map((p, i) => (i === index ? {
        ...p,
        artikelNr: artikel.artikelNr,
        leistung: artikel.bezeichnung,
        einheit: artikel.einheit,
        einzelpreis: artikel.einzelpreis,
      } : p)),
    }));
  }

  async function artikelAnlegen(e) {
    e.preventDefault();
    if (!neuerArtikel.bezeichnung.trim()) {
      setArtikelFehler("Bezeichnung ist Pflichtfeld.");
      return;
    }
    setArtikelFehler("");
    try {
      await ladeJson("/api/artikel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...neuerArtikel, einzelpreis: Number(neuerArtikel.einzelpreis) || 0 }),
      });
      setNeuerArtikel({ artikelNr: "", bezeichnung: "", einheit: "", einzelpreis: "" });
      artikelLaden();
    } catch (fehler) {
      setArtikelFehler(fehler.message);
    }
  }

  async function artikelLoeschen(id, bezeichnung) {
    if (!window.confirm(`Artikel "${bezeichnung}" wirklich löschen?`)) return;
    try {
      await ladeJson(`/api/artikel/${id}`, { method: "DELETE" });
      artikelLaden();
    } catch (fehler) {
      window.alert("Fehler beim Löschen: " + fehler.message);
    }
  }

  const summeNetto = neu.positionen.reduce((s, p) => s + (Number(p.menge) || 0) * (Number(p.einzelpreis) || 0), 0);
  const mwstBetrag = summeNetto * ((Number(neu.mwstSatz) || 0) / 100);
  const endbetrag = summeNetto + mwstBetrag;

  async function anlegen(e) {
    e.preventDefault();
    if (!neu.vorgangId) {
      setAnlegenFehler("Bitte einen Auftrag auswählen.");
      return;
    }
    setAnlegenFehler("");
    setAnlegenLaeuft(true);
    try {
      await ladeJson("/api/rechnungen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(neu),
      });
      setNeu({
        vorgangId: "", typ: "Energieberatung", belegdatum: new Date().toISOString().slice(0, 10),
        mwstSatz: 19, positionen: [{ ...LEERE_RECHNUNGSPOSITION }],
      });
      laden();
    } catch (fehler) {
      setAnlegenFehler(fehler.message);
    } finally {
      setAnlegenLaeuft(false);
    }
  }

  async function zahlungsstatusUmschalten(rechnung) {
    const neuerStatus = rechnung.zahlungsstatus === "bezahlt" ? "offen" : "bezahlt";
    try {
      await ladeJson(`/api/rechnungen/${rechnung.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zahlungsstatus: neuerStatus }),
      });
      laden();
    } catch (fehler) {
      window.alert("Fehler: " + fehler.message);
    }
  }

  async function loeschen(id, belegnummer) {
    if (!window.confirm(`Rechnung "${belegnummer}" wirklich unwiderruflich löschen?`)) return;
    try {
      await ladeJson(`/api/rechnungen/${id}`, { method: "DELETE" });
      laden();
    } catch (fehler) {
      window.alert("Fehler beim Löschen: " + fehler.message);
    }
  }

  function vorgangLabel(vorgangId) {
    const v = vorgaenge.find((vv) => vv.id === vorgangId);
    return v ? `${v.id} — ${v.kundeName}` : vorgangId;
  }

  return (
    <div>
      <div className="karte-panel">
        <h3>Neue Rechnung</h3>
        <form onSubmit={anlegen}>
          <div className="feld-zeile">
            <div className="feld">
              <div className="label">Auftrag</div>
              <select value={neu.vorgangId} onChange={(e) => setNeu({ ...neu, vorgangId: e.target.value })}>
                <option value="">Auftrag wählen …</option>
                {vorgaenge.map((v) => <option value={v.id} key={v.id}>{v.id} — {v.kundeName}</option>)}
              </select>
            </div>
            <div className="feld">
              <div className="label">Rechnungsart</div>
              <select value={neu.typ} onChange={(e) => setNeu({ ...neu, typ: e.target.value })}>
                <option value="Energieberatung">Energieberatung</option>
                <option value="Lieferant">Lieferant</option>
              </select>
            </div>
            <div className="feld">
              <div className="label">Belegdatum</div>
              <input type="date" value={neu.belegdatum} onChange={(e) => setNeu({ ...neu, belegdatum: e.target.value })} />
            </div>
            <div className="feld">
              <div className="label">MwSt-Satz (%)</div>
              <input type="number" min="0" max="100" step="0.5" value={neu.mwstSatz} onChange={(e) => setNeu({ ...neu, mwstSatz: e.target.value })} style={{ width: 80 }} />
            </div>
          </div>

          <div className="label" style={{ marginTop: 10, marginBottom: 4 }}>Positionen</div>
          {neu.positionen.map((pos, i) => (
            <div key={i} style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6, alignItems: "flex-end" }}>
              {artikelListe.length > 0 && (
                <div className="feld" style={{ width: 190 }}>
                  <div className="label">Artikel übernehmen</div>
                  <select value="" onChange={(e) => e.target.value && artikelUebernehmen(i, e.target.value)}>
                    <option value="">Artikel wählen …</option>
                    {artikelListe.map((a) => (
                      <option value={a.id} key={a.id}>{a.artikelNr ? `${a.artikelNr} — ${a.bezeichnung}` : a.bezeichnung}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="feld" style={{ width: 64 }}>
                <div className="label">Menge</div>
                <input type="number" min="0" step="0.01" value={pos.menge} onChange={(e) => positionAendern(i, "menge", e.target.value)} />
              </div>
              <div className="feld" style={{ width: 70 }}>
                <div className="label">Einheit</div>
                <input type="text" placeholder="Stk" value={pos.einheit} onChange={(e) => positionAendern(i, "einheit", e.target.value)} />
              </div>
              <div className="feld" style={{ width: 90 }}>
                <div className="label">Artikel-Nr.</div>
                <input type="text" value={pos.artikelNr} onChange={(e) => positionAendern(i, "artikelNr", e.target.value)} />
              </div>
              <div className="feld" style={{ flex: 1, minWidth: 220 }}>
                <div className="label">Leistung</div>
                <input type="text" value={pos.leistung} onChange={(e) => positionAendern(i, "leistung", e.target.value)} />
              </div>
              <div className="feld" style={{ width: 110 }}>
                <div className="label">Einzelpreis (EUR)</div>
                <input type="number" min="0" step="0.01" value={pos.einzelpreis} onChange={(e) => positionAendern(i, "einzelpreis", e.target.value)} />
              </div>
              <div className="feld" style={{ width: 100 }}>
                <div className="label">Gesamtpreis</div>
                {formatEuro((Number(pos.menge) || 0) * (Number(pos.einzelpreis) || 0))}
              </div>
              {neu.positionen.length > 1 && (
                <button type="button" className="aktion gefahr" style={{ padding: "6px 10px", margin: 0 }} onClick={() => positionEntfernen(i)}>
                  ✕
                </button>
              )}
            </div>
          ))}
          <button type="button" className="aktion sekundaer" onClick={positionHinzufuegen}>+ Position hinzufügen</button>

          <div className="feld-zeile" style={{ marginTop: 10 }}>
            <div className="feld"><div className="label">Summe Netto</div>{formatEuro(summeNetto)}</div>
            <div className="feld"><div className="label">MwSt-Betrag</div>{formatEuro(mwstBetrag)}</div>
            <div className="feld"><div className="label">Endbetrag</div><strong>{formatEuro(endbetrag)}</strong></div>
          </div>
          <p style={{ color: "#5c6b66", fontSize: 12.5, marginBottom: 10 }}>
            Die Fälligkeit wird automatisch berechnet (Belegdatum + 10 Tage - "Der Rechnungsbetrag ist
            innerhalb 10 Tagen ohne Abzug zahlbar") und am Auftrag hinterlegt.
          </p>

          <button className="aktion" type="submit" disabled={anlegenLaeuft}>
            {anlegenLaeuft ? "Wird erstellt …" : "Rechnung erstellen"}
          </button>
        </form>
        {anlegenFehler && <div className="leer">Fehler: {anlegenFehler}</div>}
      </div>

      <div className="karte-panel">
        <h3>Artikelliste</h3>
        <p style={{ color: "#5c6b66", fontSize: 12.5, marginTop: -6, marginBottom: 10 }}>
          Häufig verwendete Artikel/Leistungen mit Preis - über "Artikel übernehmen" bei einer Position oben
          schnell in eine Rechnung übernehmbar.
        </p>
        <form onSubmit={artikelAnlegen} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 }}>
          <div className="feld" style={{ width: 90 }}>
            <div className="label">Artikel-Nr.</div>
            <input type="text" value={neuerArtikel.artikelNr} onChange={(e) => setNeuerArtikel({ ...neuerArtikel, artikelNr: e.target.value })} />
          </div>
          <div className="feld" style={{ flex: 1, minWidth: 220 }}>
            <div className="label">Bezeichnung</div>
            <input type="text" value={neuerArtikel.bezeichnung} onChange={(e) => setNeuerArtikel({ ...neuerArtikel, bezeichnung: e.target.value })} />
          </div>
          <div className="feld" style={{ width: 70 }}>
            <div className="label">Einheit</div>
            <input type="text" placeholder="Stk" value={neuerArtikel.einheit} onChange={(e) => setNeuerArtikel({ ...neuerArtikel, einheit: e.target.value })} />
          </div>
          <div className="feld" style={{ width: 110 }}>
            <div className="label">Einzelpreis (EUR)</div>
            <input type="number" min="0" step="0.01" value={neuerArtikel.einzelpreis} onChange={(e) => setNeuerArtikel({ ...neuerArtikel, einzelpreis: e.target.value })} />
          </div>
          <button className="aktion sekundaer" type="submit" style={{ margin: 0 }}>+ Artikel hinzufügen</button>
        </form>
        {artikelFehler && <div className="leer">Fehler: {artikelFehler}</div>}

        {artikelListe.length === 0 ? (
          <div className="leer">Noch keine Artikel hinterlegt.</div>
        ) : (
          <table>
            <thead>
              <tr><th>Artikel-Nr.</th><th>Bezeichnung</th><th>Einheit</th><th>Einzelpreis</th><th></th></tr>
            </thead>
            <tbody>
              {artikelListe.map((a) => (
                <tr key={a.id}>
                  <td>{a.artikelNr}</td>
                  <td>{a.bezeichnung}</td>
                  <td>{a.einheit}</td>
                  <td>{formatEuro(a.einzelpreis)}</td>
                  <td>
                    <button className="aktion gefahr" style={{ padding: "2px 8px", fontSize: 12, margin: 0 }} onClick={() => artikelLoeschen(a.id, a.bezeichnung)}>
                      Löschen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <table>
        <thead>
          <tr>
            <th>Belegnummer</th><th>Auftrag</th><th>Art</th><th>Belegdatum</th>
            <th>Fällig am</th><th>Endbetrag</th><th>Zahlungsstatus</th><th></th>
          </tr>
        </thead>
        <tbody>
          {rechnungen.map((r) => (
            <tr key={r.id}>
              <td><a href={`/api/rechnungen/${r.id}/pdf`} target="_blank" rel="noreferrer">{r.belegnummer}</a></td>
              <td>
                <span style={{ cursor: "pointer", color: "var(--gruen)", textDecoration: "underline" }} onClick={() => aufSpringeZuVorgang(r.vorgangId)}>
                  {vorgangLabel(r.vorgangId)}
                </span>
              </td>
              <td>{r.typ}</td>
              <td>{formatDatum(r.belegdatum)}</td>
              <td>{formatDatum(r.faelligkeitsdatum)}</td>
              <td>{formatEuro(r.endbetrag)}</td>
              <td>
                <span
                  className={`badge ${r.zahlungsstatus === "bezahlt" ? "status" : "unbekannt"}`}
                  style={{ cursor: "pointer" }}
                  onClick={() => zahlungsstatusUmschalten(r)}
                  title="Klicken zum Umschalten"
                >
                  {r.zahlungsstatus}
                </span>
              </td>
              <td>
                <button className="aktion gefahr" style={{ padding: "2px 8px", fontSize: 12, margin: 0 }} onClick={() => loeschen(r.id, r.belegnummer)}>
                  Löschen
                </button>
              </td>
            </tr>
          ))}
          {rechnungen.length === 0 && <tr><td colSpan="8" className="leer">Noch keine Rechnungen erstellt.</td></tr>}
        </tbody>
      </table>
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

  const [firmendaten, setFirmendaten] = useState({ firmenname: "", strasse: "", plz: "", ort: "", ustId: "" });
  const [rechnungPraefix, setRechnungPraefix] = useState("");
  const [naechsteRechnungsnummer, setNaechsteRechnungsnummer] = useState("");
  const [firmendatenStatus, setFirmendatenStatus] = useState("");

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
      setFirmendaten(e.firmendaten);
      setRechnungPraefix(e.rechnungPraefix);
      setNaechsteRechnungsnummer(String(e.naechsteRechnungsnummer));
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

  async function firmendatenSpeichern() {
    setFirmendatenStatus("Speichert …");
    try {
      await ladeJson("/api/einstellungen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firmendaten,
          rechnungPraefix,
          naechsteRechnungsnummer: parseInt(naechsteRechnungsnummer, 10) || 1,
        }),
      });
      setFirmendatenStatus("Gespeichert.");
      laden();
    } catch (fehler) {
      setFirmendatenStatus(`Fehler: ${fehler.message}`);
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
        <h3>Firmendaten &amp; Rechnungsnummer</h3>
        <p style={{ color: "#5c6b66", fontSize: 13.5 }}>
          Absenderangaben für den Briefkopf einer im Reiter „Rechnungen" selbst erstellten Rechnung.
        </p>
        <div className="feld-zeile">
          <div className="feld">
            <div className="label">Firmenname</div>
            <input type="text" value={firmendaten.firmenname} onChange={(e) => setFirmendaten({ ...firmendaten, firmenname: e.target.value })} />
          </div>
          <div className="feld">
            <div className="label">Straße</div>
            <input type="text" value={firmendaten.strasse} onChange={(e) => setFirmendaten({ ...firmendaten, strasse: e.target.value })} />
          </div>
          <div className="feld">
            <div className="label">PLZ</div>
            <input type="text" value={firmendaten.plz} onChange={(e) => setFirmendaten({ ...firmendaten, plz: e.target.value })} style={{ width: 80 }} />
          </div>
          <div className="feld">
            <div className="label">Ort</div>
            <input type="text" value={firmendaten.ort} onChange={(e) => setFirmendaten({ ...firmendaten, ort: e.target.value })} />
          </div>
          <div className="feld">
            <div className="label">USt-IdNr.</div>
            <input type="text" value={firmendaten.ustId} onChange={(e) => setFirmendaten({ ...firmendaten, ustId: e.target.value })} />
          </div>
        </div>
        <div className="feld-zeile">
          <div className="feld">
            <div className="label">Rechnungsnummer-Präfix</div>
            <input type="text" placeholder="RE" value={rechnungPraefix} onChange={(e) => setRechnungPraefix(e.target.value)} style={{ width: 80 }} />
          </div>
          <div className="feld">
            <div className="label">Nächste laufende Nummer</div>
            <input type="number" min="1" value={naechsteRechnungsnummer} onChange={(e) => setNaechsteRechnungsnummer(e.target.value)} style={{ width: 120 }} />
          </div>
        </div>
        <button className="aktion" onClick={firmendatenSpeichern}>Speichern</button>
        {firmendatenStatus && <div style={{ marginTop: 6, fontSize: 13.5 }}>{firmendatenStatus}</div>}
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
  const [auftraegeVorgangId, setAuftraegeVorgangId] = useState(null);

  function springeZuAuftraegen(filter) {
    setAuftraegeFilter(filter);
    setReiter("auftraege");
  }

  function springeZuVorgang(vorgangId) {
    setAuftraegeVorgangId(vorgangId);
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
          ["rechnungen", "Rechnungen"],
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
            startVorgangId={auftraegeVorgangId}
            aufVorgangUebernommen={() => setAuftraegeVorgangId(null)}
          />
        )}
        {reiter === "kunden" && <Kundenverwaltung aufSpringeZuVorgang={springeZuVorgang} />}
        {reiter === "fensterbauer" && <Fensterbauerverwaltung aufSpringeZuVorgang={springeZuVorgang} />}
        {reiter === "rechnungen" && <Rechnungsverwaltung aufSpringeZuVorgang={springeZuVorgang} />}
        {reiter === "einstellungen" && <Einstellungen />}
      </main>
    </div>
  );
}
