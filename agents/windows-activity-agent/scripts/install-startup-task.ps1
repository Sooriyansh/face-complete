param(
  [string]$TaskName = "FaceAIWindowsActivityAgent"
)

$ErrorActionPreference = "Stop"

$agentRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$node = (Get-Command node.exe -ErrorAction Stop).Source
$script = Join-Path $agentRoot "src\agent.js"

$action = New-ScheduledTaskAction -Execute $node -Argument "`"$script`"" -WorkingDirectory $agentRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -MultipleInstances IgnoreNew

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -RunLevel Highest `
  -Description "FaceAI real Windows employee activity tracking agent." `
  -Force | Out-Null

Write-Host "Registered scheduled task '$TaskName' for $agentRoot"
