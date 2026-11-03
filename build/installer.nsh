!macro customInstall
  MessageBox MB_YESNO|MB_ICONQUESTION "Should Interactive Wallpaper run automatically after each computer restart (Run on Startup)?" IDNO noAutoStart
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Interactive Wallpaper" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}"'
    Goto doneAutoStart
  noAutoStart:
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Interactive Wallpaper"
  doneAutoStart:
!macroend

!macro customUnInstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Interactive Wallpaper"
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "Interactive Wallpaper"
!macroend

