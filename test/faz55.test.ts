import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DIZIN = fs.mkdtempSync(path.join(os.tmpdir(), "faz55-"));
process.env.ZEPUL_AYAR_DIZIN = DIZIN;
after(() => fs.rmSync(DIZIN, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));

const { modelHatasi, yerelMi, yerelAd } = await import("../sunucu/kapi.ts");
const { bekleKadar } = await import("./bekle.ts");
const { VARSAYILAN_AYAR, ayarOku, ayarYaz, ayarYolu, rolModeli } = await import("../sunucu/bekci.ts");

// ---------- 1) Model kimliği (KURALLAR B + ollama:<ad>) ----------

test("modelHatasi: Claude tam kimlik ve ollama:<ad> geçer; Fable yalnız şefte; denetçi de yerel olabilir", () => {
  for (const rol of ["isci", "katip", "sef", "denetci"]) {
    assert.equal(modelHatasi("claude-sonnet-5-5", rol), null, rol);
    assert.equal(modelHatasi("claude-opus-5-5", rol), null, rol);
    assert.equal(modelHatasi("ollama:qwen3-coder:30b", rol), null, rol);
    assert.equal(modelHatasi("ollama:hf.co/kisi/model:q4", rol), null, rol);
  }
  assert.equal(modelHatasi("claude-fable-5-1", "sef"), null, "şefte Fable serbest");
  for (const rol of ["isci", "denetci", "katip", "raporcu"]) assert.match(modelHatasi("claude-fable-5-1", rol)!, /Fable/, rol);
  for (const m of ["ollama:claude-fable-5-1", "ollama:FABLE", "claude-fable-5-1-ollama"]) {
    assert.match(modelHatasi(m, "isci")!, /Fable/, m);
    assert.notEqual(modelHatasi(m, "sef"), null, `${m}: şefte de yalnızca tam Claude Fable kimliği`);
  }
  for (const m of ["sonnet", "opus", "", null, undefined, 5, "ollama:", "ollama: bosluk", "ollama:a;b", "ollama:../x"]) {
    assert.notEqual(modelHatasi(m, "isci"), null, String(m));
  }
  for (const m of ["ollama:claude-fable-5-1", "ollama:fable:latest"]) assert.match(modelHatasi(m, "denetci")!, /Fable/, `${m}: yerel denetçide de Fable yasak`);
  assert.equal(modelHatasi("claude-opus-5-5", "denetci"), null);
  assert.equal(yerelMi("ollama:qwen3:8b"), true);
  assert.equal(yerelMi("claude-opus-5-5"), false);
  assert.equal(yerelAd("ollama:qwen3-coder:30b"), "qwen3-coder:30b");
});

// ---------- 2) Ayar: modeller, yerel_yedek, yerel_model ----------

test("ayar: varsayılan karma düzen (03.10.2026): şef ve denetçi Claude Sonnet, işçiler yerel; yedek kapalı", async () => {
  const Y = "ollama:zepul-gptoss-cpu:latest", S = "claude-sonnet-5-5";
  assert.deepEqual(VARSAYILAN_AYAR.modeller, { sef: S, isci_basit: Y, isci_hassas: Y, denetci: S });
  assert.equal(VARSAYILAN_AYAR.yerel_azami, 1, "yerel model aynı anda tek oturum");
  assert.equal(VARSAYILAN_AYAR.yerel_model, Y, "yedek de aynı CPU modeli (32k qwen3-coder GPU'da OOM)");
  for (const [rol, m] of Object.entries(VARSAYILAN_AYAR.modeller)) assert.equal(modelHatasi(m, rol === "denetci" || rol === "sef" ? rol : "isci"), null, rol);
  assert.equal(rolModeli("isci", "claude-sonnet-5-5", VARSAYILAN_AYAR.modeller), Y);
  assert.equal(rolModeli("isci", "claude-opus-5-5", VARSAYILAN_AYAR.modeller), Y);
  assert.equal(VARSAYILAN_AYAR.yerel_yedek, "kapali");
  assert.match(VARSAYILAN_AYAR.yerel_model, /^ollama:/);
  assert.deepEqual(await ayarOku(), VARSAYILAN_AYAR, "dosya yokken varsayılan");
  assert.throws(() => { (VARSAYILAN_AYAR.modeller as any).sef = "x"; }, "varsayılan modeller değiştirilemez");
});

test("ayar: modeller kısmi yazılır, eksik rol varsayılandan; geçersiz model ve Fable (yerel kimlikte de) reddedilir", async () => {
  const a = await ayarYaz({ modeller: { isci_basit: "ollama:qwen3-coder:30b" } } as any, "panel");
  assert.equal(a.modeller.isci_basit, "ollama:qwen3-coder:30b");
  assert.equal(a.modeller.sef, VARSAYILAN_AYAR.modeller.sef, "yazılmayan rol korunur");
  assert.deepEqual((await ayarOku()).modeller, a.modeller);
  const b = await ayarYaz({ modeller: { sef: "claude-fable-5-1" } } as any, "panel");
  assert.equal(b.modeller.isci_basit, "ollama:qwen3-coder:30b", "önceki yama silinmez");
  assert.equal(b.modeller.sef, "claude-fable-5-1");
  for (const kotu of [
    { modeller: { isci_basit: "claude-fable-5-1" } }, { modeller: { isci_hassas: "ollama:claude-fable-5-1" } },
    { modeller: { denetci: "ollama:claude-fable-5-1" } }, { modeller: { denetci: "claude-fable-5-1" } },
    { modeller: { isci_basit: "sonnet" } }, { modeller: { bilinmeyen_rol: "claude-opus-5-5" } }, { modeller: "claude-opus-5-5" },
    { yerel_yedek: "acik" }, { yerel_model: "claude-opus-5-5" }, { yerel_model: "ollama:claude-fable-5-1" },
  ]) await assert.rejects(ayarYaz(kotu as never, "panel"), Error, JSON.stringify(kotu));
  assert.equal((await ayarYaz({ yerel_yedek: "sor", yerel_model: "ollama:qwen3:8b" } as any, "panel")).yerel_yedek, "sor");
  assert.equal((await ayarYaz({ modeller: { denetci: "ollama:qwen3:8b" } } as any, "panel")).modeller.denetci, "ollama:qwen3:8b", "yerel denetçi panelden seçilebilir");
  fs.writeFileSync(ayarYolu(), JSON.stringify({ ...(await ayarOku()), modeller: { ...VARSAYILAN_AYAR.modeller, isci_basit: "claude-fable-5-1" } }));
  await assert.rejects(ayarOku(), /Fable/, "elle bozulan dosya da reddedilir");
  fs.rmSync(ayarYolu());
});

test("rolModeli: şef ve denetçi ayardan; işçi Sonnet isteği basit, Opus isteği hassas yuvaya; ollama: olduğu gibi", () => {
  const m = { sef: "claude-fable-5-1", isci_basit: "ollama:qwen3-coder:30b", isci_hassas: "claude-sonnet-5-5", denetci: "claude-sonnet-5-5" };
  assert.equal(rolModeli("sef", "claude-opus-5-5", m), "claude-fable-5-1");
  assert.equal(rolModeli("denetci", "claude-opus-5-5", m), "claude-sonnet-5-5");
  assert.equal(rolModeli("isci", "claude-sonnet-5-5", m), "ollama:qwen3-coder:30b");
  assert.equal(rolModeli("katip", "claude-opus-5-5", m), "claude-sonnet-5-5");
  assert.equal(rolModeli("isci", "ollama:qwen3:8b", m), "ollama:qwen3:8b");
  assert.equal(rolModeli("isci", "sonnet", m), "sonnet", "geçersiz istek değişmez, kapı reddeder");
  const v = VARSAYILAN_AYAR.modeller;
  assert.deepEqual(["sef", "isci", "isci", "denetci"].map((r, i) => rolModeli(r, ["claude-opus-5-5", "claude-sonnet-5-5", "claude-opus-5-5", "claude-opus-5-5"][i], v)),
    [v.sef, v.isci_basit, v.isci_hassas, v.denetci], "varsayılanla tüm roller yerel");
});

test("ayar_yaz: şef modeller, yerel yedek ve azami_isci alanlarını yazamaz; panel yazar", async () => {
  const { limitIzleyici } = await import("../sunucu/baglama.ts");
  const iz = limitIzleyici({ oku: async () => null, yay: () => {}, sefe: () => {}, sefeBilgi: () => {}, ntfy: () => {} });
  for (const yama of [{ modeller: { isci_basit: "ollama:qwen3:8b" } }, { yerel_yedek: "otomatik" }, { yerel_model: "ollama:qwen3:8b" }, { azami_isci: 2 }]) {
    await assert.rejects(iz.ayarYaz(yama as any, "sef"), /şef yazamaz/, JSON.stringify(yama));
  }
  assert.equal((await ayarOku()).yerel_yedek, "kapali", "şefin reddedilen yaması dosyaya yazılmadı");
  assert.equal((await iz.ayarYaz({ yerel_yedek: "otomatik" } as any, "panel")).yerel_yedek, "otomatik");
  assert.equal((await iz.ayarYaz({ haftalik_tavan_yuzde: 40 }, "sef")).haftalik_tavan_yuzde, 40, "şef tavanı yazabilir");
  fs.rmSync(ayarYolu());
});

// ---------- 3) Yerel oturum ortamı ----------

test("yerelOrtam: ortam filtresinden SONRA eklenir; OAuth ve API anahtarı yok, yardımcı modeller yerel ada çevrilir", async () => {
  const { yerelOrtam } = await import("../sunucu/ortam.ts");
  const { rolSecenekleri } = await import("../sunucu/baglama.ts");
  const taban = { PATH: "/bin", CLAUDE_CODE_OAUTH_TOKEN: "oauth-sir", ANTHROPIC_API_KEY: "sk-sir", ANTHROPIC_BASE_URL: "https://baska", ZEPUL_TOKEN: "panel", ZEPUL_OLLAMA_URL: "x" };
  const e = yerelOrtam(taban, "qwen3-coder:30b", "http://127.0.0.1:11434");
  assert.equal(e.ANTHROPIC_BASE_URL, "http://127.0.0.1:11434");
  assert.equal(e.ANTHROPIC_AUTH_TOKEN, "ollama", "AUTH_TOKEN her zaman yazılır (yoksa OAuth BASE_URL'ye gidebilir)");
  assert.equal(e.ANTHROPIC_API_KEY, "");
  assert.equal(e.CLAUDE_CODE_OAUTH_TOKEN, undefined, "abonelik belirteci yerel oturuma geçmez");
  for (const k of ["ANTHROPIC_DEFAULT_HAIKU_MODEL", "ANTHROPIC_DEFAULT_SONNET_MODEL", "ANTHROPIC_DEFAULT_OPUS_MODEL", "ANTHROPIC_SMALL_FAST_MODEL"]) assert.equal(e[k], "qwen3-coder:30b", k);
  assert.equal(e.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC, "1");
  assert.equal(e.PATH, "/bin");
  // Y2: CPU'da tek istek dakikalar sürer; CLI 300 sn akış boşta / 600 sn istek sınırında kesip baştan deniyordu. Süreler 30 dk, yeniden deneme 1.
  for (const k of ["API_TIMEOUT_MS", "CLAUDE_STREAM_IDLE_TIMEOUT_MS", "CLAUDE_STREAM_FIRST_BYTE_TIMEOUT_MS"]) assert.equal(e[k], "1800000", k);
  assert.equal(e.CLAUDE_CODE_MAX_RETRIES, "1");

  // rolSecenekleri: yerel modelde işçi ortamı (push kapalı) korunur, üstüne yerel değişkenler; Claude modelinde değişmez.
  process.env.ZEPUL_OLLAMA_URL = "http://127.0.0.1:19999";
  try {
    const y = (rolSecenekleri("isci", taban, "ollama:qwen3-coder:30b") as any).env;
    assert.equal(y.ANTHROPIC_BASE_URL, "http://127.0.0.1:19999", "adres ZEPUL_OLLAMA_URL'den");
    assert.equal(y.ANTHROPIC_AUTH_TOKEN, "ollama", "_TOKEN filtresi yerel belirteci silmedi");
    assert.equal(y.GH_TOKEN, "engelli", "işçi ortamı korunur");
    assert.equal(y.ZEPUL_TOKEN, undefined);
    assert.equal(y.CLAUDE_CODE_OAUTH_TOKEN, undefined);
    const c = (rolSecenekleri("isci", taban, "claude-sonnet-5-5") as any).env;
    assert.equal(c.ANTHROPIC_BASE_URL, "https://baska", "Claude oturumunda ortam bugünkü gibi");
    assert.equal(c.ANTHROPIC_AUTH_TOKEN, undefined);
    assert.equal(c.CLAUDE_CODE_OAUTH_TOKEN, "oauth-sir");
    for (const k of ["API_TIMEOUT_MS", "CLAUDE_STREAM_IDLE_TIMEOUT_MS", "CLAUDE_STREAM_FIRST_BYTE_TIMEOUT_MS", "CLAUDE_CODE_MAX_RETRIES"]) assert.equal(c[k], undefined, `Claude oturumunda ${k} yok`);
    assert.equal((rolSecenekleri("sef", taban, "ollama:qwen3:8b") as any).env.ANTHROPIC_AUTH_TOKEN, "ollama");
  } finally { delete process.env.ZEPUL_OLLAMA_URL; }
});

// ---------- 4) Ollama istemcisi (sahte fetch) ----------

const TAGS = { models: [
  { name: "qwen3-coder:30b", capabilities: ["completion", "tools"] },
  { name: "gemma3:4b", capabilities: ["completion", "vision"] },
  { name: "qwen3-embedding:0.6b", capabilities: ["tools", "thinking", "embedding"] },
  { name: "qwen3:8b", capabilities: ["completion", "tools", "thinking"] },
  { name: "zepul-gptoss-cpu:latest", size: 13_793_437_985, capabilities: ["completion", "tools", "thinking"] },
] };
function sahteOllama(o: { ps?: any[]; show?: Record<string, any>; kapali?: boolean } = {}) {
  const istekler: string[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    istekler.push(`${init?.method ?? "GET"} ${new URL(url).pathname}`);
    if (o.kapali) throw new TypeError("fetch failed");
    const yol = new URL(url).pathname;
    const j = yol === "/api/tags" ? TAGS : yol === "/api/ps" ? { models: o.ps ?? [] }
      : yol === "/api/show" ? (o.show?.[JSON.parse(String(init?.body)).model] ?? { parameters: "temperature 0.7" }) : null;
    return new Response(JSON.stringify(j), { status: j ? 200 : 404 });
  }) as typeof fetch;
  return { f, istekler };
}

test("yerelModeller: yalnızca tools (ve completion) yetenekli modeller ollama:<ad> olarak; Ollama kapalıysa boş liste", async () => {
  const { yerelModeller } = await import("../sunucu/baglama.ts");
  assert.deepEqual(await yerelModeller(sahteOllama().f), ["ollama:qwen3-coder:30b", "ollama:qwen3:8b", "ollama:zepul-gptoss-cpu:latest"]);
  assert.deepEqual(await yerelModeller(sahteOllama({ kapali: true }).f), [], "kapalı Ollama çökertmez");
  assert.deepEqual(await yerelModeller((async () => new Response("bozuk")) as any), []);
});

test("yerelHazirlik: bağlam 32k altıysa ya da okunamıyorsa açık uyarı; yüklü modelin bağlamı esas", async () => {
  const { yerelHazirlik, yerelBaglam, ASGARI_BAGLAM, BAGLAM_UYARI } = await import("../sunucu/baglama.ts");
  assert.equal(ASGARI_BAGLAM, 32768);
  assert.equal(BAGLAM_UYARI, "bağlam yetersiz, OLLAMA_CONTEXT_LENGTH=32768 gerekli");
  const eski = process.env.OLLAMA_CONTEXT_LENGTH;
  delete process.env.OLLAMA_CONTEXT_LENGTH;
  try {
    const dusuk = await yerelHazirlik("ollama:qwen3-coder:30b", sahteOllama({ ps: [{ name: "qwen3-coder:30b", context_length: 4096 }] }).f, async () => null);
    assert.equal(dusuk.uygun, false);
    assert.equal(dusuk.baglam, 4096);
    assert.match(dusuk.neden!, /bağlam yetersiz, OLLAMA_CONTEXT_LENGTH=32768 gerekli/);
    assert.match(dusuk.neden!, /4096/);
    const iyi = await yerelHazirlik("ollama:qwen3-coder:30b", sahteOllama({ ps: [{ name: "qwen3-coder:30b", context_length: 32768 }] }).f, async () => null);
    assert.deepEqual(iyi, { uygun: true, baglam: 32768 });
    const param = await yerelBaglam("qwen3-coder:30b", sahteOllama({ show: { "qwen3-coder:30b": { parameters: "num_ctx                        65536\ntop_k 20" } } }).f);
    assert.equal(param, 65536, "yüklü değilse Modelfile num_ctx");
    const bilinmez = await yerelHazirlik("ollama:qwen3:8b", sahteOllama().f, async () => null);
    assert.equal(bilinmez.uygun, false, "okunamayan bağlam güvenli taraf: uygun değil");
    assert.match(bilinmez.neden!, /bağlam yetersiz.*bilinmiyor/);
    process.env.OLLAMA_CONTEXT_LENGTH = "32768";
    assert.equal((await yerelHazirlik("ollama:qwen3:8b", sahteOllama().f, async () => null)).uygun, true, "yüklü değilse sunucu ortamındaki OLLAMA_CONTEXT_LENGTH");
    assert.equal((await yerelHazirlik("ollama:qwen3:8b", sahteOllama({ ps: [{ name: "qwen3:8b", context_length: 4096 }] }).f, async () => null)).uygun, false, "yüklü modelin gerçek bağlamı ortamdan önce gelir");
    const yok = await yerelHazirlik("ollama:gemma3:4b", sahteOllama().f, async () => null);
    assert.equal(yok.uygun, false);
    assert.match(yok.neden!, /tools/);
    const kapali = await yerelHazirlik("ollama:qwen3:8b", sahteOllama({ kapali: true }).f, async () => null);
    assert.equal(kapali.uygun, false);
    assert.match(kapali.neden!, /Ollama/);
  } finally { if (eski === undefined) delete process.env.OLLAMA_CONTEXT_LENGTH; else process.env.OLLAMA_CONTEXT_LENGTH = eski; }
});

test("yerelHazirlik GPU: başka model yüklüyse (boşaltacak yükleme) ya da boş VRAM azsa uygun değil; nvidia-smi yoksa engellemez", async () => {
  const { yerelHazirlik, ASGARI_BOS_VRAM_MIB } = await import("../sunucu/baglama.ts");
  const eski = process.env.OLLAMA_CONTEXT_LENGTH;
  process.env.OLLAMA_CONTEXT_LENGTH = "32768";
  try {
    const baska = await yerelHazirlik("ollama:qwen3-coder:30b", sahteOllama({ ps: [{ name: "qwen3.5:9b", context_length: 4096 }] }).f, async () => 6000);
    assert.equal(baska.uygun, false);
    assert.match(baska.neden!, /başka model yüklü \(qwen3\.5:9b\).*GPU paylaşımı kullanıcı kararı/);
    const kendisi = await yerelHazirlik("ollama:qwen3-coder:30b", sahteOllama({ ps: [{ name: "qwen3-coder:30b", context_length: 32768 }] }).f, async () => 100);
    assert.equal(kendisi.uygun, true, "model zaten yüklüyse yeni yükleme yok: VRAM engellemez");
    assert.equal(ASGARI_BOS_VRAM_MIB, 1536);
    const az = await yerelHazirlik("ollama:qwen3-coder:30b", sahteOllama().f, async () => 900);
    assert.equal(az.uygun, false);
    assert.match(az.neden!, /boş VRAM 900 MiB/);
    assert.equal((await yerelHazirlik("ollama:qwen3-coder:30b", sahteOllama().f, async () => 2244)).uygun, true);
    assert.equal((await yerelHazirlik("ollama:qwen3-coder:30b", sahteOllama().f, async () => null)).uygun, true, "nvidia-smi okunamazsa engellemez");
  } finally { if (eski === undefined) delete process.env.OLLAMA_CONTEXT_LENGTH; else process.env.OLLAMA_CONTEXT_LENGTH = eski; }
});

test("yerelHazirlik CPU modeli (Modelfile num_gpu 0): GPU'yu paylaşır, zepul-ai yüklüyken ve VRAM doluyken uygun; ölçüt boş RAM", async () => {
  const { yerelHazirlik } = await import("../sunucu/baglama.ts");
  const eski = process.env.OLLAMA_CONTEXT_LENGTH;
  delete process.env.OLLAMA_CONTEXT_LENGTH; // bağlam yalnızca Modelfile num_ctx'ten (/api/show) gelmeli
  const CPU = { "zepul-gptoss-cpu:latest": { parameters: "num_ctx                        32768\nnum_gpu                        0\ntemperature 1" } };
  const zepulAi = [{ name: "qwen3.5:9b", context_length: 8192 }];
  const GB = 1024 ** 3;
  try {
    const o = sahteOllama({ ps: zepulAi, show: CPU });
    assert.deepEqual(await yerelHazirlik("ollama:zepul-gptoss-cpu:latest", o.f, async () => 300, () => 18 * GB), { uygun: true, baglam: 32768 },
      "qwen3.5:9b yüklü, boş VRAM 300 MiB: CPU modeli VRAM istemez, onu boşaltmaz");
    assert.ok(o.istekler.includes("POST /api/show"), "num_gpu ve num_ctx /api/show'dan okunur");
    const az = await yerelHazirlik("ollama:zepul-gptoss-cpu:latest", sahteOllama({ show: CPU }).f, async () => 7000, () => 4 * GB);
    assert.equal(az.uygun, false, "RAM'e sığmazsa sayfalama (ölçüm: qwen3-coder CPU'da boş RAM 0,5 GB)");
    assert.match(az.neden!, /boş RAM 4096 MiB < 14178 MiB/);
    const yuklu = await yerelHazirlik("ollama:zepul-gptoss-cpu:latest", sahteOllama({ ps: [...zepulAi, { name: "zepul-gptoss-cpu:latest", context_length: 32768 }], show: CPU }).f, async () => 0, () => 1 * GB);
    assert.equal(yuklu.uygun, true, "zaten yüklüyse yeni yükleme yok: RAM engellemez");
    const kisa = await yerelHazirlik("ollama:zepul-gptoss-cpu:latest", sahteOllama({ show: { "zepul-gptoss-cpu:latest": { parameters: "num_ctx 8192\nnum_gpu 0" } } }).f, async () => 7000, () => 18 * GB);
    assert.equal(kisa.uygun, false, "Modelfile num_ctx 32k altıysa uygun değil");
    assert.equal(kisa.baglam, 8192);
    const gpu = await yerelHazirlik("ollama:qwen3-coder:30b", sahteOllama({ ps: zepulAi, show: { "qwen3-coder:30b": { parameters: "num_ctx 32768" } } }).f, async () => 6000, () => 18 * GB);
    assert.match(gpu.neden!, /başka model yüklü/, "GPU kullanan model için eski kural sürer");
  } finally { if (eski === undefined) delete process.env.OLLAMA_CONTEXT_LENGTH; else process.env.OLLAMA_CONTEXT_LENGTH = eski; }
});

test("veri/ollama/Modelfile.gptoss-cpu: yeniden kurulabilir türetilmiş model (32k bağlam, tamamen CPU)", () => {
  const m = fs.readFileSync(path.join(import.meta.dirname, "..", "veri", "ollama", "Modelfile.gptoss-cpu"), "utf8");
  assert.match(m, /^FROM gpt-oss:20b\r?$/m);
  assert.match(m, /^PARAMETER num_ctx 32768\r?$/m);
  assert.match(m, /^PARAMETER num_gpu 0\r?$/m);
});

// ---------- 5) Oturum mesajları: init denetimi, sahte maliyet, Claude erişimi ----------

test("initModelHatasi: yerel ajanın init.model'i yerel ad değilse hata (sessizce Claude'a düşmez)", async () => {
  const { initModelHatasi } = await import("../sunucu/baglama.ts");
  assert.equal(initModelHatasi("ollama:qwen3-coder:30b", "qwen3-coder:30b"), null);
  assert.match(initModelHatasi("ollama:qwen3-coder:30b", "claude-sonnet-5-5")!, /yerel yönlendirme başarısız/);
  assert.match(initModelHatasi("ollama:qwen3-coder:30b", undefined)!, /yerel yönlendirme başarısız/);
  assert.equal(initModelHatasi("claude-opus-5-5", "claude-opus-5-5"), null, "Claude ajanı denetlenmez");
});

test("yerelOlay: yerel ajanın CLI'ın yazdığı sahte maliyeti 0 sayılır; bekçi maliyet hızına girmez", async () => {
  const { yerelOlay, bekciOlay } = await import("../sunucu/baglama.ts");
  const o: any = yerelOlay({ ajan: "y", tur: "maliyet", maliyet_usd: 0.04 }, "ollama:qwen3:8b");
  assert.equal(o.maliyet_usd, 0);
  assert.equal((yerelOlay({ ajan: "c", tur: "maliyet", maliyet_usd: 0.04 }, "claude-sonnet-5-5") as any).maliyet_usd, 0.04);
  assert.equal((yerelOlay({ ajan: "y", tur: "metin", metin: "a" }, "ollama:qwen3:8b") as any).metin, "a");
  // Bekçi: yerel ajanın büyük sahte maliyeti durdurma üretmez.
  const yay: any[] = [], durumlar = new Map();
  const bag: any = { durumlar, commitAraclari: new Set(), ayar: () => ({ ...VARSAYILAN_AYAR, maliyet_hizi_usd_10dk: 1 }), ajan: () => ({ durum: "calisiyor" }),
    yay: (x: any) => yay.push(x), ajanaMesaj: () => {}, sefe: () => {}, sefeBilgi: () => {}, ntfy: () => {}, interrupt: () => {}, simdi: () => 1000 };
  bekciOlay(yerelOlay({ ajan: "y", tur: "maliyet", maliyet_usd: 50 }, "ollama:qwen3:8b"), bag);
  assert.equal(yay.length, 0);
  bekciOlay({ ajan: "y", tur: "maliyet", maliyet_usd: 50 }, bag);
  assert.equal(yay.length > 0, true, "aynı maliyet Claude ajanında durdurma üretir (testin ölçtüğü fark)");
});

test("claudeErisimi: rate_limit/overloaded/sunucu hatası erişilemez; hatasız result erişilebilir; diğerleri bilgi yok", async () => {
  const { claudeErisimi } = await import("../sunucu/baglama.ts");
  assert.equal(claudeErisimi({ type: "assistant", error: "rate_limit" } as any), false);
  assert.equal(claudeErisimi({ type: "assistant", error: "overloaded" } as any), false);
  assert.equal(claudeErisimi({ type: "result", is_error: true, api_error_status: 529 } as any), false);
  assert.equal(claudeErisimi({ type: "result", is_error: true, api_error_status: 429 } as any), false);
  assert.equal(claudeErisimi({ type: "result", is_error: false } as any), true);
  assert.equal(claudeErisimi({ type: "assistant", error: "invalid_request" } as any), null);
  assert.equal(claudeErisimi({ type: "system" } as any), null);
});

// ---------- 6) Yerel yedek: kapali | sor | otomatik ----------

const brif = (ek: object = {}) => ({ ad: "yedekci", rol: "isci", model: "claude-sonnet-5-5", gorev: "Panele yerel model rozetini ekle ve testini yaz.",
  owns: ["panel/**"], dokunma: [{ yol: "sunucu/**", sahip: "entegrator" }], baglam: "test bağlamı: işin nedeni ve mevcut durum burada", once_oku: ["docs/panel-api.md"], kabul: "rozet ollama: modelde görünür", ...ek });

function yedekDuzen(o: { mod: "kapali" | "sor" | "otomatik"; limitAcik?: boolean; erisilemez?: boolean; uygun?: boolean }) {
  const baslayan: any[] = [], sorulan: any[] = [], hazirCagri: string[] = [];
  const bag = {
    karar: () => (o.limitAcik ? { yeniIsSerbest: true, neden: "tavan tanımlı değil" } : { yeniIsSerbest: false, neden: "haftalık %45 ≥ tavan %40" }),
    sahiplik: new Map<string, string>(),
    baslat: async (b: any) => { baslayan.push(b); },
    yedek: {
      ayar: () => ({ ...VARSAYILAN_AYAR, yerel_yedek: o.mod, yerel_model: "ollama:qwen3-coder:30b" }),
      hazir: async (m: string) => { hazirCagri.push(m); return o.uygun === false ? { uygun: false, baglam: 4096, neden: "bağlam yetersiz, OLLAMA_CONTEXT_LENGTH=32768 gerekli (qwen3-coder:30b: 4096)" } : { uygun: true, baglam: 32768 }; },
      erisilemez: () => !!o.erisilemez,
      sor: (is: any, m: string, neden: string) => { sorulan.push({ is, m, neden }); },
    },
  };
  return { bag, baslayan, sorulan, hazirCagri };
}

test("yerel yedek karar tablosu: kapali × sor × otomatik, limit dolu/açık, Claude erişilemez, bağlam yetersiz", async () => {
  const { ajanBaslatIsle } = await import("../sunucu/baglama.ts");
  const { kuyrukOku, kuyrukYaz } = await import("../sunucu/bekci.ts");

  // kapali + limit dolu: bugünkü kuyruk davranışı, Ollama'ya hiç sorulmaz.
  await kuyrukYaz([]);
  let d = yedekDuzen({ mod: "kapali" });
  let r = await ajanBaslatIsle(brif(), d.bag);
  assert.match(r.metin, /^limit: haftalık %45 ≥ tavan %40; iş kuyruğa alındı \(is-[0-9a-f]{8}\)$/);
  assert.equal(d.baslayan.length, 0);
  assert.equal(d.hazirCagri.length, 0);
  assert.equal((await kuyrukOku()).length, 1);

  // otomatik + limit dolu + bağlam yeterli: yerel modelle başlar, kuyruğa yazılmaz.
  await kuyrukYaz([]);
  d = yedekDuzen({ mod: "otomatik" });
  r = await ajanBaslatIsle(brif(), d.bag);
  assert.equal(r.hata, false);
  assert.match(r.metin, /yerel yedekle başlatıldı \(ollama:qwen3-coder:30b\)/);
  assert.equal(d.baslayan[0].model, "ollama:qwen3-coder:30b");
  assert.deepEqual(await kuyrukOku(), []);

  // otomatik + kuyruk_id: kuyruktaki iş yerel başlar, kayıt silinir.
  const { kuyrugaEkle } = await import("../sunucu/bekci.ts");
  const q: any[] = []; const is = kuyrugaEkle(q, brif(), "limit"); await kuyrukYaz(q);
  d = yedekDuzen({ mod: "otomatik" });
  r = await ajanBaslatIsle(brif({ kuyruk_id: is.id }), d.bag);
  assert.equal(d.baslayan[0].model, "ollama:qwen3-coder:30b");
  assert.deepEqual(await kuyrukOku(), []);

  // otomatik + bağlam yetersiz: devreye girmez, kuyruk + açık uyarı.
  d = yedekDuzen({ mod: "otomatik", uygun: false });
  r = await ajanBaslatIsle(brif(), d.bag);
  assert.equal(d.baslayan.length, 0);
  assert.match(r.metin, /iş kuyruğa alındı.*yerel yedek devreye girmedi: bağlam yetersiz, OLLAMA_CONTEXT_LENGTH=32768 gerekli/);

  // sor + limit dolu: kuyruk + onay kartı (sor çağrılır), başlatma yok.
  await kuyrukYaz([]);
  d = yedekDuzen({ mod: "sor" });
  r = await ajanBaslatIsle(brif(), d.bag);
  assert.equal(d.baslayan.length, 0);
  assert.equal(d.sorulan.length, 1);
  assert.equal(d.sorulan[0].m, "ollama:qwen3-coder:30b");
  assert.equal(d.sorulan[0].is.id, (await kuyrukOku())[0].id);
  assert.match(r.metin, /panelde onay bekleniyor/);
  // sor + bağlam yetersiz: kart açılmaz.
  d = yedekDuzen({ mod: "sor", uygun: false });
  await ajanBaslatIsle(brif({ ad: "ikinci" }), d.bag);
  assert.equal(d.sorulan.length, 0);

  // limit açık + Claude erişilemez + otomatik: yerel başlar.
  d = yedekDuzen({ mod: "otomatik", limitAcik: true, erisilemez: true });
  r = await ajanBaslatIsle(brif({ ad: "ucuncu" }), d.bag);
  assert.equal(d.baslayan[0].model, "ollama:qwen3-coder:30b");
  assert.match(r.metin, /Claude erişilemiyor/);
  // limit açık + Claude erişilemez + kapali: bugünkü davranış (Claude ile başlatma denenir).
  d = yedekDuzen({ mod: "kapali", limitAcik: true, erisilemez: true });
  r = await ajanBaslatIsle(brif({ ad: "dorduncu" }), d.bag);
  assert.equal(d.baslayan[0].model, "claude-sonnet-5-5");
  // limit açık + erişilebilir: yedeğe hiç bakılmaz.
  d = yedekDuzen({ mod: "otomatik", limitAcik: true });
  await ajanBaslatIsle(brif({ ad: "besinci" }), d.bag);
  assert.equal(d.baslayan[0].model, "claude-sonnet-5-5");
  assert.equal(d.hazirCagri.length, 0);
  await kuyrukYaz([]);
});

test("yerelYedekSor: panelde onay kartı + ntfy soru; evet → yerel başlar ve kuyruktan silinir; hayır → kuyrukta kalır", async () => {
  const { yerelYedekSor, yedektenBaslat } = await import("../sunucu/baglama.ts");
  const { kuyrukOku, kuyrukYaz, kuyrugaEkle } = await import("../sunucu/bekci.ts");
  const q: any[] = []; const is = kuyrugaEkle(q, brif(), "haftalık %45 ≥ tavan %40"); await kuyrukYaz(q);
  const yay: any[] = [], ntfy: string[][] = [], onaylar = new Map<string, any>(), baslayan: any[] = [];
  const baslat = () => yedektenBaslat(is, "ollama:qwen3-coder:30b", { sahiplik: new Map(), baslat: async (b: any) => { baslayan.push(b); } });
  yerelYedekSor(is, "ollama:qwen3-coder:30b", "haftalık %45 ≥ tavan %40", { yay: (o: any) => yay.push(o), ntfy: (b, m) => ntfy.push([b, m]), onaylar, baslat });
  const kart = yay.find((o) => o.tur === "onay_istek");
  assert.ok(kart, "onay kartı yayıldı");
  assert.equal(kart.arac, "yerel_yedek");
  assert.match(kart.girdi_ozet, /yedekci → ollama:qwen3-coder:30b/);
  assert.match(ntfy[0][0], /^Zepul OS: soru: /);
  assert.ok(!/[\\/]/.test(ntfy[0][1]), "ntfy mesajında yol yok");
  assert.equal(onaylar.size, 1);
  onaylar.get(kart.onay_id).bitir("evet");
  // Kuyruk okunurken yapılan rename Windows'ta EPERM veriyordu (atomikYaz artık yeniden dener); başlatma hatası olayı da düşürür.
  await bekleKadar(async () => (await kuyrukOku()).length === 0 || yay.some((o) => o.tur === "hata"), "kuyruk boşalmadı");
  assert.equal(yay.find((o) => o.tur === "hata"), undefined, "yerel başlatma hatasız");
  assert.equal(onaylar.size, 0);
  assert.equal(baslayan[0].model, "ollama:qwen3-coder:30b");
  assert.deepEqual(await kuyrukOku(), [], "başlayan iş kuyruktan silindi");
  assert.equal(yay.find((o) => o.tur === "onay_sonuc").karar, "evet");

  const q2: any[] = []; const is2 = kuyrugaEkle(q2, brif(), "limit"); await kuyrukYaz(q2);
  const b2: any[] = [];
  yerelYedekSor(is2, "ollama:qwen3-coder:30b", "limit", { yay: (o: any) => yay.push(o), ntfy: () => {}, onaylar,
    baslat: () => yedektenBaslat(is2, "ollama:qwen3-coder:30b", { sahiplik: new Map(), baslat: async (b: any) => { b2.push(b); } }) });
  [...onaylar.values()][0].bitir("hayir");
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(b2.length, 0);
  assert.equal((await kuyrukOku()).length, 1, "hayır: iş kuyrukta kalır, şef limit açılınca sorar");
  await kuyrukYaz([]);
});

// ---------- 7) Uçtan uca: gerçek SDK oturumu sahte Ollama'ya (yerel http) yönlenir ----------
// Oturum orkestranın oturumAc'ı gibi açılır: model yerel ad, env rolSecenekleri(isci, …, ollama:<ad>). Sahte sunucu Anthropic
// /v1/messages akışını taklit eder. Kanıt: init.model yerel ad, apiKeySource none, istekler bearer ollama ile sahteye gitti, maliyet 0.

test("uçtan uca: yerel oturumun tüm model istekleri sahte Ollama'ya gider, init.model yerel ad, maliyet 0", { timeout: 120_000 }, async () => {
  const http = await import("node:http");
  const { query } = await import("@anthropic-ai/claude-agent-sdk");
  const { rolSecenekleri, initModelHatasi, yerelOlay } = await import("../sunucu/baglama.ts");
  const { sdkMesajiOlaya } = await import("../sunucu/olay.ts");
  const istekler: { yol: string; model?: string; auth: string }[] = [];
  const sse = (olay: string, veri: object) => `event: ${olay}\ndata: ${JSON.stringify({ type: olay, ...veri })}\n\n`;
  const sunucu = http.createServer((req, res) => {
    let g = ""; req.on("data", (c) => (g += c)).on("end", () => {
      let j: any = {}; try { j = JSON.parse(g || "{}"); } catch { /* boş */ }
      istekler.push({ yol: `${req.method} ${req.url}`, model: j.model, auth: String(req.headers.authorization ?? req.headers["x-api-key"] ?? "-").slice(0, 13) });
      if (!req.url?.startsWith("/v1/messages") || req.url.includes("count_tokens")) { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ input_tokens: 10 })); }
      const ileti = { id: "msg_sahte", type: "message", role: "assistant", model: j.model, content: [] as any[], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } };
      if (!j.stream) {
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify({ ...ileti, content: [{ type: "text", text: "TAMAM" }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 2 } }));
      }
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.end(sse("message_start", { message: ileti }) + sse("content_block_start", { index: 0, content_block: { type: "text", text: "" } })
        + sse("content_block_delta", { index: 0, delta: { type: "text_delta", text: "TAMAM" } }) + sse("content_block_stop", { index: 0 })
        + sse("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 2 } }) + sse("message_stop", {}));
    });
  });
  await new Promise<void>((r) => sunucu.listen(0, "127.0.0.1", () => r()));
  const adres = `http://127.0.0.1:${(sunucu.address() as any).port}`;
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "faz55-uctan-"));
  process.env.ZEPUL_OLLAMA_URL = adres;
  const model = "ollama:sahte-model:1b";
  try {
    const { env } = rolSecenekleri("isci", { ...process.env, CLAUDE_CODE_OAUTH_TOKEN: "abonelik-olmamali" }, model) as any;
    const q = query({ prompt: "Yalnızca TAMAM yaz.", options: { model: "sahte-model:1b", cwd, env, settingSources: [], strictMcpConfig: true, tools: [], maxTurns: 1, persistSession: false } });
    let init: any, maliyet: any;
    for await (const m of q) {
      if (m.type === "system" && m.subtype === "init") init = m;
      for (const o of sdkMesajiOlaya("y", m, new Map())) if (o.tur === "maliyet") maliyet = yerelOlay(o, model);
    }
    assert.equal(init?.model, "sahte-model:1b");
    assert.equal(initModelHatasi(model, init.model), null);
    assert.equal(init.apiKeySource, "none", "abonelik ya da API anahtarı kullanılmadı");
    const mesaj = istekler.filter((x) => x.yol.startsWith("POST /v1/messages") && !x.yol.includes("count_tokens"));
    assert.ok(mesaj.length >= 1, `sahte Ollama /v1/messages isteği aldı: ${JSON.stringify(istekler)}`);
    for (const x of mesaj) {
      assert.equal(x.model, "sahte-model:1b", "yardımcı istekler de yerel ada çevrildi");
      assert.match(x.auth, /^Bearer ollama/i, "OAuth belirteci gitmedi");
    }
    assert.equal(maliyet?.maliyet_usd, 0, "yerel maliyet 0");
  } finally {
    delete process.env.ZEPUL_OLLAMA_URL;
    sunucu.close();
    // SDK döngüsü bitince claude.exe çıkışı sürebilir ve cwd'yi tutar (EBUSY); bırakana dek silme yeniden denenir.
    await bekleKadar(() => { try { fs.rmSync(cwd, { recursive: true, force: true }); return true; } catch { return false; } }, "geçici cwd silinemedi", 30_000, 200);
  }
});

// Y1 uçtan uca: sahte Ollama Bash aracı ister; oturum orkestranınki gibi rolSecenekleri + kapı hook'uyla açılır (Jev sahte, "guvenli").
// TTY yok, soru istemi yok: komut yalnızca kapının açık allow'u ile çalışır. Kanıt: komutun yazdığı dosya var, izin reddi yok.
test("uçtan uca (Y1): yerel işçide kapının izni Bash'i gerçekten çalıştırır (dontAsk, soru istemi yok)", { timeout: 120_000 }, async () => {
  const http = await import("node:http");
  const { query } = await import("@anthropic-ai/claude-agent-sdk");
  const { rolSecenekleri, kapiHookOlustur, kapiBagimliligi } = await import("../sunucu/baglama.ts");
  const sse = (olay: string, veri: object) => `event: ${olay}
data: ${JSON.stringify({ type: olay, ...veri })}

`;
  const istekler: string[] = [];
  const sunucu = http.createServer((req, res) => {
    let g = ""; req.on("data", (c) => (g += c)).on("end", () => {
      let j: any = {}; try { j = JSON.parse(g || "{}"); } catch { /* boş */ }
      if (!req.url?.startsWith("/v1/messages") || req.url.includes("count_tokens")) { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ input_tokens: 10 })); }
      istekler.push(`${(j.tools ?? []).map((t: any) => t.name).join(",")} | ${JSON.stringify(j.messages ?? []).slice(-300)}`);
      // Gerçek model gibi: kabuk geçici hata verdiyse (yükte Git Bash süreç açamayabilir) komutu en çok 3 kez dener.
      const sonuclar = (j.messages ?? []).flatMap((m: any) => Array.isArray(m.content) ? m.content.filter((c: any) => c.type === "tool_result") : []);
      const sonuclandi = sonuclar.some((c: any) => !c.is_error) || sonuclar.length >= 3;
      const arac = Array.isArray(j.tools) && j.tools.some((t: any) => t.name === "Bash") && !sonuclandi;
      const ileti = { id: "msg_sahte", type: "message", role: "assistant", model: j.model, content: [] as any[], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } };
      const blok = arac
        ? sse("content_block_start", { index: 0, content_block: { type: "tool_use", id: `toolu_sahte${sonuclar.length + 1}`, name: "Bash", input: {} } })
          + sse("content_block_delta", { index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify({ command: "node -e \"require('fs').writeFileSync('kanit.txt','calisti')\"", description: "kanıt yaz" }) } })
        : sse("content_block_start", { index: 0, content_block: { type: "text", text: "" } }) + sse("content_block_delta", { index: 0, delta: { type: "text_delta", text: "TAMAM" } });
      if (!j.stream) { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ ...ileti, content: [{ type: "text", text: "TAMAM" }], stop_reason: "end_turn" })); }
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.end(sse("message_start", { message: ileti }) + blok + sse("content_block_stop", { index: 0 })
        + sse("message_delta", { delta: { stop_reason: arac ? "tool_use" : "end_turn", stop_sequence: null }, usage: { output_tokens: 2 } }) + sse("message_stop", {}));
    });
  });
  await new Promise<void>((r) => sunucu.listen(0, "127.0.0.1", () => r()));
  process.env.ZEPUL_OLLAMA_URL = `http://127.0.0.1:${(sunucu.address() as any).port}`;
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "faz55-y1-"));
  const model = "ollama:sahte-model:1b", olaylar: any[] = [];
  const yay = (o: any) => olaylar.push(o);
  const bag = kapiBagimliligi(yay, { jevSor: async () => ({ answers: { risk: { choice: "guvenli", confidence: 0.95, probabilities: { guvenli: 0.95 } }, dis_etki: { noul: 0.1 } } }),
    layaSor: async () => { throw new Error("gölge yok"); }, golgeYaz: () => {}, hataYaz: () => {} });
  try {
    const sec = rolSecenekleri("isci", process.env, model) as any;
    const hook = kapiHookOlustur({ ajan: { id: "y1", rol: "isci", model }, kok: cwd, sahiplik: new Map(), bagimlilik: bag, yay, onaylar: new Map(), bildir: () => {} });
    const q = query({ prompt: "kanit.txt yaz", options: { ...sec, model: "sahte-model:1b", cwd, settingSources: [], strictMcpConfig: true, tools: ["Bash"], maxTurns: 5, persistSession: false,
      hooks: { PreToolUse: [{ hooks: [hook], timeout: 60 }] } } });
    let sonuc: any;
    for await (const m of q) if (m.type === "result") sonuc = m;
    assert.deepEqual(sonuc?.permission_denials ?? [], [], "izin reddi olmamalı");
    assert.ok(fs.existsSync(path.join(cwd, "kanit.txt")), `Bash komutu çalışmadı: ${JSON.stringify({ sonuc: sonuc?.subtype, istekler })}`);
    assert.equal(fs.readFileSync(path.join(cwd, "kanit.txt"), "utf8"), "calisti", "Bash komutu çalıştı");
    assert.ok(olaylar.some((o) => o.tur === "kapi" && o.karar === "izin"), "karar kapıdan geçti");
  } finally {
    delete process.env.ZEPUL_OLLAMA_URL;
    sunucu.close();
    // SDK döngüsü bitince claude.exe çıkışı sürebilir ve cwd'yi tutar (EBUSY); bırakana dek silme yeniden denenir.
    await bekleKadar(() => { try { fs.rmSync(cwd, { recursive: true, force: true }); return true; } catch { return false; } }, "geçici cwd silinemedi", 30_000, 200);
  }
});

test("yerel denetçi: Claude erişilemezken beklemez; denetçi işçiden ayrı ajan ve oturumdur (kimse kendi işini onaylamaz)", async () => {
  const { denetimClaudeBekler, denetciIstegi } = await import("../sunucu/baglama.ts");
  assert.equal(denetimClaudeBekler("ollama:zepul-gptoss-cpu:latest", true), false, "yerel denetçi Claude erişimine bağlı değil");
  assert.equal(denetimClaudeBekler("claude-opus-5-5", true), true, "Claude denetçi erişim dönene dek bekler");
  assert.equal(denetimClaudeBekler("claude-opus-5-5", false), false);
  const i = denetciIstegi({ id: "isci1", dal: "is/isci1", worktree: DIZIN }, { verdict: "TAMAM", blockers: [], commits: [], ozet: "x" } as any, { dosyalar: [], commitler: [] }, "abc");
  assert.equal(i.rol, "denetci");
  assert.notEqual(i.ad, "isci1", "denetçi işçinin kendisi değil");
  assert.equal(rolModeli(i.rol, i.model, VARSAYILAN_AYAR.modeller), "claude-sonnet-5-5", "karma düzende varsayılan denetçi Claude");
});

// ---------- 6) Yerel ajan eşikleri (yerel_esik_carpani) ----------

test("yerel_esik_carpani: varsayılan 3, 1-10 tam sayı; şef yazamaz", async () => {
  assert.equal(VARSAYILAN_AYAR.yerel_esik_carpani, 3);
  for (const kotu of [0, 11, 2.5, "3", null]) await assert.rejects(ayarYaz({ yerel_esik_carpani: kotu } as never, "panel"), Error, JSON.stringify(kotu));
  assert.equal((await ayarYaz({ yerel_esik_carpani: 1 } as any, "panel")).yerel_esik_carpani, 1);
  const { limitIzleyici } = await import("../sunucu/baglama.ts");
  const iz = limitIzleyici({ oku: async () => null, yay: () => {}, sefe: () => {}, sefeBilgi: () => {}, ntfy: () => {} });
  await assert.rejects(iz.ayarYaz({ yerel_esik_carpani: 10 } as any, "sef"), /şef yazamaz/);
  fs.rmSync(ayarYolu());
});

test("yerelAyar: ilerlemesiz süre ve tekrar durdurma eşiği çarpanla genişler; uyarı ve diğerleri aynı", async () => {
  const { yerelAyar } = await import("../sunucu/bekci.ts");
  const y = yerelAyar(VARSAYILAN_AYAR);
  assert.equal(y.ilerlemesiz_dk, 90);
  assert.equal(y.tekrar_durdur, 15);
  assert.equal(y.tekrar_uyari, VARSAYILAN_AYAR.tekrar_uyari, "uyarı erken kalır (ucuz dürtme)");
  assert.equal(y.maliyet_hizi_usd_10dk, VARSAYILAN_AYAR.maliyet_hizi_usd_10dk, "yerel maliyet zaten 0 (yerelOlay)");
  assert.deepEqual(yerelAyar({ ...VARSAYILAN_AYAR, yerel_esik_carpani: 1 }), { ...VARSAYILAN_AYAR, yerel_esik_carpani: 1 });
});

test("bekciOlay: yerel ajan aynı çağrıyı 5 kez yapınca durmaz (eşik 15); Claude ajanı durur", async () => {
  const { bekciOlay } = await import("../sunucu/baglama.ts");
  const kos = (model: string) => {
    const yay: any[] = [];
    const bag: any = { durumlar: new Map(), commitAraclari: new Set(), ayar: () => VARSAYILAN_AYAR, ajan: () => ({ durum: "calisiyor", model }),
      yay: (x: any) => yay.push(x), ajanaMesaj: () => {}, sefe: () => {}, sefeBilgi: () => {}, ntfy: () => {}, interrupt: () => {}, simdi: () => 1000 };
    for (let i = 0; i < 5; i++) bekciOlay({ ajan: "a", tur: "arac", arac_id: `x${i}`, arac: "Bash", girdi_ozet: '{"command":"npm test"}' } as any, bag);
    return yay.some((o) => o.tur === "durum" && o.durum === "durduruldu");
  };
  assert.equal(kos("ollama:zepul-gptoss-cpu:latest"), false);
  assert.equal(kos("claude-sonnet-5-5"), true);
});

test("olumAdaylari: yerel ajanın sessizlik eşiği çarpanla (ilk tur model yükleme + istem işleme); Claude ajanı 600 sn", async () => {
  const { olumAdaylari, ACIK_ARAC_ESIK_MS } = await import("../sunucu/yasam.ts");
  const simdi = 10_000_000, esik = 600_000;
  const l = [
    { id: "claude", durum: "calisiyor", son_olay_ts: simdi - 700_000 },
    { id: "yerel-ilk-tur", durum: "calisiyor", son_olay_ts: simdi - 700_000, carpan: 3 },
    { id: "yerel-olu", durum: "calisiyor", son_olay_ts: simdi - 1_800_000, carpan: 3 },
    { id: "yerel-acik-arac", durum: "calisiyor", son_olay_ts: simdi - 1_800_000, acikArac: 1, carpan: 3 },
  ];
  assert.deepEqual(olumAdaylari(l, simdi, esik), ["claude", "yerel-olu"]);
  assert.deepEqual(olumAdaylari([{ ...l[3], son_olay_ts: simdi - ACIK_ARAC_ESIK_MS * 3 }], simdi, esik), ["yerel-acik-arac"]);
});

// ---------- 7) Yerel yuva (yerel_azami) ----------

test("yerel_azami: varsayılan 1, 1-4 tam sayı; yalnızca panel yazar", async () => {
  assert.equal(VARSAYILAN_AYAR.yerel_azami, 1);
  for (const kotu of [0, 5, 1.5, "1", null]) await assert.rejects(ayarYaz({ yerel_azami: kotu } as never, "panel"), Error, JSON.stringify(kotu));
  assert.equal((await ayarYaz({ yerel_azami: 2 } as any, "panel")).yerel_azami, 2);
  const { limitIzleyici } = await import("../sunucu/baglama.ts");
  const iz = limitIzleyici({ oku: async () => null, yay: () => {}, sefe: () => {}, sefeBilgi: () => {}, ntfy: () => {} });
  await assert.rejects(iz.ayarYaz({ yerel_azami: 4 } as any, "sef"), /şef yazamaz/);
  fs.rmSync(ayarYolu());
});

test("yerelYuvaTutar: şef ve Claude ajanı sayılmaz; denetçi sayılır; turu biten denetimdeki işçi, bitti, sıradaki ve oturumsuz ölü boşaltır", async () => {
  const { yerelYuvaTutar } = await import("../sunucu/baglama.ts");
  const Y = "ollama:zepul-gptoss-cpu:latest", t = (x: object) => yerelYuvaTutar({ id: "a", rol: "isci", model: Y, durum: "calisiyor", oturum: true, ...x });
  assert.equal(t({}), true);
  assert.equal(t({ rol: "denetci" }), true, "denetçi kuralın dışında değil");
  assert.equal(t({ rol: "sef" }), false, "şef yuvaya sayılmaz (DUMAN.md: aynı model tek kopya)");
  assert.equal(t({ model: "claude-sonnet-5-5" }), false);
  assert.equal(t({ durum: "bekliyor" }), true, "tur arası boşta ama oturumu açık");
  assert.equal(t({ denetimde: true }), true, "TAMAM döndü ama turu sürüyor: denetçi beklemeli");
  assert.equal(t({ denetimde: true, durum: "bekliyor" }), false, "turu bitti, denetçisini bekliyor");
  for (const durum of ["bitti", "kuyrukta"]) assert.equal(t({ durum }), false, durum);
  assert.equal(t({ durum: "olu" }), true, "diriltilecek ölü yuvasını korur");
  assert.equal(t({ durum: "olu", oturum: false }), false, "vazgeçilen ölü boşaltır");
});

test("yerelKuyruk: azami 1'de ikinci yerel ajan sırada bekler; yuva boşalınca sırayla bırakılır; düşen atlanır", async () => {
  const { yerelKuyruk } = await import("../sunucu/baglama.ts");
  const Y = "ollama:zepul-gptoss-cpu:latest";
  const ajanlar = new Map<string, any>();
  const ekle = (id: string, rol = "isci") => ajanlar.set(id, { id, rol, model: Y, durum: "bekliyor", oturum: true });
  const k = yerelKuyruk({ ajanlar: () => [...ajanlar.values()], azami: () => 1, durum: (id, d) => { ajanlar.get(id).durum = d; } });
  const baslayan: string[] = [];
  const bekle = (id: string) => k.bekle(id).then(() => { baslayan.push(id); ajanlar.get(id).durum = "calisiyor"; });
  ekle("sef", "sef"); await k.bekle("sef"); // şef yuvaya bakmaz
  ekle("a"); await bekle("a");
  ekle("b"); const pb = bekle("b"); ekle("c"); const pc = bekle("c"); ekle("d"); void bekle("d");
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(baslayan, ["a"]);
  assert.equal(ajanlar.get("b").durum, "kuyrukta");
  ajanlar.get("a").durum = "bitti"; k.tik(); await pb;
  assert.deepEqual(baslayan, ["a", "b"]);
  ajanlar.delete("c"); // sıradayken vazgeçildi
  ajanlar.get("b").durum = "bitti"; k.tik(); await new Promise((r) => setImmediate(r));
  assert.deepEqual(baslayan, ["a", "b", "d"], "c düştü, d başladı");
  void pc;
});

// av2-3: sıradaki ajana gelen mesaj kutuya itilirse oturum hazırlıksız ve yuva dışı çalışıyor, ilk görev hiç gitmiyordu.
test("kuyruktaki yerel ajana mesaj kutuya itilmez; sırası gelince ilk görevle birlikte gider, sırası çözülür (av2-3)", async () => {
  const { yerelKuyruk, iletIsle } = await import("../sunucu/baglama.ts");
  const Y = "ollama:zepul-gptoss-cpu:latest";
  const ajanlar = new Map<string, any>();
  const kutu: string[] = [];
  ajanlar.set("a", { id: "a", rol: "isci", model: Y, durum: "calisiyor", oturum: true });
  const b = { id: "b", rol: "isci", model: Y, durum: "bekliyor", oturum: true, onEk: undefined as string | undefined,
    kutu: { kapali: false, push: (m: string) => void kutu.push(m) } };
  ajanlar.set("b", b);
  const yay = (o: any) => { if (o.tur === "durum") ajanlar.get(o.ajan).durum = o.durum; };
  const k = yerelKuyruk({ ajanlar: () => [...ajanlar.values()], azami: () => 1, durum: (id, d) => { ajanlar.get(id).durum = d; } });
  let basladi = false;
  const pb = k.bekle("b").then(() => { basladi = true; });
  assert.equal(b.durum, "kuyrukta");
  assert.equal(iletIsle(b, "[sef → b] durumun ne?", yay), true, "mesaj kaybolmaz");
  assert.deepEqual(kutu, [], "sıradayken kutuya itilmez: hazırlık ve yuva atlanmaz");
  assert.equal(b.durum, "kuyrukta");
  ajanlar.get("a").durum = "bitti"; k.tik(); await pb;
  assert.ok(basladi, "sıra sözü çözüldü");
  assert.equal(iletIsle(b, "ILK GOREV", yay), true);
  assert.equal(kutu.length, 1);
  assert.match(kutu[0], /durumun ne\?[\s\S]*ILK GOREV/, "mesaj ilk görevle birlikte gider");
  assert.equal(b.durum, "calisiyor");
  const kaynak = fs.readFileSync(path.join(import.meta.dirname, "..", "sunucu", "orkestra.ts"), "utf8");
  assert.match(kaynak, /iletIsle\(a, metin, yay\)/, "orkestra ilet() ortak işlevi kullanır");
});
