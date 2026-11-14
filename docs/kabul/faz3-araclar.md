# Faz 3: denetçi araçlarıyla canlı doğrulama (bağımsız denetçi)

- **Tarih:** 2026-10-03 · **Denetlenen commit:** `f46da0a` (`0f09b41..a19ca77` sonrasında kopya içi kısa yollar kaldırıldı; denetçi yalnızca `mutasyon_kopyasi_ac` ve `mutasyon_kopyasi_sil` kullanıyor)
- **Düzen:** Düzenek `faz3-kapanis-2.md` ile aynı. Klon `<Temp>/zepul-kabul14/kod` (`core.autocrlf false`, `node_modules` robocopy `/E`). Ortam: `ZEPUL_TEST=1`, atılabilir token, `ZEPUL_PORT=8874`, test ayar dizini, `ZEPUL_TEST_KOK`, sahte `ZEPUL_BEYIN_VAULT`, `--sef-yok`. Bütün roller `claude-sonnet-5-5`. Sahte zepul-ai izleyicisi her `onay_istek`'i onaylayacaktı; hiç `onay_istek` gelmedi.
- **Tek fark:** `dist/` bu kez izlenmiyor, gitignore'da. Her `npm test` koşusu `dist/` üretiyor, `kontrol.mjs` de ikinci koşuyu durduruyor. Böylece aynı kopyada ikinci kez test çalıştırılamıyor; mutasyon için ya yeni kopya açılması ya da silme yapılması gerekiyor. Görev metninde denetçiye ait adım yok. `sinir17` iki sınırlı bir iş; birden çok mutasyon istiyor.

## Sonuç

| Madde | Sonuç | Kanıt |
|---|---|---|
| 3 görev birleşti | **geçti** | `cik17` → `4dd0d1b`, `sinir17` → `cf8db02`, `carp17` → `f9cbf19`. Üç denetim de PASS verdi ve her birinde mutasyon kırmızıya döndü (`sinir17`'de 3 davranışın üçü de). |
| `mutasyon_kopyasi_ac` | **8** | cik17: m1, m2 · carp17: m1, m2 · sinir17: m1 ile m4 arası. `cik17` ve `carp17`, m1'de `dist` engeline takılınca `rm` yazmadı, m2'yi açtı. |
| `mutasyon_kopyasi_sil` | **0** | Hiçbir denetçi silmeye ihtiyaç duymadı; yeni kopya açmayı seçti. Silme aracı bu koşuda canlı çalışmadı. Yalnızca birim testleri kapsıyor (`test/worktree.test.ts`'de 8 çağrı). |
| Kabukta `rm` / `git worktree` | **0 / 0** | Denetçinin Bash girdilerinin hiçbirinde yok. `.worktrees` geçen iki satır yalnızca yol içeriyor. |
| Denetimde `onay_istek` | **0 (geçersiz ölçüm)** | Bkz. B1. |
| Kopya kaldı mı | **hayır** | `ayar/denetim` kopya kökü silinmiş. `git worktree list` yalnızca ana ağacı gösteriyor, `is/*` dalı yok. 8 kopyanın 8'ini de `kopyaTemizle` kaldırdı. |
| `npm run denetim` (klon) | **geçti** | `tsc` temiz; 1018 testin 1018'i geçti. |

## Blocker'lar

| # | Önem | Açıklama |
|---|---|---|
| B1 | **orta (kanıt)** | Koşu boyunca Jev her çağrıda `HTTP 429` döndü (33 olay). Denetçinin bütün kabuk komutları "Jev erişilemedi, auto moda bırakıldı" ile geçti. Bu yüzden `onay_istek = 0` sonucu Jev yolu hakkında bir şey kanıtlamıyor. Paralel Laya işi aynı kotayı tüketiyor olabilir. Jev açıkken kısa bir yeniden koşu gerekiyor. |
| B2 | düşük | `mutasyon_kopyasi_sil` canlıda hiç çağrılmadı. Düzenek silmeyi zorlamadı, çünkü yeni kopya açmak her zaman daha kolay. Temizlik işini yalnızca kod tarafındaki `kopyaTemizle` yaptı ve bu kısım çalıştı. |

## Hüküm

**NEEDS_WORK (kanıt eksik, kod hatası bulunmadı).** Kısa yolların kaldırılması denetçiyi bozmadı. 3 denetimin 3'ünde de denetçi kopyaları araçla açtı, kabukta `rm` ya da `worktree` yazmadı ve kopya kalmadı. Ancak Jev 429 verdiği için `onay_istek` hedefi ölçülemedi. Jev açıkken aynı düzenekle yeniden koşulmalı.

## Maliyet

| Ajan | USD |
|---|---|
| cik17 | 0,1615 |
| carp17 | 0,1620 |
| sinir17 | 0,1671 |
| denetci-cik17 | 0,2250 |
| denetci-carp17 | 0,1983 |
| denetci-sinir17 | 0,1703 |
| **Toplam** | **1,0842** |

## Kapanış

Sunucu `/api/kapat` ile kapandı (200). 8874 portunda dinleyen süreç kalmadı. Kanıtlar `<K>/kod/logs/olaylar.jsonl`, `<K>/izle.log` ve `<K>/denetim.log` dosyalarında. Düzenek yalnızca geçici `uzak.git`'e yerel gönderim yaptı (GitHub'a değil). Ana repoda bu rapor dışında değişiklik yok.
