#define AppName "Kalika Tally Bridge"
#define AppVersion "0.1.1"
#define AppPublisher "Kalika"
#define AppInstallDir "C:\Autodealer\tally-bridge"

[Setup]
AppId={{7C2D55CC-4AF4-4E8D-8F7D-77DD3D41A45F}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={#AppInstallDir}
DisableProgramGroupPage=yes
OutputDir=output
UsePreviousAppDir=no
OutputBaseFilename=KalikaTallyBridgeSetup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
Uninstallable=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "payload\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Registry]
Root: HKCU; Subkey: "Software\Classes\kalika-tally"; ValueType: string; ValueName: ""; ValueData: "URL:Kalika Tally Protocol"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\kalika-tally"; ValueType: string; ValueName: "URL Protocol"; ValueData: ""
Root: HKCU; Subkey: "Software\Classes\kalika-tally\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\Kalika Tally Connector.exe,0"
Root: HKCU; Subkey: "Software\Classes\kalika-tally\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\Kalika Tally Connector.exe"" ""%1"""
