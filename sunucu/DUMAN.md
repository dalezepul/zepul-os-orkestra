# Faz 1 duman testi: orkestra sunucusu

- **Tarih:** 2026-09-29
- **Ortam:** Windows 11, Node v22.23.2, `@anthropic-ai/claude-agent-sdk` 0.3.284 (CLI 2.1.284).
- **Birim testleri:** `npm test` → 9 test, 9 geçti, 0 kaldı. Kesin yasak için 32 pozitif ve 18 negatif örnek var.
- Token ve panel adresi bu dosyaya yazılmadı. Testte atılabilir bir `ZEPUL_TOKEN` kullanıldı.

## 1. Şefsiz duman testi (maliyetsiz)

Komut: `ZEPUL_TOKEN=<token> npx tsx sunucu/orkestra.ts --sef-yok`

| İstek | Beklenen | Gelen |
|---|---|---|
| `GET /api/ajanlar`, token yok | 401 | 401 |
| `GET /api/ajanlar`, yanlış `x-token` | 401 | 401 |
| `GET /api/ajanlar`, doğru `x-token` | 200 | 200 `[]` |
| `GET /api/ajanlar?t=<token>` (yalnızca `/` ve SSE sorgu token'ı kabul eder) | 401 | 401 |
| `Host: evil.com` + doğru token | 403 | 403 `{"ok":false,"hata":"izin verilmeyen Host başlığı"}` |
| `Host: zepul.tail1234.ts.net` | 200 | 200 |
| `Host: localhost:8820` | 200 | 200 |
| `GET /api/akis?t=<token>` | SSE başlıkları | `content-type: text/event-stream; charset=utf-8`, `cache-control: no-cache`, `connection: keep-alive` |
| `GET /api/akis`, token yok | 401 | 401 |
| `POST /api/mesaj {"ajan":"yok"}` | 404 | 404 `{"ok":false,"hata":"bilinmeyen ajan"}` |
| `POST /api/mesaj` bozuk JSON | 400 | 400 |
| `POST /api/onay` bilinmeyen `onay_id` | 404 | 404 |
| `POST /api/_test/isci`, `ZEPUL_TEST` yok | 404 | 404 |
| `GET /?t=<token>` | panel sayfası | 200, `panel/index.html` |
| İkinci örnek aynı portta | açık hata, çıkış 1 | `HATA: 8820 portu dolu. … Başka porta geçilmez.` çıkış kodu 1 |

## 2. Gerçek duman testi (tek koşu)

Komut: `ZEPUL_TEST=1 ZEPUL_TOKEN=<token> npx tsx sunucu/orkestra.ts --sef-yok`. SSE `curl -N` ile dinlendi.

1. `POST /api/_test/isci {"ad":"fable-deneme","model":"claude-fable-5-1"}` → 400. Oturum açılmadı, maliyet 0. `hata` olayı üretildi ve `logs/hatalar.jsonl` dosyasına yazıldı.
2. `POST /api/_test/isci {}` → 200 `{"ok":true,"id":"test-isci"}`. Model `claude-sonnet-5-5`. Görev: "package.json'daki name alanını oku ve sozlesme_don ile TAMAM dön."

İşçi 14 sn'de bitti. Maliyet 0,1376 USD (liste fiyatı tahmini; abonelikte fatura edilmez).

### SSE'den gelen olaylar (sırayla, `id`/`ts` kısaltıldı)

```
{"ajan":"fable-deneme","tur":"hata","kaynak":"kapi","tur_adi":"ajan_reddi","mesaj":"fable-deneme başlatılmadı: model claude-sonnet-5-5 | claude-opus-5-5 olmalı; alt ajanda Fable yasak","geri_alinabilir":true,"devam_edilebilir":true,"oneri":"geçerli ad, rol ve model ile yeniden dene"}
{"ajan":"test-isci","tur":"durum","durum":"bekliyor"}
{"ajan":"test-isci","tur":"durum","durum":"calisiyor"}
{"ajan":"test-isci","tur":"arac","arac_id":"toolu_01KdCY…","arac":"Grep","girdi_ozet":"{\"pattern\":\"\\\"name\\\"\",\"path\":\"…\\\\package.json\",\"output_mode\":\"content\"}"}
{"ajan":"test-isci","tur":"arac_sonuc","arac_id":"toolu_01KdCY…","basarili":true,"ozet":"2:  \"name\": \"zepul-os\","}
{"ajan":"test-isci","tur":"arac","arac_id":"toolu_014bqR…","arac":"mcp__bus__sozlesme_don","girdi_ozet":"{\"verdict\":\"TAMAM\",\"blockers\":[],\"commits\":[],\"ozet\":\"package.json içindeki name alanı \\\"zepul-os\\\". Dosyada değişiklik yapılmadı.\"}"}
{"ajan":"test-isci","tur":"kapi","karar":"izin","neden":"kapı: izin"}
{"ajan":"test-isci","tur":"sozlesme","verdict":"TAMAM","blockers":[],"commits":[],"ozet":"package.json içindeki name alanı \"zepul-os\". Dosyada değişiklik yapılmadı."}
{"ajan":"test-isci","tur":"arac_sonuc","arac_id":"toolu_014bqR…","basarili":true,"ozet":"sözleşme alındı; oturum bu turdan sonra kapanacak"}
{"ajan":"test-isci","tur":"metin","metin":"`package.json` içindeki `name` alanı `zepul-os`. Dosyada değişiklik yapmadım ve commit atmadım. Sonucu `sozlesme_don` ile TAMAM olarak döndüm."}
{"ajan":"test-isci","tur":"maliyet","maliyet_usd":0.1376146,"toplam_usd":0.1376146}
{"ajan":"test-isci","tur":"durum","durum":"bekliyor"}
{"ajan":"test-isci","tur":"durum","durum":"bitti"}
```

- Beklenen olayların hepsi geldi: `arac`, `arac_sonuc`, `sozlesme`, `maliyet`, `durum`.
- SSE çerçevesi `event: olay` ve `data: <JSON>` biçiminde. Dinleme boyunca 3 kez `: ping` geldi (15 sn aralık).
- Salt okuma aracı `Grep` için `kapi` olayı üretilmedi; `mcp__bus__sozlesme_don` için üretildi.
- `sozlesme_don` gelen kutusunu kapattı. İşçi `bitti` durumuna geçti ve aktif işçi sayısından düştü.
- `logs/olaylar.jsonl` dosyasında 13 satır, `logs/hatalar.jsonl` dosyasında 1 satır (Fable reddi) var.

### init: araçlar ve MCP sunucuları (işçi)

```
model: claude-sonnet-5-5
apiKeySource: none
permissionMode: acceptEdits
mcp_servers: [{"name":"bus","status":"connected","source":"sdk"}]
tools: Task, Bash, CronCreate, CronDelete, CronList, DesignSync, Edit, EnterWorktree, ExitWorktree, Glob, Grep,
       ListAgents, Monitor, NotebookEdit, PowerShell, PushNotification, Read, RemoteTrigger, ReportFindings,
       ScheduleWakeup, SendMessage, Skill, TaskStop, ToolSearch, WebFetch, WebSearch, Workflow, Write,
       mcp__bus__mesaj_gonder, mcp__bus__sozlesme_don
```

- **MCP sızıntısı yok.** `mcp_servers` içinde yalnızca `bus` var. SPIKE'ta sızan `ai-os`, `higgsfield` ve `claude_ai_Claude_Docs` araçları bu listede yok. `settingSources: ['project']` ve `strictMcpConfig: true` birlikte yeterli oldu.
- İşçide bus araçlarından yalnızca `mesaj_gonder` ve `sozlesme_don` var.
- `apiKeySource: none`, yani abonelik kullanıldı.

## Doğrulanmayanlar

- **Şefin araç listesi.** Maliyet yüzünden gerçek koşuyla doğrulanmadı; init yalnızca ilk turda geliyor.
  - Çıkarım: şef `tools: ['Read','Grep','Glob']` ve `disallowedTools: [Edit, Write, Bash, PowerShell, NotebookEdit]` ile başlıyor.
  - SPIKE'ta `tools` seçeneğinin yerleşik araçları kısıtladığı görüldü. Bu testte de MCP'nin yalnızca `bus` olduğu görüldü.
  - İlk gerçek şef koşusunda `[sef] init` satırı sunucu konsoluna yazılır; oradan bakılmalı.
- **SIGINT ile kapanış.** Windows'ta dışarıdan SIGINT gönderilemiyor; `process.kill` süreci doğrudan öldürüyor. Kapanış yalnızca konsolda Ctrl+C ile denenebilir.
- **Onay akışı gerçek ajanla.** `onay_istek` → `POST /api/onay` → `onay_sonuc`/`kapi` akışı gerçek ajanla denenmedi (brif gereği, Faz 2). `kesinYasakMi` birim testleriyle sınandı.

## Faz 2 için not

- İşçinin geniş araç listesi düzeltme turunda `disallowedTools` ile daraltıldı; aşağıdaki B5 bölümüne bak.

## Düzeltme turu B5: işçide `permissionMode: 'auto'`

**Karar:** İşçi `permissionMode: 'auto'` ve `permissionPrompts: 'none'` ile çalışır. Kapı yalnızca kesin yasakta ya da sahiplik ihlalinde karar verir. Bunlardan biri yoksa `allow` döndürmez, boş çıktı döner ve kararı yerleşik izin akışı verir (auto sınıflandırıcı). Bus araçları `allowedTools: ['mcp__bus__*']` ile önceden izinlidir. Kapıdan insan onayıyla geçen yasak (`reset --hard` vb.) hâlâ açık `allow` alır; aksi hâlde sınıflandırıcı insan kararını ezebilirdi.

**Gerekçe:** Yol haritası "yerleşik sınıflandırıcı artı bizim kapımız" diyor. `acceptEdits` ile her şeye `allow` dönen eski kapı bu ikinci ağı devre dışı bırakıyordu (faz1 B5). `auto` SDK tiplerinde var (`PermissionMode = … | 'auto'`) ve aşağıdaki denemede headless ve abonelikte çalıştı. Bu yüzden yedek yola (`acceptEdits` ve seçici `allow`) gerek kalmadı.

**Deneme (tek koşu, `claude-sonnet-5-5`, 0,0863 USD liste fiyatı):** Betik scratchpad'deydi. Ayarlar: `permissionMode: 'auto'`, `permissionPrompts: 'none'`, `settingSources: ['project']`, `strictMcpConfig`, işçinin `disallowedTools` listesi ve boş `{}` dönen bir PreToolUse hook'u.

```
supportedModels: sonnet/opus/claude-fable-5-1 … supportsAutoMode: true
init: model=claude-sonnet-5-5  apiKeySource=none  permissionMode=auto
init tools: Task, Bash, DesignSync, Edit, Glob, Grep, ListAgents, Monitor, NotebookEdit, PowerShell, Read,
            ReportFindings, SendMessage, Skill, TaskStop, ToolSearch, WebFetch, WebSearch, Write
yasak listeden init'te kalan: yok
hook Bash {"command":"node -e \"console.log(21*2)\""} permission_mode=auto   → hook {} döndü
arac_sonuc is_error=false "42"      result: permission_denials=[]
```

- `node -e` salt okuma listesinde değil. `default` modda ve soru arayüzü olmadan reddedilirdi. `auto` modda sınıflandırıcı sorusuz onayladı.
- Boş hook dönüşü akışı bozmadı.
- `disallowedTools` adları doğrulandı: `RemoteTrigger`, `PushNotification`, `CronCreate`, `CronDelete`, `CronList`, `Workflow`, `ScheduleWakeup`, `EnterWorktree` ve `ExitWorktree` önceki işçi init'inde vardı, bu denemede listeden düştü. `Artifact` ve `ArtifactData` SDK oturumunda hiç yok; listede zararsız sigorta olarak duruyor.
- Aynı koşuda B2 için `shouldQuery: false` da denendi. Mesaj tur başlatmadı ve bir sonraki mesaja bağlam olarak eklendi (model gizli kelimeyi bildi). Ama SDK bunun için `total_cost_usd: 0` olan boş bir `result` üretti. Bu `result` orkestrada `durum: bekliyor` ve sıfır maliyet olayına dönüşürdü. Bu yüzden B2'de mevcut `onEk` tamponu kullanıldı (bkz. `bilgiEkle`).
- **Bilinen sınır:** SDK'nın `Agent` aracı `model` alanında yalnızca takma ad kabul ediyor (`sonnet | opus | haiku | fable`). `onSuzgec` tam kimlik istediği için işçide `Agent` fiilen kapalı. Alt iş, şefin `ajan_baslat` aracıyla ayrı oturumda açılır.

## Düzeltme turu duman testi (maliyetsiz, `--sef-yok`)

| İstek | Önce | Sonra |
|---|---|---|
| `GET /`, token yok (B3) | 401 | 200 |
| `GET /`, `Host: evil.com` | 403 | 403 |
| `GET /api/ajanlar`, token yok | 401 | 401 |
| `GET /api/ajanlar?t=<doğru>` (sorgu token'ı artık yalnızca SSE'de) | 401 | 401 |
| `GET /api/akis`, token yok / `?t=<doğru>` | 401 / 200 | 401 / 200 |
| `POST /api/kapat`, token yok ya da yanlış (B7) | 404 | 401 |
| `npm run kapat` (B7) | yok | `kapat: 200`. Log: "Kapanıyor: oturumlar durduruluyor…", süreç çıkış kodu 0, port ~250 ms'de boşaldı |

- **B1 "kırmızıya döndür":** Kopyada `sunucu/olay.ts` B1 öncesine döndürüldü (`git show HEAD:…`, repo değil). Yeni B1 testi kırmızıya döndü (`# pass 10 · # fail 1`). Eski kod 23 pozitif örnekten 17'sine izin veriyordu.
- **Doğrulanmayan:** Kapanışta bekleyen onayların reddi ve ajanların son `durum: bitti` olayı. Şefsiz testte ajan yok; bu yollar kod okumasıyla kontrol edildi.

## Faz 2 entegrasyon duman testi (tek gerçek koşu, `--sef-yok`)

- **Komut:** `ZEPUL_TEST=1 ZEPUL_OLUM_SN=20 ZEPUL_TOKEN=<token> npx tsx sunucu/orkestra.ts --sef-yok`. SSE `curl -N` ile dinlendi.
- **İşçinin çalışma dizini:** Repo değil. Scratchpad'de `git init` ve ilk commit ile açılmış ayrı bir depo (aşağıda `<depo>`).
- **İstek:** `POST /api/_test/isci {"ad":"duman-isci","model":"claude-sonnet-5-5","cwd":"<depo>","gorev":"test-duman.txt adlı bir dosyaya 'x' yaz, COMMIT ATMADAN sozlesme_don ile TAMAM dön."}` → 200.
- **Süre ve maliyet:** 26 sn, 0,1464 USD (liste fiyatı tahmini; `apiKeySource: none`, abonelikte fatura edilmez).
- **ntfy:** `ZEPUL_TEST=1` iken gönderilmez, yalnızca konsola yazılır. Bu koşuda gönderilecek bir bildirim de oluşmadı.

### SSE olayları (sırayla; `id` atıldı, `ts` saat kısmı, uzun alanlar kısaltıldı)

```
14:16:14.114 durum       bekliyor
14:16:14.156 durum       calisiyor
14:16:17.515 arac        Write {"file_path":"<depo>\test-duman.txt","content":"x"}
14:16:18.651 kapi        {"karar":"izin","neden":"Jev: guvenli (güven 0.68), belirsiz: auto moda bırakıldı","jev_secim":"guvenli","jev_guven":0.68}
14:16:18.742 arac_sonuc  basarili:true "File created successfully …"
14:16:20.330 arac        mcp__bus__sozlesme_don {"verdict":"TAMAM","blockers":[],"commits":[],"ozet":"… İstendiği gibi commit atılmadı."}
14:16:20.421 arac_sonuc  {"basarili":false,"ozet":"Önce commit at: 1 dosya (ilk 5: test-duman.txt). Sonra sozlesme_don ile tekrar gönder."}
14:16:28.047 metin       "… Görev talimatını çiğneyip commit atmıyorum. … kararı şefe bırakıyorum. …"
14:16:28.092 kapi        {"karar":"red","neden":"Stop engellendi (1/2): Commit edilmemiş 1 dosya var (ilk 5): test-duman.txt. Commit at, sonra bitir."}
14:16:30.942 metin       "Stop hook'u commit istiyor. Bu, kuralların (E) parçası olduğu için … commit atıyorum."
14:16:31.447 arac        Bash {"command":"git add test-duman.txt && git commit -m \"chore: test-duman.txt dosyası eklendi …\" && git rev-parse --short HEAD"}
14:16:32.322 kapi        {"karar":"izin","neden":"Jev: guvenli (güven 0.99), güvenli","jev_secim":"guvenli","jev_guven":0.99}
14:16:34.516 arac_sonuc  basarili:true "[master dcc4eec] chore: test-duman.txt dosyası eklendi …"
14:16:36.500 arac        mcp__bus__sozlesme_don {"verdict":"TAMAM","blockers":[],"commits":["dcc4eec"],"ozet":"…"}
14:16:36.541 sozlesme    {"verdict":"TAMAM","blockers":[],"commits":["dcc4eec"],"ozet":"… dcc4eec ile commit atıldı; bu sapma bilinçli.","sonraki_adim":"sefe"}
14:16:36.546 arac_sonuc  {"basarili":true,"ozet":"sözleşme alındı; şefe iletildi, oturum bu turdan sonra kapanacak"}
14:16:40.123 metin       "… görevin \"commit atmadan\" şartına uyulmadı. … Sapmayı sözleşme özetine de yazdım."
14:16:40.182 maliyet     {"maliyet_usd":0.1463628,"toplam_usd":0.1463628}
14:16:40.182 durum       bekliyor
14:16:40.737 durum       bitti
```

### Laya gölge kaydı (`logs/laya-golge.jsonl`, bu koşuda 2 yeni satır)

| Araç | Jev seçim / güven / dis_etki | Laya seçim / güven / dis_etki | Uyum | Jev ms | Laya ms |
|---|---|---|---|---|---|
| `Write` (`test-duman.txt`) | guvenli / 0,68 / 0,23 | riskli / 0,04 / 1,00 | hayır | 1121 | 328 |
| `Bash` (`git add` + `git commit`) | guvenli / 0,99 / 0,37 | belirsiz / 0,66 / 0,99 | hayır | 863 | 292 |

`girdi_maskeli` alanında kullanıcı dizini (`C:\Users\<ad>`) `~` olarak maskelenmişti. Ama scratchpad yolundaki Claude proje klasörü adında (`C--Users-<ad>-Desktop-…`) kullanıcı adı Jev'e ve Laya'ya gitti. `jevMaskele`'ye bu kalıp eklendi (`0dab8e2`). Maskeleme testi önce kırmızıya döndü, düzeltmeden sonra yeşil.

### init (sunucu konsolu)

```
model=claude-sonnet-5-5  apiKeySource=none  permissionMode=auto  resume=false
mcp_servers: [{"name":"bus","status":"connected","source":"sdk"}]
tools: Task, Bash, DesignSync, Edit, Glob, Grep, ListAgents, Monitor, NotebookEdit, PowerShell, Read,
       ReportFindings, SendMessage, Skill, TaskStop, ToolSearch, WebFetch, WebSearch, Write,
       mcp__bus__mesaj_gonder, mcp__bus__sozlesme_don
```

### Doğrulananlar

- **Kirli ağaç reddi:** Kirli ağaçla gelen `sozlesme_don` aracın hata sonucuyla döndü. `sozlesme` olayı üretilmedi, oturum açık kaldı.
- **Stop hook:** İşçi turu kirli ağaçla bitirmek istedi ve engellendi (1/2). Ardından commit atıp sözleşmeyi yeniden gönderdi. Beklenen iki yol (yeniden gönderme ve Stop engeli) aynı koşuda görüldü.
- **Görev talimatıyla çakışma:** Kural E ("kirli ağaçla bitirilmez") görev metnindeki "COMMIT ATMADAN" talimatını ezdi. İşçi bu sapmayı sözleşme özetine yazdı.
- **Jev:** İşçinin `Write` ve `Bash` çağrıları Jev'e gitti. `kapi` olayında `jev_secim` ve `jev_guven` alanları var.
  - `Write` için güven 0,68, eşiğin altında. Kabuk olmadığı için `gec` oldu (auto moda bırakıldı).
  - `git commit` için güven 0,99, `gec` oldu.
  - Her iki araç da auto sınıflandırıcıdan geçti, `permission_denials` olmadı.
- **Laya gölge kaydı:** İki satır yazıldı. Jev ve Laya hatası olmadı; `logs/hatalar.jsonl` değişmedi.
- **Sonraki adım:** `sonraki_adim: sefe` (denetçi yok). İşçinin kutusu kapandı ve durum `bitti` oldu. Şef yoktu (`--sef-yok`), bu yüzden şefe mesaj gitmedi.
- **Kapanış:** `npm run kapat` → `kapat: 200`. Logda "Kapanıyor: oturumlar durduruluyor…" satırı çıktı ve port 2,5 sn içinde boşaldı.
- **Depolar:** Geçici depoda `dcc4eec` commit'i var, ağaç temiz. Ana repo kirlenmedi.

### Doğrulanmayanlar

- **`resume`:** Oturum çökmedi. İşçi 20 sn sessiz de kalmadı, bu yüzden diriltme tetiklenmedi. `oturumAc(a, sessionId)` yolu kodda var ama gerçek koşuyla sınanmadı. Oturum kapanınca ajanın önceki konuşmayı hatırlayıp hatırlamadığı hâlâ açık soru (YASAM.md).
- **Gerçek ajanla insan onayı:** Bu koşuda `insan` kararı çıkmadı. Akış `test/entegrasyon.test.ts` ile sınandı.
- **`rate_limit`:** Diriltme `resetsAt` zamanına kadar ertelenmiyor (`ponytail` notu). Limit doluyken 3 deneme yaklaşık 90 sn'de tükenir ve ntfy `hata` gider.

### Kırmızıya döndür (`test/entegrasyon.test.ts`)

Kopya: `scratchpad/entegrasyon-kopya`. Her bozma yalnızca `sunucu/baglama.ts`'te ayrı ayrı uygulandı. Geri alınınca 11/11 yeşil.

| Bozma | Kırmızıya dönen test |
|---|---|
| `gec` → `allow` | gec → `{}`; Jev hatası (fail-open `{}`) |
| `hataYaz` olaya çevrilmiyor | Jev hatası → hata olayı |
| `sozlesme_don`'da kirli ağaç denetimi kaldırıldı | kirli ağaç → hata metni |
| `duzeltme` dalı kaldırıldı (şefe gidiyor) | KISMI → düzeltme turu aynı işçiye |
| `insan` onay beklemeden `{}` | insan → evet; insan → hayir |
| `mutlak` red atlandı (onaya düşüyor) | mutlak yasak → deny |

Son bozma ilk denemede testi 590 sn onay beklemesinde asılı bıraktı. Bunun üzerine testte `onayMs: 1000` verildi; bozuk kapı artık asılı kalmadan kırmızıya dönüyor.

## Faz 2 düzeltme turu B: yaşam, sözleşme ve bağlama (maliyetsiz)

- **Tarih:** 2026-09-29. Gerçek ajan koşusu yapılmadı; canlı doğrulama bir sonraki kabulde.
- **Kapsam:** Kabul raporundaki (`docs/kabul/faz1-2.md`) K1 (Monitor kısmı), K3, K4, K5, K6, K8, K9, K10 ve K11.

| # | Düzeltme | Nerede |
|---|---|---|
| F1b | `Monitor` şef dışı rollerin yasak araçlarında. Rol seçenekleri `rolSecenekleri` (`baglama.ts`) ile test ediliyor; diriltme ve `resume` de aynı yoldan geçiyor. **`env: isciOrtami(...)` bağlanmadı** (bkz. açık iş). | `baglama.ts`, `orkestra.ts` |
| F4 | Açık araç çağrısı olan ajanın ölüm eşiği `max(OLUM_ESIK_MS, 15 dk)`. | `yasam.ts` `olumAdaylari`, `orkestra.ts` `acikArac` |
| F5 | `ajan_baslat` `cwd` alıyor. İzinli: repo, `repo/.worktrees/*`, `ZEPUL_TEST=1` iken test kökü (`ZEPUL_TEST_KOK`, yoksa işletim sisteminin geçici klasörü). Göreli yol repoya göre çözülür; olmayan klasör reddedilir. | `baglama.ts` `izinliCwd`, `orkestra.ts` |
| F6 | `/api/_test/isci` `owns: string[]` alıyor; gövde zod ile doğrulanıyor. | `orkestra.ts` |
| F7 | `sozlesme_don` ve Stop hook yalnızca OWNS içindeki kirli dosya için commit istiyor. OWNS dışı kirli dosya → `sozlesme.uyari`. | `yasam.ts`, `baglama.ts` |
| F9 | Başlangıçta `baz_sha` ve kirli yollar kaydediliyor; `sozlesme_don`'da `baz_sha..HEAD` ve yeni kirli dosyalardan OWNS dışı olan varsa ret. | `yasam.ts` `bazAl`, `degisiklikler`; `baglama.ts` |
| F10 | Ajan maliyeti oturumların toplamı; `maliyet` olayında `oturum_usd` ve `oturum` (session_id). | `baglama.ts` `maliyetSayaci`, `orkestra.ts` |
| F11 | Kural ya da politika kaynaklı blocker doğrudan şefe; mesajda ".." yok. | `sozlesme.ts` |
| F12 | `kapi` olayında `alt_karar`; rapor `gec`'i doğru sayıyor, oturum hatalarında denetçi ve test ayrı etiketli. | `baglama.ts`, `yasam.ts`, `araclar/rapor.mjs` |
| Rapor | Sunucu açıkken 6 saatte bir `raporUret({saat: 6})`, ardından `durum: rapor` olayı. `npm run rapor`. | `orkestra.ts`, `package.json` |

### Duman testi (`--sef-yok`, ajan başlatılmadı)

Komut: `ZEPUL_TEST=1 ZEPUL_RAPOR_SN=4 ZEPUL_TOKEN=<token> npx tsx sunucu/orkestra.ts --sef-yok`

| İstek | Beklenen | Gelen |
|---|---|---|
| `GET /api/ajanlar`, token yok | 401 | 401 |
| `GET /api/ajanlar`, token | 200 `[]` | 200 `[]` |
| `POST /api/_test/isci {"owns":"docs/**"}` (dizi değil) | 400 | 400 "gövde {…, owns?: string[]} olmalı" |
| `… {"cwd":"C:/Windows","owns":["docs/**"]}` | 400 | 400 "cwd izinli köklerin dışında" |
| `… {"cwd":"sunucu"}` (repo alt klasörü, kök değil) | 400 | 400 "cwd izinli köklerin dışında" |
| `… {"cwd":".worktrees/yok"}` | 400 | 400 "cwd bir klasör değil ya da yok" |
| `… {"model":"claude-fable-5-1"}` | 400 | 400 "alt ajanda Fable yasak" |
| 4 sn sonra `GET /api/olaylar` | `durum: rapor` | `sunucu durum rapor log-raporu-20260929-1829.html`; her ret için `hata ajan_reddi` |
| `POST /api/kapat` | 200, port boşalır | 200, "Kapanıyor…", port 137 ms'de boşaldı |

Hiçbir istek oturum açmadı (ret, `oturumAc`'tan önce). Maliyet 0.

### Kırmızıya döndür

Kopya: `scratchpad/duzeltB-kopya` (repo dışında, `node_modules` bağlantıyla). Her bozma tek başına uygulandı, test koşuldu, dosya geri kondu. Sonunda `npm test` 62/62, `rapor --test` 14/14.

| Bozma | Kırmızıya dönen test |
|---|---|
| F4: açık araç eşiği yok (`esikMs`) | olumAdaylari: açık araç … 15 dk |
| F11: politika dalı kapalı | kural/politika kaynaklı blocker …; kirli ağaç … uyarı (F7) |
| F11: sondaki nokta kırpılmıyor | blocker noktayla bitince mesajda '..' olmaz (ilk denemede yeşil kaldı; test sondaki noktalı blocker'la güçlendirildi, `b91e76d`) |
| F10: `yeniOturum` toplamı sıfırlıyor | maliyet: oturumların toplamı |
| F5: `=== repo` yerine `startsWith(repo)` | izinliCwd |
| F7: OWNS yok sayılıyor | F7 sözleşme, F9, Stop hook (F7), ownsAyir (4 test) |
| F9: `commitli` denetlenmiyor | baz_sha..HEAD … (F9) |
| F9: `--no-renames` yok | baz_sha..HEAD … (taşınan dosyanın eski yolu) |
| F12: `gec` için `alt_karar` yok | kapı: gec → {} … |
| F12: rapor `alt_karar` okumuyor | rapor: kapı, Jev süresi … |
| F12: rapor denetçi/test ayırmıyor | rapor: oturum etiketleri |
| F1b: `Monitor` yasak değil | rolSecenekleri: işçide Monitor yasak |

### Açık iş ve sınırlar

- **F1b `env` bağlanmadı (blocker):** Düzeltici A'nın `sunucu/ortam.ts` (`isciOrtami`) dosyası 10 dakikayı aşan beklemede oluşmadı. Bağlama tek yerde: `baglama.ts` `rolSecenekleri` şef dışı dönüşüne `env: isciOrtami(process.env)` eklenir, `test/entegrasyon.test.ts`'teki `rolSecenekleri` testine `env` denetimi eklenir. Şefin ve sunucunun kendi ortamı değişmez.
- **F9 sınırları:** Aynı ağaçta OWNS'suz başka bir ajanın commit'i bu ajana yazılır. Başlangıçta zaten kirli olan dosyaya sonradan yazma görünmez. Baz alınamazsa kirli dosya için ret yok. Paralel işçiler `repo/.worktrees/<ad>` içinde çalışmalı.
- **F10 sınırı:** `result` üretmeden çöken oturumun maliyeti SDK'dan gelmez, toplama girmez.
- **F12 sınırı:** `oturum` alanı olmayan eski olaylardaki şef oturumları ve `result` üretmeden çöken orkestra oturumları raporda `test` etiketi alır (raporda yazıyor).

## Düzeltme turu 2: orkestra dayanıklılığı ve HTTP (maliyetsiz)

- **Tarih:** 2026-09-29. Kaynak: birleşik hata avı turu. Gerçek ajan koşusu yapılmadı.
- **Testler:** `npm test` 143/143 (diğer düzelticilerin testleri dahil). `test/entegrasyon.test.ts` 22 test.
- **Bağlamalar:** `isciOrtami`, `ajanOrtami` (`ortam.ts`), `desenNormalize` (`yol.ts`), `maskeEkle` (`olay.ts`) bağlandı. Blocker yok.

| # | Düzeltme | Nerede |
|---|---|---|
| F1b | Şef dışı rollerin `query` ortamı `isciOrtami`, şefinki `ajanOrtami`. Hiçbir ajana `ZEPUL_*` geçmez. Diriltme ve resume aynı yoldan. | `baglama.ts` `rolSecenekleri` |
| S1 | Token'lı adres `%LOCALAPPDATA%\zepul-os\panel-url.txt` (yoksa `~/.zepul-os/`). Eski `.tmp/panel-url.txt` açılışta silinir. `npm run kapat` ve `Baslat.bat` yeni yolu kullanır. | `orkestra.ts`, `package.json`, `Baslat.bat` |
| S2 | Açılışta `maskeEkle(TOKEN)`. | `orkestra.ts` |
| S3 | `GET /`: satır içi betiğin `sha256` özetli CSP'si (her istekte, CRLF → LF sonrası), `nosniff`, `DENY`. JSON yanıtlarında `nosniff`. | `baglama.ts` `panelBasliklari` |
| S4 | En çok 8 SSE; 9. → `429`. Kuyruğu 1 MB'ı aşan akış kesilir. | `orkestra.ts` `akisYaz` |
| S5 | 22 karakterden kısa `ZEPUL_TOKEN` → açık hata, çıkış 1. | `orkestra.ts` |
| D1 | Log akışı hatası: konsol, dosya kaydı bayrakla durur, bir kez ntfy; SSE ve tampon sürer. `unhandledRejection` → olay; `uncaughtException` → olay + `kapat(1)`. | `orkestra.ts` |
| D2 | Vazgeçişte kutu ve query kapanır (`oturumuBirak`). Yuva durumdan sayılır (`bitti`/`olu` hariç). Resume öncesi yuva denetimi. Şef ölünce ntfy ve `POST /api/sef/yeniden`. | `orkestra.ts` `vazgec` |
| D3–D5 | Diriltmede git hatası ölümcül değil; canlı `oturumBitti`, `session_id` varsa resume; tam görev `a.gorev`, `session_id`'siz oturumda metnin önünde. | `orkestra.ts` `dirilt` |
| D6 | Kutu kapandıktan sonra çöken oturum `bitti`, diriltilmez. | `oturumAc` |
| D7 | Kapalı kutuda `ilet` false; `mesaj_gonder`, `/api/mesaj` (409), düzeltme, şefe iletme ve diriltme hata verir. İkinci `sozlesme_don` "sözleşme zaten alındı". | `orkestra.ts` |
| D8 | İşçi olmayan rolün `duzeltme` adımı şefe. | `baglama.ts` `sozlesmeIsle` |
| D9 | `bitti`/`olu` sahipliği bırakır; canlı ajanla çakışan OWNS reddedilir; diriltmede OWNS geri alınır, çakışırsa vazgeçilir. | `baglama.ts` `ownsCakismasi`, `sahiplikDurumu` |
| D10 | `bekliyor` ajandan `arac`/`metin` gelince önce `calisiyor`. | `yay` |
| D11 | Kapanışta başlatma, diriltme ve şef yeniden başlatma reddedilir; `kapat()` interrupt sonrası yeniden tarar. | `orkestra.ts` |
| D12 | Kapanışta `akislar.clear()`; `res.on('error')`; normal bitişte `a.q === q && !kapaniyor`. Bırakılmış oturumun geç mesajı döngüden çıkar. | `orkestra.ts` |
| D13 | Ölüm turu bitmeden yenisi başlamaz. | `olumTuru` |
| D14 | `oturumAc` hata verirse kayıt ve sahiplik geri alınır. | `ajanBaslat` |
| D15 | Ayrılmış adlar: `sunucu`, `kullanici`, `kapi`, `sef` (şefin kendisi hariç). | `ajanBaslat` |
| D17 | İşçinin ilk görevi baz alındıktan sonra iletilir. | `ajanBaslat` |
| W4 | OWNS `desenNormalize` ile; desteklenmeyen desen reddedilir; sahiplik anahtarı normalize desen. | `ajanBaslat` |
| W5 | `bazAl` hatası `hata` olayı. OWNS'lu sözleşmede baz yoksa yeniden alınır (uyarıyla); alınamazsa `baz yok, OWNS denetlenemedi`. | `baglama.ts`, `orkestra.ts` |
| W10 | `SIGHUP`, `SIGBREAK` → `kapat()`. `Baslat.bat`: "pencereyi X ile kapatma, Ctrl+C ya da npm run kapat". | `orkestra.ts`, `Baslat.bat` |

### Karar: `/api/kapat` için ayrı token yok (S1)

Kapatma ucu panel token'ını kullanır. Ayrı bir kapatma token'ı eklenmedi. Gerekçe: token artık repo dışında (`%LOCALAPPDATA%\zepul-os\panel-url.txt`), ajanların ortamına geçmiyor (`ajanOrtami`) ve kapı adres dosyasını sır sayıyor. Token'ı ele geçiren zaten tüm `/api/*`'ye sahip; ikinci token kapatmayı ondan korumaz, yalnızca bir dosya daha ekler.

### Duman testi (`ZEPUL_TEST=1 … --sef-yok`, ajan başlatılmadı)

Betik scratchpad'de; token ve adres rapora yazılmadı.

| Kontrol | Beklenen | Gelen |
|---|---|---|
| Adres dosyası | `%LOCALAPPDATA%\zepul-os\panel-url.txt`, token ≥ 22 | var, 24 karakter |
| Repo `.tmp/panel-url.txt` | yok | yok |
| `GET /` CSP | `script-src 'sha256-…'` betikle eşleşir | eşleşti (`sha256-lsK5…`) |
| `GET /` `nosniff`, `DENY`; JSON `nosniff` | var | var |
| 8 SSE / 9. SSE / biri kapanınca yeni SSE | 200 / 429 / 200 | 200 / 429 / 200 |
| `POST /api/kapat` token'sız | 401 | 401 |
| `POST /api/sef/yeniden` (`--sef-yok`) | 404 | 404 |
| `_test/isci {"ad":"kullanici"}` | 400 ayrılmış ad | 400 |
| `_test/isci {"owns":["docs/[ab].md"]}` | 400 desteklenmeyen desen | 400 |
| `ZEPUL_TOKEN=kisa123` | açık hata, çıkış 1 | çıkış 1 |
| `npm run kapat` | 200, çıkış 0, port boşalır | 200, çıkış 0, port 615 ms'de boşaldı |
| Kopyada `logs/olaylar.jsonl` klasör (D1) | sunucu ayakta, tek ntfy | 3 olay tamponda, tek konsol hatası, ntfy (ZEPUL_TEST: konsola) |

Hiçbir istek oturum açmadı; maliyet 0.

### Kırmızıya döndür

Kopya: `scratchpad/duz2-kopya` (repo dışında, `node_modules` bağlantıyla). Her bozma tek başına uygulandı, dosya geri kondu.

| Bozma | Kırmızıya dönen |
|---|---|
| İşçide `env` yok | rolSecenekleri: şef dışı rollerin query ortamında push kapalı (F1b) |
| Şefte `env` yok | rolSecenekleri: panel token'ı hiçbir ajanın ortamına geçmez (S1) |
| CSP özetinde CRLF → LF yok | panelBasliklari |
| `src`'li betik de özetleniyor | panelBasliklari |
| `olu` sahipliği bırakmıyor | sahiplik … (D9) |
| Çakışma `some` yerine `every` | sahiplik … (D9) |
| D8 dalı yok (test önce yazıldı) | denetçi VETO → kendine düzeltme açılmaz (D8) |
| W5 yeniden deneme yok (test önce yazıldı) | OWNS varken baz yoksa … (W5) |
| `olayLog.on('error')` yok (kopyada canlı) | ilk olay yazımında `Unhandled 'error' event`, sunucu düştü, sonraki istek bağlanamadı |

### Açık iş ve sınırlar

- **Panel (sahibi başka):** `panel/index.html` token mesajı hâlâ `.tmp/panel-url.txt` diyor; `docs/panel-api.md` yeni yolu yazıyor. "Şefi yeniden başlat" düğmesi yok.
- **CSP canlı tarayıcıda:** Özetin doğruluğu testte ve dumanda sınandı. Chrome'da ihlal olmadığı kabul testinde doğrulanacak.
- **Canlı doğrulanmayan:** D9 çakışma reddi ve diriltmede geri alma (ikinci ajan gerçek oturum açar), `uncaughtException` yolu, `SIGHUP` (pencereyi X ile kapatma) ve şefin yeniden başlatılması. Kod okumasıyla ve birim testleriyle kontrol edildi.
- **W5 sınırı:** Geç alınan baz ajanın önceki commit'lerini kapsamaz; sözleşme uyarısında yazar.
- **Şef yeniden başlatma:** Yeni oturum resume etmez; şef önceki konuşmayı bilmez, işçilerin sözleşmeleri panelde durur.

## Not: `ZEPUL_PORT` (K18)

Orkestra portu `ZEPUL_PORT` ile değişir (varsayılan 8820). CLAUDE.md'deki dolu portlar reddedilir. Açılıştan önce port 0.0.0.0, :: ve 127.0.0.1 üzerinde denenir; herhangi birinde dinleyen varsa `HATA: <port> portu başka bir süreçte dolu …` yazılır ve çıkış kodu 1 olur. Windows'ta 0.0.0.0'daki süreç 127.0.0.1 açılışına `EADDRINUSE` vermediği için bu denetim gerekli.

## Not: Faz 5 bağlama (hafıza ve skill bahçıvanı)

Parçalar `sunucu/baglama.ts` sonunda (Faz 5 bölümü), kablolama `sunucu/orkestra.ts`'te. Testler: `test/faz5.test.ts` (MyBrain ve Jev sahte), `test/panel.test.ts` (`panel/panel.test.mjs` artık `npm test` içinde).

- **Şef başlarken:** `sefBaglami` → `baglamAl` (`--no-sync`, salt okuma) + `sefBaglamMetni`; sonuç şefin talimatına KURALLAR'dan sonra eklenir. MyBrain yoksa şef bağlamsız başlar, `hata` olayı (`tur_adi: mybrain`) `logs/hatalar.jsonl`'a düşer.
- **Kilometre taşı:** birleşme `tamam` olunca `denetimIsle` → `kilometreTasi` (`fazReceiptOlustur` + `receiptGonder` + `esitle`), beklenmez. event_id fazı `birlesme-<işçi>-<sha7>`. MyBrain'e yazan tek yol budur ve yalnızca sunucu kodu çağırır; hiçbir ajana araç olarak verilmez (KURALLAR K).
- **Zamanlayıcı:** `faz5Zamanlayici`: `doctor` açılışta ve 24 saatte bir (temiz → `durum: hafiza`, değilse `hata: mybrain_saglik` + şefe bilgi); bahçıvan 6 saatte bir.
- **Bahçıvan:** `logs/olaylar.jsonl` son 7 gün → `tekrarAdaylari` → aday başına Jev (30 sn zaman aşımı; 0,8 altı `belirsiz`) → `skill` ise `taslakYaz`. Taslak klasörü `.git/info/exclude`'a eklenir (ana ağaç kirlenmez, birleştirme `kirli-ana` demez). Her karar panelde `skill_adayi` kartı; taslak kendiliğinden etkinleşmez.
- **`skill_onayla` (yalnızca şef):** taslağı `.claude/skills/<ad>` altına taşır ve yalnızca o dosyayı commit'ler.
- **İşçi başlarken:** `skillSecimi` proje skill'lerini Jev'e sorar; seçilenler talimata tek satır olarak eklenir. Jev hatasında işçi skill önerisiz başlar.
- **Duman (şefsiz, `ZEPUL_BEYIN_VAULT` yok bir klasör):** sunucu açıldı, `hata/mybrain` olayı geldi, `limit` olayı sürdü, `POST /api/kapat` 200.
- **Kırmızıya döndürme:** repo kopyasında 18 bağlantı tek tek koparıldı; her birinde ilgili test kırmızıya döndü.
- **Sınır:** orkestra.ts testte açılmaz; oradaki beş bağlantı kaynak metniyle doğrulanır (`orkestra.ts: faz 5 bağlantıları yerinde` testi). Canlı şefle uçtan uca denenmedi.

## Faz 5.5 canlı duman: yerel model (02.10.2026)

- **Ortam:** `ZEPUL_TEST=1`, port 8847, `--sef-yok`. Ayar ve iş klasörü `%TEMP%\zepul-f55\`. `ZEPUL_OLLAMA_URL` bir kayıtçı vekile (18834 → 11434) yönlendi.
- **Ollama:** 0.35.0, varsayılan bağlam 4096 (kullanıcı 32k denemesini geri aldı). Hiçbir model yüklü değildi.
- **Koşu 1:** `POST /api/_test/isci` ile `ollama:qwen3-coder:30b` işçisi başlatıldı.
  - Hazırlık başarısız oldu ve hata kaydına şu yazıldı: `yerel_model_hazir_degil`, "bağlam yetersiz, OLLAMA_CONTEXT_LENGTH=32768 gerekli (qwen3-coder:30b: bilinmiyor); ilk görev gönderilmedi, model yüklenmedi".
  - Ajan `olu` oldu, ntfy `uyarı` gitti (testte atlandı).
  - Bağlam "bilinmiyor" çıktı: model yüklü olmadığında sunucu bağlamı okunamıyor ve güvenli tarafta kalınıyor.
- **Koşu 2:** Tavan %0 ve `yerel_yedek: otomatik` ile brifli iş gönderildi. İş kuyruğa alındı, yanıtta "yerel yedek devreye girmedi: bağlam yetersiz…" yazdı.
- **Claude kotası:** Harcanmadı.
  - Vekil logunda yalnızca `GET /api/tags`, `GET /api/ps`, `POST /api/show` ve CLI'nin `HEAD /api/hello` isteği var. `/v1/messages` yok.
  - CLI "ANTHROPIC_API_KEY or another auth source is set" dedi, yani yerel kimlik kullanıldı.
  - limit.py önce ve sonra aynı: 5 saatlik %7, haftalık %23.
  - Ajanın maliyeti 0. `/api/ps` sonda yine boştu.
- **Uçtan uca yol:** `test/faz55.test.ts` gerçek SDK oturumunu sahte bir Ollama'ya bağlıyor. `init.model` yerel ad, `apiKeySource` none, istekler `Bearer ollama` ile gidiyor, maliyet 0.
- **Sınır:** Model yüklü değilken bağlam yalnızca Modelfile `num_ctx` ya da orkestra sürecindeki `OLLAMA_CONTEXT_LENGTH` ile bilinebiliyor. Masaüstü uygulamasının bağlam ayarı okunamıyor.

## Faz 7: zepul-ai senkronu (orkestra tarafı, 2026-10-02)

Sözleşme: `docs/sozlesme/faz7-zepul-ai.md`. Birim testleri `test/faz7.test.ts` ve `panel/panel.test.mjs`.

- **Anahtar:** `zepul-ai-anahtar.txt` panel adresi dosyasının yanında durur (K23 deseni; `ZEPUL_TEST=1` iken test dizini). Dosya varsa değişmez. Yetki `baglama.ts yetki()` ile verilir: anahtar yalnızca sözleşmedeki 7 uca geçer, diğer uçlar 403 döner. Karşılaştırma `timingSafeEqual` ile yapılır. Anahtar `maskeEkle` ile maskelenir. `zepul-ai` adı ayrılmıştır: bu adla ajan açılamaz.
- **Görev ↔ sonuç eşleşmesi (seçilen yol):** açık zepul-ai görevleri FIFO kuyrukta tutulur. Şefin her tur sonu, yani `durum` bekliyor, hata, bitti ya da olu, kuyruğun başındaki görevi kapatır ve `gorev_sonuc` yayar. `bekliyor` TAMAM, diğerleri BASARISIZ sayılır; `ozet` şefin o turdaki son metnidir. Açık `zepul_ai_sor` sorusu olan görev tur sonunda kapanmaz, cevabı bekler. Sınır: görev geldiğinde şef başka bir turdaysa o turun sonu bu göreve yazılır. Bu sorun çıkarırsa şefe `gorev_id`'li bir sonuç aracı eklenir.
- **Soru:** cevapsız soru 24 saat sonra görevi `BASARISIZ` ve "cevap gelmedi" ile iptal eder, şefe de bilgi gider. Duman testinde `ZEPUL_TEST=1` ve `ZEPUL_ZAI_CEVAP_SN` ile bu süre kısaltılır. Şefe iletilemeyen cevap 409 döner ve soru açık kalır.
- **Kapı onayı:** zepul-ai anahtarıyla verilen kararın `onay_sonuc` olayına `kaynak: "zepul-ai"` yazılır. Panel kararında bu alan yer almaz.
- **Kâtip notu:** `hafiza.ts katipNotYaz` tür (note, task, receipt), 20 000 karakter, yol kalıbı ve sır filtresini (`maskele` ile) denetler. Reddedilen not MyBrain'e gitmez ve 400 döner. MyBrain reddi 502 olur ve `mybrain` hata olayı yayılır. Receipt'te harness her zaman `claude`'dur.
- **Şefsiz duman testi** (`--sef-yok`, port 8829, sahte vault): anahtarla `ajanlar`, `olaylar` ve SSE 200 döndü. `mesaj`, `ayarlar`, `kapat` ve `limit` 403 döndü. Yanlış anahtar 401, şef yokken `gorev` 409, bilinmeyen `cevap` ve `onay` 404, sırlı not 400, MyBrain reddi 502 döndü. Anahtar olay loguna düz metin olarak geçmedi. Gerçek `%LOCALAPPDATA%` dosyasına yazılmadı.
## Yerel varsayılan model: `zepul-gptoss-cpu` (02.10.2026)

- **Yapılandırma:** `veri/ollama/Modelfile.gptoss-cpu` (`gpt-oss:20b`, `num_ctx 32768`, `num_gpu 0`). Kurulum: `ollama create zepul-gptoss-cpu -f veri/ollama/Modelfile.gptoss-cpu`. Kimlik `ollama:zepul-gptoss-cpu:latest`; şef ve işçilerin varsayılanı. (03.10: denetçi de yerel; aşağıdaki M1 notu.)
- **Deney:** `%TEMP%\zepul-l2-deney\`. Gerçek SDK oturumu kuruldu: `claude_code` preset, KURALLAR eki, `rolSecenekleri("isci")`, 15 araç, ilk istek 12,9k token. zepul-ai'nin `qwen3.5:9b` modeli 8k bağlamla GPU'da yüklüydü ve boş VRAM 0,5 GB'tı.
  - Read ve Write doğru sırayla çağrıldı, dosyaya `portakal-42` yazıldı. `init.model` yerel ad, `apiKeySource` none. 4 isteğin hepsi `Bearer ollama` ile vekil üzerinden Ollama'ya gitti.
  - İlk tur 279 sn sürdü (yükleme 18 sn dahil). Sonraki turlar önek önbelleği sayesinde 18 ile 37 sn arasında. Toplam süre 337 sn.
  - Hız: istem işleme 48 tok/sn, üretim 6,8 tok/sn.
  - Kaynak: RAM yaklaşık 13,6 GB, VRAM 0. `qwen3.5:9b` GPU'da kaldı, boşaltılmadı.
- **Elenenler:**
  - `qwen3-coder:30b` 32k, GPU'da: masaüstü VRAM kullanımında CUDA OOM verdi (MyBrain notu).
  - Aynı model CPU'da: 22 GB yer kaplıyor, boş RAM 0,5 GB'a düştü, 10,9k token istem 300 sn içinde bitmedi.
  - `num_thread 8`: belirgin kazanç sağlamadı (istem 44,8, üretim 9,0 tok/sn).
- **Hazırlık (`yerelHazirlik`):** Modelfile'da `num_gpu 0` varsa model GPU'yu paylaşır. Bu durumda başka model yüklü olsa da çalışır ve VRAM denetimi yapılmaz. Bunun yerine boş RAM, model boyutu + 1 GiB'den az olmamalı. Bağlam `/api/show` üzerinden okunan `num_ctx` değerinden alınır.

## M1: yerel denetçi, yerel eşikler, yerel yuva (03.10.2026)

Birim testleri `test/faz55.test.ts` (6. ve 7. bölüm), `test/entegrasyon.test.ts` ve `panel/panel.test.mjs`. Ollama ve SDK sahte; canlı model koşusu yapılmadı.

- **Yerel denetçi:** `modelHatasi` denetçide `ollama:` kabul eder. Fable yasağı her rolde aynen kalır (`ollama:` altında da). `VARSAYILAN_MODELLER.denetci` artık `ollama:zepul-gptoss-cpu:latest`. Bağımsızlık modelden değil ayrı ajandan gelir: denetçi `denetci-<işçi>` adlı, kodun başlattığı ayrı oturumdur, işçi kendi işini onaylayamaz. Yerel denetçi Claude erişimini beklemez (`denetimClaudeBekler`). `denetim` olayı denetçinin modelini taşır, panel kartında yerel rozet görünür.
- **Yerel eşikler (`yerel_esik_carpani`, varsayılan 3, 1-10, yalnız panel):** yalnızca yerel modelli ajana uygulanır, Claude ajanının eşikleri değişmez.
  - Ölüm: 600 sn × 3 = 1800 sn; açık araçla 15 dk × 3. İlk tur (yükleme + 12,9k token istem ≈ 280 sn) böylece ölüm sayılmaz. Sırada bekleyen ajan `kuyrukta` durumundadır, ölüm denetimine girmez.
  - İlerlemesiz: 30 dk × 3 = 90 dk. Tekrar durdurma: 5 × 3 = 15. Tekrar uyarısı 3'te kalır (ucuz dürtme). A-B döngüsü aynen.
  - Maliyet hızı değişmez: yerel maliyet zaten 0 (`yerelOlay`).
- **Yerel yuva (`yerel_azami`, varsayılan 1, 1-4, yalnız panel):** yerel modelli ajanın ilk görevi yuva boşalana dek bekler; durum `kuyrukta`, panelde "yerel sırada". Reddedilmez, FIFO sırayla başlar. Hazırlık (RAM ölçümü) sıra gelince yapılır.
  - Denetçi kuralın dışında değildir, yuvaya sayılır. İşçi TAMAM dönünce `denetimde` olur ama turu sürerken (`calisiyor`) yuvayı tutar. Turu bitince (`bekliyor`) yuvayı bırakır, denetçi ancak o zaman başlar. Yeniden denetimde de aynı bekleme var.
  - Diriltilecek ölü (oturumu açık) yuvasını korur; vazgeçilen (oturumu kapalı) boşaltır.
  - Sınır: yalnız ilk görev sıraya girer. Açık oturuma gelen mesaj (VETO düzeltmesi, şef mesajı) yuva beklemez. VETO sonrası denetçinin son turu ile işçinin düzeltme turu kısa süre örtüşebilir.
- **Şef ve yuva (seçilen yol: seçenek 1, şef sayılmaz):** Şef yuvaya sayılsaydı `yerel_azami: 1` ile hiçbir işçi başlayamazdı; bu kilitlenme olurdu. Şef işçi çalışırken çoğunlukla gelen kutusunu bekler, tur işlemez.
  - RAM: şef ve işçi aynı modeli kullanıyorsa Ollama modeli tek kopya yükler (aynı ad ve aynı `num_ctx`). `yerelHazirlik` model zaten yüklüyse RAM denetimini atlar, yani ikinci kopya için yer aramaz. Farklı bir yerel model seçilirse boş RAM ölçütü (model boyutu + 1 GiB) uygulanır.
  - Doğrulanmadı: iki oturumun aynı anda istek atması `/api/ps`'te tek kayıt mı veriyor, ölçülmedi (canlı koşu bu işin dışında). Ollama'nın `OLLAMA_NUM_PARALLEL` değeri 1 ise ikinci istek Ollama'da sıraya girer; büyükse KV önbelleği paralel sayısıyla çoğalır. İlk canlı koşuda `/api/ps` `size` alanı şef + işçi varken bir kez okunmalı.

## Y1, Y2, Y4 düzeltmeleri (03.10.2026, canlı koşu yok)

- **Karma düzen:** `VARSAYILAN_MODELLER` şef ve denetçi `claude-sonnet-5-5`, işçiler `ollama:zepul-gptoss-cpu:latest`. `yerel_azami: 1` aynen.
- **Y1:** Yerel modelli ajanda `permissionMode` `auto` yerine `dontAsk`; kapının izin/geç kararı açık `allow` döner (`kapiHookOlustur`, `ajan.model`). Claude ajanında `auto` ve `{}` aynen. Kanıt: `test/faz55.test.ts` "uçtan uca (Y1)", gerçek SDK sahte Ollama'ya bağlı, Bash komutu dosya yazdı, `permission_denials` boş. Jev erişilemezse yerelde riskli komut insana, kalanı geçer (sınıflandırıcı yedeği yok).
- **Y2:** `yerelOrtam` `API_TIMEOUT_MS`, `CLAUDE_STREAM_IDLE_TIMEOUT_MS`, `CLAUDE_STREAM_FIRST_BYTE_TIMEOUT_MS` 1 800 000, `CLAUDE_CODE_MAX_RETRIES` 1. Adlar ve varsayılanlar (600 sn, akış boşta 300 sn) CLI 2.1.284 ikilisinden okundu.
- **Y4:** Brif şeması modeli `modelHatasi` ile doğrular: `ollama:<ad>` kabul, Fable her biçimde red; hata metni `ollama:<ad>` biçimini söyler.

## B4: `gorev_sonuc` verdict değerleri (03.10.2026)

`docs/sozlesme/faz7-zepul-ai.md` verdict listesi vermiyor; kodda kullanılanlar: `TAMAM`, `BASARISIZ` ve yeni **`REDDEDILDI`**.
- `REDDEDILDI`: kullanıcı `zepul_ai_sor` sorusuna "hayır" dediyse ya da şefin yanıtı `REDDEDİLDİ` ile başlıyorsa (`ZEPUL_AI_KURALI` şefe bunu söyler). Görev yapılmadı; eskiden `TAMAM` kapanıyordu (docs/kabul/faz-karma.md B4).
- zepul-ai tarafı bilinmeyen verdict'e hazır olmalı; yalnız `TAMAM` işin yapıldığı anlamına gelir. Sözleşme metni `docs/` altında (bu işin dışı); güncellenmesi şefe bırakıldı.
- Testler: `test/faz7.test.ts` (B4 bölümü).

## av9: kabuk kısa yolları yerine denetçi araçları (03.10.2026, canlı koşu yok)

- **Araçlar:** Denetçinin bus'ında `mutasyon_kopyasi_ac {ad, ref?}` ve `mutasyon_kopyasi_sil {ad}` var; başka rol görmez. Ad `^[a-z0-9][a-z0-9-]{0,31}$`. Açma `git worktree add --detach <kök>/<ad> <sha>` (ref seçenek biçiminde olamaz, `rev-parse --verify` ile çözülür, varsayılan işçinin dalı). Silme `kopyaKaldir`'ın güvenli yolundan gider; kopya bağlantıysa yalnız bağ silinir.
- **Kapı:** `kopyaIciSilme` ve `kopyaIciWorktree` kalktı. Denetçinin kabuktaki silmesi ve `worktree add`'i Jev'e gider (K26 yeniden denetimi kalır: kopya içi silme kesin yasağa düşmez). Değişkenli silme `red`: "silme için mutasyon_kopyasi_sil aracını kullan".
- **Hata avı 9:** Grep/Glob sır hedefi `red`; kesin yasak öncesi NFKC, NEL/LS/PS, akıllı tırnak ve tire normalleşir; joker sır adı sır; `-x=…` hedef; `/s/q`, `rd/s/q`, `find -exec {} +`, `@splat` özyineli silme. `find`, `-exec`, `xargs`, PowerShell `@` alt küme dışı.
- **Doğrulanmadı:** Gerçek denetçinin araçları kullanıp kabukta `rm`/`worktree` yazmadığı canlıda görülmedi; ilk canlı denetimde `onay_istek` ve kapı olaylarına bakılmalı.

## Faz 6 gölge Laya: 8796 (03.10.2026)

- **Ne:** `araclar/laya-golge-sunucu.py`, eğitilmiş modeli (kf5 uzlaşı koşusu, `model/laya-esik.json`, T=0,50) laya-env'in Python'uyla `127.0.0.1:8796/v1/systemone`'da sunar. API 8788 ile aynıdır. `risk` cevabına `ham_secim` ve `guvenli_olasilik` eklenir. Kapının varsayılan Laya adresi artık 8796 (`ZEPUL_LAYA_URL` ile değişir). Kararı yine Jev verir. 8788'deki eski Laya'ya dokunulmaz.
- **Otomatik:** `Baslat.bat`, 8796 dinlenmiyorsa sunucuyu simge durumunda ayrı bir pencerede başlatır ve beklemez. Model yüklenene kadar (yaklaşık 10-20 sn) gelen kapı soruları `Laya (gölge)` hatası olarak sayılır.
- **Elle başlatma (repo kökünde):** `%USERPROFILE%\laya-env\Scripts\python.exe araclar\laya-golge-sunucu.py`. Seçenekler: `--esik T`, `--model <klasör>`, `--port`. Yalnızca yükleme denemesi için `--test` kullanılır.
- **Durdurma:** Süreç kimliği `%LOCALAPPDATA%\zepul-os\laya-golge-sunucu.pid` dosyasındadır (repo dışında). PowerShell'de `Stop-Process -Id (Get-Content $env:LOCALAPPDATA\zepul-os\laya-golge-sunucu.pid)` ile ya da simge penceresini kapatarak durdurulur. Sert kapanışta pid dosyası kalabilir, sonraki açılışta üzerine yazılır.
- **Kontrol:** `GET http://127.0.0.1:8796/health` → `{"status":"ok","loaded":["multilingual"]}`.

## Komut merkezi (04.10.2026)

- **Açma:** repo kökünde `Komut Merkezi.bat` (ya da `npm run merkez`). Tek tuşla: `1` ikisini yeniden başlat, `2` OS, `3` AI, `4` ikisini başlat, `5`/`6`/`7` durdur, `8`/`9` paneller, `R` özet raporu, `I` ilerleme, `L` gölge Laya, `J` Jev'i şimdi sor (tek istek), `G` son günlükler, `D` durum, `Q` çıkış. Üst satır 8820, 8830, 8796, 8788, 11434 portlarını ve Jev'in son bilinen durumunu (ağsız, `logs/hatalar.jsonl` ve `logs/laya-golge.jsonl`) gösterir.
- **Tek tık:** `Baslat Hepsi.bat` = menüsüz `4`. Tek işlem: `node araclar/komut-merkezi.mjs <tuş>`.
- **Yeniden başlatma:** önce düzgün kapatma (OS `POST /api/kapat`, AI `zepul-ai\Durdur.bat`), port en çok 20 sn boşalması beklenir, sonra mevcut başlatıcı (`Baslat.bat`, `zepul-ai\Baslat.bat`) ayrı pencerede çağrılır ve port açılana kadar (en çok 60 sn) beklenir. Komut merkezi kapansa da sunucular çalışır.
- **Penceresiz başlatma (04.10.2026):** komut merkezi `npm run baslat` komutunu `detached` + `windowsHide` ile doğrudan başlatır (cmd penceresi yok, `Baslat.bat` çağrılmaz); çıktı `logs/orkestra-sunucu.log` ve `logs/zepul-ai-sunucu.log` dosyalarına eklenir; panel adresleri (token dahil) yalnızca ekrana yazılır, günlüğe yazılmaz.
- **Zorla kapatma:** yalnızca düzgün kapatma yetmezse; yalnızca portu `127.0.0.1`/`0.0.0.0`/`::1` üzerinde dinleyen ve komut satırında `zepul-os`, `zepul-ai` ya da `laya-golge-sunucu` geçen süreç. 8830'u tailnet adresinde dinleyen tailscaled ve diğer süreçlere dokunulmaz.
- **Denetim:** `--test` ağsız öz-denetim, `--durum` durum satırı ve panel adreslerinin bulunduğu (adres yazdırılmaz), `--kuru <tuş>` hiçbir şeyi çalıştırmadan adımları yazdırır. Token ekrana yazılmaz; günlük satırlarında `t=***` olarak maskelenir.
- **Doğrulanmadı:** gerçek yeniden başlatma (kullanıcı onayı olmadan denenmedi); yalnızca `--kuru` ile adımlar ve canlı durum satırı denendi.

## Çalışma alanları (04.10.2026, canlı koşu yok)

- **Sözleşme:** `docs/sozlesme/calisma-alanlari.md`. Ayar `calisma_alanlari` (şef yazamaz); yasak kökler `bekci.ts alanHatasi`. Listeye elle yazılmış yasak kök kapıda ve `izinliCwd`'de yok sayılır.
- **Kapı:** alan içi salt okuma Jev'siz izin; alan dışı ilk okumada `onay_istek` olayı `onay_tur:"alan"`, `yol`, `onerilen` (git kökü, yoksa klasör; öneri yasak köke düşerse düz insan kartı) taşır. `POST /api/onay {alana_ekle:true}` önerileni ekler. Yalnız okuma araçları (Read, Grep, Glob, LS, NotebookRead) kart açar; alan dışına yazma bugünkü kapıdan geçer.
- **İşçi:** `ajan_baslat` `cwd` zepul-os dışındaysa alan içinde olmalı; alanın git deposunda `.worktrees/<ad>` açılır, merge-base, dalFarki ve birleştirme deponun o anki dalına (`anaDal`). Depo değilse işçi ya da OWNS'lu rol reddedilir. Alanın `CLAUDE.md`'si brifte "Önce oku"nun başına girer.
- **Bilinen sınır:** OWNS çakışma denetimi depo ayırt etmez (zepul-os `panel/**` ile zepul-ai `panel/**` çakışır sayılır).
- **Doğrulanmadı:** canlı şef ile başka depoda işçi; yalnızca birim ve geçici depoyla uçtan uca test.

## Güven modu ve Laya yedeği (04.10.2026, canlı koşu yok)

- **Sözleşme:** `docs/sozlesme/guven-modu.md`. Ayar `guven_modu {kademe, bitis, alan_otomatik}` (şef yazamaz; `POST /api/ayarlar` da yazamaz, yalnız `POST /api/guven`). Süre dolunca `bekci.ts guvenYoneticisi` jev'e döndürür ve `guven` olayı yayılır; bitişi geçmiş kademe kapıda zaten jev sayılır.
- **Kapı:** `tam`: kesin yasak (bileşik komutun her parçası dahil), belirsiz yol, sır ve sahiplik önce; sonra Jev'siz `izin (tam güven)`, `karar_kaynagi:"tam-guven"`, Laya gölgesi `jev:null, kademe:"tam"` ile kaydedilir. Alan kartı yalnız `alan_otomatik` ile otomatik. `kullanici`: salt okuma dışı her şey insana. DNS çözüm hatası ve yerel ajanın web isteği `tam`'da da insana gider (bilinçli).
- **Laya yedeği:** Jev hata verirse (429, ağ, zaman aşımı, bozuk yanıt) karar aynı Laya yanıtından, aynı eşik ve kurallarla; `karar_kaynagi:"laya-yedek"`. 429'da 10 dk Jev'e gidilmez (`GET /api/guven` → `jev_soguma_bitis`). Laya da düşerse eski Jev hata yolu. Gölge kaydı `jev:null, karar_kaynagi:"laya-yedek"`; istatistikte `laya_yedek` ayrı sayılır, uyuma girmez.
- **Toplu onay:** `POST /api/onay/hepsi {karar:"evet"}`; kesin yasak kartları (`kesin`) atlanır, tek tek onaylanır.
- **Doğrulanmadı:** çalışan orkestra yeniden başlatılmadı; yalnız birim testleri ve kaynak bağlantı denetimi.

## Yetenek görevi ve ikinci görüş (04.10.2026, canlı koşu yok)

- **Sözleşme:** `docs/sozlesme/yetenek-dongusu.md` 2-3. `[yetenek]` önekli zepul-ai görevi `gorev_alindi`/`gorev_sonuc` olayında `gorev_tur:"yetenek"` taşır. Ara turlar görevi kapatmaz; şefin turu `TAMAM:`/`REDDEDİLDİ:`/`BAŞARISIZ:` ile başlayınca kapanır. TAMAM'da ntfy `Zepul OS: bilgilendirme: yeni yetenek hazır` (yol ve sır yok).
- **İkinci görüş:** şefin `ikinci_gorus {soru, baglam}` aracı `baglama.ts ikinciGorusYoneticisi` ile ayrı query açar: Read/Grep/Glob, cwd ana repo, bus yok, tek istem, en çok 5 dk (`maxTurns` 12). Araçlar şef gibi kapıdan geçer (`sef/ikinci-gorus`). Model `ikinci_gorus_modeli` (varsayılan Opus, şef yazamaz). Fable istisnası yalnız `kapi.ts modelHatasi` içinde (`IKINCI_GORUS_ROLU`); işçi ve denetçide yasak aynen.
- **Maliyet:** `sef/ikinci-gorus` adına birikimli `maliyet` olayı; bekçi ayrı seri olarak izler, hız aşılınca şefi durdurur. Bu olay şefin oturum maliyetini ezmez (`yay` yalnız `a.id === o.ajan` maliyetini ajana yazar); panel toplamına girmez.
- **Doğrulanmadı:** çalışan orkestra yeniden başlatılmadı; yalnız sahte SDK'lı birim testleri ve kaynak bağlantı denetimi.

## Bağımsız denetim düzeltmeleri: görev kimliği, süre, iptal (04.10.2026, canlı koşu yok)

- **Görev kimliği:** şefe giden zepul-ai iletisi `[kaynak: zepul-ai · güven: orta] [görev: <id>]` önekini taşır; şef sonucu `TAMAM [gorev-id]:` (aynı biçim `REDDEDİLDİ`, `BAŞARISIZ`) yazar ve yalnızca o görev kapanır. Kimliksiz sonuç: tek açık görevde eski davranış, birden fazlasında hiçbiri kapanmaz, şefe bir kez "hangi görev?" notu.
- **Süre ve iptal:** `gorev_sure_dk` (120) ve `yetenek_gorev_sure_dk` (240) dolunca `BASARISIZ "süre doldu"`; şef yazamaz. `POST /api/gorev/iptal {gorev_id}` (panel token'ı ve zepul-ai anahtarı) → `BASARISIZ "iptal edildi"`, panel görev kartında İptal düğmesi. Önek dışı ara yanıtta 30 dk'dan eski görev için şefe bir kez hatırlatma. Bekçi şefi durdurursa açık görevler `BASARISIZ "bekçi durdurdu"`.
- **İkinci görüş:** `baglama.ts ikinciGorusKur` kapı kancasını kök REPO ile kurar (test kancayı çağırır); istemdeki soru ve bağlam maskelenir. Şef talimatı `sefTalimati()` ile üretilir.
- **Doğrulanmadı:** çalışan orkestra yeniden başlatılmadı; yalnız birim testleri.
