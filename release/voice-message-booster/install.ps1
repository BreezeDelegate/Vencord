param(
    [ValidateSet("Auto", "Stable", "PTB", "Canary")]
    [string]$DiscordChannel = "Auto",
    [switch]$NoRestart,
    [switch]$NoPause
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

if ($env:OS -ne "Windows_NT") { throw "Cet installateur fonctionne uniquement sous Windows." }
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false) } catch { }
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Product = "VoiceMessageBooster"
$Root = Join-Path $env:LOCALAPPDATA $Product
$DataRoot = Join-Path $Root "VencordData"
$DistRoot = Join-Path $DataRoot "dist"
$ToolsRoot = Join-Path $Root "Tools"
$LogsRoot = Join-Path $Root "Logs"
$BundleDist = Join-Path $PSScriptRoot "dist"
$ManifestPath = Join-Path $PSScriptRoot "manifest.json"
$InstallerCli = Join-Path $ToolsRoot "VencordInstallerCli.exe"
$InstallerUrl = "https://github.com/Vencord/Installer/releases/latest/download/VencordInstallerCli.exe"
$LogFile = Join-Path $LogsRoot ("install-{0}.log" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
$script:Step = 0
$TotalSteps = 6

New-Item -ItemType Directory -Force -Path $Root, $DataRoot, $ToolsRoot, $LogsRoot | Out-Null

function Log([string]$Text) {
    Add-Content -LiteralPath $LogFile -Value ("[{0}] {1}" -f (Get-Date -Format "HH:mm:ss"), $Text) -Encoding UTF8
}
function Line([string]$Prefix, [string]$Text, [ConsoleColor]$Color) {
    Write-Host $Prefix -NoNewline -ForegroundColor $Color
    Write-Host $Text
    Log ($Prefix + $Text)
}
function Info([string]$Text) { Line "  i  " $Text Cyan }
function Ok([string]$Text) { Line "  +  " $Text Green }
function Warn([string]$Text) { Line "  !  " $Text Yellow }
function Fail([string]$Text) { Line "  x  " $Text Red }
function Step([string]$Text) {
    $script:Step++
    Write-Host ""
    Write-Host ("[{0}/{1}] " -f $script:Step, $TotalSteps) -NoNewline -ForegroundColor DarkCyan
    Write-Host $Text -ForegroundColor White
    Log ("STEP {0}/{1}: {2}" -f $script:Step, $TotalSteps, $Text)
}
function Banner {
    Clear-Host
    Write-Host ""
    Write-Host "  ============================================================" -ForegroundColor DarkCyan
    Write-Host "       VOICE MESSAGE BOOSTER - INSTALLATEUR VENCORD" -ForegroundColor Cyan
    Write-Host "             build précompilé par GitHub Actions" -ForegroundColor DarkGray
    Write-Host "  ============================================================" -ForegroundColor DarkCyan
    Write-Host ""
    Write-Host ("  Journal : {0}" -f $LogFile) -ForegroundColor DarkGray
}
function Quote([string]$Value) {
    if ($null -eq $Value -or $Value.Length -eq 0) { return '""' }
    if ($Value -notmatch '[\s"]') { return $Value }
    return '"' + ($Value -replace '(\\*)"', '$1$1\"' -replace '(\\+)$', '$1$1') + '"'
}
function Run([string]$File, [string[]]$Args, [string]$Activity, [string]$Working = $PSScriptRoot) {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $File
    $psi.Arguments = (($Args | ForEach-Object { Quote ([string]$_) }) -join " ")
    $psi.WorkingDirectory = $Working
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    Log ("RUN: {0} {1}" -f $File, $psi.Arguments)

    $p = New-Object System.Diagnostics.Process
    $p.StartInfo = $psi
    if (-not $p.Start()) { throw "Impossible de lancer $File" }
    $frames = @("|", "/", "-", "\")
    $i = 0
    while (-not $p.WaitForExit(150)) {
        Write-Host ("`r  {0}  {1}" -f $frames[$i % 4], $Activity) -NoNewline -ForegroundColor Cyan
        $i++
    }
    $out = $p.StandardOutput.ReadToEnd()
    $err = $p.StandardError.ReadToEnd()
    $code = [int]$p.ExitCode
    $p.Dispose()
    Write-Host ("`r" + (" " * 100) + "`r") -NoNewline
    if ($out) { Add-Content -LiteralPath $LogFile -Value $out -Encoding UTF8 }
    if ($err) { Add-Content -LiteralPath $LogFile -Value $err -Encoding UTF8 }
    if ($code -ne 0) {
        @($out, $err) -join "`n" -split "`r?`n" | Where-Object { $_ } | Select-Object -Last 12 | ForEach-Object { Write-Host ("    " + $_) -ForegroundColor DarkGray }
        throw ("{0} a échoué avec le code {1}." -f $Activity, $code)
    }
    Ok $Activity
}
function Check-Bundle {
    $required = @("patcher.js", "preload.js", "renderer.js", "renderer.css")
    foreach ($name in $required) {
        if (-not (Test-Path -LiteralPath (Join-Path $BundleDist $name))) { throw "Fichier manquant : dist\$name" }
    }
    if (-not (Test-Path -LiteralPath $ManifestPath)) { Warn "Manifest absent : contrôle SHA-256 ignoré."; return }
    $manifest = Get-Content -LiteralPath $ManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($entry in $manifest.files.PSObject.Properties) {
        $path = Join-Path $PSScriptRoot (($entry.Name) -replace '/', '\')
        if (-not (Test-Path -LiteralPath $path)) { throw "Fichier absent du package : $($entry.Name)" }
        $actual = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash
        if ($actual -ne [string]$entry.Value) { throw "SHA-256 invalide : $($entry.Name)" }
    }
    Ok ("Intégrité vérifiée, commit {0}." -f $manifest.sourceCommit)
}
function Install-Build {
    if (Test-Path -LiteralPath $DistRoot) { Remove-Item -LiteralPath $DistRoot -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $DistRoot | Out-Null
    Copy-Item -Path (Join-Path $BundleDist "*") -Destination $DistRoot -Recurse -Force
    Set-Content -LiteralPath (Join-Path $DistRoot "package.json") -Value "{}" -Encoding ASCII
    if (Test-Path -LiteralPath $ManifestPath) { Copy-Item -LiteralPath $ManifestPath -Destination (Join-Path $DataRoot "manifest.json") -Force }
    Ok ("Build copié dans {0}." -f $DataRoot)
}
function Get-Installer {
    $tmp = $InstallerCli + ".download"
    Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
    Info "Téléchargement du Vencord Installer CLI officiel..."
    Invoke-WebRequest -Uri $InstallerUrl -OutFile $tmp -UseBasicParsing -Headers @{ "User-Agent" = "VoiceMessageBooster-Installer" }
    if ((Get-Item -LiteralPath $tmp).Length -lt 100000) { throw "Téléchargement du CLI incomplet." }
    Move-Item -LiteralPath $tmp -Destination $InstallerCli -Force
    Run $InstallerCli @("--version") "Vérification du CLI officiel" $ToolsRoot
}
function Resolve-Target {
    $targets = @(
        [pscustomobject]@{ Name="Stable"; Branch="stable"; Folder="Discord"; Exe="Discord.exe" },
        [pscustomobject]@{ Name="Canary"; Branch="canary"; Folder="DiscordCanary"; Exe="DiscordCanary.exe" },
        [pscustomobject]@{ Name="PTB"; Branch="ptb"; Folder="DiscordPTB"; Exe="DiscordPTB.exe" }
    )
    if ($DiscordChannel -ne "Auto") { return $targets | Where-Object Name -eq $DiscordChannel | Select-Object -First 1 }
    foreach ($target in $targets) { if (Test-Path -LiteralPath (Join-Path $env:LOCALAPPDATA $target.Folder)) { return $target } }
    Warn "Discord non détecté à l'avance ; détection automatique du CLI."
    return [pscustomobject]@{ Name="Auto"; Branch="auto"; Folder=""; Exe="" }
}
function Stop-Discord {
    $running = Get-Process -Name @("Discord", "DiscordPTB", "DiscordCanary") -ErrorAction SilentlyContinue
    if ($running) { Info "Fermeture de Discord..."; $running | Stop-Process -Force -ErrorAction SilentlyContinue; Start-Sleep -Seconds 2 }
    Ok "Discord prêt pour l'installation."
}
function Restart-Discord($Target) {
    if ($NoRestart -or $Target.Name -eq "Auto") { return }
    $update = Join-Path (Join-Path $env:LOCALAPPDATA $Target.Folder) "Update.exe"
    if (-not (Test-Path -LiteralPath $update)) { Warn "Relance Discord manuellement."; return }
    Start-Process -FilePath $update -ArgumentList @("--processStart", $Target.Exe) | Out-Null
    Ok ("Discord {0} redémarré." -f $Target.Name)
}

Banner
try {
    Step "Vérification du package téléchargé"
    Check-Bundle
    Step "Installation du build personnalisé dans AppData"
    Install-Build
    Step "Préparation du Vencord Installer officiel"
    Get-Installer
    Step "Détection et fermeture de Discord"
    $target = Resolve-Target
    Info ("Canal sélectionné : {0}" -f $target.Name)
    Stop-Discord
    Step "Injection du build VoiceMessageBooster"
    $env:VENCORD_USER_DATA_DIR = $DataRoot
    $env:VENCORD_DEV_INSTALL = "1"
    Run $InstallerCli @("--install", "--branch", $target.Branch) "Installation de Vencord personnalisé" $DataRoot
    Step "Finalisation"
    Restart-Discord $target
    Write-Host ""
    Write-Host "  ============================================================" -ForegroundColor DarkGreen
    Write-Host "       INSTALLATION TERMINÉE" -ForegroundColor Green
    Write-Host "  ============================================================" -ForegroundColor DarkGreen
    Write-Host ""
    Write-Host "  Active : Discord > Paramètres > Vencord > Plugins > VoiceMessageBooster" -ForegroundColor Cyan
    Write-Host ("  Build : {0}" -f $DataRoot) -ForegroundColor DarkGray
    Write-Host ("  Log   : {0}" -f $LogFile) -ForegroundColor DarkGray
    Log "Installation terminée."
    exit 0
} catch {
    Write-Host ""
    Fail $_.Exception.Message
    Fail ("Journal : {0}" -f $LogFile)
    Log ("ERROR: " + $_.Exception.ToString())
    if (-not $NoPause) { Write-Host ""; Read-Host "Appuie sur Entrée pour fermer" }
    exit 1
}
