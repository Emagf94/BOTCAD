Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
currentDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = currentDir
WshShell.Run chr(34) & currentDir & "\iniciar-bot-24-7.bat" & chr(34), 0
Set WshShell = Nothing
Set fso = Nothing
