import { test, after, mock } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { sefBaglami, kilometreTasi, gunlukSaglik, izOlaylariOku, bahcivanTuru, skillOnayla, skillSecimi, faz5Zamanlayici, bahcivanAraligi, brifliBaslat, denetimIsle,
  type Faz5Bag, type DenetimBaglam } from "../sunucu/baglama.ts";
import { taslakYolu, etkinYolu, type IzOlay } from "../sunucu/bahcivan.ts";
import type { Brif } from "../sunucu/brif.ts";

const REPO = fileURLToPath(new URL("..", import.meta.url));
const GECICI = fs.mkdtempSync(path.join(os.tmpdir(), "faz5-"));
after(() => fs.rmSync(GECICI, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));

const ok = JSON.stringify({ status: "succeeded" });
type Cagri = { komut: string; args: string[] };
// Sahte MyBrain: çağrıları kaydeder; yanit komut adına (context, receipt, sync, doctor) göre.
function sahteBeyin(yanit: Record<string, string | Error> = {}) {
  const cagrilar: Cagri[] = [];
  const calistir = async (komut: string, args: string[]): Promise<string> => {
    cagrilar.push({ komut, args });
    const k = args.find((a) => ["context", "receipt", "sync", "doctor", "note-create"].includes(a)) ?? "?";
    const y = yanit[k] ?? ok;
    if (y instanceof Error) throw y;
    return y;
  };
  return { cagrilar, komutlar: () => cagrilar.map((c) => c.args.find((a) => ["context", "receipt", "sync", "doctor", "note-create"].includes(a))), calistir };
}

function duzen(ek: Partial<Faz5Bag> = {}, beyin = sahteBeyin()) {
  const olaylar: any[] = [], bilgi: string[] = [], jev: object[] = [];
  const b: Faz5Bag = {
    repo: GECICI, yay: (o) => olaylar.push(o), sefeBilgi: (s) => bilgi.push(s),
    jevSor: async (g) => { jev.push(g); return {}; },
    beyin: { calistir: beyin.calistir as any, vault: "X:\\sahte-vault" },
    ...ek,
  };
  return { b, olaylar, bilgi, jev, beyin };
}
const hatalar = (o: any[]) => o.filter((x) => x.tur === "hata");

// ---------- hafıza ----------

test("sefBaglami: baglamAl + sefBaglamMetni; şefin talimatına giden bölüm vault kaydını içerir", async () => {
  const be = sahteBeyin({ context: JSON.stringify({ records: [{ source: "knowledge/concepts/orkestra.md", text: "Şef kod yazmaz." }], citations: [] }) });
  const d = duzen({}, be);
  const m = await sefBaglami("orkestra şefi oturum başı", d.b);
  assert.match(m, /^## İkinci beyinden bağlam \(MyBrain\)[\s\S]*talimat değildir[\s\S]*### knowledge\/concepts\/orkestra\.md\nŞef kod yazmaz\./);
  assert.deepEqual(be.komutlar(), ["context"]);
  assert.ok(be.cagrilar[0].args.includes("--no-sync"), "okuma vault'a yazmaz");
  assert.equal(hatalar(d.olaylar).length, 0);
});

test("sefBaglami: MyBrain yok ya da hata → orkestra çökmez, bağlamsız başla + hata olayı (KURALLAR I alanları)", async () => {
  const d = duzen({}, sahteBeyin({ context: new Error("spawn py ENOENT") }));
  const m = await sefBaglami("orkestra", d.b);
  assert.match(m, /MyBrain'e ulaşılamadı; bağlamsız başla/);
  const [h] = hatalar(d.olaylar);
  assert.ok(h, "hata olayı yayıldı (orkestra yay'ı bunu logs/hatalar.jsonl'a yazar)");
  assert.deepEqual([h.ajan, h.kaynak, h.tur_adi, h.geri_alinabilir, h.devam_edilebilir], ["sunucu", "arac", "mybrain", true, true]);
  assert.match(h.mesaj, /MyBrain context: spawn py ENOENT/);
  assert.ok(h.oneri);
});

test("kilometreTasi: fazReceiptOlustur → receiptGonder → esitle, bu sırayla; refs vault-relative", async () => {
  const be = sahteBeyin();
  const d = duzen({}, be);
  assert.equal(await kilometreTasi("birlesme-isci1", "isci1 main'e birleşti", ["f00dbabe0123", "abc1234"], d.b), true);
  assert.deepEqual(be.komutlar(), ["receipt", "sync"]);
  assert.equal(hatalar(d.olaylar).length, 0);
});

test("kilometreTasi: receipt reddedilirse esitle çağrılmaz, false + hata olayı; fırlatmaz", async () => {
  const be = sahteBeyin({ receipt: new Error("Command failed: py\nevent id collision") });
  const d = duzen({}, be);
  assert.equal(await kilometreTasi("birlesme-x", "özet", [], d.b), false);
  assert.deepEqual(be.komutlar(), ["receipt"]);
  assert.match(hatalar(d.olaylar)[0].mesaj, /event id collision/);
});

test("gunlukSaglik: temiz → durum olayı; needs_attention → hata olayı + şefe bilgi; doctor çökerse tek hata olayı", async () => {
  let d = duzen({}, sahteBeyin({ doctor: JSON.stringify({ status: "observed_metadata", pending_events: 0 }) }));
  await gunlukSaglik(d.b);
  assert.deepEqual(d.olaylar.map((o) => [o.tur, o.durum, o.temiz]), [["durum", "hafiza", true]]);

  d = duzen({}, sahteBeyin({ doctor: JSON.stringify({ status: "needs_attention", pending_events: 3 }) }));
  await gunlukSaglik(d.b);
  assert.deepEqual(hatalar(d.olaylar).map((h) => h.tur_adi), ["mybrain_saglik"]);
  assert.match(d.bilgi[0], /needs_attention/);

  d = duzen({}, sahteBeyin({ doctor: new Error("zaman aşımı") }));
  await gunlukSaglik(d.b);
  assert.equal(hatalar(d.olaylar).length, 1, "aynı arıza iki kez yazılmaz");
});

// ---------- zamanlayıcı ----------

test("faz5Zamanlayici: sağlık hemen ve 24 saatte bir; bahçıvan 6 saatte bir; durdur sonrası çalışmaz", async () => {
  mock.timers.enable({ apis: ["setInterval"] });
  try {
    const be = sahteBeyin({ doctor: JSON.stringify({ status: "pending" }) });
    let tur = 0;
    const d = duzen({ izOlaylari: async () => { tur++; return []; } }, be);
    const z = faz5Zamanlayici(d.b);
    await new Promise((r) => setImmediate(r));
    assert.equal(be.komutlar().filter((k) => k === "doctor").length, 1, "açılışta bir sağlık");
    assert.equal(tur, 0);
    mock.timers.tick(6 * 3600_000);
    await new Promise((r) => setImmediate(r));
    assert.equal(tur, 1, "6 saatte bir bahçıvan");
    for (let i = 0; i < 3; i++) { mock.timers.tick(6 * 3600_000); await new Promise((r) => setImmediate(r)); }
    assert.equal(tur, 4);
    assert.equal(be.komutlar().filter((k) => k === "doctor").length, 2, "günde bir sağlık");
    z.durdur();
    for (let i = 0; i < 4; i++) { mock.timers.tick(6 * 3600_000); await new Promise((r) => setImmediate(r)); }
    assert.equal(tur, 4);
  } finally { mock.timers.reset(); }
});

// Faz 5 canlı kabul: bahçıvan canlıda tetiklenemiyordu (aralık sabit 6 saat, test ucu yok).
test("bahçıvan aralığı ZEPUL_BAHCIVAN_SN ile; bahce() turu hemen bir kez çalıştırır", async () => {
  assert.equal(bahcivanAraligi({}), 6 * 3600_000, "varsayılan 6 saat");
  assert.equal(bahcivanAraligi({ ZEPUL_BAHCIVAN_SN: "30" }), 30_000);
  for (const v of ["0", "-5", "abc", ""]) assert.equal(bahcivanAraligi({ ZEPUL_BAHCIVAN_SN: v }), 6 * 3600_000, v);
  const eski = process.env.ZEPUL_BAHCIVAN_SN;
  process.env.ZEPUL_BAHCIVAN_SN = "60";
  mock.timers.enable({ apis: ["setInterval"] });
  try {
    let tur = 0;
    const d = duzen({ izOlaylari: async () => { tur++; return []; } }, sahteBeyin({ doctor: JSON.stringify({ status: "pending" }) }));
    const z = faz5Zamanlayici(d.b);
    await z.bahce();
    assert.equal(tur, 1, "test ucu turu hemen çalıştırır");
    mock.timers.tick(60_000);
    await new Promise((r) => setImmediate(r));
    assert.equal(tur, 2, "env aralığı kullanılır");
    z.durdur();
  } finally {
    mock.timers.reset();
    if (eski === undefined) delete process.env.ZEPUL_BAHCIVAN_SN; else process.env.ZEPUL_BAHCIVAN_SN = eski;
  }
});

test("orkestra.ts: POST /api/_test/bahcivan yalnız ZEPUL_TEST=1 iken bahçıvanı çalıştırır", () => {
  const k = fs.readFileSync(path.join(REPO, "sunucu", "orkestra.ts"), "utf8");
  assert.match(k, /uc === "POST \/api\/_test\/bahcivan" && process\.env\.ZEPUL_TEST === "1"\)[\s\S]{0,300}\.bahce\(\)/);
  assert.match(k, /= faz5Zamanlayici\(faz5\)/, "zamanlayıcı tutulur, uç onu çağırır");
});

test("orkestra.ts: bekleyen kuyruk ve yerel yuva sırası `kuyruk` olayıyla yayılır", () => {
  const k = fs.readFileSync(path.join(REPO, "sunucu", "orkestra.ts"), "utf8");
  assert.match(k, /kuyrukDinle\(\(bekleyen, sebep\) => kuyrukYay\(bekleyen, sebep\)\)/, "bekleyen iş değişince olay");
  assert.match(k, /tur: "kuyruk", bekleyen, yerel: yerelSirada\(\), sebep/, "olayda yerel sıradakiler de var");
  assert.match(k, /a\.durum === "kuyrukta"/, "yerel sıra = kuyrukta durumundakiler");
  assert.match(k, /yerelSira\.tik\(\);[\s\S]{0,200}kuyrukYay\(k, "yerel-sira"\)/, "yerel sıra durum geçişinde olay");
});

// ---------- bahçıvan ----------

const gitK = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, encoding: "utf8", windowsHide: true });
function yeniDepo(ad: string): string {
  const d = path.join(GECICI, ad);
  fs.mkdirSync(d, { recursive: true });
  gitK(d, "init", "-q", "-b", "main");
  for (const [k, v] of [["user.name", "faz5-test"], ["user.email", "faz5@test.yerel"], ["commit.gpgsign", "false"], ["core.autocrlf", "false"]]) gitK(d, "config", k, v);
  fs.writeFileSync(path.join(d, "ilk.txt"), "ilk\n");
  gitK(d, "add", "ilk.txt");
  gitK(d, "commit", "-q", "-m", "ilk");
  return d;
}

let saat = Date.parse("2026-09-01T10:00:00Z");
const is = (ajan: string, n: number): IzOlay[] => ([
  ["Read", { file_path: `sunucu/modul${n}.ts` }], ["Edit", { file_path: `sunucu/modul${n}.ts` }],
  ["Bash", { command: "npm test" }], ["Bash", { command: `git commit -m "feat: ${n}"` }],
] as [string, object][]).map(([arac, g]) => ({ ts: (saat += 1000), ajan, tur: "arac", arac, girdi_ozet: JSON.stringify(g) }));
const iz = [...is("isci1", 1), ...is("isci2", 2), ...is("isci3", 3)];
const karar = (choice: string, confidence: number) => ({ answers: { karar: { choice, confidence }, genel: { noul: 0.5 } } });

test("bahcivanTuru: aday → Jev 'skill' (≥0,8) → taslakYaz; etkin skill yok (Jev onay vermez), taslak git'te görünmez, kart + şefe bilgi", async () => {
  const repo = yeniDepo("bahce1");
  const d = duzen({ repo, izOlaylari: async () => iz, jevSor: async (g) => { d.jev.push(g); return karar("skill", 0.93); } });
  const gorulen = new Set<string>();
  await bahcivanTuru(d.b, gorulen);
  assert.equal(d.jev.length, 1, "aday başına bir Jev çağrısı");
  const kart = d.olaylar.find((o) => o.tur === "skill_adayi");
  assert.ok(kart, "skill_adayi olayı");
  assert.deepEqual([kart.ajan, kart.karar, kart.guven, kart.ornek_sayisi, kart.farkli_is], ["sunucu", "skill", 0.93, 3, 3]);
  assert.ok(fs.existsSync(taslakYolu(repo, kart.ad)), "taslak yazıldı");
  assert.equal(fs.existsSync(path.dirname(etkinYolu(repo, kart.ad))), false, "onaysız etkinleşmez");
  assert.equal(gitK(repo, "status", "--porcelain", "--untracked-files=all").trim(), "", "taslak ana ağacı kirletmez (birleştirme kirli-ana demesin)");
  assert.match(d.bilgi[0], new RegExp(`skill_onayla.*${kart.ad}`));

  // Aynı aday ikinci turda yeniden sorulmaz; yeniden başlatmada (boş küme) taslaktaki kimlikten tanınır.
  await bahcivanTuru(d.b, gorulen);
  await bahcivanTuru(d.b, new Set());
  assert.equal(d.jev.length, 1);
});

test("bahcivanTuru: Jev güveni 0,8 altı → 'belirsiz' kart, taslak yok; tek-seferlik → kart yok; Jev hatası → hata olayı, sonraki tur yeniden sorar", async () => {
  const repo = yeniDepo("bahce2");
  let yanit: () => any = () => karar("skill", 0.79);
  const d = duzen({ repo, izOlaylari: async () => iz, jevSor: async (g) => { d.jev.push(g); return yanit(); } });
  await bahcivanTuru(d.b, new Set());
  const kart = d.olaylar.find((o) => o.tur === "skill_adayi");
  assert.equal(kart.karar, "belirsiz");
  assert.equal(kart.ad, undefined);
  assert.equal(fs.existsSync(path.join(repo, ".claude")), false, "belirsizde taslak yazılmaz");

  const d2 = duzen({ repo, izOlaylari: async () => iz, jevSor: async () => karar("tek-seferlik", 0.95) });
  await bahcivanTuru(d2.b, new Set());
  assert.equal(d2.olaylar.length, 0);

  yanit = () => { throw Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }); };
  const g = new Set<string>();
  const d3 = duzen({ repo, izOlaylari: async () => iz, jevSor: async () => yanit() });
  await bahcivanTuru(d3.b, g);
  assert.deepEqual(hatalar(d3.olaylar).map((h) => [h.kaynak, h.tur_adi]), [["ag", "jev_bahcivan"]]);
  assert.equal(g.size, 0, "hata alan aday görülmüş sayılmaz");
});

test("izOlaylariOku: olaylar.jsonl'dan arac/sozlesme olayları, pencere dışı ve bozuk satırlar atılır", async () => {
  const f = path.join(GECICI, "olaylar.jsonl");
  const simdi = Date.parse("2026-10-02T12:00:00Z");
  fs.writeFileSync(f, [
    JSON.stringify({ id: "1", ts: "2026-10-01T10:00:00Z", ajan: "isci1", tur: "arac", arac: "Read", arac_id: "t", girdi_ozet: "{}" }),
    "{bozuk",
    JSON.stringify({ id: "2", ts: "2026-09-01T10:00:00Z", ajan: "isci1", tur: "arac", arac: "Read" }),
    JSON.stringify({ id: "3", ts: "2026-10-01T11:00:00Z", ajan: "isci1", tur: "sozlesme", ozet: "panel düğmesi eklendi" }),
    JSON.stringify({ id: "4", ts: "2026-10-01T11:00:00Z", ajan: "isci1", tur: "metin", metin: "x" }),
  ].join("\n") + "\n");
  const o = await izOlaylariOku(f, simdi);
  assert.deepEqual(o.map((x) => [x.tur, x.arac ?? x.ozet]), [["arac", "Read"], ["sozlesme", "panel düğmesi eklendi"]]);
  assert.equal(o[0].ts, Date.parse("2026-10-01T10:00:00Z"));
  assert.deepEqual(await izOlaylariOku(path.join(GECICI, "yok.jsonl"), simdi), []);
});

test("skillOnayla: taslak etkin skill'e taşınır ve yalnızca o yol commit'lenir; olmayan taslak ve geçersiz ad hata", async () => {
  const repo = yeniDepo("onay1");
  const d = duzen({ repo, izOlaylari: async () => iz, jevSor: async () => karar("skill", 0.9) });
  await bahcivanTuru(d.b, new Set());
  const ad = d.olaylar.find((o) => o.tur === "skill_adayi").ad;
  fs.writeFileSync(path.join(repo, "baska.txt"), "kirli\n"); // kullanıcının başka değişikliği commit'e girmez
  const yol = await skillOnayla(repo, ad, d.b.yay);
  assert.equal(yol, etkinYolu(repo, ad));
  assert.ok(fs.existsSync(yol));
  assert.equal(fs.existsSync(path.dirname(taslakYolu(repo, ad))), false);
  assert.match(gitK(repo, "log", "-1", "--format=%s"), new RegExp(`skill onaylandı: ${ad}`));
  assert.deepEqual(gitK(repo, "show", "--name-only", "--format=", "HEAD").trim().split("\n"), [`.claude/skills/${ad}/SKILL.md`]);
  assert.equal(gitK(repo, "status", "--porcelain").trim(), "?? baska.txt");
  assert.ok(d.olaylar.some((o) => o.tur === "skill_adayi" && o.durum === "onaylandi" && o.ad === ad));
  await assert.rejects(skillOnayla(repo, ad, d.b.yay), /taslak yok/);
  await assert.rejects(skillOnayla(repo, "../kotu", d.b.yay), /geçersiz skill adı/);
});

// ---------- işçiye skill seçimi ----------

function skillDeposu(): string {
  const r = path.join(GECICI, "skill-kok");
  for (const [ad, ac] of [["panel-test", "panel düğmelerini tarayıcıda test eder"], ["ntfy-bildir", "telefona bildirim gönderir"]]) {
    fs.mkdirSync(path.join(r, ".claude", "skills", ad), { recursive: true });
    fs.writeFileSync(path.join(r, ".claude", "skills", ad, "SKILL.md"), `---\nname: ${ad}\ndescription: ${ac}\n---\n\n# ${ad}\n`);
  }
  return r;
}

test("skillSecimi: proje skill'leri Jev'e sorulur, eşik üstü seçilir; skill yoksa Jev çağrılmaz; Jev hatasında boş + hata olayı", async () => {
  const kok = skillDeposu();
  const d = duzen({ repo: kok, jevSor: async (g) => { d.jev.push(g); return { answers: { "panel-test": { noul: 0.92 }, "ntfy-bildir": { noul: 0.2 } } }; } });
  assert.deepEqual(await skillSecimi("panel düğmesini test et", d.b), ["panel-test"]);
  assert.match((d.jev[0] as any).state, /panel düğmesini test et/);

  const bos = duzen({ repo: path.join(GECICI, "skillsiz") });
  assert.deepEqual(await skillSecimi("bir görev", bos.b), []);
  assert.equal(bos.jev.length, 0);

  const h = duzen({ repo: kok, jevSor: async () => { throw new Error("HTTP 503"); } });
  assert.deepEqual(await skillSecimi("görev", h.b), []);
  assert.equal(hatalar(h.olaylar)[0].tur_adi, "jev_skill_secimi");
});

test("brifliBaslat: skillSec verilirse seçilen skill'ler işçinin talimatına eklenir", async () => {
  const brif = { ad: "katip1", rol: "katip", model: "claude-sonnet-5-5", gorev: "Panel düğmesini tarayıcıda test et ve raporla.", owns: [],
    dokunma: [{ yol: "(yok)", sahip: "-" }], baglam: "test bağlamı: işin nedeni ve mevcut durum burada", once_oku: ["KURALLAR.md"], kabul: "rapor yazıldı ve commit'lendi" } as unknown as Brif;
  const istekler: any[] = [], sorulan: string[] = [];
  await brifliBaslat(brif, { repo: GECICI, kurallar: "K", ajanBaslat: (i) => { istekler.push(i); },
    skillSec: async (g) => { sorulan.push(g); return ["panel-test", "ntfy-bildir"]; } });
  assert.deepEqual(sorulan, [brif.gorev]);
  assert.match(istekler[0].talimat, /Bu görev için seçilen skill'ler[^\n]*: panel-test, ntfy-bildir/);

  await brifliBaslat({ ...brif, ad: "katip2" }, { repo: GECICI, kurallar: "K", ajanBaslat: (i) => { istekler.push(i); }, skillSec: async () => [] });
  assert.doesNotMatch(istekler[1].talimat, /seçilen skill/);
});

// ---------- kilometre taşı: birleşme ----------

test("denetimIsle: PASS → birleşme tamam → kilometreTasi(faz, özet, commitler) çağrılır; çakışmada çağrılmaz", async () => {
  const PASS = { verdict: "PASS", gerekce: "kabul tanımına uyuyor; commit geri alınınca test kırmızıya döndü, kanıt yeterli.",
    kanitlar: [{ iddia: "test yeşil", komut: "npm test", cikti_ozet: "1 pass" }, { iddia: "dosya var", komut: "type merhaba.txt", cikti_ozet: "merhaba" }], kirmiziya_dondu: [{ test: "t", geri_alinan: "abc1234", sonuc: "kirmizi" }], blockers: [] };
  const kt: any[][] = [];
  const bag = (durum: string): DenetimBaglam => ({
    denetci: "denetci-isci1", isci: { id: "isci1", repo: GECICI, dal: "is/isci1", worktree: path.join(GECICI, "w"), brif_kabul: "merhaba.txt oluşturulur", denetimde: true },
    degisen: ["merhaba.txt"], commitler: ["abc1234 feat: merhaba"], kopya_koku: path.join(GECICI, "kopya-yok"),
    duzeltmeSayisi: new Map(), cakismaSayisi: new Map(), yay: () => {}, isciye: () => {}, sefe: () => {}, sefeBilgi: () => {}, ntfy: () => {},
    kapat: () => {}, kapatBekle: async () => {}, kilometreTasi: async (...a) => { kt.push(a); return true; },
    git: { birlestir: async () => ({ durum, sha: "f00dbabe0123", ...(durum === "cakisma" ? { cakisan: ["x"] } : {}) }) as any,
      worktreeKapat: async () => ({ durum: "kapandi" }) as any, worktreeListesi: async () => [], kopyaKaldir: async () => ({ durum: "yok" }) as any },
  });
  await denetimIsle(PASS, bag("tamam")).arka;
  assert.equal(kt.length, 1);
  assert.deepEqual(kt[0], ["birlesme-isci1-f00dbab", "isci1 main'e birleşti: merhaba.txt oluşturulur", ["f00dbabe0123", "abc1234"]]);
  await denetimIsle(PASS, bag("cakisma")).arka;
  assert.equal(kt.length, 1);
});

// ---------- orkestra.ts kablolaması (sunucu testte açılmaz; bağlantılar kaynakta doğrulanır) ----------

test("orkestra.ts: faz 5 bağlantıları yerinde; MyBrain'e yazan işlev ajan aracına verilmez (K)", () => {
  const k = fs.readFileSync(path.join(REPO, "sunucu", "orkestra.ts"), "utf8");
  assert.match(k, /sefBaglami\([^)]*\)[\s\S]{0,400}ajanBaslat\(\{ ad: "sef"[^}]*talimat: `\$\{kurallar\(\)\}\\n\\n\$\{baglam\}`/, "şef başlarken MyBrain bağlamı talimata eklenir");
  assert.match(k, /denetimIsle\([\s\S]{0,300}kilometreTasi: \(f, o, c\) => kilometreTasi\(f, o, c, faz5\)/, "birleşme kilometre taşı receipt + esitle");
  assert.match(k, /faz5Zamanlayici\(/, "günlük sağlık ve 6 saatlik bahçıvan");
  assert.match(k, /tool\("skill_onayla"[\s\S]{0,600}skillOnayla\(REPO/, "şefin skill_onayla aracı");
  assert.match(k, /brifliBaslat\(brif, \{[^}]*skillSec:/, "işçi başlarken skill seçimi");
  assert.match(k, /zamanAsimiMs: 30_000/, "bahçıvan Jev zaman aşımı 30 sn");
  assert.doesNotMatch(k, /receiptGonder|notYaz/, "MyBrain'e yazma yalnızca kod yolunda (baglama.ts kilometreTasi)");
});
