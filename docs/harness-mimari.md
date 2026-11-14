# Claude Code oturumları (harness) — mimari

Amaç: Claude Code oturumlarını (ana ve kardeş oturumlar) OS panelinden başlatmak ve sürdürmek. Araç çağrıları, ara mesajlar ve sonuç canlı görünsün. Kod: `sunucu/harness.ts`, uçlar `sunucu/orkestra.ts`, panelde "Claude Code" düğmesi.

## Süreç modeli

- Her tur bir süreçtir: `claude -p --output-format stream-json --verbose --model <tam kimlik> --permission-mode <mod>`.
- Devam etmek için aynı argümanlara `--resume <session_id>` eklenir. `session_id` ilk stream-json satırından alınır.
- Model açık yazılır. Panel takma adı tam kimliğe çevrilir: `sonnet` → `claude-sonnet-5-5`, `opus` → `claude-opus-5-5` (KURALLAR B). Fable sunulmaz.
- İzin modları `default`, `acceptEdits` ve `plan`'dır. `bypassPermissions` bu turda yok; **kullanıcı onayıyla eklenecek**.
- Shell kullanılmaz. Komut argüman dizisiyle `spawn` edilir (`shell: false`). İstem stdin'den yazılır, bu yüzden kaçış sorunu çıkmaz.
- İkili `ZEPUL_CLAUDE_IKILI` ile değişir, varsayılanı PATH'teki `claude`'dur. Testler `komut: [node, test/sahte-claude.mjs]` verir.
- Ortam `ajanOrtami` ile süzülür: `ZEPUL_*` ve sır adlı değişkenler geçmez.
- cwd, `izinliCwd` ile denetlenir. İzinli kökler repo, `repo/.worktrees/*` ve çalışma alanlarıdır; denetim `yol.ts kanonik` üzerinden yapılır. Klasör var olmalıdır.

## Akış biçimi

stdout'taki her satır JSON olarak ayrıştırılır. JSON olmayan satır atlanır.

1. Satır, SDK mesajıyla aynı biçimdedir. `olay.ts sdkMesajiOlaya` onu `metin`, `arac` (ad ve kısa girdi), `arac_sonuc` (özet) ve `hata` olaylarına çevirir. Ajan alanı `cc-<id>` olur.
2. `result` satırı `maliyet` olayına çevrilir. Olayda birikmiş `maliyet_usd`, `tur_maliyet` ve `sonuc {basarili, tur, tur_sayisi, sure_ms}` alanları bulunur. Panel bunu tek satırda gösterir.
3. Olaylar orkestranın `yay()` fonksiyonundan geçer. Böylece halka tampona, `logs/olaylar.jsonl`'a ve mevcut SSE kanalına (`/api/akis`) düşer.
4. Durum olayları şunlardır: `calisiyor` → `bekliyor` (tur bitti, sürdürülebilir) | `hata` (sıfırdan farklı çıkış kodu, stderr'in son kısmı hata olayına yazılır) | `durdu`.

## Kalıcı oturum kaydı

`logs/cc-oturumlar.jsonl` dosyasına her durum değişikliğinde bir satır eklenir. Satırda id, session_id, cwd, model, izin, durum, pid, maliyet ve istem özeti bulunur. Açılışta her id için son satır geçerli sayılır.

Önceki sunucudan kalan çalışıyor kaydı `durdu` olarak işaretlenir ve `pid` null yapılır. O PID'e dokunulmaz, çünkü numara artık başka bir sürece ait olabilir. Oturum yine `--resume` ile sürdürülebilir.

## Uçlar

Hepsi panel token'ı ister. Yalnızca yerel bağlantıdan (`127.0.0.1`) kabul edilir. zepul-ai anahtarı bu uçlara giremez.

- `GET /api/cc`: oturum listesi. Oturumlar `GET /api/ajanlar`'da da `rol: "claude-code"` olarak listelenir.
- `POST /api/cc/baslat` `{cwd, istem, model, izin}`.
- `POST /api/cc/devam` `{id, istem}`. Panelin yazma kutusu (`POST /api/mesaj`) da aynı işi yapar. Oturum çalışırken 423 döner.
- `POST /api/cc/durdur` `{id}`.
- `POST /api/cc/denetle` `{id}`: brifli oturumun kabulüne karşı doğrulama oturumu.

## Durdurma

Yalnızca bu yöneticinin başlattığı ve bellekte tuttuğu süreç durdurulur. Windows'ta `taskkill /PID <pid> /T /F`, diğer sistemlerde `SIGTERM` kullanılır. Sunucu kapanırken kendi açtığı claude süreçleri de durdurulur.

## Brif ve doğrulama

Başın asıl işi, işi parçalara bölmek, her parçaya iyi bir brif yazmak ve sonucu doğrulamaktır. Bu turda en küçük sürüm yapıldı.

- **Brif şablonu** `sunucu/brif.ts`'tedir. Alanlar: görev, **bağlam** (bu turda zorunlu oldu: neden, mevcut durum, bilinmesi gereken), OWNS, DO-NOT-TOUCH, önce oku, kabul ölçütü, dönüş sözleşmesi ve kurallar (KURALLAR.md). Eksik ya da kısa alanı olan brif reddedilir. Hem şefin `ajan_baslat` aracında hem `POST /api/cc/baslat`'ta (`brif` alanı) bu kural geçerlidir. Brifli oturumun istemi `brifMetni`'dir.
- **Doğrulama** `POST /api/cc/denetle {id}` ile yapılır. Brifli oturumun kabulüne karşı ayrı bir oturum açılır: plan modu, salt okur, varsayılan Opus. Kimse kendi işini onaylamaz. İstem, Reality Checker tutumunu taşır: varsayılan karar VETO, kanıtı olmayan madde karşılanmamış sayılır. Dönen JSON `denetci.ts denetimDogrula` ile doğrulanır. Geçerliyse `denetim` olayı (panelde denetim kartı), geçersizse `cc_denetim_gecersiz` hata olayı yayılır.
- **Sınır:** Plan modunda komut çalışmaz. Bu yüzden kırmızıya döndürme (mutasyon) adımı `uygulanamadi` olarak kalır. Test koşan denetim, kapı köprüsüyle birlikte sonraki tura kaldı.
- Panelde "Claude Code" penceresinde bir "Brif" bölümü ve oturum listesinde "Denetle" düğmesi var.

## Sonraki turlar

- **Alt ajan ağacı:** `Agent`/`Task` tool_use olayları ve `parent_tool_use_id` alanından ağaç kurulacak. `sdkMesajiOlaya` alt ajan olaylarını şimdiden `cc-<id>/<alt>` olarak işaretliyor; panelde iç içe gösterim eksik.
- **Başın bölme adımı:** Baş, görevi parçalara ayırıp her parçaya brif yazacak; işçi sözleşmesi (`sozlesme.ts`) ve denetim sonucu birleştirme kararına bağlanacak.
- **Başın kural motoru:** Oturumları izleyen bir baş eklenecek. Bekçi eşiklerini (tekrar, ilerlemesizlik, maliyet hızı) cc olaylarına da uygulayacak ve uyarı verip gerekirse durduracak. İzin isteyen araçlar için kapı ya da onay kartı köprüsü olacak (`--permission-prompt-tool`).
- **Çoklu oturum:** Kardeş oturumlar, oturumlar arası mesaj ve eşzamanlı oturum sınırı eklenecek.
- `bypassPermissions` kullanıcı onayıyla eklenecek.
- Uzun ömürlü süreç (`--input-format stream-json`) değerlendirilecek; böylece tur başına yeniden başlatma maliyeti ortadan kalkar.
