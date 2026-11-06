$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$InstallArguments = $args
$Stage = $null
$ExitCode = 1
$SavedEnvironment = @{}
foreach ($Name in @('EXONOUS_ASSETS', 'EXONOUS_VERIFIED_RELEASE', 'EXONOUS_NO_FORWARD', 'EXONOUS_NO_UPDATE')) {
    $SavedEnvironment[$Name] = [Environment]::GetEnvironmentVariable($Name, 'Process')
}

function Get-ReleaseResponse([string] $Url, [string] $Method) {
    for ($Redirects = 0; $Redirects -le 5; $Redirects++) {
        $Uri = [Uri] $Url
        if ($Uri.Scheme -cne 'https' -or $Uri.UserInfo) { throw 'release requests require HTTPS without credentials' }
        $Request = [System.Net.WebRequest]::Create($Uri)
        $Request.Method = $Method
        $Request.AllowAutoRedirect = $false
        $Request.Timeout = 120000
        $Request.ReadWriteTimeout = 120000
        $Request.UserAgent = 'exonous-bootstrap'
        $Response = $Request.GetResponse()
        $Status = [int] $Response.StatusCode
        if ($Status -in @(301, 302, 303, 307, 308)) {
            $Location = $Response.Headers['Location']
            $Response.Close()
            if (-not $Location) { throw 'release redirect has no location' }
            $Url = ([Uri]::new($Uri, $Location)).AbsoluteUri
            continue
        }
        if ($Status -ne 200) { $Response.Close(); throw 'release request failed' }
        return $Response
    }
    throw 'too many release redirects'
}

function Save-ReleaseFile([string] $Url, [string] $Destination, [long] $Limit) {
    $Response = Get-ReleaseResponse $Url 'GET'
    $InputStream = $null
    $OutputStream = $null
    try {
        if ($Response.ContentLength -gt $Limit) { throw 'release download exceeds size limit' }
        $InputStream = $Response.GetResponseStream()
        $OutputStream = [IO.File]::Open($Destination, [IO.FileMode]::CreateNew)
        $Buffer = New-Object byte[] 65536
        [long] $Total = 0
        $Deadline = [Diagnostics.Stopwatch]::StartNew()
        while (($Count = $InputStream.Read($Buffer, 0, $Buffer.Length)) -gt 0) {
            $Total += $Count
            if ($Total -gt $Limit -or $Deadline.Elapsed.TotalSeconds -gt 120) { throw 'release download exceeds size or time limit' }
            $OutputStream.Write($Buffer, 0, $Count)
        }
    } finally {
        if ($OutputStream) { $OutputStream.Dispose() }
        if ($InputStream) { $InputStream.Dispose() }
        $Response.Close()
    }
}

function Read-TarText([byte[]] $Header, [int] $Offset, [int] $Length) {
    $Text = ''
    $Ended = $false
    for ($Index = $Offset; $Index -lt $Offset + $Length; $Index++) {
        $Byte = $Header[$Index]
        if ($Byte -eq 0) { $Ended = $true }
        else {
            if ($Ended -or $Byte -lt 32 -or $Byte -gt 126) { throw 'invalid USTAR text field' }
            $Text += [char] $Byte
        }
    }
    return $Text
}

function Read-TarOctal([byte[]] $Header, [int] $Offset, [int] $Length) {
    [long] $Value = 0
    $Ended = $false
    for ($Index = $Offset; $Index -lt $Offset + $Length; $Index++) {
        $Byte = $Header[$Index]
        if ($Byte -eq 0 -or $Byte -eq 32) { $Ended = $true; continue }
        if ($Ended -or $Byte -lt 48 -or $Byte -gt 55) { throw 'invalid USTAR octal field' }
        $Value = $Value * 8 + $Byte - 48
    }
    return $Value
}

function Test-ReleaseArchive([string] $Archive) {
    $InputStream = [IO.File]::OpenRead($Archive)
    $Names = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
    try {
        $Header = New-Object byte[] 512
        $Entries = 0
        while ($true) {
            if ($InputStream.Read($Header, 0, 512) -ne 512) { throw 'truncated release archive' }
            [long] $Sum = 0
            foreach ($Byte in $Header) { $Sum += $Byte }
            if ($Sum -eq 0) {
                [long] $Zeros = 512
                while (($Count = $InputStream.Read($Header, 0, 512)) -gt 0) {
                    for ($Index = 0; $Index -lt $Count; $Index++) {
                        if ($Header[$Index] -ne 0) { throw 'invalid release archive terminator' }
                    }
                    $Zeros += $Count
                }
                if ($Zeros -lt 1024) { throw 'invalid release archive terminator' }
                break
            }
            $Checksum = Read-TarOctal $Header 148 8
            for ($Index = 148; $Index -lt 156; $Index++) { $Sum += 32 - $Header[$Index] }
            if ($Checksum -ne $Sum -or (Read-TarText $Header 257 6) -cne 'ustar' -or (Read-TarText $Header 263 2) -cne '00') { throw 'invalid USTAR release header' }
            if ($Header[156] -ne 0 -and $Header[156] -ne 48) { throw 'release archive must contain regular USTAR files' }
            $Name = Read-TarText $Header 0 100
            $Prefix = Read-TarText $Header 345 155
            if ($Prefix) { $Name = "$Prefix/$Name" }
            if ($Name -cnotmatch '^[A-Za-z0-9][A-Za-z0-9._+@/-]*$' -or $Name -match '(^|/)\.{1,2}($|/)|//|/$') { throw 'unsafe release archive path' }
            foreach ($Part in $Name.Split('/')) {
                if ($Part.EndsWith('.') -or $Part -match '^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])($|\.)') { throw 'unsafe Windows release filename' }
            }
            if ($Name -cnotmatch '^assets/' -and $Name -cnotmatch '^(exonous[.]exe|package[.]json|Cargo[.]toml|Cargo[.]lock|README[.]md|LICENSE|LICENSE[.]md|THIRD-PARTY-NOTICES[.]md)$') { throw 'unexpected release archive root' }
            if (-not $Names.Add($Name)) { throw 'duplicate release archive path' }
            $Entries++
            if ($Entries -gt 20000) { throw 'too many release archive entries' }
            $Size = Read-TarOctal $Header 124 12
            if ($Size -gt 134217728) { throw 'release archive entry exceeds size limit' }
            $Next = $InputStream.Position + [long] ([Math]::Ceiling($Size / 512.0) * 512)
            if ($Next -gt $InputStream.Length) { throw 'truncated release archive member' }
            $InputStream.Position = $Next
        }
        foreach ($Name in $Names) {
            $Parent = $Name
            while ($Parent.Contains('/')) {
                $Parent = $Parent.Substring(0, $Parent.LastIndexOf('/'))
                if ($Names.Contains($Parent)) { throw 'release archive file/parent collision' }
            }
        }
        if (-not $Names.Contains('exonous.exe') -or -not $Names.Contains('package.json') -or -not ($Names | Where-Object { $_.StartsWith('assets/', [StringComparison]::Ordinal) })) { throw 'release archive is missing required files' }
    } finally { $InputStream.Dispose() }
}

function Invoke-ReleaseBinary([string] $Binary, [string[]] $Arguments, [bool] $Capture) {
    $Quoted = foreach ($Argument in $Arguments) {
        $Escaped = [Regex]::Replace($Argument, '(\\*)"', { param($Match) $Match.Groups[1].Value + $Match.Groups[1].Value + '\"' })
        '"' + [Regex]::Replace($Escaped, '(\\+)$', '$1$1') + '"'
    }
    $Process = New-Object Diagnostics.Process
    $Process.StartInfo.FileName = $Binary
    $Process.StartInfo.Arguments = $Quoted -join ' '
    $Process.StartInfo.UseShellExecute = $false
    $Process.StartInfo.RedirectStandardOutput = $Capture
    $Process.StartInfo.RedirectStandardError = $Capture
    try {
        if (-not $Process.Start()) { throw 'cannot start verified native executable' }
        if ($Capture) {
            $OutputTask = $Process.StandardOutput.ReadToEndAsync()
            $ErrorTask = $Process.StandardError.ReadToEndAsync()
        }
        $Process.WaitForExit()
        $Output = ''
        if ($Capture) {
            $Output = $OutputTask.GetAwaiter().GetResult().TrimEnd("`r", "`n")
            if ($Process.ExitCode -ne 0) { [Console]::Error.Write($ErrorTask.GetAwaiter().GetResult()) }
        }
        return @{ ExitCode = $Process.ExitCode; Output = $Output }
    } finally { $Process.Dispose() }
}

try {
    $Architecture = $env:PROCESSOR_ARCHITECTURE
    if ($env:PROCESSOR_ARCHITEW6432) { $Architecture = $env:PROCESSOR_ARCHITEW6432 }
    if ($env:OS -ne 'Windows_NT' -or $Architecture -ne 'AMD64') { throw 'no native release bundle for this platform' }
    $SystemDirectory = 'System32'
    if ([Environment]::Is64BitOperatingSystem -and -not [Environment]::Is64BitProcess) { $SystemDirectory = 'Sysnative' }
    $Tar = Join-Path (Join-Path ([Environment]::GetFolderPath('Windows')) $SystemDirectory) 'tar.exe'
    if (-not (Test-Path -LiteralPath $Tar -PathType Leaf)) { throw 'Windows system tar.exe is required' }
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $Stage = Join-Path ([IO.Path]::GetTempPath()) ('exonous-install-' + [Guid]::NewGuid().ToString('N'))
    $Security = New-Object System.Security.AccessControl.DirectorySecurity
    $Security.SetAccessRuleProtection($true, $false)
    $Identity = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $Rule = New-Object System.Security.AccessControl.FileSystemAccessRule($Identity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $Security.AddAccessRule($Rule)
    if ($PSVersionTable.PSEdition -eq 'Core') {
        [IO.FileSystemAclExtensions]::CreateDirectory($Security, $Stage) | Out-Null
    } else {
        [IO.Directory]::CreateDirectory($Stage, $Security) | Out-Null
    }
    $Response = Get-ReleaseResponse 'https://github.com/zaqueu-1/exonous/releases/latest' 'HEAD'
    try { $Release = $Response.ResponseUri.AbsoluteUri } finally { $Response.Close() }
    if ($Release -cnotmatch '^https://github[.]com/zaqueu-1/exonous/releases/tag/v((0|[1-9][0-9]*)[.](0|[1-9][0-9]*)[.](0|[1-9][0-9]*))$') { throw 'latest release did not resolve to a stable Exonous tag' }
    $Version = $Matches[1]
    $Filename = 'exonous-x86_64-pc-windows-msvc.tar.gz'
    $Base = "https://github.com/zaqueu-1/exonous/releases/download/v$Version"
    $Checksums = Join-Path $Stage 'SHA256SUMS'
    Save-ReleaseFile "$Base/SHA256SUMS" $Checksums 65536
    $Matching = @([IO.File]::ReadAllLines($Checksums) | Where-Object { ($_ -split '\s+')[-1] -ceq $Filename -or ($_ -split '\s+')[-1] -ceq "*$Filename" })
    if ($Matching.Count -ne 1 -or $Matching[0] -cnotmatch "^([A-Fa-f0-9]{64}) [ *]$([Regex]::Escape($Filename))$") { throw 'checksum manifest must contain one exact SHA-256 entry' }
    $Expected = $Matches[1]
    $Compressed = Join-Path $Stage $Filename
    Save-ReleaseFile "$Base/$Filename" $Compressed 134217728
    if ((Get-FileHash -LiteralPath $Compressed -Algorithm SHA256).Hash -ine $Expected) { throw 'native bundle checksum verification failed' }
    $Raw = Join-Path $Stage 'release.tar'
    $InputStream = [IO.File]::OpenRead($Compressed)
    $Gzip = New-Object IO.Compression.GZipStream($InputStream, [IO.Compression.CompressionMode]::Decompress)
    $OutputStream = [IO.File]::Open($Raw, [IO.FileMode]::CreateNew)
    try {
        $Buffer = New-Object byte[] 65536
        [long] $Total = 0
        while (($Count = $Gzip.Read($Buffer, 0, $Buffer.Length)) -gt 0) {
            $Total += $Count
            if ($Total -gt 536870912) { throw 'release archive exceeds expanded size limit' }
            $OutputStream.Write($Buffer, 0, $Count)
        }
    } finally { $OutputStream.Dispose(); $Gzip.Dispose(); $InputStream.Dispose() }
    Test-ReleaseArchive $Raw
    $Bundle = Join-Path $Stage 'bundle'
    [IO.Directory]::CreateDirectory($Bundle) | Out-Null
    & $Tar -xf $Raw -C $Bundle
    if ($LASTEXITCODE -ne 0) { throw 'cannot extract verified release archive' }
    $Candidate = Join-Path $Bundle 'exonous.exe'
    $env:EXONOUS_ASSETS = Join-Path $Bundle 'assets'
    $env:EXONOUS_NO_FORWARD = '1'
    $env:EXONOUS_NO_UPDATE = '1'
    if (Test-Path -LiteralPath Env:EXONOUS_VERIFIED_RELEASE) { Remove-Item -LiteralPath Env:EXONOUS_VERIFIED_RELEASE }
    $Probe = Invoke-ReleaseBinary $Candidate @('--version') $true
    if ($Probe.ExitCode -ne 0 -or $Probe.Output -cne $Version) { throw 'native executable version does not match release tag' }
    Write-Host "Installing Exonous $Version..."
    $Installed = Invoke-ReleaseBinary $Candidate (@('install') + $InstallArguments) $false
    $ExitCode = $Installed.ExitCode
} catch {
    [Console]::Error.WriteLine("exonous: " + $_.Exception.Message)
} finally {
    foreach ($Name in $SavedEnvironment.Keys) {
        if ($null -eq $SavedEnvironment[$Name]) {
            if (Test-Path -LiteralPath "Env:$Name") { Remove-Item -LiteralPath "Env:$Name" }
        } else {
            [Environment]::SetEnvironmentVariable($Name, $SavedEnvironment[$Name], 'Process')
        }
    }
    if ($Stage -and (Test-Path -LiteralPath $Stage)) { Remove-Item -LiteralPath $Stage -Recurse -Force }
}
exit $ExitCode
