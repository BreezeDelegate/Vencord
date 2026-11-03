!ifndef BUILD_SHA
  !error "Pass -DBUILD_SHA=..."
!endif
!ifndef BASE_INSTALLER
  !error "Pass -DBASE_INSTALLER=..."
!endif
Unicode true
!include "MUI2.nsh"
Name "Breeze Vencord 2026.11.03"
OutFile "BreezeVencord-${BUILD_SHA}.exe"
RequestExecutionLevel user
ShowInstDetails show
InstallDir "$APPDATA\Vencord"
!define MUI_ABORTWARNING
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_LANGUAGE "English"
Section "Install Breeze Vencord"
  DetailPrint "Launching the bundled Breeze Vencord Discord installer"
  InitPluginsDir
  SetOutPath "$PLUGINSDIR"
  File /oname=BaseVencordInstaller.exe "${BASE_INSTALLER}"
  ExecWait '"$PLUGINSDIR\BaseVencordInstaller.exe"' $0
  IntCmp $0 0 +3
    MessageBox MB_ICONSTOP "The base Vencord installer returned an error. The new runtime has not been copied."
    Abort
  IfFileExists "$APPDATA\Vencord\dist\patcher.js" +3 0
    MessageBox MB_ICONSTOP "Base installation was not found. Complete Install/Reinstall in the Vencord installer first."
    Abort
  DetailPrint "Verifying that Discord Stable was actually patched"
  FindFirst $R1 $R2 "$LOCALAPPDATA\Discord\app-*"
  breeze_scan_stable:
    StrCmp $R2 "" breeze_no_stable
    IfFileExists "$LOCALAPPDATA\Discord\$R2\resources\_app.asar" breeze_patched 0
    FindNext $R1 $R2
    Goto breeze_scan_stable
  breeze_no_stable:
    FindClose $R1
    MessageBox MB_ICONSTOP "Vencord injection is missing from Discord Stable. In the base installer choose Discord Stable and click Install/Reinstall."
    Abort
  breeze_patched:
    FindClose $R1
  DetailPrint "Saving a rollback copy of existing Vencord runtime"
  CreateDirectory "$APPDATA\Vencord\BreezeBackup\setup-${BUILD_SHA}"
  CopyFiles /SILENT "$APPDATA\Vencord\dist\patcher.js" "$APPDATA\Vencord\BreezeBackup\setup-${BUILD_SHA}"
  CopyFiles /SILENT "$APPDATA\Vencord\dist\preload.js" "$APPDATA\Vencord\BreezeBackup\setup-${BUILD_SHA}"
  CopyFiles /SILENT "$APPDATA\Vencord\dist\renderer.js" "$APPDATA\Vencord\BreezeBackup\setup-${BUILD_SHA}"
  CopyFiles /SILENT "$APPDATA\Vencord\dist\renderer.css" "$APPDATA\Vencord\BreezeBackup\setup-${BUILD_SHA}"
  ClearErrors
  SetOutPath "$APPDATA\Vencord\dist"
  File "../../dist/patcher.js"
  File "../../dist/preload.js"
  File "../../dist/renderer.js"
  File "../../dist/renderer.css"
  IfErrors 0 +3
    MessageBox MB_ICONSTOP "Unable to copy the runtime. Close Discord and run this installer again."
    Abort
  DetailPrint "Breeze Vencord runtime ${BUILD_SHA} installed. Restart Discord fully."
SectionEnd
