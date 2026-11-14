# Hata avı, 12. tur (K15): kapı karar tablosu

- **Kapsam:** HEAD `ae8f9a1`. İncelenen dosyalar `sunucu/kapi.ts`, `sunucu/olay.ts` ve `sunucu/yol.ts`. Tur 11 düzeltmeleri de incelendi (`git diff b9c3837..ae8f9a1 -- sunucu/`): proje dışı okuma, WebFetch URL ve DNS denetimi, NotebookEdit, Grep glob'unda dizin jokeri ve yerel ajanda WebFetch. Satır numaraları `ae8f9a1` içindir.
- **Kural:** `KURALLAR.md` F, "Proje dışı okuma ve ağ" maddesi.
- **Yöntem:**
  - Çalışma kopyası `%TEMP%\zepul-av12-kopya\zepul-os`. Kopyaya `sunucu/*.ts`, `test/kapi-karar-tablosu.test.ts` ve `package.json` alındı.
  - `test/av12.test.ts` gerçek `kapiKarari`'yı çağırdı. Sahte Jev her parçaya "guvenli 0,95" döndü. Sahte DNS ada göre son adres listesini döndü; CNAME zinciri `lookup` içinde son adreslere iner, bu yüzden yalnızca son adresler verildi. Gerçek ağ çağrısı yapılmadı ve kapı girdisi olarak hiçbir komut çalıştırılmadı.
  - Kopyada şu sahte yapı kuruldu:
    - Kardeş klasörler: `zepul-os2` ve `zepul-os-yedek-1235`. 8.3 kısa adı `ZEPUL-~2`.
    - Proje dışında `dis/` klasörü.
    - Kök içinde `baglanti` adlı gerçek bir junction. Hedefi `dis/`.
    - Denetçi kopya kökü `denetim/isci1-1`.
  - Claude Code'un yol açılımı SDK'daki `claude.exe` (win32-x64) metninden okundu: `if(n==="~")return …homedir; if(n.startsWith("~/"))return join(homedir, …)`. Read, Grep, Glob ve LS yolları bu fonksiyondan geçer. `~\` açılmaz.
  - Etiketler kalıcı tabloyla aynıdır: `PARCA:n`, `TEK`, `INSAN`, `RED` ve `IZIN` (Jev'siz salt okuma izni).
  - Kalıcı tablo kopyada yeşil: 914/914.
- **Beklenen sütunu:** Kuralın birden çok karara izin verdiği satırlarda daha sıkı karar da kabul edildi.

## Özet

| # | Önem | Yer | Başlık |
|---|---|---|---|
| 1 | yüksek | `yol.ts:13-29`, `kapi.ts:309-311`, `olay.ts:461` | `~` ve `~/…` yolu ev dizini yerine kökün altındaki `~` klasörü sayılıyor. Read, Grep, Glob, LS ve NotebookRead ev dizinini Jev'siz `IZIN` ile okuyor. Panel token dizinine (`~/AppData/Local/zepul-os`) yapılan Grep ve Glob da `IZIN` alıyor; bu sır içeren dizin, `RED` almalıydı |
| 2 | orta | `kapi.ts:331-334` | Yerel ajanda `WebSearch` her zaman insana gitmiyor. Gerçek WebSearch girdisinde `url` alanı yok, yalnızca `query` var. Bu yüzden yerel denetimi atlanıyor, karar Jev'e gidiyor ve `gec` dönüyor. Yerel ajanda `gec` açık `allow` demek |
| 3 | düşük | `kapi.ts:315-320` | Glob deseninde jokerli bileşenden sonra `..` geliyorsa (`*/../../dis/*.txt`) jokersiz önek `.` sayılıyor ve sonuç `IZIN`. ripgrep globu arama kökü altındaki göreli yollarla eşler, bu yüzden bugün dışarı çıkmıyor. Yine de kural metni "dizin bileşeninde joker içeren glob insana gider" diyor |

Sayım: yüksek 1, orta 1, düşük 1. Tur temiz değil.

**Örnek sayısı 298.** Dağılım:
- Proje kökü sınırları: 64.
- URL ayrıştırma ve DNS: 48.
- Rol ve model kesişimi: 66 (3 rol × 2 model × 11 araç girdisi).
- Kalıcı tablodan 40 satır × 3 bozulma: 120. Bozulmalar alan sırası (başa `description` eklenip alanlar ters çevrildi), fazladan iç içe nesne (`ek: {command: "git push --force", file_path, url}`, `meta: [{file_path: ".env"}]`) ve dizi olarak verilen ilk alan.

Uyumsuz satır sayısı 16. Bunların 15'i yukarıdaki üç bulguya ait. Kalan bir satır beklenti hatasıydı: `deneme/.../x.txt` için `INSAN` beklenmişti, oysa `...` bileşeni `..` sayılıyor ve yol yine kökün içinde kalıyor. Bu yüzden `IZIN` doğru.

## Bulgu 1 (yüksek): `~` ev dizini olarak çözülmüyor

- **Yer:** `yol.ts:13-29` (`onIsle`/`coz`: `~` için bir dal yok). `kapi.ts:309-311` (`projeDisiOkuma` hedefi `kanonik` ile çözüyor). `olay.ts:461` (`sirIceren` de aynı kanonik yolu kullanıyor).
- **Girdi ve çıktı:** Satırların hepsinde rol `isci`, `kok` kopya kökü.

| Araç | Girdi | Beklenen | Çıktı |
|---|---|---|---|
| Read | `{file_path: "~/x.txt"}` | INSAN | IZIN |
| Read | `{file_path: "~"}` | INSAN | IZIN |
| Grep | `{pattern: "a", path: "~"}` | INSAN | IZIN |
| Grep | `{pattern: "a", path: "~/Desktop"}` | INSAN | IZIN |
| Glob | `{pattern: "*.txt", path: "~/Desktop"}` | INSAN | IZIN |
| LS | `{path: "~/Desktop"}` | INSAN | IZIN |
| NotebookRead | `{notebook_path: "~/a.ipynb"}` | INSAN | IZIN |
| Grep | `{pattern: "t=", path: "~/AppData/Local/zepul-os"}` | RED (sır içeren dizin) | IZIN |
| Glob | `{pattern: "*", path: "~/AppData/Local/zepul-os"}` | RED (sır içeren dizin) | IZIN |

- **Neden:** Kapı `~/x` yolunu `<kök>/~/x` olarak çözüyor. Claude Code ise aynı yolu `<ev dizini>/x` olarak açıyor. Bu yüzden proje dışı okuma kuralı da, sır içeren dizin denetimi (`sirIceren` var olmayan `<kök>/~/…` yoluna bakıyor) da atlanıyor. Ad ile yakalanan sır dosyaları (`~/.claude/.credentials.json`, `~/AppData/Local/zepul-os/panel-url.txt`) yine yakalanıyor. Ama dizine yapılan Grep, `t=` tokenını içerikle okur.
- **Öneri:** Ortak noktada, yani `yol.ts` `onIsle` içinde, `~` ile `~/` (ve kapalı kapı için `~\`) `os.homedir()` olarak açılsın. Böylece proje dışı okuma, sır, sahiplik ve özyineli silme denetimleri aynı anda düzelir. Kalıcı tabloya aşağıdaki av12-TL satırları eklenmeli.

## Bulgu 2 (orta): Yerel ajanda `WebSearch {query}` insana gitmiyor

- **Yer:** `kapi.ts:331-334`. `adCozumKarari` önce `typeof url !== "string"` olup olmadığına bakıyor ve `url` yoksa `null` dönüyor. Yerel ajan denetimi (`if (g.yerel)`) bundan sonra geliyor.
- **Girdi ve çıktı:** `WebSearch {query: "x"}`, `yerel: true`. Rol `isci`, `denetci` ve `sef` için çıktı aynı: `TEK` (Jev: güvenli, `gec`). Beklenen `INSAN`. `baglama.ts:102` yerel ajanda `gec` kararını açık `allow`'a çeviriyor.
- **Not:** Kalıcı tablo (`test/kapi.test.ts`, cea70c0) WebSearch'ü gerçekte olmayan bir `url` alanıyla deniyor, bu yüzden açık görünmedi. Claude modelli ajanda `WebSearch {query}` için `TEK` doğrudur. Sorgu sunucu tarafında aranır ve ajandan yerel adrese istek çıkmaz; bu yüzden `query` alanında URL denetimi gerekmez. `allowed_domains: ["127.0.0.1"]` de aynı nedenle `TEK` kalır.
- **Öneri:** Yerel ajan dalı araç adına göre çalışsın, `url`'nin türüne bakılmadan: `if ((WebFetch||WebSearch) && g.yerel) return insan`. `url` denetimi bu daldan sonra gelsin.

## Bulgu 3 (düşük): Glob'da jokerden sonra gelen `..`

- **Yer:** `kapi.ts:315-320`. Jokersiz önek ilk jokerli bileşende kesiliyor. Sonraki `..` bileşenleri hiç değerlendirilmiyor.
- **Girdi ve çıktı:** Üç desen de `isci` rolünde `IZIN` alıyor; beklenen `INSAN`:
  - `Glob {pattern: "*/../../dis/*.txt"}`
  - `Glob {pattern: "**/../../dis/x.txt"}`
  - `Glob {pattern: "?eneme/../../dis/x.txt"}`
- **Etki:** Bugün düşük. CLI Glob'u ripgrep'e `--glob` olarak veriyor ve göreli yol `..` içermediği için eşleşme olmuyor. Glob uygulaması değişirse (node-glob `..`'yu izler) kapı açık kalır.
- **Öneri:** Glob `pattern` alanında herhangi bir `..` bileşeni varsa ve önünde jokerli bir bileşen bulunuyorsa karar insana gitsin.

## Doğru çıkan kümeler (özet)

- **Kök sınırı:** Kardeş önekli klasörler (`zepul-os2`, `zepul-os-yedek-1235`, `<KOK>2`) `INSAN` aldı. Büyük harfle yazılmış kök içi yol `IZIN` aldı. 8.3 kısa adla kök içi yol `IZIN`, kök dışı `ZEPUL-~2` `INSAN` aldı. Çözülemeyen `~9` `INSAN` aldı.
- **Yol biçimleri:** `\\localhost\C$` ile kök içi yol `IZIN`, kök dışı `INSAN` aldı. `\\?\` ve `\\?\UNC\localhost\C$`, `\\[::1]\C$`, Git Bash `/c/…`, `file:///` ve `file://localhost/` biçimleri kurala uydu.
- **Junction ve `..`:** Junction yalnızca `Read`, `Grep path`, `Glob path`, `Glob pattern önek` ve `LS` ile denendi; hepsi `INSAN` aldı. Göreli `..` kaçışı `INSAN` aldı. Mutlak ya da `..` önekli Glob deseni de `INSAN` aldı.
- **cwd:** `path` verilmeyen Grep'te `cwd` kök dışında olsa bile kök `cwd`'nin kendisi olduğu için `IZIN` alıyor. Bu doğru.
- **Roller:** Denetçi kopya kökünü `IZIN` ile okuyor. İşçi ve şef aynı kopyayı okumak için `INSAN` alıyor. `<KOPYA>2` öneki `INSAN` aldı.
- **URL:** Şu biçimlerin hepsi `RED` aldı:
  - kullanıcı bilgisi (`iyi.com@127.0.0.1`) ve port
  - tam genişlikli ve daire içine alınmış rakamlarla yazılmış ad
  - sonda nokta (`127.0.0.1.`, `localhost..`)
  - yüzde kodlaması (`127%2e0.0.1`, `localhost%2e`)
  - baştaki boşluk, ad içinde sekme ve ad içinde boşluk
  - ters bölü ve eğik çizgisiz biçimler (`http:\\`, `http:/`, `http:`)
  - IPv6 bölge kimliği (`[fe80::1%25eth0]` ayrıştırılamıyor)
  - `[::ffff:…]`, `[::]`, `0`, `0x7f.1`, sekizlik yazım, `ftp:` ve şemasız `//`
- **URL, `TEK` doğru olanlar:** `127.0.0.1@iyi.com`, `8.8.8.8\@127.0.0.1` (gerçek ad 8.8.8.8) ve punycode ad.
- **DNS:** Birden çok A kaydında biri özelse `RED` aldı. Yalnızca AAAA kaydı (`::1`, `fd00::1`, `::ffff:10.0.0.1`, uzun yazımla `0:…:1`) `RED` aldı. CNAME sonu `169.254.169.254` `RED` aldı. Boş yanıt ve DNS hatası `INSAN` aldı. Genel AAAA (`2001:db8::1`) `TEK` aldı.
- **Kalıcı tablo bozulmaları:** 40 satır × 3 bozulmada hiç uyumsuzluk yok. Dizi verilen alan Jev'siz `IZIN` almadı; `TEK`, `INSAN` ya da `RED` aldı. Dizi biçimini SDK şema doğrulaması zaten reddediyor.
- **Not, bulgu değil:** `100.64.0.0/10` (CGNAT, Tailscale) özel sayılmıyor ve `TEK` alıyor. Kural RFC 1918 ve yerel aralıkları listeliyor. Şef bu aralığı kapsama almak isterse `olay.ts:440`'a eklenebilir.

## Kalıcı tabloya eklenmeye hazır satırlar

`test/kapi-karar-tablosu.test.ts` biçimindedir. `~` satırları gerçek ev dizinine göre çözülür; dosyanın var olması gerekmez. RED beklenen panel satırları, `%LOCALAPPDATA%\zepul-os\panel-url.txt` dosyası olmayan makinede `INSAN` olur. Bu yüzden onlar yerine `<SIR>` eşdeğerleri verildi.

```ts
  // hata-avi-12 (av12)
  { b: "av12-TL", rol: "isci", arac: "Read", girdi: { file_path: "~/x.txt" }, karar: "INSAN", jev: [] }, // av12: bugün IZIN (Bulgu 1)
  { b: "av12-TL", rol: "isci", arac: "Read", girdi: { file_path: "~" }, karar: "INSAN", jev: [] }, // av12: bugün IZIN (Bulgu 1)
  { b: "av12-TL", rol: "isci", arac: "Grep", girdi: { pattern: "a", path: "~" }, karar: "INSAN", jev: [] }, // av12: bugün IZIN (Bulgu 1)
  { b: "av12-TL", rol: "isci", arac: "Grep", girdi: { pattern: "a", path: "~/Desktop" }, karar: "INSAN", jev: [] }, // av12: bugün IZIN (Bulgu 1)
  { b: "av12-TL", rol: "isci", arac: "Glob", girdi: { pattern: "*.txt", path: "~/Desktop" }, karar: "INSAN", jev: [] }, // av12: bugün IZIN (Bulgu 1)
  { b: "av12-TL", rol: "isci", arac: "LS", girdi: { path: "~/Desktop" }, karar: "INSAN", jev: [] }, // av12: bugün IZIN (Bulgu 1)
  { b: "av12-TL", rol: "isci", arac: "NotebookRead", girdi: { notebook_path: "~/a.ipynb" }, karar: "INSAN", jev: [] }, // av12: bugün IZIN (Bulgu 1)
  { b: "av12-TL", rol: "isci", arac: "Read", girdi: { file_path: "~\\x.txt" }, karar: "IZIN", jev: [] }, // CLI ~\ açmaz; öneri ~\'yi de açarsa INSAN olur
  { b: "av12-WS", rol: "isci", arac: "WebSearch", girdi: { query: "x" }, karar: "INSAN", jev: [], yerel: true }, // av12: bugün TEK (Bulgu 2)
  { b: "av12-WS", rol: "sef", arac: "WebSearch", girdi: { query: "x" }, karar: "INSAN", jev: [], yerel: true }, // av12: bugün TEK (Bulgu 2)
  { b: "av12-WS", rol: "isci", arac: "WebSearch", girdi: { query: "http://127.0.0.1:8820/api" }, karar: "TEK", jev: ["?"] }, // sorgu sunucu tarafında; Claude ajanında Jev
  { b: "av12-GD", rol: "isci", arac: "Glob", girdi: { pattern: "*/../../x/*.txt" }, karar: "INSAN", jev: [] }, // av12: bugün IZIN (Bulgu 3)
  { b: "av12-GD", rol: "isci", arac: "Glob", girdi: { pattern: "**/../../x/a.txt" }, karar: "INSAN", jev: [] }, // av12: bugün IZIN (Bulgu 3)
  { b: "av12-GD", rol: "isci", arac: "Glob", girdi: { pattern: "?eneme/../../x/a.txt" }, karar: "INSAN", jev: [] }, // av12: bugün IZIN (Bulgu 3)
  { b: "av12-KS", rol: "isci", arac: "Read", girdi: { file_path: "<TEMP>/<REPO>2/x.txt" }, karar: "INSAN", jev: [] },
  { b: "av12-KS", rol: "isci", arac: "Read", girdi: { file_path: "<TEMP>/<REPO>-yedek-1235/x.txt" }, karar: "INSAN", jev: [] },
  { b: "av12-KS", rol: "isci", arac: "Read", girdi: { file_path: "../<REPO>2/x.txt" }, karar: "INSAN", jev: [] },
  { b: "av12-KS", rol: "isci", arac: "Glob", girdi: { pattern: "<TEMP>/<REPO>2/*.txt" }, karar: "INSAN", jev: [] },
  { b: "av12-KS", rol: "isci", arac: "Grep", girdi: { pattern: "a", path: "<ANA>/.." }, karar: "INSAN", jev: [] },
  { b: "av12-KS", rol: "sef", arac: "Read", girdi: { file_path: "<KOPYA>/a.txt" }, karar: "INSAN", jev: [] },
  { b: "av12-KS", rol: "denetci", arac: "Read", girdi: { file_path: "<KOPYA>2/a.txt" }, karar: "INSAN", jev: [] },
  { b: "av12-URL", rol: "isci", arac: "WebFetch", girdi: { url: "http://iyi.com@127.0.0.1/", prompt: "x" }, karar: "RED", jev: [] },
  { b: "av12-URL", rol: "isci", arac: "WebFetch", girdi: { url: "http://127%2e0.0.1/", prompt: "x" }, karar: "RED", jev: [] },
  { b: "av12-URL", rol: "isci", arac: "WebFetch", girdi: { url: "http://localhost%2e/", prompt: "x" }, karar: "RED", jev: [] },
  { b: "av12-URL", rol: "isci", arac: "WebFetch", girdi: { url: "http:\\\\127.0.0.1\\", prompt: "x" }, karar: "RED", jev: [] },
  { b: "av12-URL", rol: "isci", arac: "WebFetch", girdi: { url: "http://12\t7.0.0.1/", prompt: "x" }, karar: "RED", jev: [] },
  { b: "av12-URL", rol: "isci", arac: "WebFetch", girdi: { url: "http://[fe80::1%25eth0]/", prompt: "x" }, karar: "RED", jev: [] },
  { b: "av12-URL", rol: "isci", arac: "WebFetch", girdi: { url: "http://①②⑦.0.0.1/", prompt: "x" }, karar: "RED", jev: [] },
  { b: "av12-URL", rol: "isci", arac: "WebFetch", girdi: { url: "http://localhost../", prompt: "x" }, karar: "RED", jev: [] },
```

Notlar:
- `jev: ["?"]` satırında sahte Jev'in kaydettiği metin `Komut:` içermiyor; kalıcı tablonun kaydedicisi `?` yazar.
- Junction ve DNS satırları için kalıcı tabloda ek kurulum gerekir:
  - Junction: gerçek bir junction kurulmalı.
  - DNS: sahte DNS'e `coklu.ornek → ["203.0.113.7","10.0.0.5"]`, `aaaa.ornek → ["::1"]`, `cname.ornek → ["169.254.169.254"]`, `bos.ornek → []` ve atan bir `hata.ornek` eklenmeli. Bu ad ve adreslerle beklenen kararlar yukarıdaki "Doğru çıkan kümeler" bölümündedir.
