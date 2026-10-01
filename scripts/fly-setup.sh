#!/bin/sh
# One-time Fly.io setup for bürOS. Requires flyctl (https://fly.io/docs/flyctl/install/) and `fly auth login`.
#   APP=buros-firmam ADMIN_EMAIL=siz@firma.com ./scripts/fly-setup.sh
# Creates the app, a Postgres cluster, a Tigris bucket for files, sets secrets and deploys.
# Safe to re-run: steps that already exist are skipped.
set -eu
cd "$(dirname "$0")/.."
APP="${APP:-buros}"
REGION="${REGION:-fra}"
ADMIN_EMAIL="${ADMIN_EMAIL:-huseyinaydinwork@gmail.com}"
DOMAIN="${DOMAIN:-$APP.fly.dev}"
command -v fly >/dev/null 2>&1 || { echo "flyctl bulunamadı: https://fly.io/docs/flyctl/install/"; exit 1; }

# fly.toml carries the app name; keep it in sync with APP.
sed -i.bak "s/^app = \".*\"/app = \"$APP\"/; s/^primary_region = \".*\"/primary_region = \"$REGION\"/" fly.toml && rm -f fly.toml.bak

if ! fly apps list --json | grep -q "\"Name\": *\"$APP\""; then
  echo "== Uygulama oluşturuluyor: $APP"; fly apps create "$APP"
fi

if ! fly secrets list -a "$APP" | grep -q DATABASE_URL; then
  echo "== PostgreSQL oluşturuluyor: $APP-db"
  fly postgres create --name "$APP-db" --region "$REGION" --initial-cluster-size 1 --vm-size shared-cpu-1x --volume-size 10 || true
  fly postgres attach "$APP-db" -a "$APP"
fi

if ! fly secrets list -a "$APP" | grep -q BUCKET_NAME; then
  echo "== Dosya deposu (Tigris) oluşturuluyor"
  fly storage create -a "$APP" -n "$APP-files" -y
fi

echo "== Ayarlar yazılıyor"
fly secrets set -a "$APP" --stage \
  BUROS_PUBLIC_URL="https://$DOMAIN" \
  BUROS_ALLOWED_HOSTS="$APP.fly.dev,$DOMAIN" \
  BUROS_PLATFORM_ADMINS="$ADMIN_EMAIL"

echo "== Yayınlanıyor"
fly deploy -a "$APP" --remote-only --ha=false

echo "== Yönetici hesabı"
fly ssh console -a "$APP" -C "node /app/scripts/create-admin.cjs $ADMIN_EMAIL"
# The running app loads accounts at start-up; restart it so the new account can sign in.
fly apps restart "$APP"

echo
echo "Hazır: https://$DOMAIN"
echo "E-posta için: fly secrets set -a $APP SMTP_HOST=... SMTP_USER=... SMTP_PASS=... MAIL_FROM='bürOS <bildirim@alanadiniz.com>'"
echo "Kendi alan adınız için: fly certs add alanadiniz.com -a $APP, ardından DOMAIN=alanadiniz.com ile bu betiği tekrar çalıştırın."
