# Faz 2-3 dar yeniden kabul (bağımsız denetçi)

- **Tarih:** 2026-10-01 · **Denetlenen commit:** `db09119` (dal `main`, temiz başladı, temiz bitti)
- **Düzen:** Kod değiştirilmedi. Sunucu aynı commit'in klonundan (`<scratchpad>/kabul4/kopya`) çalıştı. Ortam: `ZEPUL_TEST=1`, atılabilir `ZEPUL_TOKEN`, `ZEPUL_AYAR_DIZIN=<kabul4>/ayar`, `ZEPUL_PORT=8840`, `--sef-yok`. İşçiler yalnızca `<kabul4>/calisma` deposunda çalıştı; `origin` aynı klasördeki çıplak `uzak.git`. 8830 kullanıcıda doluydu (100.80.x ve 127.0.0.1); dokunulmadı, 8840 seçildi.
- **Bütçe:** 0,5 USD. C3, C4 ve C6'yı tek bir gerçek işçi (`duzelt`, Sonnet) ve kodun başlattığı iki Opus denetim oturumu birlikte kapsadı.

## Özet tablo

| Madde | Sonuç | Kanıt (kısa) |
|---|---|---|
| 1. C3: VETO → işçiye düzeltme (canlı) | **geçti** | Kasıtlı kusur: kabul ölçütü "ilk satır merhaba", görev "selam yaz". 12:58:12.933'te `denetim VETO` geldi; aynı milisaniyede `mesaj denetci-duzelt → duzelt` "Düzeltme turu 1/2: … 'merhaba' yapıp yeni commit" gitti (şefe değil, işçiye). İşçi 12:58:17'de `511d78d` ile düzeltip TAMAM döndü; kod denetçiyi 0,09 sn içinde yeniden başlattı. |
| 2. C4: çakışma → merge talimatı (canlı) | **geçti** | İşçi `is/duzelt` dalını açtıktan sonra ikinci yazıcı main'e aynı satırı değiştiren `f790d07` commit'ini attı. Sıra: 13:08:52.457 PASS → 13:08:52.718 `birlesme durum:cakisma cakisan:[notlar/a.md]` → işçiye "Birleştirmede çakışma (1/2): notlar/a.md. main'i dalına al (git merge main) …". İşçi `git merge main` koştu ve CONFLICT gördü. main `f790d07`'de kaldı, `git status` temiz (merge --abort çalıştı). Not: ikinci yazıcı gerçek işçi değil, main'e doğrudan atılmış bir commit. OWNS çakışması iki işçinin aynı anda açılmasını engellediği için aynı kod yolu ancak bu şekilde tetiklenebiliyor. |
| 3a. C6/K17: kopya kaldırıcı gerçek kirli kopyada | **geçti** (kopyada, gerçek kod) | Denetçinin bıraktığı gerçek mutasyon kopyası (`m1`, detached, `M  notlar/a.md`) `kopyaTemizle` ile kaldırıldı. Kopya `git worktree list`'ten düştü, `denetim/` kökü silindi. İşçi worktree'si ve `is/duzelt` dalı yerinde kaldı. |
| 3b. C6: VETO sonrası kopya | kanıtlanamadı | Birinci denetçi VETO'yu mutasyon yapmadan verdi. VETO anında ve 30 sn sonra listede kopya yoktu; yani temizlenecek bir şey de oluşmadı. |
| 3c. C6: kapanışta kopya kalmıyor | **kaldı** (canlı) | Kapanış PASS'ten 5,5 sn sonra başladı. `kopyaTemizle`, `kapatBekle(denetci)`'nin 30 sn'lik beklemesinin arkasında kaldı; `kapat()` kopyaları temizlemiyor. Kapanış olayındaki `acik_worktreeler` listesinde `…\denetim\duzelt-1790859497777\m1 (dal "")` vardı. Süreç bittikten 8 sn sonra kopya hâlâ diskte ve `git worktree list`'teydi (K25). |
| 4. K18: port | **geçti** (canlı) | `0.0.0.0:8841`'de geçici dinleyici açıkken `ZEPUL_PORT=8841` → "HATA: 8841 portu başka bir süreçte dolu …", çıkış 1. `ZEPUL_PORT=8788` → "dolu port listesinde", çıkış 1. `ZEPUL_PORT=8840` → sunucu `127.0.0.1:8840`'ta açıldı. |
| 5a. K20 (canlı) | **geçti** | `dokunma` eksik → 400 "DO-NOT-TOUCH boş olamaz; yoksa açıkça [{"yol":"(yok)","sahip":"-"}] yaz". `(yok)` başka bir yolla birlikte → 400 "beyanı tek başına olmalı". Worktree açılmadı, ajan listesi boş kaldı. |
| 5b. K23 (canlı + birim) | **geçti** | Sunucu adres dosyasını `<kabul4>/ayar/panel-url.txt`'ye yazdı. Kullanıcının `panel-url.txt` dosyasının sha256'sı koşu öncesi ve sonrası aynı (`279ec65d…79ba8ec`). Birim: "panelUrlDosyasi: test modunda …". |
| 6. `npm run denetim` ×5 | **4/5 yeşil** | 236 test. 1. koşuda 1 test kaldı, sonraki 4 koşu 236/236 (11–13 sn). Ana repo koşulardan sonra da temizdi. |
| 7. K16 | belgeler tamam; dal koruması bekliyor | KURALLAR F'deki "Sınır" satırı ve KAPI.md "Ortam katmanı" bölümü, ortam katmanının caydırıcı olduğunu ve kesin önlemin dal koruması olduğunu yazıyor. "ASLA" kuralı yerinde. GitHub'a dokunulmadı. |

### Kararsız test

`calistir: zaman aşımında çocuk ve torun birlikte ölür (W9)` (`test/yasam.test.ts:183`): `assert.rejects(..., /zaman aşımı/)` beklenirken "Command failed: node.exe -e …" geldi.

Olası neden üründeki bir yarış (`sunucu/yasam.ts:15-20`):

- Zaman aşımında `taskkill` çocuğu öldürüyor.
- Çocuk ölünce `execFile` geri çağrısı `reddet(e)` ile reddediyor. Bu çoğu zaman `taskkill`'in kendi geri çağrısındaki `red()`'den önce geliyor.
- İlk ret kazandığı için "zaman aşımı" mesajı kayboluyor.

Süreç ağacı yine ölüyor; yalnızca hatanın türü yanlış raporlanıyor. Düzeltme: zamanlayıcı ateşlendiyse `execFile` geri çağrısı yok sayılsın (bayrakla), ya da önce zaman aşımı hatasıyla reddedilsin, `taskkill` sonra çalışsın.

### Ek gözlemler (bu koşudan)

- **Denetçi maliyeti kayda düşmedi:** iki `denetci-duzelt` oturumu için hiç `maliyet` olayı yok; `/api/ajanlar` 0 USD gösterdi. Önceki kabulde aynı olay PASS'ten 11 sn sonra geliyordu.
  - Birinci oturumun maliyeti büyük olasılıkla, aynı kimlikle 5 sn içinde ikinci oturum açıldığı için kayboldu.
  - İkinci oturumun maliyeti kapanışla kesildi.
  - Sonuç: bekçinin maliyet hızı ve panel toplamı denetçi maliyetini eksik sayıyor (K24).
- **Denetçi kendi kopyası için insan onayı bekledi:** denetçinin `M=<denetim kopyası>` içeren bir Bash komutu kapıda "proje dışı ya da kök dizinde özyineli silme" sayıldı ve `insan` kararı aldı. Onay süresi 10 dk sonra doldu (red); denetçi başka bir yoldan devam etti. Bu yüzden tek bir denetim 10,5 dk sürdü ve kullanıcıya onay sorusu gitti (K26).

## Maliyet

| Ajan | Model | USD |
|---|---|---|
| duzelt (2 tur + merge denemesi) | claude-sonnet-5-5 | 0,1047 (ölçülen) |
| denetci-duzelt ×2 | claude-opus-5-5 | ölçülemedi (K24); tahmin 0,25–0,35 (önceki tam denetim 0,34 tutmuştu, bu ikisi daha kısa) |
| **Toplam** | | **≈ 0,40 (tahmin, en çok 0,46)** |

Bütçe kalmadığı için iki şey denenmedi: VETO'da kirli kopya oluşturmak (3b) ve kapanış yarışını (3c) yeniden koşmak.

## Blocker'lar

| # | Önem | Açıklama | Dosya:satır | Öneri |
|---|---|---|---|---|
| K25 | orta | Denetimden kısa süre sonra (≤30 sn) kapanış olursa denetçi kopyası diskte kalıyor. `kopyaTemizle` `kapatBekle`'nin arkasında bekliyor; `kapat()` kopyaları yalnızca listeliyor, temizlemiyor; 8 sn sonra süreç zorla çıkıyor. Canlıda gerçek kirli `m1` kopyası kaldı. | `sunucu/baglama.ts:512-515`, `sunucu/orkestra.ts:780-795` | `kapat()` içinde açık `a.denetim` kayıtları için `kopyaTemizle` çağrılsın (oturumlar kapandıktan sonra, `acikWorktreeler`'den önce), ya da açılışta `<ayar>/denetim/` altındaki artık kopyalar temizlensin. Test "PASS'ten hemen sonra kapat" senaryosuyla yazılsın. |
| K24 | orta | Denetçi oturumlarının maliyeti olaylara ve `/api/ajanlar`'a düşmüyor (0 USD). Bekçinin maliyet hızı ve tavanı Opus denetimini saymıyor. | `sunucu/orkestra.ts:122-128`, `:339-345` (aynı kimlikle yeniden açılış ve kapanış) | Oturum kapatılmadan önce son `result` beklensin ya da denetçi kimliği her tur için ayrı olsun (`denetci-<isci>-<n>`). Bir testte VETO → hızlı yeniden denetim senaryosunda maliyetin toplandığı doğrulansın. |
| K26 | düşük | Denetçinin kendi mutasyon kopyasındaki silme komutu kapıda "proje dışı" sayılıp insana gidiyor. Denetim 10 dk takıldı, kullanıcıya gereksiz onay sorusu çıktı. | kapı yol sezgisi (`sunucu/olay.ts` / `sunucu/kapi.ts`) | Denetçi için `kopya_koku` altı proje içi sayılsın. |
| K27 | düşük | `calistir` zaman aşımı yarışı: test 5 koşudan 1'inde kalıyor, hatanın türü yanlış raporlanıyor. | `sunucu/yasam.ts:15-20`, `test/yasam.test.ts:183` | Zamanlayıcı ateşlenince `execFile` geri çağrısı yok sayılsın. |
| K16 | yüksek (kullanıcı onayında) | GitHub'da dal koruması açılmadı. Belgeler artık sınırı doğru yazıyor. | GitHub ayarı | Kullanıcı onaylayınca `main` için force push ve dal silme kapatılsın. |

Kapanan blocker'lar:

- **K17:** kaldırıcı gerçek kirli kopyada çalışıyor; kalan kapanış yarışı K25 olarak ayrıldı.
- **K18**, **K20**, **K23**.
- **K19:** C3 ve C4 canlıda geçti.

## Hüküm

**Faz 2: NEEDS_WORK.** Dal koruması dışında Faz 2'yi tutan bir şey kalmadı:

- K16 belgeleri sınırı doğru yazıyor.
- K18, K20 ve K23 canlıda kapandı.
- Kararsız test (K27) düşük önemde ve Faz 2'yi tutmuyor.

GitHub'da `main` için dal koruması açıldığı anda Faz 2 APPROVE olur; kod değişikliği gerekmez.

**Faz 3: NEEDS_WORK.**

- Geçenler: C3 (VETO → işçiye düzeltme) ve C4 (çakışma → `git merge main` talimatı, main temiz) ilk kez canlıda geçti. Kopya kaldırıcı gerçek kirli kopyayı siliyor.
- Kalanlar: C6'nın "kapanışta da kalmıyor" koşulu canlıda kaldı (K25). Denetçi maliyeti sayılmıyor (K24).
- Düzeltme turu: K25 ve K24 düzeltilsin, ardından tek bir kısa canlı koşu yapılsın: PASS'ten hemen sonra kapat; kopya listesi boş, denetçi maliyeti sıfırdan büyük olmalı.

## Kapanış

- Orkestra `POST /api/kapat` ile kapandı ve 8840 boşaldı. Geçici dinleyici kapandı. `kabul4` içeren süreç kalmadı.
- `calisma`'da işçi worktree'si (`is/duzelt`, yarım merge) tasarım gereği kaldı. Kalan denetçi kopyası `kopyaTemizle` ile kaldırıldı. `uzak.git`'e push yapılmadı.
- Ana repoda bu rapor dışında değişiklik yok. Token rapora yazılmadı.
