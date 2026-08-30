; Instalador do Agente de Impressão (Brasa / white-label).
; Compile com: ISCC.exe agente.iss  (após rodar build.ps1, que monta build\app).

#define AppName "Agente de Impressao"
#define AppVer "1.0.0"
#define AppPublisher "Brasa Sistemas"
#define TaskName "AgenteImpressao"

[Setup]
AppName={#AppName}
AppVersion={#AppVer}
AppPublisher={#AppPublisher}
DefaultDirName={autopf}\AgenteImpressao
DisableProgramGroupPage=yes
DisableDirPage=auto
UninstallDisplayName={#AppName}
OutputDir=Output
OutputBaseFilename=AgenteImpressao-Setup
Compression=lzma2
SolidCompression=yes
PrivilegesRequired=admin
WizardStyle=modern
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "pt"; MessagesFile: "compiler:Languages\Portuguese.isl"

[Files]
Source: "build\app\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
; Atalho na Inicialização (Todos os usuários) -> liga o agente oculto a cada logon.
Name: "{commonstartup}\Agente de Impressao"; Filename: "{app}\start.vbs"; WorkingDir: "{app}"

[Code]
var
  PageCfg: TInputQueryWizardPage;

procedure InitializeWizard;
begin
  PageCfg := CreateInputQueryPage(wpSelectDir,
    'Configuração do sistema',
    'Informe os dados de acesso',
    'Esses dados foram fornecidos junto com o seu sistema. O programa usa eles para receber as etiquetas.');
  PageCfg.Add('Endereço do sistema (ex.: https://sistema.suaempresa.com.br):', False);
  PageCfg.Add('Token (código de acesso):', False);
end;

function BaseUrl(): String;
begin
  Result := Trim(PageCfg.Values[0]);
end;

function Token(): String;
begin
  Result := Trim(PageCfg.Values[1]);
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if CurPageID = PageCfg.ID then
  begin
    if BaseUrl() = '' then
    begin
      MsgBox('Informe o endereço do sistema.', mbError, MB_OK);
      Result := False;
    end
    else if Token() = '' then
    begin
      MsgBox('Informe o token (código de acesso).', mbError, MB_OK);
      Result := False;
    end;
  end;
end;

{ Antes de copiar os arquivos, para o agente que já estiver rodando (senão o
  node.exe fica travado e a atualização falha). }
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  pid: AnsiString;
  rc: Integer;
begin
  Result := '';
  if LoadStringFromFile(ExpandConstant('{app}\bandeja.pid'), pid) then
    Exec('taskkill.exe', '/F /PID ' + Trim(String(pid)), '', SW_HIDE, ewWaitUntilTerminated, rc);
  if LoadStringFromFile(ExpandConstant('{app}\agente.pid'), pid) then
    Exec('taskkill.exe', '/F /PID ' + Trim(String(pid)), '', SW_HIDE, ewWaitUntilTerminated, rc);
  Sleep(700);
end;

procedure GravarConfig();
var
  s: String;
begin
  s := '{' + #13#10 +
       '  "baseUrl": "' + BaseUrl() + '",' + #13#10 +
       '  "token": "' + Token() + '",' + #13#10 +
       '  "intervaloMs": 3000' + #13#10 +
       '}' + #13#10;
  SaveStringToFile(ExpandConstant('{app}\config.json'), s, False);
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  rc: Integer;
begin
  if CurStep = ssPostInstall then
  begin
    GravarConfig();
    { Liga agora, sem esperar reiniciar (no boot, o atalho da Inicializacao cuida) }
    Exec('wscript.exe', '"' + ExpandConstant('{app}\start.vbs') + '"', '', SW_HIDE, ewNoWait, rc);
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  rc: Integer;
  pid: AnsiString;
begin
  if CurUninstallStep = usUninstall then
  begin
    { Primeiro para a bandeja (senão ela reinicia o agente), depois o agente. }
    if LoadStringFromFile(ExpandConstant('{app}\bandeja.pid'), pid) then
      Exec('taskkill.exe', '/F /PID ' + Trim(String(pid)), '', SW_HIDE, ewWaitUntilTerminated, rc);
    if LoadStringFromFile(ExpandConstant('{app}\agente.pid'), pid) then
      Exec('taskkill.exe', '/F /PID ' + Trim(String(pid)), '', SW_HIDE, ewWaitUntilTerminated, rc);
  end;
end;
