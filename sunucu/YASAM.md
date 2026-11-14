# Yaşam döngüsü ve sözleşme (Faz 2)

İki modül var: `sunucu/yasam.ts` (commit zorunluluğu, ölüm, diriltme) ve `sunucu/sozlesme.ts` (sözleşme doğrulama, sonraki adım). Kararları saf fonksiyonlar verir. Yalnızca `kirliDosyalar` ile `sonCommit` git çalıştırır ve dışarıyla konuşur. Kutuya itme, `query` yeniden başlatma ve ntfy entegratörün işidir. Testler: `test/yasam.test.ts`, `test/sozlesme.test.ts`.

## Tasarım

| Parça | Karar |
|---|---|
| `kirliDosyalar(cwd)` | `git --no-optional-locks status --porcelain=v1 -z --untracked-files=all`. Yollar depo köküne göredir; izlenmeyen klasör dosya dosya gelir. `-z` sayesinde Türkçe adlar tırnaksız ve bozulmadan gelir. Yeniden adlandırmada yalnızca yeni yol alınır. `--no-optional-locks`, `index.lock` alıp ajanın kendi commit'iyle yarışmayı önler. |
| `calistir`, git zaman aşımı | Git (ve `worktree.ts`'in git'i) `calistir` ile çalışır: `execFile`, shell yok. Zaman aşımında süreç **ağacı** öldürülür (W9): Windows'ta `taskkill /T /F /PID`, diğerlerinde yalnız çocuk `kill` (torun yaşayabilir, söz yine zamanında reddedilir). `execFile`'ın kendi `timeout`'u yalnız çocuğu öldürür; boruyu miras alan torun yaşarsa söz asılı kalır. `yasam.ts` git zaman aşımı 8 sn (`GIT_ZAMAN_ASIMI_MS`); `degisiklikler`'in üç git çağrısı `Promise.all` ile paraleldir, toplam Stop hook süresinin (30 sn) altında kalır. `worktree.ts` 60 sn. |
| `sonCommit(cwd)` | `git log -1`. Depoda hiç commit yoksa `null` döner. Klasör depo değilse hata fırlatır; hata yutulmaz. |
| `stopKarari` | Ağaç temizse engellemez. Kirliyse iki kez engeller (`AZAMI_BLOK = 2`). Üçüncüde döngüyü kırar: engellemez ama `kirli-agacla-bitti` hatası üretir. |
| `stopHook` | Blok sayacı `session_id` başına tutulur. `stop_hook_active = false` yeni bir bitirme zinciri demektir ve sayacı sıfırlar. Ağaç temizlenince sayaç silinir. git okunamazsa engellemez, `git-status-okunamadi` hatası yazar. Böylece yanlış bir gerekçeyle döngüye girilmez. `owns` verilirse yalnızca OWNS içindeki kirli dosyalar engeller (F7). |
| `ownsIcinde`, `ownsAyir`, `degisiklikler` | OWNS eşlemesi kapıyla aynı kuraldır (`sahiplikIhlaliMi`: tam yol ya da `dizin/**`, harf duyarsız). OWNS, cwd'nin git'teki kanonik yoluna göre çözülür (`rev-parse --show-toplevel --show-prefix`); git yolları depo köküne göredir. OWNS yoksa her yol içeride sayılır. |
| `olumAdaylari` | Yalnızca `calisiyor` durumundaki ve `simdi - son_olay_ts >= esikMs` olan ajanlar aday olur. Eşiğin tam kendisi ölü sayılır. Açık araç çağrısı olan ajanın (`arac` olayı gelmiş, `arac_sonuc` gelmemiş; orkestra `acikArac` kümesinde `arac_id` tutar) eşiği `max(esikMs, 15 dk)` olur (F4, kabul K3): uzun test, derleme ya da `ping` sessizliği ölüm sayılmaz. Küme tur bitince (`bekliyor`), oturum kapanınca (`bitti`) ya da çökünce (`hata`) boşalır. |
| Maliyet (`maliyetSayaci`, `baglama.ts`) | Ajan maliyeti oturumların toplamıdır (F10, kabul K10). SDK'nın `total_cost_usd`'si bir query içinde birikimlidir, `resume` ile açılan yeni query'de sıfırdan başlar. `maliyet` olayındaki `maliyet_usd` ajanın toplamı, `oturum_usd` o query'ninki, `oturum` SDK session_id'sidir. Sınır: `result` üretmeden çöken oturumun maliyeti bilinmez. |
| `OLUM_ESIK_MS` | `ZEPUL_OLUM_SN` (saniye, pozitif) × 1000. Varsayılan 600 sn. Doğrulama için `ZEPUL_OLUM_SN=20` ile yapay sessizlik kurulabilir. |
| `diriltmePlani` | `deneme` = bu ölüm için şimdiye kadar yapılmış diriltme sayısı (ilkinde 0). Kurallar:<br>• `deneme >= 3` → `vazgec`<br>• Oturum bitmiş ve `sessionId` var → `resume`<br>• Aksi hâlde → `mesaj`<br>`resume` ve `mesaj` aynı diriltme metnini taşır. |
| `SozlesmeSemasi` | `verdict`, `blockers` (metin ya da `{ne, nerede?, onem?, oneri?}`), `commits`, `ozet` (en çok 600 karakter). Gerekçesiz `VETO` (boş `blockers`) geçersizdir (KURALLAR G). |
| `sonrakiAdim` | İşçi (`isci`):<br>• `TAMAM` ve blocker yok → `denetciye`; denetçi yoksa `sefe`<br>• Blocker kural ya da politika kaynaklıysa → doğrudan `sefe` (KISMI ve metinde "kural", "yasak", "politika"; ya da herhangi bir blocker'da `onem: "politika"`). Düzeltilemeyecek iş için içeriksiz düzeltme turu açılmaz.<br>• `KISMI`/`BASARISIZ` ve blocker yok → `sefe` (D16). Düzeltme turu yalnız blocker'ları okur. Şema bunu reddetmez; ret sözleşmeyi hiç ulaştırmayabilir (K6), şef özeti görür.<br>• Diğer durumlar → `duzeltme` (en çok 2 tur), sonra `sefe`. Blocker metnindeki son nokta kırpılır (mesajda ".." olmaz).<br>Denetçi (`denetci`):<br>• `PASS` → `birlestiriciye`<br>• `VETO` → `duzeltme` (en çok 2 tur), sonra `sefe`<br>Rol ile verdict uyuşmuyorsa ya da rol bilinmiyorsa → `sefe`. |
| `blockerMetni` | Blocker nesnesini metne çevirir. Panel `blockers` alanını metin dizisi olarak bekler (`docs/panel-api.md`). |

## SDK Stop hook biçimi

Kaynak: `@anthropic-ai/claude-agent-sdk` 0.3.284, `sdk.d.ts`.

**Girdi:** `StopHookInput = BaseHookInput & { hook_event_name: 'Stop'; stop_hook_active: boolean; last_assistant_message?; background_tasks?; session_crons? }`

- `BaseHookInput` şu alanları taşır: `session_id`, `transcript_path`, `cwd`, `agent_id?`.
- `agent_id` yalnızca alt ajanda doludur. Alt ajan bitince `Stop` değil, `SubagentStop` tetiklenir; bu yüzden yalnızca `Stop` bağlanır.

**Çıktı:** `SyncHookJSONOutput` içindeki `{ decision: 'block', reason }`.

- `reason` modele iletilir ve tur devam eder.
- Boş nesne `{}` bitmeye izin verir.
- `continue: false` kullanılmaz, çünkü tüm oturumu durdurur.
- `hookSpecificOutput: { hookEventName: 'Stop', additionalContext }` da turu sürdürür ama hata sayılmaz; kullanılmadı.

**Tip denetimi:** `tsc --strict` (TypeScript 5.9) `stopHook` dönüşünü `HookCallback` tipine karşı denetledi. Yanlış bir `decision` değeri derleme hatası verdi.

**Streaming input notu:** Stop her turun sonunda tetiklenir, yalnızca son turda değil. İşçi bir turu kirli ağaçla bitirirse o tur da en çok iki kez engellenir. Bu bilinçli bir seçimdir ("sık commit").

## `resume` kararı

- Oturum hâlâ açıksa (`kutu.kapali === false`) diriltme **mesajdır**: metin gelen kutusuna itilir, oturum bağlamı zaten canlıdır.
- Oturum kapanmışsa (`for await` bitmiş, çökmüş ya da `sozlesme_don` kutuyu kapatmış) ve `session_id` biliniyorsa **`resume`** yapılır:
  - Yeni bir gelen kutusu açılır.
  - `query({ prompt: yeniKutu, options: { ...aynıSecenekler, resume: sessionId } })` çağrılır.
  - Diriltme metni yeni kutuya ilk mesaj olarak itilir.
- `forkSession` verilmez. Aynı `session_id` sürer, bu yüzden Stop sayacının anahtarı da değişmez.
- **`cwd` aynı kalmalı.** SDK oturumu proje klasörüne göre saklar (`~/.claude/projects/`). `persistSession: false` verilmemeli.
- Oturum kapalıysa ve `session_id` yoksa plan yine `mesaj` olur (`neden` bunu söyler). Bu durumda entegratör yeni bir oturum açar ve metni ilk görev olarak verir.
- **Doğrulanmadı:** Faz 1 spike'ı `resume`'u denemedi (`sunucu/SPIKE.md`). Entegratör, bağlamanın ardından tek bir duman testiyle doğrulamalı. Test: oturumu kapat, `resume` ile aç, ajan önceki konuşmayı hatırlıyor mu?

## Entegratör için bağlama talimatı (`sunucu/orkestra.ts`)

### 1. Stop hook

**Nereye:** `ajanBaslat` → `query` seçeneklerindeki `hooks`. Yalnızca şef olmayan roller için bağlanır; şef dosya yazmaz.

```ts
const blokSayaci = new Map<string, number>(); // modül düzeyi
hooks: {
  PreToolUse: [{ hooks: [kapi(a, cwd)], timeout: 600 }],
  ...(sef ? {} : { Stop: [{ hooks: [stopHook(() => a.worktree, blokSayaci, (o) => yay({ ajan: a.id, ...o } as OlayGovde))], timeout: 30 }] }),
}
```

**Ürettiği olaylar:** `olayYaz`'a `ajan` alanı olmadan gelir; `ajan` alanını entegratör ekler.

- `kapi {karar:'red', neden:'Stop engellendi (n/2): …'}`
- `hata {kaynak:'ajan', tur_adi:'kirli-agacla-bitti', …}`: iş şefe düşer, şef commit için diriltme mesajı gönderir.
- `hata {kaynak:'arac', tur_adi:'git-status-okunamadi', …}`

### 2. `sozlesme_don` aracı

**Nereye:** `busSunucusu` içinde.

1. Şemayı `SozlesmeSemasi.shape` yap. Bu, blocker nesnelerini ve 600 karakter sınırını getirir. `.shape` refine'ı taşımaz, bu yüzden işleyicide ayrıca `sozlesmeDogrula(s)` çağır. Geçersizse `yanit(hata, true)` dön ve kutuyu **kapatma**.
2. Ret kontrolünü yap (`sozlesmeIsle`, `baglama.ts`): kirli dosyalar `ownsAyir` ile OWNS içi ve dışı diye ayrılır. Yalnızca OWNS içindekiler `sozlesmeKirliAgacRed`'e gider; doluysa araç hata döner, kutu açık kalır, ajan commit atıp yeniden çağırır. OWNS dışındaki kirli dosyalar (başkasının işi olabilir) sözleşmeyi reddetmez: `sozlesme` olayına `uyari: "OWNS dışında commit'lenmemiş N dosya var; sahibine sor"` eklenir, aynı satır şefe giden mesaja ve aracın sonucuna da yazılır (F7, kabul K6). OWNS yoksa eskisi gibi hepsine bakılır.
   - **Sahiplik commit anında (F9):** Ajan başlarken `bazAl(cwd)` HEAD'i (`baz_sha`) ve o an kirli olan yolları kaydeder. `sozlesme_don` sırasında `git diff --name-only --no-renames -z <baz_sha>..HEAD` ile başlangıçtan sonra kirlenen dosyalar toplanır. Bunlardan OWNS dışında olan varsa sözleşme reddedilir: `OWNS dışı değişiklik: …; geri al ya da sahibine devret`. Böylece Bash ile OWNS dışına yazılıp commit'lenen iş kabul edilmez (kabul K8). Git çağrıları `execFile`, `shell: false`.
   - İstisnalar: başlangıçta zaten kirli olan dosyalar (başkasının commit'lenmemiş işi) ve başka bir ajanın OWNS'una düşen yollar (aynı ağaçta paralel işçi) ihlal sayılmaz, yalnızca uyarı olur. Baz alınamadıysa kirli dosyalar için ret yoktur. OWNS yoksa sahiplik denetlenmez.
   - Sınırlar: aynı ağaçta OWNS'suz başka bir ajanın commit'i bu ajana yazılır; başlangıçta kirli olan bir dosyaya sonradan yazma görünmez. Paralel işçiler ayrı worktree'de (`cwd: repo/.worktrees/<ad>`) çalışmalı.
3. Olayı yayınla: `yay({ ajan, tur:'sozlesme', verdict, blockers: veri.blockers.map(blockerMetni), commits, ozet })`.
4. Adımı hesapla: `const adim = sonrakiAdim(veri, a.rol, duzeltmeSayisi.get(isId) ?? 0, denetciVar)`, ardından yönlendir. Hepsi `mesajIlet` ile gider; panelde `mesaj` olayı olarak görünür, yeni olay türü gerekmez.
   - `duzeltme`:
     - İşçide mesaj işçinin kendisine gider. Denetçide (VETO) işi yapan işçiye gider; denetçi ile işçi eşlemesi Faz 3'tedir.
     - `duzeltmeSayisi` 1 artırılır.
     - İşçinin kutusu kapatılmaz. Kapalıysa `resume` ile açılır.
   - `denetciye`: denetçiye gider; denetçi yoksa şef başlatır (Faz 3).
   - `birlestiriciye`: birleştiriciye gider.
   - `sefe`: şefe `SÖZLEŞME …` ile birlikte `adim.mesaj` gider. Şef yalnızca bunları görür.
5. **Kutuyu kapatma kuralı:** Kutu yalnızca `sefe` ya da `birlestiriciye` adımında kapatılır. Bugünkü "her sözleşmede kapat" davranışı (`ponytail` notu) bununla değişir.

### 3. Ölüm tespiti ve diriltme

**Nereye:** `setInterval` bloğu (30 sn).

1. `OLUM_MS` yerine `OLUM_ESIK_MS` kullan.
2. Adayları al:

   ```ts
   olumAdaylari([...ajanlar.values()]
     .filter((a) => ![...onaylar.values()].some((o) => o.ajan === a.id)) // onay bekleyen ayıklanır
     .map((a) => ({ id: a.id, durum: a.durum, son_olay_ts: Date.parse(a.son_olay_ts) })), Date.now(), OLUM_ESIK_MS)
   ```

3. Her aday için bugünkü `durum: 'olu'` ve `hata sessizlik` olaylarını üret. Ardından şu girdilerle `diriltmePlani` çağır:
   - `deneme`: ajan başına `Map`
   - `oturumBitti`: `a.kutu.kapali`
   - `sessionId`: `for await` döngüsünde her mesajdan `a.sessionId = m.session_id`
   - `sonOzet`: ajanın son `metin` ya da `sozlesme.ozet` olayı
   - `sha`: `(await sonCommit(a.worktree))?.sha`
   - `kirli`: `await kirliDosyalar(a.worktree)`
4. Planın eylemini uygula:
   - `mesaj`: `mesajIlet('sunucu', a, plan.mesaj)`. `ilet`, durumu `calisiyor` yapar ve `son_olay_ts` tazelenir; bu yüzden aynı ajan bir sonraki eşiğe kadar yeniden aday olmaz.
   - `resume`: yukarıdaki `resume` akışını uygula. `ajanBaslat` içindeki `query` ve `for await` bloğunu `oturumAc(a, { resume })` gibi tek bir yere almak gerekir.
   - `vazgec`:
     - `yay({ ajan, tur:'hata', kaynak:'ajan', tur_adi:'diriltme-tukendi', mesaj, geri_alinabilir:true, devam_edilebilir:false, oneri:'insan bakmalı' })`
     - ntfy `hata` gönder (aşağıda).
     - Durum `olu` kalır.
5. `deneme` her diriltmede 1 artar. Ajan hatasız bir `result` ürettiğinde (tur tamamlandı, yani ajan gerçekten dirildi) 0'a döner.
6. KURALLAR H'ye göre `api_retry`, `rate_limit` ve `result.is_error` da ölüm sayılır. Bunlar bugün `olay.ts`'te `hata` ya da `durum:'hata'` olayına çevriliyor.
   - `durum:'hata'` olan ajan için de aynı `diriltmePlani` akışı çalıştırılabilir.
   - `rate_limit` reddinde diriltme `resetsAt` zamanına kadar ertelenmeli; limit dolmuşken mesaj göndermek bir denemeyi boşa harcar.

### 4. ntfy

- **Yalnızca** `vazgec` durumunda gönderilir. Her ölüm, her diriltme ya da her Stop engeli için gönderilmez; bunlar gürültüdür (KURALLAR L).
- Araç: `node araclar/ntfy.mjs "Zepul OS: hata: ajan 3 denemede dirilmedi" "<ajan id> dirilmedi, panele bak" x 3`. `bildir()` desenini izle: `spawn`, `stdio: 'ignore'`, hata yutulur.
- Mesajda dosya yolu, sır ya da kişisel bilgi olmaz.
- `kirli-agacla-bitti` hatası ntfy'ye gitmez; şefe düşer.

## Doğrulama (yol haritası Faz 2)

- **Kirli ağaçla bitirmek engelleniyor:** `test/yasam.test.ts` → `stopHook` testi. Gerçek git deposunda iki `block` dönüyor, üçüncüde bırakılıyor.
- **Yapay 600 sn sessizlik diriltmeyi tetikliyor:** `olumAdaylari` sınır testleri var. Uçtan uca doğrulama entegrasyondan sonra `ZEPUL_OLUM_SN=20` ile yapılmalı.
- **Kırmızıya döndür:** Kopyada şu bozmalar yapıldı:
  - `AZAMI_BLOK` 2→3 ve `<`→`<=`
  - `AZAMI_DUZELTME` 2→3 ve işçi dalında `<`→`<=`

  Her biri ilgili testleri kırmızıya düşürdü.
