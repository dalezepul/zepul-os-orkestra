import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DIZIN = fs.mkdtempSync(path.join(os.tmpdir(), "bekci-"));
process.env.ZEPUL_AYAR_DIZIN = DIZIN;
after(() => fs.rmSync(DIZIN, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));

const {
  limitOku, limitKarari, VARSAYILAN_AYAR, ayarYolu, ayarOku, ayarYaz, kuyrugaEkle, kuyrukYolu, kuyrukOku, kuyrukYaz, kuyrukDinle,
  bekciDurumuYeni, bekciGozle,
} = await import("../sunucu/bekci.ts");
type LimitDurumu = import("../sunucu/bekci.ts").LimitDurumu;
type Ayar = import("../sunucu/bekci.ts").Ayar;

const DK = 60_000;

// ---------- limitOku ----------

// limit.py --json çıktısının gerçek biçimi (claude + codex blokları).
const CLAUDE_BLOK = {
  source: "https://api.anthropic.com/api/oauth/usage",
  windows: [
    { name: "5-hour", used_percent: 68, resets_at: "2026-09-29T20:00:00+00:00", resets_in: "2h", expired: false },
    { name: "7-day", used_percent: 52, resets_at: "2026-10-03T10:00:00+00:00", resets_in: "3d 18h", expired: false },
    { name: "seven day opus", used_percent: 90, resets_at: null, resets_in: null, expired: false },
  ],
  warnings: [],
  plan: "max",
  age_minutes: 0,
  account: "kisi@ornek.com", email: "kisi@ornek.com", org: "ornek-org",
};
const ONBELLEK_META = { guncellendi_iso: "2026-10-04T13:48:15+03:00", yas_sn: 42, kaynak: "canli" };
const GERCEK_CIKTI = JSON.stringify({ claude: CLAUDE_BLOK, codex: { source: "x", windows: [], warnings: [] }, ...ONBELLEK_META }, null, 2);
const yeniDurum = () => ({ sonYenileme: 0 });

test("limitOku: limit.py çıktısından 5 saat ve 7 gün pencereleri, hesap bilgisi yok", async () => {
  const cagrilar: unknown[][] = [];
  const d = await limitOku(async (...a: unknown[]) => { cagrilar.push(a); return GERCEK_CIKTI; }, { sonYenileme: SIMDI }, SIMDI + DK);
  assert.ok(d);
  const { ts, ...geri } = d;
  assert.equal(typeof ts, "number");
  assert.deepEqual(geri, {
    bes_saat: { yuzde: 68, sifirlanma: "2026-09-29T20:00:00+00:00" },
    yedi_gun: { yuzde: 52, sifirlanma: "2026-10-03T10:00:00+00:00" },
    plan: "max", kaynak: "canli", yas_dk: 0.7, yas_sn: 42, guncellendi_iso: "2026-10-04T13:48:15+03:00", bayat: false,
  });
  assert.doesNotMatch(JSON.stringify(d), /kisi@|ornek-org/);
  assert.equal(cagrilar.length, 1, "taze önbellek varken dakikalık okuma uca gitmez");
  const [komut, args, , zaman] = cagrilar[0] as [string, string[], string, number];
  assert.equal(komut, "py");
  assert.equal(args[0], "-3");
  assert.match(args[1], /limit\.py$/);
  assert.deepEqual(args.slice(2), ["--onbellek", "--json", "--color", "never"]);
  assert.equal(zaman, 20_000);
});

test("limitOku: dakikada bir --onbellek, 5 dk'da bir --json; bayat önbellekte yenileme betiğe bırakılır", async () => {
  const bayraklar = (cagrilar: unknown[][]) => cagrilar.map((a) => (a[1] as string[]).slice(2, -3).join(" ") || "(yalın)");
  const durum = yeniDurum();
  let c: unknown[][] = [];
  const oku = (cikti: string, simdi: number) => limitOku(async (...a: unknown[]) => { c.push(a); return cikti; }, durum, simdi);
  await oku(GERCEK_CIKTI, SIMDI);
  assert.deepEqual(bayraklar(c), ["--onbellek", "(yalın)"], "ilk okumada --json da çağrılır");
  for (const dk of [1, 2, 3, 4]) { c = []; await oku(GERCEK_CIKTI, SIMDI + dk * DK); assert.deepEqual(bayraklar(c), ["--onbellek"], `${dk}. dk`); }
  c = []; await oku(GERCEK_CIKTI, SIMDI + 5 * DK);
  assert.deepEqual(bayraklar(c), ["--onbellek", "(yalın)"], "5. dk --json");
  c = []; await oku(JSON.stringify({ claude: CLAUDE_BLOK, ...ONBELLEK_META, yas_sn: 330, bayat: true }), SIMDI + 6 * DK);
  assert.deepEqual(bayraklar(c), ["--onbellek", "(yalın)"], "önbellek bayatsa --json ile yenileme denenir");
  c = []; await oku(GERCEK_CIKTI, SIMDI + 7 * DK);
  assert.deepEqual(bayraklar(c), ["--onbellek"]);
});

test("limitOku: bayat:true ya da yas_sn 30 dk'dan büyük → bayat işaretli durum", async () => {
  const oku = (ek: object) => limitOku(async () => JSON.stringify({ claude: CLAUDE_BLOK, ...ONBELLEK_META, ...ek }), yeniDurum(), SIMDI);
  const a = await oku({ bayat: true, yas_sn: 400, kaynak: "son-canli" });
  assert.equal(a?.bayat, true);
  assert.equal(a?.kaynak, "son-canli");
  assert.equal(a?.yas_sn, 400);
  assert.equal((await oku({ yas_sn: 31 * 60 }))?.bayat, true);
  assert.equal((await oku({ yas_sn: 29 * 60 }))?.bayat, false);
  assert.equal((await oku({ yas_sn: null }))?.bayat, true, "yaş bilinmiyorsa bayat");
});

test("limitOku: yalnız claude bloğu da okunur", async () => {
  const d = await limitOku(async () => JSON.stringify(CLAUDE_BLOK));
  assert.equal(d?.yedi_gun?.yuzde, 52);
});

test("limitOku: bozuk JSON, süreç hatası ya da penceresiz çıktı → null", async () => {
  assert.equal(await limitOku(async () => "{bozuk", yeniDurum()), null);
  assert.equal(await limitOku(async () => { throw new Error("zaman aşımı"); }, yeniDurum()), null);
  assert.equal(await limitOku(async () => JSON.stringify({ ...CLAUDE_BLOK, windows: [] }), yeniDurum()), null);
});

// ---------- limitKarari ----------

const SIMDI = 1_800_000_000_000;
const durum = (yedi: number | undefined, bes: number | undefined, ts = SIMDI): LimitDurumu => ({
  ...(yedi === undefined ? {} : { yedi_gun: { yuzde: yedi, sifirlanma: "2026-10-03T10:00:00+00:00" } }),
  ...(bes === undefined ? {} : { bes_saat: { yuzde: bes, sifirlanma: "2026-09-29T20:00:00+00:00" } }),
  kaynak: "test", yas_dk: 0, ts,
});
const ayar = (haftalik: number | null, bes: number | null): Ayar => ({ ...VARSAYILAN_AYAR, haftalik_tavan_yuzde: haftalik, bes_saat_tavan_yuzde: bes });

test("limitKarari: tavan yoksa serbest (okunamasa bile)", () => {
  assert.equal(limitKarari(durum(99, 99), VARSAYILAN_AYAR, SIMDI).yeniIsSerbest, true);
  assert.equal(limitKarari(null, VARSAYILAN_AYAR, SIMDI).yeniIsSerbest, true);
  assert.equal(VARSAYILAN_AYAR.haftalik_tavan_yuzde, null);
  assert.equal(VARSAYILAN_AYAR.bes_saat_tavan_yuzde, null);
});

test("limitKarari: haftalık tavan aşıldı (eşitlik de aşım)", () => {
  const k = limitKarari(durum(52, 10), ayar(40, null), SIMDI);
  assert.equal(k.yeniIsSerbest, false);
  assert.equal(k.esik_asildi, "haftalik");
  assert.equal(k.neden, "haftalık %52 ≥ tavan %40 (sıfırlanma: 2026-10-03T10:00:00+00:00)");
  const esit = limitKarari(durum(40, 10), ayar(40, null), SIMDI);
  assert.equal(esit.yeniIsSerbest, false);
  assert.equal(esit.esik_asildi, "haftalik");
  assert.equal(limitKarari(durum(30, 10), ayar(40, null), SIMDI).yeniIsSerbest, true);
});

test("limitKarari: 5 saatlik tavan aşıldı", () => {
  const k = limitKarari(durum(10, 68), ayar(null, 60), SIMDI);
  assert.equal(k.yeniIsSerbest, false);
  assert.equal(k.esik_asildi, "bes_saat");
  assert.match(k.neden, /5 saatlik %68 ≥ tavan %60/);
  assert.equal(limitKarari(durum(10, 60), ayar(null, 60), SIMDI).yeniIsSerbest, false);
});

test("limitKarari: tavanın %90'ında uyarı, serbest kalır", () => {
  const k = limitKarari(durum(36, 0), ayar(40, null), SIMDI);
  assert.equal(k.yeniIsSerbest, true);
  assert.match(k.uyari ?? "", /haftalık %36/);
  assert.equal(limitKarari(durum(35, 0), ayar(40, null), SIMDI).uyari, undefined);
});

test("limitKarari: hiç ölçüm yoksa güvenli taraf; bayat değer tavan kararında kullanılmaz", () => {
  const yok = limitKarari(null, ayar(40, null), SIMDI);
  assert.equal(yok.yeniIsSerbest, false);
  assert.match(yok.neden, /limit okunamadı/);
  // Bayat değer tavanı aşsa da iş kuyruğa düşmez; uyarı görünür.
  const bayat = limitKarari({ ...durum(99, 99), bayat: true }, ayar(40, 50), SIMDI);
  assert.equal(bayat.yeniIsSerbest, true);
  assert.equal(bayat.bayat, true);
  assert.match(bayat.uyari ?? "", /limit bilinmiyor \(bayat\)/);
  assert.equal(bayat.esik_asildi, undefined);
  // Kaynakta 3 dk + 28 dk önce okundu = 31 dk → bayat
  const eski = limitKarari({ ...durum(99, 99, SIMDI - 28 * DK), yas_dk: 3 }, ayar(40, null), SIMDI);
  assert.equal(eski.yeniIsSerbest, true);
  assert.equal(eski.bayat, true);
  assert.match(eski.uyari ?? "", /limit bilinmiyor \(bayat\)/);
  assert.equal(limitKarari(durum(99, 99, SIMDI - 29 * DK), ayar(40, null), SIMDI).yeniIsSerbest, false, "29 dk: değer hâlâ geçerli");
  // Tavanı olan pencere yanıtta yoksa bilinmiyor sayılır
  assert.equal(limitKarari(durum(10, undefined), ayar(null, 50), SIMDI).yeniIsSerbest, false);
});

// ---------- Ayar ----------

test("ayarYolu ve kuyrukYolu ZEPUL_AYAR_DIZIN altında, aynı klasörde", () => {
  assert.equal(ayarYolu(), path.join(DIZIN, "ayarlar.json"));
  assert.equal(kuyrukYolu(), path.join(DIZIN, "bekleyen-isler.json"));
});

test("ayarYaz: aralık dışı ve bilinmeyen alan reddedilir, geçerli yama atomik yazılır", async () => {
  assert.deepEqual(await ayarOku(), VARSAYILAN_AYAR);
  for (const kotu of [{ haftalik_tavan_yuzde: 101 }, { bes_saat_tavan_yuzde: -1 }, { haftalik_tavan_yuzde: "40" }, { haftalik_tavan: 40 }, { tekrar_durdur: 0 }]) {
    await assert.rejects(ayarYaz(kotu as never, "test"), Error, JSON.stringify(kotu));
  }
  assert.equal(fs.existsSync(ayarYolu()), false);

  const a = await ayarYaz({ haftalik_tavan_yuzde: 40 }, "kullanici");
  assert.equal(a.haftalik_tavan_yuzde, 40);
  assert.equal(a.guncelleyen, "kullanici");
  assert.equal(typeof a.guncelleme_ts, "number");
  assert.deepEqual(await ayarOku(), a);
  assert.deepEqual(fs.readdirSync(DIZIN).filter((f) => f.endsWith(".tmp")), []);

  const b = await ayarYaz({ haftalik_tavan_yuzde: null, bes_saat_tavan_yuzde: 100 }, "sef");
  assert.equal(b.haftalik_tavan_yuzde, null);
  assert.equal(b.bes_saat_tavan_yuzde, 100);
  assert.equal(b.tekrar_durdur, VARSAYILAN_AYAR.tekrar_durdur);
});

test("azami_isci: varsayılan 4, yalnızca 1-12 arası tam sayı; elle bozulan dosya da reddedilir", async () => {
  assert.equal(VARSAYILAN_AYAR.azami_isci, 4);
  assert.equal((await ayarOku()).azami_isci, 4, "eski dosyada alan yoksa varsayılan");
  for (const kotu of [0, 13, 2.5, -1, "4", null]) await assert.rejects(ayarYaz({ azami_isci: kotu } as never, "test"), Error, JSON.stringify(kotu));
  assert.equal((await ayarYaz({ azami_isci: 12 }, "kullanici")).azami_isci, 12);
  assert.equal((await ayarYaz({ azami_isci: 1 }, "kullanici")).azami_isci, 1);
  assert.equal((await ayarOku()).azami_isci, 1);
  fs.writeFileSync(ayarYolu(), JSON.stringify({ ...(await ayarOku()), azami_isci: 20 }));
  await assert.rejects(ayarOku(), /azami_isci/);
  fs.rmSync(ayarYolu());
});

// ---------- Kuyruk ----------

test("kuyruk: ekle, yaz, oku (kalıcı)", async () => {
  assert.deepEqual(await kuyrukOku(), []);
  const k = await kuyrukOku();
  const i1 = kuyrugaEkle(k, { ad: "isci-1", gorev: "a" }, "haftalık %52 ≥ tavan %40");
  const i2 = kuyrugaEkle(k, { ad: "isci-2", gorev: "b" }, "haftalık %52 ≥ tavan %40");
  assert.notEqual(i1.id, i2.id);
  assert.equal(k.length, 2);
  await kuyrukYaz(k);
  assert.deepEqual(await kuyrukOku(), k);
});

test("kuyruk: değişiklik dinleyiciye bildirilir (eklendi / cikarildi), bozuk dinleyici yazmayı bozmaz", async () => {
  const gelen: Array<[number, string]> = [];
  const birak = kuyrukDinle((k, sebep) => void gelen.push([k.length, sebep]));
  const birak2 = kuyrukDinle(() => { throw new Error("dinleyici bozuk"); });
  const k = await kuyrukOku();
  const once = k.length;
  kuyrugaEkle(k, { ad: "isci-3" }, "x");
  await kuyrukYaz(k);
  await kuyrukYaz(k.slice(0, once));
  birak(); birak2();
  await kuyrukYaz(k);
  assert.deepEqual(gelen, [[once + 1, "eklendi"], [once, "cikarildi"]]);
  await kuyrukYaz([]);
});

// ---------- Döngü bekçisi ----------

const arac = (girdi_ozet: string, ts: number, a = "Bash") => ({ tur: "arac" as const, arac: a, girdi_ozet, ts });

test("bekçi: aynı çağrı 3'te uyar, 5'te durdur", () => {
  const d = bekciDurumuYeni(SIMDI);
  const eylemler = [1, 2, 3, 4, 5].map((i) => bekciGozle(d, arac("npm test", SIMDI + i), VARSAYILAN_AYAR, SIMDI + i));
  assert.deepEqual(eylemler.map((k) => k.eylem), ["yok", "yok", "uyar", "yok", "durdur"]);
  assert.equal(eylemler[2].mesaj, "Aynı çağrıyı 3 kez tekrarladın; yaklaşım değiştir ya da şefe sor.");
  assert.match(eylemler[4].neden ?? "", /5 kez/);
});

test("bekçi: araya farklı çağrı girince sayaç sıfırlanır", () => {
  const d = bekciDurumuYeni(SIMDI);
  const g = ["ls", "ls", "pwd", "ls", "ls"].map((c, i) => bekciGozle(d, arac(c, SIMDI + i), VARSAYILAN_AYAR, SIMDI + i).eylem);
  assert.deepEqual(g, ["yok", "yok", "yok", "yok", "yok"]);
});

test("bekçi: normalizasyon (rakam, zaman damgası, boşluk)", () => {
  const d = bekciDurumuYeni(SIMDI);
  const g = ["sleep 5", "sleep 6", "sleep   77"].map((c, i) => bekciGozle(d, arac(c, SIMDI + i), VARSAYILAN_AYAR, SIMDI + i).eylem);
  assert.deepEqual(g, ["yok", "yok", "uyar"]);
  const z = bekciDurumuYeni(SIMDI);
  const g2 = ["log --since 2026-09-29T16:20:43.512Z", "log --since 2026-09-29T17:01:02.003Z", "log  --since 2026-10-01T00:00:00Z"]
    .map((c, i) => bekciGozle(z, arac(c, SIMDI + i), VARSAYILAN_AYAR, SIMDI + i).eylem);
  assert.deepEqual(g2, ["yok", "yok", "uyar"]);
});

test("bekçi: farklı offset'li sayfalı Read döngü sayılmaz, aynı girdili Read yakalanır", () => {
  const d = bekciDurumuYeni(SIMDI);
  const g = [56, 1609, 478, 12, 900].map((o, i) => bekciGozle(d, arac(`a.ts offset=${o} limit=50`, SIMDI + i, "Read"), VARSAYILAN_AYAR, SIMDI + i).eylem);
  assert.deepEqual(g, Array(5).fill("yok"));
  const z = bekciDurumuYeni(SIMDI);
  const h = [1, 2, 3, 4, 5].map((i) => bekciGozle(z, arac("a.ts offset=56 limit=50", SIMDI + i, "Read"), VARSAYILAN_AYAR, SIMDI + i).eylem);
  assert.equal(h[4], "durdur");
});

test("ayarYaz: eşzamanlı farklı alan yazımları birbirini ezmez", async () => {
  await Promise.all([
    ayarYaz({ guven_modu: { kademe: "tam", bitis: Date.now() + DK, alan_otomatik: false } }, "t1"),
    ayarYaz({ calisma_alanlari: [] }, "t2"),
  ]);
  const a = await ayarOku();
  assert.equal(a.guven_modu.kademe, "tam");
  assert.deepEqual(a.calisma_alanlari, []);
  await ayarYaz({ guven_modu: { kademe: "jev", bitis: null, alan_otomatik: false } }, "t3");
});

test("bekçi: A-B-A-B döngüsü son 8 çağrıda 4 tekrarla durdurulur", () => {
  const d = bekciDurumuYeni(SIMDI);
  const g = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => bekciGozle(d, i % 2 ? arac("git status", SIMDI + i) : arac("a.ts", SIMDI + i, "Read"), VARSAYILAN_AYAR, SIMDI + i));
  assert.deepEqual(g.slice(0, 7).map((k) => k.eylem), Array(7).fill("yok"));
  assert.equal(g[7].eylem, "durdur");
  assert.match(g[7].neden ?? "", /döngü/);
});

test("bekçi: ilerlemesizlik ilk seferde şefe uyarı, aynı pencerede ikincide durdur", () => {
  const d = bekciDurumuYeni(SIMDI);
  const a = VARSAYILAN_AYAR;
  for (let i = 0; i < 19; i++) assert.equal(bekciGozle(d, arac("x".repeat(i + 1), SIMDI + i * DK), a, SIMDI + i * DK).eylem, "yok");
  assert.equal(bekciGozle(d, { tur: "metin", ts: SIMDI + 30 * DK }, a, SIMDI + 30 * DK).eylem, "yok");
  // 20. araç tam 30. dakikada: uyarı (eşitlik de sayılır)
  const u = bekciGozle(d, arac("y", SIMDI + 30 * DK), a, SIMDI + 30 * DK);
  assert.equal(u.eylem, "uyar");
  assert.equal(u.sefe, true);
  assert.match(u.neden ?? "", /30 dk/);
  // yeni pencere: 20 araç daha, 30 dk daha → durdur
  let son = u;
  for (let i = 1; i <= 20; i++) son = bekciGozle(d, arac("z".repeat(i), SIMDI + 30 * DK + i * 90_000), a, SIMDI + 30 * DK + i * 90_000);
  assert.equal(son.eylem, "durdur");
  assert.match(son.neden ?? "", /ilerleme yok/);
});

test("bekçi: commit ve sözleşme ilerlemesizlik sayacını sıfırlar", () => {
  const d = bekciDurumuYeni(SIMDI);
  const a = VARSAYILAN_AYAR;
  for (let i = 0; i < 20; i++) bekciGozle(d, arac("x".repeat(i + 1), SIMDI + i * DK), a, SIMDI + i * DK);
  assert.equal(bekciGozle(d, { tur: "commit", ts: SIMDI + 25 * DK }, a, SIMDI + 25 * DK).eylem, "yok");
  for (let i = 0; i < 20; i++) {
    const t = SIMDI + 25 * DK + (10 + i) * DK * 0.95;
    assert.equal(bekciGozle(d, arac("q".repeat(i + 1), t), a, t).eylem, "yok");
  }
  const t0 = SIMDI + 25 * DK + 30 * DK;
  assert.equal(bekciGozle(d, arac("son", t0), a, t0).eylem, "uyar");
  bekciGozle(d, { tur: "sozlesme", ts: t0 }, a, t0);
  let s;
  for (let i = 1; i <= 20; i++) s = bekciGozle(d, arac("w".repeat(i), t0 + i * 90_000), a, t0 + i * 90_000);
  assert.equal(s?.eylem, "uyar");
});

test("bekçi: maliyet hızı 10 dk'da sınırı geçerse durdur", () => {
  const a = VARSAYILAN_AYAR; // 3 USD / 10 dk
  const d = bekciDurumuYeni(SIMDI);
  assert.equal(bekciGozle(d, { tur: "maliyet", usd: 1, ts: SIMDI + 5 * DK }, a, SIMDI + 5 * DK).eylem, "yok");
  const k = bekciGozle(d, { tur: "maliyet", usd: 4.5, ts: SIMDI + 8 * DK }, a, SIMDI + 8 * DK);
  assert.equal(k.eylem, "durdur");
  assert.match(k.neden ?? "", /10 dk/);
  // uzun bir turda birikmiş maliyet hıza sayılmaz: 60 dk'da 4 USD → son 10 dk ≈ 0,67
  const u = bekciDurumuYeni(SIMDI);
  assert.equal(bekciGozle(u, { tur: "maliyet", usd: 4, ts: SIMDI + 60 * DK }, a, SIMDI + 60 * DK).eylem, "yok");
  // tam sınır geçmek sayılmaz
  const s = bekciDurumuYeni(SIMDI);
  assert.equal(bekciGozle(s, { tur: "maliyet", usd: 3, ts: SIMDI + 5 * DK }, a, SIMDI + 5 * DK).eylem, "yok");
});
