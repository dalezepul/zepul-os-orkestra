# Hata avı, 4. tur (K15)

- **Kapsam:** `06d310f..02ef80d` (satır numaraları `02ef80d` içindir). Bileşik komutun parça parça Jev'e sorulması, boru + salt okur süzgeç ayrımı (`olay.ts` `boruAsamalari`, `kapi.ts` `suzgecMi`), K26 dizin izlemenin kaldırılması (yalnız mutlak hedef), yerelde belirsiz sonucun insana gitmesi, kapanışta sıradaki görevler, B5–B8.
- **Yöntem:** Ana repoda yalnızca okuma yapıldı. Denemeler `%TEMP%\zepul-av4-kopya` klonunda koştu:
  - `deneme/av4.mts`, `av4b.mts`, `av4c.mts`: gerçek `kapiKarari`, sahte Jev. Sahte Jev yalnızca kendisine sorulan parçaya bakıyor (ya da her şeye "güvenli 0,95" diyor) ve sorulan durum metnini kaydediyor.
  - `deneme/av4d.mts`: gerçek `kesinYasakMi`.
  - Kabuk davranışı yalnızca zararsız komutlarla (`echo`, `Write-Output`, `uniq`/`sort.exe` ile kopya içinde dosya yazma) doğrulandı. Hiçbir silme çalıştırılmadı.
  - Kopyada `test/kapi.test.ts` yeşil (33/33).
- **Tekrar edilmeyenler:** `hata-avi-2.md` ve `hata-avi-3.md` bulguları. Yalnızca düzeltmelerinin doğruluğu denetlendi.

## Özet

| # | Mercek | Önem | Yer | Başlık |
|---|---|---|---|---|
| 1 | Güvenlik / Windows | yüksek | `kapi.ts:172-186`, `olay.ts:145-180` | Süzgeç sanılan boru aşaması, kabuğun ayrı çalıştırdığı bir komutu taşıyabiliyor (yorumdaki tırnak, PowerShell'de tek `\r`); o komut Jev'e hiç parça olarak gitmiyor |
| 2 | Güvenlik / Windows | orta | `kapi.ts:142`, `kapi.ts:171-181` | Süzgeç beyaz listesinde yazma ve çalıştırma yolları: `uniq - ÇIKTI`, PowerShell'de `sort.exe /O`, yol önekli `…/tail` |
| 3 | Güvenlik / doğruluk | orta | `kapi.ts:95-98`, `kapi.ts:187-191` | Parça başına sorguda dizin ve ortam değişimi kayboluyor; Jev'e "proje kökü, yalnız parçayı değerlendir" deniyor, bağlam baştan 1000 karakterde kesiliyor |
| 4 | Doğruluk | düşük | `olay.ts:199-210` | `boruAsamalari`, bash'in `>|` yönlendirmesini boru sayıyor; yönlendirme hedefi süzgeç adı taşıyorsa atılıyor |

Sayım: yüksek 1, orta 2, düşük 1.

---

## Tur 3 düzeltmelerinin denetimi

| Tur 3 | Sonuç |
|---|---|
| B1–B2 (K26 dizin izleme) | Doğru. İzleme kaldırıldı; silme kısa yolu yalnızca mutlak, `..` içermeyen ve kopya kökünün kesin altında kalan hedefe uygulanıyor (`mutlakMi`, `kapi.ts:143`). `cd C:`, `&`, `\|\|`, bash'te `chdir`/`sl` artık kısa yolu etkilemiyor; göreli hedef Jev'e gidiyor. |
| B3 (yerelde belirsiz) | Doğru. `esikKarari(komut !== null \|\| !!g.yerel, …)` (`kapi.ts:329`); parça yolunda da `esikKarari(true, …)`. |
| B4 (kapanış) | Doğru. `kapat()` `[...gorevler]` kopyası üzerinde dönüyor; `sonuc` her görevi listeden çıkarıp `gorev_sonuc` yayıyor. |
| B5 (`REDDEDİLDİ`) | Doğru. `/^[\s*_>#]*reddedildi(?![\p{L}\d])/iu`, `**REDDEDİLDİ:**` ve `> REDDEDİLDİ` biçimlerini yakalıyor. |
| B6 (Laya hata kartı) | Doğru. Asıl metin karta ekleniyor. |
| B7 (birleşme olayı) | Doğru. `hata` ve commit konuları `maskele`'den geçiyor. |
| B8 (`adi`) | Doğru, iki ayırıcıyla bölüyor. Ama aynı `adi` süzgeç denetiminde yol önekini de atıyor: Bulgu 2. |
| Kesin yasak tüm komuta | Doğru. `kapiKarari` başında `yasakKarari(g, g.girdi, …)` tüm komuta uygulanıyor (`kapi.ts:291`); parça yolunda her parçaya ayrıca uygulanıyor. Kopyada `\n`, tek `\r` ve `; ` ayırıcılarıyla proje dışı özyineli silme ve `git push --force` denendi, üçünde de yasak. |
| Birleştirme kuralı | Doğru. Jev'e giden her parça `esikKarari(true, …)`'dan geçiyor; biri `gec` değilse en riskli olanı dönüyor (hepsi `insan`). Jev hatasında `jevHatasiKarari`. `PARCA_SINIRI` aşılırsa tüm komut tek soruya dönüyor. |

---

## 1. Savunma güvenliği merceği

### Bulgu 1 (yüksek): Süzgeç sanılan aşama, kabuğun ayrı çalıştırdığı bir komutu taşıyabiliyor

**Yer:**
- `kapi.ts:183-186` (`boruSol`): borunun sağındaki aşamaların hepsi süzgeçse bu aşamalar atılıyor ve Jev'e yalnızca sol taraf parça olarak gidiyor.
- `kapi.ts:172-176` (`suzgecMi`): aşama `listeOgeleri` ile tek öğe ve tek parça çıkarsa süzgeç sayılıyor.
- `olay.ts:145-180` (`sozcukle`): sözcükleyici kabuk yorumunu (`#`) tanımıyor; PowerShell lehçesinde tek `\r` karakterini ayırıcı değil boşluk sayıyor.

**Açıklama:** Sözcükleyici ile kabuk iki durumda ayrışıyor ve ikisinde de süzgeç denetimi yanlış yönde sonuç veriyor:

1. **Yorumdaki tırnak (bash ve PowerShell):** Kabuk `#`'den satır sonuna kadar olan metni yorum sayar; yorumdaki `'` tırnak açmaz. Sözcükleyici ise bu `'`'i tırnak başlangıcı sayıyor ve bir sonraki `'`'e kadar olan metni, araya giren satır sonlarıyla birlikte, süzgeç aşamasının bir argümanı sanıyor. Kabuk bu satırları ayrı komut olarak çalıştırıyor. Kopyada zararsız bir komutla doğrulandı: `bash -c` ile yorumdaki tırnaktan sonraki satır çalıştı.
2. **PowerShell'de tek `\r`:** PowerShell yalnız `\r` karakterini de satır sonu sayar. Kopyada doğrulandı: `Write-Output bir | Select-Object -First 1` + `\r` + `Write-Output IKINCI_CALISTI` iki satırı da yazdı. Sözcükleyici `\r`'yi boşluk sayıyor, bu yüzden sonraki komut süzgeç aşamasının argümanı gibi görünüyor.

Sonuç: süzgeç aşaması atılıyor, içindeki komut Jev'e hiç parça olarak gitmiyor ve kod "bütün parçalar güvenli" diyerek `izin` veriyor. Komut Jev'e yalnızca "Bağlam" satırında görünüyor. Bağlam da ilk 1000 karakterle kesildiği için (`kapi.ts:98`), önüne dolgu konmuşsa hiç görünmüyor. Panelde `parcalar` alanı da bu komutu göstermiyor. Kesin yasak tüm komuta uygulandığı için yalnızca kesin yasak dışındaki komutlar etkileniyor (proje içi göreli silme, ağa veri gönderme, betik çalıştırma gibi). Yerel ajanda `izin` doğrudan `allow` oluyor, ikinci ağ yok.

**Kanıt** (`deneme/av4.mts`, `av4b.mts`, `av4c.mts`; komut yerine zararsız yer tutucu `GIZLI_KOMUT`):

```
bash: ls; cat a.txt | grep <1100 karakter> #'⏎GIZLI_KOMUT src #'   => izin | parçalar: ["ls","cat a.txt"] | GIZLI Jev'e gitti mi: false
PS:   ls; Get-Content a.txt | Select-Object -First 1 #'⏎GIZLI_KOMUT src #'  => izin | parçalar: ["ls","Get-Content a.txt"] (yalnız bağlamda)
PS:   Get-ChildItem; Get-Content a.txt | Select-Object -First 1 ␍GIZLI_KOMUT x  => izin | GIZLI parça olarak sorulmadı
```

**Öneri:**
1. Süzgeç aşamasında `#`, `\r` ya da `\n` (tırnak içinde bile) varsa aşama süzgeç sayılmasın; `suzgecMi` başındaki karakter denetimine `#`, `\r`, `\n` eklensin. En dar ve en güvenli düzeltme budur.
2. Savunma derinliği: `bilesikParcalar` komutta `#` ya da tek `\r` görürse hiç bölmesin, tüm komut tek soruya gitsin.
3. Bağlam kesimi `durum` gibi baş ve son korunarak yapılsın (Bulgu 3, öneri 2).
4. Kırmızı testler: yukarıdaki üç komut `izin` almamalı; atılan aşamadaki metin ya bir parçada ya da tek soruda Jev'e gitmeli.

### Bulgu 2 (orta): Süzgeç beyaz listesinde yazma ve çalıştırma yolları

**Yer:** `kapi.ts:171-181` (`SUZGEC`, `suzgecMi`), `kapi.ts:142` (`adi`).

**Açıklama:** Beyaz listedeki üç biçim yazıyor ya da çalıştırıyor; atıldıkları için Jev'e parça olarak gitmiyorlar:

1. **`uniq - ÇIKTI`:** `uniq` için konum argümanları sayılırken `-` ile başlayanlar atlanıyor (`kapi.ts:179`). Tek başına `-` ise "standart girdi" demek ve bir konum argümanıdır. Bu yüzden `uniq - hedef.txt` tek konum argümanlı sayılıyor, ama GNU `uniq` ikinci argümana yazıyor. Kopyada doğrulandı: dosya yazıldı. Hedef mutlak bir yol olabilir (OWNS dışı ya da proje dışı dosya).
2. **PowerShell'de `sort.exe /O`:** `adi` `.exe` sonekini atıyor, bu yüzden `sort.exe` süzgeç sayılıyor. PowerShell'de `sort.exe`, Windows'un `C:\Windows\system32\sort.exe` aracına çözülüyor; bu araç `/O DOSYA` ile çıktıyı dosyaya yazıyor. `sort` denetimi yalnızca `-o`/`--output` biçimlerine bakıyor (`kapi.ts:178`). Kopyada doğrulandı: `sort.exe /O sort-cikti.txt` dosyayı yazdı. Git Bash'te `/usr/bin/sort` önce geldiği için orada etkisiz.
3. **Yol önekli süzgeç adı:** `adi` dizin önekini atıyor. Bu yüzden `./araclar/tail` ya da `C:/…/grep.exe` gibi herhangi bir yoldaki, adı süzgeç adıyla aynı olan dosya süzgeç sayılıyor ve çalıştırılması Jev'e sorulmuyor. İşçi kendi OWNS alanına bu adla bir betik yazabilir.

**Kanıt** (`deneme/av4.mts`, `av4b.mts`):

```
bash: ls; cat a.txt | uniq - hedef.txt             => izin | sorulan: ["ls","cat a.txt"]
PS:   ls; Get-Content a.txt | sort.exe /O C:/x/y.txt => izin | sorulan: ["ls","Get-Content a.txt"]
bash: ls; cat a.txt | ./araclar/tail                => izin | sorulan: ["ls","cat a.txt"]
```

**Öneri:**
1. Süzgeç adı yalnızca çıplak adsa kabul edilsin: `ad` içinde `/` ya da `\` varsa `false`.
2. `uniq`: herhangi bir konum argümanı (tek başına `-` dahil) varsa `false`. Borunun sağında `uniq`'in girdi dosyası almasına gerek yok.
3. `sort`: `/` ile başlayan her argümanda `false` (Windows `sort.exe` seçenekleri). Daha sade seçenek: PowerShell lehçesinde `sort` ve `more` beyaz listeden çıksın; PowerShell'de `sort` zaten `Sort-Object`'in takma adıdır.
4. Kırmızı testler: yukarıdaki üç komut parça yoluna girmemeli (tüm komut tek soru) ya da `izin` almamalı.

### Bulgu 3 (orta): Parça başına sorguda dizin ve ortam değişimi kayboluyor

**Yer:** `kapi.ts:95-98` (`durum`, `tam` bağlamı), `kapi.ts:187-191` (`bilesikParcalar`).

**Açıklama:**
- Liste öğeleri birbirinden bağımsız değildir. `cd`, `Set-Location`, `pushd`, `export`, değişken ataması, `alias` ve `source` sonraki öğelerin anlamını değiştirir. K26'da kod için kaldırılan dizin izleme sorunu, Jev tarafında yeniden ortaya çıkıyor.
- Jev'e giden durum metni parçayı "Çalışma dizini (proje kökü): …" başlığıyla veriyor ve "yalnızca yukarıdaki parçayı değerlendir" diyor. Jev'in ölçütünde de "proje klasöründeki dosyalarda geri alınabilir değişiklik güvenlidir" yazıyor. Böylece proje dışında çalışan bir yazma parçası proje içi yazma gibi yargılanabiliyor.
- Bağlam ilk 1000 karakterle kesiliyor (`kapi.ts:98`). Komutun başına dolgu konursa dizin değişimi bağlamda da görünmüyor.
- Önceki tasarımda tüm komut tek soruda gidiyordu ve Jev zinciri bütün olarak yargılıyordu. Kesin yasak göreli hedefi serbest bıraktığı için (hata-avi-3) bu yolda başka bir katman yok. Claude ajanında `auto` ikinci ağ olarak kalıyor; yerel ajanda kalmıyor.

**Kanıt** (`deneme/av4.mts`, sahte Jev yalnız parçaya bakıyor):

```
bash: cd ../..; git status; cp a.txt hedef.txt  => izin | sorulan: ["cd ../..","git status","cp a.txt hedef.txt"]
bash: ls <1100 karakter>; cd /c/Users/<ad>; cp x.txt .bashrc2  => Jev'e giden bağlamda cd görünmüyor
```

**Öneri:**
1. Dizin ya da ortam değiştiren bir öğe varsa (`cd`, `chdir`, `pushd`, `popd`, `Set-Location`, `sl`, `Push-Location`, `export`, `set`, `alias`, `source`, `.`, `AD=değer` biçimli atama, PowerShell'de `$` ile başlayan atama ya da `$env:`) bölünmesin; tüm komut tek soruda gitsin.
2. Bağlam `durum`'daki gibi baş ve son korunarak kesilsin, ya da komut 1000 karakteri aşıyorsa bölünmesin.
3. Kırmızı test: `cd ../..; cp a b` parça yoluna girmemeli.

---

## 2. Doğruluk merceği

### Bulgu 4 (düşük): `boruAsamalari`, bash'in `>|` yönlendirmesini boru sayıyor

**Yer:** `olay.ts:199-210`.

**Açıklama:**
- Bash'te `>|` noclobber'ı aşan yönlendirmedir, boru değildir. `boruAsamalari` `|` karakterini aşama ayırıcısı sayıyor; yönlendirme hedefi ikinci aşama oluyor.
- Hedefin son bileşeni süzgeç adıysa (`…/grep`, `…/head`) aşama atılıyor. Jev'e sarkık `echo veri >` parçası gidiyor; dosyanın nereye yazıldığı parça metninde görünmüyor.
- Sahte Jev `>` gördüğü için kopyada sonuç `insan` çıktı. Gerçek Jev'in sarkık yönlendirmeyi nasıl yargılayacağı belli değil. `PATH` üzerindeki bir dizine süzgeç adıyla dosya yazılması sonraki komutları etkileyebilir.

**Kanıt:** `ls; echo veri >| C:/x/bin/grep` → sorulan parçalar `["ls","echo veri >"]`.

**Öneri:** `boruAsamalari` bir aşamanın sonu `>` ise (`>|`) `null` dönsün. Bulgu 2'nin 1. önerisi (yol önekli ad süzgeç değildir) bu yolu da kapatır.

---

## 3. Windows merceği

- **Bulgu 1'in ikinci yolu** Windows'a özgüdür: PowerShell tek `\r`'yi satır sonu sayıyor, sözcükleyici saymıyor.
- **Bulgu 2'nin ikinci yolu** Windows'a özgüdür: PowerShell'de `sort.exe` Windows `sort` aracıdır ve `/O` ile yazar.
- **PowerShell 5.1'de `&`, `&&` ve `||`:** Bölme bunları ayırıcı sayıyor, PowerShell 5.1 ise bu biçimleri ayrıştırma hatasıyla tümden reddediyor; hiçbir parça çalışmıyor. Güvenli yön. `; &` (çağırma işleci) iki ayırıcı yan yana geldiği için öğe birleşiyor ve tüm komut tek soruda gidiyor; bu da güvenli yön.
- **`2>&1`, `&>`, `|&`:** `2>&1` öğeyi bölmüyor, sol parça `npm test 2>&1` olarak gidiyor. `|&` ve `||` boru aşamalarında `null` dönüyor, tüm komut tek soruda gidiyor. Doğru.
- **Tırnak içi `;` ve `|`:** Bölünmüyor (`echo 'a; rm -rf src'; ls` iki parça). Doğru.
- **Heredoc, `$()`, ters tırnak, küme, alt kabuk:** Bölmüyor. Doğru.
- **`cmd /c "…"`:** Tırnak içi bölünmüyor; kesin yasak tırnak içini ayrıca tarıyor. Sorun bulunmadı.

---

## Şüpheler (bulgu sayılmadı)

1. **`tail -f` ve `less`/`more` ile bekleme:** `ls; cat a.txt | tail -f` → `izin`. Komut sonsuza dek bekleyebilir. Araç zaman aşımı bunu sınırlar; etkisi yalnızca ajan turunun boşa gitmesi. `tail` için `-f`/`-F`/`--follow` süzgeç sayılmasa yeter.
2. **`less` ortam değişkeni ile ön işleyici:** `LESSOPEN` tanımlıysa `less` dosya adıyla bir komut çalıştırır. Bu, komut metninden değil ortamdan gelir; ajan ortamında tanımlı olup olmadığına bakılmadı. Borunun sağındaki `less` dosya argümanı almadığında etkisizdir.
3. **Kalan öğelerin `"; "` ile birleşmesi:** Denetçi kısa yolunda kalan öğeler `ks.kalan.join("; ")` ile yeniden birleştiriliyor (`kapi.ts:301`). Özgün ayırıcı `&` ya da `||` ise Jev'e giden zincirin anlamı biraz değişiyor. Yalnızca yargı metnini etkiler; yürütülen komutu değiştirmez.
