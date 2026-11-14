# Yetenek döngüsü ve ikinci görüş (kullanıcı isteği 04.10.2026)

Kullanıcı: "Bundan sonra 'yapamıyorum' yok. İstediğim özellik eklenecek; 2. kez istediğimde yapacak. Yapamadığında bunu yapabilecek skill'i/aracı sana (orkestraya) devretsin, sen ona ya da kendine ekle; senkron olmanız gerekiyor. 2. görüş için ayrı bir modele sorabilirsin."

## 1. zepul-ai tarafı
- Asistan bir isteği mevcut araçlarıyla yapamıyorsa "yapamıyorum" demez. Bunun yerine `yetenek_eksik` aracını çağırır ve kullanıcıya şunu söyler: "Bunu şu an yapamıyorum, aracını orkestraya yazdırıyorum; hazır olunca haber vereceğim."
- `yetenek_eksik {istek, eksik, ornek_girdi?}` aracı modelin araç listesindedir. Onay ya da yetki aracı değildir; yalnızca bir görev açar.
  - Orkestraya `POST /api/gorev` gönderir. Metin `[yetenek] ` önekiyle başlar ve şunları içerir: kullanıcının özgün isteği, neyin eksik olduğu, hedef depo (zepul-ai), beklenen araç adı önerisi.
  - Aynı eksik için 24 saat içinde ikinci görev açmaz; açık görevi hatırlatır.
- Yeni araç birleşince asistan yeniden başlatılana kadar aracı göremez. Asistan kullanıcıya "hazır, beni yeniden başlat ya da komut merkezinde 3'e bas" der.
- `veri/yetenekler.jsonl`: istenen ve eklenen yeteneklerin kaydı (`istek`, `durum: istendi|eklendi|reddedildi`, `arac`, `gorev_id`, `ts`). Panelde "Yetenekler" listesi olarak gösterilir.

## 2. Orkestra tarafı
- Şef `[yetenek]` önekli görevi **reddetmez**. Adımlar:
  1. Hedef depoda (çalışma alanı) bir işçi başlatır. İşçi aracı mevcut araç kalıbıyla yazar ve testini ekler; aracın kendi güvenlik seviyesi uygun olmalı (dışa dönük ya da yıkıcıysa onaylı).
  2. Denetçi PASS verirse iş birleşir.
  3. Şef sonucu `TAMAM [gorev-id]:` biçiminde yazar (sunucu yalnızca o görevi kapatır); özette aracın adı ve nasıl kullanılacağı yazar.
  4. ntfy bilgilendirme gönderir: "Zepul OS: bilgilendirme: yeni yetenek hazır".
- Yeteneğin kişisel veri okuması gerekiyorsa (tarayıcı geçmişi, e-posta vb.) araç yalnızca okur, veriyi dışarı göndermez. Kapsamı kullanıcının isteğiyle sınırlıdır.
- İstek ASLA listesine giriyorsa ya da teknik olarak imkânsızsa şef önce ikinci görüş alır, sonra nedenini ve alternatifini yazar.

## 3. İkinci görüş
- Şefin `ikinci_gorus {soru, baglam}` aracı vardır. Bu araç ayrı bir oturumda, yalnızca okuma araçlarıyla, `ikinci_gorus_modeli` ayarındaki modele danışır.
  - Varsayılan model `claude-opus-5-5`.
  - Ayar panelden değişir; şef bu ayarı yazamaz.
  - Fable yalnızca kullanıcı panelden seçerse kullanılır. Bu yalnızca danışma oturumu içindir; işçi değildir ve yazma aracı yoktur. Kullanıcı kararı 04.10.2026.
- Şef ikinci görüşü şu durumlarda alır:
  - bir isteği reddetmeden önce
  - mimari ya da geri dönüşü zor bir plan kararında
  - denetçi VETO'su ile işçi arasında anlaşmazlık olduğunda
- Görüş olay olarak (`ikinci_gorus`) panelde görünür.
