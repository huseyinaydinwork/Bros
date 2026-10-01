#!/bin/sh
# Günlük yedek: PostgreSQL dökümü + yerel dosya birimi. Sunucuda cron ile çalıştırın:
#   15 3 * * * cd /opt/buros && ./scripts/backup.sh >> backups/backup.log 2>&1
# Yedekleri başka bir makineye/depoya da kopyalamayı unutmayın.
set -eu
cd "$(dirname "$0")/.."
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p backups
docker compose exec -T db pg_dump -U buros -d buros --format=custom > "backups/.db.tmp"
mv backups/.db.tmp "backups/db-$STAMP.dump"
docker compose exec -T app tar -C /data -czf - . > "backups/.files.tmp"
mv backups/.files.tmp "backups/files-$STAMP.tar.gz"
find backups -name 'db-*.dump' -mtime +"$KEEP_DAYS" -delete
find backups -name 'files-*.tar.gz' -mtime +"$KEEP_DAYS" -delete
echo "$STAMP yedek alındı: $(du -sh backups | cut -f1)"
# Geri yükleme:
#   docker compose exec -T db pg_restore -U buros -d buros --clean --if-exists < backups/db-XXXX.dump
#   docker compose exec -T app tar -C /data -xzf - < backups/files-XXXX.tar.gz
