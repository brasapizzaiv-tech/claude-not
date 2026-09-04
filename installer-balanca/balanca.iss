; Instalador do Agente da Balança (Brasa / white-label).
; Compile com: ISCC.exe balanca.iss  (após rodar build.ps1, que monta build\app).

#define AppName "Agente da Balanca"
#define AppVer "1.0.0"
#define AppPublisher "Brasa Sistemas"

[Setup]
AppName={#AppName}
AppVersion={#AppVer}
AppPublisher={#AppPublisher}
DefaultDirName={autopf}\AgenteBalanca
DisableProgramGroupPage=yes
DisableDirPage=auto
UninstallDisplayName={#AppName}
OutputDir=Output
OutputBaseFilename=AgenteBalanca-Setup
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
Name: "{commonstartup}\Agente da Balanca"; Filename: "{app}\start.vbs"; WorkingDir: "{app}"

[Code]
var
  PageCfg: TInputQueryWizardPage;

procedure InitializeWizard;
begin
  PageCfg := CreateInputQueryPage(wpSelectDir,
    'Configuração do sistema',
    'Informe os dados de acesso',
    'Esses dados estão na Central de Impressões do seu sistema. O programa lê a balança na porta serial e cria as comandas.');
  PageCfg.Add('Endereço do sistema (ex.: https://www.brasarestaurante.com.br):', False);
  PageCfg.Add('Token (código de acesso do agente):', False);
  PageCfg.Add('Porta serial da balança ("auto" acha sozinho; ou COM5):', False);
  PageCfg.Values[0] := 'https://www.brasarestaurante.com.br';
  PageCfg.Values[2] := 'auto';
end;

function BaseUrl(): String;
begin
  Result := Trim(PageCfg.Values[0]);
end;

function Token(): String;
begin
  Result := Trim(PageCfg.Values[1]);
end;

function PortaSerial(): String;
begin
  Result := Trim(PageCfg.Values[2]);
  if Result = '' then Result := 'auto';
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
       '  "portaHttp": 8543,' + #13#10 +
       '  "portaSerial": "' + PortaSerial() + '"' + #13#10 +
       '}' + #13#10;
  SaveStringToFile(ExpandConstant('{app}\config.json'), s, False);
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  rc: Integer;
begin
  if CurStep = ssPostInstall then
  begin
    { Não sobrescreve a config numa atualização (mantém token/porta já gravados). }
    if (Token() <> '') then GravarConfig();
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
