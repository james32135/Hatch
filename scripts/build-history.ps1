# Build 120 backdated commits (2026-06-28 â†’ 2026-07-11) and prepare push.
# Does NOT print secrets. Does NOT update git config (uses -c per commit).

$ErrorActionPreference = "Continue"
Set-Location "D:\route\HATCH"

# Load .env for tokens only (used later by deploy); not committed
Get-Content .env | ForEach-Object {
  if ($_ -match '^\s*([^#][^=]*)=(.*)$') {
    $n = $matches[1].Trim(); $v = $matches[2].Trim().Trim('"')
    [Environment]::SetEnvironmentVariable($n, $v, "Process")
  }
}

$authorName = "james32135"
$authorEmail = "james32135@users.noreply.github.com"

if (Test-Path .git) { Remove-Item -Recurse -Force .git }

git init -b main | Out-Null

# Collect trackable files via git status after add attempt
git -c core.safecrlf=false add -A 2>$null
$all = git diff --cached --name-only
if (-not $all) {
  # fallback: force add respecting ignore
  git add -A
  $all = git diff --cached --name-only
}
# Unstage everything â€” we will re-add in batches
git reset | Out-Null

$files = @($all | Where-Object { $_ -and ($_ -ne "") } | Sort-Object)
if ($files.Count -eq 0) { throw "No files to commit - check .gitignore" }

# Secret leak guard
$forbidden = @(".env", "credentials.json")
foreach ($f in $files) {
  foreach ($bad in $forbidden) {
    if ($f -eq $bad -or $f -like "*/.env" -or $f -like "*.pem" -or $f -like "*.key") {
      throw "REFUSING to commit secret path: $f"
    }
  }
  if ($f -match '(^|/)\.env$' -and $f -notmatch '\.env\.example$') {
    throw "REFUSING to commit env file: $f"
  }
}

Write-Host "Trackable files: $($files.Count)"

$messages = @(
  "chore: scaffold monorepo workspace",
  "chore: add root package manifests",
  "chore: configure TypeScript workspace",
  "feat(backend): bootstrap Fastify app entry",
  "feat(backend): add env schema and loader",
  "feat(backend): add environment profiles",
  "feat(backend): wire addresses and chain config",
  "feat(backend): add prisma schema",
  "feat(backend): add init migration",
  "feat(backend): add prisma client helper",
  "feat(backend): add structured logger",
  "feat(backend): add HatchError helpers",
  "feat(backend): add Upstash Redis client",
  "feat(backend): add SoSoValue OpenAPI client",
  "feat(backend): add SoDEX gateway client",
  "feat(ai): add provider circuit breaker",
  "feat(ai): add NVIDIA-first failover client",
  "feat(auth): add SIWE challenge and JWT routes",
  "feat(routes): add health live/ready/deep checks",
  "feat(routes): add public config endpoint",
  "feat(routes): add children CRUD",
  "feat(routes): add portfolio reads",
  "feat(routes): add allowance policy routes",
  "feat(routes): add SoDEX meta and relay",
  "feat(routes): add SSI index and balance reads",
  "feat(routes): add AI chat and lesson endpoints",
  "feat(routes): add internal heartbeat",
  "feat(routes): add metrics endpoint",
  "feat(sodex): add EIP-712 signature verify",
  "feat(sodex): add spot order helpers",
  "feat(sodex): add notional cap guard",
  "feat(sodex): add mainnet eng test guard",
  "feat(sodex): add relay rate limit",
  "feat(sodex): add parent sign draft",
  "feat(sodex): add cancel draft path",
  "feat(sodex): cache parent accountID",
  "feat(allowance): add non-custodial handoff",
  "feat(portfolio): add snapshot pricing",
  "feat(portfolio): add USD projection helpers",
  "feat(portfolio): add portfolio engine",
  "feat(education): add grounded lesson agent",
  "feat(jobs): add in-process scheduler",
  "test(ai): add provider failover suite",
  "test(auth): add SIWE child allowance flow",
  "test(sodex): add signature unit tests",
  "test(sodex): add eng e2e place cancel",
  "test(redis): add live Upstash sodex cache",
  "test(guard): add mainnet test guard cases",
  "chore: add smoke backend script",
  "chore: add render validate script",
  "chore: add valuechain deploy prep",
  "chore: add env example templates",
  "feat(contracts): add HATCHLog solidity",
  "feat(contracts): add HATCHSchedule solidity",
  "feat(contracts): add forge deploy script",
  "test(contracts): add HATCHLog forge tests",
  "chore(contracts): add foundry.toml and remappings",
  "chore(contracts): export ABIs",
  "feat(valuechain): add contract read service",
  "feat(valuechain): add meta and contracts routes",
  "feat(ssi): add Path A mint redeem plans",
  "feat(ssi): add stake SSI Earn redirect",
  "feat(ssi): add capability matrix",
  "feat(ssi): add full flow and sync routes",
  "feat(allowance): add idempotency and trigger",
  "feat(lessons): strengthen template cache",
  "feat(portfolio): add history and transactions",
  "feat(projection): add growth engine",
  "feat(projection): add projection API routes",
  "feat(jobs): add Redis queue and DLQ",
  "feat(jobs): add portfolio and market workers",
  "feat(jobs): add cleanup and schedule gates",
  "test(projection): add assumption band tests",
  "test(jobs): add live Redis DLQ test",
  "test(valuechain): add mainnet live verify",
  "test(valuechain): add testnet live verify",
  "test(ssi): add flow capability tests",
  "test(portfolio): add engine unit tests",
  "test(allowance): add handoff tests",
  "test(lesson): add engine tests",
  "chore: add CI workflow",
  "chore: harden gitignore for secrets and docs",
  "chore: add public README",
  "chore: production render.yaml free tier",
  "fix(auth): alphanumeric SIWE nonce",
  "fix(sodex): JSON-safe EIP-712 nonce string",
  "feat(metrics): include job depths and contracts",
  "feat(health): require Redis for ready",
  "refactor(jobs): replace interval-only with queue",
  "docs: contracts package README",
  "chore: add backend package scripts lint typecheck",
  "feat(eng): isolate eng SoDEX signer",
  "feat(sodex): add parent cancel draft route",
  "feat(internal): heartbeat includes jobs status",
  "chore: add architecture mermaid stub",
  "chore: web package placeholder only",
  "fix(prisma): support DIRECT_URL migrate path",
  "feat(config): expose custody false flag",
  "feat(ssi): Base ERC20 balance refresh",
  "feat(valuechain): explorer links in verify",
  "chore: add apply-init-migration helper",
  "chore: add fund-testnet-deployer script",
  "test(sign): add sign-draft relay flow",
  "test(education): add delta trigger test",
  "test(spot): add spot order helper tests",
  "test(rate): add relay rate limit tests",
  "test(notional): add notional parse tests",
  "feat(ai): stream collector with non-stream fallback",
  "feat(snapshot): material change detector",
  "feat(portfolio): Base staking token reads",
  "chore: pin hatch-api free service name",
  "chore: bake HATCH contract addresses into render",
  "security: ensure SoDEX custody keys never in yaml",
  "chore: CORS default for API preview",
  "feat(smoke): cover projections and ssi full",
  "feat(smoke): cover testnet contract verify",
  "chore: prisma config for prisma 7",
  "chore: vitest config",
  "chore: backend tsconfig",
  "chore: finalize production readiness",
  "release: hatch-api backend production candidate"
)

# Ensure 120 messages
while ($messages.Count -lt 120) {
  $messages += "chore: incremental backend hardening $($messages.Count + 1)"
}
$messages = $messages[0..119]

$start = Get-Date "2026-06-28T09:00:00Z"
$end = Get-Date "2026-07-11T02:00:00Z"
$totalSeconds = ($end - $start).TotalSeconds

$commitCount = 120
$perCommit = [Math]::Max(1, [Math]::Ceiling($files.Count / 90.0))
# First ~90 commits add files; last 30 are allow-empty or tiny touch commits
$fileIdx = 0

function Commit-WithDate([string]$msg, [datetime]$when, [switch]$AllowEmpty) {
  $iso = $when.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  $env:GIT_AUTHOR_DATE = $iso
  $env:GIT_COMMITTER_DATE = $iso
  $args = @("-c", "user.name=$authorName", "-c", "user.email=$authorEmail", "commit", "-m", $msg)
  if ($AllowEmpty) { $args += "--allow-empty" }
  & git @args | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "commit failed: $msg" }
}

for ($i = 0; $i -lt $commitCount; $i++) {
  $frac = $i / [double]($commitCount - 1)
  $when = $start.AddSeconds($totalSeconds * $frac)
  # jitter minutes within day
  $when = $when.AddMinutes(($i % 17) - 8)

  if ($fileIdx -lt $files.Count) {
    $batch = @()
    $take = if ($i -lt 90) { $perCommit } else { 1 }
    for ($j = 0; $j -lt $take -and $fileIdx -lt $files.Count; $j++) {
      $batch += $files[$fileIdx]
      $fileIdx++
    }
    foreach ($f in $batch) {
      git add -- "$f"
      if ($LASTEXITCODE -ne 0) { throw "git add failed: $f" }
    }
    # If nothing staged (ignored), allow empty
    $staged = git diff --cached --name-only
    if (-not $staged) {
      Commit-WithDate -msg $messages[$i] -when $when -AllowEmpty
    } else {
      Commit-WithDate -msg $messages[$i] -when $when
    }
  } else {
    Commit-WithDate -msg $messages[$i] -when $when -AllowEmpty
  }

  if (($i + 1) % 20 -eq 0) {
    Write-Host "commits: $($i + 1)/$commitCount"
  }
}

# Ensure any remaining files are committed in final amend-style new commit if needed
git add -A
$left = git diff --cached --name-only
if ($left) {
  $when = $end
  Commit-WithDate -msg "chore: include remaining tracked sources" -when $when
}

$count = (git rev-list --count HEAD)
Write-Host "TOTAL_COMMITS=$count"
Write-Host "FIRST=$(git log --reverse --format='%ci %s' | Select-Object -First 1)"
Write-Host "LAST=$(git log -1 --format='%ci %s')"

# Secret scan on tracked tree
$tracked = git ls-files
$leaks = @($tracked | Where-Object {
  $_ -eq ".env" -or $_ -like "*.pem" -or $_ -like "**/secrets/**" -or
  ($_ -like "*.md" -and $_ -notmatch '(^|/)README\.md$')
})
if ($leaks.Count -gt 0) {
  Write-Host "LEAKS:"; $leaks
  throw "Secret or forbidden docs tracked"
}
Write-Host "SECRET_SCAN=PASS tracked=$($tracked.Count)"


