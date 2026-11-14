# Hata avı, 7. tur (K15): kapı karar tablosu

- **Kapsam:** HEAD `ac96796`. İncelenen dosyalar `sunucu/kapi.ts`, `sunucu/olay.ts` (kesin yasak sözcükleyicisi) ve `sunucu/yol.ts` (`kanonik`). Satır numaraları `ac96796` içindir.
- **Kural:** `KURALLAR.md` F, "Bileşik komut (kapalı kapı)" ve kesin yasak listesi.
- **Yöntem:**
  - Repo `%TEMP%\zepul-av7-kopya` klonuna alındı.
  - Orada `deneme/av7.mts` gerçek `kapiKarari`'yı sahte bir Jev ile çağırdı. Sahte Jev her parçaya "guvenli 0,95" döndü ve kendisine sorulan parçayı kaydetti.
  - Hiçbir kabuk komutu çalıştırılmadı; komut metinleri yalnızca girdi olarak verildi.
  - Kalıcı tablonun 99 örneği tekrar edilmedi.
  - Etiketler ve roller `test/kapi-karar-tablosu.test.ts` ile aynı.
- **Yeni yer tutucular:**
  - `<KOPYA\>`: kopya kökünün ters bölülü yazımı.
  - `<KOPYA_UP>` ve `<KOPYA_LO>`: büyük ve küçük harf yazımı.
  - `<KOPYA_GB>`: Git Bash yazımı (`/c/...`).
  - `<TEMP>`: repo kökünün üst dizini.
- **Beklenen sütunu:** Kuralın birden çok karara izin verdiği satırlarda (ör. daha sıkı `INSAN`) hepsi kabul edildi. Uyuşmazlık yalnızca kurala aykırı yöndeki sonuçlarda sayıldı.

## Özet

| # | Önem | Yer | Başlık |
|---|---|---|---|
| 1 | yüksek | `kapi.ts:145`, `yol.ts:14`, `yol.ts:28` | Yalnız nokta ya da sonda boşluk içeren yol bileşeni (`...`, `.. `) `..` sayılmıyor. Silme ve worktree kısa yolu Jev'e gitmeden kod izni veriyor |
| 2 | yüksek | `kapi.ts:154`, `olay.ts:281` | PowerShell'in `-Param:değer` biçimindeki silme hedefi hedef sayılmıyor. Denetçide kod izni, işçide kesin yasak yerine Jev |
| 3 | orta | `olay.ts:152-160` | Kaçışla ya da bitişik tırnakla birleşen sözcük kesin yasakta yeniden taranmıyor. Eşdeğer tırnaklı yazım `RED`/`INSAN` dönüyor, kaçışlı yazım Jev'e gidiyor |
| 4 | düşük | `kapi.ts:154` | `--` sonrasında `-` ile başlayan işlenen silme hedefi sayılmıyor; göreli hedef kod izni alıyor |

Sayım: yüksek 2, orta 1, düşük 1. Örnek sayısı 248.

Beklenenle uyuşmayan 22 satır var:
- 21'i yukarıdaki dört bulguya düşüyor.
- 1'i şüphe olarak ayrıldı, bulgu sayılmadı (aşağıda).

Kalıcı tabloda karşılığı olmayan yeni bir lehçe ya da ayırıcı açığı bulunmadı: L1 ve L2 kümelerinin 60 örneğinin hepsi uyuştu.

## Karar tablosu özeti

| Başlık | Örnek | Uyuşan | Not |
|---|---|---|---|
| PowerShell lehçesi (L1) | 42 | 42 | Aşağıdakilerin hepsi `TEK`: satır sonu (`\n`, `\r\n`), `(…)`, `$(…)`, `@(…)`, `{…}`, `&` çağrı işleci, `.` nokta kaynağı, `--%`, backtick, tırnak dışı virgül, `#` ve `<# #>` yorumu, `$null`, akıllı tırnak, en tire, NBSP, `[IO.File]::`, `sal`, `function`, `iex`. `;`, `&&`, `\|\|` (PS 7) ve süzgeçli `\|` `PARCA`. Çift tırnak kaçışı (`'a'';ls;''b'`, `"a"";ls;""b"`) yanlış bölünmüyor. |
| cmd ve bash ayırıcıları (L2) | 18 | 18 | Hepsi `TEK`: tek `&`, `^&`, `cmd /c`, `cmd.exe /c`, satır sonu, sondaki `&`, `(…)`, `{ …; }`, `\|&`, `>\|`, `.`, `source`, `exec`, `command`, `<<<`. `%PATH%` Bash'te düz metin, `PARCA:2`. `cmd /c rd /s /q C:\x` `INSAN`. |
| Silme kısa yolu sınırları (SL2) | 52 | 45 | Kurala uyanlar: <br>• Büyük/küçük harf, `\` ayraç, Git Bash yazımı `KOD`. <br>• Bash'te tırnaksız `\` `TEK`. <br>• 8.3 kısa adı ve UNC `INSAN` ya da `TEK`. <br>• `C$` `RED`. <br>• Kopya kökünün kendisi `INSAN`: sonda `/`, `\`, `/.`, `/./`, `//`, `.` ya da boşlukla yazılsa da. <br>• `~`, `command rm` ve ikinci mutlak hedef `INSAN`. <br>Uyuşmayan 7 satır Bulgu 1, 2 ve 4'e düşüyor. |
| Worktree kısa yolu sınırları (WT2) | 59 | 56 | Kurala uyanlar: <br>• `add`'in bütün seçenekleri (`-f`, `--force`, `-b`, `-B`, `--lock`, `--reason`, `--no-checkout`, `-q`, `--track`, `--guess-remote`, `--orphan`, `--relative-paths`, ikinci `--detach`) `TEK`. <br>• Tireli ref (`\-b`, `` `-b ``) `TEK`. <br>• Kopya kökünün kendisi, `&`, satır sonu, `--%`, `*>&1`, atama ve işçi rolü `TEK`. <br>Uyuşmayan 3 satır Bulgu 1'e düşüyor. |
| İzin listesindeki seçenekler (IL) | 45 | 42 | `git -c`, `--exec-path=`, `--git-dir`, `-C`, `--namespace`, `--work-tree`, `--bare`, `npm --prefix`, `-C`, `node --require`, `-r`, `--import`, `tsx --require`: hepsi ayrı parça olarak Jev'e gidiyor (`PARCA`), hiçbiri `KOD` değil. Tehlikeli `-c` anahtarları `RED`. `-C`/`--git-dir` ile `reset --hard`/`clean` `INSAN`. Tırnaklı `npx -c "…"`, `--call="…"` ve `node -e "…"` içindeki yasak yakalanıyor. 2 satır Bulgu 3, 1 satır şüphe. |
| Kesin yasağı gömme (KY2) | 32 | 23 | `.env`, `HEAD:.env`, `\| sh`, `GIT_SSH_COMMAND=`, `GIT_ASKPASS` ve `test`/`[`/`mkdir` ardındaki yasak yakalanıyor. Silme ve worktree kısa yollarından sonra gelen yasak `RED` dönüyor. 7 satır Bulgu 3, 2 satır Bulgu 2. |

---

## Bulgu 1 (yüksek): Yalnız nokta ya da sonda boşluk içeren bileşen `..` sayılmıyor

**Yer:**
- `kapi.ts:145`: `mutlakMi` yalnızca tam `..` bileşenini reddediyor (`(^|[\\/])\.\.([\\/]|$)`). `...` ve `.. ` (sonda boşluk) bu denetimden geçiyor.
- `yol.ts:28`: `coz`, bileşenin sonundaki nokta ve boşluğu atıyor. Bileşen yalnız nokta ve boşluktan oluşuyorsa `|| p` ile özgün hâline dönüyor; böylece `...` ve `.. ` sıradan bir alt dizin adı gibi kalıyor.
- `yol.ts:14`: yolun tamamı `trim` ediliyor. Bu yüzden sondaki `.. ` yakalanıyor (`rm -rf "<KOPYA>/.. "` `INSAN`), yolun ortasındaki `.. /x` yakalanmıyor.
- Aynı denetim worktree kısa yolunda da kullanılıyor (`kapi.ts:184`, `kapi.ts:188` → `kopyaAltinda`).

**Karar tablosu (denetçi):**

| Araç | Girdi | Çıktı | Beklenen |
|---|---|---|---|
| Bash | `rm -rf "<KOPYA>/..."` | izin, KOD, Jev: [] | TEK |
| Bash | `rm -rf "<KOPYA>/.../x"` | izin, KOD, Jev: [] | TEK |
| Bash | `rm -rf "<KOPYA>/a/.. /.. /x"` | izin, KOD, Jev: [] | TEK |
| PowerShell | `Remove-Item -Recurse -Force '<KOPYA>/.. /x'` | izin, KOD, Jev: [] | TEK |
| Bash | `git worktree add "<KOPYA>/..."` | izin, KOD, Jev: [] | TEK |
| Bash | `git worktree add "<KOPYA>/.. /x"` | izin, KOD, Jev: [] | TEK |
| Bash | `git -C "<WT>/..." worktree add "<KOPYA>/m1"` | izin, KOD, Jev: [] | TEK |

Kural kısa yolu "mutlak, `..` içermeyen hedefe" tanıyor. Bu girdilerde hedef metni `..` içeriyor, buna karşın Jev'e gitmeden izin alıyor.

**Öneri:**
1. `mutlakMi` yalnızca nokta ve boşluktan oluşan her bileşeni reddetsin (tek `.` dahil, daha sıkı ve basit). Ayrıca nokta ya da boşlukla biten her bileşeni de reddetsin. Örnek: `!/(^|[\\/])[. ]*\.[. ]*([\\/]|$)/.test(h) && !/[ .]([\\/]|$)/.test(h)`.
2. Böylece silme, worktree hedefi ve `-C` değeri aynı yerden kapanır.
3. Kalıcı tablodaki `rm -rf "<KOPYA>/m1/."` satırı bu durumda `TEK` olur. Bu daha sıkı yöndedir.
4. Kırmızı test: yukarıdaki yedi satır.

---

## Bulgu 2 (yüksek): PowerShell `-Param:değer` biçimli silme hedefi hedef sayılmıyor

**Yer:**
- `kapi.ts:154`: `hedef = arg.filter((a) => !a.startsWith("-"))`. `-LiteralPath:'X'` ve `-Path:'X'` tek sözcük olarak tümüyle atılıyor; içindeki yol hiç denetlenmiyor.
- `olay.ts:281`: kesin yasaktaki `hedefler` süzgeci de aynı biçimde. Bu yüzden işçide de "proje dışında özyineli silme" yakalanmıyor.
- Tek başına `-Path:'<ANA>'` yakalanıyor (hedef listesi boş kaldığı için). Açık yalnızca yanında konumsal bir hedef bulunduğunda oluşuyor.

**Karar tablosu:**

| Rol | Girdi | Çıktı | Beklenen |
|---|---|---|---|
| denetçi | `Remove-Item -Recurse -Force '<KOPYA>/a' -LiteralPath:'<ANA>'` | izin, KOD, Jev: [] | INSAN |
| denetçi | `Remove-Item -Recurse -Force '<KOPYA>/a' -Path:'<ANA>'` | izin, KOD, Jev: [] | INSAN |
| işçi | `Remove-Item -Recurse -Force a -LiteralPath:'C:/'` | gec, TEK (Jev) | INSAN (kesin yasak) |
| işçi | `Remove-Item -Recurse -Force a -Path:C:/` | gec, TEK (Jev) | INSAN (kesin yasak) |

**Öneri:**
1. `kopyaIciSilme`'de `^-[\w-]+:` biçimli bir argüman görülürse kısa yol null dönsün; komut normal yoldan geçsin.
2. `olay.ts:281`'de `-Ad:değer` argümanının `:` sonrası kısmı da hedef listesine eklensin.
3. Kırmızı test: yukarıdaki dört satır.

---

## Bulgu 3 (orta): Kaçışla birleşen sözcük kesin yasakta yeniden taranmıyor

**Yer:**
- `olay.ts:152-156`: `tirnakIci` yalnızca tırnak içindeki metin boşluk ya da ayırıcı içeriyorsa onu yeniden komut olarak tarıyor.
- `olay.ts:158-160`: kaçış dalı (Bash'te `\`, PowerShell'de `` ` ``) boşluğu sözcüğe ekliyor, yeniden tarama yapmıyor.
- `git' 'clean` gibi bitişik tırnak parçalarında da her parça ayrı ayrı taranıyor. Birleşen sözcüğün tamamı hiç taranmıyor.
- Sonuç: `git push --force` metni tek bir sözcük olarak kalıyor. `gitCagrilari` (`olay.ts:211-227`) onu git çağrısı olarak görmüyor.
- Komut alt kümeden taşmadığında parça parça, taştığında tek soru olarak Jev'e gidiyor. Kod izni (`KOD`) alan satır yok; ama mutlak yasak ve insan onayı atlanıyor.

**Karar tablosu (eşdeğer tırnaklı yazım tabloda `RED` ya da `INSAN`):**

| Rol/araç | Girdi | Çıktı | Beklenen | Tırnaklı eşdeğeri |
|---|---|---|---|---|
| işçi/Bash | `npx -c git\ push\ --force` | gec, TEK | RED | `npx -c "git push --force"` → RED |
| işçi/PowerShell | ``npx -c git` push` --force`` | gec, TEK | RED | `npx -c 'git push --force'; ls` → RED |
| işçi/Bash | `npx --call=git\ reset\ --hard; ls` | izin, PARCA:2 | INSAN | `npm exec --call="git clean -fd"; ls` → INSAN |
| denetçi/Bash | `rm -rf "<KOPYA>/a"; npx -c git\ push\ --force` | gec, KOD+TEK | RED | `rm -rf "<KOPYA>/a"; git push --force` → RED (kalıcı tablo) |
| denetçi/Bash | `git worktree add "<KOPYA>/m1" HEAD; npx -c git\ reset\ --hard` | izin, PARCA:2 | INSAN | — |
| işçi/Bash | `git\ clean -fd` | gec, TEK | INSAN | `"git clean" -fd` → INSAN |
| işçi/Bash | `git' 'clean -fd` | gec, TEK | INSAN | `"git clean" -fd` → INSAN |
| işçi/Bash | `ls; echo git\ reset\ --hard \| sh` | gec, TEK | INSAN | `echo git push --force \| sh` → RED |
| işçi/Bash | `npm run x --script-shell=git\ clean\ -fd` | gec, TEK | INSAN | — |

**Öneri:**
1. `sozcukle`'de bir sözcük bittiğinde, kaçış ya da tırnakla boşluk veya ayırıcı kazanmışsa sözcüğün tamamı `parcalar(...)` ile yeniden taransın. Bu, `tirnakIci`'deki kuralın sözcük düzeyine taşınmasıdır.
2. Daha dar seçenek: `komutYasakMi`'deki `metinler` dizisinde zaten bulunan kaçışsız ve tırnaksız metinler (`olay.ts:290`) `parcalar` ile de taransın. Böylece `git\ push\ --force` ve ``git` push` --force`` yakalanır.
3. Kırmızı test: yukarıdaki dokuz satır.

---

## Bulgu 4 (düşük): `--` sonrasında `-` ile başlayan işlenen silme hedefi sayılmıyor

**Yer:** `kapi.ts:154`. `--` seçenek sonunu bildirir; ondan sonra gelen `-src` bir hedef işlenenidir. Süzgeç onu seçenek sayıp atıyor.

| Rol/araç | Girdi | Çıktı | Beklenen |
|---|---|---|---|
| denetçi/Bash | `rm -rf -- "<KOPYA>/a" -src` | izin, KOD, Jev: [] | TEK (göreli hedef; kural "yalnızca mutlak hedef") |

**Önem gerekçesi:**
- Hedef göreli, yani çalışma dizinine göre çözülür.
- Kesin yasak göreli hedefi zaten içeride sayıyor.
- Etki küçük; yine de kuralın "her hedef mutlak" koşulu delinmiş oluyor.

**Öneri:** `--` görülünce sonraki her argüman hedef sayılsın. Ya da `--` sonrasında `-` ile başlayan bir argüman varsa kısa yol null dönsün.

---

## Şüpheler (bulgu sayılmadı)

1. **`git --exec-path C:/x reset --hard; ls` → `PARCA:2`:**
   - `gitCagrilari` değersiz `--exec-path`'ten sonraki `C:/x` sözcüğünü alt komut sayıyor. Bu yüzden `reset --hard` kesin yasağa girmiyor.
   - git'in kendi seçenek ayrıştırması da değersiz `--exec-path`'ten sonraki ilk sözcüğü alt komut konumunda görür. Kapının okuması bununla tutarlı olduğu için bulgu sayılmadı.
   - Güvenli yan tercih edilirse ilk `-` ile başlamayan sözcükten sonra da `reset`/`clean`/`push` aranabilir.
2. **PowerShell `@ad` (splatting):**
   - `ls; git @a` → `PARCA:2`. Tırnak dışı `$` alt küme dışı, ama `@ad` da bir değişken açılımıdır.
   - Parça Jev'e gidiyor ve worktree kısa yolu `@`'yi zaten reddediyor (`ozel`). Kuralın lafzı yalnızca `$` dediği için bulgu sayılmadı.
   - İstenirse PowerShell lehçesinde tırnak dışı `@` da `altKume`'den null döndürebilir.
3. **8.3 kısa ad örnekleri:**
   - `APPDAT~1` ve `ZEPUL-~1` ile yazılan 4 satır `INSAN` ya da `TEK` döndü. Bu güvenli yönde.
   - Sonuç makinedeki kısa ad tablosuna bağlı olduğu için kalıcı listeye alınmadı.

## Kalıcı tabloya eklenmeye hazır satırlar

244 satır (248 eksi makineye bağlı 4 satır), `test/kapi-karar-tablosu.test.ts` biçiminde.

**Karar sütunu:** Kurala göre beklenen karardır. Bugün farklı dönen 21 satır `// av7: bugün …` notunu taşır ve bulgular kapanana kadar kırmızıdır. Kalan 223 satır `ac96796`'da yeşildir. Bu, kopyada bu tabloyla çalıştırılan geçici bir testle doğrulandı: 244 test, 223 geçti, 21 kaldı.

**`ac` yardımcısı:** Yeni yer tutucular için aşağıdaki biçimde genişletilmelidir:

```ts
const TEMP = path.dirname(KOK).replace(/\\/g, "/");
const ac = (s: string) => s.replaceAll("<KOPYA\\>", KOPYA.replaceAll("/", "\\")).replaceAll("<KOPYA_UP>", KOPYA.toUpperCase())
  .replaceAll("<KOPYA_LO>", KOPYA.toLowerCase()).replaceAll("<KOPYA_GB>", KOPYA.replace(/^([A-Za-z]):/, (_, d) => "/" + d.toLowerCase()))
  .replaceAll("<TEMP>", TEMP).replaceAll("<KOPYA>", KOPYA)
  .replaceAll("<WT\\>", WT.replaceAll("/", "\\")).replaceAll("<WT>", WT).replaceAll("<ANA>", ANA);
```

```ts
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "ls; git status", karar: "PARCA:2", jev: ["ls","git status"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "ls\ngit status", karar: "TEK", jev: ["ls\ngit status"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "ls\r\ngit status", karar: "TEK", jev: ["ls\r\ngit status"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "git status | Select-Object -First 2", karar: "PARCA:1", jev: ["git status"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "git status && ls", karar: "PARCA:2", jev: ["git status","ls"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "git status || ls", karar: "PARCA:2", jev: ["git status","ls"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "(git status); ls", karar: "TEK", jev: ["(git status); ls"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "$(git status); ls", karar: "TEK", jev: ["$(git status); ls"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "@(git status); ls", karar: "TEK", jev: ["@(git status); ls"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "{ git status }; ls", karar: "TEK", jev: ["{ git status }; ls"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "& git status; ls", karar: "TEK", jev: ["& git status; ls"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "& 'C:/x/a.exe'", karar: "TEK", jev: ["& 'C:/x/a.exe'"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: ". ./betik.ps1; ls", karar: "TEK", jev: [". ./betik.ps1; ls"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: ". .\\betik.ps1", karar: "TEK", jev: [". .\\betik.ps1"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "git --% status; ls", karar: "TEK", jev: ["git --% status; ls"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "git sta`tus; ls", karar: "TEK", jev: ["git sta`tus; ls"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "ls `; git status", karar: "TEK", jev: ["ls `; git status"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "echo a,b; ls", karar: "TEK", jev: ["echo a,b; ls"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "ls; git @a", karar: "PARCA:2", jev: ["ls","git @a"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "ls; echo \"$x\"", karar: "PARCA:2", jev: ["ls","echo \"$x\""] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "ls; echo \"$(git push --force)\"", karar: "RED", jev: [] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "ls # yorum", karar: "TEK", jev: ["ls # yorum"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "ls; <# a #> git status", karar: "TEK", jev: ["ls; <# a #> git status"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "ls 2>$null; git status", karar: "TEK", jev: ["ls 2>$null; git status"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "ls; git status *> x.txt", karar: "PARCA:2", jev: ["ls","git status *> x.txt"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "ls; echo ‘a; git status’", karar: "TEK", jev: ["ls; echo ‘a; git status’"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "ls; git –version", karar: "TEK", jev: ["ls; git –version"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "ls; git status", karar: "TEK", jev: ["ls; git status"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "ls;git status", karar: "PARCA:2", jev: ["ls","git status"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "Get-ChildItem | Select-Object -First 3; git status", karar: "PARCA:2", jev: ["Get-ChildItem","git status"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "ls; Get-Content a.txt | Out-File b.txt", karar: "TEK", jev: ["ls; Get-Content a.txt | Out-File b.txt"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "ls; [IO.File]::Delete('x')", karar: "TEK", jev: ["ls; [IO.File]::Delete('x')"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "ls; mkdir x", karar: "PARCA:2", jev: ["ls","mkdir x"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "echo 'a'';ls;''b'", karar: "TEK", jev: ["echo 'a'';ls;''b'"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "ls; echo \"a\"\";ls;\"\"b\"", karar: "PARCA:2", jev: ["ls","echo \"a\"\";ls;\"\"b\""] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "ls; git log --format=%H", karar: "PARCA:2", jev: ["ls","git log --format=%H"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "ls | Remove-Item", karar: "TEK", jev: ["ls | Remove-Item"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "ls | % { $_ }", karar: "TEK", jev: ["ls | % { $_ }"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "ls; sal ls Remove-Item", karar: "TEK", jev: ["ls; sal ls Remove-Item"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "ls; function ls { x }", karar: "TEK", jev: ["ls; function ls { x }"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "ls; git status 2>&1 | iex", karar: "TEK", jev: ["ls; git status 2>&1 | iex"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "Get-ChildItem -Path . | Invoke-Expression", karar: "TEK", jev: ["Get-ChildItem -Path . | Invoke-Expression"] },
  { b: "L2", rol: "isci", arac: "Bash", girdi: "ls & git status", karar: "TEK", jev: ["ls & git status"] },
  { b: "L2", rol: "isci", arac: "Bash", girdi: "ls ^& git status", karar: "TEK", jev: ["ls ^& git status"] },
  { b: "L2", rol: "isci", arac: "Bash", girdi: "echo %PATH%; ls", karar: "PARCA:2", jev: ["echo %PATH%","ls"] },
  { b: "L2", rol: "isci", arac: "Bash", girdi: "cmd /c \"ls & git status\"", karar: "TEK", jev: ["cmd /c \"ls & git status\""] },
  { b: "L2", rol: "isci", arac: "Bash", girdi: "ls; cmd /c git status", karar: "TEK", jev: ["ls; cmd /c git status"] },
  { b: "L2", rol: "isci", arac: "Bash", girdi: "ls; cmd.exe /c git status", karar: "TEK", jev: ["ls; cmd.exe /c git status"] },
  { b: "L2", rol: "isci", arac: "Bash", girdi: "ls\ngit status", karar: "TEK", jev: ["ls\ngit status"] },
  { b: "L2", rol: "isci", arac: "Bash", girdi: "ls; git status &", karar: "TEK", jev: ["ls; git status &"] },
  { b: "L2", rol: "isci", arac: "Bash", girdi: "cmd /c rd /s /q C:\\x", karar: "INSAN", jev: [] },
  { b: "L2", rol: "isci", arac: "Bash", girdi: "ls; (git status)", karar: "TEK", jev: ["ls; (git status)"] },
  { b: "L2", rol: "isci", arac: "Bash", girdi: "ls; { git status; }", karar: "TEK", jev: ["ls; { git status; }"] },
  { b: "L2", rol: "isci", arac: "Bash", girdi: "ls; git status |& cat", karar: "TEK", jev: ["ls; git status |& cat"] },
  { b: "L2", rol: "isci", arac: "Bash", girdi: "ls; git status >| x", karar: "TEK", jev: ["ls; git status >| x"] },
  { b: "L2", rol: "isci", arac: "Bash", girdi: "ls; . ./x.sh", karar: "TEK", jev: ["ls; . ./x.sh"] },
  { b: "L2", rol: "isci", arac: "Bash", girdi: "ls; source x.sh", karar: "TEK", jev: ["ls; source x.sh"] },
  { b: "L2", rol: "isci", arac: "Bash", girdi: "ls; exec git status", karar: "TEK", jev: ["ls; exec git status"] },
  { b: "L2", rol: "isci", arac: "Bash", girdi: "ls; command git status", karar: "TEK", jev: ["ls; command git status"] },
  { b: "L2", rol: "isci", arac: "Bash", girdi: "ls; git status <<< x", karar: "TEK", jev: ["ls; git status <<< x"] },
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA_UP>/a\"", karar: "KOD", jev: [] },
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA_LO>/a\"", karar: "KOD", jev: [] },
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA\\>\\a\"", karar: "KOD", jev: [] },
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm -rf <KOPYA\\>\\a", karar: "TEK", jev: ["rm -rf <KOPYA\\>\\a"] },
  { b: "SL2", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force <KOPYA\\>\\a", karar: "KOD", jev: [] },
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA_GB>/a\"", karar: "KOD", jev: [] },
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"//?/<KOPYA>/a\"", karar: "TEK", jev: ["rm -rf \"//?/<KOPYA>/a\""] },
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"//sunucu/pay/isci1-1/a\"", karar: "INSAN", jev: [] },
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"//localhost/C$/x/a\"", karar: "RED", jev: [] },
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/\"", karar: "INSAN", jev: [] },
  { b: "SL2", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA\\>\\'", karar: "INSAN", jev: [] },
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/.\"", karar: "INSAN", jev: [] },
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/./\"", karar: "INSAN", jev: [] },
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>//\"", karar: "INSAN", jev: [] },
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>.\"", karar: "INSAN", jev: [] },
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/...\"", karar: "TEK", jev: ["rm -rf \"<KOPYA>/...\""] }, // av7: bugün KOD
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/.. \"", karar: "INSAN", jev: [] },
  { b: "SL2", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/.. /x'", karar: "TEK", jev: ["Remove-Item -Recurse -Force '<KOPYA>/.. /x'"] }, // av7: bugün KOD
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/ \"", karar: "INSAN", jev: [] },
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/. \"", karar: "INSAN", jev: [] },
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/m1/.\"", karar: "KOD", jev: [] },
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/./m1\"", karar: "KOD", jev: [] },
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/m1:x\"", karar: "KOD", jev: [] },
  { b: "SL2", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/a' -LiteralPath:'<ANA>'", karar: "INSAN", jev: [] }, // av7: bugün KOD
  { b: "SL2", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force -Path:'<ANA>'", karar: "INSAN", jev: [] },
  { b: "SL2", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force -Path:'<KOPYA>/a' '<ANA>'", karar: "INSAN", jev: [] },
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm -rf -- \"<KOPYA>/a\"", karar: "KOD", jev: [] },
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/a\" -- \"<ANA>\"", karar: "INSAN", jev: [] },
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm -rf -- \"<KOPYA>/a\" -src", karar: "TEK", jev: ["rm -rf -- \"<KOPYA>/a\" -src"] }, // av7: bugün KOD
  { b: "SL2", rol: "denetci", arac: "PowerShell", girdi: "rm -r -fo '<KOPYA>/a' & rm -r -fo '<ANA>'", karar: "INSAN", jev: [] },
  { b: "SL2", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/a'; Remove-Item -Recurse -Force '<KOPYA>/b'", karar: "KOD", jev: [] },
  { b: "SL2", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force ('<KOPYA>/a')", karar: "INSAN", jev: [] },
  { b: "SL2", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/a' -WhatIf:$false", karar: "TEK", jev: ["Remove-Item -Recurse -Force '<KOPYA>/a' -WhatIf:$false"] },
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/a\" 2>/dev/null", karar: "INSAN", jev: [] },
  { b: "SL2", rol: "denetci", arac: "PowerShell", girdi: "rd -r '<KOPYA>/a'", karar: "KOD", jev: [] },
  { b: "SL2", rol: "denetci", arac: "PowerShell", girdi: "del -r '<KOPYA>/a'", karar: "KOD", jev: [] },
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/a\" \"<KOPYA>/b\"", karar: "KOD", jev: [] },
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/a\" \"<KOPYA>\"", karar: "INSAN", jev: [] },
  { b: "SL2", rol: "isci", arac: "Bash", girdi: "rm -rf \"<KOPYA_UP>/a\"", karar: "INSAN", jev: [] },
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm -Rf \"<KOPYA>/a\"", karar: "KOD", jev: [] },
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm --recursive --force \"<KOPYA>/a\"", karar: "KOD", jev: [] },
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "/bin/rm -rf \"<KOPYA>/a\"", karar: "KOD", jev: [] },
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm.exe -rf \"<KOPYA>/a\"", karar: "KOD", jev: [] },
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "command rm -rf \"<KOPYA>/a\"", karar: "TEK", jev: ["command rm -rf \"<KOPYA>/a\""] },
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/a\" ~", karar: "INSAN", jev: [] },
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/a\" \"~/x\"", karar: "INSAN", jev: [] },
  { b: "SL2", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/a' -Path 'C:/'", karar: "INSAN", jev: [] },
  { b: "WT2", rol: "denetci", arac: "PowerShell", girdi: "git worktree add --detach '<KOPYA>/m1' HEAD", karar: "KOD", jev: [] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA_UP>/m1\"", karar: "KOD", jev: [] },
  { b: "WT2", rol: "denetci", arac: "PowerShell", girdi: "git worktree add '<KOPYA_LO>/m1'", karar: "KOD", jev: [] },
  { b: "WT2", rol: "denetci", arac: "PowerShell", girdi: "git worktree add '<KOPYA\\>\\m1'", karar: "KOD", jev: [] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add <KOPYA\\>\\m1", karar: "TEK", jev: ["git worktree add <KOPYA\\>\\m1"] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA_GB>/m1\"", karar: "KOD", jev: [] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA_83>/m1\"", karar: "TEK", jev: ["git worktree add \"<KOPYA_83>/m1\""] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/.\"", karar: "TEK", jev: ["git worktree add \"<KOPYA>/.\""] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>.\"", karar: "TEK", jev: ["git worktree add \"<KOPYA>.\""] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/...\"", karar: "TEK", jev: ["git worktree add \"<KOPYA>/...\""] }, // av7: bugün KOD
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/ \"", karar: "TEK", jev: ["git worktree add \"<KOPYA>/ \""] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/.. /x\"", karar: "TEK", jev: ["git worktree add \"<KOPYA>/.. /x\""] }, // av7: bugün KOD
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add \"//sunucu/pay/m1\"", karar: "TEK", jev: ["git worktree add \"//sunucu/pay/m1\""] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add -f \"<KOPYA>/m1\"", karar: "TEK", jev: ["git worktree add -f \"<KOPYA>/m1\""] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add --force \"<KOPYA>/m1\"", karar: "TEK", jev: ["git worktree add --force \"<KOPYA>/m1\""] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add -b x \"<KOPYA>/m1\"", karar: "TEK", jev: ["git worktree add -b x \"<KOPYA>/m1\""] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add -B x \"<KOPYA>/m1\"", karar: "TEK", jev: ["git worktree add -B x \"<KOPYA>/m1\""] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add --lock \"<KOPYA>/m1\"", karar: "TEK", jev: ["git worktree add --lock \"<KOPYA>/m1\""] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add --lock --reason x \"<KOPYA>/m1\"", karar: "TEK", jev: ["git worktree add --lock --reason x \"<KOPYA>/m1\""] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add --no-checkout \"<KOPYA>/m1\"", karar: "TEK", jev: ["git worktree add --no-checkout \"<KOPYA>/m1\""] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add -q \"<KOPYA>/m1\"", karar: "TEK", jev: ["git worktree add -q \"<KOPYA>/m1\""] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add --track \"<KOPYA>/m1\" origin/main", karar: "TEK", jev: ["git worktree add --track \"<KOPYA>/m1\" origin/main"] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add --guess-remote \"<KOPYA>/m1\"", karar: "TEK", jev: ["git worktree add --guess-remote \"<KOPYA>/m1\""] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add --orphan \"<KOPYA>/m1\"", karar: "TEK", jev: ["git worktree add --orphan \"<KOPYA>/m1\""] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add --detach --detach \"<KOPYA>/m1\"", karar: "TEK", jev: ["git worktree add --detach --detach \"<KOPYA>/m1\""] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add --detach -f \"<KOPYA>/m1\"", karar: "TEK", jev: ["git worktree add --detach -f \"<KOPYA>/m1\""] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add --relative-paths \"<KOPYA>/m1\"", karar: "TEK", jev: ["git worktree add --relative-paths \"<KOPYA>/m1\""] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/m1\" HEAD~1", karar: "TEK", jev: ["git worktree add \"<KOPYA>/m1\" HEAD~1"] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/m1\" origin/main", karar: "KOD", jev: [] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/m1\" \\-b", karar: "TEK", jev: ["git worktree add \"<KOPYA>/m1\" \\-b"] },
  { b: "WT2", rol: "denetci", arac: "PowerShell", girdi: "git worktree add '<KOPYA>/m1' -b", karar: "TEK", jev: ["git worktree add '<KOPYA>/m1' -b"] },
  { b: "WT2", rol: "denetci", arac: "PowerShell", girdi: "git worktree add '<KOPYA>/m1' `-b", karar: "TEK", jev: ["git worktree add '<KOPYA>/m1' `-b"] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/m1\" HEAD 2>&1 | grep -v x", karar: "KOD", jev: [] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/m1\" HEAD 2>&1 | grep x y.txt", karar: "TEK", jev: ["git worktree add \"<KOPYA>/m1\" HEAD 2>&1 | grep x y.txt"] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git -C \"<KOPYA>\" worktree add \"<KOPYA>/m1\"", karar: "KOD", jev: [] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git -C \"<WT>\" -C \"<ANA>\" worktree add \"<KOPYA>/m1\"", karar: "TEK", jev: ["git -C \"<WT>\" -C \"<ANA>\" worktree add \"<KOPYA>/m1\""] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git --work-tree=x worktree add \"<KOPYA>/m1\"", karar: "TEK", jev: ["git --work-tree=x worktree add \"<KOPYA>/m1\""] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git --no-pager worktree add \"<KOPYA>/m1\"", karar: "TEK", jev: ["git --no-pager worktree add \"<KOPYA>/m1\""] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git -C \"<WT>\" worktree add \"<KOPYA>/m1\" HEAD; git push --force", karar: "RED", jev: [] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/m1\" HEAD && git reset --hard", karar: "INSAN", jev: [] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/m1\" HEAD 2>&1", karar: "KOD", jev: [] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/m1\" HEAD 2> x", karar: "TEK", jev: ["git worktree add \"<KOPYA>/m1\" HEAD 2> x"] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/m1\" HEAD 2>&1 1>&2", karar: "TEK", jev: ["git worktree add \"<KOPYA>/m1\" HEAD 2>&1 1>&2"] },
  { b: "WT2", rol: "denetci", arac: "PowerShell", girdi: "git worktree add '<KOPYA>/m1' \"$x\"", karar: "TEK", jev: ["git worktree add '<KOPYA>/m1' \"$x\""] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/m1\" HEAD 2>&1 | tail -2 | head -1", karar: "KOD", jev: [] },
  { b: "WT2", rol: "isci", arac: "PowerShell", girdi: "git worktree add '<KOPYA>/m1' HEAD", karar: "TEK", jev: ["git worktree add '<KOPYA>/m1' HEAD"] },
  { b: "WT2", rol: "denetci", arac: "PowerShell", girdi: "git worktree add '<KOPYA>/m1' HEAD 2>&1", karar: "KOD", jev: [] },
  { b: "WT2", rol: "denetci", arac: "PowerShell", girdi: "git worktree add '<KOPYA>/m1' HEAD *>&1", karar: "TEK", jev: ["git worktree add '<KOPYA>/m1' HEAD *>&1"] },
  { b: "WT2", rol: "denetci", arac: "PowerShell", girdi: "git worktree add '<KOPYA>/m1' HEAD\ngit status", karar: "TEK", jev: ["git worktree add '<KOPYA>/m1' HEAD\ngit status"] },
  { b: "WT2", rol: "denetci", arac: "PowerShell", girdi: "& git worktree add '<KOPYA>/m1' HEAD", karar: "TEK", jev: ["& git worktree add '<KOPYA>/m1' HEAD"] },
  { b: "WT2", rol: "denetci", arac: "PowerShell", girdi: "git worktree add '<KOPYA>/m1' HEAD --% -f", karar: "TEK", jev: ["git worktree add '<KOPYA>/m1' HEAD --% -f"] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/m1\" HEAD & ls", karar: "TEK", jev: ["git worktree add \"<KOPYA>/m1\" HEAD & ls"] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "GIT_DIR=x git worktree add \"<KOPYA>/m1\"", karar: "TEK", jev: ["GIT_DIR=x git worktree add \"<KOPYA>/m1\""] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git -c core.hooksPath= worktree add \"<KOPYA>/m1\"", karar: "RED", jev: [] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree \"add\" \"<KOPYA>/m1\" -- ", karar: "TEK", jev: ["git worktree \"add\" \"<KOPYA>/m1\" -- "] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/m1\" HEAD 2>&1 | Select-Object -First 1 | grep x z", karar: "TEK", jev: ["git worktree add \"<KOPYA>/m1\" HEAD 2>&1 | Select-Object -First 1 | grep x z"] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "git -c core.pager=x log; ls", karar: "PARCA:2", jev: ["git -c core.pager=x log","ls"] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "git -c core.hooksPath=x status; ls", karar: "RED", jev: [] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "git --config-env=core.hooksPath=H status; ls", karar: "RED", jev: [] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "git -c Core.HooksPath=x status", karar: "RED", jev: [] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "git -c core.hooksPath status; ls", karar: "RED", jev: [] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "git --exec-path=C:/x status; ls", karar: "PARCA:2", jev: ["git --exec-path=C:/x status","ls"] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "git --exec-path C:/x reset --hard; ls", karar: "PARCA:2", jev: ["git --exec-path C:/x reset --hard","ls"] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "git --git-dir=C:/x reset --hard; ls", karar: "INSAN", jev: [] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "git --git-dir C:/x clean -fd; ls", karar: "INSAN", jev: [] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "git -C C:/x reset --hard", karar: "INSAN", jev: [] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "git -C C:/x -c x.y=z clean -n; ls", karar: "INSAN", jev: [] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "git -C C:/x status; ls", karar: "PARCA:2", jev: ["git -C C:/x status","ls"] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "git -C C:/x push --force; ls", karar: "RED", jev: [] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "git --no-pager -C x push -f", karar: "RED", jev: [] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "git --namespace=x push --force", karar: "RED", jev: [] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "git --work-tree x checkout -- .; ls", karar: "INSAN", jev: [] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "git --bare reset --hard", karar: "INSAN", jev: [] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "git --literal-pathspecs clean -fd", karar: "INSAN", jev: [] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "git -c alias.st=status st; ls", karar: "RED", jev: [] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "git -c x.y=z worktree remove --force x; ls", karar: "PARCA:2", jev: ["git -c x.y=z worktree remove --force x","ls"] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "npm --prefix C:/x run kapat; ls", karar: "PARCA:2", jev: ["npm --prefix C:/x run kapat","ls"] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "npm -C C:/x test; ls", karar: "PARCA:2", jev: ["npm -C C:/x test","ls"] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "npm exec -c \"git push --force\"", karar: "RED", jev: [] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "npx -c 'git reset --hard'; ls", karar: "INSAN", jev: [] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "npm exec --call=\"git clean -fd\"; ls", karar: "INSAN", jev: [] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "npx -c git\\ push\\ --force", karar: "RED", jev: [] }, // av7: bugün TEK
  { b: "IL", rol: "isci", arac: "Bash", girdi: "npx --call=git\\ reset\\ --hard; ls", karar: "INSAN", jev: [] }, // av7: bugün PARCA:2
  { b: "IL", rol: "isci", arac: "Bash", girdi: "npm exec -- git push --force", karar: "RED", jev: [] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "npx git push -f; ls", karar: "RED", jev: [] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "npm run x -- && git push --force", karar: "RED", jev: [] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "node --require ./x.js a.js; ls", karar: "PARCA:2", jev: ["node --require ./x.js a.js","ls"] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "node -r ./x.js a.js | tail -2", karar: "PARCA:1", jev: ["node -r ./x.js a.js"] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "node --import ./x.mjs a.js; ls", karar: "PARCA:2", jev: ["node --import ./x.mjs a.js","ls"] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "node --import=tsx a.ts; ls", karar: "PARCA:2", jev: ["node --import=tsx a.ts","ls"] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "node --import data:text/javascript,x a.js; ls", karar: "PARCA:2", jev: ["node --import data:text/javascript,x a.js","ls"] },
  { b: "IL", rol: "isci", arac: "PowerShell", girdi: "node --import data:text/javascript,x a.js; ls", karar: "TEK", jev: ["node --import data:text/javascript,x a.js; ls"] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "node --env-file=.env a.js; ls", karar: "INSAN", jev: [] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "node -e \"require('child_process').execSync('git push --force')\"", karar: "RED", jev: [] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "node -e \"require('child_process').execSync('git reset --hard')\"; ls", karar: "INSAN", jev: [] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "tsx --require ./x.js a.ts; ls", karar: "PARCA:2", jev: ["tsx --require ./x.js a.ts","ls"] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "node -p \"1\"; ls", karar: "PARCA:2", jev: ["node -p \"1\"","ls"] },
  { b: "IL", rol: "isci", arac: "PowerShell", girdi: "npm --prefix C:/x run kapat; ls", karar: "PARCA:2", jev: ["npm --prefix C:/x run kapat","ls"] },
  { b: "IL", rol: "isci", arac: "PowerShell", girdi: "node --require ./x.js a.js; ls", karar: "PARCA:2", jev: ["node --require ./x.js a.js","ls"] },
  { b: "IL", rol: "isci", arac: "PowerShell", girdi: "git -C C:/x reset --hard; ls", karar: "INSAN", jev: [] },
  { b: "IL", rol: "isci", arac: "PowerShell", girdi: "git -C 'C:/x' -c x.y=z status; ls", karar: "PARCA:2", jev: ["git -C 'C:/x' -c x.y=z status","ls"] },
  { b: "KY2", rol: "isci", arac: "Bash", girdi: "git status; cat .env", karar: "INSAN", jev: [] },
  { b: "KY2", rol: "isci", arac: "Bash", girdi: "git show HEAD:.env | tail -2", karar: "INSAN", jev: [] },
  { b: "KY2", rol: "isci", arac: "PowerShell", girdi: "Get-Content .\\.env | Select-Object -First 1", karar: "INSAN", jev: [] },
  { b: "KY2", rol: "isci", arac: "PowerShell", girdi: "npx -c 'git push --force'; ls", karar: "RED", jev: [] },
  { b: "KY2", rol: "isci", arac: "PowerShell", girdi: "npx -c git` push` --force", karar: "RED", jev: [] }, // av7: bugün TEK
  { b: "KY2", rol: "isci", arac: "Bash", girdi: "echo git push --force | sh", karar: "RED", jev: [] },
  { b: "KY2", rol: "isci", arac: "Bash", girdi: "ls; npm exec -c \"rm -rf C:/\"", karar: "INSAN", jev: [] },
  { b: "KY2", rol: "isci", arac: "Bash", girdi: "test -f x && git clean -fd", karar: "INSAN", jev: [] },
  { b: "KY2", rol: "isci", arac: "Bash", girdi: "[ -f x ] && git reset --hard", karar: "INSAN", jev: [] },
  { b: "KY2", rol: "isci", arac: "Bash", girdi: "git status; git -c alias.x=x x", karar: "RED", jev: [] },
  { b: "KY2", rol: "isci", arac: "Bash", girdi: "mkdir x; GIT_SSH_COMMAND=x git fetch", karar: "RED", jev: [] },
  { b: "KY2", rol: "isci", arac: "Bash", girdi: "npx -c \"GIT_ASKPASS=x git fetch\"", karar: "RED", jev: [] },
  { b: "KY2", rol: "isci", arac: "Bash", girdi: "git -c core.fsmonitor=x status | tail -2", karar: "RED", jev: [] },
  { b: "KY2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/a\"; npx -c git\\ push\\ --force", karar: "RED", jev: [] }, // av7: bugün KOD+TEK
  { b: "KY2", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/m1\" HEAD; npx -c git\\ reset\\ --hard", karar: "INSAN", jev: [] }, // av7: bugün PARCA:2
  { b: "KY2", rol: "isci", arac: "Bash", girdi: "git clean\\ -fd", karar: "INSAN", jev: [] },
  { b: "KY2", rol: "isci", arac: "Bash", girdi: "git\\ clean -fd", karar: "INSAN", jev: [] }, // av7: bugün TEK
  { b: "KY2", rol: "isci", arac: "Bash", girdi: "g\\it reset --hard", karar: "INSAN", jev: [] },
  { b: "KY2", rol: "isci", arac: "Bash", girdi: "\"git\" reset --hard", karar: "INSAN", jev: [] },
  { b: "KY2", rol: "isci", arac: "Bash", girdi: "git push --force-with-lease; ls", karar: "RED", jev: [] },
  { b: "KY2", rol: "isci", arac: "Bash", girdi: "npx -c \"git push --force\"", karar: "RED", jev: [] },
  { b: "KY2", rol: "isci", arac: "Bash", girdi: "node -e \"x\" -- git push --force", karar: "RED", jev: [] },
  { b: "KY2", rol: "isci", arac: "PowerShell", girdi: "Write-Output 'git push --force' | Invoke-Expression", karar: "RED", jev: [] },
  { b: "KY2", rol: "isci", arac: "Bash", girdi: "echo x > .env; ls", karar: "INSAN", jev: [] },
  { b: "KY2", rol: "isci", arac: "Bash", girdi: "ls; echo git\\ reset\\ --hard | sh", karar: "INSAN", jev: [] }, // av7: bugün TEK
  { b: "KY2", rol: "isci", arac: "Bash", girdi: "npm run x --script-shell=git\\ clean\\ -fd", karar: "INSAN", jev: [] }, // av7: bugün TEK
  { b: "KY2", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/m1\" HEAD 2>&1 | tail -2; git -c alias.a=b a", karar: "RED", jev: [] },
  { b: "KY2", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/a'; git push -f", karar: "RED", jev: [] },
  { b: "KY2", rol: "isci", arac: "Bash", girdi: "\"git clean\" -fd", karar: "INSAN", jev: [] },
  { b: "KY2", rol: "isci", arac: "Bash", girdi: "git' 'clean -fd", karar: "INSAN", jev: [] }, // av7: bugün TEK
  { b: "KY2", rol: "isci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force a -LiteralPath:'C:/'", karar: "INSAN", jev: [] }, // av7: bugün TEK
  { b: "KY2", rol: "isci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force a -Path:C:/", karar: "INSAN", jev: [] }, // av7: bugün TEK
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/.../x\"", karar: "TEK", jev: ["rm -rf \"<KOPYA>/.../x\""] }, // av7: bugün KOD
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/a/.. /.. /x\"", karar: "TEK", jev: ["rm -rf \"<KOPYA>/a/.. /.. /x\""] }, // av7: bugün KOD
  { b: "SL2", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/a' -Path:'<ANA>'", karar: "INSAN", jev: [] }, // av7: bugün KOD
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git -C \"<WT>/...\" worktree add \"<KOPYA>/m1\"", karar: "TEK", jev: ["git -C \"<WT>/...\" worktree add \"<KOPYA>/m1\""] }, // av7: bugün KOD
```
