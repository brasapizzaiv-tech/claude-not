# Ícone na bandeja (perto do relógio) que roda o agente em segundo plano,
# mostra o status e reinicia sozinho se ele cair. Menu: Ver log / Reiniciar / Sair.
$dir = $PSScriptRoot
if (-not $dir) { $dir = Split-Path -Parent $MyInvocation.MyCommand.Definition }

# Qualquer erro de inicialização vai para este arquivo (ajuda no suporte).
trap {
  try { Add-Content -Path (Join-Path $dir "bandeja-erro.log") -Value ("[" + (Get-Date) + "] " + $_.Exception.Message) } catch {}
  Start-Sleep -Seconds 2
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$node   = Join-Path $dir "node.exe"
$script = Join-Path $dir "agente.mjs"
$log    = Join-Path $dir "agente.log"

try { Set-Content -Path (Join-Path $dir "bandeja.pid") -Value $PID -Encoding ascii } catch {}

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
}

Start-Agente

$icon = New-Object System.Windows.Forms.NotifyIcon
$icon.Icon    = [System.Drawing.SystemIcons]::Information
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
    $icon.Text = "Agente: reiniciando..."
  } else {
    $icon.Text = "Agente de Impressao: rodando"
  }
})
$timer.Start()

$icon.ShowBalloonTip(2000, "Agente de Impressao", "Rodando em segundo plano.", [System.Windows.Forms.ToolTipIcon]::Info)

[System.Windows.Forms.Application]::Run((New-Object System.Windows.Forms.ApplicationContext))
