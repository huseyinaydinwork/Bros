# BürOS — Büro ve Proje Operasyon Sistemi

Türkçe proje operasyon uygulaması. Node.js 18+ dışında paket kurulumu gerektirmez; yazı tipleri dahil yerel çalışır.

## Başlatma

```sh
npm start
```

http://localhost:3000 adresini açın. İlk açılışta kendi yönetici hesabınızı ve en az 10 karakterlik parolanızı oluşturun. Mevcut çalışma alanı ve dosyalar korunur. Yönetici daha sonra **Ekip ve erişim** ekranından hesapları ve izinleri tanımlar. Varsayılan/parolası bilinen üretim hesabı yoktur.

```sh
npm run check
npm test
```

Sunucu yalnızca `127.0.0.1` üzerinde dinler. `PORT` ve `BUROS_DATA_DIR` ortam değişkenleri portu ve veri dizinini değiştirir. Oturumlar 12 saat geçerlidir; sunucu yeniden başlayınca yeniden giriş gerekir.

## Hiyerarşi

```text
Projeler (çalışma ağacı)
└── Müşteri
    ├── A Şantiyesi
    │   ├── Evraklar
    │   │   └── Kayıt → Özellikler / Dosyalar / Yorumlar
    │   ├── Projelendirme
    │   └── Resmî Süreçler
    └── B Şantiyesi
```

Müşteriler bağımsız bir navigasyon modülü değildir. Yeni müşteri, bir şantiye oluşturulurken ona bağlanarak oluşur. Sunucu, şantiyesi olmayan yeni müşteri kaydını reddeder. Mevcut verilerle uyum için JSON şemasındaki `projects` koleksiyonu şantiyeleri temsil etmeye devam eder; her şantiye `clientId` ile müşterisine bağlıdır.

Müşteri başlıkları kapanıp açılır. Şantiye altındaki bölümler açılarak kayıtlara doğrudan ulaşılır. Kayıt, bölüm, sorumlu, tarih, dinamik alan, iş akışı ve dosya sistemi önceki sürümle uyumludur.

## Üç rol ve kapsamlı erişim

| Rol | Yetki |
| --- | --- |
| Yönetici | Tüm çalışma alanı, kullanıcılar, izinler, şablonlar ve iş akışları |
| Proje Sorumlusu | Açıkça izin verilmiş müşteri/şantiyeleri görüntüleme; düzenleme izni varsa şantiye yapısı ve operasyon |
| Büro Personeli | Açıkça izin verilmiş alanları görüntüleme; düzenleme izni varsa durum, sorumlu, tarih, alan değeri, not, yorum ve dosya işlemleri |

Her kişi için müşteri veya şantiye bazında **Görüntüle** / **Görüntüle ve düzenle** verilir. Müşteri izni altındaki bütün şantiyelere miras kalır. İzinler birleşir; düzenleme izni görüntülemeden önceliklidir. Şantiyedeki “Doğrudan izin yok” seçimi üst müşteriden gelen izni iptal etmez. Her iki kapsamdan da izin kaldırılırsa erişim kapanır.

Kontrol yalnızca arayüzde değildir: sunucu, okunan çalışma alanını filtreler; yazmaları kapsam ve role göre denetler. Kapsam dışında kalan şantiyeler güncellenmez. Dosya indirme/yükleme de şantiye yetkisine bağlıdır. Parolalar scrypt ile özetlenir, oturum çerezleri HttpOnly ve SameSite=Strict kullanır. Hesap/izin değişiklikleri ilgili kişinin mevcut oturumlarını sonlandırır (işlemi yapan yöneticinin kendi oturumu hariç).

## Takvim çalışma alanı

- Tek yüzey üzerinde art arda aylar: aşağı/yukarı kaydırarak ay değiştirin.
- **Ctrl/⌘ + tekerlek**, **+/−** düğmeleri veya odaklı takvimde klavye **+/−**: yakınlaştırma.
- **0** / yüzde düğmesi: %100. Izgara düğmesi: genişliğe sığdırma.
- **Boşluk + sürükle** veya orta fare tuşu: tutup taşıma.
- Dokunmatik yüzeyde sürükleme / iki parmak yakınlaştırma.
- Zoom %65–%160 ile sınırlıdır. Görünen tarih aralığı açılış ayından 24 ay önce / 24 ay sonra olmak üzere 49 aydır. Yatay/dikey hareket takvim sınırlarını aşmaz.
- “Bugün” mevcut aya döner. Gün içindeki fazla işler “+N iş daha” ile açılır.

## Diğer özellikler

Şablondan/boş şantiye, özel alanlar (metin/sayı/tarih/checkbox/seçim/e-posta/URL), dinamik durumlar, bölüm ağırlıklı ilerleme, sürükle-bırak liste/pano, müşteri iletişim bilgileri, kayıt notları/yorumlar, arama, geciken iş bildirimleri, dosya sürümleri ve hareket geçmişi.

Dosya sınırı 25 MB/dosyadır. Aynı adlı dosyalar eski sürümleri silmeden saklanır. Uygulama içi DWG/PDF görüntüleyici yerine indirme desteklenir.

## Veriler ve yedekleme

- `.buros/workspace.json`: çalışma alanı ve dosya referansları
- `.buros/files/`: gerçek dosyalar ve metaveriler
- `.buros/users.json`: hesaplar, parola özetleri ve izinler

Yönetici JSON yedeği dışa/içe aktarabilir; JSON dosya baytlarını ve kullanıcı hesaplarını içermez. Tam yedek için sunucu kapalıyken bütün `.buros` klasörünü kopyalayın. JSON geri yüklemede referans verilen dosyaların aynı veri dizininde bulunması gerekir.

API atomik dosya yazımı, revision çakışma denetimi, kaynak kontrolü ve şema doğrulaması kullanır. Testler geçici dizinlerde çalışır. `test-output/browser` UI denemelerinin ayrı çalışma alanıdır; gerçek veriler değildir.

## Dağıtım sınırı

Bu, yerel tek-büro uygulamasıdır; gerçek kullanıcı ve kapsam izinleri vardır. Uzak ofis erişimi için HTTPS, kalıcı oturum altyapısı, veritabanı / yedekleme operasyonu ve dağıtım yapılandırması ayrıca hazırlanmalıdır. Sunucu hâlâ yalnızca localhost'ta dinler. Müşteri portalı, e-posta/WhatsApp gönderimi, formüller ve çoklu organizasyon yoktur.

## Kaynaklar

`app.js` ekranlar ve etkileşimler; `model.mjs` veri modeli; `calendar.mjs` takvim sınır/geometri kuralları; `server.cjs` API; `auth.cjs` oturum/kullanıcılar; `access.cjs` rol ve kapsam denetimi; `style.css` tasarım sistemi. `fonts/` DM Sans ve Manrope dosyaları ile SIL OFL lisanslarını içerir.
