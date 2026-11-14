import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DIZIN = fs.mkdtempSync(path.join(os.tmpdir(), "guven-ayar-"));
process.env.ZEPUL_AYAR_DIZIN = DIZIN;
after(() => fs.rmSync(DIZIN, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));

const { bekleKadar } = await import("./bekle.ts");
const { ayarOku, ayarYaz, SEF_YAZAMAZ, VARSAYILAN_AYAR, guvenGecerli, guvenYoneticisi } = await import("../sunucu/bekci.ts");

test("guven_modu varsayılanı jev, süresiz; şef yazamaz", async () => {
  assert.deepEqual(VARSAYILAN_AYAR.guven_modu, { kademe: "jev", bitis: null, alan_otomatik: false });
  assert.deepEqual((await ayarOku()).guven_modu, { kademe: "jev", bitis: null, alan_otomatik: false });
  assert.ok(SEF_YAZAMAZ.includes("guven_modu"));
});

test("guven_modu doğrulaması: geçersiz kademe ve bitiş reddedilir", async () => {
  await assert.rejects(ayarYaz({ guven_modu: { kademe: "hepsi", bitis: null, alan_otomatik: false } } as any, "panel"), /kademe/);
  await assert.rejects(ayarYaz({ guven_modu: { kademe: "tam", bitis: "yarın", alan_otomatik: false } } as any, "panel"), /bitis/);
  await assert.rejects(ayarYaz({ guven_modu: { kademe: "tam", bitis: null, alan_otomatik: "evet" } } as any, "panel"), /alan_otomatik/);
});

test("guvenGecerli: bitişi geçmiş kademe jev sayılır", () => {
  const g = { kademe: "tam" as const, bitis: 1000, alan_otomatik: true };
  assert.equal(guvenGecerli(g, 999).kademe, "tam");
  assert.deepEqual(guvenGecerli(g, 1000), { kademe: "jev", bitis: null, alan_otomatik: true });
  assert.equal(guvenGecerli({ kademe: "kullanici", bitis: null, alan_otomatik: false }, 1e15).kademe, "kullanici");
});

test("guvenYoneticisi: ayarla dosyaya yazar ve olay yayar; süre dolunca jev'e döner ve olay yayar", async () => {
  const olaylar: any[] = [];
  const y = guvenYoneticisi({ bildir: (g, neden) => olaylar.push({ ...g, neden }) });
  await y.yukle();
  assert.equal(y.al().kademe, "jev");
  const g = await y.ayarla({ kademe: "tam", sure_dk: 0.001, alan_otomatik: true }, "panel"); // ~60 ms
  assert.equal(g.kademe, "tam");
  assert.equal(typeof g.bitis, "number");
  assert.equal((await ayarOku()).guven_modu.kademe, "tam");
  assert.equal(olaylar.at(-1).kademe, "tam");
  // Zamanlayıcı dosyaya yazdıktan sonra olay yayar; yük altında 200 ms sabit uyku yetmiyordu.
  await bekleKadar(() => olaylar.at(-1).neden === "süre doldu", "süre dolumu olayı gelmedi");
  assert.equal(y.al().kademe, "jev");
  assert.equal(olaylar.at(-1).kademe, "jev");
  assert.equal(olaylar.at(-1).neden, "süre doldu");
  assert.deepEqual((await ayarOku()).guven_modu, { kademe: "jev", bitis: null, alan_otomatik: true });
  y.kapat();
});

test("guvenYoneticisi: süresiz tam; geçersiz istek reddedilir; yüklemede bitişi geçmiş kayıt jev'e döner", async () => {
  const olaylar: any[] = [];
  const y = guvenYoneticisi({ bildir: (g) => olaylar.push(g) });
  assert.equal((await y.ayarla({ kademe: "tam" }, "panel")).bitis, null);
  await assert.rejects(y.ayarla({ kademe: "x" } as any, "panel"), /kademe/);
  await assert.rejects(y.ayarla({ kademe: "tam", sure_dk: -5 }, "panel"), /sure_dk/);
  y.kapat();
  await ayarYaz({ guven_modu: { kademe: "tam", bitis: Date.now() - 1000, alan_otomatik: false } }, "panel");
  const y2 = guvenYoneticisi({ bildir: (g) => olaylar.push(g) });
  await y2.yukle();
  assert.equal(y2.al().kademe, "jev");
  assert.equal((await ayarOku()).guven_modu.kademe, "jev");
  assert.equal(olaylar.at(-1).kademe, "jev");
  y2.kapat();
});

// ---------- Kapı kademeleri (kapi.ts) ----------
const { kapiKarari } = await import("../sunucu/kapi.ts");
const guvenliCevap = { answers: { risk: { type: "choice", choice: "guvenli", confidence: 0.95, probabilities: {} }, dis_etki: { noul: 0.1 } } };

test("kapı tam: örneklem dışı kabuk dışı araçta Jev çağrılmaz, Laya gölgesi Jev'siz kaydedilir", async () => {
  let jev = 0;
  const golge: any[] = [];
  const k = await kapiKarari({ rol: "isci", ajan: "isci1", arac: "Write", girdi: { file_path: "x.txt", content: "x" }, sahiplik: new Map(), guven: { kademe: "tam", alan_otomatik: false } },
    { jevSor: async () => { jev++; return guvenliCevap; }, layaSor: async () => guvenliCevap, golgeYaz: (x) => golge.push(x), hataYaz: () => {} });
  assert.equal(k.karar, "izin");
  assert.match(k.neden, /^izin \(tam güven\)/);
  assert.equal(jev, 0);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(golge.length, 1);
  assert.equal(golge[0].jev, null);
  assert.equal(golge[0].laya.secim, "guvenli");
  assert.equal(golge[0].kademe, "tam");
});

test("kapı tam: sahiplik aynen kalır (başkasının OWNS'u red, OWNS dışı red)", async () => {
  const d = { jevSor: async () => guvenliCevap, layaSor: async () => guvenliCevap, golgeYaz: () => {}, hataYaz: () => {} };
  const guven = { kademe: "tam" as const, alan_otomatik: true };
  const baska = await kapiKarari({ rol: "isci", ajan: "isci1", arac: "Write", girdi: { file_path: "panel/index.html", content: "x" }, sahiplik: new Map([["panel/**", "isci2"]]), guven }, d);
  assert.equal(baska.karar, "red");
  const disari = await kapiKarari({ rol: "isci", ajan: "isci1", arac: "Write", girdi: { file_path: "sunucu/x.ts", content: "x" }, sahiplik: new Map([["test/**", "isci1"]]), guven }, d);
  assert.equal(disari.karar, "red");
  const kendi = await kapiKarari({ rol: "isci", ajan: "isci1", arac: "Write", girdi: { file_path: "test/x.ts", content: "x" }, sahiplik: new Map([["test/**", "isci1"]]), guven }, d);
  assert.match(kendi.neden, /^izin \(tam güven\)/);
  const kul = await kapiKarari({ rol: "isci", ajan: "isci1", arac: "Write", girdi: { file_path: "test/x.ts", content: "x" }, sahiplik: new Map([["test/**", "isci1"]]), guven: { kademe: "kullanici", alan_otomatik: false } }, d);
  assert.equal(kul.karar, "insan");
});

// ---------- Tam güvende örneklemeli Jev gölgesi (aday 1): kararı değiştirmez, beklenmez ----------
const tamGirdi = (arac: string, girdi: unknown) => ({ rol: "isci", ajan: "isci1", arac, girdi, sahiplik: new Map(), guven: { kademe: "tam" as const, alan_otomatik: false } });
const cevap = (secim: string, guven = 0.95) => ({ answers: { risk: { type: "choice", choice: secim, confidence: guven, probabilities: {} }, dis_etki: { noul: 0.1 } } });
const bekle = (ms = 20) => new Promise((r) => setTimeout(r, ms));

test("kapı tam: kabuk aracında Jev gölgede her zaman sorulur; kayıtta jev, laya, uyum, kademe tam", async () => {
  const golge: any[] = [];
  let jev = 0;
  const d = { golgeYaz: (x: any) => golge.push(x), hataYaz: () => {}, jevSor: async () => { jev++; return cevap("riskli"); }, layaSor: async () => cevap("guvenli") };
  for (const [arac, komut] of [["Bash", "npm test"], ["PowerShell", "Get-ChildItem"]]) await kapiKarari(tamGirdi(arac, { command: komut }), d);
  await bekle();
  assert.equal(jev, 2);
  assert.equal(golge.length, 2);
  for (const x of golge) {
    assert.equal(x.kademe, "tam");
    assert.equal(x.jev.secim, "riskli");
    assert.equal(x.laya.secim, "guvenli");
    assert.equal(x.uyum, false);
    assert.ok(Number.isFinite(x.jev_ms) && Number.isFinite(x.laya_ms));
  }
});

test("kapı tam: kabuk dışı araçta Jev her N=3 kararın birinde gölgede sorulur", async () => {
  const golge: any[] = [];
  let jev = 0;
  const d = { tamOrnek: { sayac: 0 }, golgeYaz: (x: any) => golge.push(x), hataYaz: () => {}, jevSor: async () => { jev++; return cevap("guvenli"); }, layaSor: async () => cevap("guvenli") };
  for (let i = 0; i < 6; i++) await kapiKarari(tamGirdi("Write", { file_path: "x.txt", content: "x" }), d);
  await bekle();
  assert.equal(jev, 2);
  assert.equal(golge.filter((x) => x.jev).length, 2);
  assert.ok(golge.filter((x) => x.jev).every((x) => x.uyum === true && x.kademe === "tam"));
});

test("kapı tam: örneklemdeki Jev kararı etkilemez ve beklenmez (riskli, hata, asılı kalma)", async () => {
  let birak!: (v: unknown) => void;
  const asili = new Promise((r) => { birak = r; });
  const hatalar: any[] = [];
  const golge: any[] = [];
  for (const jevSor of [async () => cevap("geri-alinamaz"), async () => { throw new Error("ağ"); }, () => asili]) {
    const k = await kapiKarari(tamGirdi("Bash", { command: "npm run build" }), { golgeYaz: (x: any) => golge.push(x), hataYaz: (h: any) => hatalar.push(h), jevSor, layaSor: async () => cevap("guvenli") });
    assert.equal(k.karar, "izin");
    assert.equal(k.karar_kaynagi, "tam-guven");
    assert.equal(k.jev, undefined);
  }
  await bekle();
  assert.equal(hatalar.length, 0, "Jev hatası sessizce atlanır");
  assert.equal(golge.length, 2, "asılı Jev'in kaydı henüz yok; hatalı Jev'de Jev'siz kayıt");
  assert.equal(golge[0].jev.secim, "geri-alinamaz");
  assert.equal(golge[1].jev, null);
  birak(cevap("guvenli"));
  await bekle();
  assert.equal(golge.length, 3);
});

test("kapı tam: Jev 429 soğuma başlatır; soğumada Jev gölgesi atlanır", async () => {
  const saat = 5_000_000;
  let jev = 0;
  const d = { simdi: () => saat, soguma: { jev_bitis: 0 }, golgeYaz: () => {}, hataYaz: () => {}, layaSor: async () => cevap("guvenli"),
    jevSor: async () => { jev++; throw Object.assign(new Error("HTTP 429"), { status: 429 }); } };
  await kapiKarari(tamGirdi("Bash", { command: "npm test" }), d);
  await bekle();
  assert.equal(jev, 1);
  assert.equal(d.soguma.jev_bitis, saat + 10 * 60_000);
  await kapiKarari(tamGirdi("Bash", { command: "npm test" }), d);
  await bekle();
  assert.equal(jev, 1, "soğumada Jev'e gidilmedi");
});

test("layaIstatistik: kademe tam satırları Jev'liyse uyuma girer", async () => {
  const { layaIstatistik } = await import("../sunucu/baglama.ts");
  const satirlar = [{ jev: { secim: "riskli" }, laya: { secim: "guvenli" }, kademe: "tam" }, { jev: { secim: "guvenli" }, laya: { secim: "guvenli" }, kademe: "tam" }, { jev: null, laya: { secim: "guvenli" }, kademe: "tam" }];
  const s = layaIstatistik(satirlar.map((x) => JSON.stringify(x)).join("\n"), null);
  assert.equal(s.canli.toplam, 2);
  assert.equal(s.canli.uyum_orani, 0.5);
});

test("kapı tam: Laya güvenli ama güveni 0,5'in altındaysa kabuk aracında da uyarı; kabuk dışında ya da güven yüksekse yok", async () => {
  const uyarilar: any[] = [];
  const d = (guven: number) => ({ uyariYaz: (u: any) => uyarilar.push(u), golgeYaz: () => {}, hataYaz: () => {}, jevSor: async () => cevap("guvenli"), layaSor: async () => cevap("guvenli", guven) });
  const k = await kapiKarari(tamGirdi("Bash", { command: "npm test" }), d(0.4));
  assert.equal(k.karar, "izin");
  await kapiKarari(tamGirdi("PowerShell", { command: "Get-ChildItem" }), d(0.49));
  await kapiKarari(tamGirdi("Bash", { command: "npm test" }), d(0.5));
  await kapiKarari(tamGirdi("Write", { file_path: "x.txt", content: "x" }), d(0.1));
  await bekle();
  assert.deepEqual(uyarilar, [{ ajan: "isci1", arac: "Bash", sinif: "dusuk-guven" }, { ajan: "isci1", arac: "PowerShell", sinif: "dusuk-guven" }]);
  const olaylar: any[] = [], ntfy: string[][] = [];
  const { kapiBagimliligi } = await import("../sunucu/baglama.ts");
  const b = kapiBagimliligi((o: any) => olaylar.push(o), d(0.9) as any, (a, m) => ntfy.push([a, m]), () => 0);
  b.uyariYaz!({ ajan: "isci1", arac: "Bash", sinif: "dusuk-guven" });
  b.uyariYaz!({ ajan: "isci1", arac: "Bash", sinif: "riskli" });
  assert.match(olaylar[0].mesaj, /Bash: düşük güvenle güvenli \(tam güven, Laya gölgesi\)/);
  assert.equal(ntfy.length, 2, "düşük güven kendi anahtarıyla seyrelir, riskli süresini yemez");
  assert.match(ntfy[0][0], /düşük güvenle geçti/);
  assert.doesNotMatch(ntfy[0][0], /riskli işlem/);
  b.uyariYaz!({ ajan: "isci1", arac: "Bash", sinif: "riskli" });
  assert.equal(ntfy.length, 2, "aynı sınıf 10 dk içinde seyrelir");
});

test("kapı tam: Jev yanıtı bozuksa gölge jev:null ile yazılır, sahte Laya hatası çıkmaz", async () => {
  const golge: any[] = [], hatalar: any[] = [];
  const d = { golgeYaz: (x: any) => golge.push(x), hataYaz: (h: any) => hatalar.push(h), jevSor: async () => ({}), layaSor: async () => cevap("guvenli") };
  await kapiKarari(tamGirdi("Bash", { command: "npm test" }), d);
  await bekle();
  assert.equal(golge.length, 1);
  assert.equal(golge[0].jev, null);
  assert.equal(hatalar.length, 0);
});

test("kapı tam: Jev bozuk, Laya da hata verirse yakalanmamış ret olmaz", async () => {
  const redler: unknown[] = [], dinle = (e: unknown) => redler.push(e);
  process.on("unhandledRejection", dinle);
  try {
    const hatalar: any[] = [];
    const d = { golgeYaz: () => {}, hataYaz: (h: any) => hatalar.push(h), jevSor: async () => ({}), layaSor: async () => { throw new Error("laya düştü"); } };
    await kapiKarari(tamGirdi("Bash", { command: "npm test" }), d);
    await bekle(50);
    assert.equal(redler.length, 0);
    assert.equal(hatalar.length, 1);
  } finally { process.off("unhandledRejection", dinle); }
});

test("layaIstatistik: riskliyi güvenli sanma (Jev riskli/geri-alınamaz, Laya güvenli) sayı ve oran", async () => {
  const { layaIstatistik } = await import("../sunucu/baglama.ts");
  const s = (j: string, l: string) => ({ jev: { secim: j }, laya: { secim: l } });
  const satirlar = [s("riskli", "guvenli"), s("geri-alinamaz", "guvenli"), s("riskli", "riskli"), s("geri-alinamaz", "belirsiz"), s("guvenli", "guvenli")];
  const c = layaIstatistik(satirlar.map((x) => JSON.stringify(x)).join("\n"), null).canli;
  assert.deepEqual(c.riskli_guvenli_sanma, { sayi: 2, toplam: 4, oran: 0.5 });
  assert.deepEqual(layaIstatistik("", null).canli.riskli_guvenli_sanma, { sayi: 0, toplam: 0, oran: null });
});

test("Jev 429: soğuma süresince Jev'e gidilmez, karar Laya'dan; süre bitince Jev yeniden denenir", async () => {
  let saat = 1_000_000, jev = 0;
  const golge: any[] = [];
  const d = { simdi: () => saat, soguma: { jev_bitis: 0 }, golgeYaz: (x: any) => golge.push(x), hataYaz: () => {},
    jevSor: async () => { jev++; throw Object.assign(new Error("HTTP 429 FreeUsageLimitError"), { status: 429 }); },
    layaSor: async () => guvenliCevap };
  const g = { rol: "isci", ajan: "isci1", arac: "Bash", girdi: { command: "npm test" }, sahiplik: new Map() };
  const k1 = await kapiKarari(g, d);
  assert.equal(k1.karar_kaynagi, "laya-yedek");
  assert.equal(jev, 1);
  assert.equal(d.soguma.jev_bitis, saat + 10 * 60_000);
  const k2 = await kapiKarari(g, d);
  assert.equal(k2.karar_kaynagi, "laya-yedek");
  assert.equal(jev, 1, "soğumada Jev'e gidilmedi");
  assert.match(k2.neden, /Laya \(Jev yedeği\)/);
  saat += 10 * 60_000 + 1;
  await kapiKarari(g, d);
  assert.equal(jev, 2, "soğuma bitince Jev yeniden denendi");
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(golge.length >= 2 && golge.every((x) => x.jev === null && x.karar_kaynagi === "laya-yedek"));
});

test("Jev ağ hatası (429 değil): karar Laya'dan ama soğuma başlamaz", async () => {
  const d = { soguma: { jev_bitis: 0 }, golgeYaz: () => {}, hataYaz: () => {},
    jevSor: async () => { throw Object.assign(new Error("zaman aşımı"), { name: "TimeoutError" }); }, layaSor: async () => guvenliCevap };
  const k = await kapiKarari({ rol: "isci", ajan: "isci1", arac: "Bash", girdi: { command: "npm test" }, sahiplik: new Map() }, d);
  assert.equal(k.karar_kaynagi, "laya-yedek");
  assert.equal(d.soguma.jev_bitis, 0);
});

test("layaIstatistik: Laya yedeği kararları ayrıca sayılır, uyum hesabına girmez", async () => {
  const { layaIstatistik } = await import("../sunucu/baglama.ts");
  const l = { secim: "guvenli", guven: 0.9 };
  const satirlar = [{ jev: { secim: "guvenli" }, laya: l }, { jev: null, laya: l, karar_kaynagi: "laya-yedek" }, { jev: null, laya: l, karar_kaynagi: "laya-yedek" }, { jev: null, laya: l, kademe: "tam" }];
  const s = layaIstatistik(satirlar.map((x) => JSON.stringify(x)).join("\n"), null);
  assert.equal(s.canli.toplam, 1);
  assert.equal(s.canli.laya_yedek, 2);
});

// ---------- API ve hook (baglama.ts) ----------
const { hepsiniOnayla, guvenIstegi, kapiHookOlustur, kapiBagimliligi } = await import("../sunucu/baglama.ts");

test("hepsiniOnayla: bekleyen onayların hepsi evet; kesin yasak kartı atlanır", () => {
  const sonuc: any[] = [];
  const onaylar = new Map<string, any>([
    ["o1", { ajan: "isci1", bitir: (k: string, not?: string, kaynak?: string) => sonuc.push(["o1", k, not, kaynak]) }],
    ["o2", { ajan: "isci2", kesin: true, bitir: () => sonuc.push(["o2"]) }],
    ["o3", { ajan: "sunucu", bitir: (k: string) => sonuc.push(["o3", k]) }],
  ]);
  assert.deepEqual(hepsiniOnayla(onaylar, "zepul-ai"), { onaylanan: 2, atlanan: 1 });
  assert.deepEqual(sonuc, [["o1", "evet", "toplu onay (panel düğmesi)", "zepul-ai"], ["o3", "evet"]]);
});

test("guvenIstegi: gövde doğrulanır, hata 400", async () => {
  const ayarla = async (i: any) => ({ kademe: i.kademe, bitis: null, alan_otomatik: false });
  assert.equal((await guvenIstegi({ kademe: "tam", sure_dk: 15 }, ayarla)).kod, 200);
  assert.equal((await guvenIstegi(null, ayarla)).kod, 400);
  assert.equal((await guvenIstegi({ kademe: "tam" }, async () => { throw new Error("kademe yanlış"); })).kod, 400);
});

test("hook: tam güvende olay karar_kaynagi tam-guven, neden 'izin (tam güven)'; kesin yasak kartı kesin işaretli", async () => {
  const olaylar: any[] = [];
  const onaylar = new Map<string, any>();
  const yay = (o: any) => olaylar.push(o);
  const temel = { jevSor: async () => guvenliCevap, layaSor: async () => guvenliCevap, golgeYaz: () => {}, hataYaz: () => {} };
  const hook = kapiHookOlustur({ ajan: { id: "isci1", rol: "isci" }, kok: process.cwd(), sahiplik: new Map(), bagimlilik: kapiBagimliligi(yay, temel), yay, onaylar,
    bildir: () => {}, onayMs: 200, guven: () => ({ kademe: "tam", alan_otomatik: false }) });
  const cagir = (arac: string, girdi: object) => hook({ hook_event_name: "PreToolUse", tool_name: arac, tool_input: girdi } as any, "t", { signal: new AbortController().signal });
  assert.deepEqual(await cagir("Bash", { command: "npm install x" }), {});
  const k = olaylar.find((o) => o.tur === "kapi");
  assert.equal(k.karar, "izin");
  assert.equal(k.karar_kaynagi, "tam-guven");
  assert.match(k.neden, /^izin \(tam güven\)/);
  const bekle = cagir("Bash", { command: "git reset --hard HEAD~1" });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal([...onaylar.values()][0]?.kesin, true);
  await bekle;
});

test("orkestra.ts: /api/guven uçları, guven SSE olayı, toplu onay ve kapıya kademe bağlı", () => {
  const k = fs.readFileSync(path.join(process.cwd(), "sunucu", "orkestra.ts"), "utf8");
  assert.match(k, /uc === "GET \/api\/guven"/);
  assert.match(k, /uc === "POST \/api\/guven"[\s\S]{0,300}guvenIstegi\(/);
  assert.match(k, /uc === "POST \/api\/onay\/hepsi"[\s\S]{0,300}hepsiniOnayla\(onaylar/);
  assert.match(k, /tur: "guven"/);
  assert.match(k, /guven: \(\) => guven\.al\(\)/);
  assert.match(k, /"guven_modu" in g\) return hataYaniti\(res, 400/);
  assert.match(k, /jev_soguma_bitis/);
});

test("şef talimatı: 'hepsine onay veriyorum' yetki sayılmaz, panel güven moduna yönlendirilir", async () => {
  const { GUVEN_KURALI, sefTalimati } = await import("../sunucu/baglama.ts");
  assert.match(GUVEN_KURALI, /hepsine onay veriyorum/);
  assert.match(GUVEN_KURALI, /Bunu panelden güven modu ile açabilirsin/);
  assert.match(GUVEN_KURALI, /yetki (sayma|değildir)/);
  assert.ok(sefTalimati(4).split("\n").includes(GUVEN_KURALI), "şef talimatında (üretilen metin)");
});

test("kapı tam: yalnız parçada yakalanan kesin yasak da red (bütün komutta yakalanmasa bile)", async () => {
  const d = { jevSor: async () => guvenliCevap, layaSor: async () => guvenliCevap, golgeYaz: () => {}, hataYaz: () => {},
    kesinYasak: ((_a: string, g: any) => g?.command === "echo yasak-parca" ? { yasak: true, neden: "deneme", risk: "geri-alinamaz", mutlak: true }
      : { yasak: false, neden: "", risk: "dusuk", mutlak: false }) as any };
  for (const kademe of ["tam", "kullanici"] as const) {
    const k = await kapiKarari({ rol: "isci", ajan: "isci1", arac: "Bash", girdi: { command: "git status && echo yasak-parca" }, sahiplik: new Map(), guven: { kademe, alan_otomatik: true } }, d);
    assert.deepEqual([k.karar, k.mutlak], ["red", true], kademe);
  }
});
