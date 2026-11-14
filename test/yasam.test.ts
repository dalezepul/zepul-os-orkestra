import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { kirliDosyalar, sonCommit, stopKarari, stopHook, olumAdaylari, diriltmePlani, degisiklikler, ownsAyir, calistir } from "../sunucu/yasam.ts";

test("stopKarari: temiz ağaç engellenmez", () => {
  assert.deepEqual(stopKarari([], 0), { engelle: false, neden: "çalışma ağacı temiz" });
  assert.equal(stopKarari([], 5).engelle, false);
});

test("stopKarari: kirli ağaç iki kez engellenir", () => {
  const kirli = ["a.ts", "b.ts", "c.ts", "d.ts", "e.ts", "f.ts"];
  for (const n of [0, 1]) {
    const k = stopKarari(kirli, n);
    assert.equal(k.engelle, true);
    assert.equal(k.neden, "Commit edilmemiş 6 dosya var (ilk 5): a.ts, b.ts, c.ts, d.ts, e.ts. Commit at, sonra bitir.");
    assert.equal(k.hata, undefined);
  }
});

test("stopKarari: iki engelden sonra döngü kırılır, hata üretilir", () => {
  const k = stopKarari(["a.ts"], 2);
  assert.equal(k.engelle, false);
  assert.deepEqual({ ...k.hata, mesaj: undefined }, { kaynak: "ajan", tur_adi: "kirli-agacla-bitti", mesaj: undefined,
    geri_alinabilir: true, devam_edilebilir: true, oneri: "şef işçiye commit için diriltme mesajı göndersin" });
  assert.equal(stopKarari(["a.ts"], 7).engelle, false);
});

test("olumAdaylari: sınır değerleri ve yalnızca calisiyor", () => {
  const simdi = 1_000_000, esik = 600_000;
  const ajanlar = [
    { id: "tam-esik", durum: "calisiyor", son_olay_ts: simdi - esik },
    { id: "esik-alti", durum: "calisiyor", son_olay_ts: simdi - esik + 1 },
    { id: "cok-eski", durum: "calisiyor", son_olay_ts: 0 },
    { id: "bekliyor", durum: "bekliyor", son_olay_ts: 0 },
    { id: "bitti", durum: "bitti", son_olay_ts: 0 },
    { id: "olu", durum: "olu", son_olay_ts: 0 },
    { id: "hata", durum: "hata", son_olay_ts: 0 },
  ];
  assert.deepEqual(olumAdaylari(ajanlar, simdi, esik), ["tam-esik", "cok-eski"]);
  assert.deepEqual(olumAdaylari([], simdi, esik), []);
});

test("olumAdaylari: açık araç çağrısı olan ajan için eşik en az 15 dk (F4)", () => {
  const esik = 20_000, simdi = 100_000_000;
  const a = (id: string, sessizMs: number, acikArac: number) => ({ id, durum: "calisiyor", son_olay_ts: simdi - sessizMs, acikArac });
  assert.deepEqual(olumAdaylari([a("uzun-arac", 21_000, 1), a("aracsiz", 21_000, 0)], simdi, esik), ["aracsiz"], "21 sn: açık araçlı aday değil");
  assert.deepEqual(olumAdaylari([a("uzun-arac", 16 * 60_000, 1)], simdi, esik), ["uzun-arac"], "16 dk: aday");
  assert.deepEqual(olumAdaylari([a("uzun-arac", 14 * 60_000, 2)], simdi, esik), [], "14 dk: henüz değil");
  // Normal eşik 15 dk'dan büyükse o geçerli: max(esik, 15 dk).
  assert.deepEqual(olumAdaylari([a("uzun-arac", 16 * 60_000, 1)], simdi, 20 * 60_000), [], "eşik 20 dk ise 16 dk yetmez");
});

test("diriltmePlani: üç dal", () => {
  const sha = "0123456789abcdef0123456789abcdef01234567";
  const m = diriltmePlani({ deneme: 0, oturumBitti: false, sessionId: "s-1", sonOzet: "testler yazılıyor", sha, kirli: ["a", "b"] });
  assert.equal(m.eylem, "mesaj");
  assert.equal(m.mesaj, "Diriltme (deneme 1/3): kaldığın yer: testler yazılıyor. Son commit: 0123456. Kirli dosya: 2. " +
    "Önce hasarı kontrol et (git status, git log -3), commit'lenmemiş işi kaybetme, sonra kaldığın yerden devam et.");

  const r = diriltmePlani({ deneme: 2, oturumBitti: true, sessionId: "s-1", kirli: [] });
  assert.equal(r.eylem, "resume");
  assert.match(r.mesaj!, /^Diriltme \(deneme 3\/3\): kaldığın yer: bilinmiyor\. Son commit: yok\. Kirli dosya: 0\./);
  assert.match(r.neden, /s-1/);

  // Oturum bitti ama session_id yok → mesaj (yeni oturum)
  assert.equal(diriltmePlani({ deneme: 1, oturumBitti: true, kirli: [] }).eylem, "mesaj");

  for (const deneme of [3, 4]) {
    const v = diriltmePlani({ deneme, oturumBitti: true, sessionId: "s-1", sha, kirli: [] });
    assert.equal(v.eylem, "vazgec");
    assert.equal(v.mesaj, undefined);
  }
});

// ---------- Gerçek git ile ----------

const KOK = fs.mkdtempSync(path.join(process.env.YASAM_TEST_DIZIN || os.tmpdir(), "yasam-"));
after(() => fs.rmSync(KOK, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));
const g = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-c", "user.name=yasam-test", "-c", "user.email=yasam@test.yerel", "-c", "commit.gpgsign=false", ...args], { cwd, shell: false, encoding: "utf8" });

test("kirliDosyalar ve sonCommit: gerçek depo", async () => {
  const d = path.join(KOK, "depo");
  fs.mkdirSync(d);
  g(d, "init", "-q");
  assert.equal(await sonCommit(d), null, "commit yokken null");
  assert.deepEqual(await kirliDosyalar(d), []);

  fs.writeFileSync(path.join(d, "a.txt"), "1");
  fs.writeFileSync(path.join(d, "eski.txt"), "yeniden adlandırılacak");
  assert.deepEqual((await kirliDosyalar(d)).sort(), ["a.txt", "eski.txt"]);

  g(d, "add", "a.txt", "eski.txt");
  g(d, "commit", "-q", "-m", "feat: ilk çiğ öğe");
  assert.deepEqual(await kirliDosyalar(d), []);
  const c = await sonCommit(d);
  assert.match(c!.sha, /^[0-9a-f]{40}$/);
  assert.equal(c!.mesaj, "feat: ilk çiğ öğe");

  fs.writeFileSync(path.join(d, "a.txt"), "2");
  fs.writeFileSync(path.join(d, "şöğüç ı.txt"), "türkçe ad");
  g(d, "mv", "eski.txt", "yeni.txt");
  assert.deepEqual((await kirliDosyalar(d)).sort(), ["a.txt", "yeni.txt", "şöğüç ı.txt"]);
});

test("sonCommit: depo olmayan klasörde hata fırlatır", async () => {
  const d = path.join(KOK, "depo-degil");
  fs.mkdirSync(d);
  await assert.rejects(sonCommit(d));
  await assert.rejects(kirliDosyalar(d));
});

test("stopHook: SDK çıktı biçimi, sayaç ve olaylar", async () => {
  const d = path.join(KOK, "hook");
  fs.mkdirSync(d);
  g(d, "init", "-q");
  fs.writeFileSync(path.join(d, "x.txt"), "kirli");

  const olaylar: any[] = [];
  const sayac = new Map<string, number>();
  const hook = stopHook(() => d, sayac, (o) => olaylar.push(o));
  const opt = { signal: new AbortController().signal };
  const girdi = (aktif: boolean) => ({ hook_event_name: "Stop", session_id: "s1", transcript_path: "", cwd: d, stop_hook_active: aktif }) as any;

  const b1 = await hook(girdi(false), undefined, opt);
  assert.deepEqual(b1, { decision: "block", reason: "Commit edilmemiş 1 dosya var (ilk 5): x.txt. Commit at, sonra bitir." });
  assert.equal((await hook(girdi(true), undefined, opt) as any).decision, "block");
  assert.deepEqual(await hook(girdi(true), undefined, opt), {}, "üçüncüde bırakır");
  assert.deepEqual(olaylar.map((o) => o.tur), ["kapi", "kapi", "hata"]);
  assert.deepEqual([olaylar[0].karar, olaylar[0].alt_karar], ["red", "red"]);
  assert.equal(olaylar[2].tur_adi, "kirli-agacla-bitti");

  // Yeni bitirme zinciri (stop_hook_active=false) sayacı sıfırlar.
  assert.equal((await hook(girdi(false), undefined, opt) as any).decision, "block");

  g(d, "add", "x.txt");
  g(d, "commit", "-q", "-m", "x");
  assert.deepEqual(await hook(girdi(true), undefined, opt), {});
  assert.equal(sayac.has("s1"), false, "temiz ağaçta sayaç silinir");

  // git okunamazsa engellemez, hata olayı yazar.
  const olaylar2: any[] = [];
  const bozuk = stopHook(() => path.join(KOK, "yok-boyle-klasor"), new Map(), (o) => olaylar2.push(o));
  assert.deepEqual(await bozuk(girdi(false), undefined, opt), {});
  assert.equal(olaylar2[0].tur_adi, "git-status-okunamadi");
});

test("stopHook: OWNS verilince yalnızca OWNS içindeki kirli dosya engeller (F7)", async () => {
  const d = path.join(KOK, "owns-hook");
  fs.mkdirSync(path.join(d, "docs"), { recursive: true });
  g(d, "init", "-q");
  fs.writeFileSync(path.join(d, "veri.txt"), "başkasının işi");
  const olaylar: any[] = [];
  const hook = stopHook(() => d, new Map(), (o) => olaylar.push(o), ["docs/**"]);
  const opt = { signal: new AbortController().signal };
  const girdi = { hook_event_name: "Stop", session_id: "s2", transcript_path: "", cwd: d, stop_hook_active: false } as any;
  assert.deepEqual(await hook(girdi, undefined, opt), {}, "OWNS dışı kirli dosya engellemez");
  assert.equal(olaylar.length, 0);
  fs.writeFileSync(path.join(d, "docs", "a.md"), "kendi işi");
  const r: any = await hook(girdi, undefined, opt);
  assert.equal(r.decision, "block");
  assert.equal(r.reason, "Commit edilmemiş 1 dosya var (ilk 5): docs/a.md. Commit at, sonra bitir.");
});

test("degisiklikler + ownsAyir: alt klasör cwd'sinde OWNS cwd'ye göre, git yolları depo köküne göre (F7)", async () => {
  const d = path.join(KOK, "altcwd");
  fs.mkdirSync(path.join(d, "alt", "docs"), { recursive: true });
  g(d, "init", "-q");
  fs.writeFileSync(path.join(d, "alt", "docs", "a.md"), "1");
  fs.writeFileSync(path.join(d, "kok.txt"), "1");
  const c = await degisiklikler(path.join(d, "alt"));
  assert.deepEqual(c.kirli.sort(), ["alt/docs/a.md", "kok.txt"], "untracked klasör dosya dosya listelenir");
  assert.deepEqual(ownsAyir(c, c.kirli, ["docs/**"]), [["alt/docs/a.md"], ["kok.txt"]]);
  assert.deepEqual(ownsAyir(c, c.kirli, undefined), [["alt/docs/a.md", "kok.txt"], []], "OWNS yoksa hepsi içeride");
});

test("calistir: zaman aşımında çocuk ve torun birlikte ölür (W9)", { skip: process.platform !== "win32" && "ağaç öldürme yalnız Windows'ta" }, async () => {
  // Torun çocuğun stdout'unu miras alır: yalnız çocuk ölseydi boru kapanmaz, torun 60 sn yaşardı.
  // detached: libuv node çocuklarını kill-on-close job'a koyar (çocuk ölünce torun da ölür, test bir şey ölçmez);
  // git.exe'nin çocukları o job'da değildir. detached torun job dışında kalır, gerçek durumu taklit eder.
  const pidDosya = path.join(KOK, "pid.txt");
  const torun = "setTimeout(()=>{},60000)";
  const cocuk = `const t=require("child_process").spawn(process.execPath,["-e",${JSON.stringify(torun)}],{stdio:"inherit",detached:true});` +
    `require("fs").writeFileSync(${JSON.stringify(pidDosya)},process.pid+" "+t.pid);setTimeout(()=>{},60000)`;
  const bas = Date.now();
  await assert.rejects(calistir(process.execPath, ["-e", cocuk], KOK, 2000), /zaman aşımı/);
  // Ölçülen şey torunun 60 sn'lik borusunu beklememek; yük altında 2 sn + taskkill 10 sn'yi aşabiliyordu (12,7 sn görüldü).
  assert.ok(Date.now() - bas < 30_000, "zaman aşımında torunun 60 sn'sini beklemeden döner");
  const pidler = fs.readFileSync(pidDosya, "utf8").split(" ").map(Number);
  const yasayan = () => pidler.filter((p) => { try { process.kill(p, 0); return true; } catch { return false; } });
  for (let i = 0; i < 30 && yasayan().length; i++) await new Promise((r) => setTimeout(r, 100));
  const kalan = yasayan();
  for (const p of kalan) try { process.kill(p); } catch {} // test kırmızıysa artık süreç bırakma
  assert.deepEqual(kalan, [], "çocuk ve torun ölü olmalı");
});

test("calistir: zaman aşımında ağaç öldürülünce çocuğun çıkış hatası değil zaman aşımı döner (K27)", { skip: process.platform !== "win32" && "taskkill yalnız Windows'ta" }, async () => {
  // Yarış: taskkill çocuğu öldürünce execFile'ın geri çağrısı da gelir; önce gelen kazanırdı ("Command failed"). 30 paralel
  // deneme yarışı güvenilir biçimde tetikler (düzeltmesiz kodda 10'da ~2).
  const r = await Promise.allSettled(Array.from({ length: 30 }, () => calistir(process.execPath, ["-e", "setTimeout(()=>{},60000)"], KOK, 300)));
  const yanlis = r.filter((x) => !(x.status === "rejected" && /zaman aşımı/.test((x.reason as Error).message)));
  assert.equal(yanlis.length, 0, `yanlış sonuç: ${yanlis.map((x) => x.status === "rejected" ? (x.reason as Error).message.slice(0, 40) : "çözüldü").join(" | ")}`);
});

test("aracSureTakibi: arac → arac_sonuc arası ms (arac_id ile eşleşir), eşleşmeyen sonuç undefined", async () => {
  const { aracSureTakibi } = await import("../sunucu/baglama.ts");
  let t = 1000;
  const s = aracSureTakibi(() => t);
  assert.equal(s({ tur: "arac", arac_id: "a" }), undefined);
  t = 13000;
  assert.deepEqual(s({ tur: "arac_sonuc", arac_id: "a" }), { sure_ms: 12000 });
  assert.equal(s({ tur: "arac_sonuc", arac_id: "a" }), undefined, "ikinci sonuç eşleşmez");
  assert.equal(s({ tur: "arac_sonuc", arac_id: "yok" }), undefined);
});

test("tarama-3 aday 6: sure_ms insan onayı beklemesini içermez; kapi izin başlangıcı çeker, bekleme onay_ms'e yazılır", async () => {
  const { aracSureTakibi } = await import("../sunucu/baglama.ts");
  let t = 0;
  const s = aracSureTakibi(() => t);
  s({ tur: "arac", arac_id: "b" });
  t = 5000;
  assert.equal(s({ tur: "kapi", arac_id: "b", karar: "insan" }), undefined, "onay isteği başlangıcı çekmez");
  s({ tur: "kapi", arac_id: "b", karar: "izin" });
  t = 6000;
  assert.deepEqual(s({ tur: "arac_sonuc", arac_id: "b" }), { sure_ms: 1000, onay_ms: 5000 });
  s({ tur: "arac", arac_id: "c" });
  t = 7000;
  s({ tur: "kapi", arac_id: "baska", karar: "izin" });
  assert.deepEqual(s({ tur: "arac_sonuc", arac_id: "c" }), { sure_ms: 1000 }, "başka arac_id'nin izni karışmaz");
});
