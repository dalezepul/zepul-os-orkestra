import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { kapiHookOlustur, kapiBagimliligi, sozlesmeIsle, maliyetSayaci, izinliCwd, rolSecenekleri, panelBasliklari, ownsCakismasi, sahiplikDurumu,
  limitIzleyici, ajanBaslatIsle, bekciOlay, brifliBaslat, denetciIstegi, denetimIsle, dalDegisiklikleri, mergeBase, acikWorktreeler, denetimKopyalariniTemizle, denetimKoku, oturumuBitir, kopyaTemizle, kapanisSonucuMu, hamHata, sefeYazIsle,
  ownsDisiYollar, type BekciBag, type DenetimBaglam, type Onaylar } from "../sunucu/baglama.ts";
import { dalFarki, worktreeAc } from "../sunucu/worktree.ts";
import { brifDogrula, type Brif } from "../sunucu/brif.ts";
import { desenNormalize } from "../sunucu/yol.ts";
import { sdkMesajiOlaya } from "../sunucu/olay.ts";
import crypto from "node:crypto";
import { bazAl } from "../sunucu/yasam.ts";
import type { KapiBagimlilik } from "../sunucu/kapi.ts";
import { VARSAYILAN_AYAR, ayarOku, kuyrukOku, kuyrukYaz, type Ayar, type BekleyenIs, type LimitDurumu } from "../sunucu/bekci.ts";

const KOK = process.cwd();
process.env.ZEPUL_AYAR_DIZIN = fs.mkdtempSync(path.join(os.tmpdir(), "entegrasyon-ayar-"));
after(() => fs.rmSync(process.env.ZEPUL_AYAR_DIZIN!, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));
const cevap = (secim: string, guven: number) => ({ answers: { risk: { choice: secim, confidence: guven, probabilities: { [secim]: guven } }, dis_etki: { noul: 0.1 } } });

// Sahte düzen: yay'a düşen olaylar, onay tablosu, ntfy çağrıları ve Jev çağrı sayısı toplanır.
function duzen(jev: () => any = () => cevap("guvenli", 0.95), ajan: { id: string; rol: string; model?: string } = { id: "isci1", rol: "isci" }, sahiplik = new Map<string, string>(), laya: () => any = () => cevap("belirsiz", 0.6)) {
  const olaylar: any[] = [], bildirim: string[] = [], golge: any[] = [];
  const onaylar: Onaylar = new Map();
  let jevSayisi = 0;
  const temel: KapiBagimlilik = {
    jevSor: async () => { jevSayisi++; return jev(); },
    layaSor: async () => laya(),
    golgeYaz: (k) => golge.push(k),
    hataYaz: () => { throw new Error("kapiBagimliligi hataYaz'ı olaya çevirmeliydi"); },
  };
  const yay = (o: any) => olaylar.push(o);
  const hook = kapiHookOlustur({ ajan, kok: KOK, sahiplik, bagimlilik: kapiBagimliligi(yay, temel), yay, onaylar, bildir: (a) => bildirim.push(a), onayMs: 1000 });
  const cagir = (arac: string, girdi: object) => hook({ hook_event_name: "PreToolUse", tool_name: arac, tool_input: girdi, session_id: "s", transcript_path: "", cwd: KOK } as any, "t1", { signal: new AbortController().signal });
  return { cagir, olaylar, onaylar, bildirim, golge, jevSayisi: () => jevSayisi };
}

test("kapı: gec → {} (allow değil, auto moda bırakılır) ve jev alanlı kapi olayı", async () => {
  const d = duzen();
  assert.deepEqual(await d.cagir("Bash", { command: "git status" }), {});
  const k = d.olaylar.find((o) => o.tur === "kapi");
  assert.equal(k.karar, "izin");
  assert.equal(k.alt_karar, "gec", "F12: rapor gec'i ayrı sayar");
  assert.equal(k.jev_secim, "guvenli");
  assert.equal(k.jev_guven, 0.95);
  assert.equal(k.esige_yakin, undefined, "eşikten uzak kararda alan yok (K13)");
  assert.equal(d.jevSayisi(), 1);
  const y = duzen(() => cevap("guvenli", 0.82));
  await y.cagir("Bash", { command: "ping x" });
  assert.equal(y.olaylar.find((o) => o.tur === "kapi").esige_yakin, true, "eşiğe yakın karar kapı olayında işaretli (K13)");
});

// Y1: yerel modelli ajanda auto sınıflandırıcı yok (o da yerel modele gidip zaman aşımına düşüyordu); izin tamamen kapıda.
// Kapının izni açık allow olmalı ki araç gerçekten çalışsın (dontAsk modu açık allow olmayanı reddeder). Ret ve insan yolu aynen kalır.
const YEREL_ISCI = { id: "isci1", rol: "isci", model: "ollama:zepul-gptoss-cpu:latest" };
test("kapı (yerel işçi): zararsız Bash ve salt okuma açık allow; Claude işçide {} kalır", async () => {
  const d = duzen(undefined, YEREL_ISCI);
  const r: any = await d.cagir("Bash", { command: "npm test" });
  assert.equal(r.hookSpecificOutput?.permissionDecision, "allow", "yerel işçide zararsız Bash çalışmalı");
  assert.equal((await d.cagir("Read", { file_path: "sunucu/olay.ts" }) as any).hookSpecificOutput?.permissionDecision, "allow");
  assert.equal(d.olaylar.find((o) => o.tur === "kapi").alt_karar, "gec");
  assert.deepEqual(await duzen(undefined, { ...YEREL_ISCI, model: "claude-sonnet-5-5" }).cagir("Bash", { command: "npm test" }), {}, "Claude işçide auto sınıflandırıcı karar verir");
});

test("kapı (yerel işçi): kesin yasak ve OWNS dışı Edit yine deny; Jev geri-alinamaz derse insana gider", async () => {
  const d = duzen(undefined, YEREL_ISCI, new Map([["panel/**", "isci1"]]));
  const y: any = await d.cagir("Bash", { command: "git push --force origin main" });
  assert.equal(y.hookSpecificOutput.permissionDecision, "deny");
  assert.match(y.hookSpecificOutput.permissionDecisionReason, /^mutlak yasak/);
  const o: any = await d.cagir("Edit", { file_path: path.join(KOK, "sunucu/olay.ts"), old_string: "a", new_string: "b" });
  assert.equal(o.hookSpecificOutput.permissionDecision, "deny");
  assert.match(o.hookSpecificOutput.permissionDecisionReason, /OWNS dışı/);
  const g = duzen(() => cevap("geri-alinamaz", 0.9), YEREL_ISCI);
  let bitti = false;
  const p = g.cagir("Bash", { command: "node sil.js" }).then((r) => { bitti = true; return r; });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(bitti, false, "insan kararı beklenir, kendiliğinden izin yok");
  assert.equal(g.olaylar.find((x) => x.tur === "kapi").karar, "insan");
  assert.ok(g.olaylar.some((x) => x.tur === "onay_istek"));
  g.onaylar.get([...g.onaylar.keys()][0])!.bitir("hayir");
  assert.equal((await p as any).hookSpecificOutput.permissionDecision, "deny");
});

test("rolSecenekleri (Y1): yerel modelli ajanda auto yok (dontAsk + kapı), Claude modelinde auto; soru istemi hiçbirinde yok", () => {
  for (const rol of ["isci", "denetci"]) {
    const y = rolSecenekleri(rol, {}, "ollama:zepul-gptoss-cpu:latest") as any;
    assert.equal(y.permissionMode, "dontAsk", rol);
    assert.equal(y.permissionPrompts, "none", rol);
    assert.equal((rolSecenekleri(rol, {}, "claude-sonnet-5-5") as any).permissionMode, "auto", rol);
  }
});

test("kapı: salt okuma → {} ve olay yok", async () => {
  const d = duzen();
  assert.deepEqual(await d.cagir("Read", { file_path: "sunucu/olay.ts" }), {});
  assert.equal(d.olaylar.length, 0);
  assert.equal(d.jevSayisi(), 0);
});

test("kapı: mutlak yasak → deny, onay sorulmaz", async () => {
  const d = duzen();
  const r: any = await d.cagir("Bash", { command: "git push --force origin main" });
  assert.equal(r.hookSpecificOutput.permissionDecision, "deny");
  assert.match(r.hookSpecificOutput.permissionDecisionReason, /^mutlak yasak, onay sorulmaz/);
  assert.deepEqual(d.olaylar.map((o) => [o.tur, o.karar, o.alt_karar]), [["kapi", "red", "red"]]);
  assert.equal(d.onaylar.size, 0);
  assert.equal(d.jevSayisi(), 0);
});

test("kapı: ön süzgeç bus dışı MCP'yi reddeder", async () => {
  const d = duzen();
  const r: any = await d.cagir("mcp__ai-os__do_run", {});
  assert.equal(r.hookSpecificOutput.permissionDecision, "deny");
  assert.equal(d.olaylar[0].karar, "red");
  assert.equal(d.olaylar[0].alt_karar, "red");
});

test("kapı: insan → onay bekler; evet → allow, olay zinciri", async () => {
  const d = duzen(() => cevap("riskli", 0.97));
  let bitti = false;
  const p = d.cagir("Bash", { command: "npm install lodash" }).then((r) => { bitti = true; return r; });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(bitti, false, "insan kararı gelmeden hook dönmemeli");
  assert.equal(d.onaylar.size, 1);
  assert.deepEqual(d.bildirim, ["Bash"]);
  const istek = d.olaylar.find((o) => o.tur === "onay_istek");
  assert.equal(istek.risk, "yuksek");
  assert.equal(d.olaylar.find((o) => o.tur === "kapi").karar, "insan");

  d.onaylar.get(istek.onay_id)!.bitir("evet", "tamam");
  const r: any = await p;
  assert.equal(r.hookSpecificOutput.permissionDecision, "allow");
  assert.equal(d.onaylar.size, 0);
  assert.deepEqual(d.olaylar.map((o) => o.tur), ["kapi", "onay_istek", "onay_sonuc", "kapi"]);
  assert.equal(d.olaylar.at(-1).karar, "izin");
  assert.deepEqual(d.olaylar.filter((o) => o.tur === "kapi").map((o) => o.alt_karar), ["insan", "izin"]);
});

test("kapı: insan → hayir → deny", async () => {
  const d = duzen(() => cevap("geri-alinamaz", 0.9));
  const p = d.cagir("Bash", { command: "node sil.js" });
  await new Promise((r) => setTimeout(r, 10));
  const [id] = d.onaylar.keys();
  d.onaylar.get(id)!.bitir("hayir");
  const r: any = await p;
  assert.equal(r.hookSpecificOutput.permissionDecision, "deny");
  assert.match(r.hookSpecificOutput.permissionDecisionReason, /^insan reddetti/);
});

test("kapı: Jev hatası → hata olayı (fail-open, {})", async () => {
  const d = duzen(() => { throw new Error("ECONNREFUSED"); }, undefined, undefined, () => { throw new Error("laya yok"); });
  assert.deepEqual(await d.cagir("Bash", { command: "ls" }), {});
  const h = d.olaylar.find((o) => o.tur === "hata");
  assert.ok(h, "hata olayı yok");
  assert.equal(h.ajan, "isci1");
  assert.equal(h.kaynak, "ag");
  assert.equal(h.tur_adi, "ag_hatasi");
  for (const alan of ["geri_alinabilir", "devam_edilebilir", "oneri", "baglam"]) assert.ok(alan in h, alan);
  assert.equal(d.golge.length, 0, "Jev hatasında gölge kaydı yazılmaz");
});

test("kapı: Jev hatası + Laya güvenli → karar Laya'dan, olayda karar_kaynagi laya-yedek", async () => {
  const d = duzen(() => { throw Object.assign(new Error("HTTP 429"), { status: 429 }); }, undefined, undefined, () => cevap("guvenli", 0.9));
  assert.deepEqual(await d.cagir("Bash", { command: "ls" }), {});
  const k = d.olaylar.find((o) => o.tur === "kapi");
  assert.equal(k.karar, "izin");
  assert.equal(k.karar_kaynagi, "laya-yedek");
  assert.match(k.neden, /Laya \(Jev yedeği\)/);
});

// ---------- sozlesme_don ----------

function sozDuzen(kirli: string[] = [], rol = "isci", owns?: string[]) {
  const olaylar: any[] = [], kendine: string[] = [], sefe: string[] = [];
  let kapandi = false;
  const duzeltmeSayisi = new Map<string, number>();
  // baz: kirli dosyalar ajan başlamadan vardı (başkasının işi, K6); baz'sız yol W5 testinde.
  const b = { ajan: { id: "isci1", rol, worktree: KOK, owns, baz: { sha: null, kirli } }, yay: (o: any) => olaylar.push(o), duzeltmeSayisi,
    kendine: (m: string) => kendine.push(m), sefe: (m: string) => sefe.push(m), kapat: () => { kapandi = true; },
    degisiklik: async () => ({ ust: KOK, kok: KOK, kirli, commitli: [] as string[] }) };
  return { b, olaylar, kendine, sefe, duzeltmeSayisi, kapandi: () => kapandi };
}
const tamam = { verdict: "TAMAM", blockers: [], commits: ["abc1234"], ozet: "bitti" };

test("sozlesme_don: kirli ağaç → hata metni, oturum açık, olay yok", async () => {
  const d = sozDuzen(["test-duman.txt"]);
  const r = await sozlesmeIsle(tamam, d.b);
  assert.equal(r.hata, true);
  assert.match(r.metin, /^Önce commit at: 1 dosya \(ilk 5: test-duman\.txt\)/);
  assert.equal(d.kapandi(), false);
  assert.equal(d.olaylar.length + d.sefe.length + d.kendine.length, 0);
});

test("sozlesme_don: geçersiz sözleşme → düzelt, tekrar gönder", async () => {
  const d = sozDuzen();
  const r = await sozlesmeIsle({ ...tamam, ozet: "ç".repeat(601) }, d.b);
  assert.equal(r.hata, true);
  assert.match(r.metin, /^Sözleşme geçersiz: ozet:.*Düzelt, sozlesme_don ile tekrar gönder\.$/);
  assert.equal(d.kapandi(), false);
  assert.equal((await sozlesmeIsle({ ...tamam, verdict: "VETO" }, sozDuzen([], "denetci").b)).hata, true, "gerekçesiz VETO");
});

test("sozlesme_don: KISMI → düzeltme turu aynı işçiye, kutu kapanmaz, sayaç artar", async () => {
  const d = sozDuzen();
  const r = await sozlesmeIsle({ ...tamam, verdict: "KISMI", blockers: [{ ne: "test yok", nerede: "x.ts" }] }, d.b);
  assert.equal(r.hata, false);
  assert.equal(d.kendine.length, 1);
  assert.match(d.kendine[0], /^Düzeltme turu 1\/2: blocker'lar: test yok \(x\.ts\)/);
  assert.equal(d.sefe.length, 0);
  assert.equal(d.kapandi(), false);
  assert.equal(d.duzeltmeSayisi.get("isci1"), 1);
  const o = d.olaylar[0];
  assert.deepEqual([o.tur, o.sonraki_adim, o.blockers], ["sozlesme", "duzeltme", ["test yok (x.ts)"]]);
});

test("sozlesme_don: TAMAM (denetçi yok) → şefe, kutu kapanır; düzeltme tükenince de şefe", async () => {
  const d = sozDuzen();
  await sozlesmeIsle(tamam, d.b);
  assert.equal(d.olaylar[0].sonraki_adim, "sefe");
  assert.match(d.sefe[0], /^SÖZLEŞME \{"verdict":"TAMAM"/);
  assert.equal(d.kapandi(), true);

  const d2 = sozDuzen();
  d2.duzeltmeSayisi.set("isci1", 2);
  await sozlesmeIsle({ ...tamam, verdict: "BASARISIZ" }, d2.b);
  assert.equal(d2.olaylar[0].sonraki_adim, "sefe");
  assert.equal(d2.kendine.length, 0);
  assert.equal(d2.kapandi(), true);
});

test("sozlesme_don: denetçi VETO → kendine düzeltme açılmaz, şefe gider (D8)", async () => {
  const d = sozDuzen([], "denetci");
  const r = await sozlesmeIsle({ verdict: "VETO", blockers: ["geri alınca test kırmızıya dönmedi"], commits: [], ozet: "test hiçbir şey ölçmüyor" }, d.b);
  assert.equal(r.hata, false, r.metin);
  assert.equal(d.kendine.length, 0, "denetçi kendine düzeltme açmaz");
  assert.equal(d.sefe.length, 1);
  assert.match(d.sefe[0], /^SÖZLEŞME \{"verdict":"VETO"[\s\S]*Şef kararı gerekli: denetci/);
  assert.equal(d.olaylar[0].sonraki_adim, "sefe");
  assert.equal(d.duzeltmeSayisi.has("isci1"), false, "düzeltme turu sayılmaz");
  assert.equal(d.kapandi(), true);
});

test("sozlesme_don: OWNS varken baz yoksa yeniden alınır; alınamazsa ret (W5)", async () => {
  const d = sozDuzen([], "isci", ["docs/**"]);
  const r = await sozlesmeIsle(tamam, { ...d.b, ajan: { ...d.b.ajan, baz: null }, bazAl: async () => { throw new Error("index.lock var"); } });
  assert.equal(r.hata, true);
  assert.match(r.metin, /^baz yok, OWNS denetlenemedi: index\.lock var/);
  assert.equal(d.olaylar.length + d.sefe.length, 0);
  assert.equal(d.kapandi(), false);

  const d2 = sozDuzen([], "isci", ["docs/**"]);
  const ajan = { ...d2.b.ajan, baz: Promise.resolve(null) };
  const r2 = await sozlesmeIsle(tamam, { ...d2.b, ajan, bazAl: async () => ({ sha: "abc1234", kirli: [] }) });
  assert.equal(r2.hata, false, r2.metin);
  assert.match(d2.olaylar[0].uyari, /baz başlangıçta alınamadı/);
  assert.deepEqual(ajan.baz, { sha: "abc1234", kirli: [] }, "yeni baz saklanır");

  let cagri = 0; // OWNS yoksa baz gerekmez
  await sozlesmeIsle(tamam, { ...sozDuzen().b, bazAl: async () => { cagri++; return { sha: null, kirli: [] }; } });
  assert.equal(cagri, 0);
});

test("sozlesme_don: kirli ağaç reddi yalnızca OWNS içindeki dosyalar için; dışı uyarı (F7)", async () => {
  // OWNS dışındaki kirli dosya (başkasının işi) sözleşmeyi engellemez; olaya ve şefe uyarı gider.
  const d = sozDuzen(["veri.txt", "panel/x.html"], "isci", ["docs/**"]);
  const r = await sozlesmeIsle({ ...tamam, verdict: "KISMI", blockers: ["insan onayı yok, kural gereği"] }, d.b);
  assert.equal(r.hata, false, r.metin);
  assert.equal(d.olaylar[0].tur, "sozlesme");
  assert.equal(d.olaylar[0].uyari, "OWNS dışında commit'lenmemiş 2 dosya var; sahibine sor");
  assert.match(d.sefe[0], /OWNS dışında commit'lenmemiş 2 dosya var; sahibine sor/);
  assert.match(r.metin, /sahibine sor/);

  const d2 = sozDuzen(["DOCS/a.md", "veri.txt"], "isci", ["docs/**"]);
  const r2 = await sozlesmeIsle(tamam, d2.b);
  assert.equal(r2.hata, true);
  assert.match(r2.metin, /^Önce commit at: 1 dosya \(ilk 5: DOCS\/a\.md\)/);
  assert.equal(d2.olaylar.length, 0);

  // OWNS yoksa hepsine bakılır; temiz ağaçta uyarı alanı yok.
  assert.equal((await sozlesmeIsle(tamam, sozDuzen(["veri.txt"]).b)).hata, true);
  const d3 = sozDuzen([], "isci", ["docs/**"]);
  await sozlesmeIsle(tamam, d3.b);
  assert.equal("uyari" in d3.olaylar[0], false);
});

// ---------- Sahiplik commit anında (F9), gerçek git ----------

const GECICI = fs.mkdtempSync(path.join(process.env.YASAM_TEST_DIZIN || os.tmpdir(), "entegrasyon-"));
after(() => fs.rmSync(GECICI, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));
const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-c", "user.name=entegrasyon-test", "-c", "user.email=entegrasyon@test.yerel", "-c", "commit.gpgsign=false", ...args], { cwd, shell: false, encoding: "utf8" });

test("sozlesme_don: baz_sha..HEAD ve yeni kirli dosyada OWNS dışı değişiklik reddedilir (F9)", async () => {
  const d = path.join(GECICI, "f9");
  fs.mkdirSync(path.join(d, "docs"), { recursive: true });
  git(d, "init", "-q");
  fs.writeFileSync(path.join(d, "veri.txt"), "kardeşin işi");
  fs.writeFileSync(path.join(d, "tasinan.txt"), "OWNS dışı");
  git(d, "add", ".");
  git(d, "commit", "-q", "-m", "ilk");
  fs.writeFileSync(path.join(d, "veri.txt"), "commit'lenmemiş kardeş işi"); // ajan başlamadan kirli: ajanın değil

  const baz = await bazAl(d);
  assert.match(baz!.sha!, /^[0-9a-f]{40}$/);
  assert.deepEqual(baz!.kirli, ["veri.txt"]);
  const olaylar: any[] = [], sefe: string[] = [];
  const b = (sahiplik = new Map<string, string>()) => ({ ajan: { id: "belgeci", rol: "isci", worktree: d, owns: ["docs/**"], baz }, sahiplik,
    yay: (o: any) => olaylar.push(o), duzeltmeSayisi: new Map(), kendine: () => {}, sefe: (m: string) => sefe.push(m), kapat: () => {} });
  const tamam = { verdict: "TAMAM", blockers: [], commits: [], ozet: "bitti" };

  // Kendi OWNS'unda commit: kabul; önceden kirli veri.txt yalnızca uyarı.
  fs.writeFileSync(path.join(d, "docs", "a.md"), "belge");
  git(d, "add", "docs/a.md");
  git(d, "commit", "-q", "-m", "docs");
  const r1 = await sozlesmeIsle(tamam, b());
  assert.equal(r1.hata, false, r1.metin);
  assert.equal(olaylar.at(-1).uyari, "OWNS dışında commit'lenmemiş 1 dosya var; sahibine sor");

  // Bash ile OWNS dışına yazılmış, commit'lenmemiş yeni dosya: ret.
  fs.writeFileSync(path.join(d, "kok.txt"), "x");
  const r2 = await sozlesmeIsle(tamam, b());
  assert.equal(r2.hata, true);
  assert.match(r2.metin, /^OWNS dışı değişiklik: kok\.txt; geri al ya da sahibine devret\./);
  fs.rmSync(path.join(d, "kok.txt"));

  git(d, "mv", "tasinan.txt", "docs/tasinan.txt");
  git(d, "commit", "-q", "-m", "taşı");
  fs.writeFileSync(path.join(d, "kok2.txt"), "y");
  git(d, "add", "kok2.txt");
  git(d, "commit", "-q", "-m", "kök");
  const r3 = await sozlesmeIsle(tamam, b());
  assert.equal(r3.hata, true);
  assert.match(r3.metin, /^OWNS dışı değişiklik: kok2\.txt, tasinan\.txt;/);

  // Başka bir ajanın OWNS'undaki yol onun işidir (aynı ağaçta paralel işçi): ret değil.
  const r4 = await sozlesmeIsle(tamam, b(new Map([["kok2.txt", "baska"], ["tasinan.txt", "baska"]])));
  assert.equal(r4.hata, false, r4.metin);

  // OWNS yoksa sahiplik denetlenmez.
  const r5 = await sozlesmeIsle(tamam, { ...b(), ajan: { id: "serbest", rol: "isci", worktree: d, baz } } as any);
  assert.equal(r5.hata, true, "OWNS yok: veri.txt dahil tüm kirli dosyalar commit ister (eski davranış)");
  assert.match(r5.metin, /^Önce commit at: 1 dosya \(ilk 5: veri\.txt\)/);
});

// ---------- Maliyet (F10) ----------

test("maliyet: ajan maliyeti oturumların toplamı; resume'da sıfırlanmaz", () => {
  const m = maliyetSayaci();
  m.yeniOturum(); // ilk oturum
  assert.equal(m.oturumUsd(0.1), 0.1);
  assert.equal(m.oturumUsd(0.3), 0.3, "aynı oturumda total_cost_usd birikimlidir: üzerine yazılır");
  m.yeniOturum(); // resume: SDK sıfırdan sayar
  assert.equal(Math.round(m.oturumUsd(0.02) * 1e6) / 1e6, 0.32);
  m.yeniOturum(); // çöken oturum result üretmedi
  m.yeniOturum();
  assert.equal(Math.round(m.oturumUsd(0.05) * 1e6) / 1e6, 0.37);
});

// ---------- ajan_baslat cwd (F5) ----------

test("izinliCwd: repo, repo/.worktrees/* ve test kökü; dışı null", () => {
  const repo = path.resolve(KOK);
  const wt = path.join(repo, ".worktrees", "isci1");
  assert.equal(izinliCwd(repo, repo), repo);
  assert.equal(izinliCwd(".worktrees/isci1", repo), wt, "göreli yol repoya göre çözülür");
  assert.equal(izinliCwd(wt.toUpperCase(), repo), path.resolve(wt.toUpperCase()), "harf duyarsız");
  assert.ok(izinliCwd(path.join(wt, "alt"), repo), "worktree alt klasörü");
  assert.equal(izinliCwd(path.join(repo, ".worktrees", ".."), repo), repo, "normalize edilir");
  for (const kotu of [repo + "-kotu", path.join(repo, ".worktrees"), path.join(repo, "sunucu"), path.join(wt, "..", "..", ".."), path.dirname(repo), path.join(os.tmpdir(), "x")]) {
    assert.equal(izinliCwd(kotu, repo), null, kotu);
  }
  const test = path.join(os.tmpdir(), "zepul-test");
  assert.equal(izinliCwd(path.join(test, "calisma"), repo, test), path.join(test, "calisma"), "test kökü altı");
  assert.equal(izinliCwd(path.join(os.tmpdir(), "baska"), repo, test), null, "test kökü dışı");
});

test("izinliCwd: dışarıyı gösteren junction kanonik() ile reddedilir (av2-5)", () => {
  const kok = fs.mkdtempSync(path.join(os.tmpdir(), "izinli-")), repo = path.join(kok, "repo"), dis = path.join(kok, "dis");
  const bag = path.join(repo, ".worktrees", "bag");
  fs.mkdirSync(path.join(repo, ".worktrees", "gercek"), { recursive: true });
  fs.mkdirSync(dis);
  fs.symlinkSync(dis, bag, "junction");
  try {
    assert.equal(izinliCwd(bag, repo), null, "junction hedefi repo dışı");
    assert.equal(izinliCwd(path.join(bag, "alt"), repo), null);
    assert.ok(izinliCwd(path.join(repo, ".worktrees", "gercek"), repo), "gerçek worktree dizini");
  } finally {
    fs.unlinkSync(bag); // junction önce kaldırılır: hedefi boşaltılmasın
    fs.rmSync(kok, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});

// ---------- Rol seçenekleri (F1b) ----------

test("rolSecenekleri: işçide Monitor yasak; şef salt okur", () => {
  const isci = rolSecenekleri("isci") as any;
  assert.ok(isci.disallowedTools.includes("Monitor"), "Monitor kabuk komutu çalıştırır, kapının kabuk denetimine girmez (kabul K1)");
  assert.equal(isci.permissionMode, "auto");
  for (const rol of ["denetci", "hata-avcisi", "birlestirici"]) assert.ok((rolSecenekleri(rol) as any).disallowedTools.includes("Monitor"), rol);
  const sef = rolSecenekleri("sef") as any;
  assert.deepEqual(sef.tools, ["Read", "Grep", "Glob"]);
  assert.ok(sef.disallowedTools.includes("Bash"));
});

test("rolSecenekleri: şef dışı rollerin query ortamında push kapalı (F1b)", () => {
  const taban = { PATH: "yol", GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "user.name", GIT_CONFIG_VALUE_0: "x" };
  for (const rol of ["isci", "denetci", "birlestirici"]) {
    const env = (rolSecenekleri(rol, taban) as any).env;
    assert.ok(env, `${rol}: env yok, query süreci process.env'i alır`);
    assert.equal(env.GIT_CONFIG_KEY_0, "user.name", "var olan ayar korunur");
    assert.equal(env.GIT_CONFIG_KEY_1, "remote.origin.pushurl", rol);
    assert.ok(Number(env.GIT_CONFIG_COUNT) > 1);
    assert.equal(env.GH_TOKEN, "engelli");
  }
  assert.equal((rolSecenekleri("isci") as any).env.GIT_TERMINAL_PROMPT, "0", "varsayılan taban process.env");
  assert.equal((rolSecenekleri("sef", taban) as any).env?.GIT_CONFIG_KEY_1, undefined, "şef Bash çalıştırmaz, işçi ortamı gerekmez");
});

test("rolSecenekleri: panel token'ı hiçbir ajanın ortamına geçmez (S1)", () => {
  const taban = { PATH: "yol", ZEPUL_TOKEN: "gizli-panel-belireci-0123456789", ZEPUL_TEST: "1", ANTHROPIC_API_KEY: "sk-x" };
  for (const rol of ["sef", "isci", "denetci"]) {
    const env = (rolSecenekleri(rol, taban) as any).env;
    assert.ok(env, `${rol}: env yok, query süreci ZEPUL_TOKEN'lı process.env'i alır`);
    assert.equal(env.PATH, "yol", rol);
    for (const k of ["ZEPUL_TOKEN", "ZEPUL_TEST", "ANTHROPIC_API_KEY"]) assert.equal(k in env, false, `${rol}: ${k}`);
  }
  assert.equal(taban.ZEPUL_TOKEN, "gizli-panel-belireci-0123456789", "taban değişmez (sunucu token'ı okumaya devam eder)");
});

// ---------- Panel başlıkları (S3) ----------

test("panelBasliklari: CSP satır içi betiğin sha256 özetini taşır; nosniff ve DENY", () => {
  const ozet = (s: string) => `'sha256-${crypto.createHash("sha256").update(s, "utf8").digest("base64")}'`;
  const b = panelBasliklari(`<p>ç</p><script>const a = "ğ";\r\nbasla();</script><script src="x.js"></script><script type="module">
b()</script>`);
  const csp = b["content-security-policy"];
  assert.match(csp, /^default-src 'none'; script-src 'self' 'sha256-[^']+' 'sha256-[^']+'; style-src 'unsafe-inline'; img-src data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'$/);
  assert.ok(csp.includes(ozet(`const a = "ğ";\nbasla();`)), csp);
  assert.ok(csp.includes(ozet("\nb()")), csp);
  assert.ok(!/https?:|\*/.test(csp.split("script-src")[1].split(";")[0]), "script-src yalnız 'self' (gömülü three.js) ve özetler: dış kaynak yok");
  assert.equal(b["x-content-type-options"], "nosniff");
  assert.equal(b["x-frame-options"], "DENY");

  // Gerçek panel: özet <script> ile </script> arasındaki metinle eşleşir.
  const html = fs.readFileSync(path.join(KOK, "panel", "index.html"), "utf8");
  const govde = html.slice(html.indexOf("<script>") + 8, html.indexOf("</script>")).replace(/\r\n?/g, "\n");
  assert.ok(panelBasliklari(html)["content-security-policy"].includes(ozet(govde)));
  assert.match(panelBasliklari("<p>betik yok</p>")["content-security-policy"], /script-src 'none';/);
});

// ---------- Sahiplik yaşam döngüsü (D9) ----------

test("sahiplik: canlı ajanın deseniyle çakışan OWNS reddedilir; bitti ya da olu ajanın kaydı silinir (D9)", () => {
  const s = new Map([["panel/**", "a"], ["docs/x.md", "a"], ["sunucu/**", "b"]]);
  assert.match(ownsCakismasi(["panel/index.html"], s)!, /panel\/\*\* \(a\)/);
  assert.match(ownsCakismasi(["sunucu/*.ts", "araclar/**"], s)!, /sunucu\/\*\* \(b\)/);
  assert.equal(ownsCakismasi(["araclar/**", "docs/y.md"], s), null);
  assert.equal(ownsCakismasi(["panel/**"], s, "a"), null, "kendi eski kaydı çakışma değil (diriltmede geri alınır)");

  sahiplikDurumu("a", "calisiyor", s);
  sahiplikDurumu("a", "hata", s);
  assert.equal(s.size, 3, "hata diriltilir, sahiplik kalır");
  sahiplikDurumu("a", "olu", s);
  assert.deepEqual([...s], [["sunucu/**", "b"]], "yalnızca ölen ajanın kayıtları silinir");
  assert.equal(ownsCakismasi(["panel/**"], s), null, "ölü ajanın deseni boşaldı");
  sahiplikDurumu("b", "bitti", s);
  assert.equal(s.size, 0);
});

// ---------- Bekçi: canlı limit, geçişler, ayar (A1, A2, A4) ----------

const olcum = (bes: number, yedi: number): LimitDurumu =>
  ({ bes_saat: { yuzde: bes, sifirlanma: "2026-09-29T20:00:00Z" }, yedi_gun: { yuzde: yedi, sifirlanma: "2026-10-02T00:00:00Z" }, kaynak: "test", yas_dk: 0, ts: Date.now() });

function limitDuzen(olcumler: (LimitDurumu | null)[], ayar?: Partial<Ayar>, kuyruk: BekleyenIs[] = []) {
  const olaylar: any[] = [], sefe: string[] = [], bilgi: string[] = [], ntfy: string[][] = [];
  let okuma = 0;
  const iz = limitIzleyici({
    oku: async () => olcumler[Math.min(okuma++, olcumler.length - 1)],
    ...(ayar ? { ayarOku: async () => ({ ...VARSAYILAN_AYAR, ...ayar }) } : {}), // yoksa gerçek dosya (ZEPUL_AYAR_DIZIN)
    kuyrukOku: async () => kuyruk,
    yay: (o) => olaylar.push(o), sefe: (m) => sefe.push(m), sefeBilgi: (s) => bilgi.push(s), ntfy: (b, m) => ntfy.push([b, m]),
  });
  return { iz, olaylar, sefe, bilgi, ntfy, okuma: () => okuma };
}

test("limit: serbest → kapalı ntfy + şefe; kapalı → serbest bekleyen işler şefe sorulur, otomatik başlatma yok", async () => {
  const kuyruk = [{ id: "is-a1", istek: { ad: "panelci" }, neden: "x", ts: 1 }, { id: "is-b2", istek: { ad: "belgeci" }, neden: "x", ts: 2 }];
  const titrek = { ...olcum(10, 38), bes_saat: { yuzde: 10, sifirlanma: "2026-09-29T20:00:00.932318Z" } }; // limit.py resets_at her okumada µs oynar
  const d = limitDuzen([olcum(10, 30), olcum(10, 45), olcum(10, 38), titrek], { haftalik_tavan_yuzde: 40 }, kuyruk);

  await d.iz.tik();
  assert.equal(d.iz.karar().yeniIsSerbest, true);
  assert.equal(d.sefe.length + d.ntfy.length + d.bilgi.length, 0, "serbest başlangıç: bildirim yok");
  const l = d.olaylar.find((o) => o.tur === "limit");
  assert.deepEqual({ ...l, neden: undefined }, { ajan: "sunucu", tur: "limit", bes_saat_yuzde: 10, yedi_gun_yuzde: 30, bes_saat_sifirlanma: "2026-09-29T20:00:00Z",
    yedi_gun_sifirlanma: "2026-10-02T00:00:00Z", serbest: true, neden: undefined, haftalik_tavan: 40, bes_saat_tavan: null,
    kaynak: "test", yas_sn: 0, guncellendi_iso: null, bayat: false });

  await d.iz.tik(); // %45 ≥ tavan %40
  assert.equal(d.iz.karar().yeniIsSerbest, false);
  assert.deepEqual(d.ntfy.map((n) => n[0]), ["Zepul OS: uyarı: limit tavanı aşıldı, yeni iş durdu"]);
  assert.doesNotMatch(d.ntfy[0][1], /[\/]/, "ntfy mesajında yol yok");
  assert.equal(d.sefe.length, 1);
  assert.match(d.sefe[0], /haftalık %45 ≥ tavan %40/);

  await d.iz.tik(); // %38: serbest, tavana yaklaştı
  assert.equal(d.iz.karar().yeniIsSerbest, true);
  assert.equal(d.sefe.length, 2);
  assert.match(d.sefe[1], /bekleyen 2 iş var, başlatayım mı\?/i);
  assert.match(d.sefe[1], /is-a1[\s\S]*is-b2/);
  assert.equal(d.ntfy.length, 1, "açılışta ntfy yok");
  assert.equal(d.bilgi.length, 1, "ilk uyarı şefe bilgi satırı");
  assert.match(d.bilgi[0], /yaklaştı/);
  assert.equal(d.olaylar.filter((o) => o.tur === "limit").length, 3, "her değişimde limit olayı");

  await d.iz.tik(); // aynı yüzdeler, sıfırlanma zamanı titredi: olay yok, bilgi tekrarlanmaz
  assert.equal(d.olaylar.filter((o) => o.tur === "limit").length, 3, "değişmeyen limit 5 dk dolmadan yayılmaz (sıfırlanma titremesi değişim sayılmaz)");
  assert.equal(d.bilgi.length, 1);
});

test("limit: kuyruk boşsa açılışta şefe soru gitmez; okunamayan limit tek hata olayı", async () => {
  const d = limitDuzen([olcum(10, 50), olcum(10, 20)], { haftalik_tavan_yuzde: 40 });
  await d.iz.tik();
  await d.iz.tik();
  assert.equal(d.sefe.length, 1, "yalnızca kapanış mesajı");

  const n = limitDuzen([null, null, olcum(5, 5), null]);
  for (let i = 0; i < 4; i++) await n.iz.tik();
  const h = n.olaylar.filter((o) => o.tur === "hata");
  assert.deepEqual(h.map((o) => o.tur_adi), ["limit-okunamadi", "limit-okunamadi"], "art arda okunamama tek olay; başarılı okumadan sonra yeniden");
  assert.equal(n.iz.son?.yedi_gun?.yuzde, 5, "okunamayınca son başarılı ölçüm kalır");
});

test("ayar_yaz: dosyaya yazar (guncelleyen sef), tik hemen koşar, karar yeni tavanla; geçersiz ayar hata", async () => {
  const d = limitDuzen([olcum(10, 45)]); // gerçek ayarOku: ZEPUL_AYAR_DIZIN
  await d.iz.tik();
  assert.equal(d.iz.karar().yeniIsSerbest, true, "tavan yok");
  const okumaOnce = d.okuma();
  const a = await d.iz.ayarYaz({ haftalik_tavan_yuzde: 40 }, "sef");
  assert.equal(a.guncelleyen, "sef");
  assert.equal(a.haftalik_tavan_yuzde, 40);
  assert.equal((await ayarOku()).haftalik_tavan_yuzde, 40, "dosyaya yazıldı");
  assert.equal(d.okuma(), okumaOnce + 1, "yazımdan sonra tik hemen koştu");
  assert.equal(d.iz.karar().yeniIsSerbest, false);
  assert.equal(d.ntfy.length, 1, "tavan aşıldı: ntfy");
  await assert.rejects(d.iz.ayarYaz({ haftalik_tavan_yuzde: 140 } as any, "sef"), /0-100/);
  await assert.rejects(d.iz.ayarYaz({ bilinmeyen: 1 } as any, "panel"), /bilinmeyen ayar/);
  await d.iz.ayarYaz({ haftalik_tavan_yuzde: null }, "panel");
});

test("limit: bayat ölçüm tavan kararında kullanılmaz, olayda kaynak/yaş ve bayat uyarısı; yaş değişimi olay tetiklemez", async () => {
  const taze = { ...olcum(10, 30), kaynak: "canli", yas_sn: 60, guncellendi_iso: "2026-10-04T13:48:15+03:00", bayat: false };
  const d = limitDuzen([taze, { ...taze, yas_sn: 120 }, { ...olcum(99, 99), kaynak: "son-canli", yas_sn: 2400, bayat: true }], { haftalik_tavan_yuzde: 40 });
  await d.iz.tik();
  await d.iz.tik();
  const l = d.olaylar.filter((o) => o.tur === "limit");
  assert.equal(l.length, 1, "yalnız yaşı değişen ölçüm yeni olay değil");
  assert.equal(l[0].kaynak, "canli");
  assert.equal(l[0].yas_sn, 60);
  assert.equal(l[0].bayat, false);
  await d.iz.tik();
  const b = d.olaylar.filter((o) => o.tur === "limit").at(-1);
  assert.equal(d.iz.karar().yeniIsSerbest, true, "bayat %99 işi kuyruğa düşürmez");
  assert.equal(d.ntfy.length, 0);
  assert.equal(b.bayat, true);
  assert.equal(b.kaynak, "son-canli");
  assert.match(b.uyari, /limit bilinmiyor \(bayat\)/);
});

// ---------- ajan_baslat: limit kapısı ve kuyruk (A3) ----------

const brif = (ek: object = {}) => ({ ad: "panelci", rol: "isci", model: "claude-sonnet-5-5", gorev: "Panele limit kartını ekle ve testini yaz.",
  owns: ["panel/**"], dokunma: [{ yol: "sunucu/**", sahip: "entegrator" }], baglam: "test bağlamı: işin nedeni ve mevcut durum burada", once_oku: ["docs/panel-api.md"], kabul: "limit kartı SSE limit olayıyla güncellenir", ...ek });

test("ajan_baslat: limit kapalıyken iş kuyruğa alınır, başlatılmaz; kuyruk_id ile başlayınca kayıt silinir", async () => {
  await kuyrukYaz([]);
  const baslayan: any[] = [];
  let karar = { yeniIsSerbest: false, neden: "haftalık %45 ≥ tavan %40" };
  const bag = { karar: () => karar, sahiplik: new Map<string, string>(), baslat: async (b: any) => { baslayan.push(b); } };

  const r = await ajanBaslatIsle(brif(), bag);
  assert.equal(r.hata, false);
  assert.match(r.metin, /^limit: haftalık %45 ≥ tavan %40; iş kuyruğa alındı \(is-[0-9a-f]{8}\)$/);
  assert.equal(baslayan.length, 0, "limit kapalı: başlatma yok");
  const q = await kuyrukOku();
  assert.equal(q.length, 1);
  assert.equal((q[0].istek as any).ad, "panelci");
  assert.equal(q[0].neden, karar.neden);

  const r2 = await ajanBaslatIsle(brif({ kuyruk_id: q[0].id }), bag);
  assert.match(r2.metin, /hâlâ kuyrukta/);
  assert.equal((await kuyrukOku()).length, 1, "aynı iş ikinci kez kuyruğa yazılmaz");

  karar = { yeniIsSerbest: true, neden: "haftalık %20 < tavan %40" };
  const r3 = await ajanBaslatIsle(brif({ kuyruk_id: q[0].id }), bag);
  assert.deepEqual(r3, { metin: "panelci başlatıldı", hata: false });
  assert.equal(baslayan.length, 1);
  assert.equal("kuyruk_id" in baslayan[0], false, "kuyruk_id başlatma isteğine geçmez");
  assert.deepEqual(await kuyrukOku(), [], "başlayan iş kuyruktan silindi");

  const r4 = await ajanBaslatIsle(brif({ ad: "ikinci" }), { ...bag, baslat: async () => { throw new Error("en fazla 4 aktif işçi olabilir"); } });
  assert.deepEqual(r4, { metin: "en fazla 4 aktif işçi olabilir", hata: true });
});

// ---------- Bekçi: döngü koruması ve maxTurns (A5-A8) ----------

test("rolSecenekleri: maxTurns işçi 150, denetçi 80, şefte sınır yok", () => {
  assert.equal((rolSecenekleri("isci") as any).maxTurns, 150);
  assert.equal((rolSecenekleri("denetci") as any).maxTurns, 80);
  assert.equal("maxTurns" in rolSecenekleri("sef"), false);
});

function bekciDuzen() {
  const ajanlar = new Map([["isci1", { durum: "calisiyor" }]]);
  const olaylar: any[] = [], mesaj: string[][] = [], sefe: string[] = [], bilgi: string[] = [], ntfy: string[][] = [], kesilen: string[] = [];
  const b: BekciBag = {
    durumlar: new Map(), commitAraclari: new Set(), ayar: () => ({ ...VARSAYILAN_AYAR }), ajan: (id) => ajanlar.get(id),
    yay: (o) => { olaylar.push(o); const a = ajanlar.get(o.ajan); if (a && o.tur === "durum") a.durum = o.durum as string; },
    ajanaMesaj: (id, m) => mesaj.push([id, m]), sefe: (m) => sefe.push(m), sefeBilgi: (s) => bilgi.push(s), ntfy: (t, m) => ntfy.push([t, m]),
    interrupt: (id) => kesilen.push(id),
  };
  return { b, ajanlar, olaylar, mesaj, sefe, bilgi, ntfy, kesilen, besle: (o: any) => bekciOlay(o, b) };
}
const aracOlay = (ajan: string, girdi_ozet = '{"command":"npm test"}', arac = "Bash", arac_id: string = crypto.randomUUID()) => ({ ajan, tur: "arac", arac_id, arac, girdi_ozet });

test("bekçi: aynı çağrı 3 kez → ajana uyarı; 5 kez → durduruldu + interrupt + dongu olayı + ntfy + şefe bilgi; sonraki durdur yok sayılır", () => {
  const d = bekciDuzen();
  for (let i = 0; i < 3; i++) d.besle(aracOlay("isci1"));
  assert.equal(d.mesaj.length, 1);
  assert.equal(d.mesaj[0][0], "isci1");
  assert.match(d.mesaj[0][1], /Aynı çağrıyı 3 kez tekrarladın/);
  assert.deepEqual(d.olaylar.map((o) => [o.ajan, o.tur, o.tur_adi]), [["isci1", "hata", "dongu-uyari"]]);
  assert.equal(d.kesilen.length + d.ntfy.length, 0, "uyarı ajanı durdurmaz");

  d.besle(aracOlay("isci1"));
  d.besle(aracOlay("isci1"));
  assert.deepEqual(d.kesilen, ["isci1"]);
  assert.equal(d.ajanlar.get("isci1")!.durum, "durduruldu");
  assert.deepEqual(d.olaylar.slice(1).map((o) => [o.tur, o.durum ?? o.tur_adi]), [["durum", "durduruldu"], ["hata", "dongu"]]);
  assert.match(d.olaylar.at(-1).mesaj, /5 kez art arda/);
  assert.deepEqual(d.ntfy, [["Zepul OS: uyarı: ajan durduruldu", "isci1: bekçi kuralı tekrar"]], "ntfy'de yol ya da tam neden yok");
  assert.equal(d.bilgi.length, 1);
  assert.match(d.bilgi[0], /isci1 durduruldu \(tekrar\)/);

  d.besle(aracOlay("isci1")); // durduruldu ajana yeni durdur kararı
  assert.equal(d.kesilen.length, 1);
  assert.equal(d.ntfy.length, 1);
});

test("bekçi: alt ajan ayrı sayılır; başarılı git commit ilerleme; maliyet hızı durdurur; bilinmeyen ajan yok sayılır", () => {
  const d = bekciDuzen();
  for (let i = 0; i < 2; i++) { d.besle(aracOlay("isci1")); d.besle(aracOlay("isci1/Explore")); }
  assert.equal(d.mesaj.length, 0, "ana ve alt ajanın çağrıları tek sayaçta birikmez");
  assert.deepEqual([...d.b.durumlar.keys()], ["isci1", "isci1/Explore"]);

  d.besle(aracOlay("isci1", '{"command":"git add a.ts && git commit -m \\"feat: a\\"","description":"commit"}', "Bash", "c1"));
  d.besle(aracOlay("isci1", '{"command":"npm test","description":"git commit öncesi test"}', "Bash", "c2"));
  d.b.durumlar.get("isci1")!.sonIlerleme = 0;
  d.besle({ ajan: "isci1", tur: "arac_sonuc", arac_id: "c2", basarili: true, ozet: "ok" });
  assert.equal(d.b.durumlar.get("isci1")!.sonIlerleme, 0, "açıklamadaki 'git commit' commit sayılmaz");
  d.besle({ ajan: "isci1", tur: "arac_sonuc", arac_id: "c1", basarili: true, ozet: "[is/a 1a2b3c4] feat: a" });
  assert.ok(d.b.durumlar.get("isci1")!.sonIlerleme > 0, "başarılı commit ilerleme sayılır");

  d.besle({ ajan: "yok", tur: "arac", arac: "Bash", girdi_ozet: "x" });
  assert.equal(d.b.durumlar.has("yok"), false);

  d.besle({ ajan: "isci1", tur: "maliyet", maliyet_usd: 5 }); // 10 dk'da $5 > $3
  assert.deepEqual(d.kesilen, ["isci1"]);
  assert.deepEqual(d.ntfy, [["Zepul OS: uyarı: ajan durduruldu", "isci1: bekçi kuralı maliyet-hizi"]]);
});

// ---------- Faz 3: brif ve işçi worktree'si (B1) ----------

test("ajan_baslat: brif doğrulanır; OWNS çakışması cakisma + öneriyle reddedilir, başlatılmaz ve kuyruğa girmez", async () => {
  await kuyrukYaz([]);
  let baslayan = 0;
  const bag = (karar = { yeniIsSerbest: true, neden: "x" }) =>
    ({ karar: () => karar, sahiplik: new Map([["panel/**", "baska"]]), baslat: async () => { baslayan++; } });
  const r = await ajanBaslatIsle(brif({ owns: ["panel/index.html"] }), bag());
  assert.equal(r.hata, true);
  assert.match(r.metin, /^OWNS başka aktif ajanla çakışıyor: panel\/\*\* \(baska\)/);
  assert.match(r.metin, /çakışma: panel\/\*\* → baska/);
  assert.match(r.metin, /öneri: böl \(OWNS'u daralt\), ayır \(başka dosya\), sıraya koy/);
  assert.equal(baslayan, 0);

  const kapali = await ajanBaslatIsle(brif({ owns: ["panel/index.html"] }), bag({ yeniIsSerbest: false, neden: "limit" }));
  assert.equal(kapali.hata, true, "geçersiz brif limit kapalıyken de kuyruğa yazılmaz");
  assert.deepEqual(await kuyrukOku(), []);

  const eksik = await ajanBaslatIsle(brif({ once_oku: [] }), bag());
  assert.match(eksik.metin, /once_oku/);
  assert.equal(eksik.hata, true);
  const den = await ajanBaslatIsle(brif({ rol: "denetci", owns: [] }), bag());
  assert.deepEqual(den, { metin: "denetçiyi kod başlatır (işçi TAMAM dönünce); ajan_baslat ile açılmaz", hata: true });
  const uzun = await ajanBaslatIsle(brif({ ad: "a".repeat(33) }), bag());
  assert.match(uzun.metin, /en çok 32 karakter/);
  assert.equal(baslayan, 0);
});

const gitK = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-c", "user.name=entegrasyon-test", "-c", "user.email=entegrasyon@test.yerel", "-c", "commit.gpgsign=false", "-c", "core.autocrlf=false", ...args],
    { cwd, shell: false, windowsHide: true, encoding: "utf8" }).trim();
function yeniDepo(ad: string): string {
  const d = path.join(GECICI, ad);
  fs.mkdirSync(d, { recursive: true });
  gitK(d, "init", "-q", "-b", "main");
  // Depo ayarı: modülün kendi git çağrıları (-c almaz) da aynı kimlik ve satır sonuyla çalışsın.
  for (const [k, v] of [["user.name", "entegrasyon-test"], ["user.email", "entegrasyon@test.yerel"], ["commit.gpgsign", "false"], ["core.autocrlf", "false"]]) gitK(d, "config", k, v);
  fs.writeFileSync(path.join(d, "ortak.txt"), "ilk\n");
  gitK(d, "add", "ortak.txt");
  gitK(d, "commit", "-q", "-m", "ilk");
  return d;
}

test("brifliBaslat: işçi is/<ad> worktree'sinde açılır, talimat brif + npm notu; başlatma reddedilirse worktree ve dal geri alınır", async () => {
  const repo = yeniDepo("b1");
  const d = brifDogrula(brif(), new Map());
  assert.ok(d.gecerli);
  const b: Brif = d.brif;
  const istekler: any[] = [];
  await brifliBaslat(b, { repo, kurallar: "KURAL-METNI", ajanBaslat: (i) => { istekler.push(i); } });
  const i = istekler[0];
  assert.equal(path.resolve(i.cwd), path.join(repo, ".worktrees", "panelci"));
  assert.ok(fs.existsSync(path.join(i.cwd, "ortak.txt")), "worktree açıldı");
  assert.deepEqual([i.ad, i.rol, i.model, i.dal, i.repo, i.brif_kabul, i.owns], ["panelci", "isci", "claude-sonnet-5-5", "is/panelci", repo, b.kabul, ["panel/**"]]);
  assert.equal(i.gorev, b.gorev);
  assert.match(i.talimat, /## OWNS[\s\S]*- panel\/\*\*[\s\S]*## Kurallar\nKURAL-METNI[\s\S]*npm ci --prefer-offline/);
  assert.match(i.talimat, /junction ya da symlink kurma/);

  await assert.rejects(brifliBaslat({ ...b, ad: "ikinci" }, { repo, kurallar: "", ajanBaslat: () => { throw new Error("en fazla 4 aktif işçi olabilir"); } }), /en fazla 4/);
  assert.equal(fs.existsSync(path.join(repo, ".worktrees", "ikinci")), false, "reddedilen işçinin worktree'si kaldırıldı");
  assert.throws(() => gitK(repo, "rev-parse", "--verify", "--quiet", "refs/heads/is/ikinci"), Error, "dalı silindi");

  await brifliBaslat({ ...b, ad: "katip1", rol: "katip", owns: [], cwd: "docs" }, { repo, kurallar: "", ajanBaslat: (x) => { istekler.push(x); } });
  assert.deepEqual([istekler[1].cwd, istekler[1].dal, istekler[1].repo], ["docs", undefined, undefined], "işçi olmayan rol worktree açmaz");
});

// ---------- Faz 3: denetçinin yazma kökü (B3) ----------

test("kapı: denetçi yazilabilir_kokler dışına Edit/Write → red (kapıya gitmeden); kök altı kendi alanı sayılır", async () => {
  const kopya = path.join(GECICI, "denetim", "isci1-1");
  fs.mkdirSync(kopya, { recursive: true });
  const olaylar: any[] = [];
  let jev = 0;
  const temel: KapiBagimlilik = { jevSor: async () => { jev++; return cevap("guvenli", 0.95); }, layaSor: async () => cevap("belirsiz", 0.6), golgeYaz: () => {}, hataYaz: () => {} };
  const yay = (o: any) => olaylar.push(o);
  const hook = kapiHookOlustur({ ajan: { id: "denetci-isci1", rol: "denetci", yazilabilir_kokler: [kopya] }, kok: KOK,
    sahiplik: new Map([[desenNormalize(`${kopya}/**`), "denetci-isci1"], ["panel/**", "isci1"]]), bagimlilik: kapiBagimliligi(yay, temel), yay, onaylar: new Map(), bildir: () => {}, onayMs: 1000 });
  const cagir = (arac: string, girdi: object): Promise<any> => hook({ hook_event_name: "PreToolUse", tool_name: arac, tool_input: girdi, session_id: "s", transcript_path: "", cwd: KOK } as any, "t", { signal: new AbortController().signal });

  const disari: [string, object][] = [
    ["Write", { file_path: path.join(KOK, "sunucu", "x.ts"), content: "x" }],
    ["Edit", { file_path: "sunucu/baglama.ts", old_string: "a", new_string: "b" }], // göreli: işçi worktree'sine (kok) göre
    ["NotebookEdit", { notebook_path: path.join(kopya, "..", "disari.ipynb"), new_source: "" }],
    ["Write", { file_path: `${kopya}-kardes/a.txt`, content: "önek aynı, kök değil" }],
  ];
  for (const [arac, girdi] of disari) {
    const r = await cagir(arac, girdi);
    assert.equal(r.hookSpecificOutput?.permissionDecision, "deny", `${arac} ${JSON.stringify(girdi)}`);
    assert.match(r.hookSpecificOutput.permissionDecisionReason, /denetci yalnızca kopya kökü altına yazabilir/);
  }
  assert.equal(jev, 0, "kök dışı yazma kapıya (Jev) gitmeden reddedildi");
  assert.equal(olaylar.filter((o) => o.tur === "kapi" && o.karar === "red").length, 4);
  assert.doesNotMatch(olaylar[0].neden, /[\/]/, "red nedeninde yol yok");

  assert.deepEqual(await cagir("Write", { file_path: path.join(kopya, "m1", "sunucu", "a.ts"), content: "mutasyon" }), {});
  assert.equal(olaylar.at(-1).alt_karar, "gec", "kopya kökü denetçinin kendi alanı (sahiplik kaydı)");
  assert.deepEqual(await cagir("Read", { file_path: path.join(KOK, "sunucu", "x.ts") }), {}, "okuma etkilenmez");
  assert.equal(jev, 0);
  // K26: hook kopya kökünü kapıya iletir; kendi kopyasındaki özyineli silme kesin yasağa (insana) düşmez.
  // av9: kod izni yok, karar Jev'in (silme aracı mutasyon_kopyasi_sil).
  assert.deepEqual(await cagir("Bash", { command: `rm -rf "${path.join(kopya, "m1")}"` }), {});
  assert.equal(olaylar.at(-1).alt_karar, "gec", "kopya içi silme Jev'e gider, insana gitmez");
  assert.equal(jev, 1, "kopya içi silme Jev'e sorulur");

  const isci = kapiHookOlustur({ ajan: { id: "isci1", rol: "isci" }, kok: KOK, sahiplik: new Map([["panel/**", "isci1"]]), bagimlilik: kapiBagimliligi(yay, temel), yay, onaylar: new Map(), bildir: () => {} });
  assert.deepEqual(await isci({ hook_event_name: "PreToolUse", tool_name: "Write", tool_input: { file_path: "panel/a.html" }, session_id: "s", transcript_path: "", cwd: KOK } as any, "t", { signal: new AbortController().signal }), {});
});

// ---------- Faz 3: işçi → denetçi → birleştirme (B2, B4, B5) ----------

test("işçi TAMAM → denetçi başlatılır, işçinin kutusu açık kalır, şefe gitmez; denetim sürerken ikinci sözleşme işlenmez", async () => {
  const d = sozDuzen();
  const denetlenen: any[] = [];
  const b = { ...d.b, denetciye: (v: any) => { denetlenen.push(v); } };
  const r = await sozlesmeIsle(tamam, b);
  assert.equal(r.hata, false, r.metin);
  assert.match(r.metin, /denetçi/);
  assert.deepEqual(denetlenen.map((v) => v.verdict), ["TAMAM"]);
  assert.equal(d.kapandi(), false, "VETO'da düzeltme için işçi oturumu açık");
  assert.equal(d.sefe.length, 0, "şef ham sözleşmeyi görmez (1. çivi)");
  assert.equal(d.olaylar[0].sonraki_adim, "denetciye");
  assert.equal((b.ajan as any).denetimde, true);

  const r2 = await sozlesmeIsle(tamam, b);
  assert.match(r2.metin, /denetim sürüyor/);
  assert.equal(denetlenen.length, 1, "ikinci denetçi açılmaz");
  assert.equal(d.olaylar.length, 1);

  const k = sozDuzen(); // KISMI: düzeltme turu yine işçinin kendisine (denetçiye gitmez)
  await sozlesmeIsle({ ...tamam, verdict: "KISMI", blockers: ["test yok"] }, { ...k.b, denetciye: () => assert.fail("KISMI denetçiye gitmez") });
  assert.equal(k.kendine.length, 1);
});

test("denetciIstegi: denetci-<işçi>, Opus, işçinin worktree'si; kopya kökü repo dışında; görev denetciBrifi", () => {
  const wt = path.join(KOK, ".worktrees", "panelci");
  const i = denetciIstegi({ id: "panelci", dal: "is/panelci", worktree: wt, brif_kabul: "limit kartı güncellenir" },
    { verdict: "TAMAM", blockers: [], commits: ["abc1234"], ozet: "kart eklendi" },
    { dosyalar: ["panel/index.html"], commitler: [{ sha: "abc1234def", mesaj: "feat: limit kartı" }] }, "0123456789abcdef", 1700000000000);
  assert.deepEqual([i.ad, i.rol, i.model, i.cwd, i.denetci_icin], ["denetci-panelci", "denetci", "claude-opus-5-5", wt, "panelci"]);
  assert.equal(i.kopya_koku, path.join(process.env.ZEPUL_AYAR_DIZIN!, "denetim", "panelci-1700000000000"));
  assert.deepEqual(i.yazilabilir_kokler, [i.kopya_koku]);
  assert.ok(!path.resolve(i.kopya_koku).toLowerCase().startsWith(path.resolve(KOK).toLowerCase() + path.sep), "kopya kökü repo dışında");
  for (const parca of ["is/panelci", "0123456789abcdef", "panel/index.html", "abc1234def", "limit kartı güncellenir", "npm test", i.kopya_koku, "KIRMIZIYA DÖNDÜR"]) {
    assert.ok(i.gorev.includes(parca), parca);
  }
  assert.ok(!("owns" in i), "denetçinin OWNS'u yok; yazma yalnızca yazilabilir_kokler");
});

const PASS = { verdict: "PASS", gerekce: "merhaba.txt kabul tanımına uyuyor; commit geri alınınca test kırmızıya döndü, kanıt yeterli.",
  kanitlar: [{ iddia: "test yeşil", komut: "npm test", cikti_ozet: "1 pass" }, { iddia: "dosya var", komut: "type merhaba.txt", cikti_ozet: "merhaba" }],
  kirmiziya_dondu: [{ test: "merhaba var", geri_alinan: "abc1234", sonuc: "kirmizi" }], blockers: [] };
const VETO = { verdict: "VETO", gerekce: "commit geri alınınca test yeşil kaldı; test merhaba.txt içeriğini ölçmüyor, kabul karşılanmadı.",
  kanitlar: [{ iddia: "test yeşil kaldı", cikti_ozet: "1 pass" }], kirmiziya_dondu: [{ test: "merhaba var", geri_alinan: "abc1234", sonuc: "yesil-kaldi" }],
  blockers: [{ kod: "test_olcmuyor", ne: "test içeriği ölçmüyor", nerede: "test/merhaba.test.js", onem: "yuksek", oneri: "içerik assert'i ekle" }] };

function denetimDuzen(git: Partial<NonNullable<DenetimBaglam["git"]>> = {}) {
  const repo = path.join(GECICI, "sahte-repo"), kopya = path.join(GECICI, "sahte-kopya", "isci1-1");
  const olaylar: any[] = [], isciye: string[] = [], sefe: string[] = [], bilgi: string[] = [], ntfy: string[][] = [], kapanan: string[] = [], cagri: any[][] = [];
  let kapandi = 0;
  const isci = { id: "isci1", repo, dal: "is/isci1", worktree: path.join(repo, ".worktrees", "isci1"), brif_kabul: "merhaba.txt oluşturulur\nikinci satır", denetimde: true, owns: ["merhaba.txt"] };
  const b: DenetimBaglam = {
    denetci: "denetci-isci1", isci, degisen: ["merhaba.txt", "test/merhaba.test.js"], commitler: ["abc1234 feat: merhaba"], kopya_koku: kopya,
    duzeltmeSayisi: new Map(), cakismaSayisi: new Map(),
    yay: (o) => olaylar.push(o), isciye: (m) => isciye.push(m), sefe: (m) => sefe.push(m), sefeBilgi: (s) => bilgi.push(s), ntfy: (t, m) => ntfy.push([t, m]),
    kapat: () => { kapandi++; }, kapatBekle: async (id) => { kapanan.push(id); },
    git: {
      birlestir: async (...a) => { cagri.push(["birlestir", ...a]); return { durum: "tamam", sha: "f00dbabe0123" }; },
      worktreeKapat: async (...a) => { cagri.push(["worktreeKapat", ...a]); return { durum: "kapandi" }; },
      worktreeListesi: async () => [{ yol: repo, dal: "main", sha: "", kilitli: false }, { yol: isci.worktree, dal: "is/isci1", sha: "", kilitli: false },
        { yol: path.join(kopya, "m1"), dal: "", sha: "", kilitli: false }, { yol: `${kopya}-kardes`, dal: "", sha: "", kilitli: false }],
      kopyaKaldir: async (y) => { cagri.push(["kopyaKaldir", y]); return { durum: "kaldirildi" }; },
      ...git,
    },
  };
  return { b, isci, olaylar, isciye, sefe, bilgi, ntfy, kapanan, cagri, kapandi: () => kapandi };
}

test("denetim PASS → kod birleştirir (tamam): işçi ve denetçi kapanır, worktree + dal ve kopyalar kaldırılır, şefe tek satır", async () => {
  const d = denetimDuzen();
  const r = denetimIsle(PASS, d.b);
  assert.equal(r.hata, false, r.metin);
  assert.equal(d.kapandi(), 1, "denetçinin kutusu kapandı");
  await r.arka;
  const [bir, ...kalan] = d.cagri;
  assert.deepEqual(bir, ["birlestir", d.isci.repo, "is/isci1", "merge: isci1 (merhaba.txt oluşturulur)", ["merhaba.txt"]], "işçinin OWNS'u birleşmeye gider (K22)");
  assert.deepEqual(kalan, [["worktreeKapat", d.isci.repo, "isci1", { dalSil: true }], ["kopyaKaldir", path.join(d.b.kopya_koku, "m1")]],
    "işçi worktree'si dal silinerek kapandı; yalnızca kopya kökü altındaki kopya kaldırıldı");
  assert.ok(d.kapanan.includes("isci1") && d.kapanan.includes("denetci-isci1"), "worktree silinmeden önce iki oturum da kapandı (Windows cwd)");
  assert.deepEqual(d.olaylar.map((o) => o.tur), ["denetim", "sozlesme", "birlesme"]);
  const [den, soz, bir2] = d.olaylar;
  assert.deepEqual([den.ajan, den.isci, den.denetci, den.verdict, den.kirmiziya_dondu, den.blockers], ["denetci-isci1", "isci1", "denetci-isci1", "PASS", [{ test: "merhaba var", sonuc: "kirmizi" }], []]);
  assert.match(den.gerekce, /kabul tanımına uyuyor/);
  assert.equal(den.model, undefined, "model verilmezse olayda yok");
  const d2 = denetimDuzen(); d2.b.model = "ollama:zepul-gptoss-cpu:latest";
  await denetimIsle(PASS, d2.b).arka;
  assert.equal(d2.olaylar[0].model, "ollama:zepul-gptoss-cpu:latest", "yerel denetçinin modeli denetim olayında (panelde yerel rozet)");
  assert.equal(soz.sonraki_adim, "birlestiriciye");
  assert.deepEqual(bir2, { ajan: "isci1", tur: "birlesme", isci: "isci1", dal: "is/isci1", durum: "tamam", sha: "f00dbabe0123" });
  assert.deepEqual(d.sefe, ["[birleşme] isci1 main'e alındı (f00dbab): merhaba.txt oluşturulur"]);
  assert.equal(d.isciye.length + d.ntfy.length, 0);
});

test("birleşme OWNS dışı geçmiş yüzünden reddedilir (K22): şefe gerekçe, worktree kapanmaz, işçi açık", async () => {
  const d = denetimDuzen({ birlestir: async () => ({ durum: "owns-disi", hata: "dal geçmişinde OWNS dışı değişiklik: dis.txt; geri alınmış olsa da birleşmez", yollar: ["dis.txt"], commitler: [{ sha: "abc1234def5678", mesaj: "chore: OWNS dışı" }] }) });
  await denetimIsle(PASS, d.b).arka;
  // hata-avi-3 B7: commit konuları ve hata metni maskele()den geçer; 27.10.2026: genel sır kalıbı maskelenmez, panel belirteci (?t=) maskelenir.
  const sir = "ghp_AbCdEf1234567890XyZ", pnl = "?t=PanelBelirtec9";
  const d2 = denetimDuzen({ birlestir: async () => ({ durum: "owns-disi", hata: `OWNS dışı: ${sir} ${pnl}`, yollar: ["dis.txt"], commitler: [{ sha: "abc1234def5678", mesaj: `chore: anahtar ${sir} ${pnl}` }] }) });
  await denetimIsle(PASS, d2.b).arka;
  const o2 = d2.olaylar.at(-1);
  assert.ok(JSON.stringify(o2).includes(sir) && !JSON.stringify(o2).includes("PanelBelirtec9"), JSON.stringify(o2));
  assert.match(o2.commitler[0], /^abc1234 chore: anahtar /);
  assert.equal(d.isci.denetimde, false);
  assert.ok(!d.cagri.some((c) => c[0] === "worktreeKapat"), "worktree kapanmadı");
  assert.equal(d.sefe.length, 1);
  assert.match(d.sefe[0], /reddedildi \(isci1\).*dis\.txt/);
  assert.equal(d.olaylar.at(-1).durum, "owns-disi");
  const o = d.olaylar.at(-1);
  assert.deepEqual([o.yollar, o.commitler], [["dis.txt"], ["abc1234 chore: OWNS dışı"]], "olayda panel kartının beklediği alanlar");
  assert.match(o.hata, /dis\.txt/);
});

test("denetim VETO → düzeltme mesajı işçiye (denetçiye değil); iki turdan sonra şefe; birleştirme yok", async () => {
  const d = denetimDuzen();
  d.isci.owns = ["merhaba.txt", "test/**"]; // blocker test/merhaba.test.js OWNS içinde (K30: dışındaysa şefe)
  await denetimIsle(VETO, d.b).arka;
  assert.equal(d.isciye.length, 1);
  assert.match(d.isciye[0], /^Düzeltme turu 1\/2: blocker'lar: \[yuksek\] test içeriği ölçmüyor \(test\/merhaba\.test\.js\) → içerik assert'i ekle; \[yuksek\] test ölçmüyor: abc1234 geri alınınca yeşil kaldı/);
  assert.match(d.isciye[0], /Denetçi VETO verdi\. Düzelt, commit at, sozlesme_don ile yeniden dön\.$/);
  assert.equal(d.b.duzeltmeSayisi.get("isci1"), 1);
  assert.equal(d.isci.denetimde, false, "işçi yeniden sözleşme gönderebilir");
  assert.equal(d.sefe.length, 0, "ham denetim şefe gitmez");
  assert.equal(d.cagri.filter((c) => c[0] === "birlestir").length, 0);
  assert.equal(d.kapanan.includes("isci1"), false, "işçi açık kalır");
  assert.deepEqual(d.olaylar.map((o) => o.tur), ["denetim", "sozlesme"]);

  d.b.duzeltmeSayisi.set("isci1", 2);
  await denetimIsle(VETO, d.b).arka;
  assert.equal(d.isciye.length, 1);
  assert.equal(d.sefe.length, 1);
  assert.match(d.sefe[0], /VETO ve 2 düzeltme turu tükendi/);
});

// F3-2 (kabul faz2-3-birlesik): VETO → düzeltme turu işçiye → işçi yeniden TAMAM → kod yeni denetçi başlatır (zincir aynı işçi kaydında).
test("F3-2: VETO → işçiye düzeltme → yeniden TAMAM → yeni denetçi; PASS'te birleşir", async () => {
  const s = sozDuzen(), d = denetimDuzen();
  d.isci.owns = ["merhaba.txt", "test/**"];
  const denetlenen: any[] = [];
  const isci = Object.assign(d.isci, s.b.ajan, { id: d.isci.id, worktree: d.isci.worktree });
  const sb = { ...s.b, ajan: isci, duzeltmeSayisi: d.b.duzeltmeSayisi, denetciye: (v: any) => denetlenen.push(v) };
  isci.denetimde = false;
  await sozlesmeIsle(tamam, sb);
  assert.equal(denetlenen.length, 1, "ilk TAMAM → denetçi");
  await denetimIsle(VETO, d.b).arka;
  assert.match(d.isciye[0], /^Düzeltme turu 1\/2:/, "VETO işçiye düzeltme açar");
  const r = await sozlesmeIsle(tamam, sb);
  assert.match(r.metin, /denetçiyi başlatıyor/, r.metin);
  assert.equal(denetlenen.length, 2, "yeniden TAMAM → yeni denetçi");
  assert.equal(isci.denetimde, true);
  await denetimIsle(PASS, d.b).arka;
  assert.equal(d.cagri.filter((c) => c[0] === "birlestir").length, 1, "yeni denetimin PASS'i birleştirir");
  assert.equal(d.sefe.length, 1);
});

// K30 ek (a): yeniden denetimde önceki denetimin kararı ve gerekçesi yeni denetçiye girdi olur (aynı içeriğe tutarsız karar olmasın).
test("K30: yeniden denetimde önceki karar, gerekçe ve blocker'lar yeni denetçinin brifinde; ilk denetimde yok", async () => {
  const d = denetimDuzen(); d.isci.owns = ["merhaba.txt", "test/**"];
  await denetimIsle(VETO, d.b).arka;
  const onceki = (d.isci as any).onceki_denetim;
  assert.equal(onceki?.verdict, "VETO");
  assert.equal(onceki?.gerekce, VETO.gerekce);
  const fark = { dosyalar: ["merhaba.txt"], commitler: [] };
  const yeni = denetciIstegi({ ...d.isci, onceki_denetim: onceki } as any, tamam as any, fark, "abc");
  for (const parca of ["Önceki denetim", "VETO", VETO.gerekce, "test içeriği ölçmüyor"]) assert.ok(yeni.gorev.includes(parca), parca);
  assert.ok(!denetciIstegi({ ...d.isci, onceki_denetim: undefined }, tamam as any, fark, "abc").gorev.includes("Önceki denetim"), "ilk denetimde önceki karar yok");
  const p = denetimDuzen();
  await denetimIsle(PASS, p.b).arka;
  assert.equal((p.isci as any).onceki_denetim?.verdict, "PASS", "PASS de kaydedilir (çakışma sonrası yeniden denetim)");
});

// K30 ek (b): VETO'nun istediği düzeltme işçinin OWNS'u dışındaysa düzeltme turu açılmaz, şefe gider (iş çıkmaza girmez).
test("K30: VETO blocker'ı OWNS dışı yol içeriyorsa düzeltme işçiye değil şefe; OWNS içiyse işçiye", async () => {
  const d = denetimDuzen(); // owns ["merhaba.txt"], VETO blocker nerede test/merhaba.test.js
  await denetimIsle(VETO, d.b).arka;
  assert.equal(d.isciye.length, 0, "düzeltme turu açılmadı");
  assert.equal(d.sefe.length, 1);
  assert.match(d.sefe[0], /OWNS dışı.*test\/merhaba\.test\.js/);
  assert.equal(d.b.duzeltmeSayisi.get("isci1"), undefined);
  assert.equal(d.isci.denetimde, false);
  assert.equal(d.olaylar.find((o) => o.tur === "sozlesme").sonraki_adim, "sefe");
  const ic = denetimDuzen(); ic.isci.owns = ["merhaba.txt", "test/**"];
  await denetimIsle({ ...VETO, blockers: [{ ...VETO.blockers[0], nerede: "test\\merhaba.test.js" }] }, ic.b).arka;
  assert.equal(ic.isciye.length, 1, "OWNS içi (ters bölü de) → işçiye");
  assert.equal(ic.sefe.length, 0);
});

// av15 (hata-avi-15 B4/B5): belirteç ayrıştırması belirlenimci; satır/çapa sonekleri atılır, kökteki çıplak ad yalnız worktree'de varsa yol sayılır.
test("av15: ownsDisiYollar tablo: dosya:satır, #L, tipografik kesme, kökteki ad; oran ve şemasız adres yol değil", () => {
  const wt = path.join(GECICI, "owns-tablo");
  fs.mkdirSync(wt, { recursive: true });
  for (const f of ["package.json", "KURALLAR.md"]) fs.writeFileSync(path.join(wt, f), "x");
  const tablo: [string, string[], string[]?][] = [
    ["[orta] eksik (sunucu/kapi.ts:443) → düzelt", ["sunucu/kapi.ts"]],
    ["sunucu/kapi.ts:443:7 ve test/a.test.ts:12-20", ["sunucu/kapi.ts", "test/a.test.ts"]],
    ["sunucu/kapi.ts#L12 ile sunucu/yol.ts#L3-L9", ["sunucu/kapi.ts", "sunucu/yol.ts"]],
    ["sunucu/kapi.ts’de kural ‘sunucu/yol.ts’", ["sunucu/kapi.ts", "sunucu/yol.ts"]],
    ["package.json betiği eksik", ["package.json"]],
    ["KURALLAR.md F maddesi.", ["KURALLAR.md"]],
    ["package.json eksik", [], ["docs/**", "package.json"]],
    ["docs/a.md:3 eksik, docs/b.md#L2", []],
    ["oran 1.5/2.0 düşük, sürüm 2.51/3.0, kesir 3/2.5", []],
    ["github.com/foo/bar.git ve www.example.com/a.html bak", []],
    ["https://x.com/a.ts", []],
    ["ör. e.g. vs. yok.json README.md", []],
    ["../zepul-ai/a.ts", ["../zepul-ai/a.ts"]],
  ];
  for (const [metin, beklenen, owns = ["docs/**"]] of tablo) assert.deepEqual(ownsDisiYollar([metin], { worktree: wt, owns }), beklenen, metin);
});

test("birleştirme çakışması → işçiye 'git merge main' talimatı, işçi açık; iki kez sonra şefe; kirli-ana → şefe bilgi + ntfy", async () => {
  const d = denetimDuzen({ birlestir: async () => ({ durum: "cakisma", cakisan: ["ortak.txt"] }) });
  await denetimIsle(PASS, d.b).arka;
  assert.equal(d.isciye.length, 1);
  assert.match(d.isciye[0], /çakışma \(1\/2\): ortak\.txt/);
  assert.match(d.isciye[0], /main'i dalına al \(git merge main\), çakışmayı çöz, commit at, sozlesme_don TAMAM/);
  assert.deepEqual(d.olaylar.at(-1), { ajan: "isci1", tur: "birlesme", isci: "isci1", dal: "is/isci1", durum: "cakisma", cakisan: ["ortak.txt"] });
  assert.equal(d.cagri.filter((c) => c[0] === "worktreeKapat").length, 0);
  assert.equal(d.kapanan.includes("isci1"), false);
  assert.equal(d.isci.denetimde, false);
  await denetimIsle(PASS, d.b).arka;
  await denetimIsle(PASS, d.b).arka;
  assert.equal(d.isciye.length, 2);
  assert.equal(d.sefe.length, 1);
  assert.match(d.sefe[0], /2 kez çakıştı/);

  const k = denetimDuzen({ birlestir: async () => ({ durum: "kirli-ana" }) });
  await denetimIsle(PASS, k.b).arka;
  assert.equal(k.bilgi.length, 1);
  assert.match(k.bilgi[0], /isci1 main'e alınamadı: kirli-ana/);
  assert.deepEqual(k.ntfy, [["Zepul OS: uyarı: birleştirme yapılamadı", "isci1 dalı main'e alınamadı (kirli-ana)"]]);
  assert.equal(k.sefe.length + k.isciye.length, 0);
});

test("denetim geçersiz → araç hatası, olay yok, denetçi açık; kod değişikliğinde 'uygulanamadi' PASS'i taşımaz", () => {
  const d = denetimDuzen();
  const r = denetimIsle({ ...PASS, gerekce: "kısa" }, d.b);
  assert.equal(r.hata, true);
  assert.match(r.metin, /^Denetim geçersiz: gerekce/);
  assert.equal(r.arka, undefined);
  assert.equal(d.kapandi(), 0);
  assert.equal(d.olaylar.length, 0);
  d.b.degisen = ["sunucu/a.ts"];
  const r2 = denetimIsle({ ...PASS, kirmiziya_dondu: [{ test: "t", geri_alinan: "x", sonuc: "uygulanamadi", not: "doküman" }] }, d.b);
  assert.match(r2.metin, /'uygulanamadi' yetmez/);
});

test("uçtan uca (gerçek git): worktree'de commit + main'i dala alma → TAMAM → denetçi isteği → sahte PASS → main'de birleşme commit'i", async () => {
  const repo = yeniDepo("e2e");
  const v = brifDogrula(brif({ ad: "e2e", owns: ["merhaba.txt"], kabul: "merhaba.txt oluşturulur ve commit'lenir" }), new Map());
  assert.ok(v.gecerli);
  let istek: any;
  await brifliBaslat(v.brif, { repo, kurallar: "", ajanBaslat: (i) => { istek = i; } });
  const wt: string = istek.cwd;
  const baz = await bazAl(wt);
  fs.writeFileSync(path.join(wt, "merhaba.txt"), "merhaba\n");
  gitK(wt, "add", "merhaba.txt");
  gitK(wt, "commit", "-q", "-m", "feat: merhaba");
  // main bu arada ilerledi, işçi main'i dalına aldı: merge-base'e göre yalnızca kendi işi sayılır (OWNS dışı baska.txt ret sebebi değil)
  fs.writeFileSync(path.join(repo, "baska.txt"), "başka işçinin işi\n");
  gitK(repo, "add", "baska.txt");
  gitK(repo, "commit", "-q", "-m", "başka iş");
  gitK(wt, "merge", "-q", "--no-edit", "main");

  const ajan: any = { id: "e2e", rol: "isci", worktree: wt, owns: istek.owns, baz };
  let denetlenen: any;
  const sb = { ajan, yay: () => {}, duzeltmeSayisi: new Map(), kendine: () => {}, sefe: () => assert.fail("şefe gitmez"), kapat: () => assert.fail("işçi kutusu kapanmaz"),
    degisiklik: dalDegisiklikleri, denetciye: (x: any) => { denetlenen = x; } };
  const r = await sozlesmeIsle({ verdict: "TAMAM", blockers: [], commits: [gitK(wt, "rev-parse", "--short", "HEAD")], ozet: "merhaba.txt eklendi" }, sb);
  assert.equal(r.hata, false, r.metin);
  const eski = await sozlesmeIsle({ verdict: "TAMAM", blockers: [], commits: [], ozet: "x" }, { ...sb, ajan: { ...ajan, denetimde: false }, degisiklik: undefined, denetciye: () => {} });
  assert.match(eski.metin, /OWNS dışı değişiklik: baska\.txt/, "baz_sha..HEAD olsaydı main'den gelen dosya işçiye yazılırdı");

  const fark = await dalFarki(repo, "is/e2e");
  assert.deepEqual(fark.dosyalar, ["merhaba.txt"]);
  const di = denetciIstegi({ id: "e2e", dal: "is/e2e", worktree: wt, brif_kabul: istek.brif_kabul }, denetlenen, fark, await mergeBase(repo, "is/e2e"));
  gitK(wt, "worktree", "add", "--detach", path.join(di.kopya_koku, "m1"), "is/e2e"); // sahte denetçinin mutasyon kopyası (temiz)

  const olaylar: any[] = [], sefe: string[] = [];
  const dr = denetimIsle(PASS, { denetci: di.ad, isci: { ...ajan, repo, dal: "is/e2e", brif_kabul: istek.brif_kabul }, degisen: fark.dosyalar,
    commitler: fark.commitler.map((c) => c.sha), kopya_koku: di.kopya_koku, duzeltmeSayisi: new Map(), cakismaSayisi: new Map(),
    yay: (o) => olaylar.push(o), isciye: () => assert.fail("işçiye mesaj gitmez"), sefe: (m) => sefe.push(m), sefeBilgi: () => {}, ntfy: () => {},
    kapat: () => {}, kapatBekle: async () => {} });
  await dr.arka;

  const [baslik, ebeveyn] = gitK(repo, "log", "-1", "--format=%s%n%P").split("\n");
  assert.equal(baslik, "merge: e2e (merhaba.txt oluşturulur ve commit'lenir)");
  assert.equal(ebeveyn.split(" ").length, 2, "main'de iki ebeveynli birleşme commit'i");
  assert.equal(fs.readFileSync(path.join(repo, "merhaba.txt"), "utf8"), "merhaba\n");
  assert.deepEqual(olaylar.find((o) => o.tur === "birlesme"), { ajan: "e2e", tur: "birlesme", isci: "e2e", dal: "is/e2e", durum: "tamam", sha: gitK(repo, "rev-parse", "HEAD") });
  assert.match(sefe[0], /^\[birleşme\] e2e main'e alındı/);
  assert.equal(fs.existsSync(wt), false, "işçi worktree'si kaldırıldı");
  assert.throws(() => gitK(repo, "rev-parse", "--verify", "--quiet", "refs/heads/is/e2e"), Error, "birleşen dal silindi (branch -d)");
  assert.equal(fs.existsSync(di.kopya_koku), false, "temiz denetim kopyası ve boş kopya kökü kaldırıldı");
  assert.equal(gitK(repo, "status", "--porcelain", "--untracked-files=all"), "", "ana ağaç temiz");
  assert.equal(gitK(repo, "worktree", "list", "--porcelain").match(/^worktree /gm)!.length, 1, "yalnız ana ağaç kaldı");
});

// ---------- Kapanış: açık worktree'ler silinmez (C) ----------

test("kapanış: açık worktree'ler silinmez, listesi döner (ana ağaç hariç, tekrarlanan ve okunamayan depo sorun değil)", async () => {
  const repo = yeniDepo("kapanis");
  const w = await worktreeAc(repo, "acik-is");
  const l = await acikWorktreeler([repo, repo, path.join(GECICI, "depo-degil")]);
  assert.deepEqual(l.map((x) => [x.dal, path.basename(x.yol)]), [["is/acik-is", "acik-is"]]);
  assert.match(l[0].sha, /^[0-9a-f]{40}$/);
  assert.ok(fs.existsSync(w.yol), "worktree yerinde");
});

test("kapanış: worktree bayrakları birlesmis/temiz (geçici depo); hiçbiri silinmez", async () => {
  const repo = yeniDepo("kapanis-bayrak");
  const biten = await worktreeAc(repo, "biten"), kirli = await worktreeAc(repo, "kirli"), ileri = await worktreeAc(repo, "ileri");
  fs.writeFileSync(path.join(kirli.yol, "yeni.txt"), "x");
  fs.writeFileSync(path.join(ileri.yol, "f.txt"), "x");
  gitK(ileri.yol, "add", "f.txt");
  gitK(ileri.yol, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "ileri");
  const l = Object.fromEntries((await acikWorktreeler([repo])).map((x) => [path.basename(x.yol), [x.birlesmis, x.temiz]]));
  assert.deepEqual(l, { biten: [true, true], kirli: [true, false], ileri: [false, true] });
  for (const w of [biten, kirli, ileri]) assert.ok(fs.existsSync(w.yol), "silinmedi");
});

test("denetim PASS ama birleştirme fırlatırsa da denetçi kopyası kaldırılır; kopyaKaldir'a kopya kökü verilir (K17)", async () => {
  const kaldirilan: any[][] = [];
  const d = denetimDuzen({ birlestir: async () => { throw new Error("git çöktü"); }, kopyaKaldir: async (...a) => { kaldirilan.push(a); return { durum: "kaldirildi" }; } });
  await assert.rejects(denetimIsle(PASS, d.b).arka!, /git çöktü/);
  assert.deepEqual(kaldirilan, [[path.join(d.b.kopya_koku, "m1"), d.isci.repo, d.b.kopya_koku]]);
});

test("kapanış ve açılış: denetim kökü altındaki kirli denetçi kopyaları kaldırılır; işçi worktree'si ve kök dışı kopya korunur (K25)", async () => {
  const repo = yeniDepo("k25");
  const kok = path.join(GECICI, "k25 ayar", "denetim");
  const m1 = path.join(kok, "isci-1", "m1"), m2 = path.join(kok, "isci-2", "m1");
  for (const m of [m1, m2]) { gitK(repo, "worktree", "add", "--detach", m, "HEAD"); fs.writeFileSync(path.join(m, "ortak.txt"), "mutasyon\n"); }
  const w = await worktreeAc(repo, "isci");
  fs.writeFileSync(path.join(w.yol, "taslak.txt"), "iş\n");
  const dis = path.join(GECICI, "k25 dış kopya");
  gitK(repo, "worktree", "add", "--detach", dis, "HEAD");
  fs.writeFileSync(path.join(dis, "x.txt"), "x\n");
  const olaylar: any[] = [], yay = (o: unknown) => void olaylar.push(o);
  await denetimKopyalariniTemizle([repo, repo], kok, yay);
  const liste = gitK(repo, "worktree", "list", "--porcelain").replaceAll("\\", "/").toLowerCase();
  assert.ok(!liste.includes("k25 ayar"), "git worktree list'te denetçi kopyası kalmamalı");
  for (const m of [m1, m2]) assert.equal(fs.existsSync(path.dirname(m)), false, "kopya ve boşalan kopya kökü diskte kalmamalı");
  assert.equal(fs.readFileSync(path.join(w.yol, "taslak.txt"), "utf8"), "iş\n", "dallı işçi worktree'sine dokunulmaz");
  assert.ok(fs.existsSync(path.join(dis, "x.txt")), "kök dışındaki kopya korunur");
  assert.deepEqual(olaylar, []);
  await denetimKopyalariniTemizle([repo], path.join(GECICI, "k25 yok"), yay); // kök yoksa sessiz
  assert.deepEqual(olaylar, []);
  assert.equal(denetimKoku(), path.join(process.env.ZEPUL_AYAR_DIZIN!, "denetim"), "kopya kökleri ayar dizinindeki denetim/ altında");
});

// Sahte oturum: kutu kapanınca (ya da interrupt'ta) süreç turu `gecikme` ms'de bitirir, son result'ı (maliyet) verir ve biter.
// close() bundan önce gelirse süreç ölür, result hiç gelmez (canlıdaki K24 kaybı).
function sahteOturum(gecikme: number, usd: number) {
  const m = maliyetSayaci(), olaylar: number[] = [];
  m.yeniOturum();
  const q = { kapandi: false, close() { this.kapandi = true; }, interrupt: async () => void sonla() };
  const a: { kutu: { close(): void }; q?: typeof q; oturumBitti?: boolean } = { kutu: { close: () => void sonla() }, q, oturumBitti: false };
  let basladi = false;
  function sonla() {
    if (basladi) return;
    basladi = true;
    setTimeout(() => { if (!q.kapandi) { olaylar.push(m.oturumUsd(usd)); a.oturumBitti = true; } }, gecikme);
  }
  return { a, q, m, olaylar };
}

test("oturumuBitir: VETO sonrası hızlı yeniden denetimde önceki oturumun son maliyeti sayılır, yeni oturum ondan sonra açılır (K24)", async () => {
  const s = sahteOturum(150, 0.4);
  assert.equal(await oturumuBitir(s.a, 5000), true, "oturum kendiliğinden bitti");
  assert.equal(s.q.kapandi, false, "bitmeden zorla kapatılmadı");
  assert.deepEqual(s.olaylar, [0.4], "ilk denetimin maliyet olayı yayıldı");
  s.m.yeniOturum(); // aynı kayıtta ikinci denetim
  assert.equal(Math.round(s.m.oturumUsd(0.3) * 1e6) / 1e6, 0.7, "denetçi toplamı iki oturumun toplamı");
});

test("oturumuBitir: kapanışta interrupt sonrası son result beklenir; süre dolarsa zorla kapatılır (K24)", async () => {
  const s = sahteOturum(150, 0.25);
  assert.equal(await oturumuBitir(s.a, 3000, true), true);
  assert.deepEqual(s.olaylar, [0.25], "kapanışta kesilen denetçinin maliyeti kaybolmaz");
  const t = sahteOturum(5000, 1);
  const bas = Date.now();
  assert.equal(await oturumuBitir(t.a, 200), false);
  assert.ok(t.q.kapandi && Date.now() - bas < 2000, "süre sınırında zorla kapatılır");
  assert.equal(await oturumuBitir({ kutu: { close() {} } }, 200), true, "oturumu olmayan ajan beklenmez");
});

test("bekçi: denetçinin maliyet olayı maliyet hızına girer, sınır aşılınca denetçi de durdurulur (K24)", () => {
  const d = bekciDuzen();
  d.ajanlar.set("denetci-isci1", { durum: "calisiyor" });
  d.besle({ ajan: "denetci-isci1", tur: "maliyet", maliyet_usd: 3.5 });
  assert.deepEqual(d.kesilen, ["denetci-isci1"]);
  assert.match(d.ntfy[0][1], /denetci-isci1: bekçi kuralı maliyet-hizi/);
});

test("kapanış: denetçinin kendi temizliği kapanış temizliğiyle yarışırsa kopya yoksa başarıdır, hata olayı çıkmaz (K28)", async () => {
  const repo = yeniDepo("k28");
  const kok = path.join(GECICI, "k28 ayar", "denetim"), kopya = path.join(kok, "isci-1");
  for (const m of ["m1", "m2"]) { gitK(repo, "worktree", "add", "--detach", path.join(kopya, m), "HEAD"); fs.writeFileSync(path.join(kopya, m, "ortak.txt"), "mutasyon\n"); }
  const olaylar: any[] = [], yay = (o: unknown) => void olaylar.push(o);
  // Gerçek git: iki temizlik aynı anda (denetçinin vazgec/finally temizliği + kapanış).
  await Promise.all([kopyaTemizle({ denetci: "denetci-isci-1", isci: { repo }, kopya_koku: kopya, yay }), denetimKopyalariniTemizle([repo], kok, yay)]);
  assert.ok(!gitK(repo, "worktree", "list", "--porcelain").toLowerCase().includes("k28 ayar"), "kopyalar kaldırıldı");
  assert.deepEqual(olaylar, [], "kopya yoksa kopya-kaldirilamadi olayı yok");
  // Sahte git: liste kopyayı gösterir, kaldırma sırasında başkası siler ("yok" ya da git hatası); yeniden listede yoksa başarı.
  const ana = { yol: repo, dal: "main", sha: "" }, w = { yol: path.join(kopya, "m1"), dal: "", sha: "" };
  for (const kaldir of [async () => ({ durum: "yok" as const }), async () => { throw new Error("is not a working tree"); }]) {
    let n = 0;
    await kopyaTemizle({ denetci: "d", isci: { repo }, kopya_koku: kopya, yay, git: { worktreeListesi: async () => (n++ ? [ana] : [ana, w]) as any, kopyaKaldir: kaldir } });
  }
  assert.deepEqual(olaylar, []);
  // Gerçekten kalan kopya yine bildirilir.
  await kopyaTemizle({ denetci: "d", isci: { repo }, kopya_koku: kopya, yay, git: { worktreeListesi: async () => [ana, w] as any, kopyaKaldir: async () => ({ durum: "kirli" as const }) } });
  assert.deepEqual(olaylar.map((o: any) => o.tur_adi), ["kopya-kaldirilamadi"]);
});

test("kapanış: interrupt'ın tur sonucu (error_during_execution) hata ve durum 'hata' sayılmaz, maliyet kalır (K28)", () => {
  const m = { type: "result", subtype: "error_during_execution", is_error: true, total_cost_usd: 0.2, errors: ["interrupted"] };
  const olaylar = sdkMesajiOlaya("denetci-isci1", m);
  assert.deepEqual(olaylar.filter((o) => !kapanisSonucuMu(m, o)).map((o) => o.tur), ["maliyet"]);
  const tamam = { type: "result", subtype: "success", is_error: false, total_cost_usd: 0.1 };
  assert.deepEqual(sdkMesajiOlaya("a", tamam).filter((o) => !kapanisSonucuMu(tamam, o)).map((o) => o.tur), ["maliyet", "durum"]);
});

test("kapanış: şefe iletim denenmez, birleşme bilgisi 'bilgi' olayı olur, hata olayı çıkmaz (K28 yan)", () => {
  const olaylar: any[] = [];
  const yay = (o: any) => olaylar.push(o);
  let denendi = 0;
  const ilet = () => { denendi++; return false; };
  sefeYazIsle("sunucu", "isci1 main'e birleşti", { kapaniyor: true, ilet, yay });
  assert.equal(denendi, 0, "kapanışta şefe iletim denenmez");
  assert.deepEqual(olaylar.map((o) => o.tur), ["bilgi"]);
  assert.match(olaylar[0].mesaj, /birleşti/);
  // Kapanış yokken kapalı şef yine hatadır; şef yoksa (--sef-yok) sessiz.
  olaylar.length = 0;
  sefeYazIsle("sunucu", "x", { kapaniyor: false, ilet, yay });
  assert.deepEqual([denendi, olaylar.map((o) => o.tur_adi)], [1, ["sefe_iletilemedi"]]);
  olaylar.length = 0;
  sefeYazIsle("sunucu", "x", { kapaniyor: true, ilet: null, yay });
  sefeYazIsle("sunucu", "x", { kapaniyor: false, ilet: () => true, yay });
  assert.deepEqual(olaylar, []);
});

test("hamHata: bilinen ham hata kalıpları Türkçe tek cümleye çevrilir, ham metin ayrıntıya gider", () => {
  assert.deepEqual(hamHata("error_during_execution: [ede_diagnostic] result_type=user"), { mesaj: "ajan turu kesildi", ayrinti: "error_during_execution: [ede_diagnostic] result_type=user" });
  assert.equal(hamHata("Claude Code process exited with code 1").mesaj, "ajan süreci kapandı (kod 1)");
  assert.equal(hamHata("Traceback (most recent call last):\n  File x\nValueError: kötü\n").mesaj, "ValueError: kötü");
  assert.equal(hamHata("bağlam yetersiz, OLLAMA_CONTEXT_LENGTH=32768 gerekli").mesaj, "yerel modelin bağlamı yetersiz; ayarlardan bağlamı yükselt");
  assert.deepEqual(hamHata("başka bir hata"), { mesaj: "başka bir hata" });
});
