' Lance le lanceur Claude pleine page (serveur local Node + fenetre du navigateur) sans aucune console.
Dim f, d
Set f = CreateObject("Scripting.FileSystemObject")
d = f.GetParentFolderName(WScript.ScriptFullName)
CreateObject("WScript.Shell").Run "cmd.exe /c node """ & d & "\lanceur\serveur.mjs""", 0, False
