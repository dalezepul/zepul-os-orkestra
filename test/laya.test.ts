// Laya gölge ölçümü: hata tekrarı (tek kart), istatistik ucu, B4 verdict. Sunucu açılmaz. Çalıştırma: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { kapiBagimliligi } from "../sunucu/baglama.ts";
import type { KapiBagimlilik } from "../sunucu/kapi.ts";

function duzen() {
  const olaylar: any[] = [], golge: any[] = [];
  const temel = { jevSor: async () => ({}), layaSor: async () => ({}), golgeYaz: (k: object) => void golge.push(k), hataYaz: () => { throw new Error("olaya çevrilmeliydi"); } } as KapiBagimlilik;
  const d = kapiBagimliligi((o: any) => void olaylar.push(o), temel);
  const layaHata = () => d.hataYaz({ kaynak: "ag", tur_adi: "ag_hatasi", mesaj: "Laya (gölge): fetch failed", baglam: { ajan: "isci1", arac: "Bash" } });
  return { d, olaylar, golge, layaHata };
}

test("Laya hatası: yalnızca ilk hatada bir ag_hatasi olayı; ara hatalar kart üretmez", () => {
  const { olaylar, layaHata } = duzen();
  for (let i = 0; i < 5; i++) layaHata();
  const hatalar = olaylar.filter((o) => o.tur === "hata");
  assert.equal(hatalar.length, 1);
  assert.equal(hatalar[0].tur_adi, "ag_hatasi");
  assert.match(hatalar[0].mesaj, /gölge ölçüm yapılamıyor: Laya \(gölge\): fetch failed$/, "asıl hata metni ezilmez (hata-avi-3 B6)");
});

test("Laya geri gelince bir kez bilgi olayı; ara hatalar sayaçla tek kayıtta (log_hata) toplanır", () => {
  const { d, olaylar, golge, layaHata } = duzen();
  for (let i = 0; i < 4; i++) layaHata();
  d.golgeYaz({ uyum: true });
  d.golgeYaz({ uyum: false });
  assert.equal(golge.length, 2, "gölge kaydı yine yazılır");
  const bilgi = olaylar.filter((o) => o.tur === "bilgi");
  assert.equal(bilgi.length, 1);
  assert.equal(bilgi[0].mesaj, "Laya geri geldi, gölge ölçüm sürüyor");
  assert.equal(bilgi[0].tekrar, 3, "ilk hata dışındaki ara hatalar");
  assert.equal(bilgi[0].log_hata, true);
  layaHata(); // yeniden düşünce yine bir kez yayılır
  assert.equal(olaylar.filter((o) => o.tur === "hata").length, 2);
});

test("Laya hiç düşmediyse geri geldi olayı yok; Laya dışı hata olduğu gibi geçer", () => {
  const { d, olaylar } = duzen();
  d.golgeYaz({});
  d.hataYaz({ kaynak: "ag", tur_adi: "zaman_asimi", mesaj: "Jev yok", baglam: { ajan: "x" } });
  assert.equal(olaylar.filter((o) => o.tur === "bilgi").length, 0);
  assert.equal(olaylar.filter((o) => o.tur === "hata").length, 1);
  assert.equal(olaylar[0].mesaj, "Jev yok");
});

// ---------- İstatistik ----------
import { layaIstatistik, yetki, ZEPUL_AI_UCLARI } from "../sunucu/baglama.ts";

const kayit = (jev: string, laya: string, extra: object = {}) => JSON.stringify({ ts: "2026-10-03T10:00:00.000Z", arac: "Bash", girdi_maskeli: "Komut: ls", jev: { secim: jev }, laya: { secim: laya }, uyum: jev === laya, jev_ms: 600, laya_ms: 50, ...extra });

test("layaIstatistik: toplam, uyum, kappa, karışıklık, güvenlik geri çağırma, ortalama gecikme, son 10 anlaşmazlık", () => {
  const satirlar = [kayit("guvenli", "guvenli"), kayit("riskli", "belirsiz", { jev_ms: 800, laya_ms: 150 }), kayit("riskli", "riskli"), kayit("geri-alinamaz", "guvenli"), "bozuk satır", "", kayit("guvenli", "belirsiz")].join("\n");
  const { canli, taban } = layaIstatistik(satirlar, null);
  assert.equal(canli.toplam, 5);
  assert.equal(canli.uyum_orani, 2 / 5);
  assert.equal(canli.karisiklik.riskli.belirsiz, 1);
  assert.equal(canli.guvenlik_geri_cagirma, 1 / 3, "Jev riskli/geri-alınamaz 3, Laya da öyle diyen 1");
  assert.equal(canli.jev_ort_ms, 640);
  assert.equal(canli.laya_ort_ms, 70);
  assert.equal(typeof canli.kappa, "number");
  assert.equal(canli.anlasmazliklar.length, 3);
  assert.deepEqual(Object.keys(canli.anlasmazliklar[0]).sort(), ["arac", "girdi", "jev", "laya", "ts"]);
  assert.equal(taban, null);
});

test("layaIstatistik: anlaşmazlık son 10 ile sınırlı, en yeni önce; panel belirteci maskelenir (27.10.2026: genel sır maskelenmez); boş dosya sıfır döner", () => {
  const cok = Array.from({ length: 15 }, (_, i) => kayit("riskli", "guvenli", { ts: `2026-10-03T10:00:${String(i).padStart(2, "0")}.000Z` })).join("\n");
  const a = layaIstatistik(cok, null).canli.anlasmazliklar;
  assert.equal(a.length, 10);
  assert.equal(a[0].ts, "2026-10-03T10:00:14.000Z");
  const sir = layaIstatistik(kayit("riskli", "guvenli", { girdi_maskeli: "curl -H 'Authorization: Bearer abcdef1234567890abcdef' http://x/?t=PanelBelirtec9" }), null).canli.anlasmazliklar[0].girdi;
  assert.ok(sir.includes("abcdef1234567890") && !sir.includes("PanelBelirtec9"), sir);
  const ham = layaIstatistik([kayit("guvenli", "belirsiz", { laya: { secim: "belirsiz", ham_secim: "guvenli", guvenli_olasilik: 0.48 } }), kayit("riskli", "guvenli")].join("\n"), null).canli;
  assert.deepEqual([ham.anlasmazliklar[1].ham_secim, ham.anlasmazliklar[1].guvenli_olasilik], ["guvenli", 0.48], "Faz 6: gölge alanları varsa döner");
  assert.equal("ham_secim" in ham.anlasmazliklar[0], false, "yoksa alan eklenmez");
  assert.equal(ham.esikle_belirsiz, 1, "güvenli → belirsiz eşik düşüşü sayılır");
  const bos = layaIstatistik("", { dogruluk: 0.212, kappa: 0.001, kayit: 576, ts: "t" });
  assert.equal(bos.canli.toplam, 0);
  assert.equal(bos.canli.uyum_orani, null);
  assert.equal(bos.taban!.kappa, 0.001);
});

test("GET /api/laya-istatistik panel token'ına açık, zepul-ai anahtarına kapalı", () => {
  const panel = Buffer.from("p".repeat(64)), anahtar = Buffer.from("a".repeat(64));
  assert.equal(ZEPUL_AI_UCLARI.has("GET /api/laya-istatistik"), false);
  assert.equal(yetki("GET /api/laya-istatistik", ["p".repeat(64)], panel, anahtar), "panel");
  assert.equal(yetki("GET /api/laya-istatistik", ["a".repeat(64)], panel, anahtar), 403);
});
