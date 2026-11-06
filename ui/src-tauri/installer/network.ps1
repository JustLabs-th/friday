# Run by the Liam installer (as Administrator): trust the company root CA and point the company
# service names at their servers. Safe to run again. `-Action uninstall` removes only the hosts block;
# the CA stays because other company tools rely on it.
param(
    [ValidateSet('install', 'uninstall')] [string]$Action = 'install',
    [string]$HostsPath = (Join-Path $env:SystemRoot 'System32\drivers\etc\hosts'),
    [switch]$HostsOnly  # for testing against a copy of the hosts file
)

$ErrorActionPreference = 'Stop'
# Next to the script (the install folder), so it is found whichever account ran the installer.
$log = Join-Path $PSScriptRoot 'network-setup.log'
function Log($text) { try { Add-Content -LiteralPath $log -Value ("{0} {1}" -f (Get-Date -Format s), $text) } catch {} }

# Only the names Liam uses. Edit here to add more.
$records = [ordered]@{
    'sso.digitalx.srt'        = '192.168.100.3'
    'bifrost.digitalx.srt'    = '192.168.100.9'
    'key-portal.digitalx.srt' = '192.168.100.9'
    'coolify.digitalx.srt'    = '192.168.100.9'
    'home.digitalx.srt'       = '192.168.100.9'
    'git.digitalx.srt'        = '192.168.100.7'
    'nexus.digitalx.srt'      = '192.168.100.24'
    'registry.digitalx.srt'   = '192.168.100.24'
}
$begin = '# >>> Liam company hosts (managed by the Liam installer)'
$end = '# <<< Liam company hosts'

function Update-Hosts([bool]$add) {
    $lines = [IO.File]::ReadAllLines($HostsPath)
    $result = New-Object 'System.Collections.Generic.List[string]'
    $inside = $false
    foreach ($line in $lines) {
        if ($line -eq $begin) { $inside = $true; continue }
        if ($line -eq $end) { $inside = $false; continue }
        if ($inside) { continue }
        # A name listed elsewhere with another address would win or conflict: take it off that line.
        $parts = $line -split '#', 2
        $fields = @($parts[0].Trim() -split '\s+' | Where-Object { $_ })
        if ($add -and $fields.Count -ge 2) {
            $names = @($fields[1..($fields.Count - 1)])
            $kept = @($names | Where-Object { -not $records.Contains($_) })
            if ($kept.Count -ne $names.Count) {
                $comment = if ($parts.Count -gt 1) { '#' + $parts[1] } else { '' }
                if ($kept.Count) { $result.Add((@($fields[0]) + $kept -join ' ') + $(if ($comment) { " $comment" } else { '' })) }
                elseif ($comment) { $result.Add($comment) }
                continue
            }
        }
        $result.Add($line)
    }
    if ($add) {
        $result.Add($begin)
        foreach ($entry in $records.GetEnumerator()) { $result.Add("$($entry.Value) $($entry.Key)") }
        $result.Add($end)
    }
    $updated = ($result -join "`r`n") + "`r`n"
    if ($updated -cne [IO.File]::ReadAllText($HostsPath)) {
        Copy-Item -LiteralPath $HostsPath -Destination ($HostsPath + '.liam-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.bak')
        [IO.File]::WriteAllText($HostsPath, $updated, (New-Object Text.UTF8Encoding($false)))
    }
}

try {
    Log "started: action=$Action as $([Security.Principal.WindowsIdentity]::GetCurrent().Name)"
    $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    if (-not $HostsOnly -and -not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Administrator rights are required.'
    }
    if ($Action -eq 'uninstall') {
        Update-Hosts $false
        Log 'hosts block removed'
    } else {
        if (-not $HostsOnly) {
        $ca = Join-Path $PSScriptRoot 'srt-platform-root-ca.crt'
        if (-not (Test-Path -LiteralPath $ca)) { throw "Root CA not found next to the script: $ca" }
        & certutil.exe -addstore -f Root $ca | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "certutil failed with exit code $LASTEXITCODE" }
        }
        Update-Hosts $true
        Log $(if ($HostsOnly) { 'hosts updated (test mode, CA skipped)' } else { 'root CA trusted, hosts updated' })
    }
    ipconfig.exe /flushdns | Out-Null
    exit 0
} catch {
    Log "FAILED: $($_.Exception.Message)"
    exit 1
}
