Add-Type -AssemblyName System.Windows.Forms | Out-Null

# Filtert zusaetzlich zu "server.js" auch auf "Energiewerk" im Kommandozeilen-
# bzw. Pfadstring, damit auf demselben Server laufende Schwesterprogramme
# (Parkwerk, Farbwerk - gleicher Aufbau, ebenfalls server.js) nicht
# versehentlich mit beendet werden.
$prozesse = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*server.js*" -and $_.CommandLine -like "*Energiewerk*" }

if ($prozesse) {
    foreach ($p in $prozesse) {
        Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
    }
    [System.Windows.Forms.MessageBox]::Show(
        "Energiewerk wurde beendet.", "Energiewerk",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Information
    ) | Out-Null
} else {
    [System.Windows.Forms.MessageBox]::Show(
        "Energiewerk laeuft aktuell nicht.", "Energiewerk",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Information
    ) | Out-Null
}
