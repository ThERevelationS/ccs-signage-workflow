param([switch]$Apply)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$OutputEncoding = [Text.UTF8Encoding]::new($false)
$App = "68dfcc5e57bbbc35387da97c"
$Repo = (Get-Location).Path
$Root = ".audit-work/foundation-equipment13"
$Out = "$Root/remote-sync"
$Utf8 = [Text.UTF8Encoding]::new($false)
$Paths = @(
    "src/components/estimator/foundation/foundationEquipmentBindings.js",
    "src/components/estimator/foundation/foundationCatalogIntegrity.js",
    "src/components/estimator/foundation/foundationCalc.js",
    "src/components/estimator/foundation/FoundationEquipmentTab.jsx",
    "src/pages/FoundationEstimator.jsx"
)
$NewPath = $Paths[0]
$Journal = [Collections.Generic.List[object]]::new()

function Abs($Path) { Join-Path $Repo $Path }
function Text($Path) { [IO.File]::ReadAllText((Abs $Path), $Utf8) }
function SaveJson($Path, $Value) {
    $body = ConvertTo-Json -InputObject $Value -Depth 100
    [IO.File]::WriteAllText((Abs $Path), $body, $Utf8)
}
function Lf([string]$Value) { $Value.Replace("`r`n", "`n").Replace("`r", "`n") }
function Same([string]$A, [string]$B) {
    ($A -ceq $B) -or ($A -ceq ($B + "`n")) -or (($A + "`n") -ceq $B)
}
function HashBytes([byte[]]$Bytes) {
    $h = [Security.Cryptography.SHA256]::Create()
    try { [BitConverter]::ToString($h.ComputeHash($Bytes)).Replace("-", "").ToLowerInvariant() }
    finally { $h.Dispose() }
}
function Event($Name, $Data) {
    $Journal.Add(@{ at = [DateTime]::UtcNow.ToString("o"); event = $Name; data = $Data })
    SaveJson "$Out/activation-journal.json" ($Journal.ToArray())
}
function Latest {
    param([string[]]$Arguments, [string]$Tag, [string]$InputText, [switch]$SkipRaw)
    $cliArgs = @("base44@latest") + $Arguments
    if ($Arguments[0] -eq "sandbox") { $cliArgs += @("--branch", "main") }
    $cliArgs += @("--app-id", $App, "--json")
    # Native stderr contains progress even on success; the real process exit is authoritative.
    $oldPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        if ($PSBoundParameters.ContainsKey("InputText")) {
            $raw = $InputText | & npx.cmd @cliArgs 2> (Abs "$Out/$Tag.stderr.txt") | Out-String
        } else {
            $raw = & npx.cmd @cliArgs 2> (Abs "$Out/$Tag.stderr.txt") | Out-String
        }
        $code = $LASTEXITCODE
    } finally { $ErrorActionPreference = $oldPreference }
    if (!$SkipRaw) { [IO.File]::WriteAllText((Abs "$Out/$Tag.json"), $raw, $Utf8) }
    if ($code -ne 0) { throw "Latest CLI exit ${code}: $raw" }
    ConvertFrom-Json -InputObject $raw -ErrorAction Stop
}
function Ready($Phase) {
    $appState = Latest -Arguments @("api", "fetch", "GET", "/api/apps/$App") -Tag "app-$Phase" -SkipRaw
    SaveJson "$Out/app-status-$Phase.json" @{ appId = $appState.id; status = $appState.status }
    if ($appState.id -cne $App -or $appState.status.state -ne "ready") {
        throw "App/builder is not ready for exclusive scoped source work."
    }
}
function Run($Command, $Tag) {
    $result = Latest -Arguments @("sandbox", "run", $Command, "--timeout-ms", "120000") -Tag $Tag
    if ($result.exitCode -ne 0 -or $result.truncated) { throw "Remote verification failed: $Tag" }
    $result
}

$Desired = @{}
foreach ($p in $Paths) { $Desired[$p] = Lf (Text $p) }
function Readback($Path, $Tag) {
    $r = Latest -Arguments @("sandbox", "read", $Path) -Tag $Tag
    $row = $r.files[0]
    if ($row.path -cne $Path -or $row.content -isnot [string] -or !(Same (Lf $row.content) $Desired[$Path])) {
        throw "Remote body is not the reviewed desired file: $Path"
    }
    Event "readback_verified" @{ path = $Path; remoteLfSha = HashBytes ($Utf8.GetBytes((Lf $row.content))) }
}

try {
    Ready "preflight"
    $git = Run "git status --porcelain" "git-before"
    if ($git.stdout.Trim() -ne "") { throw "Remote worktree is busy/dirty; do not edit." }
    $start = (Run "git rev-parse HEAD" "git-start").stdout.Trim()
    if ($start -notmatch "^[a-f0-9]{40}$") { throw "Invalid remote source revision." }
    $fresh = Latest -Arguments (@("sandbox", "read") + $Paths) -Tag "fresh-before"
    if ($fresh.files.Count -ne $Paths.Count) { throw "Incomplete fresh source read." }

    $expected = @{}
    $baseline = ConvertFrom-Json -InputObject (Text "$Root/baselines.json")
    foreach ($f in $baseline.files) { $expected[$f.path] = $f.content }
    $engine = ConvertFrom-Json -InputObject (Text "$Root/engine-source-before.json")
    foreach ($p in $engine.PSObject.Properties) { $expected[$p.Name] = $p.Value }
    $extra = ConvertFrom-Json -InputObject (Text "$Root/extra-baselines-utf8.json")
    foreach ($f in $extra.files) {
        if ($f.content -is [string]) { $expected[$f.path] = $f.content }
    }
    $freshMap = @{}
    foreach ($row in $fresh.files) {
        $freshMap[$row.path] = $row
        if ($row.path -ceq $NewPath) {
            if ($row.error.code -cne "NOT_FOUND") { throw "New helper is no longer absent; possible concurrent writer." }
        } elseif ($row.content -isnot [string] -or !$expected.ContainsKey($row.path) -or !(Same (Lf $row.content) (Lf $expected[$row.path]))) {
            throw "Foreign source drift: $($row.path)"
        }
    }
    Event "fresh_baselines_verified" @{ existing = 4; helper = "NOT_FOUND"; startCommit = $start }
    if (!$Apply) { Write-Output "Read-only latest-CLI preflight passed; no mutations/checkpoints."; return }

    $approval = ConvertFrom-Json -InputObject (Text "$Out/lead-approval.json")
    if ($approval.appId -cne $App -or $approval.branch -cne "main" -or $approval.verdict -cne "accepted") {
        throw "Lead approval is missing or targets a different app/branch."
    }
    foreach ($p in $Paths) {
        if ($approval.files.PSObject.Properties[$p].Value -cne (HashBytes ([IO.File]::ReadAllBytes((Abs $p))))) {
            throw "Unreviewed local change after final gates: $p"
        }
    }
    $before = Latest -Arguments @("sandbox", "checkpoint", "--name", "Concrete-pre-equipment-parity-snapshot-guard") -Tag "checkpoint-before"
    Event "restore_checkpoint_created" $before
    $plans = @{}
    foreach ($p in $Paths | Where-Object { $_ -cne $NewPath }) {
        $leaf = Split-Path $p -Leaf
        $old = $freshMap[$p].content
        $payload = ConvertTo-Json -InputObject @(@{ old_text = $old; new_text = $Desired[$p]; replace_all = $false }) -Depth 100 -Compress
        try { $null = Latest -Arguments @("sandbox", "edit", $p, "--dry-run") -Tag "dryrun-$leaf-lf" -InputText $payload }
        catch {
            if ($_ -notmatch "old_text not found|EDIT_TEXT_NOT_FOUND") { throw }
            $old = (Lf $old).Replace("`n", "`r`n")
            $payload = ConvertTo-Json -InputObject @(@{ old_text = $old; new_text = $Desired[$p]; replace_all = $false }) -Depth 100 -Compress
            $null = Latest -Arguments @("sandbox", "edit", $p, "--dry-run") -Tag "dryrun-$leaf-crlf" -InputText $payload
        }
        $plans[$p] = $payload
    }
    Ready "before-writes"
    foreach ($p in $Paths) {
        $leaf = Split-Path $p -Leaf
        try {
            if ($p -ceq $NewPath) {
                $reply = Latest -Arguments @("sandbox", "write", $p) -Tag "write-$leaf" -InputText $Desired[$p]
            } else {
                $reply = Latest -Arguments @("sandbox", "edit", $p) -Tag "edit-$leaf" -InputText $plans[$p]
            }
            Event "mutation_response" @{ path = $p; reply = $reply }
        } catch {
            # An ambiguous response never justifies sending the same mutation again.
            Event "mutation_uncertain" @{ path = $p; error = [string]$_ }
            Readback $p "uncertain-read-$leaf"
            continue
        }
        Readback $p "readback-$leaf"
    }
    $null = Run "./node_modules/.bin/esbuild src/pages/FoundationEstimator.jsx --bundle --format=esm --platform=browser --loader:.jsx=jsx --loader:.js=jsx --alias:@=./src --outfile=/tmp/ccs-foundation-equipment13.js --metafile=/tmp/ccs-foundation-equipment13-meta.json" "remote-build"
    Start-Sleep -Seconds 6
    $endGit = Run "git status --porcelain" "git-verified"
    if ($endGit.stdout.Trim() -ne "") { throw "Remote auto-commit still pending or another writer is active." }
    $changed = Run "git diff --name-only $start HEAD" "git-changed"
    $changedPaths = @($changed.stdout.Trim() -split "\r?\n" | Where-Object { $_ })
    if ($changedPaths.Count -ne $Paths.Count -or @($changedPaths | Where-Object { $_ -cnotin $Paths }).Count) {
        throw "Unexpected remote changes outside the reviewed five-file unit."
    }
    Ready "verified"
    $final = Latest -Arguments @("sandbox", "checkpoint", "--name", "Concrete-equipment-parity-snapshots-handoff-guard-verified") -Tag "checkpoint-after"
    Event "verified_checkpoint_created" $final
    Ready "checkpointed"
    Write-Output (ConvertTo-Json -InputObject @{ appId = $App; branch = "main"; sourceFiles = $Paths.Count; checkpoint = $final } -Depth 15)
} catch {
    Event "STOP" @{ error = [string]$_ }
    throw
}
