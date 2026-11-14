// sunucu/hafiza.ts testleri. Çalıştırma: npm test
// Yazma testleri sahte `calistir` ile yapılır; gerçek vault'a HİÇBİR ŞEY yazılmaz.
// Tek gerçek çağrı: baglamAl("zepul orkestra") (context --no-sync, yalnızca okuma). Vault yoksa o test atlanır.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { katipNotYaz, baglamAl, receiptGonder, notYaz, esitle, saglik, sefBaglamMetni, fazReceiptOlustur, RECEIPT_REF, ZAMAN_ASIMI_MS, type BeyinBag } from "../sunucu/hafiza.ts";

type Cagri = { komut: string; args: string[]; cwd: string; ms: number; dosya?: string; icerik?: unknown; dosyaVarMiydi?: boolean };
type Yanit = string | Error | ((c: Cagri) => string);

// Sahte calistir: çağrıları kaydeder, --file varsa içeriği ve var oluşunu çağrı anında okur.
function sahte(yanit: Yanit = "{}") {
  const cagrilar: Cagri[] = [];
  const calistir = async (komut: string, args: string[], cwd: string, ms: number): Promise<string> => {
    const c: Cagri = { komut, args, cwd, ms };
    const i = args.indexOf("--file");
    if (i >= 0) {
      c.dosya = args[i + 1];
      c.dosyaVarMiydi = fs.existsSync(c.dosya);
      if (c.dosyaVarMiydi) c.icerik = JSON.parse(fs.readFileSync(c.dosya, "utf8"));
    }
    cagrilar.push(c);
    const y = typeof yanit === "function" ? yanit(c) : yanit;
    if (y instanceof Error) throw y;
    return y;
  };
  return { cagrilar, calistir };
}

const VAULT = "X:\\sahte-vault";
const ok = JSON.stringify({ status: "succeeded" });
const bag = (s: { calistir: BeyinBag["calistir"] }, ek: Partial<BeyinBag> = {}): BeyinBag => ({ calistir: s.calistir, vault: VAULT, ...ek });

// ---------- baglamAl ----------

test("baglamAl: argüman dizisi, cwd ve zaman aşımı", async () => {
  const s = sahte(JSON.stringify({ records: [], citations: [] }));
  await baglamAl("zepul orkestra", {}, bag(s));
  assert.equal(s.cagrilar.length, 1);
  const c = s.cagrilar[0];
  assert.equal(c.komut, "py");
  assert.deepEqual(c.args, ["-3", path.join(VAULT, "beyin.py"), "context", "zepul orkestra", "--budget-chars", "5000", "--harness", "claude", "--no-sync", "--json"]);
  assert.equal(c.cwd, os.tmpdir());
  assert.equal(c.ms, ZAMAN_ASIMI_MS);
  assert.equal(ZAMAN_ASIMI_MS, 30_000);
});

test("baglamAl: bütçe, proje ve özel python; geçersiz bütçe varsayılana düşer", async () => {
  const s = sahte(JSON.stringify({ records: [] }));
  await baglamAl("konu", { butce: 2000, proje: "zepul-os" }, bag(s, { python: ["python"] }));
  assert.equal(s.cagrilar[0].komut, "python");
  assert.deepEqual(s.cagrilar[0].args, [path.join(VAULT, "beyin.py"), "context", "konu", "--budget-chars", "2000", "--harness", "claude", "--no-sync", "--project", "zepul-os", "--json"]);
  await baglamAl("konu", { butce: -5 }, bag(s));
  assert.ok(s.cagrilar[1].args.includes("5000"));
  await baglamAl("konu", { butce: 1.5 }, bag(s));
  assert.ok(s.cagrilar[2].args.includes("5000"));
});

test("baglamAl: vault sırası b.vault > ZEPUL_BEYIN_VAULT > varsayılan", async () => {
  const eski = process.env.ZEPUL_BEYIN_VAULT;
  try {
    const s = sahte(JSON.stringify({ records: [] }));
    process.env.ZEPUL_BEYIN_VAULT = "Y:\\env-vault";
    await baglamAl("a", {}, { calistir: s.calistir });
    assert.equal(s.cagrilar[0].args[1], path.join("Y:\\env-vault", "beyin.py"));
    await baglamAl("a", {}, { calistir: s.calistir, vault: VAULT });
    assert.equal(s.cagrilar[1].args[1], path.join(VAULT, "beyin.py"));
    delete process.env.ZEPUL_BEYIN_VAULT;
    await baglamAl("a", {}, { calistir: s.calistir });
    assert.equal(s.cagrilar[2].args[1], path.join("C:\\Users\\ZEPUL\\Desktop\\MyBrain", "beyin.py"));
  } finally {
    if (eski === undefined) delete process.env.ZEPUL_BEYIN_VAULT; else process.env.ZEPUL_BEYIN_VAULT = eski;
  }
});

test("baglamAl: sorgu sadeleşir, baştaki '-' atılır, 500 karaktere kırpılır; boş sorguda CLI çağrılmaz", async () => {
  const s = sahte(JSON.stringify({ records: [] }));
  await baglamAl("  - iki   satır\n sorgu ", {}, bag(s));
  assert.equal(s.cagrilar[0].args[3], "iki satır sorgu");
  await baglamAl("x".repeat(900), {}, bag(s));
  assert.equal(s.cagrilar[1].args[3].length, 500);
  const hatalar: string[] = [];
  assert.equal(await baglamAl("  - ", {}, bag(s, { hata: (m) => hatalar.push(m) })), null);
  assert.equal(s.cagrilar.length, 2);
  assert.equal(hatalar.length, 1);
});

test("baglamAl: kayıtları metne, atıfları tekilleştirilmiş kaynak listesine çevirir; CRLF sadeleşir", async () => {
  const s = sahte(JSON.stringify({
    records: [
      { source: "knowledge/concepts/orkestra.md", text: "Satır 1\r\nSatır 2\r\n" },
      { source: "knowledge/index.md", text: "  dizin  " },
      { source: 5, text: "atlanır" },
    ],
    citations: [{ source: "knowledge/concepts/orkestra.md" }, { source: "knowledge/index.md" }],
  }));
  const r = await baglamAl("zepul orkestra", {}, bag(s));
  assert.deepEqual(r, {
    metin: "### knowledge/concepts/orkestra.md\nSatır 1\nSatır 2\n\n### knowledge/index.md\ndizin",
    kaynaklar: ["knowledge/concepts/orkestra.md", "knowledge/index.md"],
  });
});

test("baglamAl: eşleşme yoksa hata değil, boş sonuç", async () => {
  const s = sahte(JSON.stringify({ records: [], citations: [], abstained: true }));
  assert.deepEqual(await baglamAl("olmayan konu", {}, bag(s)), { metin: "", kaynaklar: [] });
});

// Kullanıcı kararı 27.10.2026: genel sır kalıpları maskelenmez.
test("baglamAl: genel sır kalıpları maskelenmez (sk-, ghp_, Bearer, api_key)", async () => {
  const s = sahte(JSON.stringify({ records: [{
    source: "knowledge/x.md",
    text: "anahtar sk-abcdefgh12345678 ve ghp_ABCDEFGH12345678 ile Bearer abc.def-123 ve api_key=gizli123",
  }] }));
  const r = await baglamAl("x", {}, bag(s));
  assert.ok(r);
  for (const sir of ["sk-abcdefgh12345678", "ghp_ABCDEFGH12345678", "abc.def-123", "gizli123"]) assert.ok(r.metin.includes(sir), `maskelenmemeliydi: ${sir}`);
});

test("baglamAl: hata olunca null; sebep b.hata'ya gider", async () => {
  const hatalar: string[] = [];
  const bagHata = (s: { calistir: BeyinBag["calistir"] }) => bag(s, { hata: (m) => hatalar.push(m) });
  assert.equal(await baglamAl("x", {}, bagHata(sahte(new Error("zaman aşımı (30000 ms), süreç ağacı öldürüldü")))), null);
  assert.equal(await baglamAl("x", {}, bagHata(sahte("bu json değil"))), null);
  assert.equal(await baglamAl("x", {}, bagHata(sahte("{}"))), null);
  assert.equal(await baglamAl("x", {}, bagHata(sahte("null"))), null);
  assert.equal(await baglamAl("x", {}, bagHata(sahte(new Error("Command failed: py -3 beyin.py context x\n{\"error\":\"RuntimeError\",\"message\":\"Bearer abc123def456\"}")))), null);
  assert.equal(hatalar.length, 5);
  assert.ok(hatalar.every((m) => m.startsWith("MyBrain context: ")));
  assert.match(hatalar[0], /zaman aşımı/);
  assert.ok(!hatalar[4].includes("Command failed"), "komut satırı gürültüsü atılmalı");
});

// ---------- receiptGonder ----------

const RECEIPT = { event_id: "zepul-orkestra-faz4-20260929", summary: "Faz 4 bitti.\nÖğrenilen: yok", refs: [RECEIPT_REF] };

test("receiptGonder: argümanlar, geçici dosya içeriği, dosyanın (ve klasörünün) silinmesi", async () => {
  const s = sahte(ok);
  assert.equal(await receiptGonder(RECEIPT, bag(s)), true);
  const c = s.cagrilar[0];
  assert.equal(c.komut, "py");
  assert.deepEqual(c.args, ["-3", path.join(VAULT, "beyin.py"), "receipt", "--file", c.dosya, "--harness", "claude", "--json"]);
  assert.equal(c.dosyaVarMiydi, true, "dosya çağrı anında var olmalı");
  assert.deepEqual(c.icerik, RECEIPT);
  assert.ok(path.resolve(c.dosya!).startsWith(path.resolve(os.tmpdir())), "geçici dosya repo dışında (os.tmpdir) olmalı");
  assert.ok(!path.resolve(c.dosya!).startsWith(path.resolve(process.cwd())), "geçici dosya repo içinde olmamalı");
  assert.equal(fs.existsSync(c.dosya!), false, "dosya silinmeli");
  assert.equal(fs.existsSync(path.dirname(c.dosya!)), false, "geçici klasör silinmeli");
});

test("receiptGonder: dosya UTF-8 ve BOM'suz (Türkçe karakterler bozulmaz)", async () => {
  let ham = Buffer.alloc(0);
  const s = sahte((c) => { ham = fs.readFileSync(c.args[c.args.indexOf("--file") + 1]); return ok; });
  await receiptGonder({ ...RECEIPT, summary: "çğıİöşü tamam" }, bag(s));
  assert.notDeepEqual([...ham.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.equal(JSON.parse(ham.toString("utf8")).summary, "çğıİöşü tamam");
});

test("receiptGonder: hata (reddedilen söz, çıkış kodu, beklenmeyen durum, bozuk çıktı) false döner ve dosya yine silinir", async () => {
  for (const y of [new Error("Command failed: py\n{\"error\":\"ValueError\"}"), '{"status":"conflict"}', "json değil", "{}"] as Yanit[]) {
    const hatalar: string[] = [];
    const s = sahte(y);
    assert.equal(await receiptGonder(RECEIPT, bag(s, { hata: (m) => hatalar.push(m) })), false);
    assert.equal(hatalar.length, 1);
    assert.equal(fs.existsSync(s.cagrilar[0].dosya!), false);
    assert.equal(fs.existsSync(path.dirname(s.cagrilar[0].dosya!)), false);
  }
});

test("receiptGonder: özette yalnız panel belirteci maskelenir, event_id ve refs olduğu gibi gider", async () => {
  const s = sahte(ok);
  await receiptGonder({ ...RECEIPT, summary: "token sk-abcdefgh12345678 sızdı; ?t=panelbelirteci" }, bag(s));
  const ic = s.cagrilar[0].icerik as { event_id: string; summary: string; refs: string[] };
  assert.ok(ic.summary.includes("sk-abcdefgh12345678"), "genel sır maskelenmez");
  assert.ok(!ic.summary.includes("panelbelirteci"));
  assert.equal(ic.event_id, RECEIPT.event_id);
  assert.deepEqual(ic.refs, RECEIPT.refs);
});

test("receiptGonder: aynı event_id + aynı gövde tekrar gönderilebilir (idempotent); farklı gövde çakışır", async () => {
  // MyBrain kuralının küçük modeli: aynı id + aynı summary/refs kabul, farklı gövde "event id collision".
  const kayit = new Map<string, string>();
  const s = sahte((c) => {
    const e = c.icerik as { event_id: string; summary: string; refs: string[] };
    const govde = JSON.stringify([e.summary, e.refs]);
    const eski = kayit.get(e.event_id);
    if (eski !== undefined && eski !== govde) throw new Error("Command failed: py\n{\"error\":\"ReceiptConflict\",\"message\":\"event id collision\"}");
    kayit.set(e.event_id, govde);
    return ok;
  });
  const b = bag(s);
  assert.equal(await receiptGonder(RECEIPT, b), true);
  assert.equal(await receiptGonder(RECEIPT, b), true);
  assert.equal(await receiptGonder({ ...RECEIPT }, b), true);
  assert.equal(await receiptGonder({ ...RECEIPT, summary: "başka özet" }, b), false);
  assert.equal(await receiptGonder({ ...RECEIPT, event_id: "zepul-orkestra-faz4-rapor-20260929", summary: "başka özet" }, b), true);
});

// ---------- notYaz ----------

const NOT = { source: "knowledge/concepts/zepul-orkestra-hafiza.md", text: "Kalıcı karar: hafıza MyBrain'dir.", metadata: { kind: "fact", project: "zepul-os" } };

test("notYaz: argümanlar, geçici dosya içeriği (visibility internal), dosyanın silinmesi", async () => {
  const s = sahte(ok);
  assert.equal(await notYaz(NOT, bag(s)), true);
  const c = s.cagrilar[0];
  assert.deepEqual(c.args, ["-3", path.join(VAULT, "beyin.py"), "note-create", "--file", c.dosya, "--json"]);
  assert.equal(c.dosyaVarMiydi, true);
  assert.deepEqual(c.icerik, { source: NOT.source, text: NOT.text, metadata: { kind: "fact", project: "zepul-os", visibility: "internal" } });
  assert.equal(fs.existsSync(c.dosya!), false);
  assert.equal(fs.existsSync(path.dirname(c.dosya!)), false);
});

test("notYaz: genel sır maskelenmez, panel belirteci maskelenir", async () => {
  const s = sahte(ok);
  await notYaz({ ...NOT, text: "anahtar ghp_ABCDEFGH12345678 ?t=panelbelirteci" }, bag(s));
  const t = (s.cagrilar[0].icerik as { text: string }).text;
  assert.ok(t.includes("ghp_ABCDEFGH12345678"));
  assert.ok(!t.includes("panelbelirteci"));
});

test("notYaz: hata olunca false döner ve dosya silinir", async () => {
  for (const y of [new Error("Command failed: py\nsource exists"), '{"status":"failed"}', "json değil"] as Yanit[]) {
    const s = sahte(y);
    assert.equal(await notYaz(NOT, bag(s)), false);
    assert.equal(fs.existsSync(path.dirname(s.cagrilar[0].dosya!)), false);
  }
});

test("notYaz: knowledge/ dışı ya da güvensiz source reddedilir; MyBrain çağrılmaz", async () => {
  const kotu = ["notes/x.md", "tasks/x.md", "../knowledge/x.md", "knowledge/../notes/x.md", "knowledge/./x.md", "/knowledge/x.md",
    "C:\\knowledge\\x.md", "C:/knowledge/x.md", "knowledge\\x.md", "knowledge/x.txt", "knowledge/x", "Knowledge/x.md", "knowledge/",
    "knowledge/.md/", "", "x/knowledge/x.md", "knowledge/v3/outcomes.md", "knowledge//x.md", "knowledge/a\0b.md"];
  const s = sahte(ok);
  const hatalar: string[] = [];
  for (const source of kotu) {
    assert.equal(await notYaz({ ...NOT, source }, bag(s, { hata: (m) => hatalar.push(m) })), false, `kabul edildi: ${JSON.stringify(source)}`);
  }
  assert.equal(s.cagrilar.length, 0, "reddedilen not için MyBrain çağrılmamalı");
  assert.equal(hatalar.length, kotu.length);
  for (const source of ["knowledge/x.md", "knowledge/concepts/x.md", "knowledge/connections/a-b.md"]) {
    assert.equal(await notYaz({ ...NOT, source }, bag(s)), true, `reddedildi: ${source}`);
  }
  assert.equal(s.cagrilar.length, 3);
});

// ---------- esitle ----------

test("esitle: sync argümanı; succeeded ve degraded true, conflict ve hata false", async () => {
  const s = sahte('{"status":"succeeded","indexed":9}');
  assert.equal(await esitle(bag(s)), true);
  assert.deepEqual(s.cagrilar[0].args, ["-3", path.join(VAULT, "beyin.py"), "sync", "--json"]);
  assert.equal(await esitle(bag(sahte('{"status":"degraded","warnings":["x"]}'))), true);
  assert.equal(await esitle(bag(sahte('{"status":"conflict"}'))), false);
  assert.equal(await esitle(bag(sahte(new Error("zaman aşımı")))), false);
  assert.equal(await esitle(bag(sahte("json değil"))), false);
});

// ---------- saglik ----------

test("saglik: doctor argümanı; observed_metadata, never_seen ve pending temiz", async () => {
  const s = sahte(JSON.stringify({ status: "observed_metadata", pending_events: 0, companion_hygiene: { over_limit: [] } }));
  const r = await saglik(bag(s));
  assert.deepEqual(s.cagrilar[0].args, ["-3", path.join(VAULT, "beyin.py"), "doctor", "--json"]);
  assert.equal(r.temiz, true);
  assert.match(r.ozet, /observed_metadata/);
  assert.equal((await saglik(bag(sahte(JSON.stringify({ status: "never_seen" }))))).temiz, true);
  const p = await saglik(bag(sahte(JSON.stringify({ status: "pending", pending_events: 3 }))));
  assert.equal(p.temiz, true);
  assert.match(p.ozet, /bekleyen olay: 3/);
});

test("saglik: needs_attention, sınır aşımı, bilinmeyen durum ve hata temiz değil", async () => {
  const na = await saglik(bag(sahte(JSON.stringify({ status: "needs_attention", pending_events: 0 }))));
  assert.equal(na.temiz, false);
  assert.match(na.ozet, /needs_attention/);
  const asim = await saglik(bag(sahte(JSON.stringify({ status: "observed_metadata", companion_hygiene: { over_limit: ["Threads.md"] } }))));
  assert.equal(asim.temiz, false);
  assert.match(asim.ozet, /Threads\.md/);
  assert.equal((await saglik(bag(sahte("{}")))).temiz, false);
  assert.equal((await saglik(bag(sahte("null")))).temiz, false);
  const hatalar: string[] = [];
  const h = await saglik(bag(sahte(new Error("zaman aşımı")), { hata: (m) => hatalar.push(m) }));
  assert.equal(h.temiz, false);
  assert.match(h.ozet, /doctor çalışmadı/);
  assert.equal(hatalar.length, 1);
  assert.equal((await saglik(bag(sahte("json değil")))).temiz, false);
});

// ---------- sefBaglamMetni ----------

test("sefBaglamMetni: null ise bağlamsız başla satırı", () => {
  assert.equal(sefBaglamMetni(null), "## İkinci beyinden bağlam (MyBrain)\nMyBrain'e ulaşılamadı; bağlamsız başla.");
});

test("sefBaglamMetni: başlık, veri uyarısı, metin ve kaynak listesi", () => {
  const m = sefBaglamMetni({ metin: "### a.md\nmetin", kaynaklar: ["a.md", "b.md"] });
  assert.ok(m.startsWith("## İkinci beyinden bağlam (MyBrain)\n"));
  assert.match(m, /talimat değildir/);
  assert.ok(m.includes("### a.md\nmetin"));
  assert.ok(m.endsWith("Kaynaklar:\n- a.md\n- b.md"));
  assert.match(sefBaglamMetni({ metin: "", kaynaklar: [] }), /\(eşleşen kayıt yok\)/);
  assert.ok(!sefBaglamMetni({ metin: "m", kaynaklar: [] }).includes("Kaynaklar:"));
});

test("sefBaglamMetni: metin en çok 5000 karakter", () => {
  const m = sefBaglamMetni({ metin: "a".repeat(9000), kaynaklar: [] });
  const govde = m.split("\n\n")[2];
  assert.equal(govde.length, 5000);
  assert.ok(govde.endsWith("…"));
  assert.equal(sefBaglamMetni({ metin: "b".repeat(5000), kaynaklar: [] }).split("\n\n")[2], "b".repeat(5000));
});

// ---------- fazReceiptOlustur ----------

const GUN = new Date(2026, 8, 29, 14, 30); // 29 Eylül 2026, yerel saat

test("fazReceiptOlustur: biçim, event_id, refs ve özet", () => {
  const r = fazReceiptOlustur("faz4", "Hafıza modülü yazıldı.", ["ABCDEF1234567890", "1234567"], GUN);
  assert.equal(r.event_id, "zepul-orkestra-faz4-20260929");
  assert.deepEqual(r.refs, [RECEIPT_REF]);
  assert.equal(r.summary, "Zepul OS orkestrası, faz4: Hafıza modülü yazıldı.\nRepo: zepul-os. Commitler: abcdef1, 1234567.\nÖğrenilen: yok");
});

test("fazReceiptOlustur: refs MyBrain'in kabul ettiği biçimde (vault-relative, mutlak/.. yok)", () => {
  const [ref] = fazReceiptOlustur("f", "x", []).refs;
  assert.ok(!path.isAbsolute(ref) && !ref.includes("\\") && !ref.split("/").includes(".."));
  assert.ok(ref.startsWith("knowledge/") && ref.endsWith(".md"));
});

test("fazReceiptOlustur: event_id idempotent (aynı faz+gün aynı), gün ve faz değişince değişir", () => {
  const a = fazReceiptOlustur("faz4", "özet", ["abcdef1"], GUN);
  assert.deepEqual(fazReceiptOlustur("faz4", "özet", ["abcdef1"], new Date(2026, 8, 29, 23, 59)), a);
  assert.equal(fazReceiptOlustur("faz4", "özet", ["abcdef1"], new Date(2026, 8, 30)).event_id, "zepul-orkestra-faz4-20260930");
  assert.equal(fazReceiptOlustur("Faz 4 / Rapor!", "özet", [], GUN).event_id, "zepul-orkestra-faz-4-rapor-20260929");
  assert.equal(fazReceiptOlustur("FAZ 4", "özet", [], GUN).event_id, fazReceiptOlustur("faz 4", "özet", [], GUN).event_id);
  assert.equal(fazReceiptOlustur("!!!", "özet", [], GUN).event_id, "zepul-orkestra-faz-20260929");
  assert.equal(fazReceiptOlustur("faz4", "özet", [], new Date(2026, 0, 5)).event_id, "zepul-orkestra-faz4-20260105");
});

test("fazReceiptOlustur: geçersiz commit atılır, tekrar teklenir; commit yoksa 'yok'", () => {
  const r = fazReceiptOlustur("f", "x", ["feat: bir şey", "ABCDEF1", "abcdef1234", "zzzzzzz", " 1234567 ", ""], GUN);
  assert.match(r.summary, /Commitler: abcdef1, 1234567\./);
  assert.match(fazReceiptOlustur("f", "x", [], GUN).summary, /Commitler: yok\./);
});

test("fazReceiptOlustur: özet 1200 karakterde kırpılır; verilmiş 'Öğrenilen:' satırı korunur ve tekrarlanmaz", () => {
  const uzun = fazReceiptOlustur("f", "u".repeat(5000), [], GUN);
  assert.ok(uzun.summary.split("\n")[0].length <= "Zepul OS orkestrası, f: ".length + 1200);
  assert.ok(uzun.summary.includes("…"));
  const oz = fazReceiptOlustur("f", "iş bitti\nÖğrenilen: kalıcı hafıza MyBrain'dedir", [], GUN);
  assert.equal(oz.summary.match(/Öğrenilen:/g)?.length, 1);
  assert.ok(!oz.summary.includes("Öğrenilen: yok"));
});

test("fazReceiptOlustur → receiptGonder: üretilen gövde olduğu gibi geçici dosyaya yazılır", async () => {
  const r = fazReceiptOlustur("faz4", "Hafıza bağlandı.", ["abcdef1"], GUN);
  const s = sahte(ok);
  assert.equal(await receiptGonder(r, bag(s)), true);
  assert.deepEqual(s.cagrilar[0].icerik, r);
});

// ---------- gerçek okuma (tek sefer, yalnızca context --no-sync) ----------

const GERCEK_VAULT = process.env.ZEPUL_BEYIN_VAULT || "C:\\Users\\ZEPUL\\Desktop\\MyBrain";
test("baglamAl gerçek vault: metin dolu, orkestra.md kaynaklarda (içerik yazılmaz, yalnızca sayılar)", { skip: !fs.existsSync(path.join(GERCEK_VAULT, "beyin.py")) && "MyBrain vault bu makinede yok", timeout: 60_000 }, async (t) => {
  const hatalar: string[] = [];
  const r = await baglamAl("zepul orkestra", {}, { hata: (m) => hatalar.push(m) });
  assert.ok(r, `baglamAl null döndü: ${hatalar.join(" | ")}`);
  assert.ok(r.metin.trim().length > 0, "metin boş olmamalı");
  assert.ok(r.kaynaklar.some((k) => k.endsWith("orkestra.md")), "orkestra.md kaynaklarda görünmeli");
  t.diagnostic(`gerçek context: metin uzunluğu ${r.metin.length}, kaynak sayısı ${r.kaynaklar.length}`);
  assert.ok(sefBaglamMetni(r).length > 0);
});

// ---------- katipNotYaz: task-create çıktısı görev kaydıdır (status = görev durumu) ----------
const gorev = { source: "tasks/x.md", text: "yap", metadata: { id: "x", title: "X", kind: "task", revision: 1, status: "active", owner: "kullanıcı" } };

test("katipNotYaz task: görev kaydı (status görev durumu + id) başarı sayılır", async () => {
  for (const durum of ["inbox", "active", "waiting", "blocked", "done", "cancelled"]) {
    const s = sahte(JSON.stringify({ id: "x", status: durum, source: "tasks/x.md" }));
    assert.deepEqual(await katipNotYaz({ tur: "task", veri: gorev }, bag(s)), { tamam: true, id: "x" }, durum);
  }
});

test("katipNotYaz task: failed, kimliksiz kayıt ve succeeded hata; note-create görev durumunu kabul etmez", async () => {
  for (const c of [{ status: "failed" }, { status: "active" }, { id: "", status: "active" }, { id: "x", status: "succeeded" }]) {
    const r = await katipNotYaz({ tur: "task", veri: gorev }, bag(sahte(JSON.stringify(c))));
    assert.equal(r.tamam, false, JSON.stringify(c));
  }
  const not = { source: "notes/x.md", text: "t", metadata: {} };
  assert.equal((await katipNotYaz({ tur: "note", veri: not }, bag(sahte(JSON.stringify({ id: "x", status: "active" }))))).tamam, false);
});

// ---------- katipNotYaz: task-update (revizyonlu görev düzenleme) ----------
const guncelle = (veri: unknown) => ({ tur: "task-update", veri });
const duzenlenen = { id: "x", expected_revision: 1, changes: { status: "done", title: "Y", text: "z", due: "2026-10-20" } };

test("katipNotYaz task-update: task-update komutu çağrılır, değişiklikler geçici dosyaya gider", async () => {
  const s = sahte(JSON.stringify({ id: "x", status: "done", revision: 2 }));
  assert.deepEqual(await katipNotYaz(guncelle(duzenlenen), bag(s)), { tamam: true, id: "x" });
  assert.equal(s.cagrilar.length, 1);
  const c = s.cagrilar[0];
  assert.equal(c.args[2], "task-update");
  assert.ok(c.dosyaVarMiydi);
  const i = c.icerik as { id: string; expected_revision: number; changes: Record<string, unknown> };
  assert.equal(i.id, "x");
  assert.equal(i.expected_revision, 1);
  assert.equal(i.changes.status, "done");
  assert.equal(i.changes.title, "Y");
  assert.equal(i.changes.due_at, "2026-10-20");
  assert.equal("due" in i.changes, false);
  assert.equal(i.changes.text, "z");
});

test("katipNotYaz task-update: geçersiz girdi MyBrain çağrılmadan 400", async () => {
  const kotu: unknown[] = [
    { ...duzenlenen, changes: { priority: "high" } },                 // izin dışı anahtar
    { ...duzenlenen, changes: { status: "done", owner: "x" } },
    { ...duzenlenen, changes: { status: "bitti" } },                  // geçersiz durum
    { ...duzenlenen, changes: {} },                                   // boş değişiklik
    { ...duzenlenen, changes: [] },
    { ...duzenlenen, changes: { title: 5 } },
    { ...duzenlenen, expected_revision: "1" },
    { ...duzenlenen, expected_revision: 1.5 },
    { ...duzenlenen, expected_revision: -1 },
    { ...duzenlenen, id: "" },
    { ...duzenlenen, id: 7 },
    { changes: { status: "done" }, expected_revision: 1 },
  ];
  for (const v of kotu) {
    const s = sahte(ok);
    const r = await katipNotYaz(guncelle(v), bag(s));
    assert.equal(r.tamam, false, JSON.stringify(v));
    assert.equal(!r.tamam && r.kod, 400, JSON.stringify(v));
    assert.equal(s.cagrilar.length, 0, JSON.stringify(v));
  }
});

// Kullanıcı kararı 27.10.2026: sır süzgeci kaldırıldı; anahtar içeren not reddedilmez.
test("katipNotYaz task-update: sır içeren değişiklik reddedilmez", async () => {
  const s = sahte(JSON.stringify({ id: "x", status: "done", revision: 2 }));
  const r = await katipNotYaz(guncelle({ ...duzenlenen, changes: { text: "OPENCODE_API_KEY=sk-abcdefghijklmnopqrstuvwxyz0123456789" } }), bag(s));
  assert.equal(r.tamam, true, !r.tamam ? r.hata : "");
  assert.equal(s.cagrilar.length, 1);
});

test("katipNotYaz task-update: revizyon çakışması 409", async () => {
  const hata = new Error('Command failed: py\n{"error": "RevisionConflict", "message": "revision conflict"}');
  const r = await katipNotYaz(guncelle(duzenlenen), bag(sahte(hata)));
  assert.equal(r.tamam, false);
  assert.equal(!r.tamam && r.kod, 409);
});

test("katipNotYaz task-update: başarısız durum ve diğer MyBrain hataları başarı sayılmaz", async () => {
  assert.equal((await katipNotYaz(guncelle(duzenlenen), bag(sahte(JSON.stringify({ status: "failed" }))))).tamam, false);
  const r = await katipNotYaz(guncelle(duzenlenen), bag(sahte(new Error('Command failed: py\n{"error": "KeyError", "message": "x"}'))));
  assert.equal(r.tamam, false);
  assert.notEqual(!r.tamam && r.kod, 409);
});

test("katipNotYaz: tür hata mesajı yeni türü de sayar", async () => {
  const r = await katipNotYaz({ tur: "x", veri: {} }, bag(sahte()));
  assert.equal(r.tamam, false);
  assert.match(!r.tamam ? r.hata : "", /note, task, task-update ya da receipt/);
});
