// sunucu/sozlesme.ts testleri. Çalıştırma: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { sozlesmeDogrula, sonrakiAdim, sozlesmeKirliAgacRed, type Sozlesme } from "../sunucu/sozlesme.ts";

const ornek = { verdict: "TAMAM", blockers: [], commits: ["abc1234"], ozet: "iş bitti" };
const s = (v: Partial<Sozlesme>): Sozlesme => ({ ...ornek, ...v } as Sozlesme);

test("sozlesmeDogrula: geçerli örnek (nesne ve JSON metni)", () => {
  assert.deepEqual(sozlesmeDogrula(ornek), { gecerli: true, veri: ornek });
  assert.equal(sozlesmeDogrula(JSON.stringify(ornek)).gecerli, true);
});

test("sozlesmeDogrula: verdict eksik ya da geçersiz", () => {
  const { verdict, ...eksik } = ornek;
  const r = sozlesmeDogrula(eksik);
  assert.equal(r.gecerli, false);
  assert.match((r as { hata: string }).hata, /^verdict:/);
  assert.equal(sozlesmeDogrula({ ...ornek, verdict: "APPROVE" }).gecerli, false);
  assert.deepEqual(sozlesmeDogrula("{bozuk"), { gecerli: false, hata: "JSON çözülemedi" });
});

test("sozlesmeDogrula: blocker nesne biçimi", () => {
  const b = { ne: "test yok", nerede: "sunucu/x.ts:12", onem: "yuksek", oneri: "test yaz" };
  assert.equal(sozlesmeDogrula({ ...ornek, verdict: "KISMI", blockers: ["düz metin", b, { ne: "yalnız ne" }] }).gecerli, true);
  assert.equal(sozlesmeDogrula({ ...ornek, blockers: [{ nerede: "x" }] }).gecerli, false, "ne zorunlu");
  assert.equal(sozlesmeDogrula({ ...ornek, blockers: [""] }).gecerli, false, "boş metin blocker olmaz");
});

test("sozlesmeDogrula: ozet 600 karakter sınırı", () => {
  assert.equal(sozlesmeDogrula({ ...ornek, ozet: "ç".repeat(600) }).gecerli, true);
  const r = sozlesmeDogrula({ ...ornek, ozet: "ç".repeat(601) });
  assert.equal(r.gecerli, false);
  assert.match((r as { hata: string }).hata, /^ozet:/);
});

test("sozlesmeDogrula: gerekçesiz VETO geçersiz", () => {
  assert.equal(sozlesmeDogrula({ ...ornek, verdict: "VETO" }).gecerli, false);
  assert.equal(sozlesmeDogrula({ ...ornek, verdict: "VETO", blockers: ["test kırmızıya dönmüyor"] }).gecerli, true);
});

test("sonrakiAdim: işçi dalları", () => {
  assert.equal(sonrakiAdim(s({}), "isci", 0, true).adim, "denetciye");
  assert.equal(sonrakiAdim(s({}), "isci", 0, false).adim, "sefe");
  // TAMAM ama blocker dolu → düzeltme
  assert.equal(sonrakiAdim(s({ blockers: ["x"] }), "isci", 0, true).adim, "duzeltme");
  for (const verdict of ["KISMI", "BASARISIZ"] as const) {
    const a0 = sonrakiAdim(s({ verdict, blockers: [{ ne: "lint", nerede: "a.ts" }] }), "isci", 0, true);
    assert.equal(a0.adim, "duzeltme");
    assert.match(a0.mesaj, /^Düzeltme turu 1\/2: blocker'lar: lint \(a\.ts\)/);
    const a1 = sonrakiAdim(s({ verdict, blockers: ["test eksik"] }), "isci", 1, true);
    assert.equal(a1.adim, "duzeltme");
    assert.match(a1.mesaj, /^Düzeltme turu 2\/2: blocker'lar: test eksik/);
    assert.equal(sonrakiAdim(s({ verdict, blockers: ["test eksik"] }), "isci", 2, true).adim, "sefe", "iki turdan sonra şefe");
  }
  assert.equal(sonrakiAdim(s({ verdict: "PASS" }), "isci", 0, true).adim, "sefe", "rol-verdict uyumsuz");
});

test("sonrakiAdim: denetçi dalları ve bilinmeyen rol", () => {
  assert.equal(sonrakiAdim(s({ verdict: "PASS" }), "denetci", 0, true).adim, "birlestiriciye");
  const v = s({ verdict: "VETO", blockers: ["geri alınca test yeşil kalıyor"] });
  const a0 = sonrakiAdim(v, "denetci", 0, true);
  assert.equal(a0.adim, "duzeltme");
  assert.match(a0.mesaj, /^Düzeltme turu 1\/2: blocker'lar: geri alınca test yeşil kalıyor\. Denetçi VETO verdi\./);
  assert.match(a0.mesaj, /Düzelt, commit at, sozlesme_don ile yeniden dön\.$/, "VETO düzeltmesi işçiye yazılır (D8)");
  assert.equal(sonrakiAdim(v, "denetci", 1, true).adim, "duzeltme");
  assert.equal(sonrakiAdim(v, "denetci", 2, true).adim, "sefe");
  assert.equal(sonrakiAdim(s({}), "denetci", 0, true).adim, "sefe", "rol-verdict uyumsuz");
  assert.equal(sonrakiAdim(s({}), "katip", 0, true).adim, "sefe");
});

test("sonrakiAdim: kural/politika kaynaklı blocker düzeltme turu açmaz, şefe gider (F11)", () => {
  for (const metin of ["KURALLAR E gereği force push yapılmadı.", "Yasak listede, insan onayı yok", "POLİTİKA: dışa mesaj", "politika gereği"]) {
    const a = sonrakiAdim(s({ verdict: "KISMI", blockers: [metin] }), "isci", 0, true);
    assert.equal(a.adim, "sefe", metin);
    assert.match(a.mesaj, /kural/);
  }
  // onem: "politika" verdict'ten bağımsız
  assert.equal(sonrakiAdim(s({ verdict: "BASARISIZ", blockers: [{ ne: "yapılamaz", onem: "politika" }] }), "isci", 0, true).adim, "sefe");
  assert.equal(sonrakiAdim(s({ verdict: "KISMI", blockers: ["test eksik"] }), "isci", 0, true).adim, "duzeltme");
  // Metin eşleşmesi yalnızca KISMI'de
  assert.equal(sonrakiAdim(s({ verdict: "BASARISIZ", blockers: ["kural dosyası bozuk"] }), "isci", 0, true).adim, "duzeltme");
});

test("sonrakiAdim: blocker noktayla bitince mesajda '..' olmaz (F11)", () => {
  const a = sonrakiAdim(s({ verdict: "KISMI", blockers: [{ ne: "lint kırık.", nerede: "a.ts" }, "test eksik."] }), "isci", 0, true);
  assert.equal(a.adim, "duzeltme");
  assert.ok(!a.mesaj.includes(".."), a.mesaj);
  assert.match(a.mesaj, /blocker'lar: lint kırık\. \(a\.ts\); test eksik\. İşçi verdict'i KISMI\./);
  assert.ok(!sonrakiAdim(s({ verdict: "KISMI", blockers: ["kural gereği."] }), "isci", 0, true).mesaj.includes(".."));
});

test("sonrakiAdim: blocker'sız KISMI/BASARISIZ içeriksiz düzeltme turu açmaz, şefe gider (D16)", () => {
  for (const verdict of ["KISMI", "BASARISIZ"] as const) {
    for (const n of [0, 1]) {
      const a = sonrakiAdim(s({ verdict, ozet: "yapamadım" }), "isci", n, true);
      assert.equal(a.adim, "sefe", `${verdict} ${n}`);
      assert.match(a.mesaj, /blocker yok/);
      assert.match(a.mesaj, /özet: yapamadım/, "şef özeti görür");
    }
  }
});

test("sozlesmeKirliAgacRed", () => {
  assert.equal(sozlesmeKirliAgacRed([]), null);
  assert.match(sozlesmeKirliAgacRed(["a.ts", "b.ts"])!, /^Önce commit at: 2 dosya/);
});
