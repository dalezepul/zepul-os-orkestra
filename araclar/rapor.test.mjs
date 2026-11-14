import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { bildirMetni, maskele, maskeleyici, ozetle, raporUret, sinifla, siniflaNobetci, topla } from "./rapor.mjs";

const SIMDI = Date.parse("2026-09-29T12:00:00.000Z");
const oncesi = (saat) => new Date(SIMDI - saat * 3_600_000).toISOString();
const iki = (n) => String(n).padStart(2, "0");
const yerel = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${iki(d.getMonth() + 1)}-${iki(d.getDate())}T${iki(d.getHours())}:${iki(d.getMinutes())}:${iki(d.getSeconds())}`; };
const satirlar = (...l) => l.map((x) => JSON.stringify(x)).join("\n") + "\n";

function gecici() {
  const d = mkdtempSync(path.join(os.tmpdir(), "rapor-test-"));
  const yaz = (ad, icerik) => { const p = path.join(d, ad); mkdirSync(path.dirname(p), { recursive: true }); writeFileSync(p, icerik); utimesSync(p, SIMDI / 1000, SIMDI / 1000); return p; };
  return { d, yaz, temizle: () => rmSync(d, { recursive: true, force: true }) };
}
const bosKaynaklar = (d) => ({ olaylar: path.join(d, "yok1"), hatalar: path.join(d, "yok2"), golge: path.join(d, "yok3"), nobetci: path.join(d, "yok4"), oturumlar: path.join(d, "yok5") });

// ---------- Sınıflandırıcı ----------

const ORNEKLER = [
  // [açıklama, girdi, vars, beklenen kaynak, beklenen tur_adi]
  ["ETIMEDOUT → ağ", { mesaj: "connect ETIMEDOUT 1.2.3.4:443" }, {}, "ag", "zaman_asimi"],
  ["ECONNRESET → ağ", { mesaj: "read ECONNRESET" }, {}, "ag", "baglanti_koptu"],
  ["fetch failed → ağ", { mesaj: "TypeError: fetch failed" }, {}, "ag", "fetch_hatasi"],
  ["ECONNREFUSED → ağ", { mesaj: "connect ECONNREFUSED 127.0.0.1:8787" }, {}, "ag", "baglanti_kurulamadi"],
  ["WebFetch zaman aşımı → ağ", { mesaj: "The operation timed out after 60000ms" }, {}, "ag", "zaman_asimi"],
  ["rate_limit → claude-api", { tur_adi: "rate_limit", mesaj: "limit rejected" }, {}, "claude-api", "rate_limit"],
  ["HTTP 429 → claude-api", { mesaj: "Request failed (HTTP 429)" }, {}, "claude-api", "rate_limit"],
  ["overloaded → claude-api", { mesaj: "overloaded_error: Overloaded" }, {}, "claude-api", "asiri_yuk"],
  ["HTTP 503 → claude-api", { mesaj: "upstream error (HTTP 503)" }, {}, "claude-api", "http_5xx"],
  ["500 Internal Server Error → claude-api", { mesaj: "500 Internal Server Error" }, {}, "claude-api", "http_5xx"],
  ["kimlik hatası → claude-api", { mesaj: "authentication_failed" }, {}, "claude-api", "kimlik_hatasi"],
  ["Exit code → araç", { mesaj: "Exit code 2\nboom" }, {}, "arac", "komut_hatasi"],
  ["Exit code çıktısında uzaktaki anahtar sözcük yok sayılır", { mesaj: `Exit code 1\n${"x".repeat(300)} ETIMEDOUT` }, {}, "arac", "komut_hatasi"],
  ["Exit code başında ağ hatası varsa ağ", { mesaj: "Exit code 1\nnpm ERR! code ETIMEDOUT" }, {}, "ag", "zaman_asimi"],
  ["No such tool → araç", { mesaj: "<tool_use_error>Error: No such tool available: x</tool_use_error>" }, {}, "arac", "arac_yok"],
  ["açık kaynak korunur (kapı)", { kaynak: "kapi", tur_adi: "ajan_reddi", mesaj: "model yanlış" }, {}, "kapi", "ajan_reddi"],
  ["Türkçe kaynak adı → ASCII", { kaynak: "ağ", tur_adi: "x", mesaj: "y" }, {}, "ag", "x"],
  ["hiçbir kurala uymayan → bilinmiyor", { mesaj: "garip bir şey oldu" }, {}, "bilinmiyor", "bilinmiyor"],
  ["uymayan ama bağlamı araç → araç", { mesaj: "garip bir şey oldu" }, { kaynak: "arac", tur_adi: "arac_hatasi" }, "arac", "arac_hatasi"],
  ["geçersiz açık kaynak → kurala düş", { kaynak: "uydurma", mesaj: "ETIMEDOUT" }, {}, "ag", "zaman_asimi"],
];

test("sınıflandırıcı: örnek tablosu", () => {
  assert.ok(ORNEKLER.length >= 10);
  for (const [ad, girdi, vars, kaynak, tur] of ORNEKLER) {
    const s = sinifla({ ts: "2026-09-29T10:00:00.000Z", ...girdi }, vars);
    assert.equal(s.kaynak, kaynak, `${ad}: kaynak`);
    assert.equal(s.tur_adi, tur, `${ad}: tur_adi`);
  }
});

test("sınıflandırıcı: alanlar evet/hayir, boolean girdiler dönüşür, altı alan hep dolu", () => {
  const s = sinifla({ ts: "t", kaynak: "ajan", tur_adi: "oturum_coktu", mesaj: "x", geri_alinabilir: true, devam_edilebilir: false, oneri: "yeniden başlat", baglam: { ajan: "a" } });
  assert.equal(s.geri_alinabilir, "evet");
  assert.equal(s.devam_edilebilir, "hayir");
  assert.deepEqual(Object.keys(s).sort(), ["baglam", "devam_edilebilir", "geri_alinabilir", "kaynak", "mesaj", "oneri", "ts", "tur_adi"]);
  assert.equal(sinifla({ mesaj: "kimlik authentication_failed" }).devam_edilebilir, "hayir", "kural varsayılanı kullanılır");
});

test("sınıflandırıcı: mesaj ve bağlam maskelenir", () => {
  const s = sinifla({ ts: "t", mesaj: "sk-abcdefgh12345678 ve x@y.com", baglam: { yol: "C:\\Users\\ZEPUL\\Desktop\\a" } });
  assert.ok(!/sk-abcdefgh|x@y\.com/.test(s.mesaj));
  assert.equal(s.baglam.yol, "~\\Desktop\\a");
});

test("nöbetçi sınıflandırıcı", () => {
  const yerelZaman = "2026-09-27T23:03:43";
  const iptal = siniflaNobetci({ zaman: yerelZaman, tur: "iptal", ne: "yeniden başlatma", metin: "shutdown.exe yeniden başlatma başlattı" });
  assert.deepEqual([iptal.kaynak, iptal.tur_adi, iptal.baglam.hata], ["pc", "yeniden_baslatma_iptali", true]);
  assert.equal(siniflaNobetci({ zaman: yerelZaman, tur: "iptal", ne: "kapatma", metin: "x" }).tur_adi, "kapatma_iptali");
  const bek = siniflaNobetci({ zaman: yerelZaman, tur: "acilis", kullanici_mi: false, sonuc: "kapatma", metin: "program kapattı" });
  assert.deepEqual([bek.tur_adi, bek.geri_alinabilir, bek.baglam.hata], ["beklenmedik_kapanma", "hayir", true]);
  assert.equal(siniflaNobetci({ zaman: yerelZaman, tur: "acilis", kullanici_mi: true, metin: "x" }).baglam.hata, false, "kullanıcı kapatması hata değil");
  assert.equal(siniflaNobetci({ zaman: yerelZaman, tur: "kapanma", metin: "sistem kapanıyor" }).baglam.hata, false);
  assert.equal(Date.parse(iptal.ts), new Date(yerelZaman).getTime(), "saat dilimsiz zaman yerel saat sayılır");
});

// ---------- Maskeleme ----------

test("maskeleme: sır, e-posta ve kullanıcı yolu", () => {
  const girdi = "anahtar sk-ant-abcdef1234567890 token ghp_abcdefgh12345678 posta ali@firma.com.tr yol C:\\Users\\ZEPUL\\Desktop\\zepul-os\\a.js bash /c/Users/ZEPUL/x Bearer abc.def-123 api_key=SIR123 ?t=gizli-token_9";
  const s = maskele(girdi);
  for (const sir of ["sk-ant-abcdef", "ghp_abcdefgh12", "ali@firma", "ZEPUL", "abc.def-123", "SIR123", "gizli-token_9"]) assert.ok(!s.includes(sir), `sızdı: ${sir} → ${s}`);
  assert.ok(s.includes("sk-***") && s.includes("ghp_***") && s.includes("<eposta>") && s.includes("~\\Desktop\\zepul-os\\a.js"));
  assert.equal(maskele("C--Users-ZEPUL-Desktop-zepul-os"), "~-Desktop-zepul-os", "Claude proje klasörü adı");
  assert.equal(maskele("lodash@4.17.21 sürümü"), "lodash@4.17.21 sürümü", "sürüm yazımı e-posta değil");
  assert.equal(maskele("C:\\\\Users\\\\ZEPUL\\\\Desktop"), "~\\\\Desktop", "JSON'da çift ters eğik çizgi");
});

test("maskeleme W6: alt çizgi sözcük sınırı sayılmaz (APP_TOKEN, GH_TOKEN, ANTHROPIC_API_KEY)", () => {
  assert.equal(maskele("APP_TOKEN=x"), "APP_TOKEN=***");
  assert.equal(maskele("GH_TOKEN: y"), "GH_TOKEN: ***");
  assert.equal(maskele("ANTHROPIC_API_KEY=abc123"), "ANTHROPIC_API_KEY=***");
  assert.equal(maskele("export DB_PASSWORD=p4ss"), "export DB_PASSWORD=***");
  assert.equal(maskele("X_CLIENT_SECRET=s3"), "X_CLIENT_SECRET=***");
  assert.equal(maskele("KEY_sk-abcdefgh12345678"), "KEY_sk-***", "sk- öneki de alt çizgiden sonra yakalanır");
  assert.equal(maskele("notoken=1"), "notoken=1", "harf/rakam bitişikse sözcük değil, dokunulmaz");
  assert.equal(maskele("tokenizer=fast"), "tokenizer=fast");
});

// W7: gerçek `os` değerleriyle; adlar testte sabit yazılmaz, çalışma zamanında alınır.
const ad = os.userInfo().username, makine = os.hostname();
const adKisa = ad.length < 3 || makine.length < 3 ? "3 karakterden kısa ad maskelenmez" : false;

test("maskeleme W7: kullanıcı ve makine adı (os.userInfo, os.hostname, ortam) tam sözcük olarak maskelenir", { skip: adKisa }, () => {
  assert.equal(maskele(`-rw-r--r-- 1 ${ad} 197609 12 Sep 29 10:00 a.txt`), "-rw-r--r-- 1 ~ 197609 12 Sep 29 10:00 a.txt", "Git Bash ls -l sahip sütunu");
  assert.equal(maskele(`${makine}\\${ad}`), "<makine>\\~", "nöbetçi metni MAKINE\\KULLANICI");
  for (const v of [ad.toLowerCase(), ad.toUpperCase()]) assert.equal(maskele(`sahip: ${v}.`), "sahip: ~.", "harf duyarsız");
  assert.equal(maskele(`host=${makine.toLowerCase()}`), "host=<makine>");
  for (const k of ["USERNAME", "USERDOMAIN", "COMPUTERNAME"]) {
    const v = process.env[k];
    if (v && v.length >= 3) assert.ok(!maskele(`x ${v} y`).toLowerCase().includes(v.toLowerCase()), `${k} sızdı`);
  }
  // Tam sözcük: harf, rakam, "_" ya da "-" bitişikse dokunulmaz (ör. depo/proje klasörü adı).
  for (const s of [`${ad}x`, `x${ad}`, `${ad}_x`, `${ad}-proje`, `proje-${ad}`]) assert.equal(maskele(s), s, `tam sözcük değil: ${s}`);
  const n = siniflaNobetci({ zaman: "2026-09-27T23:03:43", tur: "iptal", ne: "kapatma", metin: `${makine}\\${ad} shutdown.exe başlattı`, surec: `${makine}\\${ad}` });
  assert.equal(n.mesaj, "<makine>\\~ shutdown.exe başlattı");
  assert.equal(n.baglam.surec, "<makine>\\~");
});

test("maskeleme W7: UNC, /mnt/c ve PATH içindeki kullanıcı dizinleri", { skip: adKisa }, () => {
  assert.equal(maskele("\\\\SUNUCU01\\C$\\Users\\misafir\\Desktop\\a.txt"), "~\\Desktop\\a.txt", "UNC yönetici paylaşımı");
  assert.equal(maskele(`\\\\${makine}\\C$\\Users\\${ad}\\x`), "~\\x");
  assert.equal(maskele("\\\\\\\\SUNUCU01\\\\C$\\\\Users\\\\misafir\\\\Desktop"), "~\\\\Desktop", "JSON'da çift ters eğik çizgi");
  assert.equal(maskele("//SUNUCU01/c$/users/misafir/x"), "~/x", "eğik çizgili UNC");
  assert.equal(maskele("cd /mnt/c/Users/misafir/proje"), "cd ~/proje", "WSL");
  assert.equal(maskele("PATH=/usr/bin:/c/Users/misafir/bin:/mnt/c/Users/misafir/npm:/bin"), "PATH=/usr/bin:~/bin:~/npm:/bin", "PATH içinde :/c/Users/<ad>/");
  assert.equal(maskele("PATH=C:\\Users\\misafir\\bin;C:\\Windows"), "PATH=~\\bin;C:\\Windows");
});

test("maskeleme W7: boşluklu hesap adı (sahte kimlikle) ev dizini önekiyle tam olarak ~ olur", () => {
  const m = maskeleyici({ kullanici: ["Ali Veli"], makine: ["PC-ALI"], ev: "C:\\Users\\Ali Veli" });
  assert.equal(m("C:\\Users\\Ali Veli\\Desktop\\a.txt"), "~\\Desktop\\a.txt");
  assert.equal(m("c:/users/ali veli/x"), "~/x");
  assert.equal(m("C:\\\\Users\\\\Ali Veli\\\\x"), "~\\\\x", "JSON'da çift ters eğik çizgi");
  assert.equal(m("/c/Users/Ali Veli/x"), "~/x");
  assert.equal(m("/mnt/c/Users/Ali Veli/x"), "~/x");
  assert.equal(m("C--Users-Ali-Veli-Desktop-zepul-os"), "~-Desktop-zepul-os", "Claude proje klasörü adı");
  assert.equal(m("sahip Ali Veli, host PC-ALI"), "sahip ~, host <makine>");
  assert.equal(maskeleyici({ ev: "/Users/Ali Veli" })("cat /Users/Ali Veli/x"), "cat ~/x", "macOS ev dizini");
  assert.equal(maskeleyici({ ev: "C:\\" })("C:\\Windows"), "C:\\Windows", "kök dizin ev sayılmaz");
});

// ---------- Zaman süzgeci ve toplama ----------

test("zaman aralığı süzme: yalnızca son N saat, tekilleştirme", async () => {
  const t = gecici();
  try {
    const eski = { id: "o-a-9", ts: oncesi(10), ajan: "x", tur: "hata", kaynak: "ag", tur_adi: "zaman_asimi", mesaj: "eski", geri_alinabilir: true, devam_edilebilir: true, oneri: "-" };
    const yeni = { id: "o-a-1", ts: oncesi(1), ajan: "x", tur: "hata", mesaj: "fetch failed", geri_alinabilir: true, devam_edilebilir: true, oneri: "-" };
    const gelecek = { id: "o-a-8", ts: new Date(SIMDI + 3_600_000).toISOString(), ajan: "x", tur: "hata", kaynak: "ag", tur_adi: "z", mesaj: "gelecek" };
    const kapiHatasi = { ts: oncesi(2), tur: "hata", ajan: "kapi", kaynak: "ag", tur_adi: "zaman_asimi", mesaj: "Jev zaman aşımı", geri_alinabilir: true, devam_edilebilir: true, oneri: "Jev geçidini (8787) kontrol et", baglam: { arac: "Bash" } };
    const k = { ...bosKaynaklar(t.d), olaylar: t.yaz("olaylar.jsonl", satirlar(eski, yeni, gelecek)), hatalar: t.yaz("hatalar.jsonl", satirlar(yeni, kapiHatasi) + "bozuk satır{\n") };
    const r6 = await topla({ saat: 6, simdi: SIMDI, kaynaklar: k });
    assert.equal(r6.hatalar.length, 2, "yeni (iki dosyada da, tek sayılır) + kapı hatası");
    assert.deepEqual(r6.hatalar.map((h) => h.kaynak), ["ag", "ag"]);
    const r12 = await topla({ saat: 12, simdi: SIMDI, kaynaklar: k });
    assert.equal(r12.hatalar.length, 3, "12 saatte eski de girer, gelecek girmez");
    assert.equal(ozetle(r6).jevErisimHatasi, 1);
  } finally { t.temizle(); }
});

test("Jev erişim hatası: eski ve yeni öneri metni sayılır, Laya ve ilgisiz hata sayılmaz", async () => {
  const t = gecici();
  try {
    const h = (i, oneri, mesaj = "HTTP 500") => ({ id: `o-j-${i}`, ts: oncesi(1), ajan: "isci-1", tur: "hata", kaynak: "ag", tur_adi: "http_500", mesaj, geri_alinabilir: true, devam_edilebilir: true, oneri, baglam: { ajan: "isci-1", arac: "Bash" } });
    const hatalar = satirlar(
      h(1, "Jev geçidini (8787) kontrol et"),
      h(2, "Jev bağlantısını (ZEPUL_JEV_URL, opencode.ai) ve ağı kontrol et"),
      h(3, "Jev bağlantısını (ZEPUL_JEV_URL, opencode.ai) ve ağı kontrol et", "HTTP 503"),
      h(4, "Laya sunucusunu (8788) kontrol et", "Laya (gölge): HTTP 500"),
      h(5, "Ağı kontrol et; sürerse zaman aşımını artır", "connect ETIMEDOUT"));
    const k = { ...bosKaynaklar(t.d), hatalar: t.yaz("hatalar.jsonl", hatalar) };
    const r = await topla({ saat: 6, simdi: SIMDI, kaynaklar: k });
    assert.equal(r.hatalar.length, 5);
    assert.equal(ozetle(r).jevErisimHatasi, 3, "eski 1 + yeni 2; Laya ve ilgisiz zaman aşımı yok");
  } finally { t.temizle(); }
});

test("W8: satır başındaki BOM soyulur, bozuk satır atlanır ve kaynak çipinde sayılır", async () => {
  const t = gecici();
  try {
    const h = (i) => ({ id: `o-b-${i}`, ts: oncesi(1), ajan: "x", tur: "hata", kaynak: "ag", tur_adi: "zaman_asimi", mesaj: `kayıt ${i}`, geri_alinabilir: true, devam_edilebilir: true, oneri: "-" });
    // İlk satır BOM'lu (Windows'ta Set-Content/Out-File -Encoding utf8 böyle yazar); üç bozuk satır: yarım JSON, JSON olmayan metin, nesne olmayan JSON.
    const icerik = String.fromCharCode(0xFEFF) + satirlar(h(1)) + "{\"ts\":\n" + "bozuk satır\n" + "null\n" + "\n" + satirlar(h(2));
    const kaynaklar = { ...bosKaynaklar(t.d), hatalar: t.yaz("hatalar.jsonl", icerik) };
    const r = await topla({ saat: 6, simdi: SIMDI, kaynaklar });
    assert.deepEqual(r.hatalar.map((x) => x.mesaj), ["kayıt 1", "kayıt 2"], "BOM'lu ilk satır kaybolmaz");
    const d = r.durum["logs/hatalar.jsonl"];
    assert.equal(d.kayit, 2);
    assert.equal(d.bozuk, 3, "boş satır bozuk sayılmaz");
    const { yol } = await raporUret({ saat: 6, cikti: path.join(t.d, "c"), simdi: SIMDI, kaynaklar });
    assert.match(readFileSync(yol, "utf8"), /logs\/hatalar\.jsonl: 2\/2 kayıt, 3 bozuk satır atlandı/);
    // Bozuk satır yoksa çip sessiz kalır.
    const temiz = { ...bosKaynaklar(t.d), hatalar: t.yaz("temiz.jsonl", satirlar(h(3))) };
    assert.equal((await topla({ saat: 6, simdi: SIMDI, kaynaklar: temiz })).durum["logs/hatalar.jsonl"].bozuk, 0);
    assert.ok(!/bozuk satır atlandı/.test(readFileSync((await raporUret({ saat: 6, cikti: path.join(t.d, "c2"), simdi: SIMDI, kaynaklar: temiz })).yol, "utf8")));
  } finally { t.temizle(); }
});

test("boş ya da eksik kaynaklar: hata vermez, 'kaynak yok' yazar", async () => {
  const t = gecici();
  try {
    const k = { ...bosKaynaklar(t.d), olaylar: t.yaz("olaylar.jsonl", ""), oturumlar: t.d + "/olmayan-klasor" };
    const { yol, ozet } = await raporUret({ saat: 6, cikti: path.join(t.d, "cikti"), simdi: SIMDI, kaynaklar: k });
    const html = readFileSync(yol, "utf8");
    assert.equal(ozet.toplam, 0);
    assert.equal(ozet.jevMedyanMs, null);
    assert.equal((html.match(/kaynak yok/g) ?? []).length >= 6, true, "her boş kaynak için not");
    for (const b of ["1. Özet", "2. Zaman çizelgesi", "3. Kapı kararları", "4. Laya eğitim ilerlemesi", "5. Maliyet", "6. PC olayları", "7. Claude Code oturum hataları", "8. Dikkat"]) assert.ok(html.includes(b), b);
    assert.match(path.basename(yol), /^log-raporu-\d{8}-\d{4}\.html$/);
  } finally { t.temizle(); }
});

test("kapı, Jev süresi, Laya uyumu, maliyet", async () => {
  const t = gecici();
  try {
    const kapi = (karar, neden = "k") => ({ id: "o-a-k", ts: oncesi(1), ajan: "a", tur: "kapi", karar, neden });
    // F12: sunucu gec'i panele "izin" olarak yayar; asıl karar alt_karar'da.
    const olaylar = satirlar(kapi("izin"), kapi("izin"), kapi("red"), kapi("insan"), kapi("gec", "Jev erişilemedi, auto moda bırakıldı"), { ...kapi("izin"), alt_karar: "gec" },
      { id: "o-s1-1", ts: oncesi(3), ajan: "a", tur: "maliyet", maliyet_usd: 0.1 },
      { id: "o-s1-2", ts: oncesi(2), ajan: "a", tur: "maliyet", maliyet_usd: 0.3 },
      { id: "o-s2-1", ts: oncesi(1), ajan: "a", tur: "maliyet", maliyet_usd: 0.2 },
      { id: "o-s2-2", ts: oncesi(1), ajan: "b", tur: "maliyet", maliyet_usd: 0.05 });
    const g = (ts, j, l, uyum, jm, lm) => ({ ts, arac: "Bash", jev: { secim: j, guven: 1 }, laya: { secim: l, guven: 0.5 }, uyum, jev_ms: jm, laya_ms: lm });
    const golge = satirlar(g(oncesi(1), "guvenli", "belirsiz", false, 500, 50), g(oncesi(2), "guvenli", "guvenli", true, 700, 40), g(oncesi(3), "riskli", "belirsiz", false, 600, 60), g(oncesi(30), "riskli", "riskli", true, 900, 30));
    const k = { ...bosKaynaklar(t.d), olaylar: t.yaz("olaylar.jsonl", olaylar), golge: t.yaz("golge.jsonl", golge) };
    const o = ozetle(await topla({ saat: 6, simdi: SIMDI, kaynaklar: k }));
    assert.deepEqual(o.kapi, { izin: 2, red: 1, insan: 1, gec: 2 });
    assert.equal(o.jevErisimHatasi, 1, "kapı olayındaki 'Jev erişilemedi'");
    assert.equal(o.jevMedyanMs, 600);
    assert.equal(o.golgeToplam, 4, "toplam etiketli örnek tüm dosya");
    assert.equal(o.golgePencere, 3);
    assert.equal(o.uyumOrani, 33.3);
    assert.equal(o.uyumOraniTumu, 50);
    assert.equal(Math.round(o.maliyetToplam * 100) / 100, 0.55, "a: 0.3 + 0.2 (iki sunucu oturumu) + b: 0.05");
    const r = await topla({ saat: 6, simdi: SIMDI, kaynaklar: k });
    assert.deepEqual(r.golge.tumu.matris, { guvenli: { belirsiz: 1, guvenli: 1 }, riskli: { belirsiz: 1, riskli: 1 } });
    assert.deepEqual(r.maliyet.map((m) => m.ajan), ["a", "b"]);
  } finally { t.temizle(); }
});

test("nöbetçi: yerel zaman süzgeci, bilgi kayıtları hata sayılmaz", async () => {
  const t = gecici();
  try {
    const nb = satirlar(
      { zaman: yerel(SIMDI - 2 * 3_600_000), tur: "iptal", ne: "yeniden başlatma", metin: "C:\\Windows\\system32\\shutdown.exe yeniden başlatma başlattı" },
      { zaman: yerel(SIMDI - 1 * 3_600_000), tur: "acilis", kullanici_mi: true, sonuc: "kapatma", metin: "başındaydınız" },
      { zaman: yerel(SIMDI - 20 * 3_600_000), tur: "acilis", kullanici_mi: false, metin: "eski" });
    const r = await topla({ saat: 6, simdi: SIMDI, kaynaklar: { ...bosKaynaklar(t.d), nobetci: t.yaz("nb.jsonl", nb) } });
    assert.equal(r.pc.length, 2, "aralıktaki iki kayıt listelenir");
    assert.equal(r.hatalar.length, 1, "yalnızca iptal hata sayılır");
    assert.equal(r.hatalar[0].kaynak, "pc");
  } finally { t.temizle(); }
});

test("Claude Code oturumları: hata sinyalleri, reddedilen çağrı hata değil, alt ajan ve memory", async () => {
  const t = gecici();
  try {
    const u = (ts, blok, ek = {}) => ({ type: "user", timestamp: ts, sessionId: "abcdef123456", message: { role: "user", content: [blok] }, ...ek });
    const ana = satirlar(
      { type: "assistant", timestamp: oncesi(3), sessionId: "abcdef123456", message: { content: [{ type: "tool_use", id: "t1", name: "Bash", input: {} }] } },
      u(oncesi(3), { type: "tool_result", tool_use_id: "t1", is_error: true, content: "Exit code 1\nbir şey patladı" }),
      u(oncesi(3), { type: "tool_result", tool_use_id: "t9", is_error: true, content: "Can't interact with browser-internal URLs" }, { toolDenialKind: "permission-rule" }),
      u(oncesi(3), { type: "tool_result", tool_use_id: "t9", is_error: true, content: "The user doesn't want to proceed with this tool use. The tool use was rejected." }),
      u(oncesi(2), { type: "tool_result", tool_use_id: "t2", is_error: true, content: [{ type: "text", text: "connect ETIMEDOUT" }] }),
      u(oncesi(2), { type: "tool_result", tool_use_id: "t3", is_error: false, content: "ECONNRESET geçen bir dosya içeriği: hata değil" }),
      u(oncesi(20), { type: "tool_result", tool_use_id: "t4", is_error: true, content: "Exit code 1\neski" }),
      { type: "assistant", timestamp: oncesi(1), sessionId: "abcdef123456", isApiErrorMessage: true, error: "rate_limit", message: { content: [{ type: "text", text: "API Error: 429 rate_limit" }] } });
    const alt = satirlar(u(oncesi(1), { type: "tool_result", tool_use_id: "z", is_error: true, content: "<tool_use_error>Error: No such tool available: x</tool_use_error>" }, { agentId: "agent-x" }));
    const oturumlar = path.join(t.d, "proje");
    t.yaz("proje/s1.jsonl", ana);
    t.yaz("proje/s1/subagents/agent-x.jsonl", alt);
    t.yaz("proje/memory/yok-say.jsonl", ana);
    const r = await topla({ saat: 6, simdi: SIMDI, kaynaklar: { ...bosKaynaklar(t.d), oturumlar } });
    assert.equal(r.oturum.dosya, 2, "memory klasörü atlanır");
    assert.equal(r.oturum.reddedilen, 2, "izin/plan reddi hata sayılmaz");
    assert.deepEqual(r.oturum.hatalar.map((h) => h.tur_adi).sort(), ["arac_yok", "komut_hatasi", "rate_limit", "zaman_asimi"]);
    assert.equal(r.oturum.hatalar.find((h) => h.tur_adi === "komut_hatasi").baglam.arac, "Bash", "araç adı tool_use'dan gelir");
    assert.equal(r.oturum.hatalar.find((h) => h.tur_adi === "rate_limit").kaynak, "claude-api");
    assert.equal(r.oturum.hatalar.find((h) => h.tur_adi === "zaman_asimi").kaynak, "ag");
    assert.equal(r.oturum.hatalar.find((h) => h.tur_adi === "arac_yok").baglam.ajan, "agent-x");
  } finally { t.temizle(); }
});

test("oturum etiketleri: ana, alt ajan, orkestra sayılır; denetçi ve test ayrı (F12)", async () => {
  const t = gecici();
  try {
    const hata = (ts, ek, metin = `Exit code 1\n${ek.sessionId}/${ek.agentId ?? "-"} bozuldu`) => satirlar({ type: "user", timestamp: ts, message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t", is_error: true, content: metin }] }, ...ek });
    const oturumlar = path.join(t.d, "proje");
    t.yaz("proje/ana1.jsonl", hata(oncesi(1), { entrypoint: "cli", sessionId: "ana1" }));
    t.yaz("proje/ana1/subagents/agent-d.jsonl", hata(oncesi(1), { entrypoint: "cli", sessionId: "ana1", agentId: "d" }));
    t.yaz("proje/ana1/subagents/agent-d.meta.json", JSON.stringify({ agentType: "Reality Checker", description: "Faz 1+2 bağımsız kabul testi" }));
    t.yaz("proje/ana1/subagents/agent-i.jsonl", hata(oncesi(1), { entrypoint: "cli", sessionId: "ana1", agentId: "i" }));
    t.yaz("proje/ana1/subagents/agent-i.meta.json", JSON.stringify({ agentType: "general-purpose", description: "Faz 2 düzeltme B" }));
    t.yaz("proje/ork1.jsonl", hata(oncesi(2), { entrypoint: "sdk-cli", sessionId: "ork1" }));
    t.yaz("proje/test1.jsonl", hata(oncesi(2), { entrypoint: "sdk-cli", sessionId: "test1" }) + hata(oncesi(2), { entrypoint: "sdk-cli", sessionId: "test1" }, "connect ETIMEDOUT"));
    // Orkestra oturum kimliği maliyet olayından gelir (aralık dışında olsa da).
    const olaylar = t.yaz("olaylar.jsonl", satirlar({ id: "o-s1-1", ts: oncesi(30), ajan: "sef", tur: "maliyet", maliyet_usd: 0.1, oturum: "ork1" }));
    const r = await topla({ saat: 6, simdi: SIMDI, kaynaklar: { ...bosKaynaklar(t.d), olaylar, oturumlar } });
    assert.deepEqual(r.oturum.hatalar.map((h) => h.baglam.etiket).sort(), ["alt-ajan", "ana", "orkestra"]);
    assert.deepEqual(r.oturum.ayri.map((h) => h.baglam.etiket).sort(), ["denetci", "test", "test"]);
    assert.deepEqual(r.oturum.etiket, { ana: 1, "alt-ajan": 1, orkestra: 1, denetci: 1, test: 1 });
    const o = ozetle(r);
    assert.equal(o.oturumHata, 3, "denetçi ve test sayılmaz");
    assert.equal(o.toplam, 3, "ayrı etiketlenen hatalar genel toplama da girmez");
    const { yol } = await raporUret({ saat: 6, cikti: path.join(t.d, "c"), simdi: SIMDI, kaynaklar: { ...bosKaynaklar(t.d), olaylar, oturumlar } });
    const html = readFileSync(yol, "utf8");
    assert.match(html, /Ayrı etiketlenen \(sayılmadı\): denetçi 1, test 2/);
    assert.match(html, /Sınır:/);
  } finally { t.temizle(); }
});

test("W11: 72 saatten uzun aralıkta günlük kovalar yerel gece yarısına hizalanır", async () => {
  const t = gecici();
  try {
    const yerelMs = (gun, sa, dk) => new Date(2026, 7, gun, sa, dk).getTime(); // Ağustos: DST geçişi olan bir dilim yok
    const simdi = yerelMs(20, 12, 0);
    const h = (i, ms) => ({ id: `o-g-${i}`, ts: new Date(ms).toISOString(), ajan: "x", tur: "hata", kaynak: "ag", tur_adi: "zaman_asimi", mesaj: `m${i}`, geri_alinabilir: true, devam_edilebilir: true, oneri: "-" });
    // 18'i 23:30 ile 19'u 00:30 farklı günlerdir. Kova başı 08:00'a (aralığın başına) hizalı olsaydı ikisi aynı kovaya düşerdi.
    const olaylar = t.yaz("olaylar.jsonl", satirlar(h(1, yerelMs(18, 23, 30)), h(2, yerelMs(19, 0, 30)), h(3, yerelMs(19, 10, 0))));
    const kolonlar = async (saat) => {
      const { yol } = await raporUret({ saat, cikti: path.join(t.d, `c${saat}`), simdi, kaynaklar: { ...bosKaynaklar(t.d), olaylar } });
      return [...readFileSync(yol, "utf8").matchAll(/class="col" title="([^"]*)"/g)].map((m) => m[1]);
    };
    const et = (g) => new Date(2026, 7, g).toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit" }); // etiket biçimi ICU sürümüne göre değişir
    const gun = await kolonlar(100); // 72 saati aşar: günlük
    assert.ok(gun.includes(`${et(18)}: 1 hata (ağ 1)`), `18'i tek hata: ${gun.join(" | ")}`);
    assert.ok(gun.includes(`${et(19)}: 2 hata (ağ 2)`), `19'u iki hata: ${gun.join(" | ")}`);
    assert.deepEqual(gun.map((s) => s.split(":")[0]), [16, 17, 18, 19, 20].map(et), "her sütun bir takvim günü, ilki aralığın başladığı gün");
    const saatlik = await kolonlar(24); // 72 saat ve altı: saatlik, hizalama değişmez
    assert.equal(saatlik.length, 25, "saatlik: aralığın başındaki tam saat ile bitişteki saat dahil");
    assert.match(saatlik[0], /^\d\d:00:/);
  } finally { t.temizle(); }
});

test("dikkat listesi: aynı tur_adi 3 ve üzeri", async () => {
  const t = gecici();
  try {
    const h = (i, tur) => ({ id: `o-a-${i}`, ts: oncesi(1), ajan: "x", tur: "hata", kaynak: "ag", tur_adi: tur, mesaj: `m${i}`, geri_alinabilir: true, devam_edilebilir: true, oneri: "-" });
    const k = { ...bosKaynaklar(t.d), olaylar: t.yaz("o.jsonl", satirlar(h(1, "a"), h(2, "a"), h(3, "a"), h(4, "b"), h(5, "b"))) };
    const o = ozetle(await topla({ saat: 6, simdi: SIMDI, kaynaklar: k }));
    assert.deepEqual(o.dikkat.map((x) => [x.tur_adi, x.adet]), [["a", 3]]);
    assert.deepEqual(o.enSik.map((x) => x.tur_adi), ["a", "b"]);
  } finally { t.temizle(); }
});

// ---------- HTML ve bildirim ----------

test("HTML: kaçış, sır sızıntısı yok, tek dosya", async () => {
  const t = gecici();
  try {
    const kotu = { id: "o-a-1", ts: oncesi(1), ajan: "x", tur: "hata", kaynak: "arac", tur_adi: "<img src=x onerror=alert(1)>", mesaj: "<script>alert(1)</script> sk-abcdefgh12345678 me@x.com C:\\Users\\ZEPUL\\Desktop\\gizli", geri_alinabilir: false, devam_edilebilir: true, oneri: "-" };
    const { yol, ozet } = await raporUret({ saat: 6, cikti: path.join(t.d, "c"), simdi: SIMDI, kaynaklar: { ...bosKaynaklar(t.d), olaylar: t.yaz("o.jsonl", satirlar(kotu)) } });
    const html = readFileSync(yol, "utf8");
    assert.ok(!html.includes("<script>alert") && !html.includes("<img src=x"), "HTML kaçırılmalı");
    assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
    for (const sir of ["sk-abcdefgh12345678", "me@x.com", "ZEPUL"]) assert.ok(!html.includes(sir), `sızdı: ${sir}`);
    assert.ok(!/<link[^>]+href=|<script[^>]+src=|https?:\/\/(?!ntfy)/.test(html.replace(/<style>[\s\S]*?<\/style>/, "")), "dış bağımlılık yok");
    const json = JSON.parse(/<script type="application\/json" id="veri">([\s\S]*?)<\/script>/.exec(html)[1]);
    assert.equal(json.ozet.toplam, 1);
    assert.equal(ozet.geriAlinamaz, 1);
    assert.match(html, /prefers-color-scheme:\s*dark/);
    assert.match(html, /name="viewport"/);
  } finally { t.temizle(); }
});

test("bildirim metni: tek satır, yalnızca sayılar, başlık standardı", () => {
  const ozet = { saat: 6, toplam: 4, kaynak: { ag: 3, pc: 1, "claude-api": 0 }, geriAlinamaz: 1, devamEdilemez: 0, kapi: { izin: 5, red: 1, insan: 2, gec: 0 } };
  const b = bildirMetni(ozet);
  assert.equal(b.baslik, "Zepul OS: uyarı: log raporu");
  assert.equal(bildirMetni({ ...ozet, geriAlinamaz: 0 }).baslik, "Zepul OS: bilgilendirme: log raporu");
  assert.ok(!b.mesaj.includes("\n") && !/[\\/]/.test(b.mesaj), "tek satır, yol yok");
  assert.ok(/^[^:]+: [^:]+: .+/.test(b.baslik));
  assert.match(b.mesaj, /4 hata \(ag 3, pc 1\)/);
});

test("yavaş araçlar: sure_ms taşıyan arac_sonuc en yavaştan sıralanır, rapora yazılır", async () => {
  const t = gecici();
  try {
    const l = [
      { id: "o-a-1", ts: oncesi(2), ajan: "x", tur: "arac", arac_id: "t1", arac: "Bash" },
      { id: "o-a-2", ts: oncesi(2), ajan: "x", tur: "arac_sonuc", arac_id: "t1", basarili: true, sure_ms: 170000 },
      { id: "o-a-3", ts: oncesi(1), ajan: "x", tur: "arac", arac_id: "t2", arac: "Edit" },
      { id: "o-a-4", ts: oncesi(1), ajan: "x", tur: "arac_sonuc", arac_id: "t2", basarili: true, sure_ms: 900 },
      { id: "o-a-5", ts: oncesi(1), ajan: "x", tur: "arac_sonuc", arac_id: "t3", basarili: true },
    ];
    const k = { ...bosKaynaklar(t.d), olaylar: t.yaz("o.jsonl", satirlar(...l)) };
    assert.deepEqual((await topla({ saat: 6, simdi: SIMDI, kaynaklar: k })).yavas.map((y) => [y.arac, y.sure_ms]), [["Bash", 170000], ["Edit", 900]]);
    const { yol } = await raporUret({ saat: 6, cikti: path.join(t.d, "c"), simdi: SIMDI, kaynaklar: k });
    assert.match(readFileSync(yol, "utf8"), /En yavaş 10 araç[\s\S]*170\.0/);
  } finally { t.temizle(); }
});
