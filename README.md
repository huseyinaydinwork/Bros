# BürOS — Büro ve Proje Operasyon Sistemi

Mimarlık ve mühendislik büroları için çok kiracılı (SaaS) proje, evrak ve finans yönetim platformu. Node.js 18+ dışında paket kurulumu gerektirmez. Yazı tipleri Google Fonts'tan yüklenir; bağlantı yoksa sistem fontlarına düşer.

## Başlatma

```sh
npm start
```

- `http://localhost:3000` → tanıtım sayfası (landing)
- `http://localhost:3000/app` → uygulama (giriş yap / üye ol)

### Kayıt, kurulum ve deneme süresi

Kayıt formunda ad, iş e-postası ve parola zorunludur; telefon, unvan ve “bizi nereden duydunuz” isteğe bağlıdır. KVKK aydınlatma metninin onayı zorunlu, pazarlama e-postası izni isteğe bağlıdır (varsayılan kapalı). Kayıttan sonra üç adımlı kurulum açılır:

1. **Başlangıç:** yeni çalışma alanı kur ya da davet koduyla katıl.
2. **Şirket bilgileri:** firma adı, faaliyet alanı, ekip büyüklüğü, eşzamanlı proje sayısı, şehir, telefon, web sitesi. “Örnek verilerle başla” varsayılan olarak kapalıdır.
3. **Ekibini davet et:** e-posta adresi ve rol girilir; her kişiye davet bağlantısı içeren e-posta gider. Bağlantıyı açan kişi hesabını oluşturur ya da giriş yapar ve davet otomatik kabul edilir (davet yalnızca gönderildiği e-posta adresiyle kabul edilebilir, 14 gün geçerlidir).

Her yeni çalışma alanı **14 günlük deneme** ile başlar. Kenar çubuğunda kalan gün görünür. Deneme bitince çalışma alanı **salt okunur** olur: kayıtlar silinmez, okunabilir; sunucu yazma isteklerini `402` ile reddeder. Yönetici **Ayarlar → Plan ve faturalama** ekranından plan talep eder (talep platform yönetimine düşer); plan platform yönetim panelinden etkinleştirilir. Online ödeme henüz bağlı değildir.

### Hesaplar ve çalışma alanları

Herkes e-posta adresi ve parolayla üye olur. Hesap açıldıktan sonra kişi ya **yeni bir çalışma alanı kurar** (alanın yöneticisi olur, isterse örnek verilerle başlar) ya da **davet koduyla mevcut bir alana katılır**. Davet koduyla katılan kişi **Büro Personeli** rolüyle ve hiçbir erişimi olmadan başlar; yönetici **Ekip ve erişim** ekranından rolünü ve müşteri/şantiye izinlerini verir. Yönetici ekibe e-posta adresiyle doğrudan da kişi ekleyebilir: o e-postayla hesap varsa kişi kendi hesabıyla eklenir, yoksa belirlenen ilk parolayla hesap açılır.

Bir hesap birden fazla çalışma alanına üye olabilir; kenar çubuğundaki alan adından alanlar arasında geçilir. Her çalışma alanının kayıtları, dosyaları, ekibi ve izinleri tamamen ayrıdır. Davet kodu Ekip ekranından kopyalanır, yenilenir (eski kod geçersiz olur) veya kapatılır. Varsayılan/parolası bilinen üretim hesabı yoktur.

### Tanıtım sayfası

`landing.html`, `landing.css`, `landing.js` ve `vendor/three.min.js` (Three.js r128, MIT). Kaydırmayla ilerleyen 3D sahne; kamera binadan şehre uzaklaşır, şantiyeye yakınlaşır. `prefers-reduced-motion` açıkken animasyonlar durur; WebGL yoksa metinler düz arka planla gösterilir. Sayfada Ekip, Büro ve Kurumsal planları (aylık/yıllık geçişli) ve demo talep formu vardır; talepler `.buros/leads.json` dosyasına yazılır. Fiyatlar örnek değerlerdir, `landing.html` içindeki `data-monthly` / `data-yearly` alanlarından değiştirilir.

### Platform yönetim paneli

`/admin` adresi yalnızca platform yöneticilerine açıktır (`demo@buros.local` hesabı ve `BUROS_PLATFORM_ADMINS=eposta1,eposta2` ortam değişkeninde yazan hesaplar):

- **Genel bakış:** kullanıcı, aktif kullanıcı, pazarlama izni, çalışma alanı ve plan sayıları; son 30 günün kayıt grafiği; son talepler.
- **Kullanıcılar:** kayıt bilgileri, izin durumu, son giriş, üyelikler; arama, filtre, hesap pasifleştirme ve CSV dışa aktarma.
- **Şirketler:** firma profili, sahip, üye ve proje sayısı, plan ve deneme durumu; plan değiştirme ve denemeyi uzatma.
- **Kampanyalar:** hedef kitle seçerek (tüm izinliler, yöneticiler, denemesi süren/biten, ücretli, alan kurmayanlar, pasif kullanıcılar) kişiselleştirilmiş e-posta gönderme ve önizleme.
- **Otomasyonlar:** hoş geldin, çalışma alanı kuruldu, ekip daveti, deneme bitiyor (3 gün kala), deneme sona erdi, 14 gündür giriş yapmayanlar. Her biri açılıp kapatılabilir, konusu ve metni düzenlenebilir. Zamanlı kurallar saatte bir çalışır; aynı kişiye aynı e-posta bir kez gider.
- **E-posta kutusu** ve **Talepler** (landing demo talepleri, uygulama içi plan talepleri).

Pazarlama e-postaları yalnızca izin veren kişilere gider ve her birinde abonelikten çıkma bağlantısı (`/abonelik?t=…`) bulunur. Tüm e-postalar `.buros/outbox.json` dosyasına yazılır. `RESEND_API_KEY` (ve isteğe bağlı `MAIL_FROM`) tanımlanırsa e-postalar Resend üzerinden gerçekten gönderilir. E-postalardaki bağlantılar için `BUROS_PUBLIC_URL` tanımlayın.

### Yasal sayfa

`/hukuki.html`: KVKK aydınlatma metni, gizlilik politikası, çerez politikası ve kullanım koşulları. Metinler taslaktır; köşeli parantezli alanlar şirket bilgileriyle doldurulmalı ve yayından önce hukuk danışmanı tarafından gözden geçirilmelidir.

### Marka

`brand/logo.svg` (koyu zemin), `brand/logo-ink.svg` (açık zemin), `brand/mark.svg` (yalnızca simge) ve `favicon.svg`. Uygulama ve tanıtım sayfası logoyu satır içi SVG olarak kullanır; renkler CSS'ten (`.logo-a`, `.logo-b`) gelir.

### Arayüz

- Arama çubuğu üst çubukta; `Ctrl/⌘ + K` ile de açılır.
- Genel bakış: dört temel gösterge, önümüzdeki sekiz haftanın teslim yükü grafiği (geciken işler ayrı çubuk), yaklaşan teslimler, müşteri → şantiye → kayıt durumu akış diyagramı, şantiye listesi, finans özeti ve son hareketler. Grafik çubukları ve diyagram düğümleri ilgili sayfaya götürür.
- Üst çubuk ve sayfa başlıkları her ekranda aynı ızgarayı kullanır; arama çubuğu her sayfada aynı konumdadır.
- Proje ağacında müşteri ve şantiye blokları sürükleyerek (veya ↑ ↓ düğmeleriyle) sıralanır; yalnızca yönetici için.
- Şantiye görselleri logonun dilinde çizilir: eğik çatılı, kalın çizgili bina silüetleri ve bir vurgu binası; zemin çizgisi şantiyenin ilerlemesini gösterir. Her şantiyenin görseli kimliğinden türetildiği için sabittir.
- Şantiye sayfasının başında bir başlık görseli yer alır. Düzenleme izni olan kişi PNG/JPEG/WebP (en fazla 8 MB) yükleyebilir veya kaldırabilir. **Ayarlar → Büro bilgileri**'ndeki seçenek açıksa, görsel yüklenmemiş şantiyelerde kat planı çizimi gösterilir; kapalıysa başlık alanı gizlenir.
- Durumlar renkli etiket ya da nokta yerine düz metinle gösterilir; geciken işler yalnızca metin rengiyle ayrılır.
- Kenar çubuğu daraltılabilir (yalnızca simgeler). Çalışma alanı adına tıklayınca alanlar arasında geçiş, yeni alan oluşturma ve davet koduyla katılma menüsü açılır. Sol alttaki profil menüsü hesap, büro ayarları, plan, tema ve oturum kapatmayı tek yerde toplar.
- **Ayarlar** sekmeleri: Profil (ad, telefon, unvan, parola), Görünüm (Orman / Kağıt / Gece temaları, tablo yoğunluğu, kenar çubuğu, açılış sayfası, yazı tipi), Çalışma alanı (şirket bilgileri, para birimi, yaklaşan teslim uyarısı, varsayılan şablon, varsayılan şantiye görseli, yedekleme), Plan ve faturalama, Bildirimler (haftalık özet, geciken iş, pazarlama izni). Görünüm tercihleri tarayıcıda, çalışma tercihleri çalışma alanında saklanır.
- Şablon düzenleyici: numaralı bölüm kartları, bölüm bazında ağırlık ve iş akışı, kayıtları tek tek ekleme/kaldırma (Enter ile hızlı ekleme) ve bölüm ağırlıklarının yüzde dağılımını gösteren özet paneli.
- Üst çubuktaki kayıt göstergesi kaydediliyor / kaydedildi / hata / salt okunur durumlarını ayrı gösterir.

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

- `.buros/accounts.json`: hesaplar (e-posta, ad, parola özeti, telefon, unvan, kaynak, izinler, son giriş)
- `.buros/spaces.json`: çalışma alanları, şirket profili, plan ve deneme bitişi, davet kodları, e-posta davetleri, üyelikler, roller ve izinler
- `.buros/outbox.json`, `.buros/automations.json`, `.buros/leads.json`: e-posta kaydı, otomasyon ayarları ve gönderim günlüğü, demo ve plan talepleri
- `.buros/spaces/<alan-id>/workspace.json`: o alanın kayıtları ve dosya referansları
- `.buros/spaces/<alan-id>/files/`: o alanın dosyaları ve metaverileri

Eski tek büro kurulumları (`users.json` + `workspace.json`) ilk açılışta otomatik olarak tek bir çalışma alanına taşınır; eski kullanıcı adları giriş kimliği olarak çalışmaya devam eder.

Yönetici bulunduğu çalışma alanının JSON yedeğini dışa/içe aktarabilir; JSON dosya baytlarını ve kullanıcı hesaplarını içermez. Tam yedek için sunucu kapalıyken bütün `.buros` klasörünü kopyalayın. JSON geri yüklemede referans verilen dosyaların aynı veri dizininde bulunması gerekir.

API atomik dosya yazımı, revision çakışma denetimi, kaynak kontrolü ve şema doğrulaması kullanır. Testler geçici dizinlerde çalışır. `test-output/browser` UI denemelerinin ayrı çalışma alanıdır; gerçek veriler değildir.

## Dağıtım sınırı

Uygulama çok kiracılı bir SaaS olarak tasarlanmıştır; ancak bu depo henüz üretim altyapısını içermez. Yayına almak için HTTPS, kalıcı oturum deposu, veritabanı, nesne depolama, ödeme ve e-posta altyapısı ayrıca hazırlanmalıdır. Sunucu şu an yalnızca localhost'ta dinler. Oturumlar bellekte tutulur. Müşteri portalı, e-posta doğrulama/parola sıfırlama, e-posta/WhatsApp gönderimi ve formüller yoktur.

## Kaynaklar

`app.js` ekranlar ve etkileşimler; `admin.html`/`admin.js` platform yönetim paneli; `mailer.cjs` e-posta kuyruğu ve gönderimi; `automations.cjs` otomasyon ve kampanyalar; `legal.html` yasal metinler; `model.mjs` veri modeli; `calendar.mjs` takvim sınır/geometri kuralları; `server.cjs` API; `auth.cjs` hesaplar, çalışma alanları ve oturumlar; `access.cjs` rol ve kapsam denetimi; `style.css` tasarım sistemi; `brand/` logo dosyaları.
