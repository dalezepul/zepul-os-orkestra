# Faz 7 sözleşmesi: zepul-ai ↔ orkestra

Kararlar: kullanıcı, 02.10.2026 (`docs/yol-haritasi.md` Faz 7, `docs/arastirma/zepul-ai-senkron.md`). Bu dosya iki tarafın uyacağı tek kaynaktır; değişiklik şefin onayıyla yapılır.

## 1. Anahtar (dar yetki)

- Orkestra ilk açılışta `%LOCALAPPDATA%\zepul-os\zepul-ai-anahtar.txt` dosyasını üretir (rastgele 32 bayt, hex) ve sonra değiştirmez. Test modunda (`ZEPUL_TEST=1`) gerçek dosyaya yazılmaz.
- zepul-ai bu anahtarı, bugün panel token'ını gönderdiği biçimde gönderir.
- Anahtarın yetkili olduğu uçlar: `GET /api/akis`, `GET /api/olaylar`, `GET /api/ajanlar`, `POST /api/gorev`, `POST /api/onay`, `POST /api/zepul-ai/cevap`, `POST /api/katip-not`, `GET /api/alanlar`, `POST /api/alanlar` (yalnızca kullanıcı düğmesiyle), `POST /api/gorev/iptal {gorev_id}` (yalnızca kullanıcı düğmesiyle; görev BASARISIZ "iptal edildi"), `GET /api/guven`, `POST /api/guven` ve `POST /api/onay/hepsi` (güven modu, yalnızca kullanıcı düğmesiyle; `docs/sozlesme/guven-modu.md`; kodda `ZEPUL_AI_UCLARI`). Diğer her uç (ör. `/api/mesaj`, ayarlar, kapat) bu anahtarla **403** döner.
- Panel token'ı her şeye yetkili kalır.

## 2. Görev

- `POST /api/gorev` `{metin, gorev_id?}` → `{gorev_id}`.
- Şefe şu biçimde gider: `[kaynak: zepul-ai · güven: orta] <metin>`. Şef bunu kullanıcı talimatı saymaz; orta güvenli talimat olarak tartar.
- Olaylar (SSE): `gorev_alindi {gorev_id}`, `gorev_sonuc {gorev_id, verdict, ozet}`.

## 3. "Emin misin?" dönüşü

- Şef işi riskli bulursa `zepul_ai_sor` aracını çağırır → olay `zepul_ai_soru {soru_id, gorev_id, soru}`.
- Cevap: `POST /api/zepul-ai/cevap` `{soru_id, karar: "evet"|"hayir", not?}`. Şefe `[kullanıcı, zepul-ai üzerinden] <karar> <not>` olarak gider.
- Cevap gelene kadar görev bekler; 24 saat sonra iptal olur ve `gorev_sonuc` döner (`verdict: "BASARISIZ"`, `ozet: "cevap gelmedi"`).

## 4. Kapı onayları

- Mevcut `onay_istek` olayı ve `POST /api/onay` `{onay_id, karar, not?}` aynen kalır; zepul-ai anahtarıyla da kabul edilir.
- Olay kaydına `kaynak: "zepul-ai"` yazılır.

## 5. MyBrain (tek yazar kâtip)

- `POST /api/katip-not` `{tur: "note"|"task"|"receipt", veri: {...}}` → `{tamam, id}`. MyBrain'e yazan orkestranın kâtip kodudur.
- zepul-ai MyBrain'e doğrudan yazmaz. Orkestra kapalıysa not `zepul-ai/veri/katip-kuyruk.jsonl` dosyasına yazılır, bağlantı gelince sırayla gönderilir.
- MyBrain okuma (`context`) zepul-ai'de serbest kalır.

## 6. Güvenlik kuralı (zepul-ai tarafı)

- Onay ve cevap çağrıları (`onayla`, `cevapla`) **yalnızca kullanıcının bastığı panel düğmesinden** çağrılır. Modelin araç listesinde bulunmazlar; bir test bunu doğrular.
- `orkestra_gorev` aracı model tarafından çağrılabilir; artık `/api/mesaj` değil `/api/gorev` kullanır.

## Güncelleme 04.10.2026: görev kimliği ve süre
- Şefe giden ileti: `[kaynak: zepul-ai · güven: orta] [görev: <id>] <metin>`. Şef sonucu `TAMAM [<id>]:` (ya da `REDDEDİLDİ [<id>]:`, `BAŞARISIZ [<id>]:`) biçiminde yazar; birden fazla açık görevde kimliksiz sonuç hiçbir görevi kapatmaz.
- Süre sınırı: `gorev_sure_dk` 120, `yetenek_gorev_sure_dk` 240; süre dolunca `BASARISIZ` "süre doldu". Bekçi şefi durdurursa `BASARISIZ` "bekçi durdurdu".
