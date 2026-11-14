// sunucu/brif.ts testleri: şema, glob çakışması, brif doğrulama, ajan talimatı, sahiplik haritası. Çalıştırma: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { BrifSemasi, brifDogrula, brifMetni, globlarCakisirMi, sahiplikBirak, sahiplikEkle, type Brif } from "../sunucu/brif.ts";
import { sahiplikIhlaliMi } from "../sunucu/olay.ts";
import { sozlesmeDogrula } from "../sunucu/sozlesme.ts";

const KURALLAR = fs.readFileSync(new URL("../KURALLAR.md", import.meta.url), "utf8");

const ham = (o: Record<string, unknown> = {}): Record<string, unknown> => ({
  ad: "isci-1",
  rol: "isci",
  model: "claude-sonnet-5-5",
  gorev: "sunucu/brif.ts dosyasını yaz ve test et",
  owns: ["sunucu/brif.ts", "test/brif.test.ts"],
  dokunma: [{ yol: "sunucu/kapi.ts", sahip: "isci-2" }, { yol: "docs/", sahip: "rapor-1" }],
  baglam: "test bağlamı: işin nedeni ve mevcut durum burada", 
  once_oku: ["KURALLAR.md"],
  kabul: "node --test geçiyor: fail 0",
  ...o,
});
const brif = (o: Record<string, unknown> = {}): Brif => BrifSemasi.parse(ham(o));

// ---------- Şema ----------

test("şema: geçerli brif; cwd isteğe bağlı", () => {
  assert.equal(BrifSemasi.safeParse(ham()).success, true);
  assert.equal(BrifSemasi.safeParse(ham({ cwd: "C:/x" })).success, true);
  for (const rol of ["isci", "denetci", "birlestirici", "katip", "hata-avcisi", "raporcu", "skill-bahcivani"])
    assert.equal(BrifSemasi.safeParse(ham({ rol, owns: rol === "denetci" ? [] : ["a.md"] })).success, true, rol);
  assert.equal(BrifSemasi.safeParse(ham({ rol: "sef" })).success, false, "bilinmeyen rol");
});

test("şema: eksik ya da boş once_oku, kısa görev ve kabul reddedilir", () => {
  const { once_oku: _, ...eksik } = ham();
  assert.equal(BrifSemasi.safeParse(eksik).success, false, "alan yok");
  assert.equal(BrifSemasi.safeParse(ham({ once_oku: [] })).success, false, "boş liste");
  assert.equal(BrifSemasi.safeParse(ham({ gorev: "kısa görev" })).success, false);
  assert.equal(BrifSemasi.safeParse(ham({ kabul: "bitti" })).success, false);
  const { baglam: __, ...bagsiz } = ham();
  assert.match(String(BrifSemasi.safeParse(bagsiz).error), /baglam zorunlu/, "bağlamsız brif reddedilir");
  assert.equal(BrifSemasi.safeParse(ham({ baglam: "kısa" })).success, false, "kısa bağlam");
});

test("şema: takma ad ve Fable model reddedilir, tam kimlik kabul edilir", () => {
  for (const model of ["sonnet", "opus", "haiku", "", "Fable", "claude-fable-5-1", "fable", "claude-sonnet-4"]) {
    const r = brifDogrula(ham({ model }), new Map());
    assert.equal(r.gecerli, false, `model ${JSON.stringify(model)}`);
    if (!r.gecerli) assert.match(r.hata, /model/);
  }
  for (const model of ["claude-sonnet-5-5", "claude-opus-5-5"]) assert.equal(BrifSemasi.safeParse(ham({ model })).success, true, model);
  assert.equal(BrifSemasi.safeParse(ham({ model: undefined })).success, false, "model zorunlu");
});

test("şema (Y4): yerel ollama:<ad> kabul edilir; Fable yerel kimlikte de yasak; hata metni yerel biçimi söyler", () => {
  for (const model of ["ollama:zepul-gptoss-cpu:latest", "ollama:qwen3-coder:30b"]) assert.equal(BrifSemasi.safeParse(ham({ model })).success, true, model);
  for (const model of ["ollama:", "ollama:../x", "ollama:fable", "ollama:claude-fable-5-1"]) assert.equal(BrifSemasi.safeParse(ham({ model })).success, false, model);
  const r = brifDogrula(ham({ model: "sonnet" }), new Map());
  assert.equal(r.gecerli, false);
  if (!r.gecerli) assert.match(r.hata, /ollama:<ad>/, "hata metni yerel model biçimini söyler");
  const f = brifDogrula(ham({ model: "ollama:fable-x" }), new Map());
  if (!f.gecerli) assert.match(f.hata, /Fable/); else assert.fail("Fable yerel kimlikte kabul edildi");
});

test("şema: işçide boş owns, denetçide dolu owns reddedilir", () => {
  const isci = brifDogrula(ham({ owns: [] }), new Map());
  assert.equal(isci.gecerli, false);
  if (!isci.gecerli) assert.match(isci.hata, /owns/);
  const denetci = brifDogrula(ham({ rol: "denetci", owns: ["sunucu/brif.ts"] }), new Map());
  assert.equal(denetci.gecerli, false);
  if (!denetci.gecerli) assert.match(denetci.hata, /owns.*salt okur/);
  assert.equal(BrifSemasi.safeParse(ham({ rol: "denetci", owns: [] })).success, true, "denetçi boş owns ile geçerli");
  assert.equal(BrifSemasi.safeParse(ham({ rol: "katip", owns: [] })).success, true, "yalnız işçi ve denetçi kısıtlı");
});

// ---------- globlarCakisirMi ----------

// Her çift iki yönde de aynı sonucu vermeli.
const cift = (a: string, b: string, beklenen: boolean) => {
  assert.equal(globlarCakisirMi(a, b), beklenen, `${a} ↔ ${b}`);
  assert.equal(globlarCakisirMi(b, a), beklenen, `${b} ↔ ${a}`);
};

test("globlarCakisirMi: dizin/** ve tam yol", () => {
  cift("docs/**", "docs/a.md", true);
  cift("docs/**", "docs/a/b/c.md", true);
  cift("docs/**", "sunucu/**", false);
  cift("docs/**", "sunucu/a.md", false);
  cift("docs/a/**", "docs/**", true);
  cift("docs/a/**", "docs/b/**", false);
  cift("docs/**", "docsx/**", false); // ön ek dizin sınırında bitmiyor
  cift("docs/**", "docs", true); // dizin yolu kendisi de çakışır
  cift("sunucu/kapi.ts", "sunucu/kapi.ts", true);
  cift("sunucu/kapi.ts", "sunucu/sozlesme.ts", false);
  cift("sunucu/kapi.ts", "sunucu/kapi.ts.bak", false);
});

test("globlarCakisirMi: ** her şeyle çakışır", () => {
  for (const g of ["sunucu/kapi.ts", "docs/**", "*.md", "docs/*", "a/b/c.txt", "**"]) cift("**", g, true);
});

test("globlarCakisirMi: *.uzanti yalnız kök düzeyindedir", () => {
  cift("*.md", "README.md", true);
  cift("*.md", "docs/a.md", false);
  cift("*.md", "docs/**", false);
  cift("*.md", "*.md", true);
  cift("*.md", "*.ts", false);
  cift("*.md", "sunucu/**", false);
  cift("*", "README.md", true);
  cift("*", "docs/a.md", false);
});

test("globlarCakisirMi: dizin/* yalnız doğrudan çocuklardır", () => {
  cift("docs/*", "docs/a.md", true);
  cift("docs/*", "docs/a/b.md", false);
  cift("docs/*", "docs/**", true);
  cift("docs/*", "docs/a/**", true); // docs/a doğrudan çocuk
  cift("docs/*", "docs/a/b/**", false);
  cift("docs/*", "sunucu/**", false);
  cift("docs/*", "docs/*", true);
  cift("docs/*.md", "docs/*.ts", false);
  cift("docs/a*.md", "docs/*b.md", true);
  cift("docs/*.md", "sunucu/*.md", false);
});

test("globlarCakisirMi: Windows, harf duyarsız ve \\ ile / eşit", () => {
  cift("sunucu/kapi.ts", "SUNUCU\\KAPI.TS", true);
  cift("Docs\\**", "docs/A.md", true);
  cift("DOCS\\*", "docs/A.md", true);
  cift("*.MD", "readme.md", true);
  cift("SUNUCU\\**", "docs\\**", false);
  cift("./docs/**", "docs\\a.md", true);
  cift("docs/", "docs/a/b.md", true); // sondaki / dizin sayılır
});

test("globlarCakisirMi: emin değilse çakışma sayılır", () => {
  cift("**/*.md", "docs/a.md", true);
  cift("src/*/x.ts", "docs/**", true);
  cift("docs/a?.md", "sunucu/**", true);
  cift("docs/{a,b}.md", "sunucu/**", true);
});

// ---------- brifDogrula ----------

test("brifDogrula: geçerli brif kendi tipiyle döner", () => {
  const r = brifDogrula(ham(), new Map([["docs/**", "rapor-1"]]));
  assert.equal(r.gecerli, true);
  if (r.gecerli) assert.equal(r.brif.ad, "isci-1");
});

test("brifDogrula: şema hatası çakışma alanı taşımaz", () => {
  const r = brifDogrula({ ad: "x" }, new Map());
  assert.equal(r.gecerli, false);
  if (!r.gecerli) {
    assert.match(r.hata, /rol/);
    assert.equal(r.cakisma, undefined);
    assert.equal(r.oneri, undefined);
  }
  assert.equal(brifDogrula(null, new Map()).gecerli, false);
});

test("brifDogrula: OWNS aktif ajanla çakışırsa cakisma ve öneri dolu", () => {
  const aktif = new Map([["sunucu/**", "isci-2"], ["docs/**", "isci-3"], ["*.md", "isci-2"]]);
  const r = brifDogrula(ham({ owns: ["sunucu/brif.ts", "README.md"] }), aktif);
  assert.equal(r.gecerli, false);
  if (r.gecerli) return;
  assert.deepEqual(r.cakisma, [{ glob: "sunucu/**", sahip: "isci-2" }, { glob: "*.md", sahip: "isci-2" }]);
  assert.match(r.hata, /sunucu\/\*\* \(isci-2\)/);
  assert.match(r.oneri ?? "", /böl \(OWNS'u daralt\), ayır \(başka dosya\), sıraya koy \(sahibinin bitmesini bekle\)/);
  // İki ayrı OWNS aynı sahibin aynı desenine çarpsa da bir kez listelenir.
  const tek = brifDogrula(ham({ owns: ["sunucu/a.ts", "sunucu/b.ts"] }), new Map([["sunucu/**", "isci-2"]]));
  assert.equal(!tek.gecerli && tek.cakisma?.length, 1);
});

// Brif notu: desteklenmeyen OWNS deseni (dizin içinde joker, ?, [], {}) brifte reddedilir; kapı onu eşleyemez.
test("brifDogrula: desteklenmeyen OWNS deseni reddedilir", () => {
  for (const o of ["src/*/x.ts", "**/*.md", "docs/a?.md", "docs/{a,b}.md"]) {
    const r = brifDogrula(ham({ owns: [o] }), new Map());
    assert.equal(r.gecerli, false, o);
    if (!r.gecerli) assert.match(r.hata, /desteklenmeyen OWNS deseni/);
  }
  assert.equal(brifDogrula(ham({ owns: ["docs/*", "*.md", "panel", "araclar\\"], dokunma: YOK }), new Map()).gecerli, true);
});

test("brifDogrula: çakışmayan sahiplik geçer", () => {
  assert.equal(brifDogrula(ham(), new Map([["docs/**", "isci-2"], ["panel/*", "isci-3"], ["sunucu/kapi.ts", "isci-4"]])).gecerli, true);
});

test("brifDogrula: OWNS ile DO-NOT-TOUCH çelişirse hata", () => {
  for (const yol of ["sunucu/**", "sunucu/brif.ts", "SUNUCU\\BRIF.TS", "sunucu/", "sunucu/*"]) {
    const r = brifDogrula(ham({ dokunma: [{ yol, sahip: "isci-2" }] }), new Map());
    assert.equal(r.gecerli, false, `dokunma ${yol}`);
    if (!r.gecerli) {
      assert.match(r.hata, /çelişiyor/);
      assert.equal(r.cakisma, undefined, "çelişki çakışma değildir");
    }
  }
});

// K20 / KURALLAR A3: DO-NOT-TOUCH bloğu bulunmalı. Boş liste reddedilir; dokunulmayacak yol yoksa açık "(yok)" beyanı istenir.
const YOK = [{ yol: "(yok)", sahip: "-" }];
test("brifDogrula: boş DO-NOT-TOUCH reddedilir, açık (yok) beyanı kabul edilir (K20)", () => {
  for (const dokunma of [[], undefined]) {
    const r = brifDogrula(ham({ dokunma }), new Map());
    assert.equal(r.gecerli, false, JSON.stringify(dokunma));
    if (!r.gecerli) assert.match(r.hata, /dokunma/);
  }
  assert.equal(brifDogrula(ham({ dokunma: YOK }), new Map()).gecerli, true);
  assert.equal(brifDogrula(ham({ dokunma: [...YOK, { yol: "docs/", sahip: "rapor-1" }] }), new Map()).gecerli, false, "(yok) tek başına olmalı");
  const ok = brifDogrula(ham({ dokunma: YOK }), new Map());
  assert.ok(ok.gecerli && !brifMetni(ok.brif, "").includes("(yok) → -"), "beyan talimatta yol gibi listelenmez");
});

test("brifDogrula: aynı ajanın kendi eski sahipliği çakışma sayılmaz (istekEden)", () => {
  const aktif = new Map([["sunucu/**", "isci-1"]]);
  assert.equal(brifDogrula(ham(), aktif).gecerli, true, "istekEden yok: brif adı kullanılır");
  assert.equal(brifDogrula(ham({ ad: "isci-9" }), aktif, "isci-1").gecerli, true, "istekEden açıkça verilmiş");
  const baskasi = brifDogrula(ham({ ad: "isci-9" }), aktif, "isci-8");
  assert.equal(baskasi.gecerli, false, "başka ajanın sahipliği çakışmadır");
  if (!baskasi.gecerli) assert.equal(baskasi.cakisma?.[0].sahip, "isci-1");
  assert.equal(brifDogrula(ham({ ad: "isci-9" }), aktif).gecerli, false, "istekEden yoksa isci-9 için isci-1 başkasıdır");
});

// ---------- brifMetni ----------

const BASLIKLAR = ["## Görev", "## Bağlam", "## OWNS (yalnız bunlara yaz)", "## DO-NOT-TOUCH (sahibiyle)", "## Önce oku", "## Bitti tanımı (kabul)", "## Dönüş sözleşmesi", "## Kurallar"];

test("brifMetni: tüm bölüm başlıkları sırayla var", () => {
  const m = brifMetni(brif(), KURALLAR);
  const yerler = BASLIKLAR.map((h) => m.indexOf("\n" + h + "\n") + 1 || m.indexOf(h + "\n") + 1);
  assert.ok(yerler.every((y) => y > 0), `eksik başlık: ${yerler}`);
  assert.deepEqual([...yerler].sort((a, b) => a - b), yerler, "sıra bozuk");
  assert.match(m, /## OWNS \(yalnız bunlara yaz\)\n- sunucu\/brif\.ts\n- test\/brif\.test\.ts\n/);
  assert.match(m, /- sunucu\/kapi\.ts → isci-2\n- docs\/ → rapor-1\n/);
  assert.match(m, /## Önce oku\n- KURALLAR\.md\n/);
  assert.match(m, /## Bitti tanımı \(kabul\)\nnode --test geçiyor: fail 0\n/);
});

test("brifMetni: KURALLAR metni kısaltılmadan eklenir", () => {
  const m = brifMetni(brif(), KURALLAR);
  assert.ok(KURALLAR.length > 3000, "KURALLAR.md okunamadı ya da çok kısa");
  assert.ok(m.endsWith("## Kurallar\n" + KURALLAR), "kurallar son bölüm ve birebir");
  const kisa = "## A. bir\n\nBir satır kural.\n";
  assert.ok(brifMetni(brif(), kisa).endsWith("## Kurallar\n" + kisa));
});

test("brifMetni: rol satırları", () => {
  const denetci = brifMetni(brif({ rol: "denetci", owns: [] }), KURALLAR);
  assert.match(denetci, /salt okursun; yazma yok; kırmızıya döndür/);
  assert.match(denetci, /## OWNS \(yalnız bunlara yaz\)\n\(yok: salt okursun\)\n/);
  assert.doesNotMatch(denetci, /her mantıklı adımda commit/);
  const isci = brifMetni(brif(), KURALLAR);
  assert.match(isci, /her mantıklı adımda commit; OWNS dışına yazma; başkasının dosyası için mesaj_gonder/);
  assert.doesNotMatch(isci, /salt okursun; yazma yok/);
  const katip = brifMetni(brif({ rol: "katip" }), KURALLAR);
  assert.doesNotMatch(katip, /Rol kuralı/);
});

test("brifMetni: dönüş sözleşmesi örneği sozlesme.ts şemasından geçer", () => {
  for (const [rol, verdict] of [["isci", "TAMAM"], ["denetci", "PASS"], ["katip", "TAMAM"]] as const) {
    const m = brifMetni(brif({ rol, owns: rol === "denetci" ? [] : ["a.md"] }), KURALLAR);
    const govde = m.slice(m.indexOf("## Dönüş sözleşmesi"), m.indexOf("## Kurallar"));
    const satir = govde.match(/^\{.*\}$/m)?.[0];
    assert.ok(satir, `${rol}: JSON örneği yok`);
    const d = sozlesmeDogrula(satir);
    assert.equal(d.gecerli, true, `${rol}: ${!d.gecerli && d.hata}`);
    assert.equal(d.gecerli && d.veri.verdict, verdict);
  }
  assert.match(brifMetni(brif({ rol: "denetci", owns: [] }), KURALLAR), /verdict: PASS \| VETO/);
  assert.match(brifMetni(brif(), KURALLAR), /verdict: TAMAM \| KISMI \| BASARISIZ/);
});

// ---------- Sahiplik haritası ----------

test("sahiplikEkle ve sahiplikBirak: harita temizlenir", () => {
  const h = new Map<string, string>();
  sahiplikEkle(h, brif());
  assert.deepEqual([...h], [["sunucu/brif.ts", "isci-1"], ["test/brif.test.ts", "isci-1"]]);
  sahiplikBirak(h, "isci-1");
  assert.equal(h.size, 0);
  sahiplikBirak(h, "yok-ajan"); // olmayan ajan zararsız
  assert.equal(h.size, 0);
});

test("sahiplikBirak: yalnız o ajanın kayıtları silinir", () => {
  const h = new Map<string, string>();
  sahiplikEkle(h, brif({ ad: "a", owns: ["docs/**", "x.md"] }));
  sahiplikEkle(h, brif({ ad: "b", owns: ["sunucu/**"] }));
  sahiplikBirak(h, "a");
  assert.deepEqual([...h], [["sunucu/**", "b"]]);
});

test("sahiplikEkle: anahtarlar kapının anlayacağı biçime çevrilir", () => {
  const h = new Map<string, string>();
  sahiplikEkle(h, brif({ owns: ["docs\\", "./panel/**", "sunucu\\brif.ts"] }));
  assert.deepEqual([...h.keys()], ["docs/**", "panel/**", "sunucu/brif.ts"]);
  assert.deepEqual(sahiplikIhlaliMi("baska", "docs/a/b.md", h), { ihlal: true, sahip: "isci-1" }, "olay.ts ile birlikte çalışır");
  assert.equal(sahiplikIhlaliMi("isci-1", "docs/a/b.md", h).ihlal, false);
  sahiplikBirak(h, "isci-1");
  assert.equal(sahiplikIhlaliMi("baska", "docs/a/b.md", h).ihlal, false);
});

test("akış: sahibi bırakınca aynı OWNS ile brif geçer (sıraya koy)", () => {
  const h = new Map<string, string>();
  const a = brif({ ad: "a", owns: ["sunucu/**"] });
  sahiplikEkle(h, a);
  const b = ham({ ad: "b", owns: ["sunucu/brif.ts"] });
  assert.equal(brifDogrula(b, h).gecerli, false);
  sahiplikBirak(h, "a");
  assert.equal(brifDogrula(b, h).gecerli, true);
});
