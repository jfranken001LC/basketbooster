Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Go to repo root
$repoRoot = (& git rev-parse --show-toplevel).Trim()
Set-Location $repoRoot

Write-Host "== Repo: $repoRoot"
Write-Host "== Scanning for TRACKED files that are now ignored by .gitignore..."

# Use -z to safely handle odd characters; split on NULL
$raw = & git ls-files -ci --exclude-standard -z
$ignored = $raw -split ([char]0) | Where-Object { $_ -and $_.Trim().Length -gt 0 }

if ($ignored.Count -eq 0) {
  Write-Host "No tracked-ignored files found. Nothing to untrack."
  exit 0
}

Write-Host ""
Write-Host "The following tracked files are ignored and will be removed from git index (NOT deleted from disk):"
Write-Host "---------------------------------------------------------------------"
$ignored | ForEach-Object { Write-Host $_ }
Write-Host "---------------------------------------------------------------------"
Write-Host ""

Write-Host "== Untracking..."
foreach ($p in $ignored) {
  & git rm -r --cached --ignore-unmatch -- "$p" | Out-Host
}

Write-Host "== Re-adding .gitignore..."
& git add .gitignore | Out-Host

Write-Host ""
Write-Host "== Done."
Write-Host "Next steps:"
Write-Host "  1) Review: git status"
Write-Host "  2) Commit: git commit -m `"Stop tracking ignored build/env/db artifacts`""
Write-Host "  3) Push:   git push"
