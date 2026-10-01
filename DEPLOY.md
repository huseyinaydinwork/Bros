# bürOS yayına alma

Bu belge bürOS'u tek bir Linux sunucusunda (VPS) Docker ile yayına almayı anlatır. Yığın üç servisten oluşur:

- **app**: Node.js uygulaması (`Dockerfile`)
- **db**: PostgreSQL 16 (veri `db-data` biriminde)
- **caddy**: ters vekil; Let's Encrypt sertifikasını kendisi alır ve yeniler (HTTPS)

## 1. Gerekenler

| Ne | Not |
| --- | --- |
| Sunucu | En az 2 vCPU / 2 GB RAM / 40 GB disk, Ubuntu 22.04+ veya Debian 12. KVKK açısından Türkiye'de barındırma önerilir (ör. Turhost, Natro, Radore, Turkcell Bulut); yurt dışı (Hetzner, DigitalOcean) seçilirse aydınlatma metnine yurt dışı aktarım eklenmelidir. |
| Alan adı | DNS'te `A` kaydı (ve varsa `www`) sunucunun IP adresini göstermeli. |
| E-posta | SMTP hesabı (Yandex/Google Workspace/Amazon SES/Brevo) veya Resend API anahtarı. Gönderen alan adı için SPF, DKIM ve DMARC kayıtlarını sağlayıcının yönergesine göre ekleyin. |
| İsteğe bağlı | S3 uyumlu dosya deposu (Cloudflare R2, AWS S3, MinIO). Yoksa dosyalar sunucu diskinde durur. |

Sunucuda 80 ve 443 portları açık olmalı (`ufw allow 80,443/tcp`).

## 2. Kurulum

```sh
# Docker
curl -fsSL https://get.docker.com | sh

# Uygulama
sudo mkdir -p /opt/buros && sudo chown $USER /opt/buros
git clone https://github.com/huseyinaydinwork/Bros.git /opt/buros
cd /opt/buros
cp .env.example .env
nano .env        # BUROS_DOMAIN, POSTGRES_PASSWORD, BUROS_PLATFORM_ADMINS, e-posta ayarları
docker compose up -d --build
```

Birkaç saniye sonra `https://ALAN-ADINIZ` açılır. Kontrol:

```sh
docker compose ps                      # app "healthy" olmalı
curl https://ALAN-ADINIZ/healthz       # {"ok":true,"storage":"postgres",...}
docker compose logs -f app
```

## 3. İlk yönetici

Üretimde bilinen parolalı hiçbir hesap yoktur (`npm run demo` üretimde çalışmaz). Yönetici hesabını iki yoldan biriyle açın:

```sh
# Hesabı doğrudan oluşturur, rastgele geçici parolayı bir kez yazdırır
docker compose exec app node scripts/create-admin.cjs huseyinaydinwork@gmail.com "Hüseyin Aydın"
```

ya da `.env` içindeki `BUROS_PLATFORM_ADMINS` listesine e-postanızı yazıp sitede normal şekilde üye olun. Her iki yolla da hesap `/admin` paneline girebilir. Geçici parolayı ilk girişten sonra Ayarlar → Profil bölümünden değiştirin; parolayı unutursanız komutu `--reset-password` ile tekrar çalıştırın.

## 4. Güncelleme

```sh
cd /opt/buros
./scripts/backup.sh
git pull
docker compose up -d --build
```

Veritabanı tabloları açılışta kendiliğinden oluşturulur; ayrı bir göç adımı yoktur.

## 5. Yedekleme

`scripts/backup.sh` veritabanının `pg_dump` dökümünü ve dosya birimini `backups/` klasörüne yazar, 14 günden eskileri siler. Her gece çalıştırmak için:

```sh
crontab -e
15 3 * * * cd /opt/buros && ./scripts/backup.sh >> backups/backup.log 2>&1
```

Yedekleri sunucu dışına da kopyalayın (ör. `rclone` ile bir nesne deposuna). Geri yükleme komutları betiğin sonunda yazılıdır.

## 6. Mevcut kurulumdan taşıma

Dosya tabanlı bir kurulumdan (`.buros/` klasörü) PostgreSQL'e geçmek için:

```sh
DATABASE_URL=postgres://... BUROS_DATA_DIR=/eski/.buros node scripts/migrate-to-postgres.cjs
```

`S3_*` değişkenleri tanımlıysa yüklenmiş dosyalar da nesne deposuna kopyalanır. Betik tekrar çalıştırılabilir (var olan kayıtların üzerine yazar).

## 7. Ortam değişkenleri

| Değişken | Açıklama |
| --- | --- |
| `BUROS_DOMAIN` | Alan adı (Caddy ve bağlantılar için). Compose, `BUROS_PUBLIC_URL=https://BUROS_DOMAIN` olarak uygulamaya geçirir. |
| `POSTGRES_PASSWORD` | Veritabanı parolası. |
| `DATABASE_URL` | Harici PostgreSQL için (`?sslmode=require` ile SSL). Tanımlı değilse uygulama JSON dosyalarına yazar (yalnızca geliştirme). |
| `BUROS_PLATFORM_ADMINS` | `/admin` erişimi olan e-postalar, virgülle ayrılmış. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` | SMTP ile gönderim. 587'de STARTTLS kullanılır; şifreli bağlantı sunmayan sunucuya parola gönderilmez. |
| `RESEND_API_KEY` | SMTP yerine Resend ile gönderim. |
| `MAIL_FROM` | Gönderen, ör. `bürOS <bildirim@alanadiniz.com>`. |
| `S3_BUCKET`, `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PREFIX` | Dosyaları S3 uyumlu depoda tutmak için. R2 örneği: `S3_ENDPOINT=https://HESAPID.r2.cloudflarestorage.com`, `S3_REGION=auto`. |
| `SESSION_HOURS` | Oturum süresi (saat), varsayılan 168. |
| `BUROS_ALLOWED_HOSTS` | Alan adına ek olarak kabul edilecek host adları. |
| `BUROS_COMPANY`, `BUROS_COMPANY_SHORT`, `BUROS_COMPANY_ADDRESS`, `BUROS_MERSIS`, `BUROS_KEP`, `BUROS_KVKK_EMAIL`, `BUROS_SUPPORT_EMAIL`, `BUROS_HOSTING`, `BUROS_MAIL_SERVICE`, `BUROS_COURT` | `/hukuki` sayfasındaki şirket bilgileri. Eksik olanlar sayfada işaretli görünür ve sayfanın başında eksik değişkenler listelenir. |
| `BUROS_RETENTION_DAYS`, `BUROS_LEGAL_DATE` | Abonelik bitince verilerin tutulduğu gün (varsayılan 90) ve metinlerin yürürlük tarihi. |
| `TRUST_PROXY` | Üretimde varsayılan açık; `X-Forwarded-For` başlığına güvenilir. Uygulamayı vekil olmadan doğrudan internete açmayın. |

## 8. Sınırlar ve yapılacaklar

- Uygulama tek örnek (instance) olarak çalışacak şekilde tasarlanmıştır; veriler bellekte tutulup veritabanına yazılır. Yatay ölçekleme (birden çok `app`) desteklenmez.
- Online ödeme (iyzico / PayTR / Stripe) bağlı değildir; planlar yönetim panelinden elle etkinleştirilir. Ödeme için üye işyeri hesabı gerekir.
- `/hukuki` metinleri sistemin gerçek davranışına göre yazılmıştır (KVKK aydınlatma, ticari ileti onayı, gizlilik, çerez, kullanım koşulları, veri işleme sözleşmesi, başvuru). Şirket bilgileri ortam değişkenlerinden gelir. Yayından önce bir hukuk danışmanına onaylatın; VERBİS kaydı yükümlülüğünüzü kontrol edin; tüketicilere ticari ileti gönderecekseniz İYS'ye kaydolun.
- Metinlerdeki taahhütlerin bir kısmı işletme süreci gerektirir: abonelik bitiminden `BUROS_RETENTION_DAYS` gün sonra çalışma alanının silinmesi ve hesap silme talepleri şimdilik elle (yönetim paneli / veritabanı) yapılır; günlük yedek için `scripts/backup.sh` cron'a eklenmelidir.
