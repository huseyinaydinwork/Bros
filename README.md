# BürOS — Büro ve Proje Operasyon Sistemi

Mimarlık ve mühendislik büroları için çok kiracılı (SaaS) proje, evrak ve finans yönetim platformu. Node.js 18+ dışında paket kurulumu gerektirmez. Yazı tipleri Google Fonts'tan yüklenir; bağlantı yoksa sistem fontlarına düşer.

## Başlatma

```sh
npm start
```

- `http://localhost:3000` → tanıtım sayfası (landing)
- `http://localhost:3000/app` → uygulama (giriş yap / üye ol)

### Hesaplar ve çalışma alanları

Herkes e-posta adresi ve parolayla üye olur. Hesap açıldıktan sonra kişi ya **yeni bir çalışma alanı kurar** (alanın yöneticisi olur, isterse örnek verilerle başlar) ya da **davet koduyla mevcut bir alana katılır**. Davet koduyla katılan kişi **Büro Personeli** rolüyle ve hiçbir erişimi olmadan başlar; yönetici **Ekip ve erişim** ekranından rolünü ve müşteri/şantiye izinlerini verir. Yönetici ekibe e-posta adresiyle doğrudan da kişi ekleyebilir: o e-postayla hesap varsa kişi kendi hesabıyla eklenir, yoksa belirlenen ilk parolayla hesap açılır.

Bir hesap birden fazla çalışma alanına üye olabilir; kenar çubuğundaki alan adından alanlar arasında geçilir. Her çalışma alanının kayıtları, dosyaları, ekibi ve izinleri tamamen ayrıdır. Davet kodu Ekip ekranından kopyalanır, yenilenir (eski kod geçersiz olur) veya kapatılır. Varsayılan/parolası bilinen üretim hesabı yoktur.

### Tanıtım sayfası

`landing.html`, `landing.css`, `landing.js` ve `vendor/three.min.js` (Three.js r128, MIT). Kaydırmayla ilerleyen 3D sahne; kamera binadan şehre uzaklaşır, şantiyeye yakınlaşır. `prefers-reduced-motion` açıkken animasyonlar durur; WebGL yoksa metinler düz arka planla gösterilir. Sayfada Ekip, Büro ve Kurumsal planları (aylık/yıllık geçişli) ve demo talep formu vardır; talepler `.buros/leads.json` dosyasına yazılır. Fiyatlar örnek değerlerdir, `landing.html` içindeki `data-monthly` / `data-yearly` alanlarından değiştirilir.

### Marka

`brand/logo.svg` (koyu zemin), `brand/logo-ink.svg` (açık zemin), `brand/mark.svg` (yalnızca simge) ve `favicon.svg`. Uygulama ve tanıtım sayfası logoyu satır içi SVG olarak kullanır; renkler CSS'ten (`.logo-a`, `.logo-b`) gelir.

### Arayüz

- Arama çubuğu üst çubukta; `Ctrl/⌘ + K` ile de açılır.
- Genel bakış: dört temel gösterge, önümüzdeki sekiz haftanın teslim yükü grafiği (geciken işler ayrı çubuk), yaklaşan teslimler, müşteri → şantiye → kayıt durumu akış diyagramı, şantiye listesi, finans özeti ve son hareketler. Grafik çubukları ve diyagram düğümleri ilgili sayfaya götürür.
- Üst çubuk ve sayfa başlıkları her ekranda aynı ızgarayı kullanır; arama çubuğu her sayfada aynı konumdadır.
- Proje ağacında müşteri ve şantiye blokları sürükleyerek (veya ↑ ↓ düğmeleriyle) sıralanır; yalnızca yönetici için.
- Şantiye görselleri, şantiye kimliğinden türetilen kat planı çizimleridir (aks, duvar, kapı, pencere, ölçü çizgisi). Şantiye ilerledikçe mahaller sırayla taranır.
- Şantiye sayfasının başında bir başlık görseli yer alır. Düzenleme izni olan kişi PNG/JPEG/WebP (en fazla 8 MB) yükleyebilir veya kaldırabilir. **Ayarlar → Büro bilgileri**'ndeki seçenek açıksa, görsel yüklenmemiş şantiyelerde kat planı çizimi gösterilir; kapalıysa başlık alanı gizlenir.
- Durumlar renkli etiket ya da nokta yerine düz metinle gösterilir; geciken işler yalnızca metin rengiyle ayrılır.
- **Ayarlar → Yazı tipi** bölümünden beş font seçeneği arasında geçiş yapılır (tarayıcıya kaydedilir). "Sistem" seçeneği internet bağlantısı gerektirmez.

### Demo hesabıyla hızlı başlangıç

```sh
npm run demo
```

Bu komut `demo@buros.local` / `demo123456` bilgileriyle bir hesap ve yöneticisi olduğu **Demo Mimarlık** çalışma alanını oluşturur (hesap zaten varsa parolasını bu değere sıfırlar), alan boşsa örnek verileri yükler, davet kodunu yazdırır ve sunucuyu başlatır. Parolanızı unuttuğunuzda da bu komutla yeniden giriş yapabilirsiniz. Bilinen bir parola tanımladığı için yalnızca yerel deneme amacıyla kullanın.

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

Her müşteri/şantiye izninin yanında ayrı bir **Finans** işareti bulunur; bu işaret o kapsamın finans hareketlerini görüntülemeyi açar ve mevcut görüntüle/düzenle düzeyinden bağımsızdır. Finans hareketlerini oluşturmak, düzenlemek ve silmek yalnızca yöneticiye aittir.

## Finans modülü

Gelir ve gider hareketleri (hakediş, avans, taşeron ödemesi vb.) her zaman bir şantiyeye bağlanır; bu bağ üzerinden otomatik olarak müşteriye de ilişkilendirilmiş olur. Her hareket bir tür (Gelir/Gider), durum, tutar, tarih, kategori ve not taşır.

Finans durumları **İş akışları** ekranındaki **Finans** akışından düzenlenir (varsayılan: Planlandı, Faturalandı, Ödendi). Tamamlanan tipindeki durumlar gerçekleşmiş, bekleyen tipindekiler planlanan tutar olarak özetlenir. Kayıt durumları gibi finans durumu da listeden satır içinde değiştirilebilir.

- **Finans** menüsü, yöneticiye ve şantiye/müşteri bazında finans izni verilmiş kişilere görünür; menüde tüm çalışma alanının gelir/gider/net bakiye özeti ve filtrelenebilir hareket listesi yer alır.
- Şantiye detayındaki **Finans** sekmesi ve müşteri sayfasındaki **Finans özeti**, yalnızca o şantiye/müşteri için finans izni olanlara görünür ve sadece ilgili kayıtları listeler.
- Sunucu, finans hareketlerini `/api/state` içinde ayrıca filtreler: bir kullanıcı finans izni olmayan bir şantiyenin hareketlerini API üzerinden de göremez. Finans hareketi ekleme/düzenleme/silme sunucu tarafında yöneticiyle sınırlıdır; başka bir rolün gönderdiği finans değişiklikleri sessizce yok sayılır.

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

Dosyalar bir kayda (kayıt çekmecesi) ya da doğrudan şantiyeye (şantiye sayfası → Dosyalar sekmesi, sürükle-bırak desteklenir) yüklenir. Dosya sınırı 25 MB/dosyadır. Aynı adlı dosyalar eski sürümleri silmeden saklanır. Sunucu, yeni dosya referanslarının gerçekten o şantiyeye veya kayda yüklendiğini doğrular. Uygulama içi DWG/PDF görüntüleyici yerine indirme desteklenir.

## Veriler ve yedekleme

- `.buros/accounts.json`: hesaplar (e-posta, ad, parola özeti)
- `.buros/spaces.json`: çalışma alanları, davet kodları, üyelikler, roller ve izinler
- `.buros/spaces/<alan-id>/workspace.json`: o alanın kayıtları ve dosya referansları
- `.buros/spaces/<alan-id>/files/`: o alanın dosyaları ve metaverileri

Eski tek büro kurulumları (`users.json` + `workspace.json`) ilk açılışta otomatik olarak tek bir çalışma alanına taşınır; eski kullanıcı adları giriş kimliği olarak çalışmaya devam eder.

Yönetici bulunduğu çalışma alanının JSON yedeğini dışa/içe aktarabilir; JSON dosya baytlarını ve kullanıcı hesaplarını içermez. Tam yedek için sunucu kapalıyken bütün `.buros` klasörünü kopyalayın. JSON geri yüklemede referans verilen dosyaların aynı veri dizininde bulunması gerekir.

API atomik dosya yazımı, revision çakışma denetimi, kaynak kontrolü ve şema doğrulaması kullanır. Testler geçici dizinlerde çalışır. `test-output/browser` UI denemelerinin ayrı çalışma alanıdır; gerçek veriler değildir.

## Dağıtım sınırı

Uygulama çok kiracılı bir SaaS olarak tasarlanmıştır; ancak bu depo henüz üretim altyapısını içermez. Yayına almak için HTTPS, kalıcı oturum deposu, veritabanı, nesne depolama, ödeme ve e-posta altyapısı ayrıca hazırlanmalıdır. Sunucu şu an yalnızca localhost'ta dinler. Oturumlar bellekte tutulur. Müşteri portalı, e-posta doğrulama/parola sıfırlama, e-posta/WhatsApp gönderimi ve formüller yoktur.

## Kaynaklar

`app.js` ekranlar ve etkileşimler; `model.mjs` veri modeli; `calendar.mjs` takvim sınır/geometri kuralları; `server.cjs` API; `auth.cjs` hesaplar, çalışma alanları ve oturumlar; `access.cjs` rol ve kapsam denetimi; `style.css` tasarım sistemi; `brand/` logo dosyaları.
