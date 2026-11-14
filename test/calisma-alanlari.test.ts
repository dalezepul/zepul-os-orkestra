import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DIZIN = fs.mkdtempSync(path.join(os.tmpdir(), "alan-ayar-"));
process.env.ZEPUL_AYAR_DIZIN = DIZIN;
const ALAN = fs.mkdtempSync(path.join(os.tmpdir(), "alan-klasor-"));
after(() => { fs.rmSync(DIZIN, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); fs.rmSync(ALAN, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); });

const { ayarOku, ayarYaz, alanHatasi, alanEkle, alanCikar, SEF_YAZAMAZ, VARSAYILAN_AYAR } = await import("../sunucu/bekci.ts");
const { kanonik } = await import("../sunucu/yol.ts");

test("calisma_alanlari varsayılanı boş ve şef yazamaz", async () => {
  assert.deepEqual(VARSAYILAN_AYAR.calisma_alanlari, []);
  assert.ok(SEF_YAZAMAZ.includes("calisma_alanlari"));
  assert.deepEqual((await ayarOku()).calisma_alanlari, []);
});

test("alanHatasi: sözleşmedeki yasak kökler reddedilir", () => {
  const windir = process.env.WINDIR || process.env.SystemRoot || "C:\Windows";
  const yasaklar = [
    path.parse(ALAN).root, // sürücü kökü
    windir, path.join(windir, "System32"),
    "C:\Program Files", "C:\Program Files (x86)",
    os.homedir(), // kullanıcı dizininin kendisi
    DIZIN, path.join(DIZIN, "alt"), // zepul-os ayar dizini (panel belirteci)
    path.join(ALAN, ".git"), // .git içi
    path.join(ALAN, "yok-boyle-klasor"), // var olmalı
    "goreli/yol",
  ];
  fs.mkdirSync(path.join(ALAN, ".git"), { recursive: true });
  for (const y of yasaklar) assert.ok(alanHatasi(y), `reddedilmeliydi: ${y}`);
  fs.rmSync(path.join(ALAN, ".git"), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  assert.equal(alanHatasi(ALAN), null);
  // ALAN: kullanıcı dizininin alt klasörü (Temp) olur
});

test("alanEkle / alanCikar: kanonik tekilleştirme, yasak kök eklenemez", async () => {
  const l1 = await alanEkle(ALAN, "panel");
  assert.equal(l1.length, 1);
  assert.equal(kanonik(l1[0]), kanonik(ALAN));
  assert.equal((await alanEkle(ALAN.toUpperCase() + "\\", "panel")).length, 1); // aynı klasör ikinci kez girmez
  await assert.rejects(alanEkle(path.parse(ALAN).root, "panel"), /sürücü kökü/);
  await assert.rejects(ayarYaz({ calisma_alanlari: [os.homedir()] } as never, "panel"), /kullanıcı dizini/);
  assert.deepEqual(await alanCikar(ALAN, "panel"), []);
  assert.deepEqual((await ayarOku()).calisma_alanlari, []);
});

test("kapı: alan dışı okumada önerilen klasör git kökü, yoksa yolun klasörü", async () => {
  const { kapiKarari } = await import("../sunucu/kapi.ts");
  const d = { jevSor: async () => { throw new Error("Jev'e gitmemeli"); }, layaSor: async () => ({}), golgeYaz: () => {}, hataYaz: () => {} };
  const depo = fs.mkdtempSync(path.join(os.tmpdir(), "alan-depo-"));
  fs.mkdirSync(path.join(depo, ".git")); fs.mkdirSync(path.join(depo, "src"));
  fs.writeFileSync(path.join(depo, "src", "a.ts"), "x");
  const duz = fs.mkdtempSync(path.join(os.tmpdir(), "alan-duz-"));
  fs.writeFileSync(path.join(duz, "b.txt"), "x");
  try {
    const sor = (file_path: string, alanlar: string[] = []) => kapiKarari({ rol: "isci", ajan: "i", arac: "Read", girdi: { file_path }, sahiplik: new Map(), alanlar }, d);
    const k1 = await sor(path.join(depo, "src", "a.ts"));
    assert.equal(k1.karar, "insan");
    assert.equal(kanonik(k1.alan!.onerilen), kanonik(depo));
    const k2 = await sor(path.join(duz, "b.txt"));
    assert.equal(kanonik(k2.alan!.onerilen), kanonik(duz));
    assert.equal((await sor(path.join(depo, "src", "a.ts"), [depo])).karar, "izin");
  } finally { fs.rmSync(depo, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); fs.rmSync(duz, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
});

test("kapı hook'u: alan kartı onay_tur:\"alan\" taşır; \"alana ekle\" klasörü ekler ve aracı çalıştırır, \"yalnızca bu sefer\" eklemez", async () => {
  const { kapiHookOlustur, kapiBagimliligi } = await import("../sunucu/baglama.ts");
  const duz = fs.mkdtempSync(path.join(os.tmpdir(), "alan-hook-"));
  fs.writeFileSync(path.join(duz, "b.txt"), "x");
  try {
    for (const alanaEkle of [true, false]) {
      const olaylar: any[] = [], onaylar = new Map(), eklenen: string[] = [];
      const temel = { jevSor: async () => { throw new Error("yok"); }, layaSor: async () => ({}), golgeYaz: () => {}, hataYaz: () => {} };
      const yay = (o: any) => olaylar.push(o);
      const hook = kapiHookOlustur({ ajan: { id: "isci1", rol: "isci" }, kok: process.cwd(), sahiplik: new Map(), bagimlilik: kapiBagimliligi(yay, temel), yay, onaylar,
        bildir: () => {}, onayMs: 2000, alanlar: () => [], alanEkle: async (y: string) => { eklenen.push(y); } });
      const p = hook({ hook_event_name: "PreToolUse", tool_name: "Read", tool_input: { file_path: path.join(duz, "b.txt") }, session_id: "s", transcript_path: "", cwd: process.cwd() } as any, "t1", { signal: new AbortController().signal });
      await new Promise((r) => setTimeout(r, 20));
      const istek = olaylar.find((o) => o.tur === "onay_istek");
      assert.equal(istek.onay_tur, "alan");
      assert.equal(kanonik(istek.onerilen), kanonik(duz));
      assert.ok(istek.yol);
      onaylar.get(istek.onay_id)!.bitir("evet", undefined, undefined, alanaEkle);
      const r: any = await p;
      assert.equal(r.hookSpecificOutput.permissionDecision, "allow");
      assert.deepEqual(eklenen.map((y) => kanonik(y)), alanaEkle ? [kanonik(duz)] : []);
    }
  } finally { fs.rmSync(duz, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
});

// ---------- İşçiler: alan içinde cwd, alanın git deposunda worktree ----------
import { execFileSync } from "node:child_process";
const gitK = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-c", "user.name=alan-test", "-c", "user.email=alan@test.yerel", "-c", "commit.gpgsign=false", "-c", "core.autocrlf=false", ...args],
    { cwd, shell: false, windowsHide: true, encoding: "utf8" }).trim();
// Hedef dalın "main" olmadığı depo: birleştirme deponun o anki dalına yapılmalı.
function alanDeposu(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "alan-git-"));
  gitK(d, "init", "-q", "-b", "gelistirme");
  for (const [k, v] of [["user.name", "alan-test"], ["user.email", "alan@test.yerel"], ["commit.gpgsign", "false"], ["core.autocrlf", "false"]]) gitK(d, "config", k, v);
  fs.writeFileSync(path.join(d, "CLAUDE.md"), "# alan kuralları\n");
  fs.mkdirSync(path.join(d, "panel"));
  fs.writeFileSync(path.join(d, "panel", "ayar.txt"), "ilk\n");
  gitK(d, "add", "."); gitK(d, "commit", "-q", "-m", "ilk");
  return d;
}
const alanBrifi = (cwd: string, ek: Record<string, unknown> = {}) => ({ ad: "alanci", rol: "isci", model: "claude-sonnet-5-5", gorev: "zepul-ai panelinde ayarlar ekranı ve ses seçimi",
  owns: ["panel/**"], dokunma: [{ yol: "(yok)", sahip: "-" }], baglam: "test bağlamı: işin nedeni ve mevcut durum burada", once_oku: ["panel/ayar.txt"], kabul: "panel/ayar.txt güncellenir ve commit'lenir", cwd, ...ek });

test("izinliCwd: alan içi kabul, alan dışı red", async () => {
  const { izinliCwd } = await import("../sunucu/baglama.ts");
  const repo = process.cwd(), a = fs.mkdtempSync(path.join(os.tmpdir(), "alan-cwd-"));
  try {
    fs.mkdirSync(path.join(a, "alt"));
    assert.equal(izinliCwd(a, repo), null);
    assert.ok(izinliCwd(a, repo, undefined, [a]));
    assert.ok(izinliCwd(path.join(a, "alt"), repo, undefined, [a]));
    assert.equal(izinliCwd(path.dirname(a), repo, undefined, [a]), null);
    assert.equal(izinliCwd("C:/", repo, undefined, ["C:/"]), null, "listeye elle yazılmış yasak kök geçmez");
  } finally { fs.rmSync(a, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
});

test("brifliBaslat: alan git deposunda worktree açılır, alanın CLAUDE.md'si Önce oku'ya girer; alan dışı ve git olmayan alan reddedilir", async () => {
  const { brifliBaslat } = await import("../sunucu/baglama.ts");
  const { brifDogrula } = await import("../sunucu/brif.ts");
  const depo = alanDeposu(), duz = fs.mkdtempSync(path.join(os.tmpdir(), "alan-duz-"));
  try {
    const istekler: any[] = [];
    const v = brifDogrula(alanBrifi(path.join(depo, "panel")), new Map());
    assert.ok(v.gecerli);
    await assert.rejects(brifliBaslat(v.brif, { repo: process.cwd(), kurallar: "", ajanBaslat: (i) => { istekler.push(i); }, alanlar: [] }), /çalışma alanı değil/);
    await brifliBaslat(v.brif, { repo: process.cwd(), kurallar: "", ajanBaslat: (i) => { istekler.push(i); }, alanlar: [depo] });
    const i = istekler[0];
    assert.equal(kanonik(i.repo), kanonik(depo));
    assert.equal(kanonik(i.cwd), kanonik(path.join(depo, ".worktrees", "alanci")));
    assert.equal(i.dal, "is/alanci");
    assert.ok(i.talimat.includes(`## Önce oku
- ${path.join(depo, "CLAUDE.md")}
- panel/ayar.txt`), "alanın CLAUDE.md'si Önce oku'nun başında");
    const vd = brifDogrula(alanBrifi(duz, { ad: "duzci" }), new Map());
    assert.ok(vd.gecerli);
    await assert.rejects(brifliBaslat(vd.brif, { repo: process.cwd(), kurallar: "", ajanBaslat: () => assert.fail("başlamamalı"), alanlar: [duz] }), /git deposu değil/);
    gitK(depo, "worktree", "remove", path.join(depo, ".worktrees", "alanci"));
  } finally { fs.rmSync(depo, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); fs.rmSync(duz, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
});

// ---------- API: GET/POST /api/alanlar ----------
test("alanIstegi: ekle/çıkar {alanlar}, bozuk gövde ve yasak kök 400 {hata}", async () => {
  const { alanIstegi } = await import("../sunucu/baglama.ts");
  const islem = async (i: "ekle" | "cikar", y: string) => (i === "ekle" ? alanEkle(y, "panel") : alanCikar(y, "panel"));
  const a = fs.mkdtempSync(path.join(os.tmpdir(), "alan-api-"));
  try {
    const r1 = await alanIstegi({ islem: "ekle", yol: a }, islem);
    assert.equal(r1.kod, 200);
    assert.deepEqual((r1.veri as any).alanlar.map((x: string) => kanonik(x)), [kanonik(a)]);
    for (const kotu of [null, [], { islem: "sil", yol: a }, { islem: "ekle" }, { islem: "ekle", yol: 5 }]) assert.equal((await alanIstegi(kotu, islem)).kod, 400, JSON.stringify(kotu));
    const r2 = await alanIstegi({ islem: "ekle", yol: "C:\\" }, islem);
    assert.equal(r2.kod, 400);
    assert.match((r2.veri as any).hata, /sürücü kökü/);
    assert.deepEqual((await alanIstegi({ islem: "cikar", yol: a }, islem)).veri, { alanlar: [] });
  } finally { fs.rmSync(a, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
});

test("orkestra.ts: /api/alanlar uçları, alanlar SSE olayı ve /api/onay alana_ekle bağlı", () => {
  const k = fs.readFileSync(path.join(process.cwd(), "sunucu", "orkestra.ts"), "utf8");
  assert.match(k, /uc === "GET \/api\/alanlar"/);
  assert.match(k, /uc === "POST \/api\/alanlar"[\s\S]{0,300}alanIstegi\(/);
  assert.match(k, /tur: "alanlar", alanlar/);
  assert.match(k, /alana_ekle: z\.boolean\(\)\.optional\(\)/);
  assert.match(k, /g\.data\.alana_ekle\)/);
});

test("uçtan uca: alan deposunda worktree, kapı alan içini okutur, PASS sonrası 'gelistirme' dalına birleşir", async () => {
  const { brifliBaslat, izinliCwd, kapiHookOlustur, kapiBagimliligi, mergeBase, denetciIstegi, denetimIsle } = await import("../sunucu/baglama.ts");
  const { brifDogrula } = await import("../sunucu/brif.ts");
  const { dalFarki } = await import("../sunucu/worktree.ts");
  const depo = alanDeposu();
  try {
    const alanlar = await alanEkle(depo, "panel");
    const v = brifDogrula(alanBrifi(depo, { ad: "e2ealan" }), new Map());
    assert.ok(v.gecerli);
    let istek: any;
    await brifliBaslat(v.brif, { repo: process.cwd(), kurallar: "", ajanBaslat: (i) => { istek = i; }, alanlar });
    const wt: string = istek.cwd;
    assert.equal(kanonik(istek.repo), kanonik(depo));
    assert.ok(izinliCwd(wt, process.cwd(), undefined, alanlar), "orkestranın ajanBaslat denetimi worktree'yi kabul eder");

    // Sahte işçinin kapısı: alanın ana ağacını okumak Jev'siz izin, alan dışı okuma alan kartı.
    const olaylar: any[] = [];
    const temel = { jevSor: async () => { throw new Error("yok"); }, layaSor: async () => ({}), golgeYaz: () => {}, hataYaz: () => {} };
    const hook = kapiHookOlustur({ ajan: { id: "e2ealan", rol: "isci" }, kok: wt, sahiplik: new Map([["panel/**", "e2ealan"]]), bagimlilik: kapiBagimliligi((o: any) => olaylar.push(o), temel),
      yay: (o: any) => olaylar.push(o), onaylar: new Map(), bildir: () => {}, onayMs: 50, alanlar: () => alanlar });
    const oku = (file_path: string) => hook({ hook_event_name: "PreToolUse", tool_name: "Read", tool_input: { file_path }, session_id: "s", transcript_path: "", cwd: wt } as any, "t", { signal: new AbortController().signal });
    assert.deepEqual(await oku(path.join(depo, "CLAUDE.md")), {}, "alanın ana ağacı okunur");
    const dis = fs.mkdtempSync(path.join(os.tmpdir(), "alan-e2e-dis-"));
    await oku(path.join(dis, "baska.txt"));
    fs.rmSync(dis, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    assert.equal(olaylar.find((o) => o.tur === "onay_istek")?.onay_tur, "alan");

    // Sahte işçi: worktree'de commit. Bu arada deponun dalı ilerler (hedef main değil, "gelistirme").
    fs.writeFileSync(path.join(wt, "panel", "ayar.txt"), "ses seçimi\n");
    gitK(wt, "add", "panel/ayar.txt"); gitK(wt, "commit", "-q", "-m", "feat: ses seçimi");
    fs.writeFileSync(path.join(depo, "baska.txt"), "x\n");
    gitK(depo, "add", "baska.txt"); gitK(depo, "commit", "-q", "-m", "başka iş");
    assert.match(await mergeBase(wt), /^[0-9a-f]{40}$/, "worktree içinden merge-base deponun o anki dalıyla (main yok) çözülür");
    const fark = await dalFarki(depo, "is/e2ealan");
    assert.deepEqual(fark.dosyalar, ["panel/ayar.txt"]);
    const sozlesme = { verdict: "TAMAM", blockers: [], commits: [], ozet: "ses seçimi eklendi" } as any;
    const di = denetciIstegi({ id: "e2ealan", dal: "is/e2ealan", worktree: wt, brif_kabul: istek.brif_kabul }, sozlesme, fark, await mergeBase(depo, "is/e2ealan"));
    assert.ok(izinliCwd(di.cwd, process.cwd(), undefined, alanlar), "denetçi alan deposundaki worktree'de açılabilir");

    const PASS = { verdict: "PASS", gerekce: "panel/ayar.txt kabul tanımına uyuyor; commit geri alınınca test kırmızıya döndü, kanıt yeterli.",
      kanitlar: [{ iddia: "test yeşil", komut: "npm test", cikti_ozet: "1 pass" }, { iddia: "dosya güncel", komut: "type panel\ayar.txt", cikti_ozet: "ses seçimi" }],
      kirmiziya_dondu: [{ test: "ayar var", geri_alinan: "abc1234", sonuc: "kirmizi" }], blockers: [] };
    const sefe: string[] = [], bo: any[] = [];
    const dr = denetimIsle(PASS, { denetci: di.ad, isci: { id: "e2ealan", repo: istek.repo, dal: "is/e2ealan", worktree: wt, brif_kabul: istek.brif_kabul, owns: istek.owns },
      degisen: fark.dosyalar, commitler: fark.commitler.map((c: any) => c.sha), kopya_koku: di.kopya_koku, duzeltmeSayisi: new Map(), cakismaSayisi: new Map(),
      yay: (o) => bo.push(o), isciye: () => assert.fail("işçiye mesaj gitmez"), sefe: (m) => sefe.push(m), sefeBilgi: () => {}, ntfy: () => {}, kapat: () => {}, kapatBekle: async () => {} });
    assert.equal(dr.hata, false, dr.metin);
    await dr.arka;
    assert.equal(bo.find((o) => o.tur === "birlesme")?.durum, "tamam", JSON.stringify(bo));
    assert.equal(gitK(depo, "rev-parse", "--abbrev-ref", "HEAD"), "gelistirme");
    assert.equal(gitK(depo, "log", "-1", "--format=%P").split(" ").length, 2, "gelistirme dalında birleşme commit'i");
    assert.equal(fs.readFileSync(path.join(depo, "panel", "ayar.txt"), "utf8"), "ses seçimi\n");
    assert.equal(fs.existsSync(wt), false, "işçi worktree'si kaldırıldı");
    assert.equal(gitK(depo, "status", "--porcelain"), "", "alan deposu temiz");
  } finally { await alanCikar(depo, "panel").catch(() => {}); fs.rmSync(depo, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
});

test("kapı olayı arac ve arac_id taşır", async () => {
  const { kapiHookOlustur, kapiBagimliligi } = await import("../sunucu/baglama.ts");
  const olaylar: any[] = [];
  const temel = { jevSor: async () => { throw new Error("yok"); }, layaSor: async () => ({}), golgeYaz: () => {}, hataYaz: () => {} };
  const yay = (o: any) => olaylar.push(o);
  const hook = kapiHookOlustur({ ajan: { id: "isci1", rol: "isci" }, kok: process.cwd(), sahiplik: new Map(), bagimlilik: kapiBagimliligi(yay, temel), yay, onaylar: new Map(), bildir: () => {} });
  await hook({ hook_event_name: "PreToolUse", tool_name: "mcp__baska__yok", tool_input: {}, session_id: "s", transcript_path: "", cwd: process.cwd() } as any, "tu-42", { signal: new AbortController().signal });
  const k = olaylar.find((o) => o.tur === "kapi");
  assert.ok(k, "kapı olayı üretilmeli");
  assert.equal(k.arac, "mcp__baska__yok");
  assert.equal(k.arac_id, "tu-42");
});

test("alanEkle: eşzamanlı iki ekleme de korunur (kuyruk içinde oku-yaz)", async () => {
  const a = fs.mkdtempSync(path.join(ALAN, "a-")), b = fs.mkdtempSync(path.join(ALAN, "b-"));
  await Promise.all([alanEkle(a, "panel"), alanEkle(b, "panel")]);
  const liste = (await ayarOku()).calisma_alanlari.map((x) => kanonik(x));
  assert.ok(liste.includes(kanonik(a)) && liste.includes(kanonik(b)));
  await alanCikar(a, "panel"); await alanCikar(b, "panel");
});
