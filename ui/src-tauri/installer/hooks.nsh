; Extra step for the Liam installer: set the company host names and the DNS rule for names under digitalx.srt
; (needs administrator, which the installer already has). Liam trusts the company CA inside the app, so no certificate is installed.
; The work is done by liam-setup.exe (a plain program) because endpoint protection on company PCs
; blocks PowerShell. A PC whose DNS already resolves the company names does not need this, so a
; failure is noted in the install log but does not interrupt the installation.

!macro NSIS_HOOK_POSTINSTALL
  DetailPrint "Setting up the company host names and DNS..."
  nsExec::ExecToStack '"$INSTDIR\installer\liam-setup.exe" install'
  Pop $0
  Pop $1
  DetailPrint "Company host names: exit code $0 $1"
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  nsExec::ExecToLog '"$INSTDIR\installer\liam-setup.exe" uninstall'
  Pop $0
!macroend
