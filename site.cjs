// Editable landing page content. Each field maps to an element with data-cms="key" in landing.html
// (prices map to data-cms-price). The defaults below match the text shipped in landing.html; only
// fields changed from the admin panel are stored and sent to the page.
// Text format: *word* becomes emphasis, a new line becomes a line break. No other markup.
const FIELDS=[
 {group:'Açılış',key:'hero_title',label:'Ana başlık',max:120,default:'Her yapı\n*bir evrakla* başlar.'},
 {group:'Açılış',key:'hero_lede',label:'Ana başlık altı',max:400,multiline:true,default:'Tapu, imar durumu, zemin etüdü, ruhsat. bürOS; mimarlık ve mühendislik bürolarının şantiye evrakını, iş akışını ve finansını tek bir bulut platformunda yönetir.'},
 {group:'Açılış',key:'hero_cta',label:'Ana buton',max:40,default:'14 gün ücretsiz deneyin'},
 {group:'Duyuru şeridi',key:'announcement',label:'Duyuru metni (boş bırakılırsa gizlenir)',max:140,default:''},
 {group:'Duyuru şeridi',key:'announcement_link',label:'Duyuru bağlantısı',max:200,default:'#iletisim'},
 {group:'Demo bölümü',key:'demo_kicker',label:'Üst etiket',max:40,default:'Canlı demo'},
 {group:'Demo bölümü',key:'demo_title',label:'Başlık',max:120,default:'Büronuzu *30 dakikada* tanıyalım.'},
 {group:'Demo bölümü',key:'demo_body',label:'Açıklama',max:400,multiline:true,default:'Ekranı paylaşarak sizin şantiyelerinize benzeyen bir çalışma alanı kuralım; evrak akışını, ekip izinlerini ve finansı birlikte gezelim. Satış baskısı yok, sorularınız var.'},
 {group:'Rakamlar',key:'stat1_value',label:'1. rakam',max:16,default:'14 gün'},
 {group:'Rakamlar',key:'stat1_label',label:'1. açıklama',max:80,default:'ücretsiz deneme, kredi kartı gerekmez'},
 {group:'Rakamlar',key:'stat2_value',label:'2. rakam',max:16,default:'5 dk'},
 {group:'Rakamlar',key:'stat2_label',label:'2. açıklama',max:80,default:'çalışma alanını kurmak için yeterli'},
 {group:'Rakamlar',key:'stat3_value',label:'3. rakam',max:16,default:'%100'},
 {group:'Rakamlar',key:'stat3_label',label:'3. açıklama',max:80,default:'verileriniz sizin; istediğiniz an dışa aktarın'},
 {group:'Fiyatlar',key:'price_ekip_monthly',label:'Ekip · aylık',max:16,default:'₺590'},
 {group:'Fiyatlar',key:'price_ekip_yearly',label:'Ekip · yıllık (aylık karşılığı)',max:16,default:'₺490'},
 {group:'Fiyatlar',key:'price_buro_monthly',label:'Büro · aylık',max:16,default:'₺890'},
 {group:'Fiyatlar',key:'price_buro_yearly',label:'Büro · yıllık (aylık karşılığı)',max:16,default:'₺740'},
 {group:'İletişim',key:'contact_email',label:'Satış e-postası (demo bölümünde görünür)',max:120,default:''},
 {group:'İletişim',key:'contact_phone',label:'Satış telefonu (demo bölümünde görünür)',max:40,default:''}
];
const BY_KEY=Object.fromEntries(FIELDS.map(f=>[f.key,f]));
function clean(input){
 const out={};
 for(const [k,v] of Object.entries(input||{})){const f=BY_KEY[k];if(!f||typeof v!=='string')continue;const s=v.replace(/\r/g,'').trim().slice(0,f.max);if(s!==f.default)out[k]=s;}
 return out;
}
module.exports={FIELDS,clean};
