# Hata avı, 8. tur (K15): kapı karar tablosu

- **Kapsam:** HEAD `15dad7a`. İncelenen dosyalar `sunucu/kapi.ts`, `sunucu/olay.ts` ve `sunucu/yol.ts`; ayrıca av7 düzeltmeleri (`git diff bfc1e13..15dad7a`). Satır numaraları `15dad7a` içindir.
- **Kural:** `KURALLAR.md` F: "Bileşik komut (kapalı kapı)" ve kesin yasak listesi.
- **Yöntem:**
  - Repo `%TEMP%\zepul-av8-kopya` klonuna alındı. Orada `deneme/av8.mts`, gerçek `kapiKarari`'yı sahte bir Jev ile çağırdı. Sahte Jev her parçaya "guvenli 0,95" döndü (RLH kümesinde hata attı) ve kendisine sorulan parçayı kaydetti.
  - Hiçbir kabuk komutu çalıştırılmadı; komut metinleri yalnızca girdi olarak verildi.
  - Etiketler, roller ve yer tutucular `test/kapi-karar-tablosu.test.ts` ile aynı. Ek etiketler (yalnızca RLH): `GEC` (Jev hatası, auto moda bırakıldı) ve `IZIN` (salt okuma).
- **Beklenen sütunu:** Kuralın birden çok karara izin verdiği satırlarda daha sıkı karar da kabul edildi (ör. `TEK|INSAN`). Uyuşmazlık yalnızca kurala aykırı yöndeki sonuçlarda sayıldı.

## Özet

| # | Önem | Yer | Başlık |
|---|---|---|---|
| 1 | yüksek | `kapi.ts:154`, `kapi.ts:158`, `olay.ts:184`, `olay.ts:292` | Virgülle birleşen `-` önekli hedef (PowerShell dizisi `'a','-x/..'`, Bash `"a",-x/..`) hedef sayılmıyor. Denetçide göreli ve kopya dışı silme Jev'e gitmeden kod izni alıyor; işçide kesin yasak yerine Jev |
| 2 | orta | `olay.ts:288`, `kapi.ts:161`, `kapi.ts:198` | Özyineli bayrak tanıma eksik: PowerShell tire benzerleri (`–` `—` `―`), `-r:$true`, `-re:$true`, `-r:1`, GNU `-dvfr` (4+ harf), `--r`, `--re`. Proje dışı özyineli silme kesin yasak yerine Jev'e gidiyor |
| 3 | düşük | `olay.ts:155`, `olay.ts:162` | Beş kat iç içe kaçışlı `npx -c` derinlik sınırını (4) aşıyor; içindeki `git push --force` RED yerine tek soru olarak Jev'e gidiyor |

Sayım: yüksek 1, orta 1, düşük 1.

**Örnek sayısı 424:**
- Yeni kümelerde 184 satır.
- Kalıcı tablodan seçilen 30 satırın özgün hâli yeniden çalıştırıldı (30 çağrı) ve 210 bozulmuş biçimi denendi.

Beklenenle uyuşmayan 24 satırın hepsi yukarıdaki üç bulguya düşüyor. Ayrıntı: Bulgu 1'de 8, Bulgu 2'de 14, Bulgu 3'te 2 satır.

Doğrudan izin alan (`KOD`) bulgu satırları yalnızca Bulgu 1'de var; beşi denetçi satırı. Bulgu 2 ve 3'te Jev'siz izin yok, tüm satırlar Jev'e gidiyor.

## Karar tablosu özeti

| Başlık | Örnek | Uyuşan | Not |
|---|---|---|---|
| Unicode benzer karakterler (U1) | 33 | 27 | Uyuşanlar: <br>• Tam genişlikli nokta `．`, U+2024, U+2025, sıfır genişlikli U+200B, U+200D, U+FEFF, tam genişlikli `／`, U+2215 ve birleşik işaretli ad silme ve worktree kısa yoluna girmiyor (`TEK`). <br>• Aynı karakterler `-C` değerinde ve ayırıcı benzerlerinde (`;` benzeri U+037E, U+3000) de `TEK` alıyor. <br>Uyuşmayan 6 satır PowerShell tire benzerleri; Bulgu 2. |
| Bileşen sınıfı dışı geçerli adlar (U2, yalnızca not) | 9 | 9 | Türkçe karakterli klasör (`çıktı`, `şube/ağaç`, `İ`, `ö`, `dal-ğ`), boşluklu ad ve `+` hepsi `TEK` alıyor. Kısa yoldan geçmiyorlar, normal yoldan Jev'e gidiyorlar. Bulgu değil. |
| `-Ad:değer`, `-Ad değer`, bayrak biçimleri (U3) | 40 | 26 | Uyuşanlar: <br>• `-LP:`, `-PSPath:`, `-L:`, büyük harfli `-LITERALPATH:` ve `-LiteralPath: '<ANA>'` (iki noktadan sonra boşluk) `INSAN`. <br>• Boşluklu `-LiteralPath '<ANA>'`, `-Path '<ANA>'`, `-Pa '<ANA>'` `INSAN`. <br>• `-Path '<KOPYA>/a'` `KOD`; `-Path:"…"`, `-Recurse:$true`, `-Exclude:x` `TEK`. <br>Uyuşmayan 14 satır: <br>• 8'i Bulgu 1 (dizi ve virgül). <br>• 6'sı Bulgu 2 (`-r:$true`, `-re:$true`, `-r:1`, `-dvfr`, `--r`, `--re`). |
| Birden fazla kaçış (U4) | 22 | 20 | Uyuşanlar: <br>• `git\ \ push`, `g\it\ pu\sh`, `-\-force`, `"git"\ push`, `git\ push' '--force` ve sekme kaçışı `RED`. <br>• `--call=npx\ -c\ git\\\ push…` ve PowerShell'de `` g`it` pu`sh ``, `` git` ` push `` de `RED`. <br>• 2, 3 ve 4 kat iç içe `npx -c` `RED`/`INSAN`. <br>Uyuşmayan 2 satır 5 kat iç içe; Bulgu 3. |
| Kesin yasağın alt komutlara gömülmesi (KY3) | 42 | 42 | Uyuşanlar: <br>• `git config alias.*` (`--global`, `--add`, `--file`, `set`, büyük harf `Alias.P`, PowerShell) ve `git config core.hooksPath` `RED`. <br>• `npm exec --`, `npm x --`, `npm exec --package -c`, `npx --yes`, `npx --yes -p git-credential-*`, `node --eval`, `node --eval=` ve `node -e … -- git …` içindeki yasak `RED` ya da `INSAN`. <br>• Silme ve worktree kısa yollarından sonra gelen gömülü yasak `RED`/`INSAN`. <br>• Zararsız `npx --yes cowsay`, `node --eval "console.log(1)"` `PARCA:2`. |
| Ajan ayrımı (RL) | 21 | 21 | Uyuşanlar: <br>• Kopya içi silme ve worktree kısa yolu yalnızca `denetci` rolünde `KOD`. Aynı girdi `isci` ve `sef` rolünde `INSAN` ya da `TEK`. <br>• `DENETCI`, `"denetci "` rolleri, boş kopya listesi ve kopya kökü olarak WT verilmesi kısa yolu açmıyor. |
| Jev hatası ve yerel model (RLH) | 17 | 17 | Uyuşanlar: <br>• Yerel ajanda Jev hatası her rolde insana gidiyor (`isci`, `sef`, `denetci`; tek ve bileşik kabuk, `WebFetch`, `Write`). `Read` salt okuma olarak `IZIN`. <br>• Yerel denetçinin kopya kısa yolları Jev'siz olduğu için `KOD` kalıyor. Kural gereği. <br>• Yerel olmayan ajanda Jev hatası: güvenli kabuk `GEC`; `rm`, `node -e fetch`, `iex` `INSAN`. |
| Kalıcı tablodan 30 satır, bozulmuş (BZ) | 210 | 210 | 30 satırın özgün hâli tabloyla birebir uyuştu. Uygulanan 7 bozulma: <br>• İki boşluk, sekme. <br>• Baştaki ya da sondaki boşluk. <br>• Sonda `;`. <br>• İlk sözcük büyük harf, tümü büyük harf. <br>Hiçbir bozulma kararı gevşetmedi (sıra: RED > INSAN > Jev > KOD). Sonda `;` ve büyük harf bazı `PARCA`/`KOD` satırlarını `TEK`'e çekti; bu daha sıkı yön. Seçilen satırlar: 3, 6, 9, 31, 39, 54, 58, 75, 84, 88, 89, 92, 114, 128, 131, 143, 149, 154, 158, 170, 192, 201, 240, 252, 287, 301, 311, 331, 337, 343. |

---

## Bulgu 1 (yüksek): Virgülle birleşen `-` önekli hedef hedef sayılmıyor

**Yer:**
- `olay.ts:184`: sözcükleyici `,` karakterini iki lehçede de sözcük ayırıcı sayıyor.
  - PowerShell'de `'a','-x/..'` iki öğeli bir dizidir; ikinci öğe parametre değil, **değerdir**, yani göreli bir yoldur.
  - Bash'te `"a",-x/..` tek bir sözcüktür: `a,-x/..`.
- `kapi.ts:158`: `hedef = arg.filter(… !a.startsWith("-"))`. Virgülden sonra gelen `-x/../../..` parçası bayrak sanılıp atılıyor.
- `kapi.ts:154`: `somut` denetiminde `,` yok; kısa yol tutuyor.
- `olay.ts:292`: kesin yasaktaki `hedefler` süzgeci de aynı biçimde. Bu yüzden işçide "proje dışı özyineli silme" yakalanmıyor.

**Karar tablosu:**

| Rol/araç | Girdi | Çıktı | Beklenen |
|---|---|---|---|
| denetçi/PowerShell | `Remove-Item -Recurse -Force '<KOPYA>/a','-x/../../..'` | izin, KOD, Jev: [] | INSAN |
| denetçi/PowerShell | `Remove-Item -Recurse -Force -Path '<KOPYA>/a','-x'` | izin, KOD, Jev: [] | TEK |
| denetçi/PowerShell | `rm -r -fo '<KOPYA>/a','-x\..\..'` | izin, KOD, Jev: [] | INSAN |
| denetçi/PowerShell | `mkdir '-x'; Remove-Item -Recurse -Force '<KOPYA>/a','-x/../../..'` | KOD+TEK, Jev: [`mkdir '-x'`] | INSAN |
| denetçi/Bash | `rm -rf "<KOPYA>/a",-x/../../../../zepul-av8-kopya` | izin, KOD, Jev: [] | INSAN |
| işçi/PowerShell | `Remove-Item -Recurse -Force a,'-x/../../..'` | gec, TEK | INSAN (kesin yasak) |
| işçi/PowerShell | `Remove-Item -Recurse -Force 'a','-x\..\..'` | gec, TEK | INSAN (kesin yasak) |
| işçi/Bash | `rm -rf a,-x/../../x` | gec, TEK | INSAN (kesin yasak) |

Gerçek hedefler:
- İlk satırda `<WT>/-x/../../..`, yani ana repo kökü.
- Dördüncü satırda `mkdir` aynı komutta ara dizini yaratıyor; Jev yalnızca `mkdir '-x'` parçasını görüyor.
- Beşinci satırda Bash yolu `<KOPYA>/a,-x/../../../../<repo>`, yani yine ana repo.

Kural, kısa yolu "her hedefi mutlak, `..` içermeyen ve kopya kökünün kesin altında" olan silmeye tanıyor. Bu girdilerde hedeflerden biri göreli ve kopya dışı, buna karşın Jev'e gitmeden izin alıyor.

**Öneri:**
1. `kapi.ts:154`: `somut` yasak karakterlerine `,` eklensin. Kısa yol tutmaz, komut normal yoldan gider. Bu tek değişiklik dört `KOD` ve bir `KOD+TEK` satırını kapatır.
2. `olay.ts:292`: `-` ile başlayan ama bayrak biçimine uymayan argüman hedef sayılsın. Örnek bayrak biçimi: `^--?[A-Za-z][\w-]*([:=].*)?$`. Böylece `-x/../..` ve `-x\..\..` hedef olur, `projeDisi`'ne girer. İşçide `INSAN` döner.
3. Kırmızı test: yukarıdaki sekiz satır.

---

## Bulgu 2 (orta): Özyineli bayrak tanıma eksik

**Yer:**
- `olay.ts:288`: `ozyineli` yalnızca üç biçimi tanıyor: `^--?rec`, `^-[a-z]{1,3}$` içinde `r`, ve `/s`.
- Aynı desen `kapi.ts:161` ve `kapi.ts:198`'de de var. Kısa yol için daha sıkı yönde çalışıyor (tutmuyor), sorun yok.

Tanınmayan geçerli biçimler:
- **PowerShell tire benzerleri:** PowerShell `–` (U+2013), `—` (U+2014) ve `―` (U+2015) karakterlerini parametre öneki sayar: `Remove-Item –Recurse`.
- **PowerShell kısaltma ve değer:** `-r:$true`, `-re:$true`, `-r:1`. `-r`, `Remove-Item`'da yalnızca `-Recurse`'e uyan bir kısaltmadır.
- **GNU rm, dört ve daha fazla harfli küme:** `-dvfr`.
- **GNU rm uzun seçenek kısaltması:** `--r` ve `--re`; ikisi de tekil önek olarak `--recursive` sayılır.

**Karar tablosu (belirtilmedikçe işçi):**

| Araç | Girdi | Çıktı | Beklenen |
|---|---|---|---|
| PowerShell | `Remove-Item –Recurse –Force C:/x` (U+2013) | gec, TEK | INSAN |
| PowerShell | `Remove-Item —Recurse —Force C:/x` (U+2014) | gec, TEK | INSAN |
| PowerShell | `Remove-Item ―Recurse -Force C:/x` (U+2015) | gec, TEK | INSAN |
| PowerShell | `ri –r –fo C:/x` | gec, TEK | INSAN |
| PowerShell | `rm –r -fo '<ANA>'` | gec, TEK | INSAN |
| PowerShell (denetçi) | `Remove-Item –Recurse –Force '<ANA>'` | gec, TEK | INSAN |
| PowerShell (denetçi) | `Remove-Item -r:$true -Force '<ANA>'` | gec, TEK | INSAN |
| PowerShell | `Remove-Item -r:$true -fo C:/x` | gec, TEK | INSAN |
| PowerShell | `Remove-Item -re:$true C:/x` | gec, TEK | INSAN |
| PowerShell | `rm -r:1 -fo C:/x` | gec, TEK | INSAN |
| Bash | `rm -dvfr /c/x` | gec, TEK | INSAN |
| Bash | `rm --r -f /c/x` | gec, TEK | INSAN |
| Bash | `rm --re -f /c/x` | gec, TEK | INSAN |
| Bash (denetçi) | `rm -dvfr "<ANA>"` | gec, TEK | INSAN |

`KOD` alan satır yok, hepsi Jev'e gidiyor. Ama kesin yasaktaki "proje dışında `rm -rf`" insan onayı atlanıyor.

**Öneri:**
1. Önce argümandaki `–`, `—` ve `―` öneki `-` olarak normalleştirilsin.
2. `ozyineli` deseni genişletilsin: `-` ile başlayıp `--` olmayan argümanda, `[:=]`'e kadar olan harf kümesinde `r`/`R` geçiyorsa (`^-[^-:=]*r`, büyük/küçük harf duyarsız) ya da argüman `^--r` ile başlıyorsa özyineli sayılsın.
   - `-Force` gibi bayraklar `r` içerdiği için yanlış pozitif verir. Bu insan onayı demektir, güvenli yön.
3. Aynı desen `kapi.ts:198` `ozyineliBayrak` ile tek yerde tutulsun.
4. Kırmızı test: yukarıdaki on dört satır.

---

## Bulgu 3 (düşük): İç içe kaçışta derinlik sınırı

**Yer:** `olay.ts:155` ve `olay.ts:162`: `derinlik < 4`. Beşinci katta sözcük yeniden taranmıyor, içindeki yasak görülmüyor.

**Karar tablosu (işçi/Bash):**

| Girdi | Çıktı | Beklenen |
|---|---|---|
| 5 kat `npx -c npx\ -c\ npx\\\ -c\\\ … git…\ push…\ --force` | gec, TEK | RED |
| 5 kat aynı biçim, `git reset --hard` | gec, TEK | INSAN |

4 kata kadar `RED`/`INSAN` dönüyor. 5 katta tek soru olarak Jev'e gidiyor; `KOD` yok.

**Öneri:**
1. Sınır sessizce geçilmesin. `derinlik` 4'e ulaştığında sözcük hâlâ boşluk ya da ayırıcı içeriyorsa kesin yasak `insan` dönsün (fail-closed, risk `yuksek`).
2. Kırmızı test: yukarıdaki iki satır.

---

## Not: bulgu sayılmayanlar

- **U2:** Türkçe karakterli, boşluklu ya da `+` içeren kopya altı adlar kısa yoldan geçmiyor, `TEK` alıyor. Bu kural gereği daha sıkı yön; yalnızca not.
- **Bash `rm -rf "<KOPYA>/a" "-x/../../.."`:** Bu satır `KOD` alıyor. Ancak GNU rm `-x…` argümanını geçersiz seçenek sayar ve hiçbir şey silmeden çıkar. Etkisi yok; Bulgu 1'in öneri 2'si bunu da kapatır.
- **`node --eval "require('fs').rmSync('C:/x',{recursive:true})"`:** Bu satır `TEK` alıyor. Kesin yasak metin düzeyinde betik içi silmeyi aramıyor; karar Jev'in.
- **PowerShell `` npx -c git`  push` --force ``:** Burada yalnızca ilk boşluk kaçışlı; `npx -c`'ye giden dize `"git "` olur. Push yok, `TEK` doğru. Kaçışın doğru yazımı `` git` ` push `` ise `RED` alıyor.

---

## Kalıcı tabloya eklenmeye hazır satırlar

Biçim `test/kapi-karar-tablosu.test.ts` `TABLO` ile aynı.
- `// av8: bugün X` yorumlu satırlar düzeltme sonrası beklenen kararı taşıyor. Bulgu 1, 2 ve 3 düzeltilene kadar kırmızı kalırlar.
- RL ve RLH kümelerinin 21 satırı (yerel bayrak, Jev hatası, `kopya_kokleri`, komut dışı girdi) burada yok. Bunlar için test düzeneğine `yerel`, `hata`, `kopya` ve `girdi` alanları gerekir. Satırlar `deneme/av8-satirlar.mts` içinde (kopyada).
- Bash virgül satırındaki `zepul-av8-kopya`, denemede repo klasörünün adıydı. Tabloya eklerken ana repo klasörünün adıyla değiştirilmeli (ör. `path.basename(KOK)` ile bir yer tutucu).

```ts
  { b: "U1", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/a\uFF0E\uFF0E/x\"", karar: "TEK", jev: ["rm -rf \"<KOPYA>/a\uFF0E\uFF0E/x\""] },
  { b: "U1", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/\uFF0E\uFF0E\"", karar: "TEK", jev: ["rm -rf \"<KOPYA>/\uFF0E\uFF0E\""] },
  { b: "U1", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/\u2024\u2024/x\"", karar: "TEK", jev: ["rm -rf \"<KOPYA>/\u2024\u2024/x\""] },
  { b: "U1", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/\u2025\"", karar: "TEK", jev: ["rm -rf \"<KOPYA>/\u2025\""] },
  { b: "U1", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/a\u200B\"", karar: "TEK", jev: ["rm -rf \"<KOPYA>/a\u200B\""] },
  { b: "U1", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/\u200B../x\"", karar: "TEK", jev: ["rm -rf \"<KOPYA>/\u200B../x\""] },
  { b: "U1", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/..\u200B/x\"", karar: "TEK", jev: ["rm -rf \"<KOPYA>/..\u200B/x\""] },
  { b: "U1", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/.\u200D./x\"", karar: "TEK", jev: ["rm -rf \"<KOPYA>/.\u200D./x\""] },
  { b: "U1", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/\uFEFF\"", karar: "INSAN", jev: [] },
  { b: "U1", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>\uFF0Fa\"", karar: "INSAN", jev: [] },
  { b: "U1", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>\u2215a\"", karar: "INSAN", jev: [] },
  { b: "U1", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/m\u0307\"", karar: "TEK", jev: ["rm -rf \"<KOPYA>/m\u0307\""] },
  { b: "U1", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/\uFF0E\uFF0E/x'", karar: "TEK", jev: ["Remove-Item -Recurse -Force '<KOPYA>/\uFF0E\uFF0E/x'"] },
  { b: "U1", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/\u2024\u2024'", karar: "TEK", jev: ["Remove-Item -Recurse -Force '<KOPYA>/\u2024\u2024'"] },
  { b: "U1", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/a\u200B'", karar: "TEK", jev: ["Remove-Item -Recurse -Force '<KOPYA>/a\u200B'"] },
  { b: "U1", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/\uFF0E\uFF0E/m1\"", karar: "TEK", jev: ["git worktree add \"<KOPYA>/\uFF0E\uFF0E/m1\""] },
  { b: "U1", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/\u2024\u2024\"", karar: "TEK", jev: ["git worktree add \"<KOPYA>/\u2024\u2024\""] },
  { b: "U1", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/m1\u200B\"", karar: "TEK", jev: ["git worktree add \"<KOPYA>/m1\u200B\""] },
  { b: "U1", rol: "denetci", arac: "Bash", girdi: "git -C \"<WT>/\u200B\" worktree add \"<KOPYA>/m1\"", karar: "TEK", jev: ["git -C \"<WT>/\u200B\" worktree add \"<KOPYA>/m1\""] },
  { b: "U1", rol: "denetci", arac: "Bash", girdi: "git -C \"<WT>/\uFF0E\uFF0E\" worktree add \"<KOPYA>/m1\"", karar: "TEK", jev: ["git -C \"<WT>/\uFF0E\uFF0E\" worktree add \"<KOPYA>/m1\""] },
  { b: "U1", rol: "isci", arac: "Bash", girdi: "ls; git\u200B push --force", karar: "TEK", jev: ["ls; git\u200B push --force"] },
  { b: "U1", rol: "isci", arac: "Bash", girdi: "ls; git push \uFF0D\uFF0Dforce", karar: "TEK", jev: ["ls; git push \uFF0D\uFF0Dforce"] },
  { b: "U1", rol: "isci", arac: "PowerShell", girdi: "ls; git status\u3000", karar: "TEK", jev: ["ls; git status\u3000"] },
  { b: "U1", rol: "isci", arac: "Bash", girdi: "ls\u037E git status", karar: "TEK", jev: ["ls\u037E git status"] },
  { b: "U1", rol: "isci", arac: "PowerShell", girdi: "Remove-Item \u2013Recurse \u2013Force C:/x", karar: "INSAN", jev: [] }, // av8: bugün TEK
  { b: "U1", rol: "isci", arac: "PowerShell", girdi: "Remove-Item \u2014Recurse \u2014Force C:/x", karar: "INSAN", jev: [] }, // av8: bugün TEK
  { b: "U1", rol: "isci", arac: "PowerShell", girdi: "Remove-Item \u2015Recurse -Force C:/x", karar: "INSAN", jev: [] }, // av8: bugün TEK
  { b: "U1", rol: "isci", arac: "PowerShell", girdi: "ri \u2013r \u2013fo C:/x", karar: "INSAN", jev: [] }, // av8: bugün TEK
  { b: "U1", rol: "isci", arac: "PowerShell", girdi: "rm \u2013r -fo '<ANA>'", karar: "INSAN", jev: [] }, // av8: bugün TEK
  { b: "U1", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item \u2013Recurse \u2013Force '<ANA>'", karar: "INSAN", jev: [] }, // av8: bugün TEK
  { b: "U1", rol: "isci", arac: "PowerShell", girdi: "Remove-Item -Recurse \u2013Force C:/x", karar: "INSAN", jev: [] },
  { b: "U1", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item \u2013Recurse \u2013Force '<KOPYA>/a'", karar: "TEK", jev: ["Remove-Item \u2013Recurse \u2013Force '<KOPYA>/a'"] },
  { b: "U1", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/a' \u2013LiteralPath:'<ANA>'", karar: "TEK", jev: ["Remove-Item -Recurse -Force '<KOPYA>/a' \u2013LiteralPath:'<ANA>'"] },
  { b: "U2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/çıktı\"", karar: "TEK", jev: ["rm -rf \"<KOPYA>/çıktı\""] },
  { b: "U2", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/şube/ağaç'", karar: "TEK", jev: ["Remove-Item -Recurse -Force '<KOPYA>/şube/ağaç'"] },
  { b: "U2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/İ\"", karar: "TEK", jev: ["rm -rf \"<KOPYA>/İ\""] },
  { b: "U2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/a b\"", karar: "TEK", jev: ["rm -rf \"<KOPYA>/a b\""] },
  { b: "U2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/a+b\"", karar: "TEK", jev: ["rm -rf \"<KOPYA>/a+b\""] },
  { b: "U2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/çıktı\"; ls", karar: "TEK", jev: ["rm -rf \"<KOPYA>/çıktı\"; ls"] },
  { b: "U2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/a\" \"<KOPYA>/ö\"", karar: "TEK", jev: ["rm -rf \"<KOPYA>/a\" \"<KOPYA>/ö\""] },
  { b: "U2", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/dal-ğ\"", karar: "TEK", jev: ["git worktree add \"<KOPYA>/dal-ğ\""] },
  { b: "U2", rol: "denetci", arac: "PowerShell", girdi: "git worktree add '<KOPYA>/şube' HEAD", karar: "TEK", jev: ["git worktree add '<KOPYA>/şube' HEAD"] },
  { b: "U3", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/a' -LP:'<ANA>'", karar: "INSAN", jev: [] },
  { b: "U3", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/a' -PSPath:'<ANA>'", karar: "INSAN", jev: [] },
  { b: "U3", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/a' -L:'<ANA>'", karar: "INSAN", jev: [] },
  { b: "U3", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/a' -LITERALPATH:'<ANA>'", karar: "INSAN", jev: [] },
  { b: "U3", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/a' -LiteralPath: '<ANA>'", karar: "INSAN", jev: [] },
  { b: "U3", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/a' -LiteralPath '<ANA>'", karar: "INSAN", jev: [] },
  { b: "U3", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/a' -Path '<ANA>'", karar: "INSAN", jev: [] },
  { b: "U3", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/a' -Pa '<ANA>'", karar: "INSAN", jev: [] },
  { b: "U3", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force -Path '<KOPYA>/a'", karar: "KOD", jev: [] },
  { b: "U3", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force -LiteralPath '<KOPYA>/a'", karar: "KOD", jev: [] },
  { b: "U3", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force -Path:\"<KOPYA>/a\"", karar: "TEK", jev: ["Remove-Item -Recurse -Force -Path:\"<KOPYA>/a\""] },
  { b: "U3", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force -Path:<KOPYA\\>\\a", karar: "TEK", jev: ["Remove-Item -Recurse -Force -Path:<KOPYA\\>\\a"] },
  { b: "U3", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse:$true -Force '<KOPYA>/a'", karar: "TEK", jev: ["Remove-Item -Recurse:$true -Force '<KOPYA>/a'"] },
  { b: "U3", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/a' -Exclude:x", karar: "TEK", jev: ["Remove-Item -Recurse -Force '<KOPYA>/a' -Exclude:x"] },
  { b: "U3", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse:$true -Force '<ANA>'", karar: "INSAN", jev: [] },
  { b: "U3", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -r:$true -Force '<ANA>'", karar: "INSAN", jev: [] }, // av8: bugün TEK
  { b: "U3", rol: "isci", arac: "PowerShell", girdi: "Remove-Item -r:$true -fo C:/x", karar: "INSAN", jev: [] }, // av8: bugün TEK
  { b: "U3", rol: "isci", arac: "PowerShell", girdi: "Remove-Item -Rec:$true -fo C:/x", karar: "INSAN", jev: [] },
  { b: "U3", rol: "isci", arac: "PowerShell", girdi: "Remove-Item -re:$true C:/x", karar: "INSAN", jev: [] }, // av8: bugün TEK
  { b: "U3", rol: "isci", arac: "PowerShell", girdi: "rm -r:1 -fo C:/x", karar: "INSAN", jev: [] }, // av8: bugün TEK
  { b: "U3", rol: "isci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force -Path: C:/x", karar: "INSAN", jev: [] },
  { b: "U3", rol: "isci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force a -LP:C:/x", karar: "INSAN", jev: [] },
  { b: "U3", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/a','-x/../../..'", karar: "INSAN", jev: [] }, // av8: bugün KOD
  { b: "U3", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force -Path '<KOPYA>/a','-x'", karar: "TEK", jev: ["Remove-Item -Recurse -Force -Path '<KOPYA>/a','-x'"] }, // av8: bugün KOD
  { b: "U3", rol: "denetci", arac: "PowerShell", girdi: "rm -r -fo '<KOPYA>/a','-x\\..\\..'", karar: "INSAN", jev: [] }, // av8: bugün KOD
  { b: "U3", rol: "denetci", arac: "PowerShell", girdi: "mkdir '-x'; Remove-Item -Recurse -Force '<KOPYA>/a','-x/../../..'", karar: "INSAN", jev: [] }, // av8: bugün KOD+TEK
  { b: "U3", rol: "isci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force a,'-x/../../..'", karar: "INSAN", jev: [] }, // av8: bugün TEK
  { b: "U3", rol: "isci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force 'a','-x\\..\\..'", karar: "INSAN", jev: [] }, // av8: bugün TEK
  { b: "U3", rol: "isci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '-x/../..'", karar: "INSAN", jev: [] },
  { b: "U3", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/a\" \"-x/../../..\"", karar: "KOD", jev: [] },
  { b: "U3", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/a\",-x/../../../../zepul-av8-kopya", karar: "INSAN", jev: [] }, // av8: bugün KOD
  { b: "U3", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/a,\"-x/../../../../zepul-av8-kopya", karar: "INSAN", jev: [] },
  { b: "U3", rol: "isci", arac: "Bash", girdi: "rm -rf a,-x/../../x", karar: "INSAN", jev: [] }, // av8: bugün TEK
  { b: "U3", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/a\",b", karar: "TEK", jev: ["rm -rf \"<KOPYA>/a\",b"] },
  { b: "U3", rol: "isci", arac: "Bash", girdi: "rm -dvfr /c/x", karar: "INSAN", jev: [] }, // av8: bugün TEK
  { b: "U3", rol: "isci", arac: "Bash", girdi: "rm --r -f /c/x", karar: "INSAN", jev: [] }, // av8: bugün TEK
  { b: "U3", rol: "isci", arac: "Bash", girdi: "rm --re -f /c/x", karar: "INSAN", jev: [] }, // av8: bugün TEK
  { b: "U3", rol: "isci", arac: "Bash", girdi: "rm -vRf /c/x", karar: "INSAN", jev: [] },
  { b: "U3", rol: "denetci", arac: "Bash", girdi: "rm -dvfr \"<ANA>\"", karar: "INSAN", jev: [] }, // av8: bugün TEK
  { b: "U3", rol: "denetci", arac: "Bash", girdi: "rm -dvfr \"<KOPYA>/a\"", karar: "TEK", jev: ["rm -dvfr \"<KOPYA>/a\""] },
  { b: "U4", rol: "isci", arac: "Bash", girdi: "npx -c git\\ \\ push\\ \\ --force", karar: "RED", jev: [] },
  { b: "U4", rol: "isci", arac: "Bash", girdi: "npx -c g\\it\\ pu\\sh\\ --for\\ce", karar: "RED", jev: [] },
  { b: "U4", rol: "isci", arac: "Bash", girdi: "npx -c git\\ push\\ -\\-force", karar: "RED", jev: [] },
  { b: "U4", rol: "isci", arac: "Bash", girdi: "npx -c \"git\"\\ push\\ --force", karar: "RED", jev: [] },
  { b: "U4", rol: "isci", arac: "Bash", girdi: "npx -c git\\ push' '--force", karar: "RED", jev: [] },
  { b: "U4", rol: "isci", arac: "Bash", girdi: "npx -c \"npx -c git\\\\ push\\\\ --force\"", karar: "RED", jev: [] },
  { b: "U4", rol: "isci", arac: "Bash", girdi: "ls; npx -c git\\ reset\\ --hard\\ \\&\\&\\ ls", karar: "INSAN", jev: [] },
  { b: "U4", rol: "isci", arac: "Bash", girdi: "npx -c git\\\tpush\\\t--force", karar: "RED", jev: [] },
  { b: "U4", rol: "isci", arac: "Bash", girdi: "npm exec --call=npx\\ -c\\ git\\\\\\ push\\\\\\ --force", karar: "RED", jev: [] },
  { b: "U4", rol: "isci", arac: "Bash", girdi: "npm exec --call=git\\ clean\\ -fd", karar: "INSAN", jev: [] },
  { b: "U4", rol: "isci", arac: "PowerShell", girdi: "npx -c git`  push` --force", karar: "TEK", jev: ["npx -c git`  push` --force"] },
  { b: "U4", rol: "isci", arac: "PowerShell", girdi: "npx -c git` ` push` --force", karar: "RED", jev: [] },
  { b: "U4", rol: "isci", arac: "PowerShell", girdi: "npx -c g`it` pu`sh` --force", karar: "RED", jev: [] },
  { b: "U4", rol: "isci", arac: "PowerShell", girdi: "npx -c git` reset` --hard; ls", karar: "INSAN", jev: [] },
  { b: "U4", rol: "isci", arac: "PowerShell", girdi: "npx -c \"npx -c git`` push`` --force\"", karar: "RED", jev: [] },
  { b: "U4", rol: "isci", arac: "Bash", girdi: "npx -c npx\\ -c\\ git\\\\\\ push\\\\\\ --force", karar: "RED", jev: [] },
  { b: "U4", rol: "isci", arac: "Bash", girdi: "npx -c npx\\ -c\\ npx\\\\\\ -c\\\\\\ git\\\\\\\\\\\\\\ push\\\\\\\\\\\\\\ --force", karar: "RED", jev: [] },
  { b: "U4", rol: "isci", arac: "Bash", girdi: "npx -c npx\\ -c\\ npx\\\\\\ -c\\\\\\ npx\\\\\\\\\\\\\\ -c\\\\\\\\\\\\\\ git\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ push\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ --force", karar: "RED", jev: [] },
  { b: "U4", rol: "isci", arac: "Bash", girdi: "npx -c npx\\ -c\\ npx\\\\\\ -c\\\\\\ npx\\\\\\\\\\\\\\ -c\\\\\\\\\\\\\\ npx\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ -c\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ git\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ push\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ --force", karar: "RED", jev: [] }, // av8: bugün TEK
  { b: "U4", rol: "isci", arac: "Bash", girdi: "npx -c npx\\ -c\\ npx\\\\\\ -c\\\\\\ npx\\\\\\\\\\\\\\ -c\\\\\\\\\\\\\\ npx\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ -c\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ git\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ reset\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ --hard", karar: "INSAN", jev: [] }, // av8: bugün TEK
  { b: "U4", rol: "isci", arac: "Bash", girdi: "npx -c npx\\ -c\\ npx\\\\\\ -c\\\\\\ git\\\\\\\\\\\\\\ reset\\\\\\\\\\\\\\ --hard", karar: "INSAN", jev: [] },
  { b: "U4", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/a\"; npx -c g\\it\\ pu\\sh\\ -f", karar: "RED", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "git config alias.p \"push --force\"", karar: "RED", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "git config --global alias.st status", karar: "RED", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "git config alias.x '!rm -rf C:/'", karar: "RED", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "git config set alias.p push", karar: "RED", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "git config --add alias.p push; ls", karar: "RED", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "git config --file x.cfg alias.p push", karar: "RED", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "ls && git config Alias.P push", karar: "RED", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "git config core.hooksPath x", karar: "RED", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "git -c alias.p=push p --force", karar: "RED", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "git config --unset alias.p", karar: "RED", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "git config --get alias.p", karar: "TEK", jev: ["git config --get alias.p"] },
  { b: "KY3", rol: "isci", arac: "PowerShell", girdi: "git config alias.p 'push --force'", karar: "RED", jev: [] },
  { b: "KY3", rol: "isci", arac: "PowerShell", girdi: "ls; git config alias.p push", karar: "RED", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "npm exec -- git -C C:/x reset --hard", karar: "INSAN", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "npm exec --yes -- git push -f", karar: "RED", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "npm x -- git clean -fd", karar: "INSAN", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "npm exec --package=x -c \"git push --force\"", karar: "RED", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "npm exec -c 'git -c alias.a=b a'", karar: "RED", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "npm exec -- rm -rf C:/x", karar: "INSAN", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "npm exec -- npx -c \"git reset --hard\"", karar: "INSAN", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "npm exec -c \"git push --force\" --yes", karar: "RED", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "npm exec -- node -e \"require('child_process').execSync('git push --force')\"", karar: "RED", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "npx --yes git push --force", karar: "RED", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "npx --yes -- git clean -fd; ls", karar: "INSAN", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "npx --yes -p git-credential-manager x", karar: "RED", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "npx -y rm -rf C:/x", karar: "INSAN", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "npx --yes --package git push --force", karar: "RED", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "npx --yes cowsay hi; ls", karar: "PARCA:2", jev: ["npx --yes cowsay hi","ls"] },
  { b: "KY3", rol: "isci", arac: "PowerShell", girdi: "npx --yes -c 'git reset --hard'", karar: "INSAN", jev: [] },
  { b: "KY3", rol: "isci", arac: "PowerShell", girdi: "npx --yes git push -f; ls", karar: "RED", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "node --eval \"require('child_process').execSync('git push --force')\"", karar: "RED", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "node --eval=\"require('child_process').execSync('git clean -fd')\"", karar: "INSAN", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "node --eval 'x' -- git reset --hard", karar: "INSAN", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "node -e \"require('child_process').execSync('rm -rf C:/x')\"", karar: "INSAN", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "node --eval \"x\"; git push -f", karar: "RED", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "node --eval \"require('fs').rmSync('C:/x',{recursive:true})\"", karar: "TEK", jev: ["node --eval \"require('fs').rmSync('C:/x',{recursive:true})\""] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "node --eval \"console.log(1)\"; ls", karar: "PARCA:2", jev: ["node --eval \"console.log(1)\"","ls"] },
  { b: "KY3", rol: "isci", arac: "PowerShell", girdi: "node --eval \"require('child_process').execSync('git push --force')\"", karar: "RED", jev: [] },
  { b: "KY3", rol: "isci", arac: "PowerShell", girdi: "node --eval \"require('child_process').execSync('git reset --hard')\"; ls", karar: "INSAN", jev: [] },
  { b: "KY3", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/m1\" HEAD; git config alias.p push", karar: "RED", jev: [] },
  { b: "KY3", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/a\"; npx --yes -- git clean -fd", karar: "INSAN", jev: [] },
  { b: "KY3", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/a'; node --eval \"require('child_process').execSync('git push -f')\"", karar: "RED", jev: [] },
  { b: "RL", rol: "isci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/m1/dist\"", karar: "INSAN", jev: [] },
  { b: "RL", rol: "sef", arac: "Bash", girdi: "rm -rf \"<KOPYA>/m1/dist\"", karar: "INSAN", jev: [] },
  { b: "RL", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/m1/dist\"", karar: "KOD", jev: [] },
  { b: "RL", rol: "isci", arac: "Bash", girdi: "git worktree add --detach \"<KOPYA>/m1\" HEAD", karar: "TEK", jev: ["git worktree add --detach \"<KOPYA>/m1\" HEAD"] },
  { b: "RL", rol: "sef", arac: "Bash", girdi: "git worktree add --detach \"<KOPYA>/m1\" HEAD", karar: "TEK", jev: ["git worktree add --detach \"<KOPYA>/m1\" HEAD"] },
  { b: "RL", rol: "denetci", arac: "Bash", girdi: "git worktree add --detach \"<KOPYA>/m1\" HEAD", karar: "KOD", jev: [] },
  { b: "RL", rol: "isci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/a'; ls", karar: "INSAN", jev: [] },
  { b: "RL", rol: "sef", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/a'; ls", karar: "INSAN", jev: [] },
  { b: "RL", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/a'; ls", karar: "KOD+TEK", jev: ["ls"] },
  { b: "RL", rol: "isci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/a\"; git worktree add \"<KOPYA>/m1\" HEAD", karar: "INSAN", jev: [] },
  { b: "RL", rol: "sef", arac: "Bash", girdi: "rm -rf \"<KOPYA>/a\"; git worktree add \"<KOPYA>/m1\" HEAD", karar: "INSAN", jev: [] },
  { b: "RL", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/a\"; git worktree add \"<KOPYA>/m1\" HEAD", karar: "KOD+TEK", jev: ["git worktree add \"<KOPYA>/m1\" HEAD"] },
  { b: "RL", rol: "isci", arac: "Bash", girdi: "ls; git status", karar: "PARCA:2", jev: ["ls","git status"] },
  { b: "RL", rol: "sef", arac: "Bash", girdi: "ls; git status", karar: "PARCA:2", jev: ["ls","git status"] },
  { b: "RL", rol: "denetci", arac: "Bash", girdi: "ls; git status", karar: "PARCA:2", jev: ["ls","git status"] },
  { b: "RL", rol: "DENETCI", arac: "Bash", girdi: "rm -rf \"<KOPYA>/a\"", karar: "INSAN", jev: [] },
  { b: "RL", rol: "denetci ", arac: "Bash", girdi: "rm -rf \"<KOPYA>/a\"", karar: "INSAN", jev: [] },
```
