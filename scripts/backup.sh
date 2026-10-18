#!/usr/bin/env bash
# Backs up all committed work (every branch, full history, docs included) to ~/Backups/ngf-crm as a dated git bundle.
# Restore with: git clone <file>.bundle ngf-crm-restored
# Not included: .env files (keep secrets in your password manager) and uncommitted changes (commit first).
# Database: use Supabase's own backups (Dashboard > Database > Backups).
set -euo pipefail
cd "$(dirname "$0")/.."
dest="${BACKUP_DIR:-$HOME/Backups/ngf-crm}"
mkdir -p "$dest"
file="$dest/ngf-crm-$(date +%Y%m%d-%H%M%S).bundle"
git bundle create "$file" --all >/dev/null
git bundle verify "$file" >/dev/null
keep="${BACKUP_KEEP:-10}"
ls -1t "$dest"/ngf-crm-*.bundle | tail -n +$((keep + 1)) | while read -r old; do rm -- "$old"; done
if [ -n "$(git status --porcelain)" ]; then echo "Note: uncommitted changes are not in the backup."; fi
echo "Backup written: $file"
