# Panel API sözleşmesi

Orkestra sunucusu (`sunucu/`) ile canlı panel (`panel/index.html`) arasındaki tek sözleşme budur. Sunucu işçisi buna uyar; değişiklik gerekiyorsa panelin sahibine mesaj atılır, dosya tek taraflı değiştirilmez.

## Genel kurallar

- Sunucu `127.0.0.1:8820` adresinde çalışır. Telefondan erişim yalnızca `tailscale serve` ile olur.
- `GET /` (`panel/index.html`) **token istemez**: sayfa sır ve veri içermez. F5, sekme geri yükleme ve telefonun sekmeyi yeniden açması bu yüzden çalışır. (Host başlığı süzgeci yine uygulanır.)
- `/api/*` uç noktaları ve SSE **token ister**. Her `/api/*` isteğinde `x-token` başlığı bulunur; token yoksa ya da yanlışsa yanıt `401` olur.
- Tek istisna SSE bağlantısıdır: `EventSource` başlık gönderemediği için token `/api/akis?t=<token>` query parametresiyle gelir.
- Panelin token akışı: ilk açılışta token `/?t=<token>` ile gelir, panel onu `sessionStorage`'a yazar ve adres çubuğundan siler. Sonraki açılışlarda (F5 dahil) token `sessionStorage`'dan okunur.
- Token yoksa ya da bir `/api/*` isteği `401` dönerse panel boş ekran göstermez: "Token gerekli: sunucu penceresindeki bağlantıyı aç ya da `%LOCALAPPDATA%\zepul-os\panel-url.txt` dosyasındaki adresi kullan" mesajını ve bir token giriş kutusunu gösterir. Kutuya token ya da `?t=` içeren adresin tamamı yapıştırılabilir. `?demo=1` modu token istemez.
- Token'lı panel adresi repo dışında durur: `%LOCALAPPDATA%\zepul-os\panel-url.txt` (yoksa `~/.zepul-os/panel-url.txt`). Eski `.tmp/panel-url.txt` açılışta silinir.
- `GET /` sıkı CSP ile sunulur: `default-src 'none'`, betik yalnızca sayfadaki satır içi `<script>`'in `sha256` özetiyle çalışır (özet her istekte sayfadan hesaplanır), `style-src 'unsafe-inline'`, `img-src data:`, `connect-src 'self'`, çerçeveye alınamaz (`frame-ancestors 'none'`, `X-Frame-Options: DENY`). Panel bu yüzden dış betik, dış stil ya da font, satır içi olay işleyicisi (`onclick="…"`), `eval` ve `javascript:` bağlantısı kullanmaz. Tüm yanıtlarda `X-Content-Type-Options: nosniff` vardır.
- Gövdeler JSON'dur (`content-type: application/json; charset=utf-8`).
- Hatalı istekte yanıt `4xx` ya da `5xx` ve gövde `{ok:false, hata:"<Türkçe açıklama>"}` olur.

## Uç noktalar

### `GET /api/ajanlar`

Tüm ajanları dizi olarak döner.

```json
[{
  "id": "sunucu",
  "ad": "sunucu",
  "rol": "isci",
  "model": "claude-sonnet-5-5",
  "durum": "calisiyor",
  "maliyet_usd": 0.64,
  "baslangic": "2026-09-29T16:02:11.000Z",
  "son_olay_ts": "2026-09-29T16:20:43.512Z",
  "worktree": "C:\\…\\zepul-os\\.worktrees\\sunucu",
  "dal": "is/sunucu",
  "gorev_ozet": "SSE yayını, bus ve JSONL log",
  "baz_sha": "8d05114…",
  "brif_kabul": "SSE olayları panelde görünür, npm test yeşil"
}]
```

| Alan | Değerler |
|---|---|
| `rol` | `sef` · `isci` · `denetci` · `hata-avcisi` · `birlestirici` · `katip` · `skill-bahcivani` · `raporcu` |
| `durum` | `calisiyor` · `bekliyor` · `olu` · `bitti` · `hata` · `durduruldu` |
| `maliyet_usd` | Ajanın o ana kadarki birikimli maliyeti (sayı) |
| `worktree`, `dal` | İşçi (`isci`) kendi worktree'sinde açılır: `<repo>/.worktrees/<ad>`, dal `is/<ad>`. Diğer rollerde `dal: null`, `worktree` çalışma dizinidir. |
| `baz_sha?` | Ajan başlarken çalışma dizininin HEAD'i (işçide worktree'nin açıldığı `main` commit'i). |
| `brif_kabul?` | İşçinin brifindeki bitti tanımı (kabul); denetçi buna göre denetler. |
| `denetci_icin?` | Yalnızca denetçide: incelediği işçinin `id`'si. |

### `GET /api/olaylar?son=200`

Son N olayı, eskiden yeniye sıralı dizi olarak döner. İlk yükleme ve yeniden bağlanma sonrası boşluk doldurma için kullanılır. `son` verilmezse 200 kabul edilir. `tur=<olay türü>` verilirse önce o türe süzülür, sonra son N alınır (zepul-ai yeniden bağlanınca yalnız `gorev_sonuc` ister; kalabalık akışta eski sonuç kaçmaz).

### `GET /api/akis?t=<token>`

SSE akışı. Her olay için:

```
event: olay
data: {"id":"o-1842","ts":"2026-09-29T16:20:43.512Z","ajan":"sunucu","tur":"metin","metin":"…"}

```

15 sn'de bir `: ping` yorum satırı gönderilir. Panel bağlantı koparsa üstel geri çekilmeyle yeniden bağlanır, ardından `/api/olaylar` ile boşluğu doldurur.

Aynı anda en çok 8 akış açık olur; 9. bağlantı `429 {ok:false, hata}` alır (eski sekmeler kapatılınca yer açılır). Okumayan bir akışın gönderim kuyruğu 1 MB'ı aşarsa sunucu o bağlantıyı keser; panel yukarıdaki gibi yeniden bağlanır.

### `POST /api/mesaj`

Kullanıcıdan bir ajana mesaj gönderir.

```json
{ "ajan": "sunucu", "metin": "Ping aralığını yapılandırmaya taşı." }
```

Yanıt: `{ok:true}`. Ajanın oturumu kapalıysa (`bitti` ya da `olu`) yanıt `409 {ok:false, hata:"ajanın oturumu kapalı"}` olur; panel bu ajanlar için yazma kutusunu baştan kapatır ("Oturum kapandı; yeni görev için şefe yaz"), 409 gelirse satır içinde açıklayıcı hata gösterir. Sunucu mesajı ajanın gelen kutusuna ekler ve SSE'ye bir `mesaj` olayı yayınlar: `ajan:"kullanici"`, `kimden:"kullanici"`, `kime:<ajan id>`. Panel bu yankıyı görünce kendi iyimser kopyasını kaldırır.

### `POST /api/onay`

Bekleyen bir onay isteğine karar verir.

```json
{ "onay_id": "onay-1", "karar": "evet", "not": "Yalnızca bu dal için." }
```

`karar` değeri `evet` ya da `hayir` olur; `not` isteğe bağlıdır. Yanıt: `{ok:true}`. Sunucu ardından bir `onay_sonuc` olayı yayınlar; panel onayı kuyruktan bu olayla kaldırır.

### `POST /api/sef/yeniden`

Şef ölmüşse (`olu`, diriltme tükendi) ya da oturumu bitmişse (`bitti`) şefi aynı kayıtla, yeni bir oturumda başlatır. Gövde gerekmez. Yanıt: `{ok:true}`; ardından şef için `durum: bekliyor` olayı gelir. Şef hâlâ açıksa `409`, sunucu `--sef-yok` ile açıldıysa `404`, kapanıyorsa `409` döner. Şef ölünce sunucu ntfy ile bu ucu hatırlatır. Panelde `olu` ya da `bitti` şef kartı için "Şefi yeniden başlat" düğmesi beklenir; düğme panel sahibinin işidir ve henüz yoktur (o zamana dek uç `x-token` ile elle çağrılır).

### `GET /api/limit`

Bekçinin canlı limit durumu. Yanıt: `{limit: LimitDurumu|null, karar: {yeniIsSerbest, neden, uyari?, esik_asildi?}, ayar: Ayar}`.

- `limit`: son başarılı `limit.py` ölçümü (`{bes_saat?: {yuzde, sifirlanma}, yedi_gun?: {yuzde, sifirlanma}, plan?, kaynak, yas_dk, ts}`); hiç okunamadıysa `null`.
- `karar.yeniIsSerbest: false` iken `ajan_baslat` işi başlatmaz, kuyruğa alır. `esik_asildi`: `haftalik` · `bes_saat`.
- Tavan tanımlıyken ölçüm 10 dakikadan eskiyse karar güvenli taraftadır (`yeniIsSerbest: false`, "limit okunamadı").

### `GET /api/ayarlar` · `POST /api/ayarlar`

`GET` bekçi ayarını döner: `Ayar = {haftalik_tavan_yuzde: number|null, bes_saat_tavan_yuzde: number|null, maliyet_hizi_usd_10dk, tekrar_uyari, tekrar_durdur, ilerlemesiz_dk, azami_isci, guncelleyen?, guncelleme_ts?}`. Tavan yüzdeleri 0-100 ya da `null` (tavan yok); `azami_isci` 1-12 arası tam sayı (varsayılan 4): aynı anda açık olabilecek işçi sayısı (şef ve denetçi sayılmaz; yeni başlatma ve diriltme bu sınıra bakar, çalışan işçi durdurulmaz); diğerleri pozitif sayı. Şefin `ayar_yaz` aracı `azami_isci`'yi yazamaz; yalnızca panel (kullanıcı) değiştirir.

`POST` gövdesi `Partial<Ayar>`'dır; yalnızca verilen alanlar değişir, `guncelleyen: "panel"` yazılır. Yanıt güncel `Ayar`. Bilinmeyen alan ya da geçersiz değer `400 {ok:false, hata}` döner. Yazımdan sonra limit hemen yeniden değerlendirilir; değiştiyse bir `limit` olayı gelir. Şef aynı ayarı bus aracı `ayar_yaz` ile yazar (`guncelleyen: "sef"`).

### `GET /api/bekleyen`

Limit kapalıyken kuyruğa alınan işler: `BekleyenIs[] = [{id: "is-…", istek: {ad, rol, model, gorev, …}, neden, ts}]`. Otomatik başlatma yoktur: limit açılınca şefe sorulur, şef `ajan_baslat`'ı `kuyruk_id` ile çağırınca kayıt silinir.

### `POST /api/kapat`

Sunucuyu düzgün kapatır: bekleyen onaylar reddedilir, oturumlar durur, `durum: kapanis` olayı (açık worktree listesiyle) ve her ajan için `durum: bitti` yayılır, süreç çıkar. Worktree'ler silinmez. Yanıt: `{ok:true}`. `npm run kapat` bu ucu adres dosyasındaki token'la çağırır.

### Sonradan eklenen üretim uçları

Her uç tek satırdır; ayrıntı bağlantılı sözleşmededir. Kaynak: `sunucu/orkestra.ts`.

- `GET /api/alanlar` · `POST /api/alanlar`: çalışma alanları listesi ve değişikliği (panel token'ı ve zepul-ai anahtarı); her değişiklik `alanlar` olayıyla yayılır. Sözleşme: [calisma-alanlari.md](sozlesme/calisma-alanlari.md).
- `GET /api/guven` · `POST /api/guven`: güven modu durumu (`jev_soguma_bitis` dahil) ve değişikliği. Sözleşme: [guven-modu.md](sozlesme/guven-modu.md).
- `GET /api/onaylar`: bekleyen onaylar `[{onay_id, ajan, arac, ozet, bitis, risk, ts, kesin?}]` (yalnız panel token'ı); panel açılışta ve yeniden bağlanmada kartlarını buna göre düzeltir. Süre dolan onayın `onay_sonuc` olayında `sure: true` olur.
- `POST /api/onay/hepsi`: gövde `{karar:"evet"}`; bekleyen onayların hepsini onaylar. Sözleşme: [guven-modu.md](sozlesme/guven-modu.md).
- `POST /api/gorev`: zepul-ai görevi `{metin, gorev_id?}` şefe etiketli gider; sonuç `gorev_sonuc` olayıyla döner. Sözleşme: [faz7-zepul-ai.md](sozlesme/faz7-zepul-ai.md).
- `POST /api/gorev/iptal`: `{gorev_id}`; açık görevi iptal eder (BASARISIZ "iptal edildi", şefe not). Sözleşme: [faz7-zepul-ai.md](sozlesme/faz7-zepul-ai.md).
- `POST /api/zepul-ai/cevap`: `{soru_id, karar:"evet|hayir", not?}`; zepul-ai'nin sorusuna kullanıcı cevabı. Sözleşme: [faz7-zepul-ai.md](sozlesme/faz7-zepul-ai.md).
- `POST /api/katip-not`: zepul-ai notunu kâtip yoluyla MyBrain'e yazar (tür, boyut, yol ve sır doğrulanır). Sözleşme: [faz7-zepul-ai.md](sozlesme/faz7-zepul-ai.md).
- `GET /api/laya-istatistik`: Laya gölge günlüğü ve taban ölçümünden özet istatistik. Sözleşme: [guven-modu.md](sozlesme/guven-modu.md).
- `GET /api/modeller`: panel model seçicisi için `{claude, sef_ek, ikinci_gorus_ek, yerel, yedek}`. Ayrıntı: [yol-haritasi.md](yol-haritasi.md) (Faz 5.5).

## Olay nesnesi

Her olay şu ortak alanları taşır:

| Alan | Açıklama |
|---|---|
| `id` | Benzersiz metin. Aynı olay birden çok kez gelebilir; panel `id` ile tekilleştirir. |
| `ts` | ISO 8601 UTC zaman damgası (`2026-09-29T16:20:43.512Z`) |
| `ajan` | Olayı üreten ajanın `id` değeri; kullanıcıdan gelen mesajda `kullanici` |
| `tur` | Aşağıdaki tablodaki değerlerden biri |

`tur` değerine göre ek alanlar:

| `tur` | Ek alanlar |
|---|---|
| `durum` | `{durum}` |
| `metin` | `{metin}` |
| `arac` | `{arac_id, arac, girdi_ozet}` |
| `arac_sonuc` | `{arac_id, basarili, ozet}` |
| `mesaj` | `{kimden, kime, metin}` (`kimden`/`kime` `kullanici` olabilir) |
| `maliyet` | `{maliyet_usd, toplam_usd}` |
| `hata` | `{kaynak:"ag\|pc\|claude-api\|arac\|ajan\|kapi", tur_adi, mesaj, geri_alinabilir, devam_edilebilir, oneri}` |
| `onay_istek` | `{onay_id, arac, girdi_ozet, neden, risk:"dusuk\|orta\|yuksek\|geri-alinamaz"}` |
| `onay_sonuc` | `{onay_id, karar}` |
| `kapi` | `{karar:"izin\|red\|insan", neden, jev_secim?, jev_guven?}` |
| `sozlesme` | `{verdict, blockers, commits, ozet, sonraki_adim?}` (işçinin JSON dönüşü) |
| `denetim` | `{isci, denetci, verdict:"PASS"\|"VETO", gerekce, kirmiziya_dondu:[{test, sonuc}], blockers}` (`ajan`: denetçi) |
| `birlesme` | `{isci, dal, durum:"tamam"\|"cakisma"\|"kirli-ana"\|"hata", sha?, cakisan?}` (`ajan`: işçi) |
| `limit` | `{bes_saat_yuzde, yedi_gun_yuzde, bes_saat_sifirlanma, yedi_gun_sifirlanma, serbest, neden, uyari?, haftalik_tavan, bes_saat_tavan, kaynak, yas_sn, guncellendi_iso, bayat}` (`ajan: "sunucu"`). `kaynak`: `canli` · `son-canli` · `gozlem` · `yerel-onbellek`; `bayat: true` ise değer tavan kararında kullanılmaz, `uyari` "limit bilinmiyor (bayat)" der |

### Alan ayrıntıları

- `arac_sonuc.arac_id`, eşleştiği `arac` olayının `arac_id` değeridir. `basarili` bir boolean'dır.
- `maliyet.maliyet_usd` ajanın birikimli maliyetidir; `toplam_usd` tüm orkestranın birikimli maliyetidir.
- `hata.geri_alinabilir` ve `hata.devam_edilebilir` boolean'dır (`true` = evet).
- `kapi.jev_guven` 0 ile 1 arasında bir sayıdır; yüzde değildir.
- `kapi.neden` yalnızca gerekçeyi taşır; panel "kapı: <karar>" etiketini kendisi yazar. Neden aynı etiketi tekrarlıyorsa (`kapı: izin`) panel onu tekilleştirir.
- `metin` olaylarında minimal markdown işlenir: `**kalın**`, satır içi kod, `#` başlık satırı, `-` listesi ve üç ters tırnaklı kod bloğu. Panel önce HTML'i kaçırır, sonra işaretleri işler; ham HTML asla çalışmaz.
- `sozlesme.verdict`: işçi için `TAMAM` · `KISMI` · `BASARISIZ`, denetçi için `PASS` · `VETO`. `blockers` ve `commits` metin dizileridir.
- `sozlesme.sonraki_adim`: kodun verdiği karar (`duzeltme` · `sefe` · `denetciye` · `birlestiriciye`). `duzeltme`de düzeltme mesajı aynı ajana gider ve oturum açık kalır; diğerlerinde özet şefe gider ve işçinin oturumu kapanır.
- **Faz 3 akışı:** İşçi `sozlesme {verdict:"TAMAM", sonraki_adim:"denetciye"}` döner; işçinin oturumu açık kalır (`bekliyor`), şefe gitmez. Kod `denetci-<işçi>` adlı denetçiyi (`rol:"denetci"`, `denetci_icin:<işçi>`) başlatır. Denetçi bitince önce `denetim`, ardından denetçinin `sozlesme` olayı (`sonraki_adim`: `birlestiriciye` · `duzeltme` · `sefe`) gelir ve denetçi `bitti` olur. `birlestiriciye` ise kod birleştirir ve `birlesme` olayı gelir; `tamam`da işçi de `bitti` olur, worktree ve `is/<ad>` dalı kaldırılır. `duzeltme`de (VETO) ve `cakisma`da işçiye `mesaj` gider (`kimden`: denetçi), işçi yeniden `calisiyor` olur; yeniden TAMAM dönünce aynı adlı denetçi yeni oturumla açılır.
- `denetim.kirmiziya_dondu[].sonuc`: `kirmizi` (geri alınınca test kırmızıya döndü) · `yesil-kaldi` (test o davranışı ölçmüyor, VETO) · `uygulanamadi` (yalnızca doküman değişikliği). `denetim.blockers` metin dizisidir; ölçmeyen testler de blocker olarak eklenir.
- `birlesme.durum`: `tamam` (`sha` main'deki birleşme commit'i) · `cakisma` (`cakisan` dosyalar; merge geri alındı, işçiye "main'i dalına al" talimatı gider, en çok 2 kez) · `kirli-ana` (ana ağaç temiz değil, birleştirme denenmedi) · `hata`. Son ikisinde ntfy uyarısı gider.
- `durduruldu`: döngü bekçisi ajanı durdurdu (aynı çağrı art arda, iki çağrılı döngü, ilerlemesiz uzun pencere ya da 10 dakikada maliyet sınırı aşıldı). Önce `hata {tur_adi:"dongu", mesaj:<neden>}` gelir; ntfy'ye yalnızca kural adı gider. Ajanın oturumu açıktır: kullanıcı ya da şef mesaj atınca `calisiyor` olur. Durdurmadan önceki uyarı `hata {tur_adi:"dongu-uyari"}` olarak gelir, ajan çalışmayı sürdürür. `durduruldu` ajan diriltilmez.
- `limit` olayı bekçinin dakikalık ölçümünde yüzdeler, karar ya da tavan değişince, değişmese de en geç 5 dakikada bir gelir (sıfırlanma zamanındaki küçük oynamalar değişim sayılmaz). Yüzde ve sıfırlanma alanları ölçüm yoksa `null`; `haftalik_tavan`/`bes_saat_tavan` tanımsızsa `null`. `serbest: false` = yeni iş kuyruğa alınıyor.
- `durum: kapanis` (`ajan: "sunucu"`): sunucu kapanırken bir kez gelir; ek alan `acik_worktreeler: [{repo, yol, dal, sha}]`. Liste ana depo ve işçilerin depolarındaki açık worktree'lerdir (ana ağaç hariç); yollar maskelidir, okunamayan depo listede yer almaz. Worktree'ler silinmez: commit'lenmemiş iş diskte kalır, sonraki açılışta elle incelenir (`git worktree list`).
- Ajanın `durum`'u değişince sunucu bir `durum` olayı yayınlar. Panel bu olaylarla ve `maliyet` olaylarıyla ajan kartını günceller.
- Panelin tanımadığı bir `ajan` değeriyle olay gelirse panel `/api/ajanlar` listesini yeniden çeker.
- Tanımsız bir `tur` panelde tek satırlık "bilinmeyen olay" olarak görünür; akış bozulmaz.
