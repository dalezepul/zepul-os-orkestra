# BRIEF

Şefin her işçiye verdiği brif şablonu. Şef, `<...>` alanlarını doldurur; boş alanlı brif ajanı başlatmaz. Brife her zaman `KURALLAR.md` enjekte edilir.

## Şablon

```markdown
# Brif: <iş adı>

**Model:** <sonnet-5.5 | opus-5.5>   (Fable YASAK)

## Amaç
<tek cümle>

## Bitti tanımı
<ölçülebilir madde; her maddenin yanında kanıtı: komut ve beklenen çıktı, commit sha ya da diff>

## Kapsam
- Dahil: <yapılacaklar>
- Hariç: <yapılmayacaklar>

## Dosya sahipliği
- OWNS (yazabilirsin): <yol listesi>
- DO-NOT-TOUCH (dokunma): <yol → sahibi>
- Önce oku: <çalışmaya başlamadan okunacak dosyalar>

Kural: OWNS dışında bir dosyaya ihtiyaç duyarsan dosyaya dokunma, sahibine `mesaj_gonder` ile yaz.

## Kısıtlar
- Bütçe: <en çok N tur / N USD>
- Süre: <en çok N dakika>
- Model: <yukarıdakiyle aynı>
- Diğer: <port, bağımlılık, dil vb.>

## Onay gerektirenler
<insana gidecek işler; en az KURALLAR.md §F yasak listesi>

## Dönüş sözleşmesi
Son mesajın yalnızca şu JSON olsun:
{"verdict":"TAMAM|KISMI|BASARISIZ","blockers":[],"commits":["<sha> <mesaj>"],"ozet":"<en çok 3 cümle>"}
```

## Örnek (doldurulmuş)

```markdown
# Brif: Faz 1 panel MVP, sunucu işçisi

**Model:** sonnet-5.5   (Fable YASAK)

## Amaç
Şefin bir işçi oturumu başlatabildiği, olayları SSE ile yayınlayıp JSONL'e yazan orkestra sunucusunu kurmak.

## Bitti tanımı
- `node --test` geçiyor. Kanıt: komut çıktısında `fail 0`.
- `GET http://127.0.0.1:8820/olaylar` (token ile) SSE akıtıyor. Kanıt: `curl -N` çıktısında en az 1 `data:` satırı.
- `POST /mesaj` ile ajana yazılan metin o ajanın gelen kutusuna düşüyor. Kanıt: test ve `olaylar.jsonl` kaydı.
- `logs/olaylar.jsonl` her satırda `ajan` ve `maliyet_usd` (`result.total_cost_usd`) alanını taşıyor. Kanıt: `node -e` ile ilk 5 satırın doğrulanması.
- Çalışma ağacı temiz. Kanıt: `git status --porcelain` boş.

## Kapsam
- Dahil: `query()` oturumu başına ajan, gelen kutusu (`push`), bus MCP araçları (`ajan_baslat` model zorunlu, `mesaj_gonder`, `log_sorgula`), SSE yayını, JSONL log, token doğrulama.
- Hariç: kapı (`kapi.ts`), sözleşme (`sozlesme.ts`), diriltme, worktree, panel arayüzü.

## Dosya sahipliği
- OWNS (yazabilirsin): `sunucu/orkestra.ts`, `test/orkestra.test.ts`, `package.json`, `tsconfig.json`
- DO-NOT-TOUCH (dokunma):
  - `panel/index.html` → panel işçisi
  - `sunucu/kapi.ts`, `sunucu/sozlesme.ts` → Faz 2 işçisi
  - `CLAUDE.md`, `KURALLAR.md`, `.loop/` → kâtip
  - `docs/`, `raporlar/`, `.claude/agents/` → kurulum ve rapor işçileri
- Önce oku: `KURALLAR.md`, `docs/yol-haritasi.md` (bölümler: "Mimari kararı", "Faz 1"), `BRIEF.md`

Kural: OWNS dışında bir dosyaya ihtiyaç duyarsan dosyaya dokunma, sahibine `mesaj_gonder` ile yaz.

## Kısıtlar
- Bütçe: en çok 40 tur.
- Süre: en çok 60 dakika.
- Model: sonnet-5.5.
- Diğer:
  - Port 8820, yalnızca `127.0.0.1`; dolu portlar kullanılmaz (8765, 8766, 8787, 8788, 8790, 8791-8795, 4180, 4190, 8801, 11434).
  - Bağımlılıklar yalnızca `@anthropic-ai/claude-agent-sdk`, `zod`, `tsx`; HTTP için Node standart kütüphanesi, `ws` yok.
  - Tüm metin Türkçe.

## Onay gerektirenler
- `KURALLAR.md` §F yasak listesindeki her iş.
- Listede olmayan yeni bağımlılık eklemek.
- Portu ya da bağlanma adresini değiştirmek.
- `push` (yalnızca faz sonunda, şefin kararıyla).

## Dönüş sözleşmesi
Son mesajın yalnızca şu JSON olsun:
{"verdict":"TAMAM|KISMI|BASARISIZ","blockers":[],"commits":["<sha> <mesaj>"],"ozet":"<en çok 3 cümle>"}
```
