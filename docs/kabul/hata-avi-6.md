# Hata avı, 6. tur (K15): kapı karar tablosu

- **Kapsam:** HEAD `1618e5e`, `sunucu/kapi.ts` (`kopyaIciWorktree`, `ILK_IZIN`, değişkenli silmede red). Satır numaraları `1618e5e` içindir.
- **Kural:** `KURALLAR.md` F, "Bileşik komut (kapalı kapı)".
- **Yöntem:** Repo `%TEMP%\zepul-av6-kopya` klonuna alındı. Orada `deneme/av6.mts` gerçek `kapiKarari`'yı sahte bir Jev ile çağırdı. Sahte Jev her soruya "guvenli 0,95" döndü ve kendisine sorulan parçayı kaydetti. Hiçbir kabuk komutu çalıştırılmadı; komut metinleri yalnızca girdi olarak verildi.
- **Karar etiketleri:**
  - `KOD`: Jev'e gitmeden izin.
  - `PARCA:n`: n parça Jev'e soruldu, sonuç izin.
  - `TEK`: komutun tamamı tek soru olarak Jev'e gitti; sonuç `gec`.
  - `KOD+TEK`: silme kodla geçti, kalan kısım tek soru oldu.
  - `INSAN`, `RED`.
- **Roller:** İşçi örneklerinde `kok` ana repodur. Denetçi örneklerinde `kok` `.worktrees/isci1`, kopya kökü ise `zepul-ayar/denetim/isci1-1`'dir.

## Özet

| # | Önem | Yer | Başlık |
|---|---|---|---|
| 1 | yüksek | `kapi.ts:171-189`, `kapi.ts:263` | PowerShell'de virgülle yazılan dizi, worktree kısa yolunda tek sözcük okunuyor. Kurala uymayan seçenekler (`-c`, `--exec-path`, `--force`, `-b`, `--no-checkout`) Jev'e gitmeden kod izni alıyor |
| 2 | düşük | `kapi.ts:443-451` | Silme kısa yolundan sonra kalan tek öğe worktree kısa yoluna giriyor. İki öğeli komut Jev'e hiç gitmeden izin alıyor; kural "tek öğeli" diyor |

Sayım: yüksek 1, orta 0, düşük 1. Örnek sayısı 99. Beklenenle uyuşmayan 10 satır var. Bunların 5'i beklenenden sıkı: kesin yasak `RED` döndü, bu doğru yönde ve bulgu sayılmadı. Kalan 5 satır yukarıdaki iki bulguya düşüyor.

## Karar tablosu özeti

| Başlık | Örnek | Uyuşan | Not |
|---|---|---|---|
| Tur 5 örnekleri (T5) | 12 | 12 | Hepsi düzeltilmiş. `$'…'`, `$"…"`, `sal`, `nal`, `Set-Content Env:`, `ni Env:`, `printf -v`, `read`, `cp`, `New-Item function:` ve atama örneklerinin hepsi `TEK`. |
| Worktree kısa yolu (WT) | 46 | 36 | 5 satır beklenenden sıkı (`-c core.hooksPath`, `-c core.fsmonitor` kesin yasakta `RED`). 5 satır Bulgu 1 ve 2. |
| Kod çalıştıran biçimler (KC) | 18 | 18 | Hiçbiri `KOD` almadı. `node -e`, `node --eval`, `npx`, `npm run`, `npm exec`, `tsx`, yönlendirmeli `echo`/`Write-Output` her zaman parça olarak Jev'e gidiyor. Dosya argümanlı `cat` ve `tee` süzgeç sayılmıyor; bu durumda tek soru oluyor. |
| Silme (SL) | 18 | 18 | Değişkenli özyineli silmede `RED` yalnızca denetçide uygulanıyor. Aynı girdi işçide ve şefte `INSAN` dönüyor. Değişkenli ama özyineli olmayan silme `TEK`. Göreli `rm -rf` parçası tek soruya dönüyor. Kopya kökünün kendisi, `..` ve virgülle verilen ikinci hedef `INSAN`. |
| Kesin yasak önce (KY) | 5 | 5 | Worktree, kopya içi silme ve değişkenli silme kısa yollarıyla birleşen `git push --force` mutlak `RED`. `git reset --hard` ve `.env` `INSAN`. |

**Worktree varyasyonlarında `TEK` dönenler:**
- Seçenek sırası: `add <hedef> --detach`, `worktree --detach add`.
- `--` her konumda: `add -- h`, `--detach -- h`, `h -- HEAD`, `h HEAD --`.
- Kısaltma ve değerli biçimler: `--det`, `--detac`, `--detach=1`.
- Git'in global seçenekleri: `-C X -c x.y=z`, `--git-dir=`, `-C"X"` (bitişik yazım).
- `-C` hedefi mutlak değilse: `..` içeren, göreli, Bash'te tırnaksız ters bölüyle yazılan.
- `<ref>` seçenek gibi görünüyorsa: `-b`, `'-b'`, `--orphan`, ya da fazladan `-f`.
- `@{-1}`, yönlendirme (`> out.txt`, `1>&2`), kopya kökünün kendisi, `..` içeren hedef, `git.exe`, işçi rolü.

**`KOD` dönen ve kurala uyanlar:**
- `[-C <mutlak>]`, `[--detach]`, `[<ref>]`, `2>&1 | tail -2`, PowerShell'de tek tırnak.
- İki öğeli `git worktree add …; ls` kısa yola girmiyor, `PARCA:2` oluyor.

---

## Bulgu 1 (yüksek): PowerShell virgül dizisi worktree kısa yolundan geçiyor

**Yer:**
- `kapi.ts:263`: `altKume` virgülü sıradan bir karakter sayıyor.
- `kapi.ts:184`: `-C` değeri yalnızca `mutlakMi` ile denetleniyor.
- `kapi.ts:187-188`: `<ref>` için yalnızca `-` ile başlamaması denetleniyor.

**Açıklama:**
- PowerShell'in argüman kipinde tırnak dışındaki `a,b` bir dizidir. Dizi yerel bir programa verildiğinde öğeleri ayrı argümanlar olarak geçer.
- `olay.ts` sözcükleyicisi virgülü ayırıcı sayıyor (`olay.ts:140`). Bu yüzden silme kısa yolu bu yoldan etkilenmiyor: `rm -r -fo 'K/a','ANA'` örneği `INSAN` döndü.
- `kopyaIciWorktree` ise `altKume` sözcüklerini kullanıyor. `'<mutlak>',-c,…` metni tek bir mutlak `-C` değeri gibi görünüyor. `HEAD,--force` de `-` ile başlamayan bir `<ref>` gibi görünüyor.
- Sonuçta kuralın dışarıda bıraktığı seçenekler (git'in `-c` ve `--exec-path` seçenekleri, `add` seçenekleri) Jev'e gitmeden kod izni alıyor.
- Kesin yasak `core.hooksPath` ve `core.fsmonitor` için devreye giriyor. Diğer yapılandırma anahtarları ve `--exec-path` için devreye girmiyor.

**Karar tablosu (denetçi, PowerShell):**

| Girdi | Çıktı | Beklenen |
|---|---|---|
| `git worktree add '<KOPYA>/m1' HEAD,--force` | izin, KOD, Jev: [] | TEK |
| `git worktree add '<KOPYA>/m1',-b,yeni` | izin, KOD, Jev: [] | TEK |
| `git worktree add '<KOPYA>/m1' HEAD,--no-checkout` | izin, KOD, Jev: [] | TEK |
| `git -C '<WT>',-c,core.sshCommand=x worktree add '<KOPYA>/m1'` | izin, KOD, Jev: [] | TEK |
| `git -C '<WT>',--exec-path=C:/x worktree add '<KOPYA>/m1'` | izin, KOD, Jev: [] | TEK |
| `git -C '<WT>',-c,core.fsmonitor=x worktree add '<KOPYA>/m1'` | red (kesin yasak) | TEK ya da daha sıkı: uygun |

Aynı metinler Bash'te virgül bir dizi ayırıcısı olmadığı için tek argüman olarak geçer. Bu yüzden Bash satırları bulgu değil.

**Öneri:**
1. En dar düzeltme: `kopyaIciWorktree` içinde herhangi bir sözcükte tırnak dışı `,` varsa kısa yol `false` dönsün. Daha basit biçimi: PowerShell lehçesinde tırnak dışı virgül görülünce `altKume` null dönsün. Böylece hem bölme hem kısa yol kapanır.
2. Kırmızı test: yukarıdaki beş PowerShell girdisi kod izni almamalı ve Jev'e gitmeli.

---

## Bulgu 2 (düşük): Silme kısa yolu ile worktree kısa yolu art arda Jev'siz izin veriyor

**Yer:**
- `kapi.ts:443-448`: silme kısa yolundan sonra kalan öğeler `kapiKarari`'ya yeniden giriyor.
- `kapi.ts:450`: kalan metin, worktree kısa yolunun "tek öğe" koşulunu yeniden sağlıyor.

**Karar tablosu (denetçi, Bash):**

| Girdi | Çıktı | Beklenen |
|---|---|---|
| `rm -rf "<KOPYA>/a"; git worktree add "<KOPYA>/m1" HEAD` | izin, Jev: [] | KOD+TEK: silme kodla geçer, worktree öğesi Jev'e sorulur. Kural worktree kısa yolunu yalnızca tek öğeli komuta tanıyor. |

**Önem gerekçesi:** İki öğenin her biri ayrı ayrı kısa yola uyuyor. Bu yüzden etki küçük. Yine de kuralın "tek öğeli" koşulu delinmiş oluyor.

**Öneri:**
1. Yeniden girişte worktree kısa yolu kapatılsın. Örneğin kalan için ayrı bir bayrak geçirilsin ya da kısa yol yalnızca özgün komut tek öğeyse denensin.
2. Ya da kural metni bu birleşimi açıkça kapsayacak biçimde güncellensin.

---

## Şüpheler (bulgu sayılmadı)

1. **`-C` değeri herhangi bir mutlak yol olabiliyor:** Ana repo, `C:/` ya da `//sunucu/pay/repo` verildiğinde `KOD` dönüyor. Kural yalnızca "`-C <mutlak>`" dediği için bu uyumlu. Ancak kısa yol, ana reponun worktree kaydına ve dal listesine Jev'siz yazmaya izin veriyor (ref verilmeden çağrıldığında yeni dal açılıyor). Kural `-C`'yi kopya kökü ya da denetlenen işçinin worktree'si ile sınırlarsa bu boşluk kapanır.
2. **Kesin yasağın `-c` kapsamı:** Bash'te `git -c …` kısa yola zaten girmiyor; tek soru oluyor ya da `RED` dönüyor. Kesin yasak yalnızca bazı yapılandırma anahtarlarını tanıyor. Bulgu 1 kapanınca bu yalnızca Jev'in yargısına kalır; bu da kurala uygundur.
