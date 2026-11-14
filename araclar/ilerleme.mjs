// Proje ilerleme sayfası: .loop/ilerleme.json -> raporlar/ilerleme.html
// Kullanım: node araclar/ilerleme.mjs [--izle] [--test]
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GIRDI = path.join(KOK, ".loop", "ilerleme.json");
const CIKTI = path.join(KOK, "raporlar", "ilerleme.html");

const PUAN = { bitti: 1, devam: 0.5 };
const puan = (m) => PUAN[m.durum] ?? 0;
const ort = (l) => (l.length ? l.reduce((t, m) => t + puan(m), 0) / l.length : 0);
export const fazYuzde = (faz) => Math.round(ort(faz.maddeler) * 100);
export const genelYuzde = (fazlar) => Math.round(ort(fazlar.flatMap((f) => f.maddeler)) * 100);

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const DURUM_AD = { kapandi: "kapandı", acik: "açık", kullanici_karari: "kullanıcı kararı" };
const DOG_AD = { canli: "canlı", birim: "birim", yok: "yok" };

export function uret(v) {
  const fazlar = v.fazlar.map((f) => {
    const y = fazYuzde(f);
    const m = f.maddeler.map((x) => `<li><span class="r ${esc(x.durum)}">${esc(x.durum)}</span><span>${esc(x.ad)}${x.kanit ? `<small>${esc(x.kanit)}</small>` : ""}</span></li>`).join("");
    return `<section class="kart"><h3><span>${esc(f.id)} · ${esc(f.ad)}</span><b>%${y}</b></h3><div class="cubuk" role="progressbar" aria-valuenow="${y}" aria-valuemin="0" aria-valuemax="100"><i style="width:${y}%"></i></div><ul>${m}</ul></section>`;
  }).join("");
  const sira = { acik: 0, kullanici_karari: 1, kapandi: 2 };
  const n = (id) => Number(id.slice(1));
  const b = [...v.bulgular].sort((x, y) => sira[x.durum] - sira[y.durum] || n(x.id) - n(y.id));
  const satir = b.map((k) => `<tr data-onem="${esc(k.onem)}" data-durum="${esc(k.durum)}" data-dog="${esc(k.dogrulama)}"><td><b>${esc(k.id)}</b></td><td>${esc(k.onem)}</td><td><span class="r ${esc(k.durum)}">${DURUM_AD[k.durum] ?? esc(k.durum)}</span></td><td>${DOG_AD[k.dogrulama] ?? esc(k.dogrulama)}</td><td>${esc(k.ozet)}<small>${esc(k.duzeltme)} ${esc(k.kaynak)}</small></td></tr>`).join("");
  const sec = (ad, id, ops) => `<label>${ad} <select id="${id}"><option value="">hepsi</option>${ops.map(([d, g]) => `<option value="${d}">${g}</option>`).join("")}</select></label>`;
  const g = genelYuzde(v.fazlar);
  const sayi = (d) => v.bulgular.filter((k) => k.durum === d).length;
  return `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="15"><meta name="color-scheme" content="light dark">
<title>Zepul OS İlerleme</title>
<style>
:root{--z:#E6EAE6;--k:#fff;--m:#1A1F22;--s:#535D64;--c:#D0D6D2;--y:#1B7050;--p:#86651A;--r:#B0241C;color-scheme:light}
@media(prefers-color-scheme:dark){:root{--z:#0E1315;--k:#1A2326;--m:#E2E6E2;--s:#97A3A6;--c:#263236;--y:#55C295;--p:#D4B062;--r:#F2766A;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;background:var(--z);color:var(--m);font:16px/1.5 "Segoe UI",system-ui,sans-serif;overflow-wrap:anywhere}
main{max-width:1100px;margin:0 auto;padding:16px}h1{margin:.2em 0}small{display:block;color:var(--s);font-size:.78rem}
.ust{background:var(--k);border:1px solid var(--c);border-radius:8px;padding:16px;margin-bottom:16px}
.buyuk{font-size:3rem;font-weight:700;color:var(--y);line-height:1}
.cubuk{height:10px;background:var(--c);border-radius:5px;overflow:hidden;margin:8px 0}.cubuk i{display:block;height:100%;background:var(--y)}
.izgara{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));gap:12px}
.kart{background:var(--k);border:1px solid var(--c);border-radius:8px;padding:12px}.kart h3{display:flex;justify-content:space-between;margin:0;font-size:1rem}
ul{list-style:none;margin:0;padding:0}li{display:flex;gap:8px;padding:5px 0;border-top:1px solid var(--c);font-size:.9rem}
.r{flex:none;align-self:flex-start;font-size:.72rem;padding:1px 8px;border-radius:99px;border:1px solid var(--s);color:var(--s);white-space:nowrap}
.bitti,.kapandi{color:var(--y);border-color:var(--y)}.devam,.kullanici_karari{color:var(--p);border-color:var(--p)}.engelli,.acik{color:var(--r);border-color:var(--r)}
.f{display:flex;flex-wrap:wrap;gap:12px;margin:12px 0}select{font:inherit;background:var(--k);color:var(--m);border:1px solid var(--c);border-radius:6px;padding:4px}
.tablo{overflow-x:auto;background:var(--k);border:1px solid var(--c);border-radius:8px}table{border-collapse:collapse;width:100%;font-size:.88rem}
th,td{text-align:left;padding:6px 10px;border-top:1px solid var(--c);vertical-align:top}th{border:0;color:var(--s)}
.not{color:var(--s);font-size:.8rem;margin-top:16px}
</style></head><body><main>
<div class="ust"><div class="buyuk">%${g}</div><div class="cubuk"><i style="width:${g}%"></i></div>
<div><b>Şu an:</b> ${esc(v.simdi)}</div><small>Güncellendi: ${esc(v.guncellendi)} · Bulgular: ${sayi("kapandi")} kapandı, ${sayi("acik")} açık, ${sayi("kullanici_karari")} kullanıcı kararı (toplam ${v.bulgular.length})</small></div>
<h2>Fazlar</h2><div class="izgara">${fazlar}</div>
<h2>K bulguları</h2>
<div class="f">${sec("Önem", "fo", [["yüksek", "yüksek"], ["orta", "orta"], ["düşük", "düşük"]])}${sec("Durum", "fd", Object.entries(DURUM_AD))}${sec("Doğrulama", "fg", Object.entries(DOG_AD))}</div>
<div class="tablo"><table><thead><tr><th>No</th><th>Önem</th><th>Durum</th><th>Doğrulama</th><th>Özet · düzeltme · kaynak</th></tr></thead><tbody id="tb">${satir}</tbody></table></div>
<p class="not">Yüzde: madde başına bitti = 1, devam = 0,5, diğerleri 0. Faz yüzdesi bu puanların ortalaması, genel yüzde tüm maddelerin ortalamasıdır. Sayfa 15 sn de bir yenilenir.</p>
</main><script>
(function(){var S=["fo","fd","fg"],A=["onem","durum","dog"];
function ok(f){try{return sessionStorage.getItem(f)||""}catch(e){return ""}}
function uygula(){var v=S.map(function(i){return document.getElementById(i).value});
document.querySelectorAll("#tb tr").forEach(function(r){r.hidden=v.some(function(x,i){return x&&r.dataset[A[i]]!==x})})}
S.forEach(function(i){var e=document.getElementById(i);e.value=ok(i);e.onchange=function(){try{sessionStorage.setItem(i,e.value)}catch(x){}uygula()}});uygula()})();
</script></body></html>
`;
}

function yaz() {
  const v = JSON.parse(fs.readFileSync(GIRDI, "utf8"));
  fs.writeFileSync(CIKTI, uret(v));
  console.log(`${CIKTI} yazıldı: genel %${genelYuzde(v.fazlar)}`);
}

function test() {
  const mk = (...d) => ({ maddeler: d.map((durum) => ({ durum })) });
  assert.equal(fazYuzde(mk("bitti", "bitti")), 100);
  assert.equal(fazYuzde(mk("bitti", "devam")), 75);
  assert.equal(fazYuzde(mk("bekliyor", "engelli")), 0);
  assert.equal(fazYuzde(mk()), 0);
  assert.equal(genelYuzde([mk("bitti"), mk("devam", "bekliyor", "bekliyor")]), 38); // (1+.5)/4 = 37,5
  assert.ok(uret({ simdi: "<x>", guncellendi: "t", fazlar: [{ id: "F0", ad: "a", maddeler: [{ ad: "m", durum: "bitti" }] }], bulgular: [] }).includes("&lt;x&gt;"));
  console.log("ilerleme testleri geçti");
}

const args = process.argv.slice(2);
if (args.includes("--test")) test();
else {
  yaz();
  if (args.includes("--izle")) {
    let t;
    fs.watch(GIRDI, () => { clearTimeout(t); t = setTimeout(() => { try { yaz(); } catch (e) { console.error("üretilemedi:", e.message); } }, 150); });
    console.log("izleniyor: " + GIRDI);
  }
}
