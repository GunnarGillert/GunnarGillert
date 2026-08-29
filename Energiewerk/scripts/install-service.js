// Installiert Energiewerk als Windows-Dienst, damit es auf einem Server
// läuft, ohne dass sich jemand interaktiv anmelden muss (nötig für
// Server-Betrieb, im Unterschied zu Start-Hidden.vbs, das eine laufende
// Desktop-Sitzung voraussetzt). Nutzt node-windows (bringt winsw.exe mit,
// kein separater Download nötig).
//
// Aufruf: node scripts\install-service.js  (als Administrator)

const path = require("path");
const { Service } = require("node-windows");

const svc = new Service({
  name: "Energiewerk",
  description: "Energiewerk - BAFA-Förderprozessverwaltung für Fensterbauer (Maler Luft)",
  script: path.join(__dirname, "..", "server.js"),
  workingDirectory: path.join(__dirname, ".."),
  // Node-Prozess bei Absturz automatisch neu starten
  maxRestarts: 10,
  wait: 2,
});

svc.on("install", () => {
  console.log("Dienst 'Energiewerk' wurde installiert und wird gestartet ...");
  svc.start();
});

svc.on("alreadyinstalled", () => {
  console.log("Dienst 'Energiewerk' ist bereits installiert.");
});

svc.on("start", () => {
  console.log("Dienst 'Energiewerk' läuft jetzt.");
  console.log("Status/Verwaltung: Windows-Dienste (services.msc) -> 'Energiewerk'.");
});

svc.on("error", (err) => {
  console.error("Fehler bei der Dienst-Installation:", err);
});

svc.install();
