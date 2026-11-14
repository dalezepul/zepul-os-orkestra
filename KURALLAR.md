# KURALLAR

Bu dosya her ajanın brifine enjekte edilir. Kısa tutulur: her kural tek satır, ölçülebilir. Budamayı kâtip yapar.

## A. Yedi çivi

1. **Şef çalmaz:** Şef dosya yazmaz, komut çalıştırmaz; yalnızca böler, delege eder, özet okur, karar verir.
2. **Her işe doğru çalgı:** Model işe ve limite göre seçilir; her ajan çağrısında `model` alanı açıkça yazılır.
3. **Kimin dosyası?:** Her brif OWNS, DO-NOT-TOUCH ve "Önce oku" bloklarını içerir; brifi bu üç bloktan biri eksik olan ajan başlatılmaz.
4. **Rapor değil, sözleşme:** İşçi uzun rapor atmaz, tek JSON döner (G); `APPROVE` yoksa ya da blocker varsa düzeltme turunu **kod** açar.
5. **Kırmızıya döndür:** Kimse kendi işini onaylamaz; denetçi düzeltmeyi geri alır ve test kırmızıya dönmüyorsa test hiçbir şey ölçmüyor sayılır.
6. **Ajan ölür:** Limit dolar, 600 sn sessizlik olur; önlem dörttür: sık commit, parça parça rapor, diriltme mesajı, worktree (H).
7. **Bir kere söyle:** Aynı düzeltme iki kez yapılmaz, kurala yazılır; kural defteri arada bir budanır.

## B. Model

- Şef Opus 5.5'tir; yalnızca zor planlamada Fable'a çıkılır.
- İşçiler Sonnet 5.5 (varsayılan) ya da Opus 5.5 olur.
- Alt ajan olarak Fable YASAK; hiçbir brifte, hiçbir gerekçeyle kullanılmaz.
- İstisna (kullanıcı 29.09): kurulum aşamasında (orkestranın inşası) alt ajanlarda Fable serbest; ürün çalışma kuralı değişmez.
- SDK'da, brifte ve ajan tanımlarında (`.claude/agents/*.md`) model TAM KİMLİKLE yazılır: `claude-sonnet-5-5` / `claude-opus-5-5`; boş ya da `sonnet`/`opus` takma adı geçersizdir, kapı reddeder (takma ad yardımcı modele kayabilir: `sunucu/SPIKE.md`).
- Yerel model kimliği `ollama:<ad>` biçimindedir (ör. `ollama:qwen3-coder:30b`); Fable `ollama:` altında da yasaktır. Rol başına model (`sef`, `isci_basit`, `isci_hassas`, `denetci`) panelden değişir, şef değiştiremez; şefin brifteki Sonnet/Opus seçimi iş sınıfıdır, gerçek modeli ayar belirler. Test aşamasında (kullanıcı 02.10) tüm rollerin varsayılanı yereldir: `ollama:zepul-gptoss-cpu:latest` (gpt-oss:20b, `num_ctx 32768`, `num_gpu 0`; Modelfile `veri/ollama/`). Tamamen CPU'da çalışır, zepul-ai'nin GPU modelini boşaltmaz; aynı anda tek yerel ajan. Panelden Claude'a çevrilebilir.
- Test aşamasında denetçi de yereldir; bağımsızlık ayrı ajan ve oturumdan gelir (`denetci-<işçi>`), kimse kendi işini onaylamaz. Eşzamanlı yerel ajan sayısı `yerel_azami` ayarından gelir (varsayılan 1, aralık 1-4); şef bu sayıya girmez, denetçi girer, fazlası sırada bekler. Yalnızca panel değiştirir.
- İstisna (kullanıcı 04.10.2026): şefin `ikinci_gorus` danışma oturumu panelden seçilirse Fable ile açılabilir; bu oturum ajan değildir, yalnızca Read/Grep/Glob kullanır, yazma aracı yoktur. İşçi ve denetçide Fable yasağı aynen sürer. Kodda tek yer: `kapi.ts` `modelHatasi`, `IKINCI_GORUS_ROLU`.
- Yetenek döngüsü (`docs/sozlesme/yetenek-dongusu.md`): `[yetenek]` görevi reddedilmez; araç hedef depoda yazılır, denetlenir, birleşir; şef reddetmeden önce ikinci görüş alır.
- Eşzamanlı işçi sayısı ayardan gelir: `azami_isci` (varsayılan 4, tam sayı 1-12; dışı reddedilir, `bekci.ts`). Yalnızca panel değiştirir; şefin `ayar_yaz` aracına kapalıdır (`SEF_YAZAMAZ`). Şef ve denetçi bu sayıya girmez.

## C. Şef kod yazmaz

- Şefin araçları yalnızca `Read`, `Grep`, `Glob` ve bus MCP araçlarıdır (A1).
- Şef işçi çıktısını yalnızca özet ve JSON karar olarak okur; ham log yığmaz.

## D. Sahiplik

- OWNS dışındaki yola `Edit`/`Write` yapılmaz; kapı reddeder.
- Tüm yol denetimleri `sunucu/yol.ts` üzerindeki `kanonik()` fonksiyonundan geçer (8.3 kısa ad, Git Bash, UNC, junction).
- Başkasının dosyasına ihtiyaç doğarsa dosyaya dokunulmaz, sahibine `mesaj_gonder` ile mesaj atılır.
- Bir dosyaya aynı anda tek ajan yazar; çakışma varsa iş sıraya alınır.

## E. Commit

- Her mantıklı adımdan sonra commit atılır; tek commit tek konu içerir.
- `git status --porcelain` boş değilken iş bitirilmez (`Stop` hook'u engeller).
- Yasak git komutları: `reset`, `clean`, `checkout -- .`, `stash`, `rebase`; yalnızca `reset --hard` ve `clean -fd` insan onayıyla çalışır (F).
- `git push --force`/`-f` ASLA, onayla bile (kullanıcı kararı 29.09).
- Commit yalnızca kendi OWNS yollarını kapsar (`git add <yol>`); `git add .` ve `git add -A` yasaktır.
- `push` yalnızca faz sonunda, şefin kararıyla ve kodla yapılır; işçi süreçlerinde kapalıdır (F).
- Uzak depo `zepul-orkestra`dır. GitHub'daki `zepul-os` reposu ai-os'a aittir, ona asla push edilmez.
- Commit mesajı `<tür>: <kısa Türkçe açıklama>` biçimindedir; tür `docs`, `feat`, `chore`, `fix`.

## F. Kapı

- **Yıkıcı işlem metin eşlemesiyle değil yetenek kaldırılarak engellenir.**
  - İşçi süreçlerinde `git push` ve GitHub kimliği ortam değişkenleriyle kapalıdır (`sunucu/ortam.ts`).
  - Sınır (Faz 2-3 kabulü, K16): ortam katmanı caydırıcıdır, kesin değildir. İşçi kendi yazdığı bir betikte ortamı sıfırlayıp push edebilir; bu yol kapıdan geçmez. `git push --force` ASLA kuralı yerinde kalır; kesin önlem sunucu tarafındadır: GitHub `main` dal korumasında force push ve dal silme kapalı, yöneticiye de uygulanır (02.10.2026).
  - Ajan süreçlerine `ZEPUL_*` (panel belirteci), `GH_TOKEN`/`GITHUB_TOKEN` (push), `ANTHROPIC_API_KEY` ve `CLAUDE_CODE_*` kimlikleri (abonelik girişi) geçmez. Kullanıcı kararı 27.10.2026: diğer `_API_KEY`, `_TOKEN`, `_SECRET`, `_PASSWORD` adlı değişkenler geçer. `CLAUDE_CODE_OAUTH_TOKEN` geçer (`ortam.ts` `GECER`, tam ad eşlemesi); Claude modelli ajanda abonelik girişi için. Yerel (`ollama:`) ajanda `yerelOrtam` onu da siler. İşçide `GH_TOKEN` ve `GITHUB_TOKEN` `engelli` olarak yeniden yazılır.
- **Tip denetimi:** Her faz kapanışından önce `npm run denetim` (tsc + testler) yeşil olmalıdır.
- **Yalıtım:** İşçiler kullanıcının Windows hesabında çalışır (kullanıcı kararı 29.09: şimdilik yeterli); katmanlar sırayla: yetenek kaldırma, metin yasağı, Jev, `auto` modu, commit anında sahiplik. Faz 5 sonrası yeniden değerlendirilir.
- **İzin kaynağı:** Claude modelli ajanda kapı izin verince araç yerleşik `auto` sınıflandırıcıya bırakılır. Yerel (`ollama:`) ajanda sınıflandırıcı yoktur (`dontAsk`); kapının izni tek karar kaynağıdır (kesin yasak → sahiplik → Jev → insan). Jev'e ulaşılamazsa yerel ajanda salt okuma dışındaki her araç insana gider.
- **Bileşik komut (kapalı kapı):** Yalnızca katı alt kümede bölünür, en çok 4 parça Jev'e paralel sorulur. Alt küme: yalnızca yazdırılabilir karakter, dengeli tırnak, ayırıcı olarak yalnızca tırnak dışındaki `;` `&&` `||` `|`; yorum, heredoc, `$()`, ters tırnak, `<()` `>()`, `&`, `|&`, iç kabuk (`bash -c`, `cmd /c`, `powershell -c`, `eval`, `iex`) ve tırnak dışı `$` yok; her öğenin ilk sözcüğü izin listesinde (`git npm npx node tsx ls dir mkdir rm cat echo test [ pwd Get-ChildItem Get-Content Test-Path Write-Output`; `rm` yalnızca kopya içi silme kısa yolu için). Listede olmayan ilk sözcük görülürse komut bölünmez. Taşan komut tümüyle tek soru olur. Borunun sağındaki aşamalar beyaz listedeki süzgeçlerse (yalınç ad, açık bayrak listesi, dosya argümanı ve yönlendirme yok) atılır. Her parça güvenli ve ≥0,8 ise izin, biri değilse tümü insana. Denetçi mutasyon kopyasını yalnızca `mutasyon_kopyasi_ac` ve `mutasyon_kopyasi_sil` araçlarıyla açar ve siler; kabuktaki `rm` ve `git worktree` için kod izni yoktur, normal yoldan Jev'e gider; değişkenli silme hedefi reddedilir. Grep/Glob bir sır dosyasını ya da sır desenini (`.env*`, `*.key`, `.cred*`, `panel-url.*`, `zepul-ai-anahtar.*`) hedeflerse reddedilir. Kesin yasak taramasından önce metin normalleştirilir (NFKC, Unicode satır sonu, akıllı tırnak, tire benzerleri).
- **Süslü parantez alt kümesi (Glob/Grep, kapalı kapı):** Glob `pattern`'i ve Grep `glob`'u yalnızca `[A-Za-z0-9_.\-/*]` ve tek düzey `{a,b,...}` taşıyorsa (en çok 2 grup, en çok 32 açılım; iç içe parantez, `[..]`, boş alternatif, `..`, mutlak yol, sürücü harfi, `~` ve grup dışı virgül yok) açılır; her açılım sır, dizin jokeri ve proje dışı denetiminden ayrı geçer (`olay.ts susluAc`). Alt küme dışındaki her parantezli desen ile `path`/`type`'taki parantez insana gider; Grep'in `pattern`'i (içerik regex'i) bu kuralın dışındadır.
- **Proje dışı okuma ve ağ:** Salt okur araçlar (Read, Grep, Glob, NotebookRead) yalnızca ajanın kendi kökü, worktree kökü ve denetçide kopya kökü içinde Jev'siz izin alır; dışarıdaki okuma ve dizin bileşeninde joker içeren glob insana gider. WebFetch/WebSearch ile yerel ya da özel ağ adresine (DNS çözümü dahil), sayısal yazımlı IP'ye ve http(s) dışı şemaya erişim reddedilir; çözümleme hatası insana gider.
- **Çalışma alanları** (`docs/sozlesme/calisma-alanlari.md`): Ajanlar zepul-os dışında yalnızca `calisma_alanlari` içindeki klasörlerde okur ve işçi açar; alan dışındaki ilk okumada kullanıcıya "erişeyim mi" kartı açılır. Başka projede iş için `ajan_baslat`'ta `cwd` o projenin klasörüdür; alan git deposu değilse yazma görevi verilmez; alanın `CLAUDE.md`'si önce okunur ve uyulur. Listeyi yalnızca kullanıcı (panel ya da onay kartı) değiştirir.
- **Güven modu** (`docs/sozlesme/guven-modu.md`): Kapının kademesi yalnızca panel düğmesiyle değişir (`POST /api/guven`); sohbet mesajı yetki sayılmaz. `tam`: Jev ve insan sorulmaz; kesin yasak (bileşik komutta her parça dahil), panel belirteci kuralı, sahiplik, belirsiz yol, DNS hatası ve yerel ajanın WebFetch'i yine önce gelir. Alan kartı yalnızca `alan_otomatik` açıksa kendiliğinden onaylanır. `kullanici`: salt okuma dışındaki her araç insana gider. Toplu onay (`POST /api/onay/hepsi`) kesin yasak kartlarını atlar.
- **Laya yedeği:** Jev hata verirse karar Laya'dan alınır (`karar_kaynagi: laya-yedek`), aynı eşik uygulanır; 429 gelirse 10 dk Jev'e gidilmez; Laya da düşerse eski Jev hata yolu geçerlidir.
- **Kesin yasak iki seviyelidir (kullanıcı kararı 04.10.2026):** **ASLA** (red, onay sorulmaz): yalnızca `git push --force` ve biçimleri (E) ile onu gizleyen ya da açan git ayarı, ortam ezme ve `.git/config`/`hooks` yazma. **KULLANICI ONAYI:** geri dönüşsüz silme, `git reset --hard`, `git clean -fd`, proje dışında `rm -rf`, sistem ve güvenlik ayarı, sır dosyası ya da sır içeren dizinde okuma/yazma (Grep/Glob dahil), kimlik deposu. Bunlar red almaz: kart `onay_tur: "kesin"` ve "yalnızca sen onaylarsan" etiketiyle açılır, ntfy soru gider, tek tek onaylanır; toplu onay ve tam güven atlamaz. Onaylanan sırrın değeri olaylara ve günlüklere yazılmaz.
- **Kullanıcı isteği önceliği:** Şef kullanıcının isteğini kural gerekçesiyle reddetmez; kapı engellerse kullanıcıya sorar, onay gelince devam eder. Yalnızca ASLA listesi ve teknik olarak imkânsız işler reddedilir.
- **Ajan kararlarında uyarı:** Tam güvende Laya riskli ya da geri-alınamaz derse araç izin alır, ama `uyari` olayı yayılır ve ntfy uyarı gider (aynı ajana en çok 10 dk'da bir).
- **Jev:** Orkestra Jev'e (OpenCode Zen) ve Laya'ya (8788) doğrudan bağlanır; `serve.js`'e bağımlılık yok.
- **Laya:** Önce en az 500 etiketli gölge kaydı birikir, sonra yerelde (RTX 4060) kapı risk kararı için eğitilir; Jev kadar isabetli olunca devralır.
- Test ortamında ya da kabul testinde gerçek remote'a bağlı repoda yıkıcı git denemesi yapılmaz; bunun için sahte bare remote'lu geçici depo kullanılır.
- "Kod sayar, Jev yargılar": sayma, eşik, silme, onaylama kodun işidir; Jev asla onay vermez.
- Jev güveni 0,8'in altındaysa sonuç "belirsiz" sayılır ve insana gider.
- Jev olasılığı yüzde değil, yalnızca sıralama için kullanılır.
- Jev'e gitmeden önce panel belirteci, kullanıcı adı, kullanıcı dizini ve e-posta maskelenir. Kullanıcı kararı 27.10.2026: diğer sırlar (anahtar, token, parola) her sağlayıcıya gidebilir; sır süzgeci yoktur.
- Ajan oturumlarına kullanıcı MCP'leri yüklenmez: `settingSources:['project']` + `strictMcpConfig`. Bus dışı MCP'yi kapı reddeder.
- Aşağıdakiler kesin yasaktır; yalnızca insan onayıyla (panelde onay kutusu + ntfy `soru`) ve kullanıcı "yap" dedikten sonra yapılır:
  - Geri dönüşsüz silme, `git reset --hard`, `git clean -fd` (`git push --force` bu listede değil: E'de ASLA).
  - Proje dışında `rm -rf`; sistem ve güvenlik ayarı değişikliği.
  - Panel belirteci dosyaları: `panel-url.txt`, `panel-token`, `zepul-token`, `zepul-ai-anahtar*`, `orkestra-sunucu.log`, `zepul-ai-sunucu.log` (ajan kendi onayını veremesin). Genel sır dosyası listesi (`.env`, `*.key` …) 27.10.2026'da kaldırıldı.
  - Dışa mesaj gönderme (ntfy hariç), deploy, ödeme.

## G. Sözleşme

- İşçi dönüşü tek JSON'dur: `{verdict, blockers[], commits[], ozet}`; `ozet` en çok 3 cümledir.
- `verdict` değerleri: `TAMAM`, `KISMI`, `BASARISIZ`.
- Denetçi dönüşü `PASS` ya da `VETO` artı gerekçedir; gerekçesiz `VETO` geçersizdir.
- Denetçi, işi yapan işçiden ayrı bir oturumdur.
- Kanıt (test çıktısı, commit sha, diff) olmadan "bitti" denmez.

## H. Ölüm

- Rapor parça parça yazılır; ajan ölürse o ana kadarki rapor kalır.
- Tespit: 600 sn olay yoksa ya da `api_retry`/`rate_limit`/`result.is_error` gelirse ajan "ölü" sayılır.
- Yerel modelli ajanda ölüm eşiği `yerel_esik_carpani` ile çarpılır (varsayılan 3: 1800 sn, açık araçla 45 dk); yalnızca panel değiştirir.
- Diriltme mesajı biçimi: `kaldığın yer: <son rapor>, son commit: <sha>, devam et`.
- Diriltilen ajan işe başlamadan önce hasar kontrolü yapar: worktree kirli mi, son commit ne?
- Üç denemede dirilmezse ntfy `hata` gönderilir.
- Worktree'de `node_modules` için junction kurulmaz (git 2.51 junction hedefini boşaltabiliyor); kopyaları kod kaldırır (`kopyaKaldir`).

## I. Hata kaydı

- Her hata kaydında altı alan bulunur: `kaynak`, `tur`, `geri_alinabilir`, `devam_edilebilir`, `oneri`, `baglam`.
- `kaynak` değerleri: ağ, pc, claude-api, araç, ajan, kapı.
- `geri_alinabilir` ve `devam_edilebilir` yalnızca `evet` ya da `hayır` olur.
- Hatalar `logs/hatalar.jsonl` dosyasına yazılır; sessizce yutulmaz.

## J. Tekrar

- 2-3 kez tekrarlanan iş skill'e dönüştürülür (taslağı skill bahçıvanı yazar, şef onaylar).

## K. Hafıza

- Tek hafıza MyBrain'dir; ai-os'a dokunulmaz.
- Claude memory klasörü şişirilmez; en çok 1-2 işaretçi tutulur.
- MyBrain'e yalnızca kâtip yazar; diğer ajanlar yazmaz.
- Oturum başında `py -3 C:\Users\kullanici\Desktop\MyBrain\beyin.py context "<görev>" --budget-chars 5000` okunur.

## L. Bildirim

- ntfy yalnızca soru, hata, uyarı, uzun iş bitti ve faz kilometre taşında (`bilgilendirme`) kullanılır.
- Başlık biçimi `KONU: DURUM: açıklama` olur; `DURUM` = `soru` | `hata` | `uyarı` | `loop` | `bilgilendirme`.
- Mesaj tek satırdır; sır, dosya yolu ya da kişisel bilgi içermez (konu herkese açıktır).
- Araç: `node araclar/ntfy.mjs "<başlık>" "<mesaj>" [tag] [öncelik]`; her commit ve her adım için gönderilmez.

## M. Dil

- Tüm metin, commit mesajı ve rapor Türkçedir; ç ğ ı İ ö ş ü eksiksiz yazılır.
- Kod tanımlayıcıları ve teknik terimler özgün hâlinde kalır.

## N. Limit

- Sabit tavan yok: kullanıcı o günün tavanını söyler ("haftalığın %40'ı"); bekçi canlı limiti dakikada bir okur.
- Tavan aşılınca yeni iş başlamaz, iş kuyruğa kaydedilir; limit açılınca şef kullanıcıya sorar (otomatik başlatma yok).

- `yerel_yedek`: `kapali` (varsayılan ve kullanıcı kararı 02.10: GPU zepul-ai ve Laya'nın) | `sor` | `otomatik`. Bağlam 32k altındaysa, başka model yüklüyse ya da boş VRAM 1,5 GB altındaysa yerel model yüklenmez, iş kuyrukta kalır.

## O. Döngü bekçisi

- Aynı çağrı 3 kez tekrarlanırsa uyarı, 5 kez tekrarlanırsa durdurma.
- A-B döngüsü durdurulur.
- 30 dk ilerlemesiz kalan iş önce uyarılır, sonra durdurulur.
- 10 dakikada 3 USD'yi aşan maliyet hızı durdurulur.
- Yerel modelli ajanda ilerlemesiz süre (90 dk) ve tekrar durdurma eşiği (15) `yerel_esik_carpani` ile genişler; tekrar uyarısı (3) ve A-B döngüsü kuralı aynı kalır. Yerel maliyet 0 sayılır.
- Eşikler panelden ayarlanabilir.
