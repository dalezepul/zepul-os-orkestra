# Güven modu sözleşmesi (kullanıcı isteği 04.10.2026)

Kullanıcı: "Ben yetki verdiğimde sormasın; onay veriyorum hepsine demiştim." Bu yetki zepul-ai'ye yazılan sohbet mesajlarıyla verilemez. Kapının onayını metin değil, kullanıcının bastığı bir düğme değiştirir: bir asistan ya da işçi metni kullanıcı gibi görünebilir.

## Ayar
- `ayarlar.json` → `guven_modu: {kademe: "kullanici"|"jev"|"tam", bitis: number|null}`
  - `bitis`: ms zaman damgası; `null` ise süresiz.
  - Varsayılan `{kademe: "jev", bitis: null}`; bugünkü davranış budur.
  - Süre dolunca kademe kendiliğinden `jev`'e döner ve bir olay yayılır.
- Şef bu alanı yazamaz (`SEF_YAZAMAZ`). Değiştirmenin tek yolu panel düğmesidir: OS paneli ya da zepul-ai paneli.

## Kademeler
| Kademe | Ne olur |
|---|---|
| `kullanici` | Salt okuma dışındaki her araç kullanıcıya sorulur. |
| `jev` | Bugünkü kapı: kesin yasak → sahiplik → kapalı kapı → Jev (parça parça) → gerekirse insan. |
| `tam` | Jev'e ve kullanıcıya **sorulmaz**, araç doğrudan izin alır. |

## Her kademede kalan katmanlar
- **Kesin yasaklar:** force push, `reset --hard`, proje dışı `rm -rf` vb. Kullanıcının 29.09'daki "ASLA" kararı.
- **Sır dosyası kuralları.**
- **Sahiplik:** OWNS dışına yazılmaz.
- **Çalışma alanı kartı:** yeni bir klasöre ilk erişimde sorulur. Kullanıcı isterse kart da `tam` kademesinde otomatik onaylanabilir; bunun için ayrı bir onay kutusu bulunur: `alan_otomatik: true`.

## Bekleyen onaylar
- Panelde "Bekleyenlerin hepsini onayla" düğmesi bulunur.
- Kademe `tam` yapılırken bekleyen onaylar da kullanıcının düğmesiyle birlikte onaylanabilir. Bunun için onay penceresinde bir seçenek yer alır.

## API
- `GET /api/guven` → `{kademe, bitis, alan_otomatik}`
- `POST /api/guven` → `{kademe, sure_dk?, alan_otomatik?}` (`sure_dk` verilmezse süresiz)
- `POST /api/onay/hepsi` → `{karar: "evet"}`
- Yetki: panel token'ı ve zepul-ai anahtarı. zepul-ai'de bu uçlar yalnızca kullanıcının bastığı düğmeden çağrılır; modelin araç listesine girmez.
- SSE olayı: `guven {kademe, bitis}`

## Görünürlük
- Kademe `tam` iken her iki panelde de belirgin bir şerit görünür: "Tam güven: Jev ve onay sorulmuyor · kalan süre".
- Kapı olaylarında karar `izin (tam güven)` olarak işaretlenir. Laya gölgesi ve istatistikler sürmeye devam eder: Jev'e yine sorulur, kararı etkilemez ama kayda geçer. Böylece Laya verisi birikmeye devam eder. Jev kotasını korumak için `tam` kademesinde Jev çağrısı yapılmaz; yalnızca Laya gölgesi kaydedilir.

## Jev hatasında Laya yedeği (kullanıcı kararı 04.10.2026)
- Jev hata verirse (429 kota, ağ, zaman aşımı, geçersiz yanıt) karar geçici olarak eğitilmiş Laya'ya sorulur (`ZEPUL_LAYA_URL`, varsayılan 8796).
- Laya'nın kararı Jev ile aynı kurallarla işlenir: parça parça birleştirme, 0,8 güven eşiği, riskli/geri-alınamaz → insan.
- Laya da hata verirse eski Jev hata yolu geçerlidir (Claude ajanında auto, yerel ajanda insan).
- 429 sonrası yaklaşık 10 dk soğuma: bu sürede doğrudan Laya'ya gidilir, sonra Jev yeniden denenir.
- Kapı olayında `karar_kaynagi: "laya-yedek"` yazılır; panelde "Laya (Jev yedeği)" rozeti gösterilir. Kesin yasak, panel belirteci ve sahiplik her durumda önce gelir.
- Bu, Laya'nın kalıcı devralması değildir; devralma gölge haftası ve kullanıcı onayıyla ayrıca kararlaştırılır.

## Güncelleme 04.10.2026: kesin yasak iki seviyeli
- Her kademede yalnızca **ASLA** listesi (force push ve onu açan git ayarı/ortam ezme/.git yazma) red alır.
- Diğer kesin yasaklar (panel belirteci, reset --hard, clean -fd, proje dışı rm -rf, sistem ayarı) `onay_tur: "kesin"` kartıyla kullanıcıya gider; toplu onay ve `tam` kademesi bu kartları atlamaz.
- `tam` kademesinde Laya riskli/geri-alınamaz derse izin + `uyari` olayı + ntfy uyarı (ajan başına 10 dk'da bir).

## Güncelleme 04.10.2026: tam güvende ölçüm (aday 1, 2, 12)
- `tam` kademesinde Jev gölgede de sorulur: kabuk araçlarında (Bash, PowerShell) her zaman, diğer araçlarda her 3 karardan birinde (`TAM_JEV_ORNEK`). Kararı değiştirmez, beklenmez. Jev soğumadaysa ya da hata verirse sorgu atlanır, 429 soğumayı başlatır. Gölge kaydında `jev`, `laya`, `uyum` ve `kademe: "tam"` aynı satıra yazılır. Yukarıdaki "Jev çağrısı yapılmaz" cümlesinin yerine bu kural geçer.
- `/api/laya-istatistik` → `canli.riskli_guvenli_sanma {sayi, toplam, oran}`: Jev riskli ya da geri-alınamaz dediğinde Laya'nın güvenli dediği kayıtlar. Panelde devralma eşiğinin (≤%2) yanında gösterilir.
- `tam` kademesinde kabuk aracında Laya "güvenli" dese de güveni 0,5'in altındaysa (`TAM_UYARI_GUVEN`) aynı uyarı gider (`sinif: "dusuk-guven"`); ajan başına 10 dk'lık ntfy seyreltmesi değişmez.
