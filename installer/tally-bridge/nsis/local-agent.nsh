!macro customInit
  nsExec::ExecToLog 'taskkill /F /IM "Kalika Tally Connector.exe"'
  nsExec::ExecToLog 'taskkill /F /IM "Kalika Local Agent.exe"'
!macroend

!macro customInstall
  nsExec::ExecToStack 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\resources\powershell\install-managed-tdl.ps1" -AgentResourceDirectory "$INSTDIR\resources"'
  Pop $0
  Pop $1
  ${If} $0 != 0
    MessageBox MB_ICONEXCLAMATION|MB_OK "Kalika Local Agent was installed, but Tally add-on configuration needs attention.$\r$\n$1"
  ${EndIf}
!macroend

!macro customUnInstall
  ; Local Agent data is intentionally retained across uninstall and upgrade.
  ; Users can remove it deliberately through Factory reset inside the agent.
!macroend
