; Instalador do Agente TEF (Brasa / white-label). Roda em cada PC de caixa com pinpad.
; Compile com: ISCC.exe tef.iss  (após rodar build.ps1, que monta build\app).

#define AppName "Agente TEF"
#define AppVer "0.9.0"
#define AppPublisher "Brasa Sistemas"

[Setup]
AppName={#AppName}
AppVersion={#AppVer}
AppPublisher={#AppPublisher}
DefaultDirName={autopf}\AgenteTEF
DisableProgramGroupPage=yes
DisableDirPage=auto
UninstallDisplayName={#AppName}
OutputDir=Output
OutputBaseFilename=AgenteTEF-Setup
Compression=lzma2/ultra64
SolidCompression=yes
LZMAUseSeparateProcess=yes
PrivilegesRequired=admin
WizardStyle=modern
ArchitecturesInstallIn64BitMode=x64compatible
SetupIconFile=tef.ico
UninstallDisplayIcon={app}\tef.ico

[Languages]
Name: "pt"; MessagesFile: "compiler:Languages\Portuguese.isl"

[Files]
Source: "build\app\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion
Source: "tef.ico"; DestDir: "{app}"; Flags: ignoreversion

[Dirs]
; Dados do agente (log, fila, impressora escolhida): todo usuário pode escrever.
Name: "{commonappdata}\AgenteTEF"; Permissions: users-modify

[Icons]
; Atalho na Inicialização (Todos os usuários) -> liga o agente oculto a cada logon.
Name: "{commonstartup}\Agente TEF"; Filename: "{app}\start.vbs"; WorkingDir: "{app}"
; Menu Iniciar e Área de trabalho: pra ligar de novo depois de "Sair" na bandeja.
Name: "{commonprograms}\Agente TEF"; Filename: "wscript.exe"; Parameters: """{app}\start.vbs"""; WorkingDir: "{app}"; IconFilename: "{app}\tef.ico"; Comment: "Liga o Agente TEF (ícone na bandeja)"
Name: "{commondesktop}\Agente TEF"; Filename: "wscript.exe"; Parameters: """{app}\start.vbs"""; WorkingDir: "{app}"; IconFilename: "{app}\tef.ico"; Comment: "Liga o Agente TEF (ícone na bandeja)"

[Code]
var
  PageCfg: TInputQueryWizardPage;

procedure InitializeWizard;
begin
  PageCfg := CreateInputQueryPage(wpSelectDir,
    'Configuração do sistema',
    'Informe os dados de acesso',
    'Esses dados estão na Central de Impressões do seu sistema. O programa liga o caixa ao pinpad pelo gerenciador de TEF (Elgin TEF Hub) instalado neste PC.');
  PageCfg.Add('Endereço do sistema (ex.: https://www.brasarestaurante.com.br):', False);
  PageCfg.Add('Token (código de acesso do agente):', False);
  PageCfg.Add('Nome deste terminal (ex.: CAIXA1):', False);
  PageCfg.Add('Pasta do TEF (onde o gerenciador troca os arquivos):', False);
  PageCfg.Values[0] := 'https://www.brasarestaurante.com.br';
  PageCfg.Values[2] := 'CAIXA1';
  PageCfg.Values[3] := 'C:\Cliente';
end;

function BaseUrl(): String;
begin
  Result := Trim(PageCfg.Values[0]);
end;

function Token(): String;
begin
  Result := Trim(PageCfg.Values[1]);
end;

function Terminal(): String;
begin
  Result := Trim(PageCfg.Values[2]);
  if Result = '' then Result := 'CAIXA1';
end;

{ No JSON a barra precisa ser dupla. }
function PastaTef(): String;
begin
  Result := Trim(PageCfg.Values[3]);
  if Result = '' then Result := 'C:\Cliente';
  StringChangeEx(Result, '\', '\\', True);
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
  if LoadStringFromFile(ExpandConstant('{commonappdata}\AgenteTEF\bandeja.pid'), pid) then
    Exec('taskkill.exe', '/F /PID ' + Trim(String(pid)), '', SW_HIDE, ewWaitUntilTerminated, rc);
  if LoadStringFromFile(ExpandConstant('{commonappdata}\AgenteTEF\agente.pid'), pid) then
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
       '  "portaHttp": 8544,' + #13#10 +
       '  "terminal": "' + Terminal() + '",' + #13#10 +
       '  "pastaTef": "' + PastaTef() + '"' + #13#10 +
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
