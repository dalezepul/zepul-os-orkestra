import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DIZIN = fs.mkdtempSync(path.join(os.tmpdir(), "ikinci-gorus-"));
process.env.ZEPUL_AYAR_DIZIN = DIZIN;
after(() => fs.rmSync(DIZIN, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));

const { ayarOku, ayarYaz, SEF_YAZAMAZ, VARSAYILAN_AYAR } = await import("../sunucu/bekci.ts");
const { modelHatasi, SEF_FABLE, IKINCI_GORUS_ROLU } = await import("../sunucu/kapi.ts");
const { ikinciGorusYoneticisi, ikinciGorusKur, kapiBagimliligi, IKINCI_GORUS_ARACLARI, IKINCI_GORUS_MS, IKINCI_GORUS_KURALI, bekciOlay } = await import("../sunucu/baglama.ts");
const { BrifSemasi } = await import("../sunucu/brif.ts");
const REPO = process.cwd();

// ---------- Fable istisnası: tek yer kapi.ts modelHatasi ----------

test("Fable: işçi ve denetçi (ve diğer alt ajanlar) hâlâ reddedilir; yalnızca ikinci görüş danışma oturumu ve şef Fable açabilir", () => {
  for (const rol of ["isci", "denetci", "katip", "raporcu", "hata-avcisi"]) assert.match(modelHatasi(SEF_FABLE, rol)!, /Fable/, rol);
  assert.equal(modelHatasi(SEF_FABLE, IKINCI_GORUS_ROLU), null, "ikinci görüşte Fable serbest");
  assert.equal(modelHatasi(SEF_FABLE, "sef"), null);
  for (const m of ["claude-opus-5-5", "claude-sonnet-5-5"]) assert.equal(modelHatasi(m, IKINCI_GORUS_ROLU), null, m);
  for (const m of ["ollama:qwen3:8b", "ollama:fable:latest", "claude-fable", "fable", "opus", ""]) assert.notEqual(modelHatasi(m, IKINCI_GORUS_ROLU), null, `${m}: ikinci görüş yalnızca tam Claude kimliği`);
  assert.equal(BrifSemasi.shape.rol.safeParse(IKINCI_GORUS_ROLU).success, false, "ikinci görüş rolüyle ajan başlatılamaz (istisna işçiye sızmaz)");
  const kapi = fs.readFileSync(path.join(REPO, "sunucu", "kapi.ts"), "utf8");
  assert.equal(kapi.match(/IKINCI_GORUS_ROLU/g)!.length, 3, "istisna tek yerde: tanım + modelHatasi'nda iki kullanım");
});

// ---------- Ayar ----------

test("ayar: ikinci_gorus_modeli varsayılanı claude-opus-5-5; şef yazamaz; panel Fable seçebilir; yerel ve takma ad reddedilir", async () => {
  assert.equal(VARSAYILAN_AYAR.ikinci_gorus_modeli, "claude-opus-5-5");
  assert.ok(SEF_YAZAMAZ.includes("ikinci_gorus_modeli"));
  assert.equal((await ayarOku()).ikinci_gorus_modeli, "claude-opus-5-5");
  assert.equal((await ayarYaz({ ikinci_gorus_modeli: SEF_FABLE }, "panel")).ikinci_gorus_modeli, SEF_FABLE);
  for (const m of ["ollama:qwen3:8b", "opus"]) await assert.rejects(ayarYaz({ ikinci_gorus_modeli: m }, "panel"), /ikinci_gorus_modeli/, m);
  assert.equal((await ayarOku()).ikinci_gorus_modeli, SEF_FABLE);
});

// ---------- Oturum (sahte SDK) ----------

type Cagri = { prompt: string; options: any };
function sahteSdk(cevap: { metin?: string; usd?: number; bekle?: boolean } = {}) {
  const cagrilar: Cagri[] = [];
  const sorgu = ((p: Cagri) => {
    cagrilar.push(p);
    return (async function* () {
      if (cevap.bekle) await new Promise((_, ret) => p.options.abortController.signal.addEventListener("abort", () => ret(new Error("aborted"))));
      yield { type: "system", subtype: "init", model: p.options.model, session_id: "s1" };
      yield { type: "result", subtype: "success", is_error: false, result: cevap.metin ?? "Katılmıyorum: geri dönüşü zor.", total_cost_usd: cevap.usd ?? 0.2 };
    })();
  }) as any;
  return { sorgu, cagrilar };
}
function duzen(model: string, cevap?: Parameters<typeof sahteSdk>[0], zamanAsimiMs?: number) {
  const olaylar: any[] = [], s = sahteSdk(cevap);
  const hook = async () => ({});
  const sor = ikinciGorusYoneticisi({ repo: REPO, model: () => model, yay: (o) => olaylar.push(o), hook, sorgu: s.sorgu, zamanAsimiMs });
  return { sor, olaylar, hook, ...s, tur: (t: string) => olaylar.filter((o) => o.tur === t) };
}

test("oturum: ayrı query; yalnızca Read/Grep/Glob, cwd ana repo, kısa istem, tek istem, 5 dk zaman aşımı, kapı hook'u; cevap metin döner", async () => {
  const d = duzen("claude-opus-5-5");
  const r = await d.sor({ soru: "Bu isteği reddetmeli miyim?", baglam: "kullanıcı force push istiyor" });
  assert.deepEqual(r, { metin: "Katılmıyorum: geri dönüşü zor.", hata: false });
  assert.equal(d.cagrilar.length, 1);
  const { prompt, options: o } = d.cagrilar[0];
  assert.equal(typeof prompt, "string", "tek istem: akış değil, tek kullanıcı mesajı");
  assert.ok(prompt.includes("Bu isteği reddetmeli miyim?") && prompt.includes("kullanıcı force push istiyor"));
  assert.ok(prompt.length < 1200, "kısa istem");
  assert.deepEqual(IKINCI_GORUS_ARACLARI, ["Read", "Grep", "Glob"]);
  assert.deepEqual(o.tools, ["Read", "Grep", "Glob"]);
  assert.deepEqual(o.allowedTools, ["Read", "Grep", "Glob"]);
  for (const y of ["Edit", "Write", "Bash", "PowerShell", "NotebookEdit", "Agent"]) assert.ok(o.disallowedTools.includes(y), y);
  assert.equal(o.cwd, REPO);
  assert.equal(o.model, "claude-opus-5-5");
  assert.deepEqual(o.mcpServers, {}, "bus yok: danışman ajan başlatamaz, mesaj atamaz");
  assert.equal(o.strictMcpConfig, true);
  assert.deepEqual(o.settingSources, ["project"]);
  assert.equal(o.hooks.PreToolUse[0].hooks[0], d.hook, "araçlar kapıdan geçer");
  assert.ok(o.abortController instanceof AbortController);
  assert.equal(IKINCI_GORUS_MS, 5 * 60_000);
  assert.ok(!Object.keys(o.env).some((k) => /^ZEPUL_/.test(k)), "ortamda panel belirteci yok");
  const g = d.tur("ikinci_gorus");
  assert.equal(g.length, 1);
  assert.equal(g[0].ajan, "sef");
  assert.equal(g[0].model, "claude-opus-5-5");
  assert.match(g[0].soru, /reddetmeli miyim/);
  assert.match(g[0].gorus, /Katılmıyorum/);
});

test("oturum: Fable ikinci görüşte açılabilir; geçersiz model (yerel) oturum açmadan hata döner", async () => {
  const f = duzen(SEF_FABLE);
  assert.equal((await f.sor({ soru: "s", baglam: "b" })).hata, false);
  assert.equal(f.cagrilar[0].options.model, SEF_FABLE);
  const y = duzen("ollama:qwen3:8b");
  const r = await y.sor({ soru: "s", baglam: "b" });
  assert.equal(r.hata, true);
  assert.equal(y.cagrilar.length, 0, "oturum açılmadı");
  assert.equal(y.tur("ikinci_gorus")[0].hata !== undefined, true, "panelde hata görünür");
});

test("oturum: zaman aşımında kesilir, hata döner, olay yayılır", async () => {
  const d = duzen("claude-opus-5-5", { bekle: true }, 30);
  const r = await d.sor({ soru: "s", baglam: "b" });
  assert.equal(r.hata, true);
  assert.match(r.metin, /zaman aşımı/);
  assert.match(d.tur("ikinci_gorus")[0].hata, /zaman aşımı/);
});

// ---------- Maliyet bekçiye ----------

test("maliyet: 'sef/ikinci-gorus' birikimli maliyet olayı; bekçi işler, hız aşılınca şefi durdurur", async () => {
  const d = duzen("claude-opus-5-5", { usd: 2 });
  await d.sor({ soru: "a", baglam: "b" });
  await d.sor({ soru: "c", baglam: "d" });
  const m = d.tur("maliyet");
  assert.deepEqual(m.map((o) => [o.ajan, o.maliyet_usd]), [["sef/ikinci-gorus", 2], ["sef/ikinci-gorus", 4]], "birikimli toplam");
  const yayilan: any[] = [], kesilen: string[] = [];
  const bag = { durumlar: new Map(), commitAraclari: new Set<string>(), ayar: () => VARSAYILAN_AYAR, ajan: (id: string) => (id === "sef" ? { durum: "calisiyor", model: "claude-opus-5-5" } : undefined),
    yay: (o: any) => yayilan.push(o), ajanaMesaj: () => {}, sefe: () => {}, sefeBilgi: () => {}, ntfy: () => {}, interrupt: (id: string) => kesilen.push(id) };
  for (const o of m) bekciOlay(o, bag);
  assert.deepEqual(kesilen, ["sef"], "10 dk'da $4 > $3: bekçi durdurur");
  assert.ok(yayilan.some((o) => o.tur === "durum" && o.durum === "durduruldu" && o.ajan === "sef"));
});

// ---------- Şef talimatı ve orkestra kablolaması ----------

test("şef talimatı: reddetmeden önce, mimari ya da geri dönüşü zor planda ve VETO anlaşmazlığında ikinci_gorus", () => {
  for (const p of ["ikinci_gorus", "reddetmeden önce", "mimari", "geri dönüşü zor", "VETO"]) assert.ok(IKINCI_GORUS_KURALI.includes(p), p);
  const k = fs.readFileSync(path.join(REPO, "sunucu", "orkestra.ts"), "utf8");
  assert.match(k, /tool\("ikinci_gorus"/, "şefin bus aracı");
  assert.match(k, /ikinciGorusKur\(\{ repo: REPO, ayar: \(\) => limit\.ayar,/, "danışma oturumu kapıdan geçer, model ayardan (davranışı aşağıdaki testlerde)");
  assert.match(k, /o\.tur === "maliyet" && a\.id === o\.ajan/, "alt maliyet olayı şefin oturum maliyetini ezmez");
  assert.match(k, /ikinci_gorus_ek/, "panel model listesi");
});

// ---------- Denetim bulgusu 3: kapı kancası bağlantısı davranışla ----------
// orkestra.ts ikinciGorusKur'u çağırır; burada aynı kurucu sahte SDK ile çalışır, SDK seçeneklerindeki kanca gerçekten çağrılır.
function kurDuzen(ayar: { ikinci_gorus_modeli: string }) {
  const olaylar: any[] = [], s = sahteSdk();
  const yay = (o: any) => olaylar.push(o);
  const temel = { jevSor: async () => { throw new Error("yok"); }, layaSor: async () => ({}), golgeYaz: () => {}, hataYaz: () => {} };
  const sor = ikinciGorusKur({ repo: REPO, ayar: () => ayar, sahiplik: new Map(), bagimlilik: kapiBagimliligi(yay, temel as any), yay, onaylar: new Map(),
    bildir: () => {}, onayMs: 50, alanlar: () => [], sorgu: s.sorgu });
  return { sor, olaylar, ...s };
}

test("kapı kancası: ikinciGorusKur SDK seçeneklerinde PreToolUse kurar; kanca çağrılınca kök REPO (içi serbest okuma, dışı kapı onayına gider)", async () => {
  const d = kurDuzen({ ikinci_gorus_modeli: "claude-opus-5-5" });
  await d.sor({ soru: "s", baglam: "b" });
  const hook = d.cagrilar[0].options.hooks?.PreToolUse?.[0]?.hooks?.[0];
  assert.equal(typeof hook, "function", "PreToolUse kancası tanımlı");
  const dis = path.join(DIZIN, "dis.txt");
  fs.writeFileSync(dis, "x");
  const cagir = (file_path: string) => hook({ hook_event_name: "PreToolUse", tool_name: "Read", tool_input: { file_path }, session_id: "s", transcript_path: "", cwd: REPO },
    "t1", { signal: new AbortController().signal });
  assert.deepEqual(await cagir(path.join(REPO, "package.json")), {}, "REPO içinde salt okuma: kapı itiraz etmez");
  const r: any = await cagir(dis);
  assert.equal(r?.hookSpecificOutput?.permissionDecision, "deny", "REPO dışı okuma: onay süresi dolunca ret");
  const istek = d.olaylar.find((o) => o.tur === "onay_istek");
  assert.equal(istek?.ajan, "sef/ikinci-gorus", "kapı olayı danışma oturumu adına");
  const k = fs.readFileSync(path.join(REPO, "sunucu", "orkestra.ts"), "utf8");
  assert.match(k, /const ikinciGorus = ikinciGorusKur\(\{ repo: REPO,/, "orkestra aynı kurucuyu kullanır");
});

// ---------- Denetim bulgusu 4 ----------

test("model ayardan (davranış): ayardaki ikinci_gorus_modeli değişince SDK seçeneklerindeki model de değişir", async () => {
  const ayar = { ikinci_gorus_modeli: "claude-opus-5-5" };
  const d = kurDuzen(ayar);
  await d.sor({ soru: "s", baglam: "b" });
  ayar.ikinci_gorus_modeli = "claude-sonnet-5-5";
  await d.sor({ soru: "s", baglam: "b" });
  ayar.ikinci_gorus_modeli = SEF_FABLE;
  await d.sor({ soru: "s", baglam: "b" });
  assert.deepEqual(d.cagrilar.map((c) => c.options.model), ["claude-opus-5-5", "claude-sonnet-5-5", SEF_FABLE]);
});

test("salt okur (kurucu yolu): disallowedTools Edit, Write ve Bash içerir; araçlar yalnız Read/Grep/Glob", async () => {
  const d = kurDuzen({ ikinci_gorus_modeli: "claude-opus-5-5" });
  await d.sor({ soru: "s", baglam: "b" });
  const o = d.cagrilar[0].options;
  for (const y of ["Edit", "Write", "Bash"]) assert.ok(o.disallowedTools.includes(y), y);
  assert.deepEqual(o.tools, ["Read", "Grep", "Glob"]);
});

// Kullanıcı kararı 27.10.2026: genel sırlar danışmana gidebilir; panel belirteci (?t=) maskelenir.
test("maskeleme: danışma istemine giden soru ve bağlam maskele()'den geçer", async () => {
  const d = kurDuzen({ ikinci_gorus_modeli: "claude-opus-5-5" });
  await d.sor({ soru: "anahtar sk-abcdefghijklmnop1234 ile mi?", baglam: "GH_TOKEN=ghp_ABCDEFGH12345678 ve http://127.0.0.1:8820/?t=PanelBelirtec9" });
  const p = d.cagrilar[0].prompt;
  assert.ok(/sk-abcdefghijklmnop1234/.test(p) && /ghp_ABCDEFGH12345678/.test(p), p);
  assert.ok(!p.includes("PanelBelirtec9"), p);
});

test("şef talimatı (üretilen metin): YETENEK_KURALI ve IKINCI_GORUS_KURALI satırları şefin talimatında; orkestra şefe sefTalimati'ni verir", async () => {
  const { sefTalimati, YETENEK_KURALI, ZEPUL_AI_KURALI, GUVEN_KURALI, KULLANICI_ISTEGI_KURALI } = await import("../sunucu/baglama.ts");
  const t = sefTalimati(4);
  const satirlar = t.split("\n");
  for (const k of [YETENEK_KURALI, IKINCI_GORUS_KURALI, ZEPUL_AI_KURALI, GUVEN_KURALI, KULLANICI_ISTEGI_KURALI]) assert.ok(satirlar.includes(k), k.slice(0, 40));
  assert.match(t, /En fazla 4 aktif işçi/);
  const k = fs.readFileSync(path.join(REPO, "sunucu", "orkestra.ts"), "utf8");
  assert.match(k, /if \(p\.rol === "sef"\) return sefTalimati\(azamiIsci\(\)\);/);
});
