// Entfernt den Energiewerk-Windows-Dienst wieder (z. B. vor einem Update,
// das die Programmdateien überschreibt, oder um zurück auf
// Start-Hidden.vbs umzusteigen).
//
// Aufruf: node scripts\uninstall-service.js  (als Administrator)

const path = require("path");
const { Service } = require("node-windows");

const svc = new Service({
  name: "Energiewerk",
  script: path.join(__dirname, "..", "server.js"),
});

svc.on("uninstall", () => {
  console.log("Dienst 'Energiewerk' wurde entfernt.");
});

svc.on("error", (err) => {
  console.error("Fehler beim Entfernen des Dienstes:", err);
});

svc.uninstall();
