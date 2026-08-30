' Inicia o agente de impressão SEM abrir janela (roda em segundo plano).
Set sh  = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = dir
' 0 = janela oculta ; False = não espera terminar
sh.Run """" & dir & "\node.exe"" """ & dir & "\agente.mjs""", 0, False
