# Hata avı, 10. tur (K15): kapı karar tablosu

- **Kapsam:** HEAD `f46da0a`. İncelenen dosyalar: `sunucu/kapi.ts`, `sunucu/olay.ts`, `sunucu/yol.ts`, `sunucu/worktree.ts` (`mutasyonKopyasiAc`, `mutasyonKopyasiSil`), `sunucu/orkestra.ts` (`busSunucusu`) ve `sunucu/baglama.ts` (`mutasyonKopyasiIsle`). Ayrıca av9 düzeltmeleri incelendi (`git diff ea3e574..f46da0a -- sunucu/`): kısa yollar kaldırıldı, denetçiye iki araç eklendi, sır joker eşleyicisi ve normalleştirme geldi. Satır numaraları `f46da0a` içindir.
- **Kural:** `KURALLAR.md` F, güncel hâliyle. Kapsadığı konular:
  - Denetçi kopyayı yalnızca araçla açar ve siler; kabukta `rm` ve `git worktree` için kod izni yoktur.
  - `Grep` ve `Glob` bir sır dosyasını ya da sır desenini hedeflerse reddedilir.
  - Kesin yasak taramasından önce metin normalleştirilir.
- **Yöntem:**
  - Çalışma kopyası `%TEMP%\zepul-av10-kopya`'dır. `sunucu/`, `test/` ve `package.json` oraya kopyalandı.
  - `deneme/av10.mts` gerçek `kapiKarari`'yı sahte bir Jev'le çağırdı. Sahte Jev her parçaya "guvenli 0,95" döndü; yalnızca `hata` seçenekli satırlarda hata attı. Kendisine sorulan parçaları da kaydetti.
  - `deneme/av10-arac.mts` gerçek `mutasyonKopyasiAc` ve `mutasyonKopyasiSil`'i çağırdı. Git sahteydi: `deneme/sahte/yasam.ts` çağrıları yalnızca kaydetti ve hiçbir süreç başlatmadı. Bağlantı satırlarında kopyada gerçek junction ve symlink kuruldu; bunların hedefi de kopyadaki sahte bir dizindi.
  - Hiçbir kabuk komutu kapı girdisi olarak çalıştırılmadı.
  - 8.3 satırları için kopyada sahte içerikli sır dosyaları oluşturuldu: `deneme/sir/.env`, `.env.local`, `panel-url.txt`, `gizli.key`, `.credentials.json`, `zepul-ai-anahtar.txt`. Kısa adları: `ENV~1`, `ENV~1.LOC`, `PANEL-~1.TXT`, `CREDEN~1.JSO`, `ZEPUL-~1.TXT`.
  - Proje dışı sır dizini `%TEMP%\zepul-av10-sir`'dir (içinde `panel-url.txt`, kısa adı `ZE87A9~1`).
  - Bulgu 1 ve 2'nin gerçekten okuma yaptığı, ripgrep 14.1.1 ile yalnızca bu sahte dosyalar üzerinde `-l` (dosya adı) çıktısıyla doğrulandı.
  - Etiketler ve yer tutucular `test/kapi-karar-tablosu.test.ts` ile aynıdır: `PARCA:n`, `TEK`, `INSAN`, `RED`, `IZIN` (Jev'siz salt okuma izni). Ek etiket `GEC`: Jev hatası, auto moda bırakıldı.
  - Kalıcı tablonun 667 satırı kopyada yeşil: 667/667.
- **Beklenen sütunu:** Kuralın birden çok karara izin verdiği satırlarda daha sıkı karar da kabul edildi (ör. `TEK|INSAN`).
  - Normalleştirme satırlarında karşılaştırma kabuğun gerçek yorumuna göre yapıldı. Kabuğun aynı anlamda çalıştırdığı biçim, özgününden gevşek bir karar alamaz. Kabuğun başka bir şey çalıştırdığı biçim yalnızca not olarak kaydedildi.
  - Bozulma kümesinde sıra RED > INSAN > Jev (`TEK`/`PARCA`) > `IZIN`.

## Özet

| # | Önem | Yer | Başlık |
|---|---|---|---|
| 1 | yüksek | `olay.ts:126-128`, `olay.ts:427-434` | `Grep`'in `glob`'unda süslü parantez seçeneği (`{.env,a.txt}`, `*.{key,pem}`, `**/{panel-url.txt,x}`) sır deseni sayılmıyor. Liste biçimi (`a.md,.env`, `*.md .env`) de sayılmıyor. Sır içeriği Jev'siz `IZIN` ile okunuyor |
| 2 | orta | `olay.ts:350-353`, `olay.ts:426` | `sirIceren` dizini ham yolla okuyor. Sonda nokta olan biçim (`<sır dizini>.`) `readdirSync`'te çözülmüyor, ripgrep'te çözülüyor. `Grep` proje dışı sır dizinini Jev'siz `IZIN` ile okuyor |
| 3 | düşük | `olay.ts:126-128`, `olay.ts:427-434` | Bulgu 1'in `Glob` eşi: `**/{.env,x}` sır deseni sayılmıyor. Jev'siz `IZIN` veriliyor ama yalnızca dosya adı listeleniyor |
| 4 | düşük | `worktree.ts:107`, `orkestra.ts:324-326` | Kopya adı deseni Windows ayrılmış adlarını (`nul`, `con`, `aux`, `prn`, `com1`, `lpt1`) geçiriyor. `mutasyonKopyasiAc` bu yola `git worktree add` çağırıyor. `adTemizle` aynı adlara `-w` ekliyor (W12) |

Sayım: yüksek 1, orta 1, düşük 2. Tur temiz değil.

**Örnek sayısı 581.** Dağılım:
- Kapı kümelerinde 199 satır.
- Kalıcı tablodan seçilen 40 satırın 7 bozulmayla 280 biçimi.
- Araç doğrulamasında 102 çağrı.

Kalıcı tablonun 667 satırı ayrıca yeşil çalıştı; bunlar sayıma katılmadı.

Kapı kümelerinde beklenenle uyuşmayan 12 satır var:
- 10'u bulgudur: Bulgu 1'de 8, Bulgu 2'de 1, Bulgu 3'te 1 satır.
- 2'si bulgu değildir: Git Bash biçimli (`/c/...`) `path` satırlarıdır, bkz. Not 4.

Bozulma kümesinde gevşeyen 24 biçim var. Bunların hiçbiri kabuğun aynı anlamda çalıştırdığı bir biçim değil, bkz. Not 5.

**Doğrudan izin alan bulgu satırları:**
- Bulgu 1: 8 `Grep` satırı.
- Bulgu 2: 1 `Grep` satırı.
- Bulgu 3: 1 `Glob` satırı.

Kabukta kopya silmesi ya da `worktree` için Jev'siz izin alan satır **yok**.

## Karar tablosu özeti

| Küme | Başlık | Örnek | Uyuşan | Not |
|---|---|---|---|---|
| 1 | Denetçi araçları, fonksiyon düzeyi (`av10-arac.mts`) | 102 | 102 | Ayrılmış ad Bulgu 4'te (beklenen `HATA\|ACILDI` açık bırakılmıştı) |
| 1 | Denetçi araçları, kapı düzeyi (AR) | 6 | 6 | `mcp__bus__*` her rolde `IZIN`; görünürlük sunucuda |
| 2 | Kısa yollar kalktı (KY) | 48 | 48 | 33 `TEK`, 10 `INSAN`, 3 `RED`, 1 `PARCA:2`, 1 `GEC` (Jev hatası); `IZIN` yok |
| 3 | PowerShell boşluk benzerleri (NZ) | 18 | 18 | U+1680, U+3000, U+00A0, U+2007, U+202F, U+205F, U+2028/9, VT, FF |
| 3 | Tam genişlik ayırıcılar (NF) | 9 | 9 | `；` `｜` `＆` bölünmüyor, normal biçimde yasak yakalanıyor |
| 3 | Normalleşince yasak (NY) | 13 | 13 | `ｇｉｔ ｐｕｓｈ`, `－－force`, `．env`, `＂.env＂`, `﹣﹣force` |
| 3 | Birleştirici işaretler (NB) | 8 | 8 | Bkz. Not 2 |
| 3 | Sağdan sola ve biçim karakterleri (NR) | 8 | 8 | Bkz. Not 3 |
| 4 | Sır joker eşleyicisi (SJ) | 72 | 60 | 10 bulgu ve 2 Git Bash yolu (Not 4) |
| 4 | Read'te 8.3 kısa ad (SK) | 17 | 17 | `ENV~1`, `ENV~1.LOC`, `PANEL-~1.TXT`, `CREDEN~1.JSO`, `ZEPUL-~1.TXT`, `::$DATA`, sondaki nokta, çözülemeyen `ENV~9` |
| 5 | Kalıcı tablodan 40 satır × 7 bozulma | 280 | 280 | Gevşeyen 24 biçimin hiçbiri anlamı koruyan biçim değil |

### Küme 1: denetçi araçları

**Ad deseni.** `KOPYA_ADI` (`worktree.ts:107`) ile zod deseni (`orkestra.ts:324-326`) aynıdır. Aşağıdaki girdilerin hepsi hem `ac` hem `sil`'de `geçersiz kopya adı` hatasıyla reddedildi ve git hiç çağrılmadı:
- Büyük harf: `M1`.
- Yol biçimleri: `m1/../x`, `..`, `.`, boş ad, `m1\x`, `m1/x`.
- Seçenek biçimi: `-x`, `--force`.
- 33 karakterlik ad.
- Unicode: `ı1`, `mı`, tam genişlik `ｍ1`, birleştirici işaretli `m1` + U+0301.
- Satır sonu ve boşluk: `m1` + LF, `m1 `, ` m1`.
- Yön işaretleri: U+200F, U+202E.
- Diğer biçimler: `m1:x`, `m1.`, `m1~1`, `C:`, `c:x`, `m1;rm`, `m1*`, `%TEMP%`, `$HOME`.

Şu adlar kabul edildi: 32 karakterlik ad, `m-`, `0`.

**ref doğrulaması:**
- Tireyle başlayan değerler (`-b`, `--orphan`, `-`, `--detach`, `-c core.hooksPath=x`) ve boş değer `geçersiz ref` hatası aldı; git çağrılmadı.
- `@{-1}`, `HEAD~`, `HEAD~1`, ` HEAD`, `HEAD `, `HEAD --force`, `–detach` (en tire), `HEAD^{tree}`, `is/isci1:dosya`, `@{u}`, `HEAD@{1}`, `refs/stash` ve NUL'lu değer de denendi. Hepsi `rev-parse --verify --quiet <ref>^{commit}` çağrısına tek argüman olarak gitti. `worktree add --detach <kök>/<ad>` yalnızca çözülmüş sha'yı aldı; ref hiçbir zaman `worktree add`'e ulaşmadı.
- Çözülemeyen ref `ref çözülemedi` hatası verdi.

**Var olan yol:**
- Var olan klasöre, junction'a ve kırık junction'a `ac` çağrısı `kopya zaten var` hatası verdi.

**`mutasyon_kopyasi_sil`:**
- Var olmayan kopya `yok` döndü; araç bunu hata olarak bildiriyor.
- Kopya junction ya da dizin symlink'iyse yalnızca bağ silindi. Hedefteki `koru.txt` yerinde kaldı.
- Kırık junction'da da yalnızca bağ silindi.
- Worktree listesinde olmayan sıradan klasör `yok` döndü ve klasöre dokunulmadı.
- Listede olan, dalsız ve içinde junction bulunan kopyada önce iç bağ söküldü, hedef korundu. Ardından tek `worktree remove --force <kök>/m2` çağrıldı.
- Dallı kopya ve kopya kökü altında kalan ana ağaç `kirli` döndü; `remove` çağrılmadı.
- Kök ve üst dizin adla ifade edilemiyor: `..`, `.` ve boş ad desende reddediliyor.

**Görünürlük (`orkestra.ts:280-360`, kaynak okuması):**
- `mutasyon_kopyasi_ac` ve `mutasyon_kopyasi_sil` yalnızca `a.rol === "denetci"` dalındaki `createSdkMcpServer`'da tanımlı.
- Şef dalında `ajan_baslat`, `mesaj_gonder`, `ajanlar`, `ayar_yaz`, `zepul_ai_sor` ve `skill_onayla` var.
- Diğer rollerin dalında `mesaj_gonder` ve `sozlesme_don` var.
- Kapı `mcp__bus__*` adına her rolde `IZIN` veriyor (`kapi.ts:384`). Ancak işçi ve şef oturumunda bu adla bir araç yok.
- Araç yalnızca kodun koyduğu `a.denetim.kopya_koku` ve işçinin `repo`/`dal` değerleriyle çalışıyor; denetçi kökü ya da repoyu seçemiyor.
- `mutasyonKopyasiIsle` (`baglama.ts:815-822`) ince bir sarmalayıcı: `ref ?? dal`, `kirli` ve `yok` için `hata: true`, istisna için `ozetle`.

### Küme 2: kısa yollar

Denetçi rolünde kopya içi silmenin bütün eski K26 biçimleri denendi:
- Mutlak, tırnaklı ya da tırnaksız yol; ters bölü; büyük harf, küçük harf ve Git Bash yazımı.
- İki hedef; `/usr/bin/rm`, `rm.exe`; boru, `;`, `&&`.
- PowerShell biçimleri: `Remove-Item`, `ri`, `rd`, `-LiteralPath`.
- `cmd /c rd /s /q`.

Bunların hepsi `TEK` aldı, yani Jev'e tek soru olarak gitti; `rm` artık izin listesinde olmadığı için bölünmüyor.

Diğer biçimlerin sonuçları:
- Kökün kendisi, `..` ve ana repoya giden ikinci hedef `INSAN` aldı.
- Değişkenli hedef (`$M`, `$KOPYA`, `$env:TEMP`) `RED` aldı.
- `git worktree add`, `remove`, `remove --force` ve `prune` `TEK` aldı.
- İki `worktree add` içeren zincir `PARCA:2` aldı: iki parça da Jev'e soruldu.
- İşçi ve şef rolünde aynı silme `INSAN` aldı.
- Jev hatasında:
  - Yerel ajanda iki biçim de `INSAN` aldı.
  - Claude ajanında `rm -rf` ve `Remove-Item` `INSAN` aldı (riskli sezgisi).
  - `worktree add` `GEC` aldı (KURALLAR F: auto moda bırakılır; bu bir kod izni değildir).

## Bulgu 1 (yüksek): `Grep` `glob`'unda süslü parantez ve liste biçimi sır deseni sayılmıyor

**Yer:**
- `olay.ts:126-128`: `sirDeseniMi` yalnızca `* ? [` karakterlerine bakıyor ve `{` için hemen `false` döndürüyor.
- `olay.ts:427-434`: `glob` alanı tek bir ad olarak `sirYolMu` ve `sirDeseniMi`'ye veriliyor.

**Girdi ve çıktı:** Rol `sef` (aynısı işçi ve denetçide de geçerli). Hepsi `IZIN` (salt okuma) aldı; beklenen `RED`.

| Girdi | Bugün | Beklenen |
|---|---|---|
| `Grep {pattern:"=", glob:"{.env,a.txt}"}` | IZIN | RED |
| `Grep {pattern:"=", glob:".{env,x}"}` | IZIN | RED |
| `Grep {pattern:"=", glob:"**/{.env,x}"}` | IZIN | RED |
| `Grep {pattern:"=", glob:"*.{key,pem}"}` | IZIN | RED |
| `Grep {pattern:"=", glob:"{*.key}"}` | IZIN | RED |
| `Grep {pattern:"t=", path:"<TEMP>", glob:"**/{panel-url.txt,x}"}` | IZIN | RED |
| `Grep {pattern:"=", glob:"a.md,.env"}` | IZIN | RED |
| `Grep {pattern:"=", glob:"*.md .env"}` | IZIN | RED |

Karşılaştırma için kontrol satırları `RED` aldı: `**/.env`, `[.]env`, `?env`, `.e*v`, `*.KEY`, `**/panel-url.txt` (aynı `<TEMP>` yoluyla), `*.ke[y]`, `\.env`.

**Dayanak:**
- ripgrep glob'u süslü parantez seçeneğini destekliyor. Sahte dosyalarla doğrulandı:
  - `rg -l --glob "{.env,x}" sahte <kopya>/deneme/sir` sonucu `.env` oldu; `--hidden` olmadan da aynı sonuç alındı.
  - `rg -l --glob "*.{key,pem}"` sonucu `gizli.key` oldu.
  - `rg -l --glob "{panel-url.txt,x}" t= <TEMP>`, `%TEMP%` altındaki bütün `panel-url.txt` dosyalarını buldu. Bunlar önceki kabul koşularının panel adres dosyalarıdır.
- `sirIceren` yalnızca ilk seviyeye baktığı için üst dizinden `**/{…}` ile inmek dizin denetimini de atlatıyor. Panel dizininin bir üstü `%LOCALAPPDATA%`'dır.
- Liste biçimi (`a.md,.env`, `*.md .env`) Claude Code `Grep` aracının `glob` alanını boşluktan ve süslü parantez dışındaki virgülden bölüp her parçayı ayrı `--glob` olarak vermesine dayanır. Bu davranış araç tanımından bilinen ama bu turda araç kodunda doğrulanmamış bir varsayımdır. Süslü parantez biçimi ise varsayımsızdır.

**Öneri:** Doğrulama tek noktada, `kesinYasakMi` içinde `glob` ve `pattern` alanları için yapılmalı:
1. Metin boşluktan ve süslü parantez dışındaki virgülden parçalara bölünür.
2. Her parçada süslü parantez seçenekleri açılır. Bir düzey yeterli; iç içe ya da açılamayan `{` görülürse güvenli yan seçilip red verilir.
3. Her parça `sirYolMu` ve `sirDeseniMi`'den geçirilir.

Daha tembel bir seçenek de var: `Grep` ve `Glob`'da `{` içeren her `glob`/`pattern`'i red ya da en az `INSAN` saymak. Bunun bedeli, `*.{ts,tsx}` gibi meşru kullanımların insana gitmesidir.

## Bulgu 2 (orta): `sirIceren` dizini ham yolla okuyor; sondaki nokta onu atlatıyor

**Yer:**
- `olay.ts:350-353`: `fs.readdirSync(path.resolve(kok, p))` çağrılıyor. Proje dışı denetimi `kanonik` ile yapılıyor, okuma ise ham yolla.
- `olay.ts:426`: denetimin çağrıldığı yer.

**Girdi ve çıktı:**
- `Grep {pattern:"=", path:"<SIR>."}`: bugün `IZIN`, beklenen `RED`.
- Kontrol satırları `RED` aldı: `<SIR>`, `<SIR>/`, `<SIR>/.`, `<SIR>/./`, `<SIR>/../zepul-av10-sir`, büyük harfli yazım ve 8.3 kısa ad (`<TEMP>/ZE87A9~1`).

**Dayanak:** Node `readdirSync("…\zepul-av10-sir.")` başarısız oluyor ve `catch` `false` döndürüyor. ripgrep ise Win32 yol normalleştirmesiyle sondaki noktayı atıyor: `rg -l t= "<SIR>."` sonucu `…\zepul-av10-sir.\panel-url.txt` oldu. Panel dizini için girdi `Grep {pattern:"t=", path:"%LOCALAPPDATA%/zepul-os."}` olur; bu girdi panel belirtecini Jev'siz okur. Sondaki boşluk da aynı sınıftadır.

**Öneri:** Okuma da kanonik yolla yapılmalı: `fs.readdirSync(k)`, burada `k = kanonik(p, kok)`. `yol.ts` sondaki nokta ve boşluğu, `::$DATA`'yı, 8.3 kısa adı ve Git Bash yazımını zaten çözüyor; böylece iki yol tek bir çözüme bağlanır.

## Bulgu 3 (düşük): `Glob` `pattern`'inde süslü parantez

**Yer:** Bulgu 1 ile aynı (`olay.ts:126-128`, `olay.ts:427-434`).

**Girdi ve çıktı:**
- `Glob {pattern:"**/{.env,x}"}`: bugün `IZIN`, beklenen `RED`.
- `**/.env`, `deneme/sir/.e?v`, `deneme/sir/[.]env` ve `**/*.KEY` `RED` aldı.

**Etki:** `Glob` yalnızca dosya adlarını listeliyor, içerik okumuyor. Bu yüzden önem düşük. KURALLAR F'ye aykırı olduğu için yine de bulgudur.

**Öneri:** Bulgu 1'in düzeltmesi bunu da kapatır.

## Bulgu 4 (düşük): kopya adı Windows ayrılmış adlarını geçiriyor

**Yer:** `worktree.ts:107` (`KOPYA_ADI`) ve `orkestra.ts:324-326` (zod deseni).

**Girdi ve çıktı:**
- `mutasyonKopyasiAc(repo, kök, "nul", "is/isci1")`: ad desenden geçti, `lstat` yolu yok saydı ve sahte git şu çağrıları aldı: `rev-parse --verify --quiet is/isci1^{commit}`, ardından `worktree add --detach <kök>/nul <sha>`.
- `con`, `aux`, `prn`, `com1` ve `lpt1` için de sonuç aynı.
- `mutasyonKopyasiSil` bu adlarda `yok` döndü ve hiçbir şeye dokunmadı.

**Etki:** Güvenlik etkisi yok: yol kopya kökünün içinde ve git ya hata verir ya da aygıt adına yazamaz. Kodda bir tutarsızlık var: `adTemizle` aynı adları W12 kararıyla `-w` ekleyerek düzeltiyor, burada ise denetim yok.

**Öneri:** `kopyaYolu`'na `/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/` reddi eklenmeli; zod deseni de aynı kalmalı. İstenirse `adTemizle`'deki ifade ortak bir sabite taşınabilir.

## Not: bulgu sayılmayanlar

1. **Bus aracına kapı izni:** Kapı `mcp__bus__*` için her rolde `IZIN` veriyor (AR satırları); bu tasarım gereğidir. Araç girdisini doğrulayan zod ve `KOPYA_ADI`'dır. Araçların işçi ve şefte bulunmaması `busSunucusu` dallarıyla sağlanıyor.
2. **Birleştirici işaretler:**
   - `ls; git push --force` + U+034F (CGJ) `PARCA:2` aldı: `ls` ve `git push --force͏` Jev'e soruldu. Git `--force` + CGJ biçimini bilinmeyen seçenek olarak reddeder; kabuk anlamı özgünle aynı değildir, karar da Jev'siz değildir.
   - `rḿ`, `git́` gibi komut adları başka bir komuttur.
   - `lś; pwd` izin listesinde olmadığı için bölünmedi (`TEK`).
3. **Sağdan sola ve biçim karakterleri:**
   - `git push --force` + U+200F ve U+200F + `git …` `TEK` aldı. Git bilinmeyen seçenek hatası verir; kabukta da komut adı bulunamaz.
   - `rm -rf` + U+202E + `C:/x`, Bash'te göreli bir yoldur (proje içi).
   - Kapı mantıksal sırayı görüyor; kabuk da aynı sırayı çalıştırıyor. Görsel yanıltma yalnızca paneldeki insan için geçerli; bu da `INSAN` yolunun konusu.
4. **Git Bash yazımlı `Grep`/`Glob` `path` değeri** (`/c/Users/…`): kapı `IZIN` veriyor, çünkü `sirIceren`'in `readdirSync` çağrısı bu yolu çözemiyor. ripgrep de bu yolu okuyamıyor ("Sistem belirtilen yolu bulamıyor"), bu yüzden bugün bir okuma yolu değil. Bulgu 2'nin önerisi bunu da kapatır.
5. **Bozulmada gevşeyen 24 biçim:** 11'i `BIR-ilk`, 11'i `CRLF-ic`, 2'si `BIR-son`. Hepsi kabuğun başka bir şey çalıştırdığı biçimlerdir:
   - `rḿ`, `Remove-Iteḿ`, `git́` farklı komut adlarıdır.
   - İlk boşluğa CRLF konunca komut adı ayrı bir satırda kalıyor: `rm` ve `Remove-Item` hedefsiz çalışıyor, `-rf …` satırı ise komut değil.
   - `--forcé` git'te bilinmeyen seçenektir.
   - Anlamı koruyan biçimlerin hiçbiri gevşemedi: PowerShell'de U+3000 boşluğu, baştaki CRLF ve PowerShell'de sondaki CRLF.
6. **Proje içi dizinde `Grep`** (`path:"deneme/sir"`): `IZIN` alıyor. `sirIceren` yalnızca proje dışı ve ilk seviyeye bakıyor; bu kodda `ponytail:` ile işaretli bilinen bir tavandır.
7. **Her şeye uyan desenler:** `*`, `*.txt` ve `deneme/sir/*` `IZIN` alıyor. Bu, `sirDeseniMi`'nin tasarımıdır (`SIRADAN` listesi).

## Araç doğrulaması için hazır kontroller (`test/worktree.test.ts` adayı)

Gerçek git gerekmez; `yasam.ts` sahtelenir ya da yalnızca hata yolları sınanır:

- `mutasyonKopyasiAc(r, k, ad, "x")` şu adların hepsinde `geçersiz kopya adı` hatası vermeli: `"M1"`, `".."`, `"."`, `""`, `"-x"`, `"m1/../x"`, `"m1\\x"`, `"ｍ1"`, `"m1\n"`, `"a".repeat(33)`. Bulgu 4 düzeltilince listeye `"nul"`, `"con"` ve `"com1"` de eklenmeli.
- `mutasyonKopyasiAc(r, k, "m1", ref)` şu ref'lerin hepsinde `geçersiz ref` hatası vermeli: `"-b"`, `"--orphan"`, `"-"`, `""`.
- Kopya kökünde `j1` → hedef junction'ı için `mutasyonKopyasiSil(r, k, "j1")` sonucu `{durum: "baglanti-silindi"}` olmalı. Hedef dizindeki dosya yerinde kalmalı.
- `mutasyonKopyasiSil(r, k, "olmayan")` sonucu `{durum: "yok"}` olmalı.

## Kalıcı tabloya eklenmeye hazır satırlar

Biçim `test/kapi-karar-tablosu.test.ts` `TABLO` ile aynıdır ve satırlar dosyanın sonuna eklenir.

186 satır kopyada `deneme/tablo-av10.test.ts` ile (kalıcı tablo + bu satırlar, toplam 853) denendi:
- 176'sı bugün yeşil.
- `// av10: bugün IZIN` işaretli 10 satır Bulgu 1, 2 ve 3'ün düzeltme sonrası beklentisidir; bugün kırmızı.

Tabloya alınmayanlar:
- Proje içi sahte dosya isteyen 8.3 satırları (SK).
- `%TEMP%\zepul-av10-sir`'e bağlı satırlar.
- Jev hatası ve yerel ajan satırları; tablo düzeneği bunları desteklemiyor.

`av10-BZ` satırları, kalıcı tablodaki satırların anlamı koruyan bozulmalarıdır.

```ts
  { b: "av10-AR", rol: "denetci", arac: "mcp__bus__mutasyon_kopyasi_ac", girdi: { ad: "m1" }, karar: "IZIN", jev: [] },
  { b: "av10-AR", rol: "denetci", arac: "mcp__bus__mutasyon_kopyasi_ac", girdi: { ad: "../..", ref: "--orphan" }, karar: "IZIN", jev: [] },
  { b: "av10-AR", rol: "denetci", arac: "mcp__bus__mutasyon_kopyasi_sil", girdi: { ad: "m1" }, karar: "IZIN", jev: [] },
  { b: "av10-AR", rol: "isci", arac: "mcp__bus__mutasyon_kopyasi_sil", girdi: { ad: "m1" }, karar: "IZIN", jev: [] },
  { b: "av10-AR", rol: "sef", arac: "mcp__bus__mutasyon_kopyasi_ac", girdi: { ad: "m1" }, karar: "IZIN", jev: [] },
  { b: "av10-AR", rol: "denetci", arac: "mcp__bus__mutasyon_kopyasi_sil", girdi: { ad: "m1", file_path: ".env" }, karar: "INSAN", jev: [] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/m1\"", karar: "TEK", jev: ["rm -rf \"<KOPYA>/m1\""] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "rm -rf <KOPYA>/m1", karar: "TEK", jev: ["rm -rf <KOPYA>/m1"] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "rm -r -f '<KOPYA>/m1'", karar: "TEK", jev: ["rm -r -f '<KOPYA>/m1'"] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "rm -fr \"<KOPYA>/m1/\"", karar: "TEK", jev: ["rm -fr \"<KOPYA>/m1/\""] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA\\>\\m1\"", karar: "TEK", jev: ["rm -rf \"<KOPYA\\>\\m1\""] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA_UP>/m1\"", karar: "TEK", jev: ["rm -rf \"<KOPYA_UP>/m1\""] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA_LO>/m1\"", karar: "TEK", jev: ["rm -rf \"<KOPYA_LO>/m1\""] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA_GB>/m1\"", karar: "TEK", jev: ["rm -rf \"<KOPYA_GB>/m1\""] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/m1\" \"<KOPYA>/m2\"", karar: "TEK", jev: ["rm -rf \"<KOPYA>/m1\" \"<KOPYA>/m2\""] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/m1/node_modules\"", karar: "TEK", jev: ["rm -rf \"<KOPYA>/m1/node_modules\""] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "rm --recursive --force \"<KOPYA>/m1\"", karar: "TEK", jev: ["rm --recursive --force \"<KOPYA>/m1\""] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "/usr/bin/rm -rf \"<KOPYA>/m1\"", karar: "TEK", jev: ["/usr/bin/rm -rf \"<KOPYA>/m1\""] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "rm.exe -rf \"<KOPYA>/m1\"", karar: "TEK", jev: ["rm.exe -rf \"<KOPYA>/m1\""] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/m1\" | tail -1", karar: "TEK", jev: ["rm -rf \"<KOPYA>/m1\" | tail -1"] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/m1\"; ls", karar: "TEK", jev: ["rm -rf \"<KOPYA>/m1\"; ls"] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/m1\" && git status", karar: "TEK", jev: ["rm -rf \"<KOPYA>/m1\" && git status"] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "ls && rm -rf \"<KOPYA>/m1\"", karar: "TEK", jev: ["ls && rm -rf \"<KOPYA>/m1\""] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>\"", karar: "INSAN", jev: [] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/..\"", karar: "INSAN", jev: [] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/m1/../..\"", karar: "INSAN", jev: [] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/m1\" \"<ANA>\"", karar: "INSAN", jev: [] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/$M\"", karar: "RED", jev: [] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "rm -rf \"$KOPYA/m1\"", karar: "RED", jev: [] },
  { b: "av10-KY", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/m1'", karar: "TEK", jev: ["Remove-Item -Recurse -Force '<KOPYA>/m1'"] },
  { b: "av10-KY", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -LiteralPath '<KOPYA>/m1' -Recurse -Force", karar: "TEK", jev: ["Remove-Item -LiteralPath '<KOPYA>/m1' -Recurse -Force"] },
  { b: "av10-KY", rol: "denetci", arac: "PowerShell", girdi: "ri -r -fo '<KOPYA>/m1'", karar: "TEK", jev: ["ri -r -fo '<KOPYA>/m1'"] },
  { b: "av10-KY", rol: "denetci", arac: "PowerShell", girdi: "rd -Recurse '<KOPYA>/m1'", karar: "TEK", jev: ["rd -Recurse '<KOPYA>/m1'"] },
  { b: "av10-KY", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/m1'; ls", karar: "TEK", jev: ["Remove-Item -Recurse -Force '<KOPYA>/m1'; ls"] },
  { b: "av10-KY", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force \"$env:TEMP/zepul-ayar/m1\"", karar: "RED", jev: [] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "cmd /c rd /s /q \"<KOPYA\\>\\m1\"", karar: "TEK", jev: ["cmd /c rd /s /q \"<KOPYA\\>\\m1\""] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "cmd /c \"rd /s /q <KOPYA\\>\\m1\"", karar: "TEK", jev: ["cmd /c \"rd /s /q <KOPYA\\>\\m1\""] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "git worktree add --detach \"<KOPYA>/m9\" HEAD", karar: "TEK", jev: ["git worktree add --detach \"<KOPYA>/m9\" HEAD"] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "git -C \"<WT>\" worktree add --detach \"<KOPYA>/m9\" is/isci1", karar: "TEK", jev: ["git -C \"<WT>\" worktree add --detach \"<KOPYA>/m9\" is/isci1"] },
  { b: "av10-KY", rol: "denetci", arac: "PowerShell", girdi: "git -C '<WT>' worktree add --detach '<KOPYA>/m9' HEAD", karar: "TEK", jev: ["git -C '<WT>' worktree add --detach '<KOPYA>/m9' HEAD"] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "git worktree remove \"<KOPYA>/m1\"", karar: "TEK", jev: ["git worktree remove \"<KOPYA>/m1\""] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "git worktree remove --force \"<KOPYA>/m1\"", karar: "TEK", jev: ["git worktree remove --force \"<KOPYA>/m1\""] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "git -C \"<WT>\" worktree remove -f -f \"<KOPYA>/m1\"", karar: "TEK", jev: ["git -C \"<WT>\" worktree remove -f -f \"<KOPYA>/m1\""] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "git worktree prune", karar: "TEK", jev: ["git worktree prune"] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/m9\" HEAD && rm -rf \"<KOPYA>/m9\"", karar: "TEK", jev: ["git worktree add \"<KOPYA>/m9\" HEAD && rm -rf \"<KOPYA>/m9\""] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "git worktree add --detach \"<KOPYA>/m8\" HEAD; git worktree add --detach \"<KOPYA>/m9\" HEAD", karar: "PARCA:2", jev: ["git worktree add --detach \"<KOPYA>/m8\" HEAD","git worktree add --detach \"<KOPYA>/m9\" HEAD"] },
  { b: "av10-KY", rol: "isci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/m1\"", karar: "INSAN", jev: [] },
  { b: "av10-KY", rol: "sef", arac: "Bash", girdi: "rm -rf \"<KOPYA>/m1\"", karar: "INSAN", jev: [] },
  { b: "av10-KY", rol: "isci", arac: "Bash", girdi: "git worktree add --detach \"<KOPYA>/m9\" HEAD", karar: "TEK", jev: ["git worktree add --detach \"<KOPYA>/m9\" HEAD"] },
  { b: "av10-NZ", rol: "isci", arac: "PowerShell", girdi: "git push\u3000--force", karar: "RED", jev: [] },
  { b: "av10-NZ", rol: "isci", arac: "PowerShell", girdi: "git push\u00a0--force", karar: "RED", jev: [] },
  { b: "av10-NZ", rol: "isci", arac: "PowerShell", girdi: "git push\u2007--force", karar: "RED", jev: [] },
  { b: "av10-NZ", rol: "isci", arac: "PowerShell", girdi: "git push\u205f--force", karar: "RED", jev: [] },
  { b: "av10-NZ", rol: "isci", arac: "PowerShell", girdi: "git push\u202f--force", karar: "RED", jev: [] },
  { b: "av10-NZ", rol: "isci", arac: "PowerShell", girdi: "git push\u1680--force", karar: "RED", jev: [] },
  { b: "av10-NZ", rol: "isci", arac: "PowerShell", girdi: "git\u1680push\u1680-f", karar: "RED", jev: [] },
  { b: "av10-NZ", rol: "isci", arac: "PowerShell", girdi: "git push\u2028--force", karar: "RED", jev: [] },
  { b: "av10-NZ", rol: "isci", arac: "PowerShell", girdi: "git push\u2029--force", karar: "RED", jev: [] },
  { b: "av10-NZ", rol: "isci", arac: "PowerShell", girdi: "git push\u000b--force", karar: "RED", jev: [] },
  { b: "av10-NZ", rol: "isci", arac: "PowerShell", girdi: "git push\f--force", karar: "RED", jev: [] },
  { b: "av10-NZ", rol: "isci", arac: "PowerShell", girdi: "git reset\u1680--hard", karar: "INSAN", jev: [] },
  { b: "av10-NZ", rol: "isci", arac: "PowerShell", girdi: "Remove-Item\u1680-Recurse\u1680-Force\u1680C:/x", karar: "INSAN", jev: [] },
  { b: "av10-NZ", rol: "isci", arac: "PowerShell", girdi: "Get-Content\u1680.env", karar: "INSAN", jev: [] },
  { b: "av10-NZ", rol: "isci", arac: "PowerShell", girdi: "Get-Content\u3000.env", karar: "INSAN", jev: [] },
  { b: "av10-NZ", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/a'\u1680'<ANA>'", karar: "INSAN", jev: [] },
  { b: "av10-NZ", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/a'\u3000'<ANA>'", karar: "INSAN", jev: [] },
  { b: "av10-NZ", rol: "isci", arac: "PowerShell", girdi: "git push\ufeff--force", karar: "RED", jev: [] },
  { b: "av10-NF", rol: "isci", arac: "Bash", girdi: "ls\uff1bgit push --force", karar: "RED", jev: [] },
  { b: "av10-NF", rol: "isci", arac: "Bash", girdi: "ls\uff5cgit push --force", karar: "RED", jev: [] },
  { b: "av10-NF", rol: "isci", arac: "Bash", girdi: "ls\uff06\uff06git push --force", karar: "RED", jev: [] },
  { b: "av10-NF", rol: "isci", arac: "Bash", girdi: "ls \uff06 git push --force", karar: "RED", jev: [] },
  { b: "av10-NF", rol: "isci", arac: "PowerShell", girdi: "ls\uff1bgit push --force", karar: "RED", jev: [] },
  { b: "av10-NF", rol: "isci", arac: "PowerShell", girdi: "ls\uff1bRemove-Item -Recurse C:/x", karar: "INSAN", jev: [] },
  { b: "av10-NF", rol: "isci", arac: "Bash", girdi: "echo a\uff1brm -rf C:/x", karar: "INSAN", jev: [] },
  { b: "av10-NF", rol: "isci", arac: "Bash", girdi: "ls\uff1bpwd", karar: "TEK", jev: ["ls\uff1bpwd"] },
  { b: "av10-NF", rol: "isci", arac: "Bash", girdi: "echo \uff41\uff1b\uff42", karar: "TEK", jev: ["echo \uff41\uff1b\uff42"] },
  { b: "av10-NY", rol: "isci", arac: "Bash", girdi: "\uff47\uff49\uff54 \uff50\uff55\uff53\uff48 --force", karar: "RED", jev: [] },
  { b: "av10-NY", rol: "isci", arac: "Bash", girdi: "git push \uff0d\uff0dforce", karar: "RED", jev: [] },
  { b: "av10-NY", rol: "isci", arac: "Bash", girdi: "git push \u2010\u2010force", karar: "RED", jev: [] },
  { b: "av10-NY", rol: "isci", arac: "Bash", girdi: "git push \u2212f", karar: "RED", jev: [] },
  { b: "av10-NY", rol: "isci", arac: "Bash", girdi: "cat \uff0eenv", karar: "INSAN", jev: [] },
  { b: "av10-NY", rol: "isci", arac: "Bash", girdi: "cat .\uff45\uff4e\uff56", karar: "INSAN", jev: [] },
  { b: "av10-NY", rol: "isci", arac: "Bash", girdi: "\uff52\uff4d -rf C:/x", karar: "INSAN", jev: [] },
  { b: "av10-NY", rol: "isci", arac: "Bash", girdi: "git reset --\uff48\uff41\uff52\uff44", karar: "INSAN", jev: [] },
  { b: "av10-NY", rol: "isci", arac: "PowerShell", girdi: "Get-Content \uff02.env\uff02", karar: "INSAN", jev: [] },
  { b: "av10-NY", rol: "isci", arac: "PowerShell", girdi: "Get-Content \uff07.env\uff07", karar: "INSAN", jev: [] },
  { b: "av10-NY", rol: "isci", arac: "Bash", girdi: "cat panel\uff0durl.txt", karar: "INSAN", jev: [] },
  { b: "av10-NY", rol: "isci", arac: "Bash", girdi: "cat \ufe52env", karar: "INSAN", jev: [] },
  { b: "av10-NY", rol: "isci", arac: "Bash", girdi: "git push \ufe63\ufe63force", karar: "RED", jev: [] },
  { b: "av10-NB", rol: "isci", arac: "Bash", girdi: "git push --force \u0301", karar: "RED", jev: [] },
  { b: "av10-NB", rol: "isci", arac: "Bash", girdi: "git push --force\u0301", karar: "TEK", jev: ["git push --force\u0301"] },
  { b: "av10-NB", rol: "isci", arac: "Bash", girdi: "rm -rf C:/x\u0301", karar: "INSAN", jev: [] },
  { b: "av10-NB", rol: "isci", arac: "Bash", girdi: "cat .env\u0301", karar: "TEK", jev: ["cat .env\u0301"] },
  { b: "av10-NB", rol: "isci", arac: "Bash", girdi: "git push --\u0338force", karar: "TEK", jev: ["git push --\u0338force"] },
  { b: "av10-NB", rol: "isci", arac: "Bash", girdi: "ls; git push --force\u034f", karar: "PARCA:2", jev: ["ls","git push --force\u034f"] },
  { b: "av10-NB", rol: "isci", arac: "Bash", girdi: "ls\u0301; pwd", karar: "TEK", jev: ["ls\u0301; pwd"] },
  { b: "av10-NB", rol: "isci", arac: "PowerShell", girdi: "git push -\u0300-force", karar: "RED", jev: [] },
  { b: "av10-NR", rol: "isci", arac: "Bash", girdi: "git push \u202e--force", karar: "TEK", jev: ["git push \u202e--force"] },
  { b: "av10-NR", rol: "isci", arac: "Bash", girdi: "git push --force\u200f", karar: "TEK", jev: ["git push --force\u200f"] },
  { b: "av10-NR", rol: "isci", arac: "Bash", girdi: "\u200fgit push --force", karar: "TEK", jev: ["\u200fgit push --force"] },
  { b: "av10-NR", rol: "isci", arac: "Bash", girdi: "rm -rf C:/x\u200e", karar: "INSAN", jev: [] },
  { b: "av10-NR", rol: "isci", arac: "Bash", girdi: "rm -rf \u202eC:/x", karar: "TEK", jev: ["rm -rf \u202eC:/x"] },
  { b: "av10-NR", rol: "isci", arac: "Bash", girdi: "echo \u202eecrof-- hsup tig", karar: "TEK", jev: ["echo \u202eecrof-- hsup tig"] },
  { b: "av10-NR", rol: "isci", arac: "Bash", girdi: "ls \u2066a\u2069; pwd", karar: "TEK", jev: ["ls \u2066a\u2069; pwd"] },
  { b: "av10-NR", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/m1\u202e/../../..\"", karar: "INSAN", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", glob: "**/.env" }, karar: "RED", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", glob: "[.]env" }, karar: "RED", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", glob: "?env" }, karar: "RED", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", glob: ".e*v" }, karar: "RED", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", glob: ".ENV" }, karar: "RED", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", glob: "**/.ENV.LOCAL" }, karar: "RED", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", glob: "*.KEY" }, karar: "RED", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", glob: "[!a]env" }, karar: "RED", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", glob: ".en[v]" }, karar: "RED", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", glob: "*env" }, karar: "RED", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", glob: "panel-url*" }, karar: "RED", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", glob: "**/panel-url.txt" }, karar: "RED", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", glob: "zepul-ai-anahtar.*" }, karar: "RED", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", glob: ".cred*" }, karar: "RED", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", glob: "**/.credentials.json" }, karar: "RED", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", glob: ".lab-parola" }, karar: "RED", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", glob: "vercelapi.txt" }, karar: "RED", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", glob: "**/.tmp/**" }, karar: "RED", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", glob: "{.env,a.txt}" }, karar: "RED", jev: [] }, // av10: bugün IZIN (Bulgu 1)
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", glob: ".{env,x}" }, karar: "RED", jev: [] }, // av10: bugün IZIN (Bulgu 1)
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", glob: "*.{key,pem}" }, karar: "RED", jev: [] }, // av10: bugün IZIN (Bulgu 1)
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", glob: "**/{.env,x}" }, karar: "RED", jev: [] }, // av10: bugün IZIN (Bulgu 1)
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", glob: "a.md,.env" }, karar: "RED", jev: [] }, // av10: bugün IZIN (Bulgu 1)
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", glob: "*.md .env" }, karar: "RED", jev: [] }, // av10: bugün IZIN (Bulgu 1)
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", glob: "*.md,*.key" }, karar: "RED", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "t=", path: "<TEMP>", glob: "**/{panel-url.txt,x}" }, karar: "RED", jev: [] }, // av10: bugün IZIN (Bulgu 1)
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "t=", path: "<TEMP>", glob: "**/panel-url.txt" }, karar: "RED", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", glob: "{*.key}" }, karar: "RED", jev: [] }, // av10: bugün IZIN (Bulgu 1)
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", glob: "*.ke[y]" }, karar: "RED", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", glob: ".env" }, karar: "RED", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", glob: "*" }, karar: "IZIN", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", glob: "*.txt" }, karar: "IZIN", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", glob: ".env.example" }, karar: "IZIN", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", glob: "!.env" }, karar: "IZIN", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", type: "sh" }, karar: "IZIN", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", type: "env" }, karar: "IZIN", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", type: "sh", path: "<SIR>" }, karar: "RED", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", path: "<SIR>/panel-url.txt" }, karar: "RED", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", path: "<SIR>" }, karar: "RED", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", path: "<SIR>/" }, karar: "RED", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", path: "<SIR>/." }, karar: "RED", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", path: "<SIR>" }, karar: "RED", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", path: "<SIR>." }, karar: "RED", jev: [] }, // av10: bugün IZIN (Bulgu 2)
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", path: "<SIR>/./" }, karar: "RED", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Glob", girdi: { pattern: ".env" }, karar: "RED", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Glob", girdi: { pattern: "**/.env" }, karar: "RED", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Glob", girdi: { pattern: "<ANA>\\deneme\\sir\\.env" }, karar: "RED", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Glob", girdi: { pattern: "<SIR>/panel-url.*" }, karar: "RED", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Glob", girdi: { pattern: "*", path: "<SIR>" }, karar: "RED", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Glob", girdi: { pattern: "**/*.KEY" }, karar: "RED", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Glob", girdi: { pattern: "**/{.env,x}" }, karar: "RED", jev: [] }, // av10: bugün IZIN (Bulgu 3)
  { b: "av10-BZ", rol: "isci", arac: "Bash", girdi: "\r\nprintf -v PATH %s /c/x/araclar; cat a.txt | grep x", karar: "TEK", jev: ["\r\nprintf -v PATH %s /c/x/araclar; cat a.txt | grep x"] }, // CRLF-bas, tablo #7
  { b: "av10-BZ", rol: "denetci", arac: "Bash", girdi: "\r\ngit -C \"<WT>\" worktree add --detach \"<KOPYA>/m1\" HEAD", karar: "TEK", jev: ["\r\ngit -C \"<WT>\" worktree add --detach \"<KOPYA>/m1\" HEAD"] }, // CRLF-bas, tablo #14
  { b: "av10-BZ", rol: "denetci", arac: "Bash", girdi: "\r\ngit worktree add --det \"<KOPYA>/m1\" HEAD", karar: "TEK", jev: ["\r\ngit worktree add --det \"<KOPYA>/m1\" HEAD"] }, // CRLF-bas, tablo #23
  { b: "av10-BZ", rol: "denetci", arac: "Bash", girdi: "\r\ngit -C \"<WT>\" -c x.y=z worktree add \"<KOPYA>/m1\"", karar: "TEK", jev: ["\r\ngit -C \"<WT>\" -c x.y=z worktree add \"<KOPYA>/m1\""] }, // CRLF-bas, tablo #27
  { b: "av10-BZ", rol: "denetci", arac: "Bash", girdi: "\r\ngit --git-dir=C:/x worktree add \"<KOPYA>/m1\"", karar: "TEK", jev: ["\r\ngit --git-dir=C:/x worktree add \"<KOPYA>/m1\""] }, // CRLF-bas, tablo #28
  { b: "av10-BZ", rol: "sef", arac: "Bash", girdi: "\r\nrm -rf \"$D/x\"", karar: "INSAN", jev: [] }, // CRLF-bas, tablo #92
  { b: "av10-BZ", rol: "isci", arac: "PowerShell", girdi: "git\u3000status\u3000||\u3000ls", karar: "TEK", jev: ["git\u3000status\u3000||\u3000ls"] }, // TG-bosluk, tablo #105
  { b: "av10-BZ", rol: "isci", arac: "PowerShell", girdi: "\r\ngit status || ls", karar: "TEK", jev: ["\r\ngit status || ls"] }, // CRLF-bas, tablo #105
  { b: "av10-BZ", rol: "isci", arac: "PowerShell", girdi: "git status || ls\r\n", karar: "TEK", jev: ["git status || ls\r\n"] }, // CRLF-son, tablo #105
  { b: "av10-BZ", rol: "isci", arac: "PowerShell", girdi: "&\u3000'C:/x/a.exe'", karar: "TEK", jev: ["&\u3000'C:/x/a.exe'"] }, // TG-bosluk, tablo #111
  { b: "av10-BZ", rol: "isci", arac: "PowerShell", girdi: "\r\n& 'C:/x/a.exe'", karar: "TEK", jev: ["\r\n& 'C:/x/a.exe'"] }, // CRLF-bas, tablo #111
  { b: "av10-BZ", rol: "isci", arac: "PowerShell", girdi: "& 'C:/x/a.exe'\r\n", karar: "TEK", jev: ["& 'C:/x/a.exe'\r\n"] }, // CRLF-son, tablo #111
  { b: "av10-BZ", rol: "isci", arac: "PowerShell", girdi: "git\u3000sta`tus;\u3000ls", karar: "TEK", jev: ["git\u3000sta`tus;\u3000ls"] }, // TG-bosluk, tablo #115
  { b: "av10-BZ", rol: "isci", arac: "PowerShell", girdi: "\r\ngit sta`tus; ls", karar: "TEK", jev: ["\r\ngit sta`tus; ls"] }, // CRLF-bas, tablo #115
  { b: "av10-BZ", rol: "isci", arac: "PowerShell", girdi: "git sta`tus; ls\r\n", karar: "TEK", jev: ["git sta`tus; ls\r\n"] }, // CRLF-son, tablo #115
  { b: "av10-BZ", rol: "isci", arac: "PowerShell", girdi: "ls;\u3000git\u3000@a", karar: "TEK", jev: ["ls;\u3000git\u3000@a"] }, // TG-bosluk, tablo #118
  { b: "av10-BZ", rol: "isci", arac: "PowerShell", girdi: "\r\nls; git @a", karar: "TEK", jev: ["\r\nls; git @a"] }, // CRLF-bas, tablo #118
  { b: "av10-BZ", rol: "isci", arac: "PowerShell", girdi: "ls; git @a\r\n", karar: "TEK", jev: ["ls; git @a\r\n"] }, // CRLF-son, tablo #118
  { b: "av10-BZ", rol: "isci", arac: "Bash", girdi: "\r\ncmd /c rd /s /q C:\\x", karar: "INSAN", jev: [] }, // CRLF-bas, tablo #150
  { b: "av10-BZ", rol: "isci", arac: "Bash", girdi: "\r\nls; { git status; }", karar: "TEK", jev: ["\r\nls; { git status; }"] }, // CRLF-bas, tablo #152
  { b: "av10-BZ", rol: "denetci", arac: "Bash", girdi: "\r\nrm -rf \"<KOPYA>/. \"", karar: "INSAN", jev: [] }, // CRLF-bas, tablo #179
  { b: "av10-BZ", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item\u3000-Recurse\u3000-Force\u3000-Path:'<KOPYA>/a'\u3000'<ANA>'", karar: "INSAN", jev: [] }, // TG-bosluk, tablo #185
  { b: "av10-BZ", rol: "denetci", arac: "PowerShell", girdi: "\r\nRemove-Item -Recurse -Force -Path:'<KOPYA>/a' '<ANA>'", karar: "INSAN", jev: [] }, // CRLF-bas, tablo #185
  { b: "av10-BZ", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force -Path:'<KOPYA>/a' '<ANA>'\r\n", karar: "INSAN", jev: [] }, // CRLF-son, tablo #185
  { b: "av10-BZ", rol: "denetci", arac: "Bash", girdi: "\r\nrm -rf \"<KOPYA>/a\" \"<KOPYA>/b\"", karar: "TEK", jev: ["\r\nrm -rf \"<KOPYA>/a\" \"<KOPYA>/b\""] }, // CRLF-bas, tablo #196
  { b: "av10-BZ", rol: "denetci", arac: "Bash", girdi: "\r\ngit worktree add --no-checkout \"<KOPYA>/m1\"", karar: "TEK", jev: ["\r\ngit worktree add --no-checkout \"<KOPYA>/m1\""] }, // CRLF-bas, tablo #226
  { b: "av10-BZ", rol: "isci", arac: "Bash", girdi: "\r\nnpm exec --call=\"git clean -fd\"; ls", karar: "INSAN", jev: [] }, // CRLF-bas, tablo #287
  { b: "av10-BZ", rol: "isci", arac: "PowerShell", girdi: "npx\u3000-c\u3000'git\u3000push\u3000--force';\u3000ls", karar: "RED", jev: [] }, // TG-bosluk, tablo #311
  { b: "av10-BZ", rol: "isci", arac: "PowerShell", girdi: "\r\nnpx -c 'git push --force'; ls", karar: "RED", jev: [] }, // CRLF-bas, tablo #311
  { b: "av10-BZ", rol: "isci", arac: "PowerShell", girdi: "npx -c 'git push --force'; ls\r\n", karar: "RED", jev: [] }, // CRLF-son, tablo #311
```
