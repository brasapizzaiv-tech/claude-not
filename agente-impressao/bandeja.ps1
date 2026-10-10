# Ícone na bandeja (perto do relógio) que roda o agente de impressão em segundo
# plano, mostra o status e reinicia sozinho se ele cair. Menu: Ver log / Reiniciar / Sair.
$dir = $PSScriptRoot
if (-not $dir) { $dir = Split-Path -Parent $MyInvocation.MyCommand.Definition }

# Dados graváveis (log, pids) ficam em ProgramData — Program Files é só leitura.
$dataDir = if ($env:ProgramData) { Join-Path $env:ProgramData "AgenteImpressao" } else { $dir }
try { New-Item -ItemType Directory -Force -Path $dataDir | Out-Null } catch {}

# Qualquer erro de inicialização vai para este arquivo (ajuda no suporte).
trap {
  try { Add-Content -Path (Join-Path $dataDir "bandeja-erro.log") -Value ("[" + (Get-Date) + "] " + $_.Exception.Message) } catch {}
  Start-Sleep -Seconds 2
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$node   = Join-Path $dir "node.exe"
$script = Join-Path $dir "agente.mjs"
$log    = Join-Path $dataDir "agente.log"

# Já tem uma bandeja rodando? (clicou no atalho duas vezes) Então não abre outra.
# Só considera "já rodando" se o processo com aquele número for esta bandeja mesmo
# (depois de religar o PC o Windows reaproveita números de processo).
$pidFile = Join-Path $dataDir "bandeja.pid"
try {
  if (Test-Path $pidFile) {
    $old = (Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
    if ($old -and ([int]$old -ne $PID)) {
      $p = Get-CimInstance Win32_Process -Filter ("ProcessId = " + [int]$old) -ErrorAction SilentlyContinue
      if ($p -and $p.CommandLine -and ($p.CommandLine -like "*bandeja.ps1*")) { exit }
    }
  }
} catch {}
try { Set-Content -Path $pidFile -Value $PID -Encoding ascii } catch {}
try { Add-Content -Path $log -Value ("[" + (Get-Date -Format "dd/MM/yyyy, HH:mm:ss") + "] Bandeja iniciada (logon do Windows ou atalho).") } catch {}

$global:proc = $null
function Start-Agente {
  if ($global:proc -and -not $global:proc.HasExited) { return }
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName         = $node
  $psi.Arguments        = '"' + $script + '"'
  $psi.WorkingDirectory = $dir
  $psi.CreateNoWindow   = $true
  $psi.UseShellExecute  = $false
  $psi.WindowStyle      = 'Hidden'
  $global:proc = [System.Diagnostics.Process]::Start($psi)
  try { Set-Content -Path (Join-Path $dataDir "agente.pid") -Value $global:proc.Id -Encoding ascii } catch {}
}

Start-Agente

$icon = New-Object System.Windows.Forms.NotifyIcon
$icon.Icon    = [System.Drawing.SystemIcons]::Information
try {
  $icoFile = Join-Path $dir "brasa.ico"
  if (Test-Path $icoFile) { $icon.Icon = New-Object System.Drawing.Icon($icoFile) }
} catch {}
$icon.Text    = "Agente de Impressao"
$icon.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip
$miLog  = $menu.Items.Add("Ver log")
$miRe   = $menu.Items.Add("Reiniciar agente")
$miPonto = $menu.Items.Add("Relogio de ponto...")
$menu.Items.Add("-") | Out-Null
$miSair = $menu.Items.Add("Sair")
$icon.ContextMenuStrip = $menu

$miLog.add_Click({ if (Test-Path $log) { Start-Process notepad.exe $log } })
$miRe.add_Click({
  try { if ($global:proc -and -not $global:proc.HasExited) { $global:proc.Kill() } } catch {}
  Start-Agente
  $icon.ShowBalloonTip(1500, "Agente de Impressao", "Reiniciado.", [System.Windows.Forms.ToolTipIcon]::Info)
})
# Relogio de ponto (Control iD): IP, usuario e senha do painel do relogio.
# Grava relogio.json em ProgramData (so neste PC) e reinicia o agente.
$miPonto.add_Click({
  $arq = Join-Path $dataDir "relogio.json"
  $atual = @{ host = "192.168.1.129"; usuario = ""; senha = ""; intervaloMin = 5 }
  try {
    if (Test-Path $arq) {
      $j = Get-Content $arq -Raw | ConvertFrom-Json
      if ($j.host) { $atual.host = $j.host }
      if ($j.usuario) { $atual.usuario = $j.usuario }
      if ($j.senha) { $atual.senha = $j.senha }
      if ($j.intervaloMin) { $atual.intervaloMin = $j.intervaloMin }
    }
  } catch {}

  $f = New-Object System.Windows.Forms.Form
  $f.Text = "Relogio de ponto"
  $f.Size = New-Object System.Drawing.Size(380, 260)
  $f.StartPosition = "CenterScreen"
  $f.FormBorderStyle = "FixedDialog"
  $f.MaximizeBox = $false
  $f.MinimizeBox = $false
  $f.TopMost = $true

  $info = New-Object System.Windows.Forms.Label
  $info.Text = "Dados de entrada do painel do relogio (o mesmo usuario e senha que voce usa no navegador)."
  $info.Location = New-Object System.Drawing.Point(12, 10)
  $info.Size = New-Object System.Drawing.Size(345, 32)
  $f.Controls.Add($info)

  $campos = @()
  $rotulos = @("IP do relogio", "Usuario", "Senha")
  $valores = @($atual.host, $atual.usuario, $atual.senha)
  for ($i = 0; $i -lt 3; $i++) {
    $l = New-Object System.Windows.Forms.Label
    $l.Text = $rotulos[$i]
    $l.Location = New-Object System.Drawing.Point(12, (52 + $i * 34))
    $l.Size = New-Object System.Drawing.Size(100, 22)
    $f.Controls.Add($l)
    $t = New-Object System.Windows.Forms.TextBox
    $t.Location = New-Object System.Drawing.Point(115, (50 + $i * 34))
    $t.Size = New-Object System.Drawing.Size(235, 22)
    $t.Text = [string]$valores[$i]
    if ($i -eq 2) { $t.UseSystemPasswordChar = $true }
    $f.Controls.Add($t)
    $campos += $t
  }

  $ok = New-Object System.Windows.Forms.Button
  $ok.Text = "Salvar"
  $ok.Location = New-Object System.Drawing.Point(194, 162)
  $ok.Size = New-Object System.Drawing.Size(75, 28)
  $ok.DialogResult = [System.Windows.Forms.DialogResult]::OK
  $f.Controls.Add($ok)
  $f.AcceptButton = $ok
  $cancel = New-Object System.Windows.Forms.Button
  $cancel.Text = "Cancelar"
  $cancel.Location = New-Object System.Drawing.Point(275, 162)
  $cancel.Size = New-Object System.Drawing.Size(75, 28)
  $cancel.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
  $f.Controls.Add($cancel)
  $f.CancelButton = $cancel

  if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
    $novo = [ordered]@{
      host = $campos[0].Text.Trim()
      usuario = $campos[1].Text.Trim()
      senha = $campos[2].Text
      intervaloMin = $atual.intervaloMin
    }
    try {
      ($novo | ConvertTo-Json) | Set-Content -Path $arq -Encoding utf8
      try { if ($global:proc -and -not $global:proc.HasExited) { $global:proc.Kill() } } catch {}
      Start-Agente
      $icon.ShowBalloonTip(2500, "Relogio de ponto", "Salvo. O agente le o relogio a cada 5 minutos (veja no log).", [System.Windows.Forms.ToolTipIcon]::Info)
    } catch {
      [System.Windows.Forms.MessageBox]::Show("Nao consegui salvar: " + $_.Exception.Message) | Out-Null
    }
  }
})

$miSair.add_Click({
  try { if ($global:proc -and -not $global:proc.HasExited) { $global:proc.Kill() } } catch {}
  try { Remove-Item $pidFile -Force -ErrorAction SilentlyContinue } catch {}
  $icon.Visible = $false
  [System.Windows.Forms.Application]::Exit()
})

$icon.add_DoubleClick({ if (Test-Path $log) { Start-Process notepad.exe $log } })

# Vigia o agente: reinicia se cair e atualiza o tooltip.
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 5000
$timer.add_Tick({
  if (-not $global:proc -or $global:proc.HasExited) {
    Start-Agente
    $icon.Text = "Agente de Impressao: reiniciando..."
  } else {
    $icon.Text = "Agente de Impressao: rodando"
  }
})
$timer.Start()

$icon.ShowBalloonTip(2000, "Agente de Impressao", "Rodando em segundo plano.", [System.Windows.Forms.ToolTipIcon]::Info)

[System.Windows.Forms.Application]::Run((New-Object System.Windows.Forms.ApplicationContext))
