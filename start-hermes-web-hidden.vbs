Option Explicit

Dim fso, shell, scriptDir, startScript, powerShellExe, cmd, i

Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
startScript = fso.BuildPath(scriptDir, "start-hermes-web.ps1")
powerShellExe = shell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\WindowsPowerShell\v1.0\powershell.exe"

cmd = QuoteArg(powerShellExe) & " -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File " & QuoteArg(startScript) & " -Detached"
For i = 0 To WScript.Arguments.Count - 1
  cmd = cmd & " " & QuoteArg(WScript.Arguments(i))
Next

shell.Run cmd, 0, False

Function QuoteArg(value)
  QuoteArg = """" & CStr(value) & """"
End Function
