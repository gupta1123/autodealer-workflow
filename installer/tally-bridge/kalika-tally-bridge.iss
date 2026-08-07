#define AppName "Kalika Tally Connector"
#define AppVersion "0.1.40"
#define AppPublisher "Kalika"
#define AppInstallDir "C:\Autodealer\tally-bridge"
#define AppExeName "Kalika Tally Connector.exe"
#define DebitNoteTdl "kalika-native-debit-note-export.tdl"
#define PurchaseDocumentTdl "kalika-purchase-document-attachment.tdl"

[Setup]
AppId={{7C2D55CC-4AF4-4E8D-8F7D-77DD3D41A45F}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
UninstallDisplayName={#AppName}
DefaultDirName={#AppInstallDir}
DisableProgramGroupPage=yes
DisableWelcomePage=no
DisableReadyPage=no
OutputDir=output
UsePreviousAppDir=no
OutputBaseFilename=KalikaTallyConnectorSetup
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
Uninstallable=yes
CloseApplications=yes
RestartApplications=no
SetupLogging=yes
VersionInfoCompany={#AppPublisher}
VersionInfoDescription={#AppName} Setup
VersionInfoProductName={#AppName}
VersionInfoProductVersion={#AppVersion}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[InstallDelete]
Type: filesandordirs; Name: "{app}\*"

[Files]
Source: "payload-clean\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Registry]
Root: HKCU; Subkey: "Software\Classes\kalika-tally"; ValueType: string; ValueName: ""; ValueData: "URL:Kalika Tally Protocol"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\kalika-tally"; ValueType: string; ValueName: "URL Protocol"; ValueData: ""
Root: HKCU; Subkey: "Software\Classes\kalika-tally\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#AppExeName},0"
Root: HKCU; Subkey: "Software\Classes\kalika-tally\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#AppExeName}"" ""%1"""

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExeName}"

[Run]
Filename: "{app}\{#AppExeName}"; Description: "Launch {#AppName}"; Flags: nowait postinstall skipifsilent

[Code]
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
begin
  Exec(ExpandConstant('{cmd}'), '/C taskkill /F /IM "Kalika Tally Connector.exe" >nul 2>&1', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Result := '';
end;

procedure CopyTdlToTally(const FileName: String);
var
  TallyDir: String;
  SourceTdl: String;
  TargetTdl: String;
begin
  TallyDir := ExpandConstant('{pf}\TallyPrime');
  SourceTdl := ExpandConstant('{app}\tdl\') + FileName;
  TargetTdl := TallyDir + '\' + FileName;
  if DirExists(TallyDir) and FileExists(SourceTdl) then
  begin
    if CopyFile(SourceTdl, TargetTdl, False) then
      Log('Copied TDL to ' + TargetTdl)
    else
      Log('Could not copy TDL to ' + TargetTdl + '; canonical copy remains at ' + SourceTdl);
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    CopyTdlToTally('{#DebitNoteTdl}');
    CopyTdlToTally('{#PurchaseDocumentTdl}');
  end;
end;
