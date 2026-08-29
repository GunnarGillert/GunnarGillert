Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
Set objShell = CreateObject("WScript.Shell")

objShell.Run "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & scriptDir & "\Stop.ps1""", 0, False
