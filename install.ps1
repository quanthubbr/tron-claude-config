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

if (-not ('Exonous.BootstrapJson' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
namespace Exonous {
    public sealed class BootstrapJson {
        readonly string text;
        int position;
        BootstrapJson(string input) { text=input; }
        void Fail() { throw new FormatException("invalid or ambiguous npm JSON"); }
        void Space() { while(position<text.Length && " \t\r\n".IndexOf(text[position])>=0) position++; }
        char Take() { if(position>=text.Length) Fail(); return text[position++]; }
        string String(bool key) {
            if(Take()!='"') Fail();
            var value=new StringBuilder();
            while(position<text.Length) {
                char c=Take();
                if(c=='"') return value.ToString();
                if(c<32) Fail();
                if(c=='\\') {
                    if(key) Fail();
                    char escape=Take();
                    switch(escape) {
                        case '"': c='"'; break; case '\\': c='\\'; break; case '/': c='/'; break;
                        case 'b': c='\b'; break; case 'f': c='\f'; break; case 'n': c='\n'; break; case 'r': c='\r'; break; case 't': c='\t'; break;
                        case 'u': c=Unicode(); break; default: Fail(); break;
                    }
                }
                if(char.IsHighSurrogate(c)) {
                    value.Append(c);
                    if(position+1<text.Length && text[position]=='\\' && text[position+1]=='u') { position+=2; c=Unicode(); }
                    else c=Take();
                    if(!char.IsLowSurrogate(c)) Fail();
                } else if(char.IsLowSurrogate(c)) Fail();
                value.Append(c);
            }
            Fail(); return null;
        }
        char Unicode() {
            if(position+4>text.Length) Fail();
            string hex=text.Substring(position,4);
            if(!Regex.IsMatch(hex,"^[0-9a-fA-F]{4}$")) Fail();
            position+=4; return (char)int.Parse(hex,NumberStyles.HexNumber,CultureInfo.InvariantCulture);
        }
        object Value(int depth) {
            if(depth>64) Fail(); Space();
            if(position>=text.Length) Fail();
            char c=text[position];
            if(c=='{') {
                position++; Space(); var values=new Dictionary<string,object>(StringComparer.Ordinal);
                if(position<text.Length && text[position]=='}') {position++;return values;}
                while(true) {
                    Space(); string key=String(true); Space(); if(Take()!=':') Fail();
                    if(values.ContainsKey(key)) Fail(); values.Add(key,Value(depth+1)); Space(); c=Take();
                    if(c=='}') return values; if(c!=',') Fail();
                }
            }
            if(c=='[') {
                position++; Space(); var values=new List<object>();
                if(position<text.Length && text[position]==']') {position++;return values;}
                while(true) {values.Add(Value(depth+1));Space();c=Take();if(c==']')return values;if(c!=',')Fail();}
            }
            if(c=='"') return String(false);
            string remaining=text.Substring(position);
            foreach(string literal in new[]{"true","false","null"}) if(remaining.StartsWith(literal,StringComparison.Ordinal)) {position+=literal.Length;return null;}
            Match number=Regex.Match(remaining,@"^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?");
            if(!number.Success) Fail(); position+=number.Length;return null;
        }
        public static Dictionary<string,object> Parse(string input) {
            if(input.Length>1048576) throw new FormatException("npm JSON exceeds size limit");
            var parser=new BootstrapJson(input);var value=parser.Value(0) as Dictionary<string,object>;parser.Space();
            if(value==null || parser.position!=input.Length) parser.Fail();return value;
        }
    }
}
'@
}

function Read-NpmIdentity([string] $Path, [bool] $Registry) {
    if ((Get-Item -LiteralPath $Path).Length -gt 1048576) { throw 'npm JSON exceeds size limit' }
    $Encoding = New-Object Text.UTF8Encoding($false, $true)
    $Value = [Exonous.BootstrapJson]::Parse([IO.File]::ReadAllText($Path, $Encoding))
    if ($Value['name'] -isnot [string] -or $Value['name'] -cne 'exonous' -or $Value['version'] -isnot [string] -or $Value['version'] -cnotmatch '^(0|[1-9][0-9]*)[.](0|[1-9][0-9]*)[.](0|[1-9][0-9]*)$' -or $Value['gitHead'] -isnot [string] -or $Value['gitHead'] -cnotmatch '^[0-9a-f]{40}$') { throw 'invalid npm package identity' }
    $Identity = @{ Version = $Value['version']; GitHead = $Value['gitHead']; Digest = '' }
    if ($Registry) {
        $Dist = $Value['dist']
        if ($Dist -isnot [Collections.Generic.Dictionary[string,object]] -or $Dist['tarball'] -isnot [string] -or $Dist['tarball'] -cne "https://registry.npmjs.org/exonous/-/exonous-$($Identity.Version).tgz" -or $Dist['integrity'] -isnot [string] -or $Dist['integrity'] -cnotmatch '^sha512-[A-Za-z0-9+/]{85}[AQgw]==$') { throw 'invalid npm tarball URL or canonical SHA512 integrity' }
        $Identity.Digest = [BitConverter]::ToString([Convert]::FromBase64String($Dist['integrity'].Substring(7))).Replace('-', '')
    }
    return $Identity
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
    $Names = New-Object 'System.Collections.Generic.Dictionary[string,bool]' ([StringComparer]::OrdinalIgnoreCase)
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
            $Directory = $Header[156] -eq 53
            if (-not $Directory -and $Header[156] -ne 0 -and $Header[156] -ne 48) { throw 'npm archive must contain regular USTAR files and directories' }
            $Name = Read-TarText $Header 0 100
            $Prefix = Read-TarText $Header 345 155
            if ($Prefix) { $Name = "$Prefix/$Name" }
            if ($Directory) { $Name = $Name.TrimEnd('/') }
            if ($Name -cnotmatch '^[A-Za-z0-9][A-Za-z0-9._+@/-]*$' -or $Name -match '(^|/)\.{1,2}($|/)|//|/$') { throw 'unsafe release archive path' }
            foreach ($Part in $Name.Split('/')) {
                if ($Part.EndsWith('.') -or $Part -match '^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])($|\.)') { throw 'unsafe Windows release filename' }
            }
            if ($Directory) {
                if ($Name -cnotmatch '^package($|/assets($|/)|/bin$|/native($|/(aarch64-apple-darwin|x86_64-apple-darwin|aarch64-unknown-linux-gnu|x86_64-unknown-linux-gnu|x86_64-pc-windows-msvc)$))') { throw 'unexpected npm archive directory' }
            } elseif ($Name -cnotmatch '^package/assets/' -and $Name -cnotmatch '^package/(package[.]json|README[.]md|LICENSE|LICENSE[.]md|bin/native[.]cjs)$' -and $Name -cnotmatch '^package/native/(aarch64-apple-darwin|x86_64-apple-darwin|aarch64-unknown-linux-gnu|x86_64-unknown-linux-gnu)/exonous$' -and $Name -cne 'package/native/x86_64-pc-windows-msvc/exonous.exe') { throw 'unexpected npm archive root' }
            if ($Names.ContainsKey($Name)) { throw 'duplicate release archive path' }
            $Names.Add($Name, $Directory)
            $Entries++
            if ($Entries -gt 20000) { throw 'too many release archive entries' }
            $Size = Read-TarOctal $Header 124 12
            if ($Size -gt 134217728 -or ($Directory -and $Size -ne 0)) { throw 'release archive entry exceeds size limit' }
            $Next = $InputStream.Position + [long] ([Math]::Ceiling($Size / 512.0) * 512)
            if ($Next -gt $InputStream.Length) { throw 'truncated release archive member' }
            $InputStream.Position = $Next
        }
        foreach ($Name in $Names.Keys) {
            $Parent = $Name
            while ($Parent.Contains('/')) {
                $Parent = $Parent.Substring(0, $Parent.LastIndexOf('/'))
                if ($Names.ContainsKey($Parent) -and -not $Names[$Parent]) { throw 'release archive file/parent collision' }
            }
        }
        if (-not $Names.ContainsKey('package/native/x86_64-pc-windows-msvc/exonous.exe') -or $Names['package/native/x86_64-pc-windows-msvc/exonous.exe'] -or -not $Names.ContainsKey('package/package.json') -or $Names['package/package.json'] -or -not ($Names.Keys | Where-Object { $_.StartsWith('package/assets/', [StringComparison]::Ordinal) -and -not $Names[$_] })) { throw 'npm archive is missing required files' }
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
    $Metadata = Join-Path $Stage 'latest.json'
    Save-ReleaseFile 'https://registry.npmjs.org/exonous/latest' $Metadata 1048576
    $Identity = Read-NpmIdentity $Metadata $true
    $Version = $Identity.Version
    $Compressed = Join-Path $Stage "exonous-$Version.tgz"
    Save-ReleaseFile "https://registry.npmjs.org/exonous/-/exonous-$Version.tgz" $Compressed 134217728
    if ((Get-FileHash -LiteralPath $Compressed -Algorithm SHA512).Hash -cne $Identity.Digest) { throw 'npm package SHA512 integrity verification failed' }
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
    $Package = Join-Path $Bundle 'package'
    $Manifest = Read-NpmIdentity (Join-Path $Package 'package.json') $false
    if ($Manifest.Version -cne $Version -or $Manifest.GitHead -cne $Identity.GitHead) { throw 'archived npm manifest does not match registry' }
    $Candidate = Join-Path $Package 'native/x86_64-pc-windows-msvc/exonous.exe'
    $env:EXONOUS_ASSETS = Join-Path $Package 'assets'
    $env:EXONOUS_NO_FORWARD = '1'
    $env:EXONOUS_NO_UPDATE = '1'
    if (Test-Path -LiteralPath Env:EXONOUS_VERIFIED_RELEASE) { Remove-Item -LiteralPath Env:EXONOUS_VERIFIED_RELEASE }
    $Probe = Invoke-ReleaseBinary $Candidate @('--version') $true
    if ($Probe.ExitCode -ne 0 -or $Probe.Output -cne $Version) { throw 'native executable version does not match npm package' }
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
