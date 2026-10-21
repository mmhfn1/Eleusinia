; Windows keeps showing an app's old icon from its icon cache after an update replaces the exe. Refreshing it after
; every install and update makes the taskbar, Start menu and desktop shortcut show the current icon.
!macro customInstall
  nsExec::Exec '"$SYSDIR\ie4uinit.exe" -show'
!macroend
