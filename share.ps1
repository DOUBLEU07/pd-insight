<#
.SYNOPSIS
    Start PD Insight and publish a public HTTPS link for remote testers.

.DESCRIPTION
    Brings up postgres + api + web + a Cloudflare quick tunnel, waits for the
    tunnel to mint its URL, and prints it. No Cloudflare account is needed.

    The link stays alive only while this machine is on and the containers are
    running. Stop sharing with:  docker compose --profile share down

.EXAMPLE
    .\share.ps1
    .\share.ps1 -Rebuild
#>

param(
    [switch]$Rebuild,
    [int]$TimeoutSeconds = 90
)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }

# ---- Docker must be running ----
Write-Step 'Checking Docker'
try {
    docker info --format '{{.ServerVersion}}' 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { throw }
} catch {
    Write-Host 'Docker is not running. Start Docker Desktop and try again.' -ForegroundColor Red
    exit 1
}

# ---- A shared instance should not use the placeholder signing key ----
if (Test-Path '.env') {
    $envText = Get-Content '.env' -Raw
    if ($envText -match '(?m)^JWT_SECRET=change-me-in-production\s*$') {
        Write-Step 'Generating a JWT signing key (the placeholder is not safe to share)'
        # RNGCryptoServiceProvider works on both Windows PowerShell 5.1 and 7+.
        $bytes = New-Object byte[] 48
        $rng = [System.Security.Cryptography.RNGCryptoServiceProvider]::new()
        try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
        $secret = [Convert]::ToBase64String($bytes)
        $envText = $envText -replace '(?m)^JWT_SECRET=.*$', "JWT_SECRET=$secret"
        Set-Content '.env' $envText -Encoding utf8 -NoNewline
        Write-Host '    wrote a new JWT_SECRET to .env' -ForegroundColor DarkGray
    }
} else {
    Write-Host '.env not found — copy .env.example to .env first.' -ForegroundColor Red
    exit 1
}

# ---- Start the stack ----
Write-Step 'Starting containers'
if ($Rebuild) {
    docker compose --profile share up -d --build
} else {
    docker compose --profile share up -d
}
if ($LASTEXITCODE -ne 0) { Write-Host 'docker compose failed.' -ForegroundColor Red; exit 1 }

# ---- Wait for the quick tunnel to announce its hostname ----
Write-Step 'Waiting for the public link'
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$publicUrl = $null

while ((Get-Date) -lt $deadline) {
    # `docker compose logs` returns the container's full history, not just this
    # run's — reusing an existing (stopped) tunnel container keeps prior runs'
    # log lines around. Take the *last* URL announced, not the first, so an
    # old, dead quick-tunnel link from a previous share session is never
    # returned instead of the one that is actually live now.
    $logs = docker compose logs tunnel 2>&1 | Out-String
    $matches = [regex]::Matches($logs, 'https://[a-z0-9-]+\.trycloudflare\.com')
    if ($matches.Count -gt 0) { $publicUrl = $matches[$matches.Count - 1].Value; break }
    Start-Sleep -Seconds 3
}

if (-not $publicUrl) {
    Write-Host "Tunnel URL did not appear within $TimeoutSeconds s." -ForegroundColor Yellow
    Write-Host 'Check it manually:  docker compose logs tunnel' -ForegroundColor Yellow
    exit 1
}

# ---- Confirm the app answers through the tunnel ----
Write-Step 'Verifying the link'
$healthy = $false
for ($i = 0; $i -lt 10; $i++) {
    try {
        $r = Invoke-WebRequest -Uri "$publicUrl/api/v1/health" -TimeoutSec 15 -UseBasicParsing
        if ($r.StatusCode -eq 200) { $healthy = $true; break }
    } catch {
        Start-Sleep -Seconds 3
    }
}

Write-Host ''
Write-Host '================================================================'
Write-Host '  PD Insight is live' -ForegroundColor Green
Write-Host '================================================================'
Write-Host ''
Write-Host "  Share this link:  $publicUrl" -ForegroundColor White
Write-Host ''
if ($healthy) {
    Write-Host '  API through the tunnel: responding' -ForegroundColor DarkGray
} else {
    Write-Host '  API through the tunnel: no answer yet — give it a moment' -ForegroundColor Yellow
}
Write-Host ''
Write-Host '  Testers can create their own account from the Sign Up tab.'
Write-Host '  Demo account (if seeded): researcher01 / pdinsight123'
Write-Host ''
Write-Host '  Local:  http://localhost:3000'
Write-Host '  Stop sharing:  docker compose --profile share down'
Write-Host '================================================================'
Write-Host ''
Write-Host 'The link only works while this machine stays on.' -ForegroundColor DarkGray
