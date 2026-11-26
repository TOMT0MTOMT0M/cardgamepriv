' Lance la fenetre a boutons sans aucune console (Windows Terminal affichait des fenetres vides).
Dim f, d
Set f = CreateObject("Scripting.FileSystemObject")
d = f.GetParentFolderName(WScript.ScriptFullName)
CreateObject("WScript.Shell").Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & d & "\lanceur-claude.ps1""", 0, False
