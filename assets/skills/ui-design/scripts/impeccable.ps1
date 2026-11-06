$ErrorActionPreference = 'Stop'
$engineArgs = $args
$staging = $null

function Refuse([string] $message) {
    throw "engine integrity: $message; reinstall exonous or set IMPECCABLE_BIN to an explicitly trusted engine."
}
function Verify([string] $file, [string] $expected) {
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { Refuse "not a regular file: $file" }
    $actual = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -cne $expected) { Refuse "checksum mismatch: $file" }
}
try {
    if (-not $env:IMPECCABLE_SKILL_DIR) { $env:IMPECCABLE_SKILL_DIR = Split-Path $PSScriptRoot -Parent }
    if (-not $env:IMPECCABLE_SELF) { $env:IMPECCABLE_SELF = Join-Path $PSScriptRoot 'impeccable.cmd' }
    if (Test-Path Env:IMPECCABLE_BIN) {
        if (-not $env:IMPECCABLE_BIN -or -not (Test-Path -LiteralPath $env:IMPECCABLE_BIN -PathType Leaf)) { Refuse 'invalid IMPECCABLE_BIN override' }
        & $env:IMPECCABLE_BIN @engineArgs
        exit $LASTEXITCODE
    }
    $version = (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'VERSION') -Raw).Replace("`r`n", "`n")
    if ($version.EndsWith("`n")) { $version = $version.Substring(0, $version.Length - 1) }
    if ($version -cne '0.1.5') { Refuse 'VERSION mismatch' }
    $lines = @(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'ENGINE-CHECKSUMS'))
    if ($lines.Count -lt 2 -or $lines[0] -cne 'version 0.1.5') { Refuse 'manifest version missing or mismatched' }
    $hashes = @{}
    foreach ($line in $lines[1..($lines.Count - 1)]) {
        if ($line -cnotmatch '^([a-f0-9]{64})  (impeccable-(?:darwin|linux)-(?:arm64|x64)|impeccable-windows-x64\.exe)$') { Refuse 'invalid manifest entry' }
        $assetName = $Matches[2]
        if ($hashes.ContainsKey($assetName)) { Refuse 'duplicate manifest asset' }
        $hashes[$assetName] = $Matches[1]
    }
    $asset = 'impeccable-windows-x64.exe'
    $expected = $hashes[$asset]
    if (-not $expected) { Refuse 'manifest missing Windows x64 hash' }
    $cacheRoot = $env:IMPECCABLE_HOME
    if (-not $cacheRoot) { $cacheRoot = Join-Path $env:USERPROFILE '.impeccable' }
    $cached = Join-Path $cacheRoot 'bin\0.1.5\impeccable.exe'
    $candidates = @(
        (Join-Path $PSScriptRoot 'bin\windows-x64\impeccable.exe'),
        (Join-Path $env:USERPROFILE '.impeccable\bin\impeccable.exe'),
        $cached
    )
    foreach ($entry in ($env:PATH -split ';')) {
        if ($entry) { $candidates += Join-Path $entry 'impeccable.exe' }
    }
    foreach ($candidate in $candidates) {
        if (-not (Test-Path -LiteralPath $candidate)) { continue }
        Verify $candidate $expected
        & $candidate @engineArgs
        exit $LASTEXITCODE
    }
    if ($env:IMPECCABLE_LAUNCHER_PROBE) { Refuse 'no authenticated engine installed' }
    $cacheDir = Split-Path $cached -Parent
    [IO.Directory]::CreateDirectory($cacheDir) | Out-Null
    $staging = Join-Path $cacheDir ('.impeccable.' + [Guid]::NewGuid().ToString('N'))
    $acl = New-Object System.Security.AccessControl.DirectorySecurity
    $acl.SetAccessRuleProtection($true, $false)
    $owner = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl.SetOwner($owner)
    $rule = [System.Security.AccessControl.FileSystemAccessRule]::new($owner, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $acl.AddAccessRule($rule)
    [IO.Directory]::CreateDirectory($staging, $acl) | Out-Null
    $tmp = Join-Path $staging 'engine'
    $base = $env:IMPECCABLE_DOWNLOAD_BASE
    if (-not $base) { $base = 'https://github.com/pbakaus/impeccable/releases/download' }
    $url = "$base/engine-v$version/$asset"
    & curl.exe -fsSL --retry 2 -o $tmp $url
    if ($LASTEXITCODE -ne 0) { Refuse "could not download $url; check network access and cache permissions" }
    Verify $tmp $expected
    if ([IO.File]::Exists($cached)) {
        [IO.File]::Replace($tmp, $cached, $null)
    } else {
        try { [IO.File]::Move($tmp, $cached) }
        catch {
            if (-not [IO.File]::Exists($cached)) { throw }
            [IO.File]::Replace($tmp, $cached, $null)
        }
    }
    Verify $cached $expected
    Remove-Item -LiteralPath $staging
    $staging = $null
    & $cached @engineArgs
    exit $LASTEXITCODE
} catch {
    [Console]::Error.WriteLine("impeccable: $($_.Exception.Message); reinstall exonous or set IMPECCABLE_BIN explicitly.")
    exit 127
} finally {
    if ($staging -and (Test-Path -LiteralPath $staging)) {
        Remove-Item -LiteralPath (Join-Path $staging 'engine') -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $staging -Force -ErrorAction SilentlyContinue
    }
}
