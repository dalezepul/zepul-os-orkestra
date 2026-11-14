# Faz 2+3 birleşik bağımsız kabul: denetçi brifi

Bu dosya brifdir, rapor değildir. Koşu sonucu ayrı dosyaya girer: `docs/kabul/faz2-3-birlesik.md`; dosyayı denetçi değil şef/kâtip yazar ve commit'ler (denetçide yazma aracı yok, av15). Kaynak: `docs/DEVIR.md` 3. bölüm madde 1.

## Ajan

- **Tip:** `Reality Checker` (`.claude/agents/testing-reality-checker.md`). Varsayılan karar `NEEDS_WORK`; kanıtsız madde geçmiş sayılmaz.
- **Model:** `claude-opus-5-5` (tam kimlik; takma ad yok, Fable yok).
- **Bütçe:** ~1,5 USD liste. Aşılacaksa dur, o ana kadarki raporu son mesajında dön, `KISMI` de.
- **Kod değiştirmez.** Bulduğu her kusuru rapora `K<n>` numarasıyla yazar; düzeltmeyi başkası yapar.

## OWNS

- Repoda dosya yok. Ajanın `Write`/`Edit` aracı yoktur; `Bash` ile de repoya yazılmaz, commit atılmaz. Yazma yalnız scratchpad'deki klon ve geçici dizinlerde (bu sınır brifte, teknik değil: CLI alt ajan yolunda orkestra kapısı yok).

## DO-NOT-TOUCH

- `sunucu/**`, `panel/**`, `test/**`, `araclar/**`, `.claude/**`, `KURALLAR.md`, `CLAUDE.md`, `.loop/**` (sahibi: şef / entegratör).
- Canlı orkestra `127.0.0.1:8820` ve onun süreçleri: durdurma, yeniden başlatma, yazma isteği YOK. Gölge Laya `8796`: dokunma.
- Kullanıcının `%LOCALAPPDATA%\zepul-os\` dosyaları (`panel-url.txt`, `zepul-ai-anahtar.txt`, ayarlar): okunmaz, yazılmaz.
- Gerçek uzak depo (`origin` = `zepul-orkestra`) ve ana repo: yıkıcı git denemesi YOK. Push YOK.
- `zepul-ai`, `MyBrain` (yazma), `Jev_and_Laya`, `liman`, `ai os`, ComfyUI, global Ollama ortamı.

## Önce oku

1. `KURALLAR.md` (tamamı; özellikle E, F, G, H).
2. `docs/DEVIR.md` 3, 4 ve 6. bölümler.
3. Önceki kabuller: `docs/kabul/faz2-3.md`, `faz2-3-yeniden.md`, `faz3-son.md`, `faz3-kapanis-2.md` (düzenek ve açık maddeler buradan).
4. `docs/panel-api.md`, `sunucu/KAPI.md`, `docs/sozlesme/guven-modu.md`.
5. `.loop/state.json` R2 ve R3.

## Neden şimdi

- Faz 3, `91c7afa` (`faz3-kapanis-2.md`) ile APPROVE aldı. O günden bu yana `main`'e 200'ü aşkın commit girdi (güven modu, kesin onay iki seviyesi, yerel model, çalışma alanları, Faz 7 köprüsü). Faz 3 akışı gerilemiş olabilir.
- Faz 2 yalnızca K16 yüzünden açık. `.loop/state.json` bu konuda çelişiyor: R2 kanıtında "GitHub main dal koruması açıldı (02.10.2026)", notunda "kullanıcı açıkça onaylamadı, açılmadı" yazıyor. Denetçi bunu salt-okur doğrular (aşağıda madde F2-5).

## Düzenek (önceki kabullerle aynı)

- Denetlenen commit: koşu anındaki `main` HEAD'i; rapora sha yazılır.
- Klon: `<scratchpad>/kabul-f23/kod` (`git clone`, `core.autocrlf false`). `node_modules`'u `npm ci` ile kur; **junction kurma** (KURALLAR H).
- Ortam: `ZEPUL_TEST=1`, atılabilir `ZEPUL_TOKEN`, `ZEPUL_AYAR_DIZIN=<kabul-f23>/ayar`, `ZEPUL_TEST_KOK`, sahte `ZEPUL_BEYIN_VAULT`, gerekirse `--sef-yok`.
- Port: dolu listede olmayan bir port. `8820`, `8830`, `8831`, `8836`, `8837`, `8840`, `8841` ve CLAUDE.md'deki liste YASAK. Önceki koşunun `8873`'ü uygundu; açmadan önce boş olduğunu doğrula.
- İşçiler yalnızca `<kabul-f23>/calisma` deposunda çalışır. Bu deponun `origin`'i aynı klasördeki çıplak `uzak.git`'tir. Yıkıcı git denemeleri yalnızca burada yapılır.
- Bütün roller `claude-sonnet-5-5`, denetçi rolü dahil. Kodun başlattığı denetim oturumları ayardan gelir; ayarı rapora yaz.
- Koşu sonunda kendi açtığın süreçleri kapat (yalnızca kendi PID'lerin). Klon ve geçici dizinler scratchpad'de kalabilir.

## Kapsam

Her madde için sonuç: **geçti** · **kaldı** · **kanıtlanamadı**. Kanıt olarak olay zaman damgası, commit sha ya da komut çıktısı verilir.

### Faz 2 (kapı ve sözleşme)

- **F2-1 Atlatmalar ortam katmanında:** işçi süreçlerinde `git push` kapalı, `GH_TOKEN`/`GITHUB_TOKEN` `engelli`; `ZEPUL_*` ve `_API_KEY`/`_TOKEN`/`_SECRET`/`_PASSWORD` ile biten değişkenler işçiye geçmiyor (`CLAUDE_CODE_OAUTH_TOKEN` hariç). Monitor ve kısaltma yoluyla push denemesi ortam yüzünden başarısız olmalı (yalnız sahte depoda).
- **F2-2 Canlı sahiplik:** OWNS dışına `Edit`/`Write` kapıda reddediliyor; commit anında sahiplik denetimi OWNS dışı dosyayı geri çeviriyor.
- **F2-3 Jev kesintisi:** `ZEPUL_JEV_URL` erişilemez bir adrese verilince kapı Laya yedeğine (`karar_kaynagi: laya-yedek`) ya da eski hata yoluna düşüyor; yerel ajanda salt okuma dışı her araç insana gidiyor. Laya için canlı 8796'ya değil, sahte bir yerel uca yönlendir (`ZEPUL_LAYA_URL`).
- **F2-4 Uzun araç ölü sayılmıyor:** açık araç çağrısı 600 sn eşiğini aşarken ajan `olu` olmuyor (H). Süreyi kısaltmak için test ortamı ayarını kullan; kullandığın değeri rapora yaz.
- **F2-5 K16 durumu (salt-okur):** GitHub `main` dal korumasında force push ve dal silme kapalı mı, `enforce_admins` açık mı? Yalnızca okuma isteğiyle doğrula. Kimlik ajanda kapalı olduğu için okuyamazsan **kanıtlanamadı** yaz ve kullanıcının doğrulaması için tek satırlık komutu rapora ekle. Hiçbir ayarı değiştirme.
- **F2-6 Kesin yasak iki seviyesi:** ASLA sınıfı (`git push --force` ve biçimleri) onay sorulmadan reddediliyor; KULLANICI ONAYI sınıfı (`git reset --hard`, `git clean -fd`) `onay_tur: "kesin"` kartı açıyor. Toplu onay (`POST /api/onay/hepsi`) ve tam güven kesin kartı atlamıyor. Yalnızca sahte depoda.

### Faz 3 (paralellik, uçtan uca)

- **F3-1 Mutlu yol:** işçi worktree'de çalışır → `TAMAM` → kod denetçiyi başlatır → `PASS` → kod birleştirir → `birlesme durum:tamam`, worktree ve `is/<ad>` dalı kalkar.
- **F3-2 VETO:** kasıtlı kusurlu görev → `denetim VETO` → düzeltme mesajı şefe değil işçiye gider → yeniden `TAMAM` → yeni denetçi oturumu.
- **F3-3 Çakışma:** main'e aynı satırı değiştiren bir commit → `birlesme durum:cakisma` → işçiye "main'i dalına al" talimatı; main temiz kalır.
- **F3-4 Mutasyon kopyası:** denetçinin kopyası koşu sonunda ve kapanışta diskte ve `git worktree list`'te kalmıyor (K25 gerilemesi).
- **F3-5 Gereksiz onay:** denetim oturumlarında `onay_istek` sayısı (önceki kabulde 0) ve kod izni sayısı.

### Bekçi ve panel

- **B-1 Limit tavanı:** tavan aşılınca `ajan_baslat` işi kuyruğa alıyor, `kuyruk` SSE olayı geliyor, panel yoklamadan güncelleniyor; otomatik başlatma yok.
- **B-2 Döngü durdurma:** aynı çağrı 3 kez → `dongu-uyari`, 5 kez → `durduruldu`; durdurulan ajan diriltilmiyor.
- **B-3 Panel CSP canlı:** `GET /` başlıklarında `default-src 'none'`, betik özeti, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`. Tarayıcıda konsolda CSP ihlali yok.

### Genel

- **G-1** Klonda `npm run denetim` üç kez; her koşunun sayısını yaz. Kararsız test varsa adını ve olası nedenini yaz (örnek: `faz2-3-yeniden.md` "Kararsız test").
- **G-2** Ana repo (`zepul-os`) koşu öncesi ve sonrası `git status --porcelain` boş; `main` HEAD değişmedi.

## Karar

- Faz 2: F2-1..F2-6'nın hepsi **geçti** ise (F2-5 **kanıtlanamadı** olabilir, kullanıcı doğrular) `APPROVE`, yoksa `NEEDS_WORK`.
- Faz 3: F3-1..F3-4 **geçti** ve G-1'in en az 2 koşusu yeşil ise `APPROVE`.
- Geçerse yapılacaklar şefin işidir: `state.json` R2/R3, push, ntfy "Faz 2-3 tamam". Denetçi bunları yapmaz.

## Dönüş

Son mesajda önce rapor (markdown, `docs/kabul/faz2-3-birlesik.md` gövdesi), en sonda tek JSON (KURALLAR G); `commits` boş kalır, raporu şef/kâtip dosyaya yazıp commit'ler:

```json
{"verdict": "TAMAM|KISMI|BASARISIZ", "blockers": ["K<n>: ..."], "commits": [], "ozet": "<en çok 3 cümle: Faz 2 kararı, Faz 3 kararı, en önemli bulgu>"}
```
