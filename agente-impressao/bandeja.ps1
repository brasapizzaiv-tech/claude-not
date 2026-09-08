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
$menu.Items.Add("-") | Out-Null
$miSair = $menu.Items.Add("Sair")
$icon.ContextMenuStrip = $menu

$miLog.add_Click({ if (Test-Path $log) { Start-Process notepad.exe $log } })
$miRe.add_Click({
  try { if ($global:proc -and -not $global:proc.HasExited) { $global:proc.Kill() } } catch {}
  Start-Agente
  $icon.ShowBalloonTip(1500, "Agente de Impressao", "Reiniciado.", [System.Windows.Forms.ToolTipIcon]::Info)
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
