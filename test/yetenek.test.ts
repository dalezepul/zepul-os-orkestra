// Yetenek görevi (docs/sozlesme/yetenek-dongusu.md bölüm 2): '[yetenek]' önekli zepul-ai görevi. Sunucu açılmaz. Çalıştırma: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { zepulAiGorevleri, YETENEK_KURALI, YETENEK_NTFY, ZEPUL_AI_KURALI, sefTalimati } from "../sunucu/baglama.ts";

function duzen() {
  const olaylar: any[] = [], ntfy: [string, string][] = [];
  const z = zepulAiGorevleri({ yay: (o) => olaylar.push(o), sefe: () => true, sunucudan: () => {}, ntfy: (b, m) => ntfy.push([b, m]) });
  const sef = (tur: string, ek: object) => z.olay({ ajan: "sef", tur, ...ek });
  return { z, olaylar, ntfy, sef, tur: (t: string) => olaylar.filter((o) => o.tur === t) };
}

test("yetenek: '[yetenek]' önekli görevde olaylara gorev_tur yetenek yazılır; önceki tur sonuçlandırmaz, TAMAM: ile biter, ntfy bir kez", () => {
  const d = duzen();
  d.z.al("[yetenek] istek: tarayıcı geçmişini özetle; eksik: tarayici_gecmisi aracı; depo: zepul-ai", "g-y");
  assert.equal(d.tur("gorev_alindi")[0].gorev_tur, "yetenek");
  d.sef("metin", { metin: "SÜRÜYOR: işçi başlattım" });
  d.sef("durum", { durum: "bekliyor" });
  assert.equal(d.tur("gorev_sonuc").length, 0, "birleşmeden yetenek görevi kapanmaz");
  assert.equal(d.ntfy.length, 0);
  d.sef("metin", { metin: "TAMAM: tarayici_gecmisi aracı eklendi; 'son 7 günün geçmişini özetle' de." });
  d.sef("durum", { durum: "bekliyor" });
  const s = d.tur("gorev_sonuc");
  assert.deepEqual(s.map((o) => [o.gorev_id, o.verdict, o.gorev_tur]), [["g-y", "TAMAM", "yetenek"]]);
  assert.deepEqual(d.ntfy, [[YETENEK_NTFY.baslik, YETENEK_NTFY.mesaj]]);
  assert.equal(YETENEK_NTFY.baslik, "Zepul OS: bilgilendirme: yeni yetenek hazır");
  assert.ok(!/[\\/]|[a-z]:|token|anahtar|parola/i.test(YETENEK_NTFY.mesaj), "mesajda yol ya da sır yok");
});

test("yetenek: REDDEDİLDİ ve BAŞARISIZ ntfy göndermez; olağan görev değişmez (gorev_tur yok, ilk tur sonu TAMAM, ntfy yok)", () => {
  const d = duzen();
  d.z.al("[yetenek] x", "g-r");
  d.sef("metin", { metin: "REDDEDİLDİ: force push gerekir; alternatif: elle" });
  d.sef("durum", { durum: "bekliyor" });
  d.z.al("[yetenek] y", "g-b");
  d.sef("metin", { metin: "BAŞARISIZ: denetçi iki kez VETO verdi" });
  d.sef("durum", { durum: "bekliyor" });
  d.z.al("README'yi güncelle", "g-o");
  d.sef("metin", { metin: "TAMAM: İşçi başlattım." });
  d.sef("durum", { durum: "bekliyor" });
  assert.deepEqual(d.tur("gorev_sonuc").map((o) => [o.gorev_id, o.verdict, o.gorev_tur]),
    [["g-r", "REDDEDILDI", "yetenek"], ["g-b", "BASARISIZ", "yetenek"], ["g-o", "TAMAM", undefined]]);
  assert.equal(d.tur("gorev_alindi")[2].gorev_tur, undefined);
  assert.equal(d.ntfy.length, 0);
});

test("yetenek: şefin talimatında sözleşme 2. bölüm var; orkestra kuralı ve ntfy'yi bağlar", () => {
  for (const p of ["[yetenek]", "reddetme", "işçi", "test", "denetçi", "PASS", "TAMAM [gorev-id]:", "SÜRÜYOR:", "aracın adı", "yalnızca okur", "dışarı göndermez"])
    assert.ok(YETENEK_KURALI.includes(p), p);
  const k = fs.readFileSync(path.join(process.cwd(), "sunucu", "orkestra.ts"), "utf8");
  assert.ok(sefTalimati(4).split("\n").includes(YETENEK_KURALI), "şef talimatında (üretilen metin)");
  assert.match(k, /zepulAiGorevleri\(\{[\s\S]{0,400}ntfy/, "zepul-ai görevlerine ntfy verilir");
});

// ---------- Denetim bulgusu 1: sonuç kimlikle doğru göreve yazılır ----------

function duzenN() {
  const olaylar: any[] = [], ntfy: [string, string][] = [], sefe: string[] = [], sunucu: string[] = [];
  const z = zepulAiGorevleri({ yay: (o) => olaylar.push(o), sefe: (m, o) => (sefe.push(`${o} ${m}`), true), sunucudan: (m) => sunucu.push(m), ntfy: (b, m) => ntfy.push([b, m]) });
  const tur = (metin: string) => { z.olay({ ajan: "sef", tur: "metin", metin }); z.olay({ ajan: "sef", tur: "durum", durum: "bekliyor" }); };
  return { z, olaylar, ntfy, sefe, sunucu, tur, sonuclar: () => olaylar.filter((o) => o.tur === "gorev_sonuc").map((o) => [o.gorev_id, o.verdict]) };
}

test("görev kimliği: şefe giden iletide [görev: <id>] var; talimat TAMAM [gorev-id]: biçimini söyler", () => {
  const d = duzenN();
  d.z.al("README'yi güncelle", "g-o");
  assert.match(d.sefe[0], /\[görev: g-o\]/);
  for (const k of [ZEPUL_AI_KURALI, YETENEK_KURALI]) assert.match(k, /TAMAM \[gorev-id\]:/);
  assert.match(ZEPUL_AI_KURALI, /REDDEDİLDİ \[gorev-id\]:/);
  assert.match(ZEPUL_AI_KURALI, /BAŞARISIZ \[gorev-id\]:/);
});

test("görev kimliği: yetenek görevi açıkken olağan görevin kimliksiz TAMAM'ı yetenek görevini kapatmaz, ntfy gitmez, şefe 'hangi görev' notu gider", () => {
  const d = duzenN();
  d.z.al("[yetenek] istek: x; eksik: y aracı", "g-y");
  d.z.al("README'yi güncelle", "g-o");
  d.tur("TAMAM: README güncellendi.");
  assert.deepEqual(d.sonuclar(), [], "birden fazla açık görevde kimliksiz sonuç hiçbirini kapatmaz");
  assert.equal(d.ntfy.length, 0);
  assert.match(d.sunucu.at(-1)!, /hangi görev\?.*\[gorev-id\]/);
  d.tur("TAMAM [g-o]: README güncellendi.");
  assert.deepEqual(d.sonuclar(), [["g-o", "TAMAM"]], "yalnızca kimliği verilen görev kapanır");
  assert.equal(d.ntfy.length, 0, "olağan görevin TAMAM'ı 'yeni yetenek hazır' göndermez");
  d.tur("**TAMAM [g-y]:** y aracı eklendi.");
  assert.deepEqual(d.sonuclar(), [["g-o", "TAMAM"], ["g-y", "TAMAM"]]);
  assert.deepEqual(d.ntfy, [[YETENEK_NTFY.baslik, YETENEK_NTFY.mesaj]]);
});

test("görev kimliği: REDDEDİLDİ [id] ve BAŞARISIZ [id] yalnız o görevi kapatır; bilinmeyen kimlik bir şey kapatmaz; tek açık görevde eski davranış", () => {
  const d = duzenN();
  d.z.al("[yetenek] a", "g-1");
  d.z.al("b işi", "g-2");
  d.z.al("c işi", "g-3");
  d.tur("REDDEDİLDİ [g-2]: force push gerekir");
  d.tur("BAŞARISIZ [g-1]: denetçi VETO");
  d.tur("TAMAM [g-yok]: x");
  assert.deepEqual(d.sonuclar(), [["g-2", "REDDEDILDI"], ["g-1", "BASARISIZ"]]);
  assert.match(d.sunucu.at(-1)!, /g-yok/);
  d.tur("TAMAM: C işi bitti.");
  assert.deepEqual(d.sonuclar().at(-1), ["g-3", "TAMAM"], "tek açık olağan görev: kimliksiz önekli tur sonu kapatır");
});

// ---------- Denetim bulgusu 2: süre sınırı, iptal, hatırlatma, bekçi ----------

function duzenS(sureMs?: (yetenek: boolean) => number) {
  let simdi = 1_000_000;
  const olaylar: any[] = [], ntfy: unknown[] = [], sunucu: string[] = [];
  const z = zepulAiGorevleri({ yay: (o) => olaylar.push(o), sefe: () => true, sunucudan: (m) => sunucu.push(m), ntfy: (b, m) => ntfy.push([b, m]), sureMs, simdi: () => simdi });
  const tur = (metin: string) => { z.olay({ ajan: "sef", tur: "metin", metin }); z.olay({ ajan: "sef", tur: "durum", durum: "bekliyor" }); };
  return { z, olaylar, ntfy, sunucu, tur, ilerle: (ms: number) => { simdi += ms; },
    sonuclar: () => olaylar.filter((o) => o.tur === "gorev_sonuc").map((o) => [o.gorev_id, o.verdict, o.ozet]) };
}

test("süre: ayardaki süre dolunca görev BASARISIZ 'süre doldu' kapanır, şefe not gider; yetenek ve olağan görev ayrı süre", async () => {
  const d = duzenS((y) => (y ? 60 : 20));
  d.z.al("[yetenek] a", "g-y");
  d.z.al("olağan iş", "g-o");
  await new Promise((r) => setTimeout(r, 40));
  assert.deepEqual(d.sonuclar(), [["g-o", "BASARISIZ", "süre doldu"]]);
  assert.match(d.sunucu.at(-1)!, /g-o.*süre doldu/);
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(d.sonuclar().at(-1), ["g-y", "BASARISIZ", "süre doldu"]);
  assert.equal(d.ntfy.length, 0);
});

test("süre: ayar varsayılanları gorev_sure_dk 120, yetenek_gorev_sure_dk 240; şef yazamaz; orkestra ayardan bağlar", async () => {
  const { VARSAYILAN_AYAR, SEF_YAZAMAZ } = await import("../sunucu/bekci.ts");
  assert.equal(VARSAYILAN_AYAR.gorev_sure_dk, 120);
  assert.equal(VARSAYILAN_AYAR.yetenek_gorev_sure_dk, 240);
  for (const k of ["gorev_sure_dk", "yetenek_gorev_sure_dk"]) assert.ok(SEF_YAZAMAZ.includes(k), k);
  const k = fs.readFileSync(path.join(process.cwd(), "sunucu", "orkestra.ts"), "utf8");
  assert.match(k, /sureMs: \(y\) => \(y \? limit\.ayar\.yetenek_gorev_sure_dk : limit\.ayar\.gorev_sure_dk\) \* 60_000/);
});

test("iptal: görev BASARISIZ 'iptal edildi' kapanır, şefe not gider; bilinmeyen görev 404; uç panel ve zepul-ai anahtarına açık", async () => {
  const d = duzenS();
  d.z.al("[yetenek] a", "g-1");
  assert.deepEqual(d.z.iptal("g-1"), { ok: true });
  assert.deepEqual(d.sonuclar(), [["g-1", "BASARISIZ", "iptal edildi"]]);
  assert.match(d.sunucu.at(-1)!, /g-1.*iptal edildi/);
  assert.equal(d.z.iptal("g-1").kod, 404);
  const { ZEPUL_AI_UCLARI } = await import("../sunucu/baglama.ts");
  assert.ok(ZEPUL_AI_UCLARI.has("POST /api/gorev/iptal"));
  const k = fs.readFileSync(path.join(process.cwd(), "sunucu", "orkestra.ts"), "utf8");
  assert.match(k, /uc === "POST \/api\/gorev\/iptal"[\s\S]{0,400}zai\.iptal\(/);
});

test("hatırlatma: sonuç öneki olmayan ara yanıtta görev 30 dk'dan uzun açıksa şefe bir kez 'TAMAM [gorev-id]:' hatırlatması", () => {
  const d = duzenS();
  d.z.al("[yetenek] a", "g-y");
  d.tur("SÜRÜYOR: işçi çalışıyor");
  assert.equal(d.sunucu.length, 0, "30 dk dolmadan hatırlatma yok");
  d.ilerle(31 * 60_000);
  d.tur("SÜRÜYOR: hâlâ");
  assert.equal(d.sunucu.length, 1);
  assert.match(d.sunucu[0], /TAMAM \[g-y\]:/);
  d.ilerle(60 * 60_000);
  d.tur("işçi bitti, birleşti");
  assert.equal(d.sunucu.length, 1, "bir kez");
  assert.deepEqual(d.sonuclar(), []);
});

test("bekçi şefi durdurursa açık görevler BASARISIZ 'bekçi durdurdu' kapanır (sorulu olan dahil)", () => {
  const d = duzenS();
  d.z.al("[yetenek] a", "g-1");
  d.z.al("b", "g-2");
  d.z.soru("emin?", "g-2");
  d.z.olay({ ajan: "isci1", tur: "durum", durum: "durduruldu" });
  assert.deepEqual(d.sonuclar(), [], "işçinin durdurulması görev kapatmaz");
  d.z.olay({ ajan: "sef", tur: "durum", durum: "durduruldu" });
  assert.deepEqual(d.sonuclar(), [["g-1", "BASARISIZ", "bekçi durdurdu"], ["g-2", "BASARISIZ", "bekçi durdurdu"]]);
});

test("tek açık olağan görev: öneksiz ara yanıt ('Başlattım') kapatmaz, önekli yanıt kapatır", () => {
  const d = duzenN();
  d.z.al("işi yap", "g-t");
  d.tur("Başlattım, işçi çalışıyor.");
  assert.deepEqual(d.sonuclar(), []);
  d.tur("TAMAM: bitti");
  assert.deepEqual(d.sonuclar(), [["g-t", "TAMAM"]]);
});
