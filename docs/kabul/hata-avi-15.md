# Hata avı, 15. tur: K29/K30 ve olay süzgeci

- **Kapsam:** HEAD `69e7089`. Aralık `a0ba670..69e7089` (hata-avi-14 commit'inden bu yana). Kod incelemesinin ağırlığı bugünkü `aa54f34..69e7089` değişikliklerinde:
  - `d69de7d` `GET /api/olaylar ?tur=` süzgeci (`baglama.ts:1195` `olaySec`, `orkestra.ts` uç).
  - `e22e48a` faz55 `yerelYedekSor` testi bekleme döngüsü, `9ef819b` `persistSession: false`.
  - `073f532` K29 `.gitattributes` (`*.bat`/`*.cmd` `eol=crlf`).
  - `7478008`, `cd616e4` K30 doküman-yalnız kural (`denetci.ts:24-26`, `:60-67`, `:93`, `:129-137`).
  - `1f49b15` K30 ekleri: önceki karar girdisi (`baglama.ts:811`, `denetci.ts:110-116`) ve OWNS dışı VETO → şef (`baglama.ts:789-797`, `:808-810`).
  - `347da15`, `bec0014` `testing-reality-checker.md` araç listesi ve ölü atıf.
  - Satır numaraları `69e7089` içindir.
- **Kural:** `KURALLAR.md` B (bağımsız denetçi), E/F (sahiplik, kapı), `DEVIR.md` 4. bölüm (3 mercekli salt-okur av), K30 gerekçesi (`test/denetci.test.ts:131-132`).
- **Yöntem:**
  - Salt okur: kod, test ve canlı 8820 değiştirilmedi. Tek yazılan bu rapor.
  - Geçici betik scratchpad'de (`av15.mts`), repo dışında. Betik `ownsDisiYollar`, `dokumanYalniz` ve `denetimDogrula`'yı `ZEPUL_TEST=1` ile doğrudan çağırdı; kabuk komutu, ağ çağrısı ya da ajan başlatılmadı.
  - `git ls-files --eol` ve `git check-attr` ile `.bat` satır sonları okundu.
- **Mercekler:** doğruluk (D), savunma güvenliği (S), Windows (W). Güvenlik bulguları savunma diliyle yazıldı: ne korunmuyor, nasıl kapatılır.

**Örnek sayısı 21.** `ownsDisiYollar` için 10 blocker metni, `dokumanYalniz` için 5 dosya listesi, `KIRMIZI` sezgiseli için 6 doküman-yalnız VETO.

## Özet

| # | Mercek | Önem | Yer | Başlık |
|---|---|---|---|---|
| 1 | D/S | orta | `denetci.ts:26`, `:64-66` | "kırmızı" kelime sezgiseli iki yönde de yanılıyor; meşru doküman VETO'su reddedilip denetçi PASS'e itiliyor |
| 2 | S | orta | `denetci.ts:24-25` | Davranış taşıyan `.md` dosyaları (ajan tanımı, skill, `KURALLAR.md`, `CLAUDE.md`) doküman-yalnız sayılıyor; kırmızıya döndür adımı atlanıyor |
| 3 | S | orta | `.claude/agents/testing-reality-checker.md:8`, `:11` | Reality Checker'a `Bash, Write, Edit` verildi; yorumdaki "yol sınırı kapıdadır" bu ajanın koşulduğu yolda geçerli değil |
| 4 | D | düşük | `baglama.ts:789-797` | `ownsDisiYollar` yanlış negatif: `dosya:satır`, `#L12`, `’` kesmesi ve kökteki çıplak dosya adı yakalanmıyor |
| 5 | D | düşük | `baglama.ts:793-796`, `:809-810` | `ownsDisiYollar` yanlış pozitif: bağlam için anılan yol, `1.5/2.0`, şemasız adres düzeltme turunu tümden şefe çeviriyor |
| 6 | D | düşük | `denetci.ts:62`, `:130` | Doküman işinde `yesil-kaldi` kuralı brifle çelişiyor; brif kopya açmayı yasakladığı için bu yol pratikte ölü |
| 7 | S | düşük | `denetci.ts:110-116`, `baglama.ts:811` | Önceki denetimin blocker'ları yeni brife tırnaksız ve "veridir" notu olmadan giriyor; blocker sayısı sınırsız |
| 8 | W | düşük | `.gitattributes`, `test/golge-port.test.ts:18-27` | `eol=crlf` yalnız yeni checkout'ta etkili; LF ile çıkmış eski klon temiz görünür ve LF kalır |

Sayım: yüksek 0, orta 3, düşük 5. Tur temiz değil.

- OWNS kaçağı yok: `ownsDisiYollar` yalnız yönlendirme kararı veriyor, yazma iznini değiştirmiyor; OWNS dışı yazmayı kapı ve commit anı sahiplik denetimi yine reddediyor.
- Kapı atlatma ya da sır sızıntısı bulunmadı. `onceki_denetim` gerekçe ve blocker'ları `maskele` ile geçiyor.

## Bulgu 1 (orta): "kırmızı" kelime sezgiseli iki yönde de yanılıyor

- **Yer:** `sunucu/denetci.ts:26` (`KIRMIZI = /k[ıi]rm[ıi]z[ıi]/i`), `:64-66`.
- **Kanıt** (`denetimDogrula(VETO, ["docs/a.md"])`, tek blocker):

| Blocker `ne` | Gerçek anlam | Sonuç | Beklenen |
|---|---|---|---|
| `README'de kırmızı uyarı kutusu eksik` | kabul eksiği | geçersiz | geçerli VETO |
| `kabul 2: KIRMIZI bayrak bölümü yazılmamış` | kabul eksiği | geçersiz | geçerli VETO |
| `kirmizi kanit yok` | kanıt yokluğu | geçersiz | geçersiz |
| `mutasyon kanıtı yok` | kanıt yokluğu | geçerli | geçersiz |
| `test yok` | kanıt yokluğu | geçerli | geçersiz |
| `no failing test proves this` | kanıt yokluğu | geçerli | geçersiz |

- **Etki:**
  - Yanlış pozitif: konusu "kırmızı" kelimesini içeren (renk, uyarı, kırmızı test anlatımı) meşru doküman VETO'su reddediliyor. Hata metni "yoksa PASS ver" diyor; denetçi kelimeyi değiştirmezse işi PASS'e çevirme yönünde itiliyor. Varsayılan VETO ilkesinin tersi.
  - Yanlış negatif: K30'un kapatmak istediği tutarsızlık ("kırmızı kanıt yok" VETO'su) başka sözcüklerle aynen geçiyor; "aynı diff her koşuda aynı kuralı alır" (`denetci.ts:8`) sağlanmıyor.
  - Yalnız `ne` alanı okunuyor; `nerede` ve `oneri` bakılmıyor.
- **Öneri:** Metin sezgiseli yerine şemaya yapısal alan: doküman-yalnız işte her VETO blocker'ı bir kabul maddesine ya da 5. adım bulgu türüne bağlansın (ör. `kabul_maddesi: number` ya da `tur: "kabul" | "owns" | ...`), alan yoksa geçersiz. Ara çözüm: ret mesajından "yoksa PASS ver" çıkarılsın, ret yalnız denetçiye yeniden yazdırsın.

## Bulgu 2 (orta): Davranış taşıyan `.md` dosyaları doküman-yalnız sayılıyor

- **Yer:** `sunucu/denetci.ts:24-25` (`DOKUMAN = /\.(md|txt)$/i`, `dokumanYalniz`).
- **Kanıt:** `dokumanYalniz([".claude/agents/x.md"])` → `true`; `dokumanYalniz(["KURALLAR.md"])` → `true`. Bu dosyalar çalışma zamanı girdisi:
  - `.claude/agents/*.md` ön bilgisi ajanın `tools` ve `model` alanını belirliyor (bu aralıkta `347da15` tam olarak bunu değiştirdi). Orkestra `settingSources: ["project"]` ile bu dizini yüklüyor (`orkestra.ts:505`).
  - `KURALLAR.md` her oturumda her ajanın brifine enjekte ediliyor (`orkestra.ts:611`).
  - `.claude/skills/**/SKILL.md`, `CLAUDE.md`, testin okuduğu `sunucu/DUMAN.md`.
- **Etki:** Bu dosyalardan yalnızca birini değiştiren işte denetçi brifi "KIRMIZIYA DÖNDÜR uygulanmaz … kopya açma" diyor (`denetci.ts:130`) ve "kırmızı kanıt yokluğu VETO gerekçesi değildir" kuralı devreye giriyor. Yetki ya da kural metnini değiştiren bir iş, düz doküman gibi en hafif denetimden geçiyor. 1-2 ve 4-5. adımlar sürüyor; eksilen mutasyon kanıtı ve bunu VETO'ya bağlama imkânı.
- **Öneri:** Doküman-yalnız muafiyeti bir izin listesine bağlansın (ör. `docs/**`, `raporlar/**` altındaki `.md`/`.txt`), `.claude/**`, `KURALLAR.md`, `CLAUDE.md`, `BRIEF.md` ve testin okuduğu dokümanlar muafiyet dışında kalsın; bu yollar değiştiyse denetimin sonucu ayrıca şefe/insana bildirilsin. `.rst`, `.adoc` gibi gerçek doküman türleri bugün kod sayılıyor (daha sıkı yön, bulgu değil); izin listesi bunları da kapsayabilir.

## Bulgu 3 (orta): Reality Checker'ın yazma araçları için iddia edilen kapı sınırı bu yolda yok

- **Yer:** `.claude/agents/testing-reality-checker.md:8` (`tools: Read, Grep, Glob, Bash, Write, Edit`), `:11` yorumu: "yol sınırı araç listesinde değil, brifteki OWNS ve kapıdadır".
- **Kanıt:**
  - Kabul koşusu bu ajanı şefin Claude Code oturumunda alt ajan olarak çalıştırıyor (`docs/kabul/brif-faz2-3-birlesik.md:7`, `:12-14`). Zepul OS kapısı yalnız orkestranın SDK oturumlarına `PreToolUse` hook'u olarak takılıyor (`orkestra.ts:510`, `baglama.ts:1532`). Depoda `.claude/settings.json` yok; bu yolda proje düzeyinde kapı hook'u da yok.
  - Orkestra oturumundan alt ajan olarak çağrılırsa araç çağrıları üst ajanın kimliği ve OWNS'u ile değerlendirilir; brifteki "yalnız `docs/kabul/<rapor>.md`" OWNS'unu kapı bilmez (SDK'da alt ajan hook davranışı ayrıca doğrulanmalı).
  - Sonuç: brifin DO-NOT-TOUCH listesi (`sunucu/**`, `.claude/**`, `KURALLAR.md`, `CLAUDE.md`) bugün teknik olarak değil, ajanın uymasıyla korunuyor. `Bash` ile `Write`/`Edit` kısıtı da fiilen anlamsız.
  - DEVIR 3. bölüm "araç listesi daraltıldı" diyor; önceki tüm araçlardan (MCP dahil) altıya indi, bu doğru, ama yazma ve kabuk açık kaldı.
- **Öneri:** Yorum gerçeğe uydurulsun ("CLI alt ajan yolunda yol sınırı yalnız brifte"). Rapor yazımı sonucu dönüş metniyle şefe bırakılıp ajan `Read, Grep, Glob, Bash` ile sınırlanabilir; ya da kabul koşusu orkestra üzerinden `denetci` rolüyle (`yazilabilir_kokler`) başlatılarak kapı sınırı gerçek kılınır. `security-ai-generated-code-auditor.md` zaten `Read, Grep, Glob` ile sınırlı; aynı desen.

## Bulgu 4 (düşük): `ownsDisiYollar` yanlış negatif

- **Yer:** `sunucu/baglama.ts:793-796`. `ponytail` yorumu (`:790`) çıplak adı ve mutlak yolu bilerek atlıyor; aşağıdakilerin bir kısmı yorumda yok.
- **Kanıt** (OWNS `["docs/**"]`, worktree repo kökü):

| Blocker metni | Çıktı | Beklenen |
|---|---|---|
| `[orta] eksik (sunucu/kapi.ts:443) → düzelt` | `[]` | `sunucu/kapi.ts` |
| `sunucu/kapi.ts#L12` | `[]` | `sunucu/kapi.ts` |
| `sunucu/kapi.ts’de kural` (U+2019) | `[]` | `sunucu/kapi.ts` |
| `package.json betiği eksik` | `[]` | `package.json` |
| `KURALLAR.md F maddesi` | `[]` | `KURALLAR.md` |

- **Etki:** Denetçi `nerede` alanını önceki turların biçimiyle (`dosya:satır`) yazınca OWNS dışı düzeltme yakalanmıyor; K30'dan önceki çıkmaz geri geliyor: işçiye yapamayacağı bir düzeltme turu açılıyor, `AZAMI_DUZELTME` dolunca iş yine şefe düşüyor. Yazma kapıda reddedildiği için OWNS kaçağı yok, yalnız tur ve bütçe kaybı.
- **Öneri:** Belirteçten `:<sayı>(:<sayı>)?` ve `#L<sayı>` sonekini at, `’` ve `‘` ayırıcılara eklensin; "/" şartı yerine uzantılı belirteç worktree'de gerçekten var mı (ya da dalın değişen dosyaları içinde mi) diye bakılsın. Bu, kökteki `package.json`, `KURALLAR.md`, `CLAUDE.md`, `tsconfig.json` adlarını da yakalar.

## Bulgu 5 (düşük): `ownsDisiYollar` yanlış pozitif ve tümden şefe yönlendirme

- **Yer:** `sunucu/baglama.ts:793-796`, `:809-810`.
- **Kanıt:**
  - `docs/DEVIR.md'deki kural sunucu/kapi.ts'de zaten var` → `["sunucu/kapi.ts"]`. Düzeltme OWNS içindeki `docs/DEVIR.md`'de olduğu hâlde iş şefe gidiyor.
  - `oran 1.5/2.0 düşük` → `["1.5/2.0"]`; `github.com/foo/bar.git` → `["github.com/foo/bar.git"]`.
  - Blocker'lardan biri OWNS dışı bir yol anınca, diğer blocker'lar işçinin düzeltebileceği türden olsa da düzeltme turu hiç açılmıyor (`:810`).
  - `yesil-kaldi`'dan üretilen blocker `nerede` olarak test yolunu taşıyor (`denetci.ts` `denetimdenSozlesmeye`); test dosyası OWNS'ta olmayan işte her `yesil-kaldi` şefe gidiyor. `test/entegrasyon.test.ts`'teki eski testin OWNS'una `test/**` eklenmesi bunun izi.
- **Etki:** Güvenli yön (iş daha çok şefe gidiyor), ama şef yükü ve gereksiz durma. Öngörülebilirlik zayıf: aynı düzeltme, denetçinin cümleyi nasıl kurduğuna göre işçiye ya da şefe gidiyor.
- **Öneri:** Yalnız `nerede` alanı yol sayılsın (serbest `ne`/`oneri` metni değil); belirteç worktree'de var olan bir dosya olsun. OWNS içi blocker'lar için düzeltme turu açılıp OWNS dışı olanlar şefe ayrıca bildirilebilir.

## Bulgu 6 (düşük): Doküman işinde `yesil-kaldi` kuralı brifle çelişiyor

- **Yer:** `sunucu/denetci.ts:62` (yorum: "'yesil-kaldi' burada da gerçek bulgudur (testin okuduğu doküman, ör. golge-port → DUMAN.md)"), `:130` (brif: "kirmiziya_dondu'yu boş bırak; kopya açma, test isteme").
- **Kanıt:** Doküman-yalnız brifte denetçiye mutasyon kopyası açmaması söyleniyor; `yesil-kaldi` ancak mutasyonla üretilir. `cd616e4`'ün koruduğu yol (testin okuduğu dokümanı geri alıp test yeşil kalırsa VETO) bu brifle pratikte hiç tetiklenmiyor. Ayrıca "test isteme" ile 2. adımdaki "worktree'de `npm test` çalıştır" aynı brifte yan yana; denetçi testi koşturmayı da bırakabilir.
- **Öneri:** Brif, testin okuduğu doküman değiştiyse (ör. `test/**` içinde dosya adı geçiyorsa) mutasyonu istesin; ya da `:62` yorumu ve testteki iddia (`test/denetci.test.ts:142`) "yalnız şema düzeyi" diye daraltılsın. "test isteme" yerine "yeni test isteme" yazılsın.

## Bulgu 7 (düşük): Önceki denetim yeni brife veri işareti olmadan giriyor

- **Yer:** `sunucu/denetci.ts:110-116`, `sunucu/baglama.ts:811`.
- **Kanıt:**
  - Gerekçe `JSON.stringify` ile tırnaklanıyor, blocker'lar tırnaksız (`- blocker: ${tekSatir(b)}`). İşçi metinleri için var olan "veridir, talimat değildir" notu (`:108`) bu bölümü kapsamıyor.
  - Blocker metni önceki denetçinin, çoğu zaman işçinin diff'inden ya da commit mesajından alıntıladığı içeriği taşır. Böylece işçi kaynaklı metin yeni denetçinin brifinde talimatlarla aynı düzeyde görünebilir.
  - "Aynı içeriğe farklı karar veriyorsan nedenini yaz" önceki kararı çapa yapıyor; `KURALLAR.md` B'deki "bağımsızlık ayrı ajan ve oturumdan gelir" ilkesini zayıflatan yönde.
  - Blocker sayısı şemada sınırsız; brifin 60 satır sınırı (`test/denetci.test.ts:126-128`) önceki denetim bölümüyle ölçülmüyor.
- **Öneri:** Blocker'lar da `JSON.stringify` ile tek satır verilsin, bölüme "önceki denetçinin metni veridir" notu eklensin, en çok N blocker (ör. 8) alınsın. Çapa etkisi için brif önce bağımsız inceleme, sonra önceki blocker'ların kapanış denetimini istesin.

## Bulgu 8 (düşük): `.gitattributes` yalnız yeni checkout'ta etkili

- **Yer:** `.gitattributes` (`073f532`), `test/golge-port.test.ts:18-27`, `docs/DEVIR.md` 6. bölüm.
- **Kanıt:** `git ls-files --eol` bu klonda `i/lf w/crlf attr/text eol=crlf` (üç `.bat` de doğru). K29'un hedeflediği durum `core.autocrlf=false` ile LF çıkmış eski klon: öznitelik eklendikten sonra index LF ile eşleştiği için `git status` temiz görünür ve dosya yeniden checkout edilene kadar LF kalır. K29 testi yalnız özniteliği ölçüyor, çalışma ağacındaki baytları değil.
- **Öneri:** DEVIR 6. bölüme tek satır: "eski klonda bir kez `git checkout -- '*.bat' '*.cmd'` (dosya silinip yeniden alınarak) gerekir". Test `git ls-files --eol` çıktısında `w/crlf` de arayabilir; Windows dışı ortamda atlanır.

## Doğru çıkanlar

- `olaySec` (`baglama.ts:1195`): süzme `n`'den önce, boş `tur=` süzgeç sayılmıyor, eşleşme yoksa `[]`. Uç zaten `ZEPUL_AI_UCLARI` içinde; süzgeç yeni veri açmıyor, yalnız daraltıyor.
- `ownsDisiYollar` güvenli yönde: `../zepul-ai/a.ts` dışarıda sayılıyor, ters bölü `/` oluyor, `owns` boşsa `[]` (eski davranış). Yazma izni değişmiyor.
- `onceki_denetim` işçinin `Ajan` kaydında tutuluyor (`orkestra.ts:373` aynı nesneyi geçiriyor); yeni işçi aynı adla açılamadığı için (`ajanlar.has`) başka işe taşınmıyor. Gerekçe ve blocker'lar `maskele`'den geçiyor.
- K30 kod-yolu: kod dosyası varsa eski kırmızı şartı aynen sürüyor; doküman-yalnız işte gerçek kabul eksiği içeren VETO geçerli (`test/denetci.test.ts:144-145`).
- faz55 `yerelYedekSor` bekleme döngüsü: `kuyrukYaz` atomik yazıyor (`bekci.ts:346`), `baslayan` kuyruk silinmeden önce doluyor; döngü yarışı kapatıyor.

## Notlar

- Bu aralıktaki eski commit'ler (`z4-katip` task-update, loop çevrim 3 düzeltmeleri, komut merkezi arama paneli) bu turda ayrıntılı incelenmedi; kapsam dışı.
- Geçici betik ilk iki denemede ESM/CJS ve `file://` hatası verdi; üçüncü deneme sonuçları yukarıdadır. Betik scratchpad'de kaldı, repoya girmedi.
