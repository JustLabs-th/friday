; Extra steps for the Liam installer: trust the company CA and set the company host names.
; The installer runs per machine (administrator), which both steps need.

!macro NSIS_HOOK_POSTINSTALL
  DetailPrint "Setting up the company network (certificate and host names)..."
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\installer\network.ps1" -Action install'
  Pop $0
  ${If} $0 != 0
    MessageBox MB_OK|MB_ICONEXCLAMATION "Liam was installed, but the company network setup did not finish. Liam will not reach company services until it is fixed. Details: $TEMP\liam-network-setup.log"
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\installer\network.ps1" -Action uninstall'
  Pop $0
!macroend
