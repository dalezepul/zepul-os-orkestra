# Faz 3 son doğrulama (K24–K27, bağımsız denetçi)

- **Tarih:** 2026-10-01 · **Denetlenen commit:** `6b851ab` (dal `main`, temiz başladı)
- **Düzen:** Kod değiştirilmedi. Sunucu `6b851ab` klonundan (`<Temp>/zepul-kabul5/kopya`) çalıştı. Ortam: `ZEPUL_TEST=1`, atılabilir `ZEPUL_TOKEN`, `ZEPUL_AYAR_DIZIN=<kabul5>/ayar`, `ZEPUL_TEST_KOK=<kabul5>`, `ZEPUL_PORT=8850`, `--sef-yok`. İşçi `<kabul5>/calisma` deposunda çalıştı (`origin` = çıplak `uzak.git`, push yok).
- **Senaryo:** `carp` işçisi (Sonnet) `lib.mjs`'e `carp` ve testini ekledi, TAMAM döndü. Kodun başlattığı `denetci-carp` (Opus) m1–m3 mutasyon kopyalarını açtı, bir mutasyonda testi kırmızıya döndürdü ve PASS verdi. Birleşme `e9f86a3` oldu. İzleyici betik birleşmeden 1,88 sn sonra `POST /api/kapat` çağırdı.

## Sonuç tablosu

| Madde | Sonuç | Kanıt |
|---|---|---|
| K25 kapanış | **geçti** | 13:27:32.637 PASS · 32.781 `birlesme tamam` · 34.663 kapat (birleşmeden 1882 ms sonra) · 35.702 `kapanis acik_worktreeler: []`. Süreç çıktıktan sonra `ayar/denetim/` boştu. `git worktree list` iki depoda da yalnız ana ağacı gösterdi. Denetçinin açtığı m1–m3 kopyalarından ikisi kirliydi; hepsi kaldırıldı. |
| K25 açılış | **geçti** (ana repo) | Açılıştan önce iki artık kurdum. `eski-1/m1`: sunucu reposunun kirli, dalsız worktree'si; açılışta listeden ve diskten silindi. `eski-2/m1`: `calisma`'nın kirli worktree'si; açılışta kaldı, çünkü açılış yalnız `REPO`'yu tarıyor. Kapanışta işçi deposu bilindiği için o da silindi. Üretimde işçi deposu hep `REPO` olduğundan (`izinliCwd`) bu yalnız test modunu etkileyen bir sınır. |
| K24 maliyet | **geçti** (olay); `/api/ajanlar` dolaylı | 13:27:34.687'de `denetci-carp maliyet 0.199342`, `toplam_usd 0.3145`. Kapanıştaki interrupt'tan sonra gelen son result kaybolmadı. Kapat'tan hemen önce `/api/ajanlar` 0 gösteriyordu, çünkü tur sürüyordu. Değer olay işlenirken ajan kaydına yazılıyor (`o.maliyet_usd = a.maliyet_usd`, `orkestra.ts:127`). Süreç 1 sn içinde çıktığı için API'den ayrıca okunamadı. Bekçi: olay `yay` içinden `bekciOlay`'a gidiyor (`orkestra.ts:139`), oradan `maliyet` BekciOlay'ı oluşuyor (`baglama.ts:404`). |
| K26 kopya içi silme | **kaldı** | Canlı denetim 28,7 sn sürdü (03.918 → 32.637). Hiç onay sorusu çıkmadı, ama denetçi bu koşuda silme komutu da çalıştırmadı. Gerçek `kapiKarari` ve gerçek Jev ile, bu koşunun kopya köküne (`kopya_kokleri`) yönelik komutlar denendi. Sonuçlar aşağıda. |
| K27 | **geçti** | `npm run denetim` 3 kez çalıştı. Üçünde de 242/242 geçti, çıkış 0, süre 13 sn. |
| panel-url.txt | **geçti** | Koşu öncesi ve sonrası sha256 aynı: `279ec65d…79ba8ec`. Sunucu adres dosyasını `<kabul5>/ayar/` altına yazdı. |

K26 için denenen komutlar:

- Sabit yol (`rm -rf "<kopya>/m1"`, `cd <kopya> && rm -rf m1 m2`, `Remove-Item -Recurse -Force <kopya>/m2`): kesin yasak katmanı artık geçiyor. Ancak Jev bu komutları **"geri-alinamaz" (güven 0,98–0,99)** sayıyor ve karar yine **insan** oluyor.
- Değişken hedef (`D=…; rm -rf "$D/m1"`, `M=…; rm -rf "$M"`): hâlâ "proje dışı ya da kök dizinde özyineli silme" kuralına takılıyor, karar insan.
- Sonuç: denetçi kopyasını silmeye kalkarsa onay sorusu yine çıkar; kimse yanıtlamazsa denetim 10 dk takılır (önceki koşudaki durum). Birim testi geçiyor, çünkü sahte Jev kullanıyor.

## Blocker'lar

| # | Önem | Açıklama | Öneri |
|---|---|---|---|
| K26 | düşük-orta | Kopya kökü içindeki özyineli silme yasak katmanından geçiyor ama Jev "geri-alinamaz" dediği için insana gidiyor. Değişken hedefli silme yasak katmanında kalıyor. Gerçek akışta takılma riski sürüyor. | Denetçi + tüm hedefler kopya kökü altında + yasak kalktıysa kapı Jev'e sormadan `izin` versin. Değişken hedefi ya çözümlesin ya da brife "kopyayı silme, kod kaldırır" yazılı olduğu için denetçiye red + açıklama dönsün (insana değil). Testte gerçek Jev'in "geri-alinamaz" yanıtı taklit edilsin. |
| K28 (yeni) | düşük | Kapanışta denetçinin kendi `kopyaTemizle`'si (`orkestra.ts:474`) kapanış temizliğiyle yarışıyor. Kopyalar silinmiş olduğu hâlde 13:27:35.573'te "2 denetim kopyası kaldırılamadı" hata olayı çıktı. Nedeni: başkasının sildiği kopya için `kopyaKaldir` `yok` döndürüyor ve bu `kalan` sayılıyor. Ayrıca interrupt, denetçiyi `durum: hata` (`error_during_execution`) olarak bırakıyor. | `kopyaTemizle`'de `yok` başarı sayılsın. Kapanış interrupt'ı hata olayı üretmesin. |
| K16 | yüksek (kullanıcı onayında) | GitHub'da dal koruması açık değil. | Değişmedi. |

## Hüküm

- **Faz 2:** "Yalnızca K16 dal koruması bekliyor" ifadesi **doğru**. K27 kapandı (3/3 yeşil). Kod tarafında Faz 2'yi tutan başka bir şey yok. Dal koruması açılana kadar NEEDS_WORK.
- **Faz 3: NEEDS_WORK.** K25 kapandı (kapanışta ve açılışta, ana repo). K24 olay düzeyinde kapandı. K27 kapandı. K26 gerçek Jev'le hâlâ insana düşüyor. Kalan iş K26'yı kapıda Jev'den önce çözmek. K28 kozmetik.

## Maliyet

| Ajan | Model | USD |
|---|---|---|
| carp | claude-sonnet-5-5 | 0,1152 |
| denetci-carp | claude-opus-5-5 | 0,1993 |
| **Toplam** | | **0,3145** (bütçe 0,4) |

K26 kapı denemelerindeki Jev çağrıları bu bütçenin dışında (OpenCode Zen).

## Kapanış

- Orkestra `/api/kapat` ile kapandı. 8850'de dinleyen süreç kalmadı.
- `zepul-kabul5` klasörü bırakıldı.
- Ana repoda bu rapor dışında değişiklik yok. Token rapora yazılmadı.
