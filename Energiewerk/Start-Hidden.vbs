Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
Set objShell = CreateObject("WScript.Shell")

' Fensterstil 0 = komplett unsichtbar. "False" am Ende = nicht warten,
' damit dieses Skript sofort beendet und das Programm im Hintergrund
' weiterlaeuft.
objShell.Run "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & scriptDir & "\Start.ps1""", 0, False
