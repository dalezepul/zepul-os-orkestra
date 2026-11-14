# Hata avı, 3. tur (K15)

- **Kapsam:** `c0d729a..253bcbc` (satır numaraları `253bcbc` içindir). Tur 2 düzeltmeleri (`av2` commit'leri), K22 OWNS geçmişi, Y1 yerelde `dontAsk` + kapı `allow`, Jev hatası → insan, Laya hata tekrarı, `/api/laya-istatistik`, `REDDEDILDI`.
- **Yöntem:** Ana repoda yalnızca okuma yapıldı. Denemeler `%TEMP%\zepul-av3-kopya` klonunda koştu:
  - `deneme/k26.mts`, `deneme/k26b.mts`: gerçek `kapiKarari`, sahte Jev her soruya "geri-alinamaz 0,99" diyor. Kopya kökü geçici bir klasörde.
  - `deneme/y1.mts`: gerçek `kapiHookOlustur`, sahte Jev.
  - `deneme/katip.mts`: gerçek `katipNotYaz`, geçici vault, `calistir` sahte.
  - `deneme/k22.mts`: geçici git deposunda gerçek `birlestir`.
  - Kabuk davranışı yalnız zararsız `cd`/`pwd` ile doğrulandı. Hiçbir silme çalıştırılmadı.
  - Kopyada `test/kapi.test.ts` ve `test/laya.test.ts` yeşil (31/31).
- **Tekrar edilmeyenler:** `hata-avi-2.md` bulguları. Yalnızca düzeltmelerinin doğruluğu denetlendi.

## Özet

| # | Mercek | Önem | Yer | Başlık |
|---|---|---|---|---|
| 1 | Güvenlik / Windows | yüksek | `kapi.ts:155-159` | K26 izleme bash'te `cd C:` komutunu kopya içinde kalmak sanıyor; gerçekte sürücü köküne gidiliyor |
| 2 | Güvenlik / doğruluk | yüksek | `kapi.ts:144`, `kapi.ts:155-159`, `olay.ts:186-195` | K26 izleme, kabuğun uygulamadığı dizin değişimini uygulanmış sayıyor (`&`, bash'te `chdir`/`sl`/`Set-Location`, `\|\|`) |
| 3 | Güvenlik | orta | `kapi.ts:122-125`, `baglama.ts:101-104` | Yerel ajanda Jev'in belirsiz ya da düşük güvenli kararı kabuk dışı araçlarda doğrudan `allow` oluyor |
| 4 | Doğruluk | düşük | `baglama.ts:1157-1160` | Kapanışta yalnızca sorulu görevler ve baştaki görev kapanıyor; sıradaki diğer görevler sonuçsuz kalıyor |
| 5 | Doğruluk | düşük | `baglama.ts:1166` | `REDDEDİLDİ` algısı Markdown biçimini (`**REDDEDİLDİ:**`) kaçırıyor; sonuç `TAMAM` gidiyor |
| 6 | Doğruluk | düşük | `baglama.ts:46` | Laya'nın ilk hata kartında asıl hata metni siliniyor |
| 7 | Güvenlik | düşük | `baglama.ts:763` | `birlesme` olayındaki commit konuları maskelenmeden olay loguna ve zepul-ai akışına gidiyor |
| 8 | Tutarlılık | düşük | `kapi.ts:145` | `adi` artık ters bölüyle bölmüyor; `olay.ts:203`'teki eşinden ayrıldı |

Sayım: yüksek 2, orta 1, düşük 5.

---

## Tur 2 düzeltmelerinin denetimi

| Tur 2 | Sonuç |
|---|---|
| 1. `cerceve`/`notrle` | Doğru. Satır sonu, `\v`, `\f`, NEL, U+2028 ve U+2029 `⏎` oluyor; ok, kaynak, güven ve kullanıcı içeren köşeli etiketler `⟦…⟧` oluyor. İç içe köşeli parantez de nötrleniyor. Sınır (tam genişlik `［］`) koddaki ponytail notunda yazılı. |
| 2. `cd -` | Düzeltildi; testi var. Ama yeni dizin izleme, aynı türden iki yeni açık getiriyor (Bulgu 1 ve 2). |
| 3. Kuyruk mesajı | Doğru. `tik()` durumu `bekliyor` yaptıktan sonra `devam()` çağırıyor, bu yüzden ilk görev kutuya itiliyor; sıradayken gelen mesaj ilk görevin önünde gidiyor. |
| 4. `katip-not` yolu | Doğru. Kopyada şu girdiler denendi ve hepsi reddedildi: `notes/V3/a.md`, `knowledge/V3/x.md`, `notes/v3 /a.md`, `notes/v3./a.md`, `notes/v3::$DATA/a.md`, `notes/V3/../../x.md`, `Notes/a.md`, `notes//v3/a.md`, `notes/./v3/a.md`. `notes/a.md` geçiyor. |
| 5. Receipt öneki | Doğru (`zepul-ai-` zorunlu). |
| 6. `olu`/`hata` tur sonu | Doğru. Görev ancak `vazgec`'in `devam_edilebilir: false` hatasıyla kapanıyor. Bkz. şüphe 1. |
| 7. Kapanış | Eksik: Bulgu 4. |
| 8. Sır desenleri | Doğru. `laya-istatistik` eski gölge kayıtlarını da yeniden `maskele`'den geçiriyor. |
| 9. `izinliCwd` | Doğru (`kanonik` ile). |
| K22 OWNS geçmişi | Doğru. Kopyada denendi: birleşme commit'inde OWNS dışı bir dosyanın elle değiştirilmesi (`dis.txt`) `owns-disi` olarak yakalanıyor (combined diff), `main` değişmiyor. |
| Jev hatası → insan (yerel) | Doğru, kalan öğeler için özyinelemede de geçerli (`{...g}`). Ama aynı boşluk belirsiz kararda kalmış: Bulgu 3. |
| `/api/laya-istatistik` | Yetki doğru: uç `ZEPUL_AI_UCLARI` listesinde yok, zepul-ai anahtarı 403 alır. Girdi `maskele` ile maskeleniyor ve 200 karaktere kesiliyor. Panel `kacis` kullanıyor. Ham sır sızıntısı bulunmadı. |
| Laya hata tekrarı | Çalışıyor. Paylaşılan tek `kapiBag` olduğu için ajan başına tekrar yok. Bkz. Bulgu 6. |
| `REDDEDILDI` | Bulgu 5. |
| `laya-olc.mjs` içe aktarma koruması | 8.3 kısa yolla doğrudan çalıştırma denendi, koruma doğru çalışıyor. |

---

## 1. Savunma güvenliği merceği

### Bulgu 1 (yüksek): K26 izleme bash'teki `cd C:` komutunu kopya içinde kalmak sanıyor

**Yer:** `kapi.ts:155-159`. `cd` hedefi `kanonik(t[1], dizin)` ile çözülüyor.

**Açıklama:**
- Node `path.resolve(dizin, "C:")` çağrısı, aynı sürücüdeki `dizin`'i döndürüyor. Kod bu yüzden izlenen dizinin değişmediğini sanıyor ve kopya içinde kaldığını varsayıyor.
- Git Bash'te ise `cd C:` sürücü köküne (`/c`) gider. Bu kopyada doğrulandı: `cd <kopya>/deneme; cd C:; pwd` → `/c`.
- Sonuç: aynı zincirdeki göreli silme hedefi kodda kopya altına çözülüyor, `izin` alıyor ve Jev'e hiç sorulmuyor. Kabukta ise hedef sürücü kökü altındaki yola denk geliyor.
- Kesin yasak katmanı göreli hedefi serbest bırakıyor, bu yüzden geriye başka bir katman kalmıyor.
- PowerShell'de `cd C:` o sürücüdeki geçerli konumda kalıyor. Bu kopyada doğrulandı; açık yalnızca bash lehçesinde var.

**Kanıt** (`deneme/k26.mts` ve `deneme/k26b.mts`; sahte Jev her soruya "geri-alinamaz 0,99" diyor):

```
bash: cd "<kopya>/m1"; cd C:; rm -rf src    => izin | jev: 0
bash: cd "<kopya>/m1"; cd C:x; rm -rf y     => insan | jev: 1   (C:x var olmadığı için düşüyor)
PS:   cd "<kopya>\m1"; cd C:; Remove-Item … => izin | jev: 0   (PowerShell'de anlam doğru)
```

**Öneri:**
- `cd` hedefi sürücü göreli ise (`^[A-Za-z]:` ardından `\` ya da `/` gelmiyorsa) izleme bitsin (`dizin = null`).
- Kırmızı test: bash lehçesinde yukarıdaki ilk zincir `izin` almamalı ve Jev'e gitmeli.

### Bulgu 2 (yüksek): K26 izleme, kabuğun uygulamadığı dizin değişimini uygulanmış sayıyor

**Yer:**
- `kapi.ts:144`: `CD = /^(cd|chdir|set-location|sl)$/i`, iki lehçe için tek küme.
- `kapi.ts:155-159`
- `olay.ts:186-195`: `listeOgeleri`, `;`, `&&`, `||`, `&` ve satır sonunu aynı ayırıcı sayıyor.

**Açıklama:** İzleme, `cd` öğesinin çalıştığını ve sonraki öğenin yeni dizinde çalıştığını varsayıyor. Üç durumda bu varsayım tutmuyor; göreli silme ise denetçinin gerçek çalışma dizininde çalışıyor. Bu dizin işçinin worktree'sidir (`cwd: isci.worktree`, `baglama.ts:701`).

1. **Arka plan `&` (bash):** `cd X & rm …` komutunda `cd` bir alt kabukta çalışıyor ve ana kabuğun dizinini değiştirmiyor. Kopyada doğrulandı: `(cd /c/Users & pwd)` çıktısı başlangıç dizini.
2. **Bash'te komut olmayan takma adlar:** `chdir`, `sl` ve `Set-Location` yalnızca PowerShell'de var. Bash'te `command not found` (çıkış 127) veriyorlar ve `;` sonrası öğe eski dizinde çalışıyor. Kopyada doğrulandı.
3. **`||`:** `cd X || rm …` komutunda silme yalnızca `cd` başarısız olursa çalışır, yani eski dizinde. `dizinMi` kontrolü bu durumu seyreltiyor ama kapatmıyor (yetki hatası, yarış).

Etki: göreli hedef kodda kopya kökü altında doğrulanıyor, ama kabukta işçi worktree'sine göre çözülüyor. Hedef `..` içeriyorsa ve izlenen dizin kopyada yeterince derinse (mutasyon kopyası tam bir worktree olduğu için derin dizinler hazır bulunur), kodun kopya içinde kaldığını onayladığı yol gerçekte worktree'nin, hatta reponun dışına çıkabilir. Jev'e sorulmuyor. Denetçi incelediği kodun metnine maruz kalıyor (Tur 2, Bulgu 2 ile aynı tehdit).

**Kanıt** (`deneme/k26b.mts`):

```
bash cd & (arka plan) rm göreli  => izin | jev: 0
bash chdir                       => izin | jev: 0
bash sl                          => izin | jev: 0
bash Set-Location                => izin | jev: 0
cd || rm                         => izin | jev: 0
bash (cd) alt kabuk              => insan | jev: 1   (doğru)
```

**Öneri:**
1. `cd` kümesi lehçeye göre ayrılsın: bash için yalnızca `cd`; PowerShell için `cd`, `chdir`, `sl`, `Set-Location`.
2. İzleme yalnızca `&&`, `;` ve satır sonu ayırıcılarında sürsün; `&` ve `||` izlemeyi bitirsin. Bunun için `listeOgeleri` öğe başına ayırıcıyı döndürmeli.
3. Savunma derinliği: kısa yolda göreli hedef `..` parçası içeriyorsa tutmasın. Böylece izleme ile gerçek dizin ayrışsa bile etki, çalışma dizininin altıyla sınırlı kalır.
4. İkinci savunma katmanı (isteğe bağlı): göreli silme yalnızca `cd` ile silme arasındaki her ayırıcı `&&` ise kabul edilsin. Bash'te `cd` başarısız olursa sonraki öğe çalışmaz. PowerShell 5.1'de `&&` yok; orada göreli hedef yerine mutlak hedef istenebilir. Denetçi istemi bunu zaten söylüyor (`denetci.ts:97-98`).
5. Kırmızı testler: yukarıdaki beş zincir.

### Bulgu 3 (orta): Yerel ajanda Jev'in belirsiz ya da düşük güvenli kararı kabuk dışı araçta doğrudan `allow` oluyor

**Yer:**
- `kapi.ts:122-125`: kabuk dışı araçta belirsiz, düşük güven ya da bilinmeyen seçim `gec` döndürüyor.
- `baglama.ts:101-104`: yerel ajanda `gec` → `don(true)`.

**Açıklama:**
- Claude ajanında `gec`, yerleşik `auto` sınıflandırıcıya bırakılıyor; bu ikinci bir ağ.
- Yerel ajanda (`dontAsk`) ikinci ağ yok, `gec` doğrudan açık `allow` oluyor.
- Jev erişilemediğinde bu boşluk kapatıldı (`g.yerel` → insan), ama Jev'in "emin değilim" dediği yol açık kaldı.
- KURALLAR F: "Jev güveni 0,8'in altındaysa sonuç belirsiz sayılır ve insana gider." Yerel ajanda belirsiz sonuç ise izne dönüşüyor.
- Etkilenen araçlar `WebFetch`, `WebSearch`, `NotebookEdit` ve OWNS'u olmayan rolde `Write`. Bunlar arasında dışa veri çıkarabilen araçlar var (KURALLAR F: dışa mesaj gönderme kesin yasak).

**Kanıt** (`deneme/y1.mts`, gerçek `kapiHookOlustur`):

```
belirsiz 0.5   ollama WebFetch: allow | gec      claude WebFetch: {} (auto) | gec
riskli 0.6     ollama WebFetch: allow | gec
bilinmeyen 0.99 ollama Write:   allow | gec
```

**Öneri:**
- `esikKarari` içinde `g.yerel` ise belirsiz dalı her araçta `insan` dönsün.
- Daha dar seçenek: `kapiHookOlustur` yerel ajanda yalnızca `k.risk === "dusuk"` olan `gec` için `allow` versin; kendi OWNS alanındaki yazma da bu kapsamda kalsın.
- Kırmızı test: yerel ajanda belirsiz 0,5 ile `WebFetch` için karar `insan` olmalı.

### Bulgu 7 (düşük): `birlesme` olayındaki commit konuları maskelenmiyor

**Yer:** `baglama.ts:763`.

**Açıklama:**
- `commitler` alanı işçinin yazdığı commit konularını taşıyor ve `maskele`'den geçmiyor. `hata` alanı da maskelenmiyor; `ozetle` yalnızca `sefeBilgi` satırında kullanılıyor.
- Olay, olay loguna ve SSE'ye yazılıyor. zepul-ai anahtarı `/api/olaylar` ve `/api/akis` uçlarına erişebiliyor.
- `mesaj` olayları ise `maskele` ile yazılıyor; bu alan o korumanın dışında kalmış.

**Öneri:** `commitler` ve `hata` alanları `maskele`'den geçsin.

---

## 2. Doğruluk merceği

### Bulgu 4 (düşük): Kapanışta sıradaki görevler sonuçsuz kalıyor

**Yer:** `baglama.ts:1157-1160` (`kapat`), `baglama.ts:1162-1166` (`olay`), `orkestra.ts:945`.

**Açıklama:**
- `kapat()` yalnızca soru bekleyen görevleri kapatıyor.
- Şefin `bitti` olayı ise yalnızca `gorevler[0]`'ı kapatıyor.
- Sonuç: zepul-ai'den gelen iki ya da daha fazla görev sıradaysa, ikinci ve sonraki görevler `gorev_sonuc` almıyor. Durum bellekte tutulduğu için yeniden açılışta bu görevler kayboluyor. Tur 2'deki Bulgu 7 bu yüzden kısmen açık.

**Öneri:** `kapat()` açık görevlerin hepsini `BASARISIZ "kapanış"` ile kapatsın, yalnızca sorulu olanları değil. Test: soru açılmamış iki görevle kapanış, iki `gorev_sonuc` üretmeli.

### Bulgu 5 (düşük): `REDDEDİLDİ` algısı Markdown biçimini kaçırıyor

**Yer:** `baglama.ts:1166`. Desen: `/^\s*reddedildi(?![\p{L}\d])/iu`.

**Açıklama:** Şef artık varsayılan olarak Claude Sonnet ve Claude modelleri sık sık kalın yazı kullanır. Kopyada desen şu girdilerle denendi:
- `**REDDEDİLDİ:** …` → eşleşmiyor.
- `> REDDEDİLDİ:` → eşleşmiyor.
- `REDDEDİLDİ: …` ve `Reddedildi: …` → eşleşiyor.

Eşleşmeyen durumda zepul-ai'ye `TAMAM` gidiyor.

**Öneri:** Eşleştirmeden önce baştaki `*`, `_`, `>`, `#` ve boşluk atılsın. Test: yukarıdaki iki biçim `REDDEDILDI` sonucu vermeli.

### Bulgu 6 (düşük): Laya'nın ilk hata kartında asıl hata metni siliniyor

**Yer:** `baglama.ts:46`. `...h, mesaj: "Laya'ya ulaşılamıyor, gölge ölçüm yapılamıyor"` asıl `h.mesaj` değerini eziyor.

**Açıklama:**
- Düşüşün tek kaydı bu kart, ama içinde ağ hatası, 401 ya da bozuk yanıt (`cevapOku`) ayrımı kalmıyor.
- Bozuk yanıt durumunda "ulaşılamıyor" demek de yanlış.
- Ara hatalar yalnızca sayılıyor, o yüzden ayrıntı hiçbir yerde kalmıyor.

**Öneri:** Asıl metin ayrı bir alanda (örneğin `ayrinti: h.mesaj`) saklansın ya da karta eklensin.

---

## 3. Windows merceği

- **Bulgu 1** Windows'a özgüdür: sürücü göreli yol (`C:`) Node'da ve Git Bash'te farklı çözülüyor.
- **Bulgu 8 (düşük):** `kapi.ts:145` içinde `adi`, `split(/[\/]/)` ile yalnızca düz bölüyle bölüyor. `olay.ts:203`'teki eşi ise `[\\/]` ile iki ayırıcıyla da bölüyor.
  - Sonuç: `C:\…\rm.exe -rf …` biçimindeki silme öğesi kısa yolda silme sayılmıyor ve Jev'e gidiyor. Bu güvenli yön ve kopyada doğrulandı: `insan`, `jev: 1`.
  - Ama değişiklik commit mesajında ve yorumda geçmiyor. İki `adi` ayrıştığı için ileride bir silme ya da dizin sözcüğü yanlış sınıflanabilir.
  - Öneri: değişiklik bilinçliyse yorumla gerekçesi yazılsın; değilse `olay.ts`'teki `adi` dışa aktarılıp kullanılsın.
- **CRLF:** `birlestir` (`/\r?\n/`), `layaIstatistik` (`/\r?\n/`) ve `notrle` (`\r\n` ve tek `\r`) uygun. Sorun bulunmadı.

---

## Şüpheler (bulgu sayılmadı)

1. **Diriltme istisnasında görev açık kalabilir:** `dirilt` istisna atarsa (örneğin "diriltme mesajı iletilemedi"), `olumTuru` `devam_edilebilir: true` yayıyor. Ajan `olu` durumda kalıyor, ama sonraki turda ne sessiz aday ne de `hata` sayılıyor. Bu yüzden yeniden denenmiyor ve `vazgec` de gelmiyor. Şefse zepul-ai görevi açık kalır. Eskiden `olu` görevi kapatıyordu. Kod okumasıyla bulundu, denenmedi.
2. **Kapanışta kısmi metin `TAMAM` olabilir:** Kapanışta `interrupt` sonrası SDK bir `result` üretir ve şef `bekliyor` olursa, baştaki görev yarım metinle `TAMAM` alabilir. Sıralamaya bağlı; ölçülmedi.
3. **`g.red` kapsamı:** Kullanıcı herhangi bir alt soruya "hayır" derse, şef başka yoldan işi bitirse bile görev `REDDEDILDI` sayılıyor. Tasarım kararı olabilir.
4. **`/api/laya-istatistik` maliyeti:** Uç her çağrıda bütün `laya-golge.jsonl` dosyasını okuyup ayrıştırıyor. Dosya sınırsız büyüyor; panel açıkken her kapı kararında, 1,5 sn birleştirmeyle çağrılıyor. Ölçülmedi.
5. **Bash'te `CDPATH`:** `CDPATH` tanımlıysa göreli `cd` başka bir dizine gidebilir. Ajan ortamında tanımlı olup olmadığına bakılmadı. Bulgu 2'deki öneri 3 (`..` içeren göreli hedefin reddi) bunun etkisini de sınırlar.
6. **PowerShell 5.1'de başarısız `Set-Location`:** Bu bir sonlandırmayan hata ve `;` sonrası öğe sürüyor. `dizinMi` kontrolü ile çalıştırma arasındaki yarış (dizin silinirse) aynı sonuca götürür. Olasılık düşük.
