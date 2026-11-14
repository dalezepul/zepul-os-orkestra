// Panel öz-kontrolü: node panel/panel.test.mjs
// index.html içindeki gömülü script'i ayıklar, derler ve saf çekirdeği sınar.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const scriptler = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
assert.equal(scriptler.length, 1, 'tek gömülü script olmalı');
assert.ok(!/<script[^>]+src=|<link[^>]+stylesheet|https?:\/\/(?!127\.0\.0\.1)[^'"\s]*\.(js|css)/.test(html), 'dış kaynak yok');
// Tek istisna: gömülü three.js (aynı köken, panel/vendor). Başka modül yüklenmez; dosya npm three@0.160.0 build/three.module.min.js ile birebir.
{
  assert.deepEqual([...html.matchAll(/\bimport\(\s*([^)]+?)\s*\)/g)].map(m => m[1]), ['UYDU_THREE'], 'dinamik import yalnız UYDU_THREE');
  assert.match(html, /const UYDU_THREE = '\/vendor\/three-0\.160\.0\.module\.min\.js';/, 'aynı kökenden göreli yol');
  assert.match(readFileSync(new URL('../sunucu/baglama.ts', import.meta.url), 'utf8'), /PANEL_VENDOR = "\/vendor\/three-0\.160\.0\.module\.min\.js"/, 'sunucu aynı yolu verir');
  const dosya = readFileSync(new URL('./vendor/three-0.160.0.module.min.js', import.meta.url)), nl = dosya.indexOf(10);
  assert.match(dosya.subarray(0, nl).toString(), /three\.js 0\.160\.0.*MIT/, 'ilk satır: sürüm ve lisans');
  assert.equal(createHash('sha256').update(dosya.subarray(nl + 1)).digest('hex'), '3e690ac7d180b0aadf0891bea39eec643e29e2d3e75c99b18689518665f69ba6', 'özgün dosya değişmedi');
}

// CSP (sunucu/baglama.ts panelBasliklari): betik yalnızca tek satır içi <script>'in sha256 özetiyle çalışır.
const satirIci = [...html.matchAll(/<script\b(?![^>]*\bsrc\s*=)([^>]*)>/gi)].filter(m => !/type\s*=\s*["']?application\/json/i.test(m[1]));
assert.equal(satirIci.length, 1, 'tek satır içi <script> (JSON veri blokları hariç)');
assert.equal(html.match(/\son[a-z]+=/gi), null, 'satır içi olay özniteliği (onclick= …) yok: CSP engeller');
assert.ok(!/javascript:/i.test(html), 'javascript: adresi yok');
assert.ok(html.includes('<code>%LOCALAPPDATA%\\zepul-os\\panel-url.txt</code>') && !html.includes('.tmp/panel-url.txt'), 'token mesajı yeni adres dosyasını gösterir');

// Söz dizimi + dışa aktarım (document yok, baslat() çalışmaz).
const P = new Function(`${scriptler[0]}
return { TURLER, RENDER, olayHtml, tekillestir, bekleyenOnaylar, modelRozeti, gorunumFiltresi, onceMetni, kacis, tokenAyikla, oturumKapaliMi, KAPALI_METNI, mdHtml, metinHtml,
  limitModeli, limitDurumu, limitMetni, limitHtml, kalanSure, ayarDogrula, ayarSonMetni, bekleyenHtml, durumSvg, kisaYol, SEF_DURAN, DURDURULDU_METNI,
  rozetHtml, layaHtml, modelSecenekleri, modelAlanlariHtml, yedekUyariMetni, kuyrukModeli, yerelSiraHtml, alanlarHtml, onayDugmeleri, alanKarti,
  guvenSeridiHtml, guvenModeli, kesinKarti, kesinEtiketHtml, takipHtml, ccListeHtml, uyduDurumu, uydulariEsle, uyduOlayi, uyduOlaylari, uyduTonu, UYDU_SONME_MS };`)();

// 1) Tekilleştirme
const o = (id, ts, tur = 'metin') => ({ id, ts: new Date(ts).toISOString(), ajan: 'x', tur });
let r = P.tekillestir([], [o('a', 1000), o('b', 2000), o('a', 1000)]);
assert.deepEqual(r.liste.map(x => x.id), ['a', 'b'], 'aynı id iki kez eklenmez');
assert.equal(r.eklenen.length, 2);
const onceki = r.liste;
r = P.tekillestir(onceki, [o('b', 2000), o('c', 3000)]);
assert.deepEqual(r.eklenen.map(x => x.id), ['c'], 'var olan id yeniden eklenmez');
assert.equal(onceki.length, 2, 'girdi dizisi değişmez (saf)');
r = P.tekillestir(r.liste, [o('b', 2000)]);
assert.equal(r.eklenen.length, 0, 'yalnızca tekrar geldiyse ekleme yok');
r = P.tekillestir([o('a', 1000), o('c', 3000)], [o('b', 2000)]);
assert.deepEqual(r.liste.map(x => x.id), ['a', 'b', 'c'], 'sırasız gelen olay zamana göre yerleşir');
assert.equal(r.yenidenSirala, true);
r = P.tekillestir([], Array.from({ length: 12 }, (_, i) => o(`e${i}`, i * 1000)), 10);
assert.equal(r.liste.length, 10, 'bellek sınırı uygulanır');
assert.equal(r.liste[0].id, 'e2', 'en eski olaylar düşer');
assert.equal(P.tekillestir([], [null, { ts: 1 }]).eklenen.length, 0, 'id\'siz olay alınmaz');

// 2) Sözleşmedeki her tur için render fonksiyonu
const ORNEK = {
  durum: { durum: 'calisiyor' },
  metin: { metin: 'Merhaba `kod`' },
  arac: { arac_id: 't1', arac: 'Bash', girdi_ozet: 'node --test' },
  arac_sonuc: { arac_id: 't1', basarili: false, ozet: '2 test kırmızı' },
  mesaj: { kimden: 'kullanici', kime: 'sunucu', metin: 'selam' },
  maliyet: { maliyet_usd: 0.5, toplam_usd: 2.25 },
  hata: { kaynak: 'ag', tur_adi: 'ECONNREFUSED', mesaj: 'Jev yok', geri_alinabilir: true, devam_edilebilir: false, oneri: 'Başlat' },
  onay_istek: { onay_id: 'o1', arac: 'Bash', girdi_ozet: 'git push --force', neden: 'yasak', risk: 'geri-alinamaz' },
  onay_sonuc: { onay_id: 'o1', karar: 'hayir' },
  kapi: { karar: 'insan', neden: 'kesin yasak', jev_secim: 'riskli', jev_guven: 0.86 },
  sozlesme: { verdict: 'VETO', blockers: ['test ölçmüyor'], commits: ['9b07d1e2'], ozet: 'Düzelt' },
  denetim: { isci: 'sunucu', denetci: 'palermo', verdict: 'PASS', gerekce: 'İki mutasyon da kırmızıya döndü.', kirmiziya_dondu: [{ test: 't', sonuc: 'kirmizi' }], blockers: [] },
  birlesme: { isci: 'sunucu', dal: 'isci/sunucu', durum: 'tamam', sha: 'e41c07b29a' },
  skill_adayi: { kimlik: 'dizi-0a1b2c3d4e', aday_tur: 'dizi', ornek_sayisi: 3, farkli_is: 3, karar: 'skill', guven: 0.93, ad: 'read-edit-npm-test', durum: 'taslak' },
  gorev_alindi: { kaynak: 'zepul-ai', gorev_id: 'g-1', metin: 'README güncelle' },
  gorev_sonuc: { kaynak: 'zepul-ai', gorev_id: 'g-1', verdict: 'BASARISIZ', ozet: 'cevap gelmedi' },
  zepul_ai_soru: { kaynak: 'zepul-ai', soru_id: 's-1', gorev_id: 'g-1', soru: 'Tablolar silinsin mi?' },
  uyari: { arac: 'Bash', sinif: 'geri-alinamaz', mesaj: 'Bash: geri alınamaz (tam güven, Laya gölgesi); araç izin aldı', ntfy: true },
  ikinci_gorus: { model: 'claude-opus-5-5', soru: 'Reddedeyim mi?', gorus: 'Katılmıyorum.', sure_ms: 1000 }
};
assert.deepEqual([...P.TURLER].sort(), Object.keys(ORNEK).sort(), 'TURLER sözleşmedeki 14 tur (limit akışa girmez, şeridi besler)');
for (const tur of P.TURLER) {
  assert.equal(typeof P.RENDER[tur], 'function', `RENDER.${tur} var`);
  const h = P.olayHtml({ id: `i-${tur}`, ts: '2026-09-29T16:00:00Z', ajan: 'sunucu', tur, ...ORNEK[tur] });
  assert.ok(h.includes(`data-id="i-${tur}"`) && h.length > 80, `${tur} HTML üretir`);
}
assert.match(P.olayHtml({ id: 'u', ts: 0, ajan: 'x', tur: 'yeni_tur' }), /Bilinmeyen olay/, 'tanımsız tur akışı bozmaz');
assert.match(P.RENDER.hata({ ...ORNEK.hata }), /evet[\s\S]*hayır[\s\S]*Başlat/, 'hata kartı geri alınabilir/devam/öneri gösterir');
assert.match(P.RENDER.sozlesme(ORNEK.sozlesme), /VETO/);
assert.match(P.RENDER.metin(ORNEK.metin), /<code>kod<\/code>/);
assert.match(P.RENDER.arac_sonuc({ ...ORNEK.arac_sonuc, sure_ms: 12400 }), /· 12 sn/, 'araç süresi 5 sn üstünde gösterilir');
assert.ok(!/ sn</.test(P.RENDER.arac_sonuc({ ...ORNEK.arac_sonuc, sure_ms: 4000 })), 'kısa araçta süre gösterilmez');

const kap = P.RENDER.durum({ ajan: 'sunucu', durum: 'kapanis', acik_worktreeler: [{ dal: 'is/biten', birlesmis: true, temiz: true }, { dal: 'is/suren', birlesmis: false, temiz: true }] });
assert.match(kap, /Açık iş: 1/, 'birleşmiş+temiz worktree açık iş sayılmaz');
assert.match(kap, /wt-soluk[^>]*>is\/biten/, 'birleşmiş+temiz soluk');
assert.match(kap, /wt-acik[^>]*>is\/suren · birleşmemiş/, 'birleşmemiş belirgin');

// 3) Kaçış: ajan metni HTML olarak yorumlanmaz
const kotu = P.olayHtml({ id: '"><img>', ts: 0, ajan: '<b>', tur: 'metin', metin: '<img src=x onerror=alert(1)>' });
assert.ok(!kotu.includes('<img') && !kotu.includes('<b>'), 'HTML kaçışı yapılır');

// 4) Onay kuyruğu ve model rozeti
const istek = { id: 1, ts: 1, tur: 'onay_istek', onay_id: 'o1' };
assert.equal(P.bekleyenOnaylar([istek]).length, 1);
assert.equal(P.bekleyenOnaylar([istek, { id: 2, ts: 2, tur: 'onay_sonuc', onay_id: 'o1', karar: 'evet' }]).length, 0, 'sonuç gelen onay kuyruktan düşer');
assert.equal(P.bekleyenOnaylar([istek], new Set(['o1'])).length, 0, 'yerelde karar verilen onay düşer');
// Aday 7: GET /api/onaylar listesi kartları düzeltir.
{
  const sunucu = new Map([['o2', { onay_id: 'o2', ajan: 'isci1', arac: 'Bash', ozet: 'npm i', bitis: 'x', risk: 'geri-alinamaz', ts: 't', kesin: true }]]);
  const b = P.bekleyenOnaylar([istek], new Set(), sunucu);
  assert.deepEqual(b.map(x => x.onay_id), ['o2'], 'listede olmayan hayalet kart düşer, olayda olmayan liste kaydı eklenir');
  assert.equal(b[0].girdi_ozet, 'npm i');
  assert.equal(b[0].risk, 'geri-alinamaz', 'risk korunur: onay iki adımlı teyit ister');
  assert.equal(b[0].onay_tur, 'kesin');
  assert.equal(P.bekleyenOnaylar([istek], new Set(), new Map([['o1', { onay_id: 'o1' }]])).length, 1, 'listede olan olay kartı kalır');
  assert.equal(P.bekleyenOnaylar([{ id: 3, ts: 3, tur: 'onay_sonuc', onay_id: 'o2' }], new Set(), sunucu).length, 0, 'sonuç gelen liste kaydı düşer');
  const yukle = html.match(/async function olaylariYukle\(\) \{[\s\S]*?\n\}/)[0];
  assert.match(yukle, /await onaylariYukle\(\)/, 'açılış ve yeniden bağlanma (olaylariYukle) onay listesini okur');
  assert.match(html, /api\('\/api\/onaylar'\)/, 'panel GET /api/onaylar çağırır');
  assert.match(html, /bekleyenOnaylar\(S\.olaylar, kapananOnaylar\(\), S\.sunucuOnay\)/, 'kart çizimi sunucu listesini kullanır');
  assert.match(html, /if \(yeniden\) \{[^}]*olaylariYukle\(\)/, 'yeniden bağlanmada olaylariYukle çağrılır');
}
assert.equal(P.modelRozeti('claude-fable-5-1', 'isci').uyari, true, 'işçide Fable uyarı verir');
assert.equal(P.modelRozeti('claude-fable-5-1', 'sef').uyari, false, 'şefte Fable serbest');
assert.equal(P.modelRozeti('claude-sonnet-5-5', 'isci').ad, 'Sonnet 5.5');
assert.equal(P.modelRozeti('', 'isci').uyari, true, 'boş model uyarı verir');

// 5) Görünüm filtresi
const f = P.gorunumFiltresi('secili', 'sunucu');
assert.ok(f({ ajan: 'sunucu', tur: 'metin' }) && f({ ajan: 'kullanici', tur: 'mesaj', kimden: 'kullanici', kime: 'sunucu' }));
assert.ok(!f({ ajan: 'panel', tur: 'metin' }));
assert.ok(P.gorunumFiltresi('hatalar')({ tur: 'hata' }) && !P.gorunumFiltresi('mesajlar')({ tur: 'hata' }));
assert.equal(P.onceMetni(Date.now() - 12000), '12 sn önce');

// 6) Token kutusu: düz token ya da `?t=` içeren adres yapıştırılabilir
assert.equal(P.tokenAyikla('  abc123XYZ \n'), 'abc123XYZ', 'düz token kırpılır');
assert.equal(P.tokenAyikla('http://127.0.0.1:8820/?t=abc123XYZ'), 'abc123XYZ', 'adresten token ayıklanır');
assert.equal(P.tokenAyikla('http://127.0.0.1:8820/?demo=1&t=tok%2Fen'), 'tok/en', 'adres kodlaması çözülür');
assert.equal(P.tokenAyikla('ab:cd'), 'ab:cd', 'adres gibi görünen düz token bozulmaz');
assert.equal(P.tokenAyikla(''), '', 'boş girdi boş döner');

// 7) Oturumu kapanmış ajana yazma kutusu kapanır
for (const d of ['bitti', 'olu']) assert.equal(P.oturumKapaliMi({ durum: d }), true, `${d} ajanda yazma kapalı`);
for (const d of ['calisiyor', 'bekliyor', 'hata']) assert.equal(P.oturumKapaliMi({ durum: d }), false, `${d} ajanda yazma açık`);
assert.equal(P.oturumKapaliMi(undefined), false, 'ajan yoksa kapalı sayılmaz (ayrı "alıcı yok" durumu var)');
assert.equal(P.KAPALI_METNI, 'Oturum kapandı; yeni görev için şefe yaz');

// 8) Minimal markdown (metin olayları): işaretler işlenir
const FENCE = '```';
assert.equal(P.mdHtml('**kalın** ve `kod`'), '<strong>kalın</strong> ve <code>kod</code>', 'kalın ve satır içi kod');
assert.equal(P.mdHtml('# Brif: **Model:** x'), '<div class="md-baslik">Brif: <strong>Model:</strong> x</div>', 'başlık satırı');
assert.equal(P.mdHtml('###### Altı'), '<div class="md-baslik">Altı</div>', '6 düzeye kadar başlık');
assert.equal(P.mdHtml('#etiket'), '#etiket', 'boşluksuz # başlık sayılmaz');
assert.equal(P.mdHtml('- bir\n- **iki**'), '<ul><li>bir</li><li><strong>iki</strong></li></ul>', 'tire listesi');
assert.equal(P.mdHtml('giriş\n- a\nson'), 'giriş<ul><li>a</li></ul>son', 'liste metnin ortasında kapanır');
assert.equal(P.mdHtml('satır1\nsatır2'), 'satır1\nsatır2', 'düz metinde satır sonu korunur (pre-wrap)');
assert.equal(P.mdHtml(`${FENCE}js\nlet a = 1 < 2;\n**x** \`y\`\n${FENCE}`), '<pre class="md-kod"><code>let a = 1 &lt; 2;\n**x** `y`</code></pre>', 'kod bloğu: kaçışlı, içinde işaret işlenmez');
assert.match(P.mdHtml(`${FENCE}\nkapanmadı`), /<pre class="md-kod"><code>kapanmadı<\/code><\/pre>/, 'kapanmamış blok da kod bloğu olur');
assert.equal(P.mdHtml('`**a**`'), '<code>**a**</code>', 'satır içi kodda kalın işlenmez');
assert.equal(P.mdHtml('panel/** ve src/**/x'), 'panel/** ve src/**/x', 'tek başına ** kalın başlatmaz');
assert.equal(P.mdHtml(null), '', 'null boş döner');

// 9) XSS: <script> her konumda kaçırılır, işaretlerin içinden de sızmaz
const KOTU = [
  '<script>alert(1)</script>',
  '**<script>alert(1)</script>**',
  '`<script>alert(1)</script>`',
  '# <script>alert(1)</script>',
  '- <script>alert(1)</script>',
  `${FENCE}\n<script>alert(1)</script>\n${FENCE}`,
  `${FENCE}\n<script>alert(1)</script>`,
  '<img src=x onerror=alert(1)> **kalın** "><svg onload=alert(1)>',
  '**"><script>alert(1)</script>**'
];
for (const g of KOTU) {
  for (const c of [P.mdHtml(g), P.RENDER.metin({ metin: g }), P.olayHtml({ id: 'x', ts: 0, ajan: 'a', tur: 'metin', metin: g })]) {
    assert.ok(!/<script|<img|<svg/i.test(c), `ham etiket sızdı: ${g} → ${c}`);
  }
}
assert.equal(P.mdHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;', '<script> düz metin olarak görünür');
assert.match(P.RENDER.metin({ metin: '**<b>x</b>**' }), /<strong>&lt;b&gt;x&lt;\/b&gt;<\/strong>/, 'kalın içinde de kaçış');

// 10) Kapı satırı: "kapı: izin" tek kez yazılır, gerçek neden korunur
const say = (h, s) => h.split(s).length - 1;
assert.equal(say(P.RENDER.kapi({ karar: 'izin', neden: 'kapı: izin' }), 'kapı: izin'), 1, 'sunucunun "kapı: izin" nedeni tekrarlanmaz');
assert.equal(say(P.RENDER.kapi({ karar: 'izin', neden: 'izin' }), 'izin'), 1, 'yalnızca etiketi tekrarlayan neden düşer');
assert.equal(say(P.RENDER.kapi({ karar: 'izin' }), 'kapı: izin'), 1, 'nedensiz kapı olayı bozulmaz');
assert.match(P.RENDER.kapi({ karar: 'red', neden: 'yalnızca bus MCP araçları kullanılabilir' }), /kapı: red[\s\S]*yalnızca bus MCP araçları kullanılabilir/, 'gerçek neden korunur');
assert.match(P.RENDER.kapi({ karar: 'red', neden: 'kapı: izin verilmeyen Host' }), /izin verilmeyen Host/, 'etiketle başlayan gerçek neden kesilmez');
// K26 parça: bileşik komutun parça kararları kartta görünür, parça metni kaçışlanır
const parcali = P.RENDER.kapi({ karar: 'izin', neden: 'bileşik komut', parcalar: [{ parca: 'cd X', secim: 'guvenli', guven: 0.9 }, { parca: '<b>rm</b>', secim: 'kod', guven: 1 }] });
assert.match(parcali, /cd X<\/code> guvenli · 0,9/, 'parça, seçim ve güven');
assert.match(parcali, /&lt;b&gt;rm&lt;\/b&gt;<\/code> kod</, 'parça kaçışlı; kod parçasında güven yok');

// 11) Kalan süre (limit sıfırlanması): en büyük iki birim, sıfır birim yazılmaz
assert.equal(P.kalanSure(0), 'şimdi');
assert.equal(P.kalanSure(-5000), 'şimdi', 'geçmiş sıfırlanma da "şimdi"');
assert.equal(P.kalanSure(59_000), '59 sn');
assert.equal(P.kalanSure((12 * 60 + 5) * 1000), '12 dk 5 sn');
assert.equal(P.kalanSure((2 * 3600 + 7 * 60 + 40) * 1000), '2 sa 7 dk');
assert.equal(P.kalanSure(36 * 86_400_000), '36 gün');
assert.equal(P.kalanSure((3 * 86400 + 4 * 3600) * 1000), '3 gün 4 sa');

// 12) Limit şeridi: GET /api/limit ve SSE `limit` olayı aynı modele iner
const SIMDI = Date.parse('2026-09-29T15:52:20Z');
const lGet = P.limitModeli({
  limit: { bes_saat: { yuzde: 68, sifirlanma: '2026-09-29T18:00:00Z' }, yedi_gun: { yuzde: 52, sifirlanma: null }, yas_dk: 1, ts: SIMDI },
  karar: { yeniIsSerbest: true, neden: 'haftalık %52 < tavan %60' }, ayar: { haftalik_tavan_yuzde: 60, bes_saat_tavan_yuzde: null }
});
assert.equal(lGet.hafta.tavan, 60);
assert.equal(lGet.bes.tavan, null, 'tavansız pencere');
assert.equal(P.limitDurumu(lGet), 'serbest');
assert.equal(P.limitMetni(lGet), 'Yeni iş serbest');
const lh = P.limitHtml(lGet, SIMDI);
assert.match(lh, /%68[\s\S]*%52/, 'iki pencerenin yüzdesi');
assert.match(lh, /class="olcer-tavan" style="left:60%"/, 'haftalık tavan çizgisi');
assert.equal(lh.match(/class="olcer-tavan"/g).length, 1, 'tavanı olmayan pencerede çizgi yok');
assert.match(lh, /data-kalan="2026-09-29T18:00:00Z">2 sa 7 dk</, 'sıfırlanmaya kalan süre, saniyede bir güncellenecek öznitelikle');
assert.match(lh, /role="meter"[^>]*aria-valuenow="68"/, 'ölçer erişilebilir');
const lDur = P.limitModeli({ tur: 'limit', bes_saat_yuzde: 74, yedi_gun_yuzde: 60, serbest: false, neden: 'haftalık %60 ≥ tavan %60', haftalik_tavan: 60, bes_saat_tavan: null });
assert.equal(P.limitDurumu(lDur), 'dur', 'serbest değilse şerit kırmızı');
assert.match(P.limitMetni(lDur), /Yeni iş durdu: haftalık %60 ≥ tavan %60/, 'neden görünür');
assert.match(P.limitHtml(lDur), /olcer-limit asti/, 'tavanı aşan ölçer işaretlenir');
const lUyari = P.limitModeli({ bes_saat_yuzde: 71, yedi_gun_yuzde: 55, serbest: true, uyari: 'haftalık %55, tavan %60’a yaklaştı', haftalik_tavan: 60 });
assert.equal(P.limitDurumu(lUyari), 'uyari', 'uyarı varsa şerit sarı');
assert.match(P.limitMetni(lUyari), /Uyarı: haftalık %55/);
assert.match(P.limitHtml(lUyari), /olcer-limit yakin/, 'tavanın %90’ı geçilince ölçer sarı');
for (const yok of [null, { limit: null, karar: { yeniIsSerbest: true, neden: 'tavan tanımlı değil' }, ayar: {} }, { tur: 'limit', serbest: true }]) {
  const m = P.limitModeli(yok);
  assert.equal(m.okunamadi, true);
  assert.match(P.limitMetni(m), /limit okunamadı/, 'limit okunamadıysa yazı çıkar');
  assert.ok(!P.limitHtml(m).includes('role="meter"'), 'değer yokken ölçer değeri uydurulmaz');
}
const lOkuDur = P.limitModeli({ limit: null, karar: { yeniIsSerbest: false, neden: 'limit okunamadı (hiç ölçüm yok); tavan tanımlıyken güvenli taraf: yeni iş başlamaz' } });
assert.equal(P.limitDurumu(lOkuDur), 'dur');
assert.equal(P.limitMetni(lOkuDur).split('okunamadı').length - 1, 1, '"limit okunamadı" iki kez yazılmaz');
assert.equal(P.limitMetni(undefined), 'limit bilgisi bekleniyor…');
// Kaynak ve yaş: canlı/önbellek ve kaç dk önce; bayatsa belirgin, değer tavan kararında kullanılmadığı yazılır
const lKaynak = P.limitModeli({ limit: { bes_saat: { yuzde: 20, sifirlanma: null }, kaynak: 'canli', yas_sn: 120, yas_dk: 2, ts: SIMDI, bayat: false },
  karar: { yeniIsSerbest: true, neden: 'x' }, ayar: {} });
assert.equal(lKaynak.kaynak, 'canli');
assert.equal(lKaynak.bayat, false);
assert.match(P.limitHtml(lKaynak, SIMDI + 60_000), /class="limit-kaynak"[^>]*>canlı · 3 dk önce</, 'kaynak ve yaş görünür, yaş zamanla artar');
const lBayat = P.limitModeli({ tur: 'limit', ts: new Date(SIMDI).toISOString(), bes_saat_yuzde: 99, yedi_gun_yuzde: 99, serbest: true, bayat: true,
  uyari: 'limit bilinmiyor (bayat), son ölçüm 42 dk önce', kaynak: 'son-canli', yas_sn: 2520, haftalik_tavan: 40 });
assert.equal(lBayat.bayat, true);
assert.equal(P.limitDurumu(lBayat), 'uyari', 'bayat şerit sarı');
const lbh = P.limitHtml(lBayat, SIMDI);
assert.match(lbh, /class="limit-kaynak bayat"[^>]*>BAYAT · son canlı okuma · 42 dk önce</, 'bayat belirgin');
assert.match(P.limitMetni(lBayat), /limit bilinmiyor \(bayat\)/);
assert.ok(!P.limitHtml(P.limitModeli({ tur: 'limit', bes_saat_yuzde: 5, kaynak: '<img>', yas_sn: 0 }), SIMDI).includes('<img>'), 'kaynak kaçışlı');

// 13) Ayar doğrulayıcı: yüzdeler 0–100 (boş = tavan yok), diğerleri pozitif
const TAM = { haftalik_tavan_yuzde: '40', bes_saat_tavan_yuzde: '', maliyet_hizi_usd_10dk: '3,5', tekrar_uyari: '3', tekrar_durdur: '5', ilerlemesiz_dk: '30', azami_isci: '6', yerel_esik_carpani: '3', yerel_azami: '1' };
let d = P.ayarDogrula(TAM);
assert.deepEqual(d.hatalar, {});
assert.deepEqual(d.ayar, { haftalik_tavan_yuzde: 40, bes_saat_tavan_yuzde: null, maliyet_hizi_usd_10dk: 3.5, tekrar_uyari: 3, tekrar_durdur: 5, ilerlemesiz_dk: 30, azami_isci: 6, yerel_esik_carpani: 3, yerel_azami: 1 }, 'boş yüzde null, virgüllü ondalık sayı');
assert.ok(P.ayarDogrula({ ...TAM, haftalik_tavan_yuzde: '101' }).hatalar.haftalik_tavan_yuzde, '101 reddedilir');
assert.ok(P.ayarDogrula({ ...TAM, bes_saat_tavan_yuzde: '-1' }).hatalar.bes_saat_tavan_yuzde, '-1 yüzde reddedilir');
assert.ok(P.ayarDogrula({ ...TAM, maliyet_hizi_usd_10dk: '-1' }).hatalar.maliyet_hizi_usd_10dk, '-1 maliyet reddedilir');
assert.ok(P.ayarDogrula({ ...TAM, tekrar_durdur: '0' }).hatalar.tekrar_durdur, 'sıfır pozitif değil');
assert.ok(P.ayarDogrula({ ...TAM, ilerlemesiz_dk: '  ' }).hatalar.ilerlemesiz_dk, 'yüzde dışı alan boş kalamaz');
assert.ok(P.ayarDogrula({ ...TAM, tekrar_uyari: 'üç' }).hatalar.tekrar_uyari, 'sayı olmayan reddedilir');
assert.equal(P.ayarDogrula({ ...TAM, haftalik_tavan_yuzde: '100' }).ayar.haftalik_tavan_yuzde, 100, '100 sınır dahil');
assert.equal(P.ayarDogrula({ ...TAM, haftalik_tavan_yuzde: '%0' }).ayar.haftalik_tavan_yuzde, 0, '0 sınır dahil, % işareti yazılabilir');
// azami_isci: 1–12 arası tam sayı (sunucu bekci.ts ile aynı aralık)
for (const kotu of ['0', '13', '2,5', '', '-1']) assert.ok(P.ayarDogrula({ ...TAM, azami_isci: kotu }).hatalar.azami_isci, `azami_isci ${JSON.stringify(kotu)} reddedilir`);
for (const [s, n] of [['1', 1], ['12', 12]]) assert.equal(P.ayarDogrula({ ...TAM, azami_isci: s }).ayar.azami_isci, n, `${s} sınır dahil`);
for (const kotu of ['0', '11', '1,5']) assert.ok(P.ayarDogrula({ ...TAM, yerel_esik_carpani: kotu }).hatalar.yerel_esik_carpani, `yerel_esik_carpani ${kotu} reddedilir`);
assert.match(P.ayarSonMetni({ guncelleyen: 'sef', guncelleme_ts: SIMDI }), /^Son güncelleyen: şef · /);
assert.match(P.ayarSonMetni({ guncelleyen: 'kullanici', guncelleme_ts: SIMDI }), /kullanıcı/);
assert.match(P.ayarSonMetni({}), /Henüz değiştirilmedi/);

// 14) Denetim kartı: PASS/VETO, katlanabilir gerekçe, kırmızıya döndür işaretleri, blocker'lar
const DEN = {
  isci: 'sunucu', denetci: 'palermo', verdict: 'VETO', gerekce: 'JSONL hata yolu geri alınınca testler yeşil kaldı; test ölçmüyor.',
  kirmiziya_dondu: [{ test: 'akis › ping', sonuc: 'kirmizi' }, { test: 'log › jsonl', sonuc: 'yesil-kaldi' }, { test: 'doküman', sonuc: 'uygulanamadi', not: 'yalnız md' }],
  blockers: ['düz metin engel', { ne: 'nesne engel', nerede: 'sunucu/log.ts', onem: 'yuksek', oneri: 'test yaz' }]
};
const dh = P.RENDER.denetim(DEN);
assert.match(dh, /class="hukum kotu"[\s\S]*VETO/, 'VETO rozeti');
assert.match(P.RENDER.denetim({ ...DEN, verdict: 'PASS' }), /class="hukum iyi"[\s\S]*PASS/, 'PASS rozeti');
assert.match(dh, /<details class="gerekce"><summary>[\s\S]*<\/summary><div class="gerekce-metin">JSONL/, 'gerekçe katlanabilir');
assert.match(dh, /kd-kirmizi[\s\S]*kırmızıya döndü[\s\S]*kd-yesil[\s\S]*yeşil kaldı · test ölçmüyor[\s\S]*kd-yok[\s\S]*uygulanamadı/, 'üç sonuç işareti');
assert.match(P.RENDER.denetim({ ...DEN, kirmiziya_dondu: [{ test: 't', sonuc: 'yesil-kalan' }] }), /kd-yesil/, '"yesil-kalan" yazımı da tanınır');
assert.match(dh, /düz metin engel[\s\S]*nesne engel[\s\S]*sunucu\/log\.ts[\s\S]*yüksek[\s\S]*Öneri: test yaz/, 'blocker metin ve nesne olarak');
assert.match(dh, /palermo → sunucu/, 'denetçi → işçi');
assert.match(P.RENDER.denetim({ ...DEN, model: 'ollama:zepul-gptoss-cpu:latest' }), /rozet rozet-yerel">Yerel · zepul-gptoss-cpu:latest/, 'yerel denetçi denetim kartında yerel rozetle');
assert.ok(P.gorunumFiltresi('secili', 'sunucu')({ ajan: 'palermo', tur: 'denetim', isci: 'sunucu' }), 'denetim işçinin akışında da görünür');

// 15) Birleşme kartı
const bt = P.RENDER.birlesme({ isci: 'sunucu', dal: 'isci/sunucu', durum: 'tamam', sha: 'e41c07b29a' });
assert.match(bt, /birleşti[\s\S]*isci\/sunucu[\s\S]*<code>e41c07b<\/code>/, 'tamam: kısa sha');
assert.ok(!bt.includes('e41c07b2'), 'sha 7 karaktere kısalır');
assert.match(P.RENDER.birlesme({ dal: 'isci/kapi', durum: 'cakisma', cakisan: ['sunucu/kapi.ts', 'docs/panel-api.md'] }), /çakışma[\s\S]*Çakışan dosyalar[\s\S]*sunucu\/kapi\.ts[\s\S]*docs\/panel-api\.md/, 'çakışma: dosya listesi');
assert.match(P.RENDER.birlesme({ dal: 'x', durum: 'kirli-ana' }), /ana dal kirli[\s\S]*bekletildi/, 'kirli ana');
assert.match(P.RENDER.birlesme({ dal: 'x', durum: 'hata' }), /birleşme hatası/);

// 16) durduruldu: kendi ikonu ve metni, yazma kutusu açık kalır; bekçi hata kartları belirgin
const dd = P.RENDER.durum({ ajan: 'panel', durum: 'durduruldu' });
assert.match(dd, /durum-durduruldu[\s\S]*panel: bekçi durdurdu/, 'durduruldu metni');
assert.match(P.RENDER.durum({ ajan: 'panel', durum: 'kuyrukta' }), /panel: yerel sırada/, 'yerel yuva sırası metni');
for (const kotu of ['0', '5']) assert.ok(P.ayarDogrula({ ...TAM, yerel_azami: kotu }).hatalar.yerel_azami, `yerel_azami ${kotu} reddedilir`);
assert.notEqual(P.durumSvg('durduruldu'), P.durumSvg('tanimsiz'), 'kendine özgü ikon');
for (const b of ['calisiyor', 'bekliyor', 'olu', 'bitti', 'hata']) assert.notEqual(P.durumSvg('durduruldu').replace('durduruldu', ''), P.durumSvg(b).replace(b, ''), `${b} ikonundan farklı`);
assert.equal(P.oturumKapaliMi({ durum: 'durduruldu' }), false, 'durdurulan ajana mesajla devam edilebilir');
assert.match(P.DURDURULDU_METNI, /sürdürebilirsin/);
assert.match(P.RENDER.hata({ kaynak: 'ajan', tur_adi: 'dongu', mesaj: '5 kez art arda' }), /hata-kart hata-dongu[\s\S]*Bekçi durdurdu: kontrolsüz döngü/, 'döngü durdurma kartı belirgin');
assert.match(P.RENDER.hata({ kaynak: 'ajan', tur_adi: 'dongu-uyari', mesaj: '3 kez' }), /hata-kart hata-uyari[\s\S]*Bekçi uyarısı/, 'döngü uyarısı sarı');
assert.match(P.RENDER.hata({ kaynak: 'ag', tur_adi: 'limit-okunamadi', mesaj: 'x' }), /class="hata-kart"><p class="hata-baslik">[\s\S]*limit-okunamadi/, 'diğer hatalar olağan kart');
assert.deepEqual([...P.SEF_DURAN].sort(), ['bitti', 'durduruldu', 'hata', 'olu'], 'şefi yeniden başlat bu durumlarda görünür');
assert.equal(P.kisaYol('C:\\Users\\x\\zepul-os-sunucu\\'), 'zepul-os-sunucu', 'worktree kısa adı');
assert.equal(P.kisaYol('../zepul-os-panel'), 'zepul-os-panel');

// 17) Bekleyen iş satırı
const bk = P.bekleyenHtml({ id: 'is-1', ts: SIMDI - 25 * 60000, istek: { ad: 'dokuman', rol: 'isci', model: 'claude-sonnet-5-5', gorev: '# Brif\nREADME güncelle' }, neden: 'haftalık %60 ≥ tavan %60' }, SIMDI);
assert.match(bk, /dokuman[\s\S]*Sonnet 5\.5[\s\S]*25 dk önce[\s\S]*Brif README güncelle[\s\S]*Neden:[\s\S]*haftalık %60/, 'ad, model, zaman, görev özeti, neden');
assert.ok(!/Başlat/i.test(bk), 'başlat düğmesi yok; karar şefte');

// 17b) Skill adayı kartı (Faz 5): taslak → şef onayı; belirsiz → insan; onaylandı
const sk = P.RENDER.skill_adayi(ORNEK.skill_adayi);
assert.match(sk, /skill-kart[\s\S]*Skill taslağı[\s\S]*read-edit-npm-test[\s\S]*3 tekrar · 3 iş[\s\S]*güven 0,93[\s\S]*skill_onayla/, 'taslak: ad, sayılar, güven, şef onayı');
assert.ok(!/<button/i.test(sk), 'onay düğmesi yok; karar şefte');
assert.match(P.RENDER.skill_adayi({ kimlik: 'gorev-1', karar: 'belirsiz', guven: 0.61, ornek_sayisi: 2, farkli_is: 2 }), /skill-belirsiz[\s\S]*Jev emin değil[\s\S]*insan kararı/, 'belirsiz insana gider');
assert.match(P.RENDER.skill_adayi({ kimlik: 'gorev-2', karar: 'kural', guven: 0.88, ornek_sayisi: 2, farkli_is: 2 }), /Kural adayı/);
assert.match(P.RENDER.skill_adayi({ ad: 'read-edit-npm-test', durum: 'onaylandi' }), /skill-onaylandi[\s\S]*Skill etkin[\s\S]*read-edit-npm-test/, 'onaylandı');

// 18) XSS: yeni alanlar (gerekce, blockers, cakisan, bekleyen, limit) HTML olarak yorumlanmaz
const X = '<img src=x onerror=alert(1)>';
const XS = '<script>alert(1)</script>';
const yeniKartlar = [
  P.RENDER.denetim({ verdict: X, gerekce: X, blockers: [X, XS, { ne: X, nerede: XS, onem: X, oneri: X }], kirmiziya_dondu: [{ test: X, sonuc: XS, not: X }], isci: X, denetci: XS }),
  P.olayHtml({ id: X, ts: 0, ajan: XS, tur: 'denetim', verdict: 'VETO', gerekce: `**${X}**`, blockers: [`\`${XS}\``] }),
  P.RENDER.birlesme({ durum: 'cakisma', dal: X, isci: XS, sha: X, cakisan: [X, XS] }),
  P.RENDER.birlesme({ durum: X, dal: XS }),
  P.RENDER.skill_adayi({ kimlik: X, ad: XS, karar: X, durum: XS, guven: X, ornek_sayisi: XS, farkli_is: X }),
  P.RENDER.skill_adayi({ ad: X, durum: 'onaylandi' }),
  P.RENDER.hata({ kaynak: X, tur_adi: 'dongu', mesaj: X, oneri: XS }),
  P.RENDER.durum({ ajan: X, durum: XS }),
  P.bekleyenHtml({ id: X, ts: X, istek: { ad: X, model: XS, rol: X, gorev: XS }, neden: X }),
  P.limitHtml(P.limitModeli({ bes_saat_yuzde: 5, bes_saat_sifirlanma: `2026-09-29T18:00:00Z"${X}`, neden: X }))
];
for (const h of yeniKartlar) assert.ok(!/<img|<script/i.test(h), `ham etiket sızdı: ${h}`);

// Faz 5.5: yerel model rozeti, rol başına model seçici, yerel yedek uyarısı.
{
  const y = P.modelRozeti('ollama:qwen3-coder:30b', 'isci');
  assert.equal(y.aile, 'yerel', 'ollama: modeli yerel ailesinde');
  assert.equal(y.ad, 'Yerel · qwen3-coder:30b');
  assert.equal(y.uyari, false);
  assert.match(P.rozetHtml(y), /class="rozet rozet-yerel"/, 'yerel rozet sınıfı');
  assert.equal(P.modelRozeti('ollama:qwen3:8b', 'denetci').uyari, false, 'yerel denetçi serbest (test aşaması, KURALLAR B)');
  assert.equal(P.modelRozeti('ollama:qwen3:8b', 'denetci').aile, 'yerel', 'denetçi kartında yerel rozet');
  assert.equal(P.modelRozeti('ollama:claude-fable-5-1', 'sef').uyari, true, 'yerel kimlikte Fable kural dışı');
  assert.ok(/rozet-yerel\s*\{/.test(html), 'yerel rozetin stili var');

  const L = { claude: ['claude-sonnet-5-5', 'claude-opus-5-5'], sef_ek: ['claude-fable-5-1'], yerel: ['ollama:qwen3-coder:30b', 'ollama:qwen3:8b'] };
  assert.deepEqual(P.modelSecenekleri('sef', L), ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-fable-5-1', 'ollama:qwen3-coder:30b', 'ollama:qwen3:8b'], 'Fable yalnız şefte');
  for (const r of ['isci_basit', 'isci_hassas']) assert.ok(!P.modelSecenekleri(r, L).some(m => /fable/i.test(m)), `${r}: Fable yok`);
  assert.ok(P.modelSecenekleri('isci_basit', L).includes('ollama:qwen3:8b'), 'işçide yerel modeller');
  assert.deepEqual(P.modelSecenekleri('denetci', L), ['claude-sonnet-5-5', 'claude-opus-5-5', 'ollama:qwen3-coder:30b', 'ollama:qwen3:8b'], 'denetçide yerel modeller, Fable yok');
  assert.deepEqual(P.modelSecenekleri('isci_basit', { claude: L.claude, sef_ek: [], yerel: [] }, 'ollama:qwen3:8b'), ['claude-sonnet-5-5', 'claude-opus-5-5', 'ollama:qwen3:8b'], 'Ollama kapalıyken kayıtlı değer kaybolmaz');

  const h = P.modelAlanlariHtml(L, { modeller: { sef: 'claude-opus-5-5', isci_basit: 'ollama:qwen3:8b', isci_hassas: 'claude-opus-5-5', denetci: 'claude-opus-5-5' }, yerel_yedek: 'sor', yerel_model: 'ollama:qwen3-coder:30b' });
  for (const k of ['model-sef', 'model-isci_basit', 'model-isci_hassas', 'model-denetci', 'ayar-yerel_yedek', 'ayar-yerel_model']) assert.ok(h.includes(`id="${k}"`), `${k} seçicisi var`);
  assert.equal((h.match(/value="claude-fable-5-1"/g) || []).length, 1, 'Fable seçeneği yalnızca bir kez (şef satırında)');
  assert.ok(/<option value="ollama:qwen3:8b" selected>/.test(h), 'kayıtlı değer seçili');
  assert.ok(/<option value="sor" selected>/.test(h), 'yerel yedek modu seçili');
  const kotu = P.modelAlanlariHtml({ claude: [], sef_ek: [], yerel: ['ollama:x"><img src=x onerror=alert(1)>'] }, {});
  assert.ok(!/<img/i.test(kotu), 'Ollama model adı kaçışlanır');

  assert.match(P.yedekUyariMetni({ uygun: false, baglam: 4096, neden: 'bağlam yetersiz, OLLAMA_CONTEXT_LENGTH=32768 gerekli (qwen3-coder:30b: 4096)' }), /bağlam yetersiz, OLLAMA_CONTEXT_LENGTH=32768 gerekli/);
  assert.match(P.yedekUyariMetni({ uygun: false, neden: 'x' }), /devreye girmez/);
  assert.equal(P.yedekUyariMetni({ uygun: true, baglam: 32768 }), '');
  assert.equal(P.yedekUyariMetni(null), '');
}

// Faz 7: zepul-ai olayları mevcut kart kalıbıyla; kaynağı zepul-ai olan satırda rozet, diğerlerinde yok; şefin akışında görünür.
{
  const zo = (tur, ek = {}) => P.olayHtml({ id: `z-${tur}`, ts: 0, ajan: 'zepul-ai', tur, ...ORNEK[tur], ...ek });
  assert.match(zo('gorev_alindi'), /g-1[\s\S]*README güncelle/, 'görev kartı id ve metni gösterir');
  assert.match(zo('gorev_sonuc'), /BAŞARISIZ[\s\S]*cevap gelmedi/, 'sonuç kartı hüküm ve özet');
  assert.match(zo('zepul_ai_soru'), /Tablolar silinsin mi\?/, 'soru kartı');
  for (const tur of ['gorev_alindi', 'gorev_sonuc', 'zepul_ai_soru']) assert.match(zo(tur), /rozet-zepul-ai/, `${tur} rozetli`);
  assert.match(P.olayHtml({ id: 'm', ts: 0, ajan: 'zepul-ai', tur: 'mesaj', kimden: 'zepul-ai', kime: 'sef', metin: 'x' }), /rozet-zepul-ai/, 'zepul-ai mesajı rozetli');
  assert.match(P.olayHtml({ id: 'o', ts: 0, ajan: 'isci1', tur: 'onay_sonuc', onay_id: 'o1', karar: 'evet', kaynak: 'zepul-ai' }), /rozet-zepul-ai/, 'zepul-ai onayı rozetli');
  assert.ok(!/rozet-zepul-ai/.test(P.olayHtml({ id: 'k', ts: 0, ajan: 'kullanici', tur: 'mesaj', kimden: 'kullanici', kime: 'sef', metin: 'x' })), 'kullanıcı satırı rozetsiz');
  assert.ok(!/rozet-zepul-ai/.test(P.olayHtml({ id: 'h', ts: 0, ajan: 'x', tur: 'hata', kaynak: 'ag', mesaj: 'm' })), 'hata kaynağı rozet sayılmaz');
  assert.ok(!/<script/i.test(zo('zepul_ai_soru', { soru: '<script>alert(1)</script>' })), 'soru kaçışlı');
  assert.ok(P.gorunumFiltresi('secili', 'sef')({ ajan: 'zepul-ai', tur: 'gorev_alindi', kaynak: 'zepul-ai' }), 'şefin akışında görünür');
}

// Yetenek görevi (yetenek-dongusu.md 2): gorev_tur yetenek olan görev ve sonucu ayrı rozetle; olağan görevde yok.
{
  const yo = (tur, ek = {}) => P.olayHtml({ id: `y-${tur}`, ts: 0, ajan: 'zepul-ai', tur, ...ORNEK[tur], ...ek });
  for (const tur of ['gorev_alindi', 'gorev_sonuc']) {
    assert.match(yo(tur, { gorev_tur: 'yetenek' }), /class="rozet rozet-yetenek"[^>]*>yetenek</, `${tur}: yetenek rozeti`);
    assert.ok(!/rozet-yetenek/.test(yo(tur)), `${tur}: olağan görevde yetenek rozeti yok`);
  }
  assert.ok(/rozet-yetenek\s*\{/.test(html), 'yetenek rozetinin stili var');
}

// İkinci görüş (yetenek-dongusu.md 3): olay kartı ve panelden model seçimi (Claude + Fable; yerel yok).
{
  assert.ok(P.TURLER.includes('ikinci_gorus'), 'ikinci_gorus olay türü');
  const g = P.olayHtml({ id: 'ig', ts: 0, ajan: 'sef', tur: 'ikinci_gorus', model: 'claude-fable-5-1', soru: 'Reddedeyim mi?', gorus: 'Katılmıyorum: alternatif var.', sure_ms: 42000 });
  assert.match(g, /İkinci görüş/, 'kart başlığı');
  assert.match(g, /Reddedeyim mi\?[\s\S]*Katılmıyorum: alternatif var\./, 'soru ve görüş');
  assert.match(g, /claude-fable-5-1|Fable/, 'model görünür');
  assert.match(P.RENDER.ikinci_gorus({ model: 'claude-opus-5-5', soru: 's', hata: 'zaman aşımı (300 sn)' }), /alınamadı[\s\S]*zaman aşımı/, 'hata görünür');
  assert.ok(!/<script/i.test(P.RENDER.ikinci_gorus({ model: 'x', soru: '<script>1</script>', gorus: '<script>2</script>' })), 'kaçışlı');
  const h = P.modelAlanlariHtml({ claude: ['claude-sonnet-5-5', 'claude-opus-5-5'], sef_ek: ['claude-fable-5-1'], ikinci_gorus_ek: ['claude-fable-5-1'], yerel: ['ollama:qwen3:8b'] }, { ikinci_gorus_modeli: 'claude-fable-5-1' });
  const sec = /<select id="ayar-ikinci_gorus_modeli" name="ikinci_gorus_modeli">([\s\S]*?)<\/select>/.exec(h);
  assert.ok(sec, 'ikinci görüş model seçicisi');
  assert.match(sec[1], /<option value="claude-fable-5-1" selected>/, 'Fable seçili');
  assert.match(sec[1], /value="claude-opus-5-5"/, 'Opus seçeneği');
  assert.ok(!/ollama:/.test(sec[1]), 'yerel model seçeneği yok');
  assert.match(/<select id="ayar-ikinci_gorus_modeli"[^>]*>([\s\S]*?)<\/select>/.exec(P.modelAlanlariHtml({ claude: ['claude-opus-5-5'] }, {}))[1], /value="claude-opus-5-5" selected/, 'varsayılan Opus');
  assert.ok(/ayar\.ikinci_gorus_modeli = f\.ikinci_gorus_modeli\.value/.test(html), 'kaydet ayara yazar');
}

// 17) kuyruk olayı: yoklama yok, olayla güncellenir
{
  const km = P.kuyrukModeli({ tur: 'kuyruk', sebep: 'eklendi', bekleyen: [{ id: 'is-1' }], yerel: [{ id: 'a1', ad: 'dokuman', model: 'ollama:x' }] });
  assert.deepEqual(km.bekleyen.map(x => x.id), ['is-1'], 'bekleyen listesi olaydan');
  assert.equal(km.yerel[0].ad, 'dokuman', 'yerel sıra olaydan');
  assert.deepEqual(P.kuyrukModeli({ tur: 'kuyruk' }), { bekleyen: [], yerel: [] }, 'eksik alan boş liste');
  assert.deepEqual(P.kuyrukModeli({ tur: 'kuyruk', bekleyen: 'x', yerel: 5 }), { bekleyen: [], yerel: [] }, 'bozuk alan boş liste');
  assert.match(P.yerelSiraHtml({ id: 'a1', ad: '<b>x</b>', model: 'ollama:m' }), /&lt;b&gt;x&lt;\/b&gt;[\s\S]*yerel sırada/, 'yerel sıra satırı kaçışlı');
  assert.ok(!html.includes('bekleyenYukleSonra'), 'limit olayına bağlı bekleyen yoklaması kalktı');
  assert.ok(/o\?\.tur === 'kuyruk'/.test(html) && /gelen = gelen\.filter\(o => o\?\.tur !== 'kuyruk'\)/.test(html), 'kuyruk olayı akışa girmez, olaylariAl işler');
}

// 18) owns-disi birleşme kartı: dal, OWNS dışı commit ve yollar, gerekçe
{
  const od = P.RENDER.birlesme({ isci: 'sunucu', dal: 'is/sunucu', durum: 'owns-disi', hata: 'dal geçmişinde OWNS dışı değişiklik: KURALLAR.md', yollar: ['KURALLAR.md', 'docs/x.md'], commitler: ['abc1234 yanlış dosya'] });
  assert.match(od, /birlesme-owns-disi[\s\S]*OWNS dışı[\s\S]*is\/sunucu/, 'rozet ve dal');
  assert.match(od, /OWNS dışına dokunan commit[\s\S]*abc1234 yanlış dosya/, 'commit listesi');
  assert.match(od, /OWNS dışına dokunulan yollar[\s\S]*KURALLAR\.md[\s\S]*docs\/x\.md/, 'yol listesi');
  assert.match(od, /Gerekçe[\s\S]*dal geçmişinde OWNS dışı değişiklik/, 'gerekçe');
  assert.match(od, /Birleşmedi[\s\S]*Şef kararı/, 'açıklama: şef kararı gerekli');
  const bos = P.RENDER.birlesme({ dal: 'x', durum: 'owns-disi' });
  assert.match(bos, /OWNS dışı/, 'ayrıntısız olay da kart olur');
  assert.ok(!bos.includes('undefined'), 'eksik alan undefined yazmaz');
  assert.ok(!/<script/i.test(P.RENDER.birlesme({ dal: 'x', durum: 'owns-disi', yollar: ['<script>'], commitler: ['<script>'], hata: '<script>' })), 'kaçışlı');
}

// 19) Jev ↔ Laya bölümü: özet sayılar, karışıklık tablosu, anlaşmazlık listesi; kaçışlı, eksik alan undefined yazmaz
{
  const sinif = ['guvenli', 'riskli', 'geri-alinamaz', 'belirsiz'];
  const kar = Object.fromEntries(sinif.map(a => [a, Object.fromEntries(sinif.map(b => [b, 0]))]));
  kar.riskli.belirsiz = 7; kar.guvenli.guvenli = 3;
  const m = { canli: { toplam: 10, uyum_orani: 0.3, kappa: 0.0123, karisiklik: kar, guvenlik_geri_cagirma: 0.5, jev_ort_ms: 640, laya_ort_ms: 70,
    anlasmazliklar: [{ arac: 'Bash', girdi: '<script>x</script>', jev: 'riskli', laya: 'belirsiz', ts: '2026-10-03T10:00:00.000Z' }] },
    taban: { kayit: 576, dogruluk: 0.2118, kappa: 0.0015 } };
  const h = P.layaHtml(m);
  assert.match(h, /Toplam[\s\S]*10/, 'toplam');
  assert.match(h, /%30/, 'uyum oranı yüzde');
  assert.match(h, /0,012/, 'kappa Türkçe ondalık');
  assert.match(h, /%50/, 'güvenlik geri çağırma');
  assert.match(h, /<table[\s\S]*>7</, 'karışıklık tablosu hücresi');
  assert.match(h, /Taban[\s\S]*576[\s\S]*%21/, 'taban özeti');
  assert.match(h, /Bash[\s\S]*riskli[\s\S]*belirsiz/, 'anlaşmazlık satırı');
  assert.ok(!h.includes('<script>'), 'girdi kaçışlı');
  const bos = P.layaHtml({ canli: { toplam: 0, uyum_orani: null, kappa: null, anlasmazliklar: [] }, taban: null });
  assert.match(bos, /gölge kaydı yok/i);
  assert.ok(!bos.includes('undefined') && !bos.includes('null') && !bos.includes('NaN'), 'boş durumda uydurma değer yok');
  assert.match(P.layaHtml(null), /gölge kaydı yok|bekleniyor/i, 'veri yoksa çökmez');
}

// 20) Çalışma alanları (docs/sozlesme/calisma-alanlari.md): ayarlar listesi, alan onay kartı (onay_tur "alan" ya da onerilen)
{
  const h = P.alanlarHtml(['C:\\Users\\x\\zepul-ai', '<script>']);
  assert.equal((h.match(/data-alan-cikar=/g) || []).length, 2, 'her alanın Çıkar düğmesi');
  assert.match(h, /zepul-ai/);
  assert.ok(!h.includes('<script>'), 'kaçışlı');
  assert.match(P.alanlarHtml([]), /Ek alan yok/);
  assert.match(P.alanlarHtml(null), /Ek alan yok/, 'bozuk girdi çökmez');
  assert.ok(P.alanKarti({ onay_tur: 'alan', onerilen: 'C:/x' }) && P.alanKarti({ onerilen: 'C:/x' }) && !P.alanKarti({ arac: 'Bash' }));
  const d = P.onayDugmeleri(true);
  assert.match(d, /data-eylem="alan"[^>]*>Evet, alana ekle/);
  assert.match(d, /data-eylem="evet"[^>]*>Yalnızca bu sefer/);
  assert.match(d, /data-eylem="hayir"/);
  assert.ok(!P.onayDugmeleri(false).includes('data-eylem="alan"'), 'düz kartta alana ekle yok');
  assert.ok(/'\/api\/alanlar'/.test(html) && /alana_ekle: true/.test(html), 'API çağrıları yerinde');
  assert.ok(/o\?\.tur === 'alanlar'/.test(html), '`alanlar` SSE olayı listeyi günceller');
}

// 21) Güven modu (docs/sozlesme/guven-modu.md): tam şeridi, kalan süre, kapı olayında kaynak rozeti, toplu onay, Laya yedeği sayacı
{
  const simdi = Date.UTC(2026, 9, 4, 12, 0, 0);
  assert.equal(P.guvenSeridiHtml({ kademe: 'jev' }, simdi), '', 'jev kademesinde şerit yok');
  assert.equal(P.guvenSeridiHtml(null, simdi), '', 'bozuk girdi çökmez');
  const tam = P.guvenSeridiHtml({ kademe: 'tam', bitis: simdi + 15 * 60000 }, simdi);
  assert.match(tam, /Tam güven: Jev ve onay sorulmuyor/);
  assert.match(tam, /15 dk/, 'kalan süre');
  assert.match(tam, /data-kalan=/, 'kalan süre saniyede bir güncellenir');
  assert.match(P.guvenSeridiHtml({ kademe: 'tam', bitis: null }, simdi), /süresiz/);
  assert.match(P.guvenSeridiHtml({ kademe: 'kullanici', bitis: null }, simdi), /Kullanıcı kademesi/, 'kullanıcı kademesi de görünür');
  assert.deepEqual(P.guvenModeli({ kademe: 'tam', bitis: 5, alan_otomatik: true, jev_soguma_bitis: 9 }), { kademe: 'tam', bitis: 5, alan_otomatik: true, jev_soguma_bitis: 9 });
  assert.deepEqual(P.guvenModeli({ kademe: 'x' }), { kademe: 'jev', bitis: null, alan_otomatik: false, jev_soguma_bitis: null }, 'bozuk kademe jev sayılır');
  assert.match(P.RENDER.kapi({ karar: 'izin', karar_kaynagi: 'tam-guven', neden: 'izin (tam güven): Jev ve onay sorulmadı' }), /kapı: izin \(tam güven\)/);
  assert.match(P.RENDER.kapi({ karar: 'izin', karar_kaynagi: 'laya-yedek', neden: 'Laya (Jev yedeği): guvenli' }), /class="kaynak-rozet"[^>]*>Laya \(Jev yedeği\)/);
  assert.ok(!P.RENDER.kapi({ karar: 'izin', neden: 'x' }).includes('kaynak-rozet'), 'Jev kararında rozet yok');
  const m = { canli: { toplam: 3, laya_yedek: 7, uyum_orani: 1, kappa: 1, karisiklik: {}, anlasmazliklar: [] }, taban: null };
  assert.match(P.layaHtml(m), /Jev yedeği<\/dt><dd>7/);
  assert.match(P.layaHtml({ canli: { toplam: 0, laya_yedek: 2, anlasmazliklar: [] }, taban: null }), /Jev yedeği<\/dt><dd>2/, 'gölge kaydı yokken de yedek sayısı görünür');
  const rg = P.layaHtml({ canli: { ...m.canli, riskli_guvenli_sanma: { sayi: 7, toplam: 8, oran: 0.875 } }, taban: null });
  assert.match(rg, /Riskliyi güvenli sanma<\/dt><dd>7\/8 \(%88\) · eşik ≤%2<\/dd>/, 'riskliyi güvenli sanma sayacı devralma eşiğiyle');
  assert.ok(/'\/api\/guven'/.test(html) && /'\/api\/onay\/hepsi'/.test(html), 'API çağrıları yerinde');
  assert.ok(/o\?\.tur === 'guven'/.test(html), '`guven` SSE olayı şeridi günceller');
  assert.ok(/id="guven-form"/.test(html) && /name="sure"/.test(html) && /name="alan_otomatik"/.test(html) && /name="hepsini"/.test(html), 'güven formu: kademe, süre, alan_otomatik, bekleyenleri de onayla');
  assert.ok(/value="15"/.test(html) && /value="60"/.test(html) && /value=""[^>]*>Süresiz/.test(html), 'süre seçenekleri');
  assert.ok(/id="hepsini-onayla"/.test(html), 'bekleyenlerin hepsini onayla düğmesi');
  assert.ok(/async function hepsiniOnayla\(\) \{[\s\S]{0,300}await api\('\/api\/onay\/hepsi', \{ karar: 'evet' \}\)/.test(html) && /addEventListener\('click', hepsiniOnayla\)/.test(html), 'düğme toplu onay ucunu çağırır');
}

{
  const kesin = { onay_id: 'k1', arac: 'Grep', onay_tur: 'kesin', etiket: 'Kesin yasak: yalnızca sen onaylarsan yapılır', risk: 'yuksek' };
  assert.ok(P.kesinKarti(kesin) && !P.kesinKarti({ onay_tur: 'alan' }) && !P.kesinKarti(null), 'kesin kart tanınır');
  const e = P.kesinEtiketHtml(kesin);
  assert.match(e, /class="kesin-etiket"/);
  assert.match(e, /Yalnızca sen/);
  assert.match(e, /Kesin yasak: yalnızca sen onaylarsan yapılır/);
  assert.equal(P.kesinEtiketHtml({ onay_tur: 'alan' }), '', 'düz kartta etiket yok');
  assert.ok(!P.kesinEtiketHtml({ onay_tur: 'kesin', etiket: '<img>' }).includes('<img'), 'kaçışlı');
  assert.match(html, /\.onay-kesin \{[^}]*border: 2px solid var\(--kirmizi\)/, 'kesin kart kırmızı kenarlı');
  assert.match(html, /\$\{kesin \? ' onay-kesin' : ''\}/, 'onay kartı kesin sınıfını alır');
  assert.match(P.RENDER.onay_istek(kesin), /Yalnızca sen/, 'akıştaki onay isteği de etiketli');
  assert.match(P.RENDER.uyari(ORNEK.uyari), /Uyarı[\s\S]*Bash: geri alınamaz/);
  assert.match(P.RENDER.uyari(ORNEK.uyari), /class="uyari-kart"/);
  assert.ok(P.gorunumFiltresi('uyarilar')({ tur: 'uyari' }) && !P.gorunumFiltresi('uyarilar')({ tur: 'hata' }), 'Uyarılar görünümü');
  assert.ok(/data-gorunum="uyarilar">Uyarılar<span class="sayac sayac-uyari" id="uyari-sayac">/.test(html), 'Uyarılar sekmesi ve rozeti');
  assert.ok(/o\.tur === 'uyari'\)\.length/.test(html), 'rozet uyari olaylarını sayar');
}

// Claude Code oturum listesi: çalışana Durdur, kaçış, boş liste.
{
  const h = P.ccListeHtml([{ id: 'cc-1', rol: 'claude-code', ad: '<b>x</b>', durum: 'calisiyor', gorev_ozet: 'iş' }, { id: 'cc-2', rol: 'claude-code', ad: 'y', durum: 'bekliyor', kabul: 'k' }, { id: 'sef', rol: 'sef', ad: 'Şef' }]);
  assert.ok(h.includes('data-cc-durdur="cc-1"') && !h.includes('data-cc-durdur="cc-2"') && h.includes('data-cc-ac="cc-2"') && h.includes('data-cc-denetle="cc-2"') && !h.includes('data-cc-denetle="cc-1"') && !h.includes('Şef'), 'yalnız cc oturumları, Durdur yalnız çalışanda');
  assert.ok(!h.includes('<b>x</b>'), 'ad kaçışlanır');
  assert.match(P.ccListeHtml([]), /Henüz Claude Code/);
  assert.match(P.RENDER.maliyet({ maliyet_usd: 0.5, tur_maliyet: 0.25, sonuc: { basarili: true, tur_sayisi: 2, sure_ms: 1500 } }), /Sonuç: başarılı · 2 tur · 1.5 sn/);
}

// Uydu görünümü: olay → uydu durumu (bağlandı, çalışıyor, bekliyor, bitti) ve akış animasyonları; saf, girdiyi değiştirmez.
{
  const ajanlar = [{ id: 'cc-1', ad: 'cc · bir', rol: 'claude-code', durum: 'bekliyor' }, { id: 'sef', ad: 'Şef', rol: 'sef', durum: 'calisiyor' }, { id: 'eski', durum: 'bitti' }];
  let u = P.uydulariEsle(new Map(), ajanlar, 0);
  assert.deepEqual([...u.keys()], ['cc-1', 'sef'], 'bitmiş ajan uydu olarak doğmaz');
  assert.equal(u.get('cc-1').durum, 'bagli', 'yeni oturum bağlandı durumunda');
  assert.equal(u.get('sef').durum, 'calisiyor');
  assert.equal(P.uydulariEsle(u, ajanlar, 10).get('cc-1').durum, 'bagli', 'liste "bekliyor" dese de bağlanma ilk işe kadar sürer');
  const bas = u;
  let r = P.uyduOlayi(u, { ajan: 'cc-1', tur: 'arac', arac: 'Bash', arac_id: 't1' }, 100);
  assert.equal(r.uydular.get('cc-1').durum, 'calisiyor', 'araç çağrısı çalışıyor yapar');
  assert.deepEqual(r.akis, [{ kaynak: 'cc-1', hedef: 'os', tur: 'arac' }], 'araç çağrısı uydudan merkeze nokta akışı');
  assert.equal(bas.get('cc-1').durum, 'bagli', 'girdi haritası değişmez (saf)');
  r = P.uyduOlayi(r.uydular, { ajan: 'cc-1', tur: 'arac', arac: 'Agent', arac_id: 't2' }, 110);
  assert.equal(r.akis[0].tur, 'alt', 'Agent çağrısı elektrik arkı');
  r = P.uyduOlayi(r.uydular, { ajan: 'cc-1/Explore', tur: 'arac', arac: 'Grep', arac_id: 't3' }, 120);
  assert.deepEqual(r.uydular.get('cc-1/Explore'), { id: 'cc-1/Explore', ust: 'cc-1', ad: 'Explore', durum: 'calisiyor', baglanma: 120, degisim: 120 }, 'alt ajan uydusu ananın altında bağlanır');
  assert.deepEqual(r.akis, [{ kaynak: 'cc-1', hedef: 'cc-1/Explore', tur: 'alt' }, { kaynak: 'cc-1/Explore', hedef: 'cc-1', tur: 'arac' }], 'alt ajan başlatma arkı, sonra alt ajanın aracı anaya akar');
  r = P.uyduOlayi(r.uydular, { ajan: 'cc-1', tur: 'arac_sonuc', arac_id: 't1' }, 130);
  assert.deepEqual(r.akis, [{ kaynak: 'os', hedef: 'cc-1', tur: 'sonuc' }], 'sonuç dönüşü merkezden uyduya mekik');
  r = P.uyduOlayi(r.uydular, { ajan: 'cc-1', tur: 'maliyet', maliyet_usd: 0.1 }, 140);
  assert.deepEqual(r.akis, [{ kaynak: 'cc-1', hedef: 'os', tur: 'sonuc' }], 'tur sonucu uydudan merkeze mekik');
  r = P.uyduOlayi(r.uydular, { ajan: 'cc-1', tur: 'durum', durum: 'bekliyor' }, 150);
  assert.equal(r.uydular.get('cc-1').durum, 'bekliyor', 'tur bitti: bekliyor (soluk)');
  assert.equal(r.uydular.get('cc-1/Explore').durum, 'bitti', 'ananın turu bitince alt ajan söner');
  assert.equal(P.uyduOlayi(r.uydular, { ajan: 'yabanci', tur: 'arac', arac: 'Bash' }, 160).uydular, r.uydular, 'bilinmeyen ajan yok sayılır');
  assert.equal(P.uyduOlayi(r.uydular, null, 160).akis.length, 0, 'bozuk olay akışı bozmaz');
  r = P.uyduOlaylari(r.uydular, [{ ajan: 'cc-1', tur: 'metin', metin: 'x' }, { ajan: 'cc-1', tur: 'durum', durum: 'bitti' }], 200);
  assert.equal(r.uydular.get('cc-1').durum, 'bitti', 'oturum bitti: söner');
  assert.equal(P.uyduOlayi(r.uydular, { ajan: 'cc-1', tur: 'arac', arac: 'Bash' }, 210).uydular.get('cc-1').durum, 'bitti', 'sönen uydu geç olayla canlanmaz');
  assert.ok(P.uydulariEsle(r.uydular, ajanlar, 200 + P.UYDU_SONME_MS / 2).has('cc-1'), 'sönme süresince durur');
  u = P.uydulariEsle(r.uydular, ajanlar, 200 + P.UYDU_SONME_MS + 1);
  assert.ok(!u.has('cc-1') && !u.has('cc-1/Explore'), 'sönme bitince silinir (sızıntı yok)');
  assert.equal(P.uydulariEsle(new Map([['cc-9', { id: 'cc-9', ust: null, durum: 'calisiyor', baglanma: 0, degisim: 0 }]]), [], 5).get('cc-9').durum, 'bitti', 'listeden düşen oturum söner');
  assert.deepEqual([P.uyduDurumu('calisiyor'), P.uyduDurumu('durduruldu'), P.uyduDurumu('hata'), P.uyduDurumu('olu')], ['calisiyor', 'bekliyor', 'bekliyor', 'bitti']);
  assert.equal(P.uyduTonu('cc-1'), P.uyduTonu('cc-1'), 'renk kararlı');
  const tonlar = new Set(Array.from({ length: 30 }, (_, i) => P.uyduTonu(`cc-${i}`)));
  assert.ok(tonlar.size > 20 && [...tonlar].every(x => x >= 0 && x < 360), '30 oturum ayrışan renklerde');
  assert.ok(/data-gorunum="uydular">Uydular</.test(html) && /id="uydu-tuval"/.test(html), 'Uydular sekmesi ve tuvali var');
  assert.ok(/visibilitychange/.test(html) && /UYDU\.besle\(eklenen, canli\)/.test(html), 'gizli sekmede döngü durur; canlı olaylar uyduları besler');
}

console.log('panel.test.mjs: tüm denetimler geçti');

// Denetim bulgusu 2: zepul-ai görev kartında "İptal" düğmesi (POST /api/gorev/iptal); kimlik kaçışlı.
{
  const h = P.olayHtml({ id: 'gi', ts: 0, ajan: 'zepul-ai', tur: 'gorev_alindi', kaynak: 'zepul-ai', gorev_id: 'g-1', metin: 'x' });
  assert.match(h, /<button type="button"[^>]*data-gorev-iptal="g-1"[^>]*>İptal<\/button>/, 'görev kartında İptal düğmesi');
  assert.ok(!/<img/.test(P.olayHtml({ id: 'gk', ts: 0, ajan: 'zepul-ai', tur: 'gorev_alindi', gorev_id: '"><img src=x>', metin: 'x' })), 'kimlik kaçışlı');
  assert.match(html, /api\('\/api\/gorev\/iptal', \{ gorev_id/, 'düğme iptal ucunu çağırır');
}

// GitHub takip kartı (sunucu/takipci.ts): son raporu açar, her önerinin yanında "Kur" düğmesi (basmak onaydır; onay kartı yok), kaçışlı.
{
  assert.match(P.takipHtml(null, 't'), /Henüz rapor yok/);
  const h = P.takipHtml({ rapor: 'github-takip-2026-10-20.html', tarih: '<script>x</script>', toplam: 5, elendi: 2, oneri: 2, kuruldu: 1, acik: true, otomatik: false,
    oneriler: [{ ad: 'a/<b>', puan: 9.1, ne_yapar: '<img src=x>' }, { ad: 'c/d', puan: 6, ne_yapar: 'iyi' }] }, 'a b');
  assert.ok(/href="\/api\/takip\/rapor\?t=a%20b"/.test(h) && /rel="noopener noreferrer"/.test(h), 'rapor bağlantısı token kodlu, referrer yok');
  assert.ok(!/<script>x/.test(h), 'kaçışlı');
  assert.match(h, /Öneri<\/dt><dd>2/);
  assert.ok(!/Onay bekliyor/.test(h), 'onay kartı kavramı yok');
  assert.equal((h.match(/data-kur-ad=/g) || []).length, 2, 'her öneri için Kur düğmesi');
  assert.ok(/data-kur-ad="a\/&lt;b&gt;"[^>]*>Kur</.test(h) && !/<img src=x>/.test(h), 'Kur düğmesi kaçışlı');
  assert.ok(!/onay kartıyla/.test(h), 'eski onay kartı metni yok');
  assert.ok(/o\?\.tur === 'takip'/.test(html) && /api\('\/api\/takip\/kur', \{ ad/.test(html), 'takip olayı ve Kur çağrısı bağlı');
}
