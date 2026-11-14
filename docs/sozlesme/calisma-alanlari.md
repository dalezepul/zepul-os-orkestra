# Çalışma alanları sözleşmesi (kullanıcı kararı 04.10.2026)

Kullanıcı: "Orkestra tüm PC'de çalışsın. Bir klasöre erişmeden önce sorsun; ben evet dersem altındaki tüm dosyalara erişebilsin. Liste olsun, ben panelden (OS ve AI) eklerim. Şimdi zepul-ai'yi ekle."

## Ayar
- `ayarlar.json` → `calisma_alanlari: string[]`; kanonik mutlak klasör yolları, varsayılan `[]`. Zepul-os reposu her zaman alandır ve listede tutulmaz.
- Şef `ayar_yaz` ile bu alanı yazamaz (`SEF_YAZAMAZ`). Yalnızca panel ya da kullanıcı onayı değiştirir.
- Eklenemez: sürücü kökü (`C:\`), `%WINDIR%`, `Program Files*`, `%USERPROFILE%`'ın kendisi (alt klasörü olur), `%LOCALAPPDATA%\zepul-os` (panel belirteci), `.git` içi. Yol var olan bir klasör olmalı.

## Kapı
- Proje dışı okuma kuralında "kök" artık şunlardır: ajanın kökü, worktree, kopya kökü **ve** `calisma_alanlari` içindeki klasörler. Alan içindeki salt okuma Jev'siz izin alır.
- Alan içindeki yazma ve kabuk işleri bugünkü kapıdan geçer (kesin yasak, sahiplik, Jev). Sır dosyası kuralları alanlarda da geçerlidir.
- Alan dışındaki bir yola ilk dokunuşta karar `insan` olur; onay kartı `onay_tur:"alan"` ile açılır ve önerilen klasörü gösterir. Önerilen klasör, yolun git kökü; git kökü yoksa yolun bulunduğu klasördür. Kart iki seçenek sunar:
  - **Evet, bu klasörü alanlara ekle:** klasör listeye eklenir ve araç çalışır.
  - **Yalnızca bu sefer:** araç çalışır, klasör listeye eklenmez.
  - Hayır cevabı reddedilir.

## İşçiler
- `ajan_baslat` ve brif `cwd`/`repo` değeri alan içinde olabilir. Alan bir git deposuysa işçi o deponun worktree'sinde çalışır; denetçi ve birleştirme o depoda yapılır. Hedef dal, deponun o anki dalıdır.
- Alan git deposu değilse işçiye yazma görevi verilmez; şef bunu kullanıcıya söyler.
- İşçi, alanın kendi `CLAUDE.md`'sini okur ve ona uyar. Brife "Önce oku: <alan>/CLAUDE.md" eklenir.

## API
- `GET /api/alanlar` → `{alanlar: string[]}`
- `POST /api/alanlar` `{islem: "ekle"|"cikar", yol}` → `{alanlar}` ya da `400 {hata}`
- Yetki: panel token'ı ve zepul-ai anahtarı. zepul-ai tarafında bu uç yalnızca kullanıcının bastığı düğmeden çağrılır; modelin araç listesine girmez.
- SSE olayı `alanlar {alanlar}` her değişiklikte yayılır.
- Onay kartı (`onay_istek`) alan isteği için `{onay_tur:"alan", yol, onerilen}` (olayın kendi `tur` anahtarı `onay_istek` kalır) alanlarını taşır; `POST /api/onay` `{onay_id, karar, alana_ekle?: true}`.
