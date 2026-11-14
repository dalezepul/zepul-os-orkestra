# Hata avı, 5. tur (K15)

- **Kapsam:** `bc484e8..94c580f`. Satır numaraları `94c580f` içindir; `e17e22f` yalnızca belge değiştirdi, `kapi.ts` aynı. İncelenenler:
  - `kapi.ts` içindeki katı alt küme okuyucusu `altKume`,
  - süzgeç beyaz listesi ve bayrak listeleri (`SUZGEC`, `suzgecMi`),
  - tek öğeli boru,
  - bağlamın ortadan kısaltılması (`kisalt`).
- **Yöntem:** Ana repoda yalnızca okuma yapıldı. Denemeler `%TEMP%\zepul-av5-kopya` klonunda koştu:
  - `deneme/av5.mts` ve `deneme/av5b.mts` gerçek `kapiKarari`'yı sahte bir Jev ile çalıştırıyor. Sahte Jev her şeye "güvenli 0,95" diyor ve kendisine sorulan parçayı kaydediyor.
  - Kabuk davranışı yalnızca zararsız komutlarla doğrulandı: `touch`, `echo`, `Out-File` ile kopya içinde dosya yazma, ve kopya içindeki sahte bir `grep` betiği.
  - Kopyada `test/kapi.test.ts` yeşil (36/36).

## Özet

| # | Mercek | Önem | Yer | Başlık |
|---|---|---|---|---|
| 1 | Güvenlik | yüksek | `kapi.ts:198-201`, `kapi.ts:228` | Bash'in `$'…'` dizgisinde `\'` tırnağı kapatmaz; okuyucu ise kapatır. Süzgeç sanılan aşama, kabuğun çalıştırdığı bir komutu Jev'e göstermeden taşıyor |
| 2 | Güvenlik | orta | `kapi.ts:178-182`, `kapi.ts:234` | Dizin ve ortam değiştirenler listesi eksik (`sal`, `nal`, `ni Env:`, `Set-Content Env:`, `nv`, `printf -v`, `read`). Atılan süzgeç adı başka bir komuta çözülebiliyor |

Sayım: yüksek 1, orta 1, düşük 0.

---

## Tur 4 bulgularının denetimi

| Tur 4 | Sonuç |
|---|---|
| B1 (yorumdaki tırnak, PS'te tek `\r`) | Düzeltilmiş. `KARAKTER` satır sonunu ve `\r`'yi dışarıda bırakıyor (`kapi.ts:176`). Tırnak dışında sözcük başındaki `#` alt küme dışı. Kopyada `ls; cat a \| grep x #'` tek soru oldu. |
| B2 (`uniq -`, `sort.exe /O`, yol önekli ad) | Düzeltilmiş. `uniq` listeden çıkmış. Ad tam eşleşiyor (`sort.exe`, `./araclar/tail` süzgeç değil). `sort` yalnızca `-[rnu]+` alıyor. |
| B3 (dizin/ortam değişimi, bağlam kesimi) | Kısmen. `DEGISTIREN` ve `kisalt` eklenmiş, ama liste eksik: bkz. Bulgu 2. |
| B4 (`>\|`) | Düzeltilmiş. `boruAsamalari` kaldırılmış; `altKume` `>\|` görünce null dönüyor (`kapi.ts:222`). |
| K26 mutlak hedef kısa yolu | Korunmuş. `kopyaIciSilme` ve `mutlakMi` değişmemiş. Kısa yol `kapiKarari` içinde ve parça başına `parcaliKarar` içinde çalışıyor. |
| Kesin yasak sırası | Korunmuş. `yasakKarari` önce tüm komuta (`kapi.ts:397`), sonra her parçaya (`kapi.ts:368`) uygulanıyor. Ardından kopya içi silme, sahiplik ve en son bölme geliyor. |

---

## Bulgu 1 (yüksek): Bash `$'…'` içindeki `\'`, okuyucu ile kabuğu ayrıştırıyor

**Yer:**
- `kapi.ts:198-201`: tek tırnak bir sonraki `'`'de kapanıyor.
- `kapi.ts:228`: tırnak dışındaki `$`, sözcüğü yalnızca `ozel` olarak işaretliyor; ilk aşamada bu bir engel değil.

**Açıklama:**
- Bash'te `$'…'` bir ANSI-C dizgisidir. İçindeki `\'` kaçışlı bir tırnaktır, dizgiyi kapatmaz.
- `altKume` ise `$`'ı sıradan bir karakter, ardından gelen `'…'`'yi de düz tek tırnak sayıyor. Tırnağı `\'` noktasında kapatıyor.
- Bu andan sonra iki taraf ters fazda kalıyor: okuyucunun tırnak içi saydığı metni kabuk tırnak dışı görüyor.
- `$'` ilk aşamada olduğunda sözcüğün `ozel` olması bir şey değiştirmiyor, çünkü `ozel` yalnızca süzgeç aşamasında denetleniyor. Böylece sonraki `grep '…'` aşaması tek desenli bir süzgeç gibi görünüp atılıyor.
- Kabuk ise o "desenin" içindeki komutu çalıştırıyor. Sondaki `#'`, kabuk için bir yorum, okuyucu için tırnak kapanışı; iki taraf da komutu dengeli buluyor.
- Gizli komut Jev'e parça olarak hiç gitmiyor; yalnızca "yalnızca yukarıdaki parçayı değerlendir" notuyla bağlamda görünüyor. Bağlam 1600 karakteri aşarsa `kisalt` ortayı attığından bağlamdan da düşebiliyor.
- Kesin yasak tüm komuta uygulandığı için yalnızca kesin yasak dışındaki komutlar etkileniyor. Yerel ajanda `izin` doğrudan `allow` oluyor.
- Tek öğeli boru da yeterli; `;` gerekmiyor.

**Kanıt:**

```
kapı (deneme/av5b.mts, sahte Jev):
Bash: echo $'\' | grep '; touch PWN #'        => izin | sorulan: ["echo $'\\'"]
Bash: ls; echo $'\' | grep '; touch PWN #'    => izin | sorulan: ["ls","echo $'\\'"]

kabuk (kopyada, Git Bash):
$ bash -c "echo \$'\\' | grep '; touch PWN #'"
' | grep
$ ls PWN
PWN            # gizli komut çalıştı
```

**Öneri:**
1. En dar düzeltme: bash lehçesinde tırnak dışında `'` ya da `"` karakterinden hemen önce `$` geliyorsa null dönülsün. `YASAK_DIZI` içine `\$'` eklenmesi de yeter; `$"` zararsız ama aynı kurala alınabilir.
2. Savunma derinliği: tırnak dışındaki `$` içeren her öğe bölünmesin (tümü tek soru). Bu, okuyucuyla kabuk arasındaki genişletme farklarını toptan kapatır.
3. Kırmızı test: yukarıdaki iki komut parça yoluna girmemeli.

---

## Bulgu 2 (orta): Dizin ve ortam değiştirenler listesi eksik; atılan süzgeç başka bir programa çözülebiliyor

**Yer:** `kapi.ts:178-182` (`DEGISTIREN`, `KABUK`), `kapi.ts:234`.

**Açıklama:** KURALLAR F'ye göre dizin ya da ortam değiştiren öğe varsa komut bölünmemeli. Liste kapalı bir ret listesi; aşağıdaki biçimler listede yok:

- **PowerShell 5.1 takma adları:**
  - `sal` (`Set-Alias`), `nal` (`New-Alias`)
  - `nv` (`New-Variable`), `rv`, `clv`
  - `ni Env:…` / `New-Item Env:…`
  - `Set-Content Env:…` (ya da `sc Env:`)
- **Bash:** `printf -v DEĞİŞKEN`, `read`, `mapfile`/`readarray`, `getopts`.

Bunun iki sonucu var:
1. Hata-avi-4 Bulgu 3 bu yollarla yeniden açılıyor.
2. Asıl tehlike: süzgeç adı (`grep`, `head`…) bir önceki öğede yeniden tanımlanabiliyor (takma ad ya da `PATH`). Süzgeç aşaması atıldığı için gerçekte çalışan program Jev'e hiç sorulmuyor. Örneğin `sal grep Out-File; Get-Content a.txt | grep hedef.txt` dosya yazıyor, ama Jev'e yalnızca `sal grep Out-File` ve `Get-Content a.txt` gidiyor. Tek başına bakılınca ikisi de zararsız görünür.

**Kanıt:**

```
kapı (deneme/av5.mts, sahte Jev):
PS:   sal grep Out-File; Get-Content a.txt | grep hedef.txt  => izin | sorulan: ["sal grep Out-File","Get-Content a.txt"]
PS:   nal grep Out-File; …                                    => izin | aynı
PS:   Set-Content Env:PATH C:/x; Get-Content a.txt | Select-Object -First 1 => izin | 2 parça
PS:   ni Env:PATH -Value C:/x -Force; …                       => izin | 2 parça
Bash: printf -v PATH %s /c/x/araclar; cat a.txt | grep x      => izin | sorulan: ["printf -v PATH …","cat a.txt"]
Bash: read -r P < yol.txt; cat a.txt | grep x                 => izin | 2 parça

kabuk (kopyada):
PS>  sal grep Out-File; 'veri' | grep av5-cikti.txt  → av5-cikti.txt yazıldı ("veri")
PS>  Set-Content Env:AV5 deger; $env:AV5             → deger
bash: printf -v PATH %s "$PWD/sahte:$PATH"; echo a | grep x  → SAHTE_GREP_CALISTI
```

**Öneri:**
1. Ret listesi yerine izin listesi kullanılsın: bölmeye yalnızca ilk sözcüğü bilinen, durum değiştirmeyen komutlar girsin (`ls`, `cat`, `git status` gibi). Bilinmeyen bir ilk sözcük gelirse tümü tek soru olsun. "Kapalı kapı" ilkesiyle uyumlu olan budur.
2. Kısa vadede listeye şunlar eklensin:
   - PowerShell: `sal`, `nal`, `nv`, `rv`, `clv`, `ipal`, `new-variable`, `remove-variable`, `clear-variable`, `import-alias`, `new-item`/`ni`, `set-content`/`sc`, `add-content`/`ac`, `new-psdrive`, `ndr`.
   - Bash: `printf`, `read`, `mapfile`, `readarray`, `getopts`.
   - Ayrıca herhangi bir sözcükte `env:`, `alias:`, `function:` ya da `variable:` sürücüsü geçiyorsa null dönülsün.
3. Kırmızı test: yukarıdaki komutlar parça yoluna girmemeli.

---

## Denenen ve kapalı bulunan biçimler

Aşağıdaki biçimlerin hepsi kopyada **tek soru** oldu (bölünmedi) ya da süzgeç sayılmadı:

- **Tırnak:**
  - Yorumdaki `'`.
  - PowerShell backtick kaçışı (`YASAK_DIZI`).
  - Akıllı tırnaklar ve Unicode noktalama (`\u02bc` bir harf olarak geçiyor ama kabukta da harf sayılıyor; zararsız).
  - `\u037e` (Yunan noktalı virgülü) ve `\u2028`.
- **Satır devamı ve boş öğe:** `\` + satır sonu; `;;`.
- **Gruplar ve işleçler:**
  - `{ …; }`, `( … )`.
  - `&`, `&>`, `; &` (PowerShell çağırma işleci).
  - `--%`.
- **Bash `!`:** `! ls; ls` bölünüyor ama `!` yalnızca çıkış kodunu tersine çeviriyor, parça Jev'e tam gidiyor; zararsız.
- **`^`:** PowerShell'de düz bir karakter; cmd lehçesi yok. Zararsız.
- **Süzgeç bayrakları:**
  - `grep --include=… y`, `grep -r`.
  - `tail -f`, `tail --follow`.
  - `Select-Object -ExpandProperty`, `Select-Object { … }`, `-Fi 1` (kısaltma), `-First:1`.
  - `findstr /F:`, `findstr /G:`.
  - `sort.exe /O`.
  - `Select-String x y` (ikinci konum argümanı `-Path`).

## Şüpheler (bulgu sayılmadı)

1. **Süzgeç adını taşıyan dosyayı `PATH` dizinine yazma:** Örnek: `cp betik ~/bin/grep; cat a | grep x`. Yazma parçası Jev'e gidiyor ve görünür, ama sonradan atılan `grep`'in o betiği çalıştıracağı Jev'e söylenmiyor. Bulgu 2'deki izin listesi önerisi bunu da daraltır.
2. **PowerShell `New-Item function:grep -Value '…'`:** Dizgi bir betik bloğuna dönüşüyor olabilir. Denenmedi; Bulgu 2'nin 2. önerisindeki `function:` sürücüsü kuralı bunu da kapatır.
3. **Bağlamın ortadan kısaltılması:** `kisalt` başı ve sonu koruyor, ortayı atıyor. Bulgu 1 gibi bir gizleme orta bölgeye denk gelirse Jev'e hiç görünmez. Kendi başına bir açık değil; Bulgu 1 kapanınca etkisi kalmıyor.
