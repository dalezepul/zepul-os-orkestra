// Özet paneli üretici: repodaki gerçek verileri okur, tek dosyalık etkileşimli raporlar/ozet.html yazar.
// Kullanım: node araclar/ozet.mjs        → raporlar/ozet.html
//           node araclar/ozet.mjs --test → öz-denetim (dosya yazmaz)
// Dış bağımlılık yok; grafikler istemcide satır içi SVG ile çizilir. Bulunamayan değer null → sayfada "—".
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CIKTI = path.join(REPO, "raporlar", "ozet.html");
const GOLGE_BASLANGIC = "2026-10-03";
const SON_BILINEN_TEST = 1425;

const oku = (p) => { try { return fs.readFileSync(path.join(REPO, p), "utf8"); } catch { return null; } };
const json = (p) => { const s = oku(p); if (s == null) return null; try { return JSON.parse(s); } catch { return null; } };
const jsonl = (p) => (oku(p) ?? "").split(/\r?\n/).filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
const git = (...a) => { const r = spawnSync("git", a, { cwd: REPO, encoding: "utf8", maxBuffer: 64 << 20 }); return r.status === 0 ? r.stdout : null; };
const sayi = (s) => (s == null ? null : Number(String(s).replace(/\./g, "").replace(",", ".")));
const hucreler = (satir) => satir.trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map((h) => h.trim().replace(/\\\|/g, "|"));

// Elle aktarılan olgular: her biri kaynak dosyasında birebir geçen bir "iz" taşır; --test izleri denetler.
const OLGULAR = {
  yerelModeller: [
    { model: "qwen3-coder:30b", yer: "%67 CPU / %33 GPU", tok: 28.5, not: "Araç sırası doğru; 32k bağlamla GPU'da CUDA OOM", kaynak: "docs/arastirma/faz5-5-yerel-model.md", iz: "28,5 tok/sn" },
    { model: "qwen3.5:9b (zepul-ai)", yer: "tam GPU", tok: 25, not: "32k genel ayar onu GPU dışına itti (17,9 tok/sn); geri alındı", kaynak: ".loop/state.json", iz: "tam GPU, 25 tok/sn" },
    { model: "zepul-gptoss-cpu (gpt-oss:20b)", yer: "CPU, 32k, VRAM 0", tok: 6.8, not: "İstem 48 tok/sn; ilk tur 279 sn", kaynak: "sunucu/DUMAN.md", iz: "üretim 6,8 tok/sn" },
    { model: "qwen3:8b", yer: "tam GPU, 5,6 GB", tok: null, not: "Read ve Write'ı aynı turda çağırdı (yanlış)", kaynak: "docs/arastirma/faz5-5-yerel-model.md", iz: "`qwen3:8b`: 5,6 GB" },
  ],
  laya20: { sha: "38ef629", kaynak: "git 38ef629 veri/laya-egitim/metrik.json" },
  laya30: { sha: "266e882", kaynak: "git 266e882 veri/laya-egitim/metrik.json" },
};

// Taslak rapordaki (8221b58) zepul-ai önerileri ve hazır istemler; içerik korunur.
const TASLAK = {
  "on": [
    {
      "no": 1,
      "baslik": "Orkestra entegrasyonunu canlı doğrula",
      "neden": "Faz 7 zepul-ai tarafı yazıldı, testleri geçiyor, ama gerçek orkestraya karşı onay turu ve \"Emin misin?\" hiç uçtan uca denenmedi.",
      "kazanc": "Kâğıt üstündeki her şeyin gerçekten çalıştığını bilirsiniz; `REDDEDILDI` gibi yeni sonuçların doğru gösterildiği netleşir.",
      "is": "küçük (yarım oturum)"
    },
    {
      "no": 2,
      "baslik": "Onay bildirimlerini telefonda kullan",
      "neden": "Onay kartı açılınca ekran başında değilseniz iş bekler.",
      "kazanc": "ntfy \"onay bekliyor\" der (ayrıntısız, çünkü konu herkese açık), siz telefondan tailnet üzerinden panele girip düğmeye basarsınız. Onay düğmesi panelde kalır; ntfy'ye onay bağlantısı ya da token konmaz. Telefonda mikrofon için Tailscale HTTPS onayı da gerekir (sizin işiniz).",
      "is": "küçük–orta"
    },
    {
      "no": 3,
      "baslik": "Orkestra görev geçmişi görünümü",
      "neden": "Bugün görev sonucu bir bildirim olarak gelip gidiyor.",
      "kazanc": "\"Dün orkestraya ne verdim, ne oldu?\" sorusunun tek ekranda cevabı: görev, durum, süre, özet. Yeniden başlatınca kaybolmaz.",
      "is": "orta (bir oturum)"
    },
    {
      "no": 4,
      "baslik": "Sesli asistanı tamamla",
      "neden": "Uyanma kelimesi (openWakeWord) ve konuşma sonu (Silero VAD) zaten tarayıcıda yazılı, ama mikrofonla hiç denenmedi. TTS bulut (`msedge-tts`).",
      "kazanc": "Piper Türkçe ses (~60 MB) eklenirse ses internetsiz ve hızlı olur; Edge TTS yedek kalır. \"AI Modelleri.md\" önerisinin 1. sırası tam olarak bu.",
      "is": "orta–büyük (1–2 oturum + sizin mikrofon testiniz)"
    },
    {
      "no": 5,
      "baslik": "MyBrain kâtip kuyruğunu izle",
      "neden": "Orkestra kapalıyken notlar `katip-kuyruk.jsonl`'da sessizce birikir.",
      "kazanc": "Panelde \"3 not bekliyor\" göstergesi; kuyruk takılırsa (MyBrain reddi, 400) neden görünür ve not kaybolmaz.",
      "is": "küçük"
    },
    {
      "no": 6,
      "baslik": "GPU paylaşımı",
      "neden": "8 GB VRAM'i zepul-ai'nin `qwen3.5:9b` modeli (~5,6 GB) ve Laya paylaşıyor; Laya eğitimi ya da büyük model yüklenince biri diğerini boşaltır, her geçiş soğuk yükleme demek.",
      "kazanc": "zepul-ai yerel modeli ısıtmadan önce GPU'nun dolu olup olmadığına bakar, doluysa bekler ya da kullanıcıya söyler; garip yavaşlamalar biter.",
      "is": "orta"
    },
    {
      "no": 7,
      "baslik": "Görev sonucunu dürüst göster",
      "neden": "Panel şu an `TAMAM` dışındaki her sonucu aynı \"uyarı\" rengiyle gösteriyor; sesli özet her durumda \"görevi bitti\" diyor.",
      "kazanc": "\"Reddedildi, yapılmadı\" ile \"başarısız oldu\" ayrı duyulur. Bilinmeyen sonuç değeri de güvenli tarafta \"yapılmadı\" sayılır.",
      "is": "küçük (1. maddeyle birlikte yapılabilir)"
    },
    {
      "no": 8,
      "baslik": "\"Hey Zepul\" özel uyanma kelimesi",
      "neden": "Şimdilik hazır \"Hey Jarvis\" modeli kullanılıyor.",
      "kazanc": "Kendi adıyla uyanan asistan. openWakeWord'ün resmî not defteriyle ~1 saatte eğitilir. Not: hazır modellerin lisansı yalnızca ticari olmayan kullanıma izin veriyor.",
      "is": "orta (Colab + karar sizde)"
    }
  ],
  "is": [
    {
      "baslik": "Orkestra entegrasyonunu doğrula",
      "metin": "Önce docs/devir.md, sonra CLAUDE.md oku.\n\nHedef: Faz 7 orkestra sözleşmesinin zepul-ai tarafını gerçek zepul-os'a (127.0.0.1:8820, açık) karşı uçtan uca doğrula ve görev sonucu gösterimini düzelt.\n\nYapılacaklar:\n1. zepul-ai'yi yeniden başlat (Durdur.bat, Baslat.bat). Bağlantının \"zepul-ai anahtarı\" ile kurulduğunu sunucu logunda gör. Anahtarın ya da token'ın değerini hiçbir yere yazma.\n2. Panelden zararsız bir görev ver (\"README'yi okuyup bir cümleyle özetle\"). gorev_alindi ve gorev_sonuc olaylarının geldiğini, kartta görev satırının göründüğünü kontrol et.\n3. Orkestranın riskli bulacağı bir görev ver (ör. \"main dalını zorla gönder\"). \"zepul-os · Emin misin?\" kartının çıktığını, Hayır'a basınca sonucun REDDEDILDI geldiğini kontrol et. Kartlara ben basacağım; sen beni ntfy ile çağır ve bekle.\n4. Görev sonucu gösterimi: TAMAM dışındaki değerler (BASARISIZ, REDDEDILDI ve bilinmeyen her değer) \"yapılmadı\" anlamında gösterilsin ve sesli özet \"bitti\" demesin.\n5. Kâtip notu: orkestra açıkken beyin_not ile kısa bir test notu gönder, \"kâtibe iletildi\" dönüşünü gör.\n\nKabul kontrolü:\n- npm test yeşil; görev sonucu gösterimi için önce kırmızı bir panel testi, sonra düzeltme.\n- Adım 2, 3, 5'in sonucu docs/devir.md'de kısa bir tabloyla yazılı.\n- Onay ve cevap çağrıları hâlâ modelin araç listesinde yok (mevcut test geçiyor).\n\nDokunma: zepul-os, MyBrain, ai os, Jev_and_Laya klasörleri (yalnızca okunur). MyBrain'e doğrudan yazma yok. Model claude-sonnet-5-5, Fable yok. Takılırsan o adımı boş bırak, docs/atlananlar.md'ye not düş, devam et."
    },
    {
      "baslik": "Sesli asistanı ekle",
      "metin": "Önce docs/devir.md, sonra CLAUDE.md ve Masaüstündeki \"AI Modelleri.md\" dosyasının ses bölümünü oku.\n\nHedef: Yerel, internetsiz Türkçe ses. Piper Türkçe TTS'i birincil ses yap; msedge-tts yedek kalsın. Mevcut uyanma kelimesi (openWakeWord) ve konuşma sonu (Silero VAD) hattını bozmadan bağla.\n\nYapılacaklar:\n1. Piper'ın Windows ikilisini ve bir Türkçe sesi (tr_TR) indirme betiği yaz (npm run modeller gibi; dosyalar git'e girmesin). Lisansları docs/devir.md'ye not et.\n2. sunucu/ses.ts: önce Piper dene, hata ya da zaman aşımında msedge-tts'e düş. POST /api/ses sözleşmesi değişmesin.\n3. Panelde ses seçicisine \"Piper (yerel)\" seçeneği ekle. Olay türü eklersen panel/panel.test.mjs listesini güncelle.\n4. Mikrofon testi için bana ntfy ile haber ver; konuşma testini ben yapacağım. Ben yanıt verene kadar bu adımı boş bırak.\n\nKabul kontrolü:\n- npm test yeşil. Piper yokken msedge-tts'e düştüğünü gösteren bir test (önce kırmızı).\n- npm run ses-dogrula Piper sesiyle de geçiyor.\n- Aynı cümle için Piper ve Edge süreleri devir.md'de.\n\nDokunma: zepul-os, MyBrain, ai os, Jev_and_Laya. GPU'da sürekli yüklü yeni model bırakma (Piper CPU'da çalışsın). Model claude-sonnet-5-5, Fable yok. Takılırsan boş bırak, docs/atlananlar.md'ye yaz."
    },
    {
      "baslik": "Onay kartlarını telefonda göster",
      "metin": "Önce docs/devir.md, sonra CLAUDE.md oku.\n\nHedef: Bekleyen bir onay kartı (zepul-ai ya da zepul-os kaynaklı) açıldığında telefonuma haber gelsin ve kartı telefondan, tailnet üzerinden açılan panelde tıklayarak onaylayabileyim.\n\nKurallar:\n- ntfy konusu herkese açık. Mesajda araç adı, yol, komut, token, bağlantı ya da kişisel ayrıntı olmasın. Yalnızca \"Zepul AI: soru: onay bekliyor\" gibi bir başlık ve \"panelden bak\" mesajı.\n- Onay yalnızca panelde tıklamayla verilir. ntfy eylem düğmesi, onay bağlantısı ya da token içeren adres ekleme.\n- Aynı kart için bir kez bildirim; 10 dk içinde karar yoksa bir hatırlatma, sonra sus.\n\nYapılacaklar:\n1. onay_istek geldiğinde ntfy gönder (mevcut asistan.ts gönderim kodunu kullan).\n2. Panelin telefon görünümünde bekleyen kartlar en üstte ve dokunmaya uygun büyüklükte olsun.\n3. Tailscale HTTPS kapalıysa bunu bir kez soru olarak sor; açmak benim işim.\n\nKabul kontrolü:\n- npm test yeşil; \"ntfy mesajında araç adı/ozet yok\" testi önce kırmızı, sonra yeşil.\n- Telefon genişliğinde (390 px) panel ekran görüntüsü: kart görünüyor, düğmeler taşmıyor.\n\nDokunma: zepul-os, MyBrain, ai os, Jev_and_Laya. kapi.ts seviye kuralları gevşemesin; seviye 3 yine yalnızca tıklama. Model claude-sonnet-5-5, Fable yok. Takılırsan boş bırak, docs/atlananlar.md'ye yaz."
    },
    {
      "baslik": "Görev geçmişi paneli ekle",
      "metin": "Önce docs/devir.md, docs/protokol.md ve CLAUDE.md oku.\n\nHedef: Panelde \"Orkestra görevleri\" çekmecesi: zepul-os'a verdiğim her görev için metin, zaman, durum (bekliyor / soruldu / TAMAM / BASARISIZ / REDDEDILDI), süre ve özet. Yeniden başlatınca kaybolmasın.\n\nYapılacaklar:\n1. orkestra.ts gorev_alindi, zepul_ai_soru ve gorev_sonuc olaylarından bir görev kaydı tutsun; logs/ altında ayrı bir JSONL'a eklesin (silme yok, yalnız ekleme).\n2. Açılışta bu dosyadan son 50 görevi yükle. İstersen orkestranın GET /api/olaylar ucundan eksikleri tamamla (mevcut dar anahtarla, salt okuma).\n3. Yeni uç GET /api/orkestra-gorevler ve panelde çekmece. docs/protokol.md'yi ve panel/panel.test.mjs'yi güncelle.\n4. TAMAM dışındaki her değer \"yapılmadı\" rengiyle gösterilsin.\n\nKabul kontrolü:\n- npm test yeşil; görev kaydı birleştirme mantığı için önce kırmızı birim testi.\n- Demo modunda (?demo=1) çekmece örnek verilerle açılıyor.\n- Yeniden başlatma sonrası geçmiş duruyor (elle denendi, devir.md'de not).\n\nDokunma: zepul-os, MyBrain, ai os, Jev_and_Laya. Orkestraya yeni yazma çağrısı ekleme. Model claude-sonnet-5-5, Fable yok. Takılırsan boş bırak, docs/atlananlar.md'ye yaz."
    },
    {
      "baslik": "Kâtip kuyruğunu izle",
      "metin": "Önce docs/devir.md ve CLAUDE.md oku.\n\nHedef: veri/katip-kuyruk.jsonl'da bekleyen MyBrain notları panelde görünsün; takılan not kaybolmasın.\n\nYapılacaklar:\n1. GET /api/durum yanıtına katip: {bekleyen, son_hata, son_deneme} ekle.\n2. Panelin üst şeridinde \"N not bekliyor\" göstergesi (0 ise gizli).\n3. Orkestra notu 400 ile reddederse not kuyrukta sonsuza kadar baştan denenmesin: ayrı bir \"reddedilenler\" dosyasına taşınsın ve göstergede ayrıca sayılsın. 502 ya da bağlantı hatası ise kuyrukta kalsın.\n\nKabul kontrolü:\n- npm test yeşil; \"400 kuyruğu tıkamaz\" testi önce kırmızı.\n- docs/protokol.md ve panel/panel.test.mjs güncel.\n\nDokunma: zepul-os, MyBrain, ai os, Jev_and_Laya. MyBrain'e doğrudan yazma yok; yazma yalnız kâtip ucu üzerinden. Model claude-sonnet-5-5, Fable yok. Takılırsan boş bırak, docs/atlananlar.md'ye yaz."
    },
    {
      "baslik": "GPU paylaşımını düzenle",
      "metin": "Önce docs/devir.md, CLAUDE.md ve sunucu/yerel.ts oku.\n\nHedef: Ekran kartı (8 GB) doluyken zepul-ai yerel modeli ısıtmasın; diğer programların modelini boşaltmasın.\n\nYapılacaklar:\n1. Isıtmadan ve yerel modele geçmeden önce Ollama'nın GET /api/ps ucuna bak. Başka bir model GPU'daysa ya da boş VRAM yetmiyorsa (nvidia-smi ile ölç) ısıtma yapma.\n2. Bu durumda kullanıcıya \"ekran kartı dolu, yerel model şu an yavaş olabilir\" de ve model olayına neden yaz.\n3. keep_alive süresini ortam değişkeniyle ayarlanabilir yap (varsayılan bugünkü değer).\n\nKabul kontrolü:\n- npm test yeşil; \"GPU doluyken ısıtma yok\" testi sahte /api/ps ile önce kırmızı.\n- Ölçülen boş VRAM ve karar devir.md'de bir örnekle.\n\nDokunma: Ollama ayarları, ortam değişkenleri, başka süreçler (Laya 8788 dahil) — hiçbirini durdurma ya da değiştirme. zepul-os, MyBrain, ai os, Jev_and_Laya. Model claude-sonnet-5-5, Fable yok. Takılırsan boş bırak, docs/atlananlar.md'ye yaz."
    }
  ]
};
const ONERI_ETIKET = { 1: ["doğrulama", "orkestra"], 2: ["telefon", "onay"], 3: ["orkestra", "panel"], 4: ["ses"], 5: ["MyBrain", "panel"], 6: ["GPU"], 7: ["orkestra", "panel"], 8: ["ses"] };

function testSayisi() {
  const r = spawnSync(process.execPath, ["--import", "tsx", "--test", "--test-reporter=tap", "test/*.test.ts"], { cwd: REPO, encoding: "utf8", timeout: 300000, maxBuffer: 64 << 20 });
  const t = /^# tests (\d+)/m.exec(r.stdout ?? ""), g = /^# pass (\d+)/m.exec(r.stdout ?? "");
  return t ? { toplam: +t[1], gecen: g ? +g[1] : null, kaynak: "node --test sayımı" } : { toplam: SON_BILINEN_TEST, gecen: null, kaynak: "son bilinen değer (sayım yapılamadı)" };
}

function commitler() {
  const s = git("log", "--format=%h|%ad|%s", "--date=format:%Y-%m-%d %H:%M");
  if (!s) return { liste: [], gunluk: {} };
  const liste = s.trim().split("\n").map((l) => { const [h, t, ...m] = l.split("|"); return { h, t, m: m.join("|") }; });
  const gunluk = {};
  for (const c of liste) gunluk[c.t.slice(0, 10)] = (gunluk[c.t.slice(0, 10)] ?? 0) + 1;
  return { liste, gunluk };
}

function hataAvi() {
  const turlar = [];
  const bulgular = [];
  const tablo = oku("test/kapi-karar-tablosu.test.ts") ?? "";
  // Tur 1: ilk 3 mercekli av; ayrı rapor yok, toplam .loop/cycle-001.md'de.
  const c1 = /toplam (\d+) bulgu \(W1-W12, S1-S5, D1-D17\)/.exec(oku(".loop/cycle-001.md") ?? "");
  turlar.push({ tur: 1, ornek: null, yuksek: null, orta: null, dusuk: null, toplam: c1 ? +c1[1] : null, dosya: null, not: "3 mercekli ilk av; önem dağılımı kayıtlı değil" });
  for (let n = 2; n <= 30; n++) {
    const d = `docs/kabul/hata-avi-${n}.md`, s = oku(d);
    if (s == null) continue;
    const say = /Sayım: yüksek (\d+), orta (\d+), düşük (\d+)/.exec(s);
    const orn = /Örnek sayısı (\d+)/.exec(s);
    const t = { tur: n, ornek: orn ? +orn[1] : null, yuksek: say ? +say[1] : null, orta: say ? +say[2] : null, dusuk: say ? +say[3] : null, dosya: d };
    t.toplam = say ? t.yuksek + t.orta + t.dusuk : null;
    turlar.push(t);
    const islendi = n < 14 || tablo.includes(`av${n}`);
    const bas = [...s.matchAll(/^## Bulgu (\d+) \((yüksek|orta|düşük)\): (.+)$/gm)];
    if (bas.length) for (const m of bas) bulgular.push({ id: `av${n}-${m[1]}`, onem: m[2], ozet: m[3].trim(), durum: islendi ? "kapandi" : "acik", kaynak: d, tur: "hata avı", av: n });
    else {
      const ozet = s.split(/^## Özet/m)[1] ?? "";
      for (const l of ozet.split("\n")) {
        if (!/^\|\s*\d+\s*\|/.test(l)) continue;
        const h = hucreler(l);
        if (h.length >= 5 && /yüksek|orta|düşük/.test(h[2])) bulgular.push({ id: `av${n}-${h[0]}`, onem: h[2], ozet: h[4], durum: islendi ? "kapandi" : "acik", kaynak: d, tur: "hata avı", av: n, mercek: h[1] });
      }
    }
  }
  return { turlar, bulgular };
}

function kararTablosu() {
  const s = oku("test/kapi-karar-tablosu.test.ts");
  if (!s) return null;
  const satirlar = [];
  for (const l of s.split("\n")) {
    if (!/^\s*\{ b: "/.test(l)) continue;
    const al = (k) => new RegExp(`${k}: "([^"]*)"`).exec(l)?.[1] ?? null;
    let girdi = /girdi: (.*?), karar: "/.exec(l)?.[1] ?? "";
    if (girdi.startsWith('"')) { try { girdi = JSON.parse(girdi); } catch { girdi = girdi.slice(1, -1); } }
    satirlar.push({ b: al("b"), rol: al("rol"), arac: al("arac"), karar: al("karar"), girdi, yerel: /yerel: true/.test(l) });
  }
  const dagilim = {};
  for (const r of satirlar) dagilim[r.karar] = (dagilim[r.karar] ?? 0) + 1;
  return { satirlar, dagilim, toplam: satirlar.length };
}

function kabulRaporlari() {
  const dosyalar = fs.readdirSync(path.join(REPO, "docs/kabul")).filter((f) => /^faz.*\.md$/.test(f)).sort();
  return dosyalar.map((f) => {
    const d = `docs/kabul/${f}`, s = oku(d);
    const baslik = s.split("\n")[0].replace(/^#\s*/, "");
    const tarih = /Tarih:\*\* ?(\d{4}-\d{2}-\d{2})/.exec(s)?.[1] ?? null;
    const hukumler = [];
    for (const m of s.matchAll(/\*\*Faz ([\d.]+)(?: [^*:]{0,25})?:\s*([^*.(]+)/g)) {
      const h = m[2].trim();
      if (h && !hukumler.some((x) => x.faz === m[1])) hukumler.push({ faz: m[1], hukum: h });
    }
    if (!hukumler.length) {
      const faz = /Faz ([\d.]+)/.exec(baslik)?.[1], h = /\*\*(APPROVE|NEEDS_WORK)/.exec(s)?.[1];
      if (faz && h) hukumler.push({ faz, hukum: h });
    }
    // Maliyet: USD başlıklı tablonun son "Toplam" satırı; yoksa metindeki kalın "x USD"; yerel kabulde 0.
    let usd = null;
    const satirlar = s.split("\n");
    for (let i = 0; i < satirlar.length; i++) {
      if (!/^\|.*USD\s*\|/.test(satirlar[i])) continue;
      for (let j = i + 1; j < satirlar.length && satirlar[j].startsWith("|"); j++) {
        if (/toplam/i.test(satirlar[j])) { const m = /\*\*≈? ?([\d]+,[\d]+)/.exec(satirlar[j]) ?? /([\d]+,[\d]+)/.exec(satirlar[j]); if (m) usd = sayi(m[1]); }
      }
    }
    if (usd == null) { const m = [...s.matchAll(/\*\*([\d]+,[\d]+) USD\*\*/g)].pop(); if (m) usd = sayi(m[1]); }
    if (usd == null && /Claude kotası harcanmadı \| \*\*geçti/.test(s)) usd = 0;
    return { dosya: d, ad: f.replace(/\.md$/, ""), baslik, tarih, hukumler, usd };
  });
}

function laya() {
  const taban = json("veri/laya-taban.json");
  const kosular = jsonl("veri/laya-egitim/kosular.jsonl");
  const metrik = json("veri/laya-egitim/metrik.json");
  const gitMetrik = (sha) => { const s = git("show", `${sha}:veri/laya-egitim/metrik.json`); try { return s ? JSON.parse(s) : null; } catch { return null; } };
  const ol = (ad, e, kaynak, ek = {}) => ({ ad, kappa: e?.kappa ?? null, guvenlik: e?.guvenlik_geri_cagirma ?? null, rg: e?.riskliyi_guvenli_sanma ?? null, dogruluk: e?.dogruluk ?? null, n: e?.n ?? null, kaynak, ...ek });
  const m20 = gitMetrik(OLGULAR.laya20.sha), m30 = gitMetrik(OLGULAR.laya30.sha);
  const agirlik = kosular.find((k) => k.ayarlar?.sinif_agirlik);
  const cvJev = kosular.find((k) => k.ayarlar?.etiket_modu === "jev");
  const cvUz = kosular.find((k) => k.ayarlar?.etiket_modu === "uzlasi" && !k.guvenli_esik);
  const son = kosular.findLast((k) => k.guvenli_esik);
  const T = son?.guvenli_esik?.secilen ?? metrik?.guvenli_esik?.secilen ?? null;
  const kosu = [
    ol("Taban", taban, "veri/laya-taban.json", { not: "Eğitimsiz Laya, 576 kayıt" }),
    ol("6 tur", null, "kayıt yok", { not: "İlk GPU denemesi; metriği kaydedilmedi" }),
    ol("20 tur", m20?.en_iyi, OLGULAR.laya20.kaynak, { not: "Tek bölme, 119 görülmemiş kayıt" }),
    ol("30 tur", m30?.en_iyi, OLGULAR.laya30.kaynak, { not: "Tek bölme; seçim ölçütü değişti" }),
    ol("Ağırlıklı", agirlik?.en_iyi, "veri/laya-egitim/kosular.jsonl", { not: "riskli ×2, geri alınamaz ×2" }),
    ol("CV Jev", cvJev?.en_iyi, "veri/laya-egitim/kosular.jsonl", { not: "5 katlı, Jev etiketi, 660 kayıt" }),
    ol("CV uzlaşı", cvUz?.en_iyi, "veri/laya-egitim/kosular.jsonl", { not: "5 katlı, uzlaşı etiketi, 502 kayıt" }),
    ol(T == null ? "T=—" : `T=${T.toFixed(2).replace(".", ",")}`, son?.guvenli_esik?.metrik, "veri/laya-egitim/kosular.jsonl", { not: "Uzlaşı CV + güvenli eşiği", secilen: true }),
  ];
  // Karışıklık: son koşunun kat tahminleri, güvenli eşiği uygulanmış.
  const SINIF = ["guvenli", "riskli", "geri-alinamaz", "belirsiz"];
  const bos = () => Object.fromEntries(SINIF.map((a) => [a, Object.fromEntries(SINIF.map((b) => [b, 0]))]));
  let karisiklik = null;
  if (metrik?.kat_tahminleri && T != null) {
    karisiklik = bos();
    for (const kat of metrik.kat_tahminleri) for (const t of kat) {
      const tahmin = t.laya === "guvenli" && t.p_guvenli < T ? "belirsiz" : t.laya;
      if (karisiklik[t.jev]?.[tahmin] != null) karisiklik[t.jev][tahmin]++;
    }
  }
  const tarama = (metrik?.guvenli_esik?.tarama ?? []).map((x) => ({ T: x.esik, kappa: x.kappa, rg: x.riskliyi_guvenli_sanma, yuk: x.belirsize_dusen_oran }));
  const egri = (metrik?.ortalama ?? []).map((x, i) => ({ tur: i + 1, kappa: x.kappa, guvenlik: x.guvenlik_geri_cagirma, rg: x.riskliyi_guvenli_sanma }));
  const golge = jsonl("logs/laya-golge.jsonl");
  const hafta = golge.filter((k) => String(k.ts) >= GOLGE_BASLANGIC);
  const eski = golge.filter((k) => String(k.ts) < GOLGE_BASLANGIC);
  const uyum = (l) => (l.length ? l.filter((k) => k.uyum).length / l.length : null);
  return {
    kosu, siniflar: SINIF, karisiklik, tabanKarisiklik: taban?.karisiklik ?? null, T, tarama, egri,
    esik: { kappa: 0.8, guvenlik: 0.95, rg: 0.02, golge: 0.9 },
    veri: son?.veri ?? null,
    golge: { baslangic: GOLGE_BASLANGIC, gun: 7, kayit: hafta.length, uyum: uyum(hafta), eskiKayit: eski.length, eskiUyum: uyum(eski), port: 8796 },
  };
}

function modeller() {
  const b = oku("sunucu/bekci.ts") ?? "";
  const yerel = /YEREL_VARSAYILAN\s*=\s*"([^"]+)"/.exec(b)?.[1] ?? null;
  const satir = /VARSAYILAN_MODELLER[^{]*\{([^}]*)\}/.exec(b)?.[1] ?? "";
  const kod = {};
  for (const m of satir.matchAll(/(\w+):\s*("([^"]+)"|YEREL_VARSAYILAN)/g)) kod[m[1]] = m[3] ?? (yerel ? `ollama:${yerel.replace(/^ollama:/, "")}` : null);
  let kullanici = {};
  try { kullanici = JSON.parse(fs.readFileSync(path.join(process.env.LOCALAPPDATA ?? "", "zepul-os", "ayarlar.json"), "utf8")).modeller ?? {}; } catch {}
  const ROL = { sef: "Şef", isci_basit: "İşçi (basit)", isci_hassas: "İşçi (hassas)", denetci: "Denetçi" };
  return Object.keys(ROL).map((r) => ({ rol: ROL[r], kod: kod[r] ?? null, kullanici: kullanici[r] ?? null }));
}

function portlar() {
  const s = oku("CLAUDE.md") ?? "";
  const dolu = /Dolu, kullanma: (.+)\./.exec(s)?.[1] ?? "";
  const ETIKET = { 8765: "başka uygulama", 8766: "Pano Aktar", 8787: "Jev geçidi (Tailscale)", 8788: "eski Laya (eğitimsiz)", 8789: "liman", 8790: "başka uygulama", "8791-8795": "başka uygulamalar", 4180: "başka uygulama", 4190: "başka uygulama", 8801: "başka uygulama", 8830: "zepul-ai", "9333-9334": "ai os / zepul-ai CDP", 11434: "Ollama" };
  const liste = dolu.split(",").map((x) => x.trim()).filter(Boolean).map((x) => { const p = x.split(" ")[0]; return { port: p, ne: ETIKET[p] ?? (/\((.+)\)/.exec(x)?.[1] ?? "başka uygulama"), bizim: false }; });
  return [{ port: "8820", ne: "Orkestra paneli (token korumalı)", bizim: true }, { port: "8796", ne: "Gölge Laya (eğitilmiş, T=0,50)", bizim: true }, ...liste];
}

function fazlar(commit) {
  const il = json(".loop/ilerleme.json"), st = json(".loop/state.json");
  const tarih = new Map(commit.liste.map((c) => [c.h, c.t]));
  const rm = new Map((st?.roadmap ?? []).map((r) => [r.id.replace(/^R/, "F").replace("F5b", "F5.5"), r]));
  const liste = (il?.fazlar ?? []).filter((f) => f.id !== "SON").map((f) => {
    const shalar = [...new Set(f.maddeler.flatMap((m) => String(m.kanit).match(/\b[0-9a-f]{7}\b/g) ?? []))];
    const t = shalar.map((h) => tarih.get(h)).filter(Boolean).sort();
    const bitti = f.maddeler.filter((m) => m.durum === "bitti").length;
    return { id: f.id, no: f.id.slice(1), ad: f.ad, maddeler: f.maddeler, bitti, toplam: f.maddeler.length, durum: bitti === f.maddeler.length ? "tamam" : "sürüyor",
      bas: t[0] ?? null, son: t.at(-1) ?? null, commitler: shalar.filter((h) => tarih.has(h)), not: rm.get(f.id)?.notes ?? null };
  });
  return { liste, son: (il?.fazlar ?? []).find((f) => f.id === "SON") ?? null, simdi: il?.simdi ?? null, guncellendi: il?.guncellendi ?? null };
}

export function topla({ testleriSay = true } = {}) {
  const st = json(".loop/state.json"), il = json(".loop/ilerleme.json");
  const commit = commitler();
  const av = hataAvi();
  const kabul = kabulRaporlari();
  const fz = fazlar(commit);
  const tablo = kararTablosu();
  const lay = laya();
  const test = testleriSay ? testSayisi() : { toplam: SON_BILINEN_TEST, gecen: null, kaynak: "son bilinen değer" };
  const kabulBulgu = (il?.bulgular ?? []).filter((b) => !/^AV\d/.test(b.id)).map((b) => ({ ...b, tur: "kabul", kaynak: b.kaynak ? `docs/kabul/${b.kaynak}` : null }));
  const ilk = commit.liste.at(-1)?.t ?? null, son = commit.liste[0]?.t ?? null;
  return {
    uretildi: new Date().toISOString(),
    head: commit.liste[0]?.h ?? null,
    hedef: st?.goal ?? null,
    simdi: fz.simdi, simdiTarih: fz.guncellendi,
    fazlar: fz.liste, sonListe: fz.son, siradaki: st?.next_cycle_seed ?? [],
    kararlar: (st?.decisions ?? []).map((d) => ({ tur: d.turn, ne: d.what, neden: d.why })),
    commit: { sayi: commit.liste.length, ilk, son, gunluk: commit.gunluk },
    test,
    hataAvi: av.turlar,
    bulgular: [...kabulBulgu, ...av.bulgular],
    karar: tablo,
    kabul,
    laya: lay,
    modeller: modeller(),
    yerelModeller: OLGULAR.yerelModeller,
    portlar: portlar(),
    oneriler: TASLAK.on.map((o) => ({ ...o, etiket: ONERI_ETIKET[o.no] ?? [] })),
    istemler: TASLAK.is,
  };
}

// ---------- Sayfa ----------

const CSS = String.raw`
:root{--zemin:#E9ECF0;--yuzey:#FFFFFF;--yuzey2:#F4F6F8;--murekkep:#121821;--ikincil:#4E5968;--soluk:#7A8594;--cizgi:#D3D9E0;--pirinc:#8A5A00;--pirinc-z:#F3E7CC;--s1:#2a78d6;--s2:#eb6834;--s3:#1baf7a;--iyi:#0ca30c;--uyari:#fab219;--ciddi:#ec835a;--kritik:#d03b3b;--golge:0 1px 2px rgba(18,24,33,.06),0 4px 16px rgba(18,24,33,.05);color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--zemin:#0E1318;--yuzey:#161D25;--yuzey2:#1C2530;--murekkep:#E7ECF2;--ikincil:#A9B4C2;--soluk:#7F8B9A;--cizgi:#283340;--pirinc:#E0B252;--pirinc-z:#3A2F17;--s1:#3987e5;--s2:#d95926;--s3:#199e70;--golge:0 1px 2px rgba(0,0,0,.3);color-scheme:dark}}
:root[data-theme="dark"]{--zemin:#0E1318;--yuzey:#161D25;--yuzey2:#1C2530;--murekkep:#E7ECF2;--ikincil:#A9B4C2;--soluk:#7F8B9A;--cizgi:#283340;--pirinc:#E0B252;--pirinc-z:#3A2F17;--s1:#3987e5;--s2:#d95926;--s3:#199e70;--golge:0 1px 2px rgba(0,0,0,.3);color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:var(--zemin);color:var(--murekkep);font:15px/1.5 "Segoe UI Variable Text","Segoe UI",system-ui,-apple-system,"Helvetica Neue",Arial,sans-serif;overflow-wrap:anywhere}
.ekran{font-family:Bahnschrift,"DIN Alternate","Arial Narrow","Segoe UI",sans-serif;font-stretch:condensed;letter-spacing:.01em}
.mono,code,pre{font-variant-ligatures:none}
.mono,code{font-family:"Cascadia Mono",Consolas,"Courier New",monospace}
code{font-size:.86em;background:var(--yuzey2);border:1px solid var(--cizgi);border-radius:4px;padding:0 .3em}
a{color:inherit;text-decoration-color:var(--pirinc);text-underline-offset:3px}
button{font:inherit;color:inherit}
:focus-visible{outline:2px solid var(--pirinc);outline-offset:2px}
.kabuk{display:grid;grid-template-columns:232px minmax(0,1fr);min-height:100vh}
aside{position:sticky;top:0;height:100vh;padding:20px 14px;border-right:1px solid var(--cizgi);background:var(--yuzey);display:flex;flex-direction:column;gap:18px}
.marka{display:flex;gap:10px;align-items:center}
.marka b{font-size:1.35rem;line-height:1}
.marka small{display:block;color:var(--soluk);font-size:.75rem}
nav ol{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px}
nav a{display:flex;gap:10px;align-items:baseline;padding:7px 10px;border-radius:7px;text-decoration:none;color:var(--ikincil)}
nav a span{font-family:Bahnschrift,"Arial Narrow",sans-serif;color:var(--soluk);width:1.1em}
nav a:hover{background:var(--yuzey2);color:var(--murekkep)}
nav a[aria-current="page"]{background:var(--pirinc-z);color:var(--murekkep);font-weight:600}
nav a[aria-current="page"] span{color:var(--pirinc)}
.alt{margin-top:auto;font-size:.75rem;color:var(--soluk);display:flex;flex-direction:column;gap:8px}
.tema{border:1px solid var(--cizgi);background:var(--yuzey2);border-radius:99px;padding:4px 12px;cursor:pointer;font-size:.8rem;align-self:flex-start}
main{padding:28px clamp(16px,3vw,40px) 60px;max-width:1240px;width:100%}
section[hidden]{display:none}
.ust{display:flex;flex-wrap:wrap;gap:8px 18px;align-items:end;justify-content:space-between;margin-bottom:18px}
h1{margin:0;font-size:clamp(1.7rem,3vw,2.4rem);line-height:1.05;font-weight:600}
h2{margin:30px 0 10px;font-size:1.05rem;font-weight:600;display:flex;gap:8px;align-items:baseline}
h2 small,.ipucu-not{color:var(--soluk);font-weight:400;font-size:.82rem}
h3{margin:0 0 6px;font-size:.98rem}
.ozet{color:var(--ikincil);margin:4px 0 0;max-width:70ch}
.izgara{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(min(100%,var(--min,260px)),1fr))}
.kart{background:var(--yuzey);border:1px solid var(--cizgi);border-radius:10px;padding:14px 16px;box-shadow:var(--golge);min-width:0}
.kpi{display:flex;flex-direction:column;gap:2px;cursor:default}
.kpi .deger{font-family:Bahnschrift,"DIN Alternate","Arial Narrow",sans-serif;font-stretch:condensed;font-size:2.5rem;line-height:1;font-weight:600;font-variant-numeric:tabular-nums}
.kpi .deger small{font-size:1.1rem;color:var(--soluk);font-weight:400}
.kpi .etiket{color:var(--ikincil);font-size:.85rem}
.kpi .alt-not{color:var(--soluk);font-size:.75rem}
a.kpi{text-decoration:none;cursor:pointer}a.kpi:hover{border-color:var(--pirinc)}
.rozet{display:inline-flex;align-items:center;gap:5px;font-size:.72rem;font-weight:600;padding:1px 8px;border-radius:99px;border:1px solid var(--cizgi);color:var(--ikincil);white-space:nowrap;background:var(--yuzey)}
.rozet i{width:7px;height:7px;border-radius:50%;background:currentColor;display:inline-block}
.r-iyi{color:var(--iyi)}.r-uyari{color:#a8740a}.r-ciddi{color:#c25a2f}.r-kritik{color:var(--kritik)}
:root[data-theme="dark"] .r-uyari{color:var(--uyari)}:root[data-theme="dark"] .r-ciddi{color:var(--ciddi)}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .r-uyari{color:var(--uyari)}:root:not([data-theme="light"]) .r-ciddi{color:var(--ciddi)}}
.cipler{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:8px 0}
.cip{border:1px solid var(--cizgi);background:var(--yuzey);border-radius:99px;padding:3px 11px;font-size:.8rem;cursor:pointer;color:var(--ikincil)}
.cip[aria-pressed="true"]{background:var(--murekkep);color:var(--zemin);border-color:var(--murekkep)}
input[type=search]{font:inherit;font-size:.85rem;background:var(--yuzey);color:var(--murekkep);border:1px solid var(--cizgi);border-radius:8px;padding:6px 10px;min-width:min(100%,240px)}
.tablo{overflow-x:auto;border:1px solid var(--cizgi);border-radius:10px;background:var(--yuzey)}
table{border-collapse:collapse;width:100%;font-size:.84rem}
th,td{text-align:left;padding:7px 10px;border-top:1px solid var(--cizgi);vertical-align:top}
th{border-top:0;color:var(--soluk);font-weight:600;font-size:.75rem;text-transform:uppercase;letter-spacing:.04em;position:sticky;top:0;background:var(--yuzey)}
.tablo table{min-width:600px}th{overflow-wrap:normal;white-space:nowrap}
.partisyon{overflow-x:auto}.partisyon svg{min-width:760px}
td.sag,th.sag{text-align:right;font-variant-numeric:tabular-nums}
.kaydir{max-height:420px;overflow:auto}
details{border-top:1px solid var(--cizgi)}
details>summary{cursor:pointer;padding:8px 0;color:var(--ikincil);font-size:.85rem;list-style:none}
details>summary::before{content:"+";display:inline-block;width:1.2em;color:var(--pirinc);font-weight:700}
details[open]>summary::before{content:"−"}
.kart details:last-child{margin-bottom:-6px}
svg[data-grafik]{display:block;width:100%;height:auto;overflow:visible}
svg text{font-family:"Segoe UI",system-ui,sans-serif;fill:var(--ikincil)}
svg .eks{stroke:var(--cizgi);stroke-width:1}
svg .esik{stroke:var(--murekkep);stroke-width:1.25;stroke-dasharray:4 3;opacity:.7}
svg [data-ipucu]{cursor:default}
svg .vurgu:hover,svg [data-ipucu]:hover{opacity:.82}
#ipucu{position:fixed;z-index:50;pointer-events:none;background:var(--murekkep);color:var(--zemin);font-size:.78rem;padding:6px 9px;border-radius:7px;max-width:280px;opacity:0;transition:opacity .08s;white-space:pre-line}
.lejant{display:flex;flex-wrap:wrap;gap:12px;font-size:.78rem;color:var(--ikincil);margin:4px 0 6px}
.lejant span{display:inline-flex;align-items:center;gap:6px}.lejant i{width:10px;height:10px;border-radius:3px;display:inline-block}
/* İmza: faz partisyonu */
.partisyon{background:var(--yuzey);border:1px solid var(--cizgi);border-radius:12px;padding:12px 10px 4px;box-shadow:var(--golge)}
.partisyon .olcu{cursor:pointer}
.partisyon .olcu:hover rect.zemin,.partisyon .olcu:focus rect.zemin{fill:var(--pirinc-z)}
.partisyon .olcu:focus{outline:none}
.akis{display:flex;flex-wrap:wrap;align-items:stretch;gap:0}
.dugum{flex:1 1 130px;min-width:120px;border:1px solid var(--cizgi);background:var(--yuzey);border-radius:10px;padding:10px 12px;cursor:pointer;text-align:left;position:relative}
.dugum b{display:block;font-size:.92rem}.dugum small{color:var(--soluk);font-size:.74rem}
.dugum[aria-pressed="true"]{border-color:var(--pirinc);box-shadow:0 0 0 2px var(--pirinc-z)}
.ok{flex:0 0 22px;display:flex;align-items:center;justify-content:center;color:var(--soluk)}
.detay{margin-top:10px;background:var(--yuzey2);border-radius:10px;padding:12px 14px;min-height:64px}
.detay dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 14px;margin:0;font-size:.86rem}.detay dt{color:var(--soluk)}
.adimlar{counter-reset:a;display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(min(100%,220px),1fr))}
.adim{counter-increment:a;position:relative;padding-top:30px}
.adim::before{content:counter(a);position:absolute;top:12px;left:16px;font-family:Bahnschrift,"Arial Narrow",sans-serif;color:var(--pirinc);font-weight:700}
.istem pre{margin:0;max-height:220px;overflow:auto;background:var(--yuzey2);border-radius:8px;padding:10px;white-space:pre-wrap;font:12.5px/1.5 "Cascadia Mono",Consolas,monospace}
.kopyala{background:var(--murekkep);color:var(--zemin);border:0;border-radius:7px;padding:6px 12px;cursor:pointer;font-weight:600;font-size:.82rem}
.satir{display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap}
.faz-kart[data-durum="sürüyor"]{border-color:var(--pirinc)}
.ilerleme{height:6px;background:var(--yuzey2);border-radius:99px;overflow:hidden;margin:8px 0}
.ilerleme i{display:block;height:100%;background:var(--s1);border-radius:99px}
.liste{margin:6px 0;padding:0;list-style:none;font-size:.84rem}
.liste li{display:flex;gap:8px;padding:4px 0;border-top:1px dashed var(--cizgi)}
.liste li:first-child{border-top:0}
.isaret{flex:none;width:16px;height:16px;border-radius:4px;border:1.5px solid var(--soluk);display:inline-flex;align-items:center;justify-content:center;font-size:11px;margin-top:2px}
.isaret.var{background:var(--iyi);border-color:var(--iyi);color:#fff}
.isaret.yok{border-color:var(--kritik)}
.bos{color:var(--soluk);font-size:.85rem;padding:14px;text-align:center;border:1px dashed var(--cizgi);border-radius:10px}
.iki{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr))}
.kosu{display:grid;gap:12px}
.uc{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))}
@media (max-width:900px){.kabuk{grid-template-columns:minmax(0,1fr);grid-template-rows:auto 1fr}aside{min-width:0;position:sticky;height:auto;z-index:10;flex-direction:row;align-items:center;padding:8px 12px;gap:10px;border-right:0;border-bottom:1px solid var(--cizgi)}
 .marka small,.alt span{display:none}nav{overflow-x:auto;flex:1;scrollbar-width:none}nav ol{flex-direction:row}nav a{white-space:nowrap;padding:6px 10px}.alt{margin:0}main{padding-top:18px}}
@media (max-width:560px){.ok{flex-basis:100%;height:16px;transform:rotate(90deg)}.dugum{flex-basis:100%}.kpi .deger{font-size:2.1rem}}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
@media (forced-colors:active){.rozet i,.isaret{forced-color-adjust:none}}
`;

// İstemci kodu: tarayıcıda çalışır, veriyi <script type="application/json"> içinden okur.
function istemci() {
  const D = JSON.parse(document.getElementById("veri").textContent);
  const $ = (s, k = document) => k.querySelector(s), $$ = (s, k = document) => [...k.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const md = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  const yok = "—";
  const n2 = (v, d = 3) => (v == null ? yok : Number(v).toLocaleString("tr-TR", { maximumFractionDigits: d, minimumFractionDigits: Math.min(d, 2) }));
  const yuz = (v, d = 1) => (v == null ? yok : "%" + (v * 100).toLocaleString("tr-TR", { maximumFractionDigits: d }));
  const tam = (v) => (v == null ? yok : Number(v).toLocaleString("tr-TR"));
  const gun = (t) => (t ? t.slice(8, 10) + "." + t.slice(5, 7) : yok);
  const ONEM = { "yüksek": ["r-kritik", "yüksek"], orta: ["r-ciddi", "orta"], "düşük": ["r-uyari", "düşük"] };
  const rozet = (cls, metin) => `<span class="rozet ${cls}"><i></i>${esc(metin)}</span>`;
  const onemRozet = (o) => rozet((ONEM[o] ?? ["", o])[0], (ONEM[o] ?? ["", o])[1]);
  const durumRozet = (d) => (/^(kapandi|tamam|bitti|geçti|APPROVE)/i.test(d) ? rozet("r-iyi", d === "kapandi" ? "kapandı" : d) : /acik|sürüyor|devam|bekliyor/i.test(d) ? rozet("r-uyari", d === "acik" ? "açık" : d) : rozet("r-ciddi", d));
  const hukumRozet = (h) => (/APPROVE|geçti|regresyon yok/i.test(h) ? rozet("r-iyi", h) : /NEEDS_WORK|kaldı/i.test(h) ? rozet("r-ciddi", h) : rozet("", h));
  const tabloDetay = (baslik, kolonlar, satirlar) => `<details><summary>${esc(baslik)}</summary><div class="tablo"><table><thead><tr>${kolonlar.map((k) => `<th${k.sag ? ' class="sag"' : ""}>${esc(k.ad)}</th>`).join("")}</tr></thead><tbody>${satirlar.map((r) => `<tr>${r.map((h, i) => `<td${kolonlar[i].sag ? ' class="sag"' : ""}>${h}</td>`).join("")}</tr>`).join("")}</tbody></table></div></details>`;
  let grafikSayisi = 0;
  const svg = (w, h, ic, etiket) => { grafikSayisi++; return `<svg viewBox="0 0 ${w} ${h}" style="max-width:${w}px" role="img" aria-label="${esc(etiket)}" data-grafik>${ic}</svg>`; };
  const ip = (s) => `data-ipucu="${esc(s)}"`;

  // ---- Grafik yardımcıları ----
  // Dikey çubuk (yığılı): satirlar [{etiket, parcalar:[{v, renk, ad}]}]
  function cubuk({ satirlar, w = 640, h = 220, max, esik, esikEtiket, bicim = tam, etiketle = true, ad }) {
    const sol = 34, alt = 26, ust = 14, cw = w - sol - 6, ch = h - alt - ust;
    const M = max ?? Math.max(1, ...satirlar.map((s) => s.parcalar.reduce((a, p) => a + (p.v ?? 0), 0)));
    const bw = cw / satirlar.length, gen = Math.min(34, bw * 0.62);
    const y = (v) => ust + ch - (v / M) * ch;
    let s = "";
    for (const t of [0, 0.5, 1]) { const yy = y(M * t); s += `<line class="eks" x1="${sol}" x2="${w - 6}" y1="${yy}" y2="${yy}" opacity="${t ? 0.5 : 1}"/><text x="${sol - 6}" y="${yy + 4}" text-anchor="end" font-size="10">${bicim(M * t)}</text>`; }
    satirlar.forEach((r, i) => {
      const x = sol + i * bw + (bw - gen) / 2;
      let taban = 0;
      const toplam = r.parcalar.reduce((a, p) => a + (p.v ?? 0), 0);
      const bosMu = r.parcalar.every((p) => p.v == null);
      r.parcalar.forEach((p, j) => {
        if (!p.v) return;
        const y1 = y(taban + p.v), y0 = y(taban), son = j === r.parcalar.length - 1 || r.parcalar.slice(j + 1).every((q) => !q.v);
        const yk = Math.max(1, y0 - y1 - (taban ? 2 : 0));
        s += `<path d="${son ? `M${x},${y0 - (taban ? 2 : 0)}V${y1 + 4}q0,-4 4,-4h${gen - 8}q4,0 4,4V${y0 - (taban ? 2 : 0)}Z` : `M${x},${y0 - (taban ? 2 : 0)}v${-yk}h${gen}v${yk}Z`}" fill="${p.renk}" ${ip(`${r.ipucu ?? r.etiket}\n${p.ad}: ${bicim(p.v)}`)}/>`;
        taban += p.v;
      });
      if (bosMu) s += `<text x="${x + gen / 2}" y="${y(0) - 6}" text-anchor="middle" font-size="11" ${ip(`${r.ipucu ?? r.etiket}\n${r.yokNot ?? "veri yok"}`)}>${yok}</text>`;
      else if (etiketle) s += `<text x="${x + gen / 2}" y="${y(toplam) - 5}" text-anchor="middle" font-size="10.5" style="fill:var(--murekkep)">${bicim(toplam)}</text>`;
      s += `<text x="${x + gen / 2}" y="${h - 8}" text-anchor="middle" font-size="10.5">${esc(r.etiket)}</text>`;
    });
    if (esik != null) { const yy = y(esik); s += `<line class="esik" x1="${sol}" x2="${w - 6}" y1="${yy}" y2="${yy}"/><text x="${w - 8}" y="${yy - 5}" text-anchor="end" font-size="10.5" style="fill:var(--murekkep)">${esc(esikEtiket ?? "eşik")}</text>`; }
    return svg(w, h, s, ad ?? "çubuk grafik");
  }
  // Yatay çubuk: [{etiket, v, renk, ipucu, veri}]
  function yatay({ satirlar, w = 520, sat = 26, bicim = tam, ad, tikla }) {
    const sol = Math.max(60, Math.max(...satirlar.map((r) => String(r.etiket).length)) * 6.6 + 12), M = Math.max(1, ...satirlar.map((r) => r.v ?? 0)), cw = w - sol - 48, h = satirlar.length * sat + 4;
    let s = "";
    satirlar.forEach((r, i) => {
      const yy = i * sat + 4, bw = Math.max(2, ((r.v ?? 0) / M) * cw);
      s += `<g ${tikla ? `class="vurgu" tabindex="0" role="button" data-sec="${esc(r.veri ?? r.etiket)}" style="cursor:pointer"` : ""} ${ip(r.ipucu ?? `${r.etiket}: ${bicim(r.v)}`)}><rect x="0" y="${yy - 2}" width="${w}" height="${sat}" fill="transparent"/><text x="${sol - 8}" y="${yy + sat / 2 + 2}" text-anchor="end" font-size="11.5">${esc(r.etiket)}</text><path d="M${sol},${yy + 3}h${bw - 4}q4,0 4,4v${sat - 18}q0,4 -4,4h${-(bw - 4)}Z" fill="${r.renk ?? "var(--s1)"}"/><text x="${sol + bw + 6}" y="${yy + sat / 2 + 2}" font-size="11" style="fill:var(--murekkep)">${bicim(r.v)}</text></g>`;
    });
    return svg(w, h, s, ad ?? "yatay çubuk");
  }
  // Çizgi: seriler [{ad, renk, noktalar:[{x,y,ipucu}]}]; tek eksen.
  function cizgi({ etiketle = true, seriler, w = 560, h = 210, xmin, xmax, ymin = 0, ymax = 1, ybicim = (v) => n2(v, 2), xbicim = (v) => v, esik, esikEtiket, ad, xEtiket }) {
    const sol = 40, alt = 30, ust = 12, cw = w - sol - 12, ch = h - alt - ust;
    const X = (v) => sol + ((v - xmin) / (xmax - xmin)) * cw, Y = (v) => ust + ch - ((v - ymin) / (ymax - ymin)) * ch;
    let s = "";
    for (const t of [0, 0.5, 1]) { const v = ymin + (ymax - ymin) * t; s += `<line class="eks" x1="${sol}" x2="${w - 12}" y1="${Y(v)}" y2="${Y(v)}" opacity="${t ? 0.5 : 1}"/><text x="${sol - 6}" y="${Y(v) + 4}" text-anchor="end" font-size="10">${ybicim(v)}</text>`; }
    const xs = [xmin, (xmin + xmax) / 2, xmax];
    for (const v of xs) s += `<text x="${X(v)}" y="${h - 12}" text-anchor="middle" font-size="10">${xbicim(v)}</text>`;
    if (xEtiket) s += `<text x="${w - 12}" y="${h - 1}" text-anchor="end" font-size="10">${esc(xEtiket)}</text>`;
    if (esik != null) s += `<line class="esik" x1="${sol}" x2="${w - 12}" y1="${Y(esik)}" y2="${Y(esik)}"/><text x="${w - 14}" y="${Y(esik) - 5}" text-anchor="end" font-size="10.5" style="fill:var(--murekkep)">${esc(esikEtiket ?? "eşik")}</text>`;
    for (const sr of seriler) {
      s += `<path d="${sr.noktalar.map((p, i) => `${i ? "L" : "M"}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join("")}" fill="none" stroke="${sr.renk}" stroke-width="2" stroke-linejoin="round"/>`;
      for (const p of sr.noktalar) s += `<g ${ip(p.ipucu ?? `${sr.ad}: ${ybicim(p.y)}`)}><circle cx="${X(p.x)}" cy="${Y(p.y)}" r="9" fill="transparent"/><circle cx="${X(p.x)}" cy="${Y(p.y)}" r="${p.vurgu ? 5 : 2.5}" fill="${sr.renk}" stroke="var(--yuzey)" stroke-width="${p.vurgu ? 2 : 0}"/></g>`;
      const son = sr.noktalar.at(-1);
      if (son && etiketle && sr.etiketle !== false) s += `<text x="${X(son.x) - 4}" y="${Y(son.y) - 8}" text-anchor="end" font-size="10.5" style="fill:var(--murekkep)">${esc(sr.ad)}</text>`;
    }
    return svg(w, h, s, ad ?? "çizgi grafik");
  }

  // ---- Gezinme ve tema ----
  const kok = document.documentElement, temaD = $("#tema"), TEMA = ["auto", "light", "dark"], TAD = { auto: "Tema: otomatik", light: "Tema: açık", dark: "Tema: koyu" };
  let tema = "auto"; try { tema = localStorage.getItem("ozet-tema") || "auto"; } catch {}
  tema = new URLSearchParams(location.search).get("tema") || tema;
  const temaUygula = () => { if (tema === "auto") kok.removeAttribute("data-theme"); else kok.setAttribute("data-theme", tema); temaD.textContent = TAD[tema] ?? TAD.auto; };
  if (!TEMA.includes(tema)) tema = "auto"; temaUygula();
  temaD.addEventListener("click", () => { tema = TEMA[(TEMA.indexOf(tema) + 1) % 3]; temaUygula(); try { localStorage.setItem("ozet-tema", tema); } catch {} });
  function git() {
    const id = (location.hash.slice(1).split("/")[0]) || "genel";
    const hedef = $(`section#${CSS.escape(id)}`) ? id : "genel";
    $$("main > section").forEach((s) => (s.hidden = s.id !== hedef));
    $$("nav a").forEach((a) => a.setAttribute("aria-current", a.getAttribute("href") === "#" + hedef ? "page" : "false"));
    const alt = location.hash.split("/")[1];
    if (alt) { const el = document.getElementById(alt); if (el) { el.scrollIntoView({ block: "start" }); el.classList.add("parla"); } } else window.scrollTo(0, 0);
  }
  addEventListener("hashchange", git);

  // ---- İpucu ----
  const IP = $("#ipucu");
  document.addEventListener("mouseover", (e) => { const t = e.target.closest("[data-ipucu]"); if (!t) { IP.style.opacity = 0; return; } IP.textContent = t.getAttribute("data-ipucu"); IP.style.opacity = 1; });
  document.addEventListener("mousemove", (e) => { if (IP.style.opacity !== "1") return; const r = IP.getBoundingClientRect(); IP.style.left = Math.min(innerWidth - r.width - 8, e.clientX + 14) + "px"; IP.style.top = Math.max(8, e.clientY - r.height - 12) + "px"; });
  document.addEventListener("focusin", (e) => { const t = e.target.closest("[data-ipucu]"); if (!t) return; const r = t.getBoundingClientRect(); IP.textContent = t.getAttribute("data-ipucu"); IP.style.opacity = 1; IP.style.left = Math.max(8, r.left) + "px"; IP.style.top = Math.max(8, r.top - 44) + "px"; });
  document.addEventListener("focusout", () => (IP.style.opacity = 0));

  const L = D.laya, son = L.kosu.find((k) => k.secilen) ?? {};
  const fazTamam = D.fazlar.filter((f) => f.durum === "tamam").length;
  const avTur = D.hataAvi.length, avSon = D.hataAvi.at(-1);
  const toplamUsd = D.kabul.reduce((a, k) => a + (k.usd ?? 0), 0);

  // ======== 1. Genel bakış ========
  function partisyon() {
    const F = D.fazlar, w = 1000, h = 132, ust = 30, ara = 10, olcu = w / F.length;
    let s = "";
    for (let i = 0; i < 5; i++) s += `<line x1="0" x2="${w}" y1="${ust + i * ara}" y2="${ust + i * ara}" stroke="var(--cizgi)" stroke-width="1"/>`;
    F.forEach((f, i) => {
      const x0 = i * olcu, n = f.maddeler.length, adim = (olcu - 28) / Math.max(1, n - 1);
      let g = `<rect class="zemin" x="${x0 + 1}" y="0" width="${olcu - 2}" height="${h}" rx="8" fill="transparent"/>`;
      g += `<line x1="${x0 + olcu}" x2="${x0 + olcu}" y1="${ust}" y2="${ust + 4 * ara}" stroke="var(--soluk)" stroke-width="1.2"/>`;
      g += `<text x="${x0 + 10}" y="18" font-size="13" font-weight="700" style="fill:var(--murekkep);font-family:Bahnschrift,'Arial Narrow',sans-serif">F${esc(f.no)}</text>`;
      f.maddeler.forEach((m, j) => {
        const cx = x0 + 14 + j * adim, cy = ust + 4 * ara - ((j * 3) % 9) * (ara / 2), dolu = m.durum === "bitti";
        g += `<ellipse cx="${cx}" cy="${cy}" rx="5.2" ry="3.9" transform="rotate(-22 ${cx} ${cy})" fill="${dolu ? "var(--murekkep)" : "var(--yuzey)"}" stroke="${dolu ? "var(--murekkep)" : "var(--pirinc)"}" stroke-width="1.6"/><line x1="${cx + 4.6}" x2="${cx + 4.6}" y1="${cy}" y2="${cy - 22}" stroke="${dolu ? "var(--murekkep)" : "var(--pirinc)"}" stroke-width="1.1"/>`;
      });
      g += `<text x="${x0 + 10}" y="${h - 22}" font-size="11.5" style="fill:var(--murekkep)">${esc(f.ad.length > 16 ? f.ad.slice(0, 15) + "…" : f.ad)}</text>`;
      g += `<text x="${x0 + 10}" y="${h - 7}" font-size="10.5" style="fill:${f.durum === "tamam" ? "var(--ikincil)" : "var(--pirinc)"}">${f.bitti}/${f.toplam} · ${esc(f.durum)}</text>`;
      s += `<a href="#fazlar/faz-${esc(f.id.replace(".", "-"))}" class="olcu" ${ip(`${f.id} ${f.ad}\n${f.bitti}/${f.toplam} madde bitti\nTıkla: faz kartı`)}>${g}</a>`;
    });
    grafikSayisi++;
    return `<div class="partisyon"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Faz partisyonu: her ölçü bir faz, her nota bir madde" data-grafik>${s}</svg><div class="lejant" style="padding:0 6px"><span><svg width="16" height="12" viewBox="0 0 16 12"><ellipse cx="7" cy="7" rx="5" ry="3.8" transform="rotate(-22 7 7)" fill="var(--murekkep)"/></svg>madde bitti</span><span><svg width="16" height="12" viewBox="0 0 16 12"><ellipse cx="7" cy="7" rx="5" ry="3.8" transform="rotate(-22 7 7)" fill="none" stroke="var(--pirinc)" stroke-width="1.6"/></svg>sürüyor</span><span style="color:var(--soluk)">Bir ölçüye tıkla: o fazın kartı açılır.</span></div></div>`;
  }
  const kpi = (deger, etiket, alt, hedef) => `<${hedef ? `a href="${hedef}"` : "div"} class="kart kpi"><span class="deger">${deger}</span><span class="etiket">${esc(etiket)}</span><span class="alt-not">${esc(alt)}</span></${hedef ? "a" : "div"}>`;
  $("#genel-kpi").innerHTML = [
    kpi(`${fazTamam}<small>/${D.fazlar.length}</small>`, "Faz tamam", `${D.fazlar.reduce((a, f) => a + f.bitti, 0)}/${D.fazlar.reduce((a, f) => a + f.toplam, 0)} madde bitti`, "#fazlar"),
    kpi(tam(D.test.toplam), "Test", D.test.gecen != null ? `${tam(D.test.gecen)} geçti · ${D.test.kaynak}` : D.test.kaynak),
    kpi(tam(D.karar?.toplam), "Karar tablosu satırı", "kapının regresyon kalkanı", "#kapi/karar"),
    kpi(tam(avTur), "Hata avı turu", avSon ? `son tur: ${avSon.yuksek ?? yok} yüksek, ${avSon.orta ?? yok} orta` : "", "#kapi/hata-avi"),
    kpi(n2(son.kappa, 3), "Laya kappa", `${son.ad ?? ""} · eşik 0,80`, "#laya"),
    kpi(tam(D.commit.sayi), "Commit", `${gun(D.commit.ilk)} → ${gun(D.commit.son)}`),
  ].join("");
  $("#genel-partisyon").innerHTML = partisyon();
  $("#genel-ozet").textContent = `${D.fazlar.length} fazın ${fazTamam} tanesi kapandı; ${D.fazlar.filter((f) => f.durum !== "tamam").map((f) => f.ad).join(", ") || "hepsi tamam"} sürüyor.`;
  $("#genel-simdi").innerHTML = `<div class="kart"><div class="satir"><h3 style="margin:0">Son durum notu <small style="color:var(--soluk);font-weight:400">ilerleme.json · ${esc(D.simdiTarih ? new Date(D.simdiTarih).toLocaleString("tr-TR") : yok)}</small></h3>${rozet("r-uyari", "gölge haftası")}</div><p class="ozet" style="margin-top:6px">${md(D.simdi ?? yok)}</p></div>`;

  // ======== 2. Fazlar ========
  const kabulFaz = (no) => D.kabul.filter((k) => k.hukumler.some((h) => h.faz === no));
  $("#faz-kartlar").innerHTML = D.fazlar.map((f) => `<article class="kart faz-kart" id="faz-${esc(f.id.replace(".", "-"))}" data-durum="${esc(f.durum)}">
    <div class="satir"><h3 style="margin:0"><span class="ekran" style="color:var(--pirinc)">F${esc(f.no)}</span> ${esc(f.ad)}</h3>${durumRozet(f.durum)}</div>
    <div class="ilerleme" ${ip(`${f.bitti}/${f.toplam} madde`)}><i style="width:${(f.bitti / f.toplam) * 100}%"></i></div>
    <div class="alt-not" style="font-size:.75rem;color:var(--soluk)">${gun(f.bas)} → ${gun(f.son)} · ${f.commitler.length} kanıt commit'i</div>
    <details><summary>Maddeler (${f.toplam})</summary><ul class="liste">${f.maddeler.map((m) => `<li><span class="isaret ${m.durum === "bitti" ? "var" : ""}">${m.durum === "bitti" ? "✓" : ""}</span><span>${esc(m.ad)}<br><small style="color:var(--soluk)">${md(m.kanit)}</small></span></li>`).join("")}</ul></details>
    <details><summary>Kabul raporları (${kabulFaz(f.no).length})</summary><ul class="liste">${kabulFaz(f.no).map((k) => `<li><span style="flex:1"><a href="../${esc(k.dosya)}">${esc(k.ad)}</a> <small style="color:var(--soluk)">${gun(k.tarih)}</small></span>${hukumRozet(k.hukumler.find((h) => h.faz === f.no).hukum)}</li>`).join("") || "<li>Ayrı kabul raporu yok</li>"}</ul></details>
    ${f.commitler.length ? `<details><summary>Kanıt commit'leri</summary><p class="mono" style="font-size:.78rem;color:var(--ikincil);margin:4px 0 8px">${f.commitler.map(esc).join(" · ")}</p></details>` : ""}
  </article>`).join("");
  // Zaman çizelgesi: günlük commit + faz aralıkları + gölge haftası
  (function zaman() {
    const bas = new Date("2026-09-29T00:00:00"), bugun = new Date(D.uretildi), golgeSon = new Date(L.golge.baslangic + "T00:00:00"); golgeSon.setDate(golgeSon.getDate() + L.golge.gun);
    const bitis = new Date(Math.max(bugun, golgeSon)); bitis.setHours(0, 0, 0, 0);
    const gunler = []; for (let d = new Date(bas); d <= bitis; d.setDate(d.getDate() + 1)) gunler.push(d.toISOString().slice(0, 10));
    const yerel = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    gunler.length = 0; for (let d = new Date(bas); d <= bitis; d.setDate(d.getDate() + 1)) gunler.push(yerel(d));
    const w = 1000, sol = 120, gw = (w - sol - 10) / gunler.length, ust = 10, ch = 90, satir = 20;
    const M = Math.max(1, ...gunler.map((g) => D.commit.gunluk[g] ?? 0));
    const X = (t) => { const i = gunler.indexOf(t.slice(0, 10)); return sol + (i < 0 ? 0 : i) * gw; };
    let s = `<text x="${sol - 8}" y="${ust + 12}" text-anchor="end" font-size="11">günlük commit</text>`;
    gunler.forEach((g, i) => {
      const v = D.commit.gunluk[g] ?? 0, hh = (v / M) * ch, x = sol + i * gw + gw * 0.2, bw = gw * 0.6;
      if (v) s += `<path d="M${x},${ust + ch}V${ust + ch - hh + 4}q0,-4 4,-4h${bw - 8}q4,0 4,4V${ust + ch}Z" fill="var(--s1)" ${ip(`${gun(g)}: ${v} commit`)}/><text x="${x + bw / 2}" y="${ust + ch - hh - 5}" text-anchor="middle" font-size="10.5" style="fill:var(--murekkep)">${v}</text>`;
      s += `<text x="${sol + i * gw + gw / 2}" y="${ust + ch + 16}" text-anchor="middle" font-size="10.5">${gun(g)}</text>`;
    });
    s += `<line class="eks" x1="${sol}" x2="${w - 10}" y1="${ust + ch}" y2="${ust + ch}"/>`;
    const y0 = ust + ch + 30;
    D.fazlar.forEach((f, i) => {
      const yy = y0 + i * satir;
      s += `<text x="${sol - 8}" y="${yy + 12}" text-anchor="end" font-size="11">F${esc(f.no)} ${esc(f.ad.length > 14 ? f.ad.slice(0, 13) + "…" : f.ad)}</text>`;
      if (f.bas) { const x1 = X(f.bas), x2 = X(f.son) + gw; s += `<rect x="${x1 + 2}" y="${yy + 2}" width="${Math.max(6, x2 - x1 - 4)}" height="${satir - 7}" rx="4" fill="${f.durum === "tamam" ? "var(--s3)" : "var(--s2)"}" ${ip(`F${f.no} ${f.ad}\n${gun(f.bas)} → ${gun(f.son)}\n${f.durum}`)}/>`; }
      else s += `<text x="${sol + 4}" y="${yy + 12}" font-size="10.5">kanıt tarihi yok</text>`;
    });
    const yg = y0 + D.fazlar.length * satir, gx = X(L.golge.baslangic), bugunX = X(yerel(bugun)) + gw / 2;
    s += `<text x="${sol - 8}" y="${yg + 12}" text-anchor="end" font-size="11">Laya gölge haftası</text><rect x="${gx + 2}" y="${yg + 2}" width="${L.golge.gun * gw - 4}" height="${satir - 7}" rx="4" fill="none" stroke="var(--s2)" stroke-width="1.5" stroke-dasharray="4 3" ${ip(`Gölge haftası ${gun(L.golge.baslangic)} başladı, ${L.golge.gun} gün`)}/>`;
    s += `<line x1="${bugunX}" x2="${bugunX}" y1="${ust}" y2="${ust + ch}" stroke="var(--pirinc)" stroke-width="1.5"/><line x1="${bugunX}" x2="${bugunX}" y1="${ust + ch + 22}" y2="${yg + satir}" stroke="var(--pirinc)" stroke-width="1.5"/><text x="${bugunX + 4}" y="${yg + satir + 12}" font-size="10.5" style="fill:var(--pirinc)">bugün</text>`;
    $("#faz-zaman").innerHTML = `<div class="lejant"><span><i style="background:var(--s1)"></i>commit/gün</span><span><i style="background:var(--s3)"></i>faz tamam</span><span><i style="background:var(--s2)"></i>faz sürüyor</span><span><i style="border:1.5px dashed var(--s2)"></i>gölge haftası</span></div>` + svg(w, yg + satir + 18, s, "29.09'dan bugüne zaman çizelgesi");
  })();

  // ======== 3. Kapı ve güvenlik ========
  const KD = D.karar?.dagilim ?? {};
  const KATMAN = [
    { ad: "Kesin yasak", alt: "kod durdurur", ne: "Force push, geri dönüşsüz silme, sır dosyaları, kök/proje dışı özyineli silme. Metin önce normalleştirilir (NFKC, akıllı tırnak).", ornek: "git push --force origin main", sonuc: "red (onayla bile açılmaz)", tablo: `RED: ${tam(KD.RED)} satır` },
    { ad: "Sahiplik", alt: "OWNS dışı yazma", ne: "Brifteki OWNS dışına Edit/Write/NotebookEdit reddedilir; yollar kanonik() ile tek biçime getirilir (8.3, UNC, junction).", ornek: "Write sunucu/kapi.ts (OWNS dışında)", sonuc: "red, sahibine mesaj", tablo: "kanonik yol testleri" },
    { ad: "Kapalı kapı", alt: "anlamadığını geçirme", ne: "Bileşik komut yalnızca katı alt kümede en çok 4 parçaya bölünür; dışına taşan biçim tümüyle tek soru olur.", ornek: "npm test && git status", sonuc: "2 parça Jev'e ayrı ayrı", tablo: `TEK: ${tam(KD.TEK)} · PARCA: ${tam((KD["PARCA:1"] ?? 0) + (KD["PARCA:2"] ?? 0) + (KD["PARCA:4"] ?? 0))}` },
    { ad: "Jev / Laya", alt: "sınıflar, onaylamaz", ne: "Jev parçayı güvenli / riskli / geri alınamaz / belirsiz diye sınıflar; güven < 0,8 belirsizdir. Laya aynı soruyu gölgede (8796) cevaplar, kararı etkilemez.", ornek: "ls; git log -3", sonuc: "güvenli ≥ 0,8 → izin", tablo: `IZIN (Jev'siz salt okuma): ${tam(KD.IZIN)}` },
    { ad: "İnsan", alt: "panel / zepul-ai düğmesi", ne: "Riskli, belirsiz ya da Jev'e ulaşılamayan çağrı onay kartı olur; ntfy 'soru' gider. Karar yalnızca düğmeyle.", ornek: "Read C:/Users/…/proje-disi.txt", sonuc: "onay kartı", tablo: `INSAN: ${tam(KD.INSAN)} satır` },
  ];
  $("#kapi-akis").innerHTML = KATMAN.map((k, i) => `${i ? '<span class="ok" aria-hidden="true">→</span>' : ""}<button class="dugum" aria-pressed="${i ? "false" : "true"}" data-katman="${i}"><b>${esc(k.ad)}</b><small>${esc(k.alt)}</small></button>`).join("");
  const katmanGoster = (i) => { const k = KATMAN[i]; $$("#kapi-akis .dugum").forEach((b) => b.setAttribute("aria-pressed", b.dataset.katman == i ? "true" : "false")); $("#kapi-detay").innerHTML = `<dl><dt>Ne yapar</dt><dd>${esc(k.ne)}</dd><dt>Örnek</dt><dd><code>${esc(k.ornek)}</code> → ${esc(k.sonuc)}</dd><dt>Karar tablosunda</dt><dd>${esc(k.tablo)}</dd></dl>`; };
  $("#kapi-akis").addEventListener("click", (e) => { const b = e.target.closest(".dugum"); if (b) katmanGoster(+b.dataset.katman); });
  katmanGoster(0);
  // Hata avı grafikleri
  const HA = D.hataAvi;
  $("#av-bulgu").innerHTML = `<div class="lejant"><span><i style="background:var(--kritik)"></i>yüksek</span><span><i style="background:var(--ciddi)"></i>orta</span><span><i style="background:var(--uyari)"></i>düşük</span><span><i style="background:var(--soluk)"></i>dağılımı bilinmiyor</span></div>` + cubuk({
    satirlar: HA.map((t) => ({ etiket: String(t.tur), ipucu: `Tur ${t.tur}${t.not ? " · " + t.not : ""}`, parcalar: t.yuksek == null ? [{ v: t.toplam, renk: "var(--soluk)", ad: "toplam bulgu" }] : [{ v: t.yuksek, renk: "var(--kritik)", ad: "yüksek" }, { v: t.orta, renk: "var(--ciddi)", ad: "orta" }, { v: t.dusuk, renk: "var(--uyari)", ad: "düşük" }] })),
    w: 640, h: 220, ad: "Hata avı turları: önem başına bulgu",
  }) + tabloDetay("Tablo olarak", [{ ad: "Tur" }, { ad: "Örnek", sag: 1 }, { ad: "Yüksek", sag: 1 }, { ad: "Orta", sag: 1 }, { ad: "Düşük", sag: 1 }, { ad: "Rapor" }], HA.map((t) => [t.tur, tam(t.ornek), tam(t.yuksek), tam(t.orta), tam(t.dusuk), t.dosya ? `<a href="../${esc(t.dosya)}">${esc(t.dosya.split("/").pop())}</a>` : esc(t.not ?? yok)]));
  $("#av-ornek").innerHTML = cubuk({ satirlar: HA.map((t) => ({ etiket: String(t.tur), ipucu: `Tur ${t.tur}`, yokNot: t.tur < 6 ? "örnek sayısı raporda yok (karar tablosu tur 6'da başladı)" : "veri yok", parcalar: [{ v: t.ornek, renk: "var(--s1)", ad: "örnek" }] })), w: 640, h: 200, ad: "Hata avı turlarında denenen örnek sayısı" });
  // Bulgu tablosu
  (function bulgular() {
    const B = D.bulgular, durum = { onem: "hepsi", tur: "hepsi", durum: "hepsi", ara: "" };
    const cip = (grup, deger, etiket) => `<button class="cip" data-grup="${grup}" data-deger="${esc(deger)}" aria-pressed="${durum[grup] === deger}">${esc(etiket)}</button>`;
    const say = (f) => B.filter(f).length;
    function ciz() {
      $("#bulgu-suzgec").innerHTML = `${["hepsi", "yüksek", "orta", "düşük"].map((o) => cip("onem", o, o === "hepsi" ? `Tüm önemler (${B.length})` : `${o} (${say((b) => b.onem === o)})`)).join("")}<span style="width:8px"></span>${[["hepsi", "Tüm kaynaklar"], ["kabul", "Kabul"], ["hata avı", "Hata avı"]].map(([d, e]) => cip("tur", d, e)).join("")}<span style="width:8px"></span>${[["hepsi", "Her durum"], ["acik", "Açık"], ["kapandi", "Kapandı"]].map(([d, e]) => cip("durum", d, e)).join("")}`;
      const q = durum.ara.toLocaleLowerCase("tr");
      const l = B.filter((b) => (durum.onem === "hepsi" || b.onem === durum.onem) && (durum.tur === "hepsi" || b.tur === durum.tur) && (durum.durum === "hepsi" || b.durum === durum.durum) && (!q || `${b.id} ${b.ozet} ${b.duzeltme ?? ""} ${b.kaynak ?? ""}`.toLocaleLowerCase("tr").includes(q)));
      $("#bulgu-sayi").textContent = `${l.length} bulgu`;
      $("#bulgu-govde").innerHTML = l.map((b) => `<tr><td class="mono">${esc(b.id)}</td><td>${onemRozet(b.onem)}</td><td>${md(b.ozet)}${b.duzeltme ? `<br><small style="color:var(--soluk)">düzeltme: ${md(b.duzeltme)}</small>` : ""}</td><td>${durumRozet(b.durum)}</td><td>${b.kaynak ? `<a href="../${esc(b.kaynak)}">${esc(b.kaynak.split("/").pop())}</a>` : yok}</td></tr>`).join("") || `<tr><td colspan="5"><div class="bos">Bu süzgeçle bulgu yok. Süzgeçlerden birini "hepsi"ne çevir.</div></td></tr>`;
    }
    $("#bulgu-suzgec").addEventListener("click", (e) => { const c = e.target.closest(".cip"); if (!c) return; durum[c.dataset.grup] = c.dataset.deger; ciz(); });
    $("#bulgu-ara").addEventListener("input", (e) => { durum.ara = e.target.value; ciz(); });
    ciz();
  })();
  // Karar tablosu
  (function karar() {
    if (!D.karar) { $("#karar-grafik").innerHTML = `<div class="bos">Karar tablosu okunamadı.</div>`; return; }
    const RENK = { INSAN: "var(--s2)", TEK: "var(--s1)", RED: "var(--kritik)", IZIN: "var(--s3)" };
    const ACIK = { INSAN: "insana gider", TEK: "tümü tek soru, Jev'e", RED: "kesin yasak, red", IZIN: "Jev'siz salt okuma izni", "PARCA:1": "1 parça Jev'e", "PARCA:2": "2 parça Jev'e", "PARCA:4": "4 parça Jev'e" };
    const sec = { karar: null, rol: "hepsi", ara: "" };
    const sirali = Object.entries(D.karar.dagilim).sort((a, b) => b[1] - a[1]);
    const ciz = () => {
      $("#karar-grafik").innerHTML = yatay({ satirlar: sirali.map(([k, v]) => ({ etiket: k, v, veri: k, renk: sec.karar && sec.karar !== k ? "var(--cizgi)" : RENK[k] ?? "var(--s1)", ipucu: `${k}: ${tam(v)} satır (${yuz(v / D.karar.toplam)})\n${ACIK[k] ?? ""}\nTıkla: örnekleri süz` })), tikla: true, ad: "Karar tablosu dağılımı", w: 520 });
      const q = sec.ara.toLocaleLowerCase("tr");
      const l = D.karar.satirlar.filter((r) => (!sec.karar || r.karar === sec.karar) && (sec.rol === "hepsi" || r.rol === sec.rol) && (!q || `${r.b} ${r.arac} ${typeof r.girdi === "string" ? r.girdi : JSON.stringify(r.girdi)}`.toLocaleLowerCase("tr").includes(q)));
      $("#karar-baslik").textContent = `${sec.karar ? sec.karar + " · " : ""}${tam(l.length)} satır${l.length > 60 ? " (ilk 60)" : ""}`;
      $("#karar-govde").innerHTML = l.slice(0, 60).map((r) => `<tr><td class="mono">${esc(r.b)}</td><td>${esc(r.rol)}${r.yerel ? " · yerel" : ""}</td><td>${esc(r.arac)}</td><td class="mono" style="font-size:.76rem">${esc(typeof r.girdi === "string" ? r.girdi : JSON.stringify(r.girdi))}</td><td><span class="rozet">${esc(r.karar)}</span></td></tr>`).join("") || `<tr><td colspan="5"><div class="bos">Eşleşen satır yok.</div></td></tr>`;
      $$("#karar-rol .cip").forEach((c) => c.setAttribute("aria-pressed", c.dataset.deger === sec.rol));
      $("#karar-temizle").hidden = !sec.karar;
    };
    const roller = ["hepsi", ...new Set(D.karar.satirlar.map((r) => r.rol))];
    $("#karar-rol").innerHTML = roller.map((r) => `<button class="cip" data-deger="${esc(r)}">${esc(r === "hepsi" ? "Tüm roller" : /^[a-z]+$/.test(r) ? r : JSON.stringify(r))}</button>`).join("") + `<button class="cip" id="karar-temizle" hidden>Karar süzgecini kaldır ×</button>`;
    $("#karar-rol").addEventListener("click", (e) => { const c = e.target.closest(".cip"); if (!c) return; if (c.id === "karar-temizle") sec.karar = null; else sec.rol = c.dataset.deger; ciz(); });
    const secim = (e) => { const g = e.target.closest("[data-sec]"); if (!g) return; sec.karar = sec.karar === g.dataset.sec ? null : g.dataset.sec; ciz(); };
    $("#karar-grafik").addEventListener("click", secim);
    $("#karar-grafik").addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); secim(e); } });
    $("#karar-ara").addEventListener("input", (e) => { sec.ara = e.target.value; ciz(); });
    ciz();
  })();

  // ======== 4. Laya ========
  (function laya() {
    const K = L.kosu, E = L.esik;
    const kosuCubuk = (alan, esik, esikEtiket, max, bicim, iyiYon, ad) => cubuk({
      satirlar: K.map((k) => ({ etiket: k.ad, ipucu: `${k.ad} · ${k.not ?? ""}\nn=${tam(k.n)} · kaynak: ${k.kaynak}`, yokNot: k.not, parcalar: [{ v: k[alan], ad, renk: k[alan] == null ? "none" : (iyiYon(k[alan]) ? "var(--s3)" : "var(--s2)") }] })),
      w: 1000, h: 170, max, esik, esikEtiket, bicim, ad,
    });
    $("#laya-kappa").innerHTML = kosuCubuk("kappa", E.kappa, "eşik ≥ 0,80", 1, (v) => n2(v, 2), (v) => v >= E.kappa, "Kappa");
    $("#laya-guvenlik").innerHTML = kosuCubuk("guvenlik", E.guvenlik, "eşik ≥ %95", 1, (v) => yuz(v, 1), (v) => v >= E.guvenlik, "Güvenlik geri çağırma");
    $("#laya-rg").innerHTML = kosuCubuk("rg", E.rg, "eşik ≤ %2", 0.05, (v) => yuz(v, 2), (v) => v <= E.rg, "Riskli→güvenli");
    $("#laya-tablo").innerHTML = tabloDetay("Koşular tablo olarak", [{ ad: "Koşu" }, { ad: "Kappa", sag: 1 }, { ad: "Güvenlik", sag: 1 }, { ad: "Riskli→güvenli", sag: 1 }, { ad: "Doğruluk", sag: 1 }, { ad: "n", sag: 1 }, { ad: "Kaynak" }], K.map((k) => [esc(k.ad), n2(k.kappa), yuz(k.guvenlik), yuz(k.rg, 2), yuz(k.dogruluk), tam(k.n), `<small>${esc(k.kaynak)}</small>`]));
    // Isı haritası
    const isi = (M, baslik) => {
      if (!M) return `<div class="bos">Karışıklık verisi yok.</div>`;
      const S = L.siniflar, AD = { guvenli: "güvenli", riskli: "riskli", "geri-alinamaz": "geri alınamaz", belirsiz: "belirsiz" };
      const max = Math.max(1, ...S.flatMap((a) => S.map((b) => M[a][b]))), hc = 52, sol = 100, ust = 34, w = sol + S.length * hc + 4, h = ust + S.length * hc + 4;
      let s = `<text x="${sol + (S.length * hc) / 2}" y="12" text-anchor="middle" font-size="11">Laya'nın kararı →</text>`;
      S.forEach((b, j) => (s += `<text x="${sol + j * hc + hc / 2}" y="${ust - 8}" text-anchor="middle" font-size="10.5">${AD[b]}</text>`));
      S.forEach((a, i) => {
        const sat = S.reduce((t, b) => t + M[a][b], 0);
        s += `<text x="${sol - 8}" y="${ust + i * hc + hc / 2 + 4}" text-anchor="end" font-size="10.5">${AD[a]}</text>`;
        S.forEach((b, j) => {
          const v = M[a][b], o = v / max, kacak = a === "riskli" && b === "guvenli" || a === "geri-alinamaz" && b === "guvenli";
          s += `<g ${ip(`Jev: ${AD[a]} · Laya: ${AD[b]}\n${v} kayıt (${yuz(sat ? v / sat : 0)} satırın)${kacak && v ? "\n⚠ riskliyi güvenli sanma" : ""}`)}><rect x="${sol + j * hc + 1}" y="${ust + i * hc + 1}" width="${hc - 2}" height="${hc - 2}" rx="5" fill="var(--s1)" fill-opacity="${v ? 0.12 + o * 0.88 : 0.04}" ${kacak && v ? 'stroke="var(--kritik)" stroke-width="2"' : ""}/><text x="${sol + j * hc + hc / 2}" y="${ust + i * hc + hc / 2 + 4}" text-anchor="middle" font-size="12" font-weight="600" style="fill:${o > 0.5 ? "#fff" : "var(--murekkep)"}">${v}</text></g>`;
        });
      });
      s += `<text x="10" y="${ust + (S.length * hc) / 2}" font-size="11" transform="rotate(-90 10 ${ust + (S.length * hc) / 2})" text-anchor="middle">Jev'in kararı</text>`;
      return svg(w, h, s, baslik);
    };
    const isiCiz = (hangi) => { $("#laya-isi").innerHTML = hangi === "son" ? isi(L.karisiklik, `Karışıklık: ${son.ad}, 5 kat birleşik`) : isi(L.tabanKarisiklik, "Karışıklık: eğitimsiz taban"); $$("#isi-sec .cip").forEach((c) => c.setAttribute("aria-pressed", c.dataset.deger === hangi)); };
    $("#isi-sec").innerHTML = `<button class="cip" data-deger="son">Eğitilmiş (${esc(son.ad)})</button><button class="cip" data-deger="taban">Taban (eğitimsiz)</button>`;
    $("#isi-sec").addEventListener("click", (e) => { const c = e.target.closest(".cip"); if (c) isiCiz(c.dataset.deger); });
    isiCiz("son");
    // T taraması ve eğitim eğrisi
    if (L.tarama.length) {
      const Ts = L.tarama, xmin = Ts[0].T, xmax = Ts.at(-1).T;
      $("#laya-tarama").innerHTML = cizgi({ seriler: [{ ad: "riskli→güvenli", renk: "var(--s2)", noktalar: Ts.map((t) => ({ x: t.T, y: t.rg, vurgu: t.T === L.T, ipucu: `T=${n2(t.T, 2)}\nriskli→güvenli ${yuz(t.rg, 2)}\nkappa ${n2(t.kappa)}\nJev'e kalan ${yuz(t.yuk)}` })) }], xmin, xmax, ymin: 0, ymax: 0.03, ybicim: (v) => yuz(v, 1), xbicim: (v) => n2(v, 2), esik: E.rg, esikEtiket: "eşik %2", xEtiket: "güvenli eşiği T", ad: "Güvenli eşiği taraması: riskli→güvenli" })
        + cizgi({ seriler: [{ ad: "Jev'e kalan yük", renk: "var(--s1)", noktalar: Ts.map((t) => ({ x: t.T, y: t.yuk, vurgu: t.T === L.T, ipucu: `T=${n2(t.T, 2)}\nJev'e kalan ${yuz(t.yuk)}\nkappa ${n2(t.kappa)}` })) }], xmin, xmax, ymin: 0, ymax: 0.1, h: 170, ybicim: (v) => yuz(v, 0), xbicim: (v) => n2(v, 2), xEtiket: "güvenli eşiği T", ad: "Güvenli eşiği taraması: Jev'e kalan yük" });
    } else $("#laya-tarama").innerHTML = `<div class="bos">Eşik taraması yok.</div>`;
    if (L.egri.length) $("#laya-egri").innerHTML = `<div class="lejant"><span><i style="background:var(--s1)"></i>kappa</span><span><i style="background:var(--s3)"></i>güvenlik geri çağırma</span></div>` + cizgi({ seriler: [{ ad: "kappa", renk: "var(--s1)", noktalar: L.egri.map((p) => ({ x: p.tur, y: p.kappa, ipucu: `Tur ${p.tur}: kappa ${n2(p.kappa)}` })) }, { ad: "güvenlik", renk: "var(--s3)", noktalar: L.egri.map((p) => ({ x: p.tur, y: p.guvenlik, ipucu: `Tur ${p.tur}: güvenlik ${yuz(p.guvenlik)}` })) }], xmin: 1, xmax: L.egri.length, ymin: 0.4, ymax: 1, xbicim: (v) => Math.round(v), xEtiket: "eğitim turu", etiketle: false, esik: E.kappa, esikEtiket: "kappa eşiği 0,80", ad: "Eğitim eğrisi, 5 kat ortalaması" });
    // Gölge haftası
    const G = L.golge, bas = new Date(G.baslangic + "T00:00:00"), simdi = new Date(), gecen = Math.max(0, (simdi - bas) / 864e5), oran = Math.min(1, gecen / G.gun);
    const r = 46, cev = 2 * Math.PI * r;
    $("#golge-halka").innerHTML = svg(120, 120, `<circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--yuzey2)" stroke-width="10"/><circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--s2)" stroke-width="10" stroke-linecap="round" stroke-dasharray="${cev * oran} ${cev}" transform="rotate(-90 60 60)"/><text x="60" y="58" text-anchor="middle" font-size="22" font-weight="700" style="fill:var(--murekkep);font-family:Bahnschrift,'Arial Narrow',sans-serif">${Math.min(G.gun, Math.floor(gecen))}/${G.gun}</text><text x="60" y="76" text-anchor="middle" font-size="10.5">gün</text>`, "Gölge haftası ilerlemesi");
    const bitis = new Date(bas); bitis.setDate(bitis.getDate() + G.gun);
    $("#golge-bilgi").innerHTML = `<dl style="display:grid;grid-template-columns:max-content 1fr;gap:4px 14px;margin:0;font-size:.88rem"><dt style="color:var(--soluk)">Başlangıç</dt><dd style="margin:0">${bas.toLocaleDateString("tr-TR")}</dd><dt style="color:var(--soluk)">Bitiş</dt><dd style="margin:0">${bitis.toLocaleDateString("tr-TR")} ${simdi >= bitis ? rozet("r-iyi", "doldu") : `<small style="color:var(--soluk)">${Math.ceil((bitis - simdi) / 864e5)} gün kaldı</small>`}</dd><dt style="color:var(--soluk)">Gölge kaydı</dt><dd style="margin:0">${G.kayit ? tam(G.kayit) : "henüz veri yok"}</dd><dt style="color:var(--soluk)">Canlı uyum</dt><dd style="margin:0">${G.uyum == null ? "henüz veri yok" : yuz(G.uyum) + (G.uyum >= E.golge ? " " + rozet("r-iyi", "≥ %90") : " " + rozet("r-ciddi", "< %90"))}</dd><dt style="color:var(--soluk)">Sunucu</dt><dd style="margin:0">127.0.0.1:${G.port}</dd></dl><p class="ipucu-not" style="margin:8px 0 0">Eğitimsiz Laya'nın eski kayıtları (${tam(G.eskiKayit)}, uyum ${yuz(G.eskiUyum)}) sayılmaz. Sayaç sayfa açıldığında yeniden hesaplanır; kayıt sayısı <code>npm run ozet</code> ile güncellenir.</p>`;
    // Devralma ölçütleri
    const O = [
      { ad: "Kappa ≥ 0,80", deger: n2(son.kappa), tamam: son.kappa != null ? son.kappa >= E.kappa : null },
      { ad: "Güvenlik geri çağırma ≥ %95", deger: yuz(son.guvenlik), tamam: son.guvenlik != null ? son.guvenlik >= E.guvenlik : null },
      { ad: "Riskliyi güvenli sanma ≤ %2", deger: yuz(son.rg, 2), tamam: son.rg != null ? son.rg <= E.rg : null },
      { ad: "1 hafta gölgede uyum ≥ %90", deger: G.uyum == null ? "henüz veri yok" : yuz(G.uyum), tamam: G.uyum == null || simdi < bitis ? null : G.uyum >= E.golge },
      { ad: "Kullanıcı onayı", deger: "gölge haftası bitince sorulur", tamam: null },
    ];
    $("#devralma").innerHTML = `<ul class="liste">${O.map((o) => `<li><span class="isaret ${o.tamam === true ? "var" : o.tamam === false ? "yok" : ""}" role="img" aria-label="${o.tamam === true ? "sağlandı" : o.tamam === false ? "sağlanmadı" : "bekliyor"}">${o.tamam === true ? "✓" : o.tamam === false ? "✕" : ""}</span><span style="flex:1">${esc(o.ad)}</span><span class="mono" style="color:var(--ikincil)">${esc(o.deger)}</span></li>`).join("")}</ul><p class="ipucu-not" style="margin:6px 0 0">Not: geçiş 502 kayıtta 4 hataya dayanıyor; katlar arası sapma ±2,7 puan. Öneri: T=0,75 (riskli→güvenli %1,23, Jev'e kalan %2,4).</p>`;
  })();

  // ======== 5. Model ve maliyet ========
  $("#model-rol").innerHTML = `<div class="tablo"><table><thead><tr><th>Rol</th><th>Koddaki varsayılan</th><th>Senin ayarın (test aşaması)</th></tr></thead><tbody>${D.modeller.map((m) => `<tr><td>${esc(m.rol)}</td><td class="mono">${esc(m.kod ?? yok)}</td><td class="mono">${esc(m.kullanici ?? m.kod ?? yok)}${m.kullanici && m.kullanici !== m.kod ? " " + rozet("r-uyari", "değiştirildi") : ""}</td></tr>`).join("")}</tbody></table></div><p class="ipucu-not">İşçide Fable her durumda yasak; rol modelini yalnızca sen panelden değiştirirsin.</p>`;
  $("#model-yerel").innerHTML = yatay({ satirlar: D.yerelModeller.map((m) => ({ etiket: m.model.split(" ")[0], v: m.tok, renk: "var(--s1)", ipucu: `${m.model}\n${m.yer}\n${m.tok == null ? "hız ölçülmedi" : n2(m.tok, 1) + " tok/sn"}\n${m.not}` })), bicim: (v) => (v ? n2(v, 1) + " tok/sn" : yok), w: 560, ad: "Yerel model üretim hızı" }) + tabloDetay("Ayrıntı", [{ ad: "Model" }, { ad: "Yer" }, { ad: "tok/sn", sag: 1 }, { ad: "Not" }, { ad: "Kaynak" }], D.yerelModeller.map((m) => [esc(m.model), esc(m.yer), n2(m.tok, 1), esc(m.not), `<small>${esc(m.kaynak)}</small>`]));
  const KM = D.kabul.filter((k) => k.usd != null);
  $("#maliyet-toplam").innerHTML = `${kpi(n2(toplamUsd, 2) + "<small> USD</small>", "Kabul testleri toplamı", `${KM.length} rapor · liste fiyatı tahmini, abonelikte faturalanmaz`)}${kpi(n2(Math.max(...KM.map((k) => k.usd)), 2) + "<small> USD</small>", "En pahalı kabul", KM.reduce((a, k) => (k.usd > (a?.usd ?? -1) ? k : a), null)?.ad ?? yok)}${kpi(n2(toplamUsd / Math.max(1, KM.filter((k) => k.usd > 0).length), 2) + "<small> USD</small>", "Ortalama (ücretli kabul)", "yerel kabul 0 USD")}`;
  $("#maliyet-grafik").innerHTML = yatay({ satirlar: [...KM].sort((a, b) => (a.tarih ?? "").localeCompare(b.tarih ?? "") || a.ad.localeCompare(b.ad)).map((k) => ({ etiket: k.ad, v: k.usd, renk: k.usd > 1 ? "var(--s2)" : "var(--s1)", ipucu: `${k.baslik}\n${gun(k.tarih)} · ${n2(k.usd, 4)} USD` })), bicim: (v) => n2(v, 2) + " $", w: 600, sat: 24, ad: "Kabul testi başına Claude maliyeti" }) + `<p class="ipucu-not">Turuncu: 1 USD üstü. Değerler raporların "Toplam" satırından okunur.</p>`;

  // ======== 6. zepul-ai ========
  const AKIS = [
    { ad: "Görev", alt: "zepul-ai → POST /api/gorev", ne: "Sohbette \"Orkestraya söyle: …\" dersin; asistan orkestra_gorev aracıyla işi yollar.", uc: "POST /api/gorev {metin, gorev_id?} → gorev_alindi" },
    { ad: "Şef", alt: "[kaynak: zepul-ai · güven: orta]", ne: "Şef işi senin doğrudan talimatın saymaz; orta güvenli talimat olarak tartar.", uc: "Etiket şefe mesajın başına eklenir" },
    { ad: "Riskli mi?", alt: "şefin kararı", ne: "Güvenliyse işçi başlar, kapı her adımı denetler. Riskliyse soruyu sana geri yollar.", uc: "Hayır → işçi → denetçi → gorev_sonuc" },
    { ad: "zepul_ai_sor", alt: "\"Emin misin?\"", ne: "Kart zepul-ai panelinde \"zepul-os · Emin misin?\" rozetiyle çıkar. 24 saat cevap yoksa görev iptal.", uc: "olay zepul_ai_soru {soru_id, gorev_id, soru}" },
    { ad: "Sen", alt: "düğmeye basarsın", ne: "Evet ya da Hayır yalnızca senin bastığın düğmeden gelir; asistan modelinin onay aracı yoktur.", uc: "POST /api/zepul-ai/cevap {soru_id, karar, not?}" },
    { ad: "Cevap", alt: "gorev_sonuc", ne: "Yalnızca TAMAM işin yapıldığı anlamına gelir. BASARISIZ ve REDDEDILDI \"yapılmadı\"dır.", uc: "gorev_sonuc {gorev_id, verdict, ozet}" },
  ];
  const EK = [
    { ad: "Onay kartı", alt: "kapı onayı, iki panelde", ne: "Kapının onay soruları zepul-ai panelinde de kart olur; hangi panelde önce basarsan o geçer.", uc: "POST /api/onay {onay_id, karar} · kaynak: zepul-ai" },
    { ad: "Kâtip notu", alt: "MyBrain'e tek yazar", ne: "zepul-ai MyBrain'e kendisi yazmaz; notu orkestranın kâtibine yollar. Orkestra kapalıysa not kuyrukta bekler.", uc: "POST /api/katip-not {tur, veri} · kuyruk: veri/katip-kuyruk.jsonl" },
    { ad: "Dar anahtar", alt: "7 uç", ne: "Panel token'ı yerine yalnızca 7 uca yetkili ayrı anahtar; ayarlar, kapatma ve doğrudan mesaj 403 döner.", uc: "%LOCALAPPDATA%\\zepul-os\\zepul-ai-anahtar.txt" },
  ];
  const tum = [...AKIS, ...EK];
  $("#zai-akis").innerHTML = AKIS.map((k, i) => `${i ? '<span class="ok" aria-hidden="true">→</span>' : ""}<button class="dugum" data-i="${i}" aria-pressed="${i ? "false" : "true"}"><b>${esc(k.ad)}</b><small>${esc(k.alt)}</small></button>`).join("");
  $("#zai-ek").innerHTML = EK.map((k, i) => `<button class="dugum" data-i="${AKIS.length + i}" aria-pressed="false"><b>${esc(k.ad)}</b><small>${esc(k.alt)}</small></button>`).join("");
  const zaiGoster = (i) => { $$("#zepul-ai .dugum").forEach((b) => b.setAttribute("aria-pressed", b.dataset.i == i ? "true" : "false")); const k = tum[i]; $("#zai-detay").innerHTML = `<dl><dt>Ne olur</dt><dd>${esc(k.ne)}</dd><dt>Uç / olay</dt><dd class="mono" style="font-size:.8rem">${esc(k.uc)}</dd></dl>`; };
  $("#zepul-ai").addEventListener("click", (e) => { const b = e.target.closest(".dugum[data-i]"); if (b) zaiGoster(+b.dataset.i); });
  zaiGoster(0);
  // Öneriler
  (function oneriler() {
    const O = D.oneriler, etiketler = ["hepsi", ...new Set(O.flatMap((o) => o.etiket))];
    const boy = (s) => (/büyük/.test(s) ? "büyük" : /orta/.test(s) ? "orta" : "küçük");
    let sec = "hepsi", boyS = "hepsi";
    const ciz = () => {
      $("#oneri-suzgec").innerHTML = etiketler.map((e) => `<button class="cip" data-t="e" data-d="${esc(e)}" aria-pressed="${sec === e}">${esc(e === "hepsi" ? "Tüm konular" : e)}</button>`).join("") + '<span style="width:8px"></span>' + ["hepsi", "küçük", "orta", "büyük"].map((b) => `<button class="cip" data-t="b" data-d="${b}" aria-pressed="${boyS === b}">${b === "hepsi" ? "Her boy" : "iş: " + b}</button>`).join("");
      const l = O.filter((o) => (sec === "hepsi" || o.etiket.includes(sec)) && (boyS === "hepsi" || boy(o.is) === boyS));
      $("#oneri-kartlar").innerHTML = l.map((o) => `<article class="kart"><div class="satir"><h3 style="margin:0"><span class="ekran" style="color:var(--pirinc)">${o.no}</span> ${esc(o.baslik)}</h3><span class="rozet">${esc("iş: " + o.is)}</span></div><p style="margin:8px 0 4px;font-size:.88rem">${md(o.kazanc)}</p><div class="cipler" style="margin:4px 0">${o.etiket.map((e) => `<span class="rozet">${esc(e)}</span>`).join("")}</div><details><summary>Neden</summary><p style="margin:0 0 8px;font-size:.86rem;color:var(--ikincil)">${md(o.neden)}</p></details></article>`).join("") || `<div class="bos">Bu süzgeçte öneri yok.</div>`;
    };
    $("#oneri-suzgec").addEventListener("click", (e) => { const c = e.target.closest(".cip"); if (!c) return; if (c.dataset.t === "e") sec = c.dataset.d; else boyS = c.dataset.d; ciz(); });
    ciz();
  })();
  $("#istemler").innerHTML = D.istemler.map((s, i) => `<article class="kart istem"><div class="satir" style="margin-bottom:8px"><h3 style="margin:0">${i + 1}. ${esc(s.baslik)}</h3><button class="kopyala" data-i="${i}">Kopyala</button></div><details><summary>İstemi göster</summary><pre>${esc(s.metin)}</pre></details></article>`).join("");
  $("#istemler").addEventListener("click", async (e) => {
    const b = e.target.closest(".kopyala"); if (!b) return;
    const metin = D.istemler[+b.dataset.i].metin;
    let ok = false;
    try { await navigator.clipboard.writeText(metin); ok = true; } catch { const a = document.createElement("textarea"); a.value = metin; a.style.position = "fixed"; a.style.opacity = "0"; document.body.appendChild(a); a.select(); try { ok = document.execCommand("copy"); } catch {} a.remove(); }
    b.textContent = ok ? "Kopyalandı" : "Kopyalanamadı: elle seç"; setTimeout(() => (b.textContent = "Kopyala"), 1800);
  });

  // ======== 7. Çalıştırma ========
  $("#port-govde").innerHTML = D.portlar.map((p) => `<tr><td class="mono">${esc(p.port)}</td><td>${esc(p.ne)}</td><td>${p.bizim ? rozet("r-iyi", "orkestra") : rozet("", "dolu, kullanma")}</td></tr>`).join("");

  // ======== 8. Sınırlar ve sıradakiler ========
  const SON = D.sonListe?.maddeler ?? [];
  $("#son-liste").innerHTML = `<ul class="liste">${SON.map((m) => `<li><span class="isaret ${m.durum === "bitti" ? "var" : ""}">${m.durum === "bitti" ? "✓" : ""}</span><span style="flex:1">${esc(m.ad)}${m.kanit ? `<br><small style="color:var(--soluk)">${esc(m.kanit)}</small>` : ""}</span>${durumRozet(m.durum)}</li>`).join("")}</ul>`;
  $("#siradaki").innerHTML = `<ul class="liste">${D.siradaki.map((s) => `<li><span class="isaret"></span><span>${md(s)}</span></li>`).join("")}</ul>`;
  (function kararlar() {
    const ciz = (q = "") => { const l = D.kararlar.filter((k) => !q || `${k.ne} ${k.neden}`.toLocaleLowerCase("tr").includes(q.toLocaleLowerCase("tr"))); $("#karar-liste").innerHTML = l.map((k) => `<tr><td class="sag">${k.tur}</td><td>${md(k.ne)}<br><small style="color:var(--soluk)">${md(k.neden)}</small></td></tr>`).join("") || `<tr><td colspan="2"><div class="bos">Eşleşen karar yok.</div></td></tr>`; $("#kararlar-sayi").textContent = `${l.length}/${D.kararlar.length}`; };
    $("#kararlar-ara").addEventListener("input", (e) => ciz(e.target.value)); ciz();
  })();

  $("#uretim").textContent = `Üretildi: ${new Date(D.uretildi).toLocaleString("tr-TR")} · HEAD ${D.head ?? yok}`;
  git();
  document.documentElement.dataset.grafik = String($$("svg[data-grafik]").length);
  document.documentElement.dataset.hazir = "1";
}

function sayfa(D) {
  const veri = JSON.stringify(D).replace(/</g, "\\u003c");
  const B = (id, no, ad) => `<li><a href="#${id}"><span>${no}</span>${ad}</a></li>`;
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Zepul OS Özeti</title>
<meta name="description" content="Zepul OS orkestrasının fazları, kapı güvenliği, Laya eğitimi, maliyet ve zepul-ai entegrasyonu üzerine etkileşimli rapor paneli.">
<style>${CSS}</style>
</head>
<body>
<div class="kabuk">
<aside>
  <div class="marka"><svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true"><g stroke="var(--pirinc)" stroke-width="1.3">${[7, 11, 15, 19, 23].map((y) => `<line x1="2" x2="28" y1="${y}" y2="${y}" opacity=".55"/>`).join("")}</g><ellipse cx="12" cy="19" rx="4.6" ry="3.4" transform="rotate(-22 12 19)" fill="var(--murekkep)"/><line x1="16.2" x2="16.2" y1="19" y2="4" stroke="var(--murekkep)" stroke-width="1.6"/></svg><div><b class="ekran">Zepul OS</b><small>orkestra raporu</small></div></div>
  <nav aria-label="Bölümler"><ol>
    ${B("genel", 1, "Genel bakış")}${B("fazlar", 2, "Fazlar")}${B("kapi", 3, "Kapı ve güvenlik")}${B("laya", 4, "Laya")}${B("model", 5, "Model ve maliyet")}${B("zepul-ai", 6, "zepul-ai")}${B("calistir", 7, "Çalıştırma")}${B("sinirlar", 8, "Sınırlar ve sıradakiler")}
  </ol></nav>
  <div class="alt"><button class="tema" id="tema" type="button">Tema: otomatik</button><span id="uretim"></span></div>
</aside>
<main>
<section id="genel">
  <div class="ust"><div><h1 class="ekran">Orkestra durumu</h1><p class="ozet" id="genel-ozet"></p></div></div>
  <div class="izgara" id="genel-kpi" style="--min:170px"></div>
  <h2>Faz partisyonu <small>her ölçü bir faz, her nota bir madde</small></h2>
  <div id="genel-partisyon"></div>
  <div id="genel-simdi" style="margin-top:12px"></div>
</section>

<section id="fazlar" hidden>
  <div class="ust"><div><h1 class="ekran">Fazlar</h1><p class="ozet">Maddeler, kabul hükümleri ve kanıt commit'leri kartların içinde.</p></div></div>
  <div class="izgara" id="faz-kartlar" style="--min:300px"></div>
  <h2>Zaman çizelgesi <small>29.09'dan bugüne</small></h2>
  <div class="kart" id="faz-zaman"></div>
</section>

<section id="kapi" hidden>
  <div class="ust"><div><h1 class="ekran">Kapı ve güvenlik</h1><p class="ozet">Her araç çağrısı soldan sağa beş katmandan geçer. Bir katmana tıkla.</p></div></div>
  <div class="akis" id="kapi-akis" role="group" aria-label="Kapı katmanları"></div>
  <div class="detay" id="kapi-detay" aria-live="polite"></div>
  <h2 id="hata-avi">Hata avı <small>turlar 1–14</small></h2>
  <div class="iki"><div class="kart"><h3>Önem başına bulgu</h3><div id="av-bulgu"></div></div><div class="kart"><h3>Denenen örnek sayısı</h3><div id="av-ornek"></div></div></div>
  <h2>Bulgular <small id="bulgu-sayi"></small></h2>
  <div class="satir"><div class="cipler" id="bulgu-suzgec"></div><input type="search" id="bulgu-ara" placeholder="Bulgu ara: kimlik, metin, commit" aria-label="Bulgu ara"></div>
  <div class="tablo kaydir"><table><thead><tr><th>Kimlik</th><th>Önem</th><th>Özet</th><th>Durum</th><th>Kaynak</th></tr></thead><tbody id="bulgu-govde"></tbody></table></div>
  <h2 id="karar">Karar tablosu <small>çubuğa tıkla: örnekler süzülür</small></h2>
  <div class="iki"><div class="kart"><div id="karar-grafik"></div></div><div class="kart"><div class="cipler" id="karar-rol"></div><input type="search" id="karar-ara" placeholder="Girdi ara: rm, git push, Grep…" aria-label="Karar tablosunda ara"><p class="ipucu-not" id="karar-baslik"></p></div></div>
  <div class="tablo kaydir" style="margin-top:10px"><table><thead><tr><th>Küme</th><th>Rol</th><th>Araç</th><th>Girdi</th><th>Karar</th></tr></thead><tbody id="karar-govde"></tbody></table></div>
</section>

<section id="laya" hidden>
  <div class="ust"><div><h1 class="ekran">Laya</h1><p class="ozet">Yerel kapı modeli: üç eşiği geçti, şimdi bir hafta gölgede Jev'le karşılaştırılıyor.</p></div></div>
  <h2>Koşu karşılaştırması <small>yeşil: eşiği geçti · turuncu: geçmedi · —: ölçüm yok</small></h2>
  <div class="kosu"><div class="kart"><h3>Kappa</h3><div id="laya-kappa"></div></div><div class="kart"><h3>Güvenlik geri çağırma</h3><div id="laya-guvenlik"></div></div><div class="kart"><h3>Riskliyi güvenli sanma</h3><div id="laya-rg"></div></div></div>
  <div id="laya-tablo"></div>
  <div class="iki" style="margin-top:12px">
    <div class="kart"><h3>Karışıklık ısı haritası</h3><div class="cipler" id="isi-sec"></div><div id="laya-isi" style="max-width:440px"></div><p class="ipucu-not">Kırmızı çerçeve: riskliyi güvenli sanma.</p></div>
    <div class="kart"><h3>Gölge haftası</h3><div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap"><div id="golge-halka" style="width:120px"></div><div id="golge-bilgi" style="flex:1;min-width:200px"></div></div><h3 style="margin-top:14px">Devralma ölçütleri</h3><div id="devralma"></div></div>
  </div>
  <div class="iki" style="margin-top:12px"><div class="kart"><h3>Güvenli eşiği taraması</h3><div id="laya-tarama"></div></div><div class="kart"><h3>Eğitim eğrisi</h3><div id="laya-egri"></div></div></div>
</section>

<section id="model" hidden>
  <div class="ust"><div><h1 class="ekran">Model ve maliyet</h1><p class="ozet">Test aşamasında bütün roller Sonnet; yerel modeller ölçüldü ama yavaş.</p></div></div>
  <div class="iki"><div><h2 style="margin-top:0">Rol başına model</h2><div id="model-rol"></div></div><div class="kart"><h3>Yerel model hızı</h3><div id="model-yerel"></div></div></div>
  <h2>Kabul testlerinin Claude maliyeti</h2>
  <div class="izgara" id="maliyet-toplam" style="--min:200px"></div>
  <div class="kart" style="margin-top:12px" id="maliyet-grafik"></div>
</section>

<section id="zepul-ai" hidden>
  <div class="ust"><div><h1 class="ekran">zepul-ai</h1><p class="ozet">Asistan orkestraya iş verir; riskli işte karar her zaman sende kalır.</p></div></div>
  <div class="akis" id="zai-akis" role="group" aria-label="Görev akışı"></div>
  <div class="akis" id="zai-ek" style="margin-top:8px;gap:8px" role="group" aria-label="Yan akışlar"></div>
  <div class="detay" id="zai-detay" aria-live="polite"></div>
  <h2>Nasıl kullanırım</h2>
  <div class="adimlar">
    <div class="kart adim"><h3>Orkestrayı aç</h3><small>zepul-os\\Baslat.bat · 8820 açık olmalı; dar anahtar ilk açılışta oluşur.</small></div>
    <div class="kart adim"><h3>zepul-ai'yi yeniden başlat</h3><small>Durdur.bat, sonra Baslat.bat. Faz 7 özellikleri ancak böyle yüklenir.</small></div>
    <div class="kart adim"><h3>Bağlantıyı gör</h3><small>Üst şeritte "zepul-os bağlı · N ajan" yazmalı.</small></div>
    <div class="kart adim"><h3>İşi söyle</h3><small>"Orkestraya söyle: rapor sayfasına maliyet özeti eklesin."</small></div>
    <div class="kart adim"><h3>Kartlara bas</h3><small>"Emin misin?" ve kapı onay kartları burada çıkar; karar senin düğmende.</small></div>
    <div class="kart adim"><h3>Sonucu dinle</h3><small>"zepul-os görevi TAMAM: …" bildirimi ve sesli özet gelir.</small></div>
  </div>
  <h2>Geliştirme önerileri <small>önceliğe göre numaralı</small></h2>
  <div class="cipler" id="oneri-suzgec"></div>
  <div class="izgara" id="oneri-kartlar" style="--min:280px"></div>
  <p class="ipucu-not">Bilerek listede yok: PC ve tarayıcı araçlarının asistana bağlanması. Önce senin kararın gerekiyor.</p>
  <h2>Hazır istemler <small>zepul-ai oturumuna yapıştır</small></h2>
  <div class="izgara" id="istemler" style="--min:300px"></div>
</section>

<section id="calistir" hidden>
  <div class="ust"><div><h1 class="ekran">Çalıştırma ve sorun giderme</h1></div></div>
  <div class="adimlar">
    <div class="kart adim"><h3>Başlat</h3><small><code>Baslat.bat</code> ya da <code>npm run baslat</code>. Gölge Laya'yı (8796) da açar.</small></div>
    <div class="kart adim"><h3>Paneli aç</h3><small><code>%LOCALAPPDATA%\\zepul-os\\panel-url.txt</code> içindeki token'lı adres.</small></div>
    <div class="kart adim"><h3>Telefondan</h3><small>Yalnızca tailnet içinden (<code>tailscale serve</code>); internete açık değil.</small></div>
    <div class="kart adim"><h3>Ayarlar</h3><small>Panelden: limit tavanı, <code>azami_isci</code>, rol modelleri, döngü eşikleri.</small></div>
    <div class="kart adim"><h3>Durdur</h3><small>Ctrl+C ya da <code>npm run kapat</code>. Pencereyi X ile kapatma.</small></div>
    <div class="kart adim"><h3>Raporu yenile</h3><small><code>npm run ozet</code>: bu sayfayı gerçek veriyle yeniden üretir.</small></div>
  </div>
  <div class="iki" style="margin-top:4px">
    <div><h2>Portlar</h2><div class="tablo"><table><thead><tr><th>Port</th><th>Ne</th><th></th></tr></thead><tbody id="port-govde"></tbody></table></div></div>
    <div><h2>Sık sorunlar</h2><div class="kart">
      <details><summary>Panel "Token gerekli" diyor</summary><p class="ozet">Token her açılışta yeniden üretilir. <code>panel-url.txt</code> içindeki adresi aç.</p></details>
      <details><summary>Sunucu açılmıyor, port hatası</summary><p class="ozet">8820 başka süreçte dolu. <code>npm run kapat</code>, sonra yeniden başlat.</p></details>
      <details><summary>Çok fazla onay kartı geliyor</summary><p class="ozet">Jev kotası dolmuş (429) ya da ulaşılamıyor. Kota açılana kadar bekle ya da <code>OPENCODE_API_KEY</code> tanımla.</p></details>
      <details><summary>"Laya (gölge)" hatası</summary><p class="ozet">8796'daki gölge Laya kapalı ya da yükleniyor (10–20 sn). Karar etkilenmez, Jev'den gelir. Denetim: <code>GET 127.0.0.1:8796/health</code>.</p></details>
      <details><summary>Yerel ajan "bağlam yetersiz" diyor</summary><p class="ozet">Ollama 4096 bağlamla çalışıyor. Claude modeli seç ya da <code>zepul-gptoss-cpu</code> (32k) kullan.</p></details>
      <details><summary>.bat çıktısında Türkçe harfler bozuk</summary><p class="ozet">cmd + UTF-8 bu satırları bozar; .bat dosyaları ASCII kalmalı.</p></details>
      <details><summary>zepul-ai görevi 409 dönüyor</summary><p class="ozet">Orkestra 8820'de açık değil ya da şef yok. Kâtip notları kuyrukta bekler, kaybolmaz.</p></details>
    </div></div>
  </div>
</section>

<section id="sinirlar" hidden>
  <div class="ust"><div><h1 class="ekran">Sınırlar ve sıradakiler</h1></div></div>
  <h2>Bilinen riskler</h2>
  <div class="izgara" style="--min:260px">
    <div class="kart"><div class="satir"><h3 style="margin:0">Jev ücretsiz kotası (429)</h3><span class="rozet r-ciddi"><i></i>orta</span></div><p class="ozet" style="font-size:.86rem">Kota dolunca kapı yedek düzene geçer; Faz 3 araçlı canlı tekrarı ölçülemedi.</p><details><summary>Önlem</summary><p class="ozet">Claude ajanında yerleşik auto, yerel ajanda her riskli adım sana. Kalıcı çözüm <code>OPENCODE_API_KEY</code>.</p></details></div>
    <div class="kart"><div class="satir"><h3 style="margin:0">Yönlendirme ve DNS rebinding</h3><span class="rozet r-ciddi"><i></i>orta</span></div><p class="ozet" style="font-size:.86rem">Kapı yalnızca ilk web adresini denetler.</p><details><summary>Önlem</summary><p class="ozet">Yerel ajanda WebFetch/WebSearch her zaman sana gider; Claude ajanında Jev ve auto kalır.</p></details></div>
    <div class="kart"><div class="satir"><h3 style="margin:0">Ortam katmanı kesin değil</h3><span class="rozet r-ciddi"><i></i>orta</span></div><p class="ozet" style="font-size:.86rem">İşçi kendi betiğinde ortamı sıfırlayıp push deneyebilir.</p><details><summary>Önlem</summary><p class="ozet">GitHub main dal koruması: force push ve dal silme kapalı (K16).</p></details></div>
    <div class="kart"><div class="satir"><h3 style="margin:0">zepul-ai güven sınırı</h3><span class="rozet r-ciddi"><i></i>orta</span></div><p class="ozet" style="font-size:.86rem">orkestra_gorev onaysız; asistan okuduğu bir sayfadan etkilenip iş verebilir.</p><details><summary>Önlem</summary><p class="ozet">İş "orta güven" sayılır; riskliyse "Emin misin?" ile sana döner. Onay aracı modelde yok.</p></details></div>
    <div class="kart"><div class="satir"><h3 style="margin:0">Laya belirsizliği</h3><span class="rozet r-uyari"><i></i>izleniyor</span></div><p class="ozet" style="font-size:.86rem">Eşik geçişi 502 kayıtta 4 hataya dayanıyor.</p><details><summary>Önlem</summary><p class="ozet">Gölge haftası gerçek trafikte ölçer; karar Jev'de kalır, devralma senin onayınla.</p></details></div>
    <div class="kart"><div class="satir"><h3 style="margin:0">Yerel modellerin yavaşlığı</h3><span class="rozet r-uyari"><i></i>düşük</span></div><p class="ozet" style="font-size:.86rem">CPU'daki yerel işçide bir iş 2 saati aştı.</p><details><summary>Önlem</summary><p class="ozet">Test aşamasında tüm roller Sonnet; yerel ajana 3 kat uzun eşik ve tek yuva.</p></details></div>
  </div>
  <div class="iki" style="margin-top:12px">
    <div class="kart"><h3>Senin "en son" listen</h3><div id="son-liste"></div></div>
    <div class="kart"><h3>Sıradaki adımlar</h3><div id="siradaki"></div><h3 style="margin-top:12px">Laya devralma kararı</h3><p class="ozet" style="font-size:.86rem">Gölge haftası bitince uyum ≥ %90 ise onayın istenir. Ölçütler <a href="#laya">Laya</a> bölümünde.</p></div>
  </div>
  <h2>Kararlar <small id="kararlar-sayi"></small></h2>
  <input type="search" id="kararlar-ara" placeholder="Kararlarda ara: Laya, Fable, limit…" aria-label="Kararlarda ara">
  <div class="tablo kaydir" style="margin-top:8px"><table><thead><tr><th class="sag">Tur</th><th>Karar ve gerekçe</th></tr></thead><tbody id="karar-liste"></tbody></table></div>
</section>
</main>
</div>
<div id="ipucu" role="tooltip"></div>
<script type="application/json" id="veri">${veri}</script>
<script>(${istemci.toString()})();</script>
</body>
</html>
`;
}

function ozDenetim() {
  const D = topla({ testleriSay: process.env.ZEPUL_ARAC_TEST !== "1" }); // test/araclar.test.ts "1" verir: npm test içinden çağrılınca özyineleme olmasın
  const h = sayfa(D);
  const hatalar = [];
  const bekle = (k, m) => { if (!k) hatalar.push(m); };
  bekle(D.fazlar.length >= 9, `faz sayısı ${D.fazlar.length}`);
  bekle(D.hataAvi.length >= 14 && D.hataAvi[0].tur === 1 && D.hataAvi.at(-1).tur >= 14, "hata avı turları 1-14 değil");
  bekle(D.hataAvi.filter((t) => t.tur >= 2).every((t) => t.yuksek != null), "bir turun sayımı okunamadı");
  bekle(D.hataAvi.filter((t) => t.tur >= 2).every((t) => D.bulgular.filter((b) => b.av === t.tur).length === t.toplam), "tur bulgu satırları sayımla uyuşmuyor");
  bekle(D.karar && D.karar.toplam > 1000 && Object.values(D.karar.dagilim).reduce((a, b) => a + b, 0) === D.karar.toplam, "karar tablosu");
  bekle(D.laya.kosu.length === 8 && D.laya.kosu.at(-1).kappa > 0.8, "Laya koşuları");
  bekle(D.laya.karisiklik && Object.values(D.laya.karisiklik).flatMap(Object.values).reduce((a, b) => a + b, 0) === (D.laya.kosu.at(-1).n ?? -1), "karışıklık toplamı n ile uyuşmuyor");
  bekle(D.kabul.filter((k) => k.usd != null).length >= 10, "maliyet okunamadı");
  bekle(D.kabul.every((k) => k.hukumler.length), `hükümsüz rapor: ${D.kabul.filter((k) => !k.hukumler.length).map((k) => k.ad)}`);
  bekle(D.commit.sayi > 0 && D.test.toplam > 0, "commit/test sayısı");
  bekle(D.oneriler.length === 8 && D.istemler.length === 6, "taslak öneri/istem kaybı");
  bekle(D.modeller.every((m) => m.kod), "koddaki rol modelleri okunamadı");
  for (const m of OLGULAR.yerelModeller) bekle((oku(m.kaynak) ?? "").includes(m.iz), `olgu izi yok: ${m.kaynak} "${m.iz}"`);
  bekle(!/(src|href)="https?:/.test(h) && !/@import|url\(http/.test(h), "dış bağımlılık var");
  bekle((h.match(/<section id=/g) ?? []).length === 8, "8 bölüm yok");
  bekle(/ç/.test(h) && /ğ/.test(h) && /ı/.test(h) && /İ/.test(h) && /ö/.test(h) && /ş/.test(h) && /ü/.test(h), "Türkçe harf eksik");
  try { JSON.parse(h.split('<script type="application/json" id="veri">')[1].split("</script>")[0]); } catch (e) { hatalar.push("gömülü JSON bozuk: " + e.message); }
  try { new Function(`(${istemci.toString()})`); } catch (e) { hatalar.push("istemci kodu sözdizimi: " + e.message); }
  if (hatalar.length) { console.error("ÖZ-DENETİM KALDI:\n- " + hatalar.join("\n- ")); process.exit(1); }
  console.log(`öz-denetim geçti: ${D.fazlar.length} faz, ${D.hataAvi.length} hata avı turu, ${D.bulgular.length} bulgu, ${D.karar.toplam} karar satırı, ${D.kabul.length} kabul raporu, test ${D.test.toplam} (${D.test.kaynak}), ${D.commit.sayi} commit, sayfa ${(h.length / 1024).toFixed(0)} KB`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--test")) ozDenetim();
  else {
    const D = topla();
    fs.writeFileSync(CIKTI, sayfa(D), "utf8");
    console.log(`yazıldı: ${path.relative(REPO, CIKTI)} (test ${D.test.toplam}, ${D.commit.sayi} commit)`);
  }
}
