$ErrorActionPreference = 'Stop'
$taskWorkspace = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$taskVersion = (Get-Content -LiteralPath (Join-Path $taskWorkspace 'package.json') -Raw | ConvertFrom-Json).version
$taskTarget = Join-Path $taskWorkspace 'test-results\installed-app'
$taskInstaller = Join-Path $taskWorkspace "release\offline-kit\EGE Cosmos Setup $taskVersion.exe"
if ($env:COSMOS_INSTALLER_APP_ONLY -eq '1') {
  $taskInstaller = Join-Path $taskWorkspace "release\EGE Cosmos Setup $taskVersion.exe"
}
$taskProfile = Join-Path $env:APPDATA 'EGE Cosmos Studio\learning-state.v1.json'
$taskBefore = if (Test-Path -LiteralPath $taskProfile) { (Get-FileHash -LiteralPath $taskProfile -Algorithm SHA256).Hash } else { $null }
$taskReport = [ordered]@{
  version = $taskVersion; status = 'running'; startedAt = [DateTime]::UtcNow.ToString('o');
  installer = $taskInstaller; target = $taskTarget; learningProfileSha256Before = $taskBefore;
  modelCopy = if ($env:COSMOS_INSTALLER_APP_ONLY -eq '1') { 'Skipped: app-only installer location; verified local weights restored separately.' } else { 'Offline kit beside installer' };
  command = 'NSIS /S /D=<workspace>\test-results\installed-app';
  limit = 'Actual silent installation over the prior Cosmos version. No account credentials read or copied. Runtime model responses and visual UI checks are separate.'
}
if (!(Test-Path -LiteralPath $taskInstaller)) { throw 'The current offline installer is missing.' }
$taskInstallerHash = (Get-FileHash -LiteralPath $taskInstaller -Algorithm SHA256).Hash
$taskProcess = Start-Process -FilePath $taskInstaller -ArgumentList "/S /D=$taskTarget" -WindowStyle Hidden -PassThru
$taskProcess.WaitForExit()
$taskReport.exitCode = $taskProcess.ExitCode
$taskReport.installerSha256 = $taskInstallerHash
if ($taskProcess.ExitCode -ne 0) { throw "Installer exit code: $($taskProcess.ExitCode)" }
$taskReport.learningProfileSha256After = if (Test-Path -LiteralPath $taskProfile) { (Get-FileHash -LiteralPath $taskProfile -Algorithm SHA256).Hash } else { $null }
if ($taskReport.learningProfileSha256After -ne $taskBefore) { throw 'The installer changed the learning profile.' }
$taskReport.asarSha256 = (Get-FileHash -LiteralPath (Join-Path $taskTarget 'resources\app.asar') -Algorithm SHA256).Hash
$taskReport.exeSha256 = (Get-FileHash -LiteralPath (Join-Path $taskTarget 'EGE Cosmos.exe') -Algorithm SHA256).Hash
$taskShortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) 'EGE Cosmos.lnk'
$taskShell = New-Object -ComObject WScript.Shell
$taskReport.shortcutTarget = $taskShell.CreateShortcut($taskShortcut).TargetPath
if ($taskReport.shortcutTarget -ne (Join-Path $taskTarget 'EGE Cosmos.exe')) { throw 'The desktop shortcut points to another executable.' }
$taskReport.finishedAt = [DateTime]::UtcNow.ToString('o')
$taskReport.status = 'pass'
$taskReport | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $taskWorkspace "docs\verification\installer-$taskVersion.json") -Encoding utf8
$taskReport | ConvertTo-Json -Depth 5
