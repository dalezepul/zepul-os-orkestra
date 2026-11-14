// Periyodik log ve hata raporu: tek dosyalık, bağımlılıksız HTML üretir. Node 22, saf ESM, yalnızca stdlib.
// CLI:   node araclar/rapor.mjs [--saat 6] [--bildir] [--cikti raporlar/]
// Test:  node araclar/rapor.mjs --test   (ya da: node araclar/rapor.test.mjs)
// Modül: import { raporUret } from "./rapor.mjs"   → await raporUret({ saat: 6, cikti: "raporlar" })
// Kaynak loglar YALNIZCA okunur. Ayrıntı ve sunucuya bağlama talimatı: docs/rapor.md
import { createReadStream } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { bildir as ntfyBildir } from "./ntfy.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SAAT = 3_600_000;

export const KAYNAKLAR = ["ag", "pc", "claude-api", "arac", "ajan", "kapi"]; // + "bilinmiyor"
const ETIKET = { ag: "ağ", pc: "pc", "claude-api": "claude-api", arac: "araç", ajan: "ajan", kapi: "kapı", bilinmiyor: "bilinmiyor" };
const TR_KAYNAK = { "ağ": "ag", "araç": "arac", "kapı": "kapi" }; // KURALLAR I Türkçe yazar, panel-api ASCII

export function varsayilanYollar() {
  const ev = os.homedir();
  return {
    olaylar: path.join(REPO, "logs/olaylar.jsonl"),
    hatalar: path.join(REPO, "logs/hatalar.jsonl"),
    golge: path.join(REPO, "logs/laya-golge.jsonl"),
    nobetci: path.join(ev, ".nobetci-gunluk.jsonl"),
    // Claude Code proje klasörü adı: çalışma yolunda harf/rakam dışındaki her karakter "-" olur.
    oturumlar: path.join(ev, ".claude", "projects", REPO.replace(/[^A-Za-z0-9]/g, "-")),
  };
}

// ---------- Maskeleme ----------

const reKac = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
const dene = (f) => { try { return f(); } catch { return undefined; } };

// Bu makinenin kimliği çalışma zamanında okunur, koda yazılmaz. USERDOMAIN çoğu makinede makine adıdır.
const gercekKimlik = () => ({
  kullanici: [dene(() => os.userInfo().username), process.env.USERNAME],
  makine: [dene(() => os.hostname()), process.env.USERDOMAIN, process.env.COMPUTERNAME],
  ev: dene(() => os.homedir()),
});

const adDeseni = (adlar) => {
  const l = adlar.filter((a) => typeof a === "string" && a.trim().length >= 3).map((a) => reKac(a.trim()));
  return l.length ? new RegExp(`(?<![\\p{L}\\p{N}_-])(?:${l.join("|")})(?![\\p{L}\\p{N}_-])`, "giu") : null;
};

// Ev dizini öneki olduğu gibi `~` olur: boşluklu hesap adı (`C:\Users\Ali Veli`) genel kalıplara sığmaz.
// Biçimler: C:\Users\x, C:/Users/x, C:\\Users\\x (JSON), /c/Users/x, /mnt/c/Users/x ve Claude proje klasörü adı C--Users-x.
const evDeseni = (ev) => {
  const p = String(ev ?? "").split(/[\\/]+/).filter(Boolean);
  if (p.length < 2) return null; // "C:\" ya da "/" her şeyi silerdi
  const yol = (a) => a.map(reKac).join("[\\\\/]+");
  const bicim = /^[A-Za-z]:$/.test(p[0]) ? `(?:${p[0]}|/(?:mnt/)?${p[0][0]})[\\\\/]+${yol(p.slice(1))}` : `/${yol(p)}`;
  return new RegExp(`(?<![A-Za-z0-9])(?:${bicim}|${reKac(String(ev).replace(/[^A-Za-z0-9]/g, "-"))})(?![\\p{L}\\p{N}_])`, "giu");
};

// Sır, e-posta, kullanıcı dizini ve bu makinenin kullanıcı/makine adı raporda görünmez. `C:\Users\<ad>` → `~`, kullanıcı adı → `~`, makine adı → `<makine>`.
// Sözcük başı sınırı `\b` değil `(?<![A-Za-z0-9])`: `\b` alt çizgiyi sözcük karakteri sayar, `GH_TOKEN` / `ANTHROPIC_API_KEY` yakalanmaz.
// `kimlik` testte sahte hesapla denemek içindir; varsayılan `maskele` gerçek `os` değerlerini kullanır.
export function maskeleyici({ kullanici = [], makine = [], ev } = {}) {
  const evRe = evDeseni(ev), kulRe = adDeseni(kullanici), makRe = adDeseni(makine);
  return (s) => {
    let m = String(s ?? "");
    if (evRe) m = m.replace(evRe, "~");
    m = m
      .replace(/(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{8,}/g, "sk-***")
      .replace(/(?<![A-Za-z0-9])(gh[pousr]_|github_pat_)[A-Za-z0-9_]{8,}/g, "$1***")
      .replace(/(?<![A-Za-z0-9])xox[baprs]-[A-Za-z0-9-]{8,}/g, "xox-***")
      .replace(/(?<![A-Za-z0-9])Bearer\s+[\w.~+/=-]+/gi, "Bearer ***")
      .replace(/(?<![A-Za-z0-9])(api[_-]?key|token|secret|password|parola)(["']?\s*[=:]\s*)["']?[^\s"'&,}]+/gi, "$1$2***")
      .replace(/([?&](?:t|token)=)[\w.~-]+/g, "$1***")
      .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}\b/gi, "<eposta>")
      .replace(/[\\/]{2,}[^\\/\s"'`]+[\\/]+[a-z]\$[\\/]+users[\\/]+[^\\/\s"'`]+/gi, "~") // UNC: \\MAKINE\C$\Users\<ad>
      .replace(/\b[a-z]:[\\/]+users[\\/]+[^\\/\s"'`]+/gi, "~")
      .replace(/\b[a-z]--users-[^-\s\\/"'`]+/gi, "~") // Claude Code proje klasörü adı: C--Users-<ad>-Desktop-…
      .replace(/(^|[\s"'`=(:;])\/(?:mnt\/)?(?:[a-z]\/)?(?:users|home)\/[^/\s"'`]+/gi, "$1~"); // Git Bash /c/Users/<ad>, WSL /mnt/c/Users/<ad>, PATH içi :/c/Users/<ad>
    if (kulRe) m = m.replace(kulRe, "~");
    if (makRe) m = m.replace(makRe, "<makine>");
    return m;
  };
}
export const maskele = maskeleyici(gercekKimlik());

const kirp = (s, n = 300) => { const t = maskele(s).replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// ---------- Sınıflandırıcı ----------
// Kural: [desen, kaynak, tur_adi, geri_alinabilir, devam_edilebilir, oneri]. Sırayla denenir, ilk eşleşen kazanır.
// Desen `tur_adi + mesaj` üzerinde aranır. Sıra önemli: ağ, sağlayıcı, araç.
const KURALLAR = [
  [/ETIMEDOUT|timed? ?out|zaman aşımı/i, "ag", "zaman_asimi", "evet", "evet", "Ağı kontrol et; sürerse zaman aşımını artır"],
  [/ECONNRESET|socket hang up|EPIPE/i, "ag", "baglanti_koptu", "evet", "evet", "Yeniden dene; sürerse ağı kontrol et"],
  [/ECONNREFUSED|ENOTFOUND|EAI_AGAIN/i, "ag", "baglanti_kurulamadi", "evet", "evet", "Hedef servis ayakta mı, DNS çalışıyor mu bak"],
  [/fetch failed/i, "ag", "fetch_hatasi", "evet", "evet", "Adresi ve ağı kontrol et; yeniden dene"],
  [/rate[_ ]?limit|\b(?:HTTP|status)\D{0,3}429\b/i, "claude-api", "rate_limit", "evet", "evet", "Limit sıfırlanınca devam et"],
  [/overloaded|\b(?:HTTP|status)\D{0,3}529\b/i, "claude-api", "asiri_yuk", "evet", "evet", "Birkaç dakika sonra yeniden dene"],
  [/authentication_failed|invalid_api_key|\b(?:HTTP|status)\D{0,3}401\b/i, "claude-api", "kimlik_hatasi", "evet", "hayir", "Oturumu ya da kimliği yenile"],
  [/\b(?:HTTP|status)\D{0,3}5\d\d\b|\b5\d\d (?:Internal|Bad Gateway|Service Unavailable|Gateway)|server_error|api_error/i, "claude-api", "http_5xx", "evet", "evet", "Sağlayıcı hatası; yeniden dene"],
  [/No such tool|tool_use_error/i, "arac", "arac_yok", "evet", "evet", "Araç adını ve aracın yüklü olduğunu kontrol et"],
  [/Exit code \d+/i, "arac", "komut_hatasi", "evet", "evet", "Komut çıktısını oku; tekrarlıyorsa kurala ya da skill'e çevir"],
  [/ENOENT|EACCES|EPERM/i, "arac", "dosya_erisim_hatasi", "evet", "evet", "Yolu ve izinleri kontrol et"],
];

const evetHayir = (v, varsayilan) => (v === true || v === "evet" ? "evet" : v === false || v === "hayir" || v === "hayır" ? "hayir" : varsayilan);

// Ham hata kaydını ortak biçime çevirir: {ts, kaynak, tur_adi, mesaj, geri_alinabilir, devam_edilebilir, oneri, baglam}.
// Açıkça yazılmış geçerli `kaynak` korunur; yoksa kurallar denenir; hiçbiri uymazsa `vars` (çağıranın bağlamı) ya da "bilinmiyor".
export function sinifla(k, vars = {}) {
  const acik = TR_KAYNAK[k.kaynak] ?? k.kaynak;
  const ham = String(k.mesaj ?? "");
  const kural = KURALLAR.find(([re]) => re.test(`${k.tur_adi ?? ""} ${/^Exit code \d+/.test(ham) ? ham.slice(0, 200) : ham.slice(0, 1000)}`));
  const baglam = Object.fromEntries(Object.entries(k.baglam ?? {}).map(([a, b]) => [a, typeof b === "string" ? kirp(b, 200) : b]));
  return {
    ts: k.ts,
    kaynak: KAYNAKLAR.includes(acik) ? acik : kural?.[1] ?? vars.kaynak ?? "bilinmiyor",
    tur_adi: k.tur_adi ?? kural?.[2] ?? vars.tur_adi ?? "bilinmiyor",
    mesaj: kirp(k.mesaj),
    geri_alinabilir: evetHayir(k.geri_alinabilir, kural?.[3] ?? "evet"),
    devam_edilebilir: evetHayir(k.devam_edilebilir, kural?.[4] ?? "evet"),
    oneri: kirp(k.oneri ?? kural?.[5] ?? "Elle incele", 200),
    baglam,
  };
}

// Nöbetçi (pc-gunlugu) kaydı: hep kaynak "pc". Kullanıcının kendi kapatması ve kapanma fotoğrafı hata sayılmaz (baglam.hata=false).
export function siniflaNobetci(k) {
  const t = Date.parse(k.zaman);
  let tur_adi, gal = "hayir", dev = "hayir", oneri, hata = true;
  if (k.tur === "iptal") {
    tur_adi = /yeniden/i.test(k.ne ?? k.metin ?? "") ? "yeniden_baslatma_iptali" : "kapatma_iptali";
    [gal, dev, oneri] = ["evet", "evet", "Nöbetçi engelledi; isteği kimin yaptığına bak; güncelleme gerekiyorsa iptal_yeniden kapatılır"];
  } else if (k.tur === "iptal-olmadi") {
    [tur_adi, oneri] = ["iptal_basarisiz", "Kapanma engellenemedi; açık işleri ve oturumları denetle"];
  } else if (k.tur === "acilis" && k.kullanici_mi === false) {
    [tur_adi, oneri] = ["beklenmedik_kapanma", "Kapatan süreci bul; ölen ajanlara diriltme mesajı gönder"];
  } else {
    hata = false;
    [tur_adi, gal, dev, oneri] = [{ acilis: "kullanici_kapatmasi", kapanma: "kapanma_fotografi", izinli: "izinli_kapanma" }[k.tur] ?? "nobetci_kaydi", "evet", "evet", "İşlem gerekmez"];
  }
  return {
    ts: Number.isFinite(t) ? new Date(t).toISOString() : undefined,
    kaynak: "pc", tur_adi, mesaj: kirp(k.metin), geri_alinabilir: gal, devam_edilebilir: dev, oneri,
    baglam: { hata, nobetci_tur: k.tur, sonuc: k.sonuc ?? null, surec: k.surec ? kirp(k.surec, 160) : null },
  };
}

// ---------- Okuma ----------

// Satır satır akış. Dosya bellekte tutulmaz (oturum kayıtları onlarca MB olabilir).
// Satır başındaki BOM (U+FEFF) soyulur: `trim()` onu boşluk sayar ama JSON.parse reddeder, ilk kayıt sessizce kaybolurdu.
// Bozuk satır (JSON olmayan ya da nesne olmayan) atlanır ve `sayac.bozuk` artar; boş satır bozuk sayılmaz.
async function* jsonl(yol, sayac = { bozuk: 0 }) {
  const rl = readline.createInterface({ input: createReadStream(yol, "utf8"), crlfDelay: Infinity });
  for await (const s of rl) {
    const t = s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s;
    if (!t.trim()) continue;
    let o;
    try { o = JSON.parse(t); } catch { /* bozuk satır */ }
    if (o && typeof o === "object") yield o; else sayac.bozuk++;
  }
}
const dolu = async (yol) => { try { return (await stat(yol)).size > 0; } catch { return false; } };
const zaman = (v) => { const t = typeof v === "string" ? Date.parse(v) : NaN; return Number.isFinite(t) ? t : NaN; };
const medyan = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const yuzde = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);

const metinOf = (c) => (typeof c === "string" ? c : Array.isArray(c) ? c.map((b) => (b?.type === "text" ? b.text : "")).join(" ") : "");
// Kullanıcının ya da planın reddettiği çağrı araç hatası değildir.
const REDDI = /doesn.t want to proceed|tool use was rejected|plan mode|user rejected|permission.{0,40}denied|denied.{0,40}permission|reddedildi/i;

async function oturumDosyalari(dizin, bas) {
  let girdiler;
  try { girdiler = await readdir(dizin, { withFileTypes: true }); } catch { return []; }
  const adaylar = [];
  for (const e of girdiler) {
    const p = path.join(dizin, e.name);
    if (e.isFile() && e.name.endsWith(".jsonl")) adaylar.push(p);
    else if (e.isDirectory() && e.name !== "memory") {
      try { for (const s of await readdir(path.join(p, "subagents"))) if (s.endsWith(".jsonl")) adaylar.push(path.join(p, "subagents", s)); } catch { /* alt ajan klasörü yok */ }
    }
  }
  const out = [];
  for (const f of adaylar) { try { if ((await stat(f)).mtimeMs >= bas) out.push(f); } catch { /* kayboldu */ } }
  return { toplam: adaylar.length, dosyalar: out };
}

export const ETIKET_AD = { ana: "ana", "alt-ajan": "alt ajan", orkestra: "orkestra", denetci: "denetçi", test: "test" };
const AYRI_ETIKET = new Set(["denetci", "test"]);
const DENETCI = /reality checker|auditor|denet|kabul|hata av/i;
async function oturumEtiketi(f, giris, oturumId, orkestraOturum) {
  if (giris === "sdk-cli") return orkestraOturum.has(oturumId) ? "orkestra" : "test";
  if (path.basename(path.dirname(f)) !== "subagents") return "ana";
  try {
    const m = JSON.parse(await readFile(f.replace(/\.jsonl$/, ".meta.json"), "utf8"));
    return DENETCI.test(`${m.agentType ?? ""} ${m.description ?? ""}`) ? "denetci" : "alt-ajan";
  } catch { return "alt-ajan"; } // meta yok ya da bozuk
}

// ---------- Toplama ----------

const golgeBos = () => ({ n: 0, uyum: 0, matris: {}, jev: [], laya: [] });
function golgeEkle(s, o) {
  const j = o.jev?.secim ?? "?", l = o.laya?.secim ?? "?";
  s.n++;
  if (o.uyum === true || (o.uyum === undefined && j === l)) s.uyum++;
  const satir = (s.matris[j] ??= {});
  satir[l] = (satir[l] ?? 0) + 1;
  if (Number.isFinite(o.jev_ms)) s.jev.push(o.jev_ms);
  if (Number.isFinite(o.laya_ms)) s.laya.push(o.laya_ms);
}

export async function topla({ saat = 6, simdi = Date.now(), kaynaklar = {} } = {}) {
  const y = { ...varsayilanYollar(), ...kaynaklar };
  const bas = simdi - saat * SAAT;
  const iceride = (t) => t >= bas && t <= simdi;
  const durum = {}; // ad → {var, kayit (dosyadaki dolu satır ya da dosya), aralik}
  const hatalar = [], gorulen = new Set(), pc = [];
  const kapi = { izin: 0, red: 0, insan: 0, gec: 0 };
  let jevKapi = 0;
  const maliyetAnahtar = new Map(); // "<sunucu oturumu>|<ajan>" → birikimli USD (sunucu yeniden başlayınca sayaç sıfırlanır)
  const aracAd = new Map(), yavasAraclar = []; // arac_id → araç adı; sure_ms taşıyan arac_sonuc'lar
  const golge = { pencere: golgeBos(), tumu: golgeBos() };
  const oturum = { dosya: 0, kayit: 0, reddedilen: 0, hatalar: [], ayri: [], etiket: {} };
  const orkestraOturum = new Set(); // olaylar.jsonl maliyet olaylarındaki SDK session_id'ler

  const hataEkle = (ham, vars) => {
    const anahtar = ham.id ?? `${ham.ts}|${ham.tur_adi}|${ham.mesaj}`; // olaylar.jsonl ve hatalar.jsonl aynı olayı iki kez tutar
    if (gorulen.has(anahtar)) return null;
    gorulen.add(anahtar);
    const h = sinifla(ham, vars);
    hatalar.push(h);
    return h;
  };
  const kaynakDurumu = async (ad, yol) => (durum[ad] = { var: await dolu(yol), kayit: 0, aralik: 0, bozuk: 0 });

  if ((await kaynakDurumu("logs/olaylar.jsonl", y.olaylar)).var) {
    const d = durum["logs/olaylar.jsonl"];
    for await (const o of jsonl(y.olaylar, d)) {
      d.kayit++;
      if (typeof o.oturum === "string") orkestraOturum.add(o.oturum); // aralık dışı da: oturum dosyası aralıkta olabilir
      if (o.tur === "arac") aracAd.set(o.arac_id, o.arac);
      else if (o.tur === "arac_sonuc" && Number.isFinite(o.sure_ms) && iceride(zaman(o.ts))) yavasAraclar.push({ arac: aracAd.get(o.arac_id) ?? "?", ajan: o.ajan, sure_ms: o.sure_ms, ts: o.ts });
      if (!iceride(zaman(o.ts))) continue;
      d.aralik++;
      if (o.tur === "hata") hataEkle({ ...o, baglam: { ajan: o.ajan, ...(o.baglam ?? {}) } });
      else if (o.tur === "kapi") {
        const k = o.alt_karar ?? o.karar; // sunucu gec'i panele "izin" yayar; asıl karar alt_karar'da
        kapi[k] = (kapi[k] ?? 0) + 1;
        if (/Jev erişilemedi/.test(o.neden ?? "")) jevKapi++;
      } else if (o.tur === "maliyet" && Number.isFinite(o.maliyet_usd)) {
        const a = `${String(o.id ?? "").split("-")[1] ?? "?"}|${o.ajan}`;
        maliyetAnahtar.set(a, { usd: Math.max(maliyetAnahtar.get(a)?.usd ?? 0, o.maliyet_usd), olay: (maliyetAnahtar.get(a)?.olay ?? 0) + 1 });
      }
    }
  }

  if ((await kaynakDurumu("logs/hatalar.jsonl", y.hatalar)).var) {
    const d = durum["logs/hatalar.jsonl"];
    for await (const o of jsonl(y.hatalar, d)) {
      d.kayit++;
      if (!iceride(zaman(o.ts))) continue;
      d.aralik++;
      hataEkle({ ...o, baglam: { ajan: o.ajan, ...(o.baglam ?? {}) } });
    }
  }

  if ((await kaynakDurumu("logs/laya-golge.jsonl", y.golge)).var) {
    const d = durum["logs/laya-golge.jsonl"];
    for await (const o of jsonl(y.golge, d)) {
      d.kayit++;
      golgeEkle(golge.tumu, o);
      if (iceride(zaman(o.ts))) { d.aralik++; golgeEkle(golge.pencere, o); }
    }
  }

  if ((await kaynakDurumu("~/.nobetci-gunluk.jsonl", y.nobetci)).var) {
    const d = durum["~/.nobetci-gunluk.jsonl"];
    for await (const o of jsonl(y.nobetci, d)) {
      d.kayit++;
      if (!iceride(zaman(o.zaman))) continue; // zaman: yerel saat, saat dilimsiz; Date.parse yerel saat sayar
      d.aralik++;
      const k = siniflaNobetci(o);
      pc.push(k);
      if (k.baglam.hata) hatalar.push(k);
    }
  }

  // Claude Code oturum kayıtları: yalnızca hata sinyalleri çıkarılır.
  const od = (durum["~/.claude/projects/<zepul-os>/*.jsonl"] = { var: false, kayit: 0, aralik: 0, bozuk: 0 });
  const { toplam: oturumToplam = 0, dosyalar = [] } = (await oturumDosyalari(y.oturumlar, bas)) || {};
  od.var = oturumToplam > 0;
  oturum.dosya = dosyalar.length;
  for (const f of dosyalar) {
    const aracAdi = new Map();
    const yerel = []; // [ham, vars]: etiket dosya bitince belli olur
    let giris, oturumId, reddedilen = 0;
    for await (const o of jsonl(f, od)) {
      od.kayit++;
      giris ??= o.entrypoint;
      oturumId ??= o.sessionId;
      const c = o.message?.content;
      if (o.type === "assistant" && Array.isArray(c)) for (const b of c) if (b?.type === "tool_use") aracAdi.set(b.id, b.name);
      const t = zaman(o.timestamp);
      if (!iceride(t)) continue;
      od.aralik++;
      const baglam = { oturum: String(o.sessionId ?? "").slice(0, 8), ajan: o.agentId ? String(o.agentId).slice(0, 8) : "ana" };
      const ekle = (ham, vars) => yerel.push([{ ts: o.timestamp, ...ham, baglam: { ...baglam, ...(ham.baglam ?? {}) } }, vars]);
      if (o.type === "assistant" && (o.isApiErrorMessage || o.error)) {
        ekle({ tur_adi: typeof o.error === "string" ? o.error : undefined, mesaj: metinOf(c) || String(o.error) }, { kaynak: "claude-api", tur_adi: "api_hatasi" });
      } else if (o.type === "system" && (o.error || /^api_(error|retry)/.test(o.subtype ?? ""))) {
        ekle({ tur_adi: o.subtype, mesaj: String(o.error?.message ?? o.error ?? o.content ?? o.subtype) }, { kaynak: "claude-api", tur_adi: "api_hatasi" });
      } else if (o.type === "system" && o.hookErrors?.length) {
        ekle({ mesaj: o.hookErrors.join("; ") }, { kaynak: "ajan", tur_adi: "hook_hatasi" });
      } else if (o.type === "user" && Array.isArray(c)) {
        for (const b of c) {
          if (b?.type !== "tool_result" || !b.is_error) continue;
          const m = metinOf(b.content);
          if (o.toolDenialKind || REDDI.test(m.slice(0, 300))) { reddedilen++; continue; }
          ekle({ mesaj: m, baglam: { arac: aracAdi.get(b.tool_use_id) ?? "?", cikis_kodu: /^Exit code (\d+)/.exec(m)?.[1] } }, { kaynak: "arac", tur_adi: "arac_hatasi" });
        }
      }
    }
    const etiket = await oturumEtiketi(f, giris, oturumId, orkestraOturum);
    oturum.etiket[etiket] = (oturum.etiket[etiket] ?? 0) + 1;
    const sayilir = !AYRI_ETIKET.has(etiket);
    if (sayilir) oturum.reddedilen += reddedilen;
    for (const [ham, vars] of yerel) {
      ham.baglam.etiket = etiket;
      if (!sayilir) { oturum.ayri.push(sinifla(ham, vars)); continue; } // denetçi ve test: ayrı etiket, toplama girmez
      const h = hataEkle(ham, vars);
      if (h) oturum.hatalar.push(h);
    }
  }

  // Maliyet: ajan başına, (sunucu oturumu, ajan) çiftlerinin birikimli tutarlarının toplamı.
  const maliyet = new Map();
  for (const [a, v] of maliyetAnahtar) {
    const ajan = a.split("|").slice(1).join("|");
    const m = maliyet.get(ajan) ?? { usd: 0, olay: 0 };
    maliyet.set(ajan, { usd: m.usd + v.usd, olay: m.olay + v.olay });
  }

  for (const l of [hatalar, oturum.hatalar, oturum.ayri]) l.sort((a, b) => zaman(a.ts) - zaman(b.ts));
  return { bas, simdi, saat, durum, hatalar, pc, kapi, jevKapi, yavas: yavasAraclar.sort((a, b) => b.sure_ms - a.sure_ms).slice(0, 10), maliyet: [...maliyet].map(([ajan, v]) => ({ ajan, ...v })).sort((a, b) => b.usd - a.usd), golge, oturum };
}

// ---------- Özet ----------

const say = (liste, f) => liste.reduce((m, x) => ((m[f(x)] = (m[f(x)] ?? 0) + 1), m), {});

export function ozetle(t) {
  const kaynak = Object.fromEntries([...KAYNAKLAR, "bilinmiyor"].map((k) => [k, 0]));
  for (const h of t.hatalar) kaynak[h.kaynak]++;
  const turler = Object.entries(say(t.hatalar, (h) => h.tur_adi)).map(([tur_adi, adet]) => ({
    tur_adi, adet,
    kaynaklar: [...new Set(t.hatalar.filter((h) => h.tur_adi === tur_adi).map((h) => h.kaynak))],
    ornek: t.hatalar.findLast((h) => h.tur_adi === tur_adi).mesaj,
  })).sort((a, b) => b.adet - a.adet);
  const jevErisim = Math.max(t.jevKapi, t.hatalar.filter((h) => /Jev (geçidini|bağlantısını)/.test(h.oneri)).length);
  return {
    saat: t.saat, toplam: t.hatalar.length, kaynak,
    geriAlinamaz: t.hatalar.filter((h) => h.geri_alinabilir === "hayir").length,
    devamEdilemez: t.hatalar.filter((h) => h.devam_edilebilir === "hayir").length,
    enSik: turler.slice(0, 5),
    dikkat: turler.filter((x) => x.adet >= 3), // KURALLAR J: aynı tur_adi 3+ kez → skill'e ya da kurala çevir
    kapi: t.kapi, jevMedyanMs: medyan(t.golge.pencere.jev), jevErisimHatasi: jevErisim,
    golgeToplam: t.golge.tumu.n, golgePencere: t.golge.pencere.n,
    uyumOrani: yuzde(t.golge.pencere.uyum, t.golge.pencere.n), uyumOraniTumu: yuzde(t.golge.tumu.uyum, t.golge.tumu.n),
    maliyetToplam: t.maliyet.reduce((s, m) => s + m.usd, 0),
    pcOlay: t.pc.length, oturumHata: t.oturum.hatalar.length, reddedilen: t.oturum.reddedilen,
  };
}

// ntfy: tek satır, yalnızca sayılar; yol ya da kişisel ayrıntı yok. Geri alınamaz hata varsa başlık "uyarı".
export function bildirMetni(o) {
  const k = Object.entries(o.kaynak).filter(([, n]) => n).map(([a, n]) => `${a} ${n}`).join(", ") || "yok";
  return {
    baslik: `Zepul OS: ${o.geriAlinamaz ? "uyarı" : "bilgilendirme"}: log raporu`,
    mesaj: `Son ${o.saat} sa: ${o.toplam} hata (${k}), geri alınamaz ${o.geriAlinamaz}, devam edilemez ${o.devamEdilemez}, kapı izin ${o.kapi.izin} red ${o.kapi.red} insan ${o.kapi.insan} geç ${o.kapi.gec}`,
  };
}

// ---------- HTML ----------

const TEMA_KOYU = "--bg:#0f1318;--kart:#171c23;--yazi:#e6e9ed;--soluk:#9aa5b1;--cizgi:#29323d;--vurgu:#7aa2ff;--ok:#4cc38a;--kotu:#ff7b72;--ag:#5b93f0;--pc:#f0a04b;--api:#b48af0;--arac:#3cc4b0;--ajan:#f078b4;--kapi:#d8b84a;--bil:#8f99a5;";
const CSS = `
:root{--bg:#f5f6f8;--kart:#fff;--yazi:#1b1f24;--soluk:#5b6570;--cizgi:#e0e4ea;--vurgu:#2457d6;--ok:#1a7f45;--kotu:#c62d22;--ag:#2f6fdb;--pc:#c9701a;--api:#8a4fd1;--arac:#12867a;--ajan:#c93a80;--kapi:#9a7a10;--bil:#6f7a86;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){${TEMA_KOYU}}}
:root[data-theme="dark"]{${TEMA_KOYU}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--yazi);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans",sans-serif}
main{max-width:1100px;margin:0 auto;padding:16px}
header{display:flex;gap:12px;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;margin-bottom:8px}
h1{margin:0;font-size:1.4rem}h2{margin:28px 0 10px;font-size:1.1rem}
.soluk{color:var(--soluk);font-size:.85rem}
button,select{font:inherit;color:var(--yazi);background:var(--kart);border:1px solid var(--cizgi);border-radius:8px;padding:6px 12px;cursor:pointer}
.izgara{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
.kart{background:var(--kart);border:1px solid var(--cizgi);border-radius:12px;padding:14px;min-width:0}
.kart h3{margin:0 0 6px;font-size:.8rem;font-weight:600;color:var(--soluk);text-transform:uppercase;letter-spacing:.03em}
.sayi{font-size:2rem;font-weight:700;line-height:1.1;font-variant-numeric:tabular-nums}
.kotu{color:var(--kotu)}.ok{color:var(--ok)}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}
.chip{border:1px solid var(--cizgi);border-radius:999px;padding:2px 10px;font-size:.8rem;background:var(--kart)}
.chip.yok{color:var(--soluk);border-style:dashed}
.nokta{display:inline-block;width:.7em;height:.7em;border-radius:50%;margin-right:6px;background:var(--bil)}
.k-ag{--r:var(--ag)}.k-pc{--r:var(--pc)}.k-claude-api{--r:var(--api)}.k-arac{--r:var(--arac)}.k-ajan{--r:var(--ajan)}.k-kapi{--r:var(--kapi)}.k-bilinmiyor{--r:var(--bil)}
.nokta[class*="k-"],.seg{background:var(--r)}
.satir{display:flex;align-items:center;gap:8px;margin:4px 0;font-size:.9rem}
.satir b{margin-left:auto;font-variant-numeric:tabular-nums}
.cubuk{flex:1;height:8px;background:var(--cizgi);border-radius:4px;overflow:hidden;min-width:40px}
.cubuk i{display:block;height:100%;background:var(--r,var(--vurgu))}
ol,ul{margin:6px 0;padding-left:1.2rem}li{margin:3px 0}
.kap{overflow-x:auto;border:1px solid var(--cizgi);border-radius:12px;background:var(--kart)}
table{border-collapse:collapse;width:100%;font-size:.85rem}
th,td{padding:7px 10px;text-align:left;border-bottom:1px solid var(--cizgi);vertical-align:top}
th{color:var(--soluk);font-weight:600;white-space:nowrap}tr:last-child td{border-bottom:0}
td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
td.kod{font-family:ui-monospace,"Cascadia Code",Consolas,"Courier New",monospace;font-size:.8rem;white-space:nowrap}
.kosegen{font-weight:700;background:color-mix(in srgb,var(--ok) 18%,transparent)}
.dim{opacity:.6}
.grafik{display:flex;align-items:flex-end;gap:2px;height:160px;padding:8px 8px 26px;background:var(--kart);border:1px solid var(--cizgi);border-radius:12px;overflow:visible}
.col{flex:1;min-width:0;height:100%;display:flex;flex-direction:column-reverse;position:relative}
.col .seg{width:100%;min-height:2px}
.col .e{position:absolute;bottom:-20px;left:50%;transform:translateX(-50%);font-size:.65rem;color:var(--soluk);white-space:nowrap}
.yok-not{color:var(--soluk);font-style:italic}
@media (max-width:520px){main{padding:12px}.sayi{font-size:1.6rem}}
`;

const JS = `(()=>{const r=document.documentElement;
try{const v=localStorage.getItem("tema");if(v)r.dataset.theme=v}catch{}
document.getElementById("tema").onclick=()=>{const koyu=r.dataset.theme?r.dataset.theme==="dark":matchMedia("(prefers-color-scheme: dark)").matches;const v=koyu?"light":"dark";r.dataset.theme=v;try{localStorage.setItem("tema",v)}catch{}};
const s=document.getElementById("suz");if(s)s.onchange=()=>document.querySelectorAll("#hatatablo tbody tr").forEach(t=>{t.hidden=!!s.value&&t.dataset.k!==s.value});})();`;

const tarih = (t, uzun = false) => new Date(t).toLocaleString("tr-TR", uzun ? { dateStyle: "short", timeStyle: "short" } : { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
const nokta = (k) => `<span class="nokta k-${esc(k)}" aria-hidden="true"></span>`;
const yokNotu = (ad) => `<p class="yok-not">kaynak yok: ${esc(ad)}</p>`;
const sec = (baslik, icerik) => `<section><h2>${esc(baslik)}</h2>${icerik}</section>`;
const tablo = (basliklar, satirlar, id = "") => `<div class="kap"><table${id ? ` id="${id}"` : ""}><thead><tr>${basliklar.map((b) => `<th${b.startsWith("#") ? ' class="n"' : ""}>${esc(b.replace(/^#/, ""))}</th>`).join("")}</tr></thead><tbody>${satirlar.join("")}</tbody></table></div>`;
const cubukSatir = (etiket, n, toplam, kaynak) => `<div class="satir${kaynak ? ` k-${esc(kaynak)}` : ""}">${kaynak ? nokta(kaynak) : ""}<span>${esc(etiket)}</span><span class="cubuk"><i style="width:${yuzde(n, toplam)}%"></i></span><b>${n}</b></div>`;

function zamanCizelgesi(t) {
  const gunluk = t.saat > 72, adim = (gunluk ? 24 : 1) * SAAT;
  const ilk = new Date(t.bas); gunluk ? ilk.setHours(0, 0, 0, 0) : ilk.setMinutes(0, 0, 0);
  const kovaSayisi = Math.floor((t.simdi - ilk.getTime()) / adim) + 1;
  const kovalar = Array.from({ length: kovaSayisi }, () => ({}));
  for (const h of t.hatalar) {
    const i = Math.min(kovaSayisi - 1, Math.max(0, Math.floor((zaman(h.ts) - ilk.getTime()) / adim)));
    kovalar[i][h.kaynak] = (kovalar[i][h.kaynak] ?? 0) + 1;
  }
  const enCok = Math.max(1, ...kovalar.map((k) => Object.values(k).reduce((a, b) => a + b, 0)));
  const aralik = Math.ceil(kovaSayisi / 8);
  const sutunlar = kovalar.map((k, i) => {
    const bas = new Date(ilk.getTime() + i * adim);
    const etiket = adim >= 24 * SAAT ? bas.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit" }) : bas.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
    const toplam = Object.values(k).reduce((a, b) => a + b, 0);
    const parcalar = Object.entries(k).map(([kay, n]) => `<div class="seg k-${esc(kay)}" style="height:${(n / enCok) * 100}%"></div>`).join("");
    return `<div class="col" title="${esc(etiket)}: ${toplam} hata${toplam ? " (" + Object.entries(k).map(([a, n]) => `${ETIKET[a]} ${n}`).join(", ") + ")" : ""}">${parcalar}${i % aralik === 0 ? `<span class="e">${esc(etiket)}</span>` : ""}</div>`;
  }).join("");
  const gosterge = [...KAYNAKLAR, "bilinmiyor"].filter((k) => t.hatalar.some((h) => h.kaynak === k)).map((k) => `<span class="chip">${nokta(k)}${esc(ETIKET[k])}</span>`).join("");
  const enCokNotu = `<span class="soluk">en yüksek sütun: ${enCok} hata</span>`;
  return `<div class="grafik" role="img" aria-label="${adim >= 24 * SAAT ? "Günlük" : "Saatlik"} hata sayısı, en yüksek ${enCok}">${sutunlar}</div><div class="chips">${gosterge || '<span class="soluk">Aralıkta hata yok.</span>'}${gosterge ? enCokNotu : ""}</div>`;
}

const matrisTablosu = (m) => {
  const sira = ["guvenli", "riskli", "geri-alinamaz", "belirsiz"];
  const hepsi = new Set([...Object.keys(m), ...Object.values(m).flatMap(Object.keys)]);
  const siniflar = [...sira.filter((s) => hepsi.has(s)), ...[...hepsi].filter((s) => !sira.includes(s)).sort()];
  return tablo(["Jev ↓ / Laya →", ...siniflar.map((s) => "#" + s)], siniflar.map((j) => `<tr><th scope="row">${esc(j)}</th>${siniflar.map((l) => `<td class="n${j === l && m[j]?.[l] ? " kosegen" : ""}">${m[j]?.[l] ?? 0}</td>`).join("")}</tr>`));
};

export function htmlUret(t, o, uretim = new Date()) {
  const durumChip = Object.entries(t.durum).map(([ad, d]) => `<span class="chip${d.var ? "" : " yok"}">${esc(ad)}: ${d.var ? `${d.aralik}/${d.kayit} kayıt${d.bozuk ? `, ${d.bozuk} bozuk satır atlandı` : ""}` : "kaynak yok"}</span>`).join("");
  const varMi = (ad) => t.durum[ad]?.var;
  const kap = t.kapi, kapiToplam = kap.izin + kap.red + kap.insan + kap.gec;
  const g = t.golge;
  const ilkHatalar = [...t.hatalar].reverse();
  const hataSatiri = (h) => `<tr data-k="${esc(h.kaynak)}"><td>${esc(tarih(h.ts))}</td><td>${nokta(h.kaynak)}${esc(ETIKET[h.kaynak])}</td><td class="kod">${esc(h.tur_adi)}</td><td>${esc(h.mesaj)}</td><td>${h.geri_alinabilir}</td><td>${h.devam_edilebilir}</td><td>${esc(h.oneri)}</td></tr>`;
  const oturumGruplari = Object.entries(say(t.oturum.hatalar, (h) => `${h.tur_adi}|${h.baglam.arac ?? "-"}`)).sort((a, b) => b[1] - a[1]);
  const gecerliKaynaklar = [...KAYNAKLAR, "bilinmiyor"].filter((k) => o.kaynak[k]);

  const kartlar = `<div class="izgara">
<div class="kart"><h3>Toplam hata</h3><div class="sayi">${o.toplam}</div><div class="soluk">Son ${t.saat} saat</div></div>
<div class="kart"><h3>Geri alınamaz</h3><div class="sayi ${o.geriAlinamaz ? "kotu" : "ok"}">${o.geriAlinamaz}</div></div>
<div class="kart"><h3>Devam edilemez</h3><div class="sayi ${o.devamEdilemez ? "kotu" : "ok"}">${o.devamEdilemez}</div></div>
<div class="kart"><h3>Kaynağa göre</h3>${[...KAYNAKLAR, "bilinmiyor"].map((k) => cubukSatir(ETIKET[k], o.kaynak[k], o.toplam, k)).join("")}</div>
<div class="kart"><h3>En sık 5 hata</h3>${o.enSik.length ? `<ol>${o.enSik.map((x) => `<li><code>${esc(x.tur_adi)}</code> × ${x.adet} <span class="soluk">(${esc(x.kaynaklar.map((k) => ETIKET[k]).join(", "))})</span></li>`).join("")}</ol>` : '<span class="soluk">Hata yok.</span>'}</div>
</div>`;

  const kapiHtml = !varMi("logs/olaylar.jsonl") ? yokNotu("logs/olaylar.jsonl") : `<div class="izgara"><div class="kart"><h3>Karar dağılımı (${kapiToplam})</h3>${["izin", "red", "insan", "gec"].map((k) => cubukSatir(k, kap[k], kapiToplam)).join("")}</div>
<div class="kart"><h3>Jev medyan süre</h3><div class="sayi">${o.jevMedyanMs == null ? "—" : Math.round(o.jevMedyanMs) + " ms"}</div><div class="soluk">${varMi("logs/laya-golge.jsonl") ? `${o.golgePencere} gölge kaydından` : "kaynak yok: logs/laya-golge.jsonl"}</div></div>
<div class="kart"><h3>Jev erişim hatası</h3><div class="sayi ${o.jevErisimHatasi ? "kotu" : "ok"}">${o.jevErisimHatasi}</div></div></div>`;

  const layaHtml = !varMi("logs/laya-golge.jsonl") ? yokNotu("logs/laya-golge.jsonl") : `<div class="izgara"><div class="kart"><h3>Jev–Laya uyum oranı</h3><div class="sayi">%${o.uyumOrani}</div><div class="soluk">Aralık: ${g.pencere.n} örnek · Tümü: %${o.uyumOraniTumu}</div></div>
<div class="kart"><h3>Toplam etiketli örnek</h3><div class="sayi">${o.golgeToplam}</div><div class="soluk">Jev etiketi olan gölge kayıtları</div></div>
<div class="kart"><h3>Medyan süre</h3><div class="soluk">Jev ${medyan(g.tumu.jev) == null ? "—" : Math.round(medyan(g.tumu.jev)) + " ms"} · Laya ${medyan(g.tumu.laya) == null ? "—" : Math.round(medyan(g.tumu.laya)) + " ms"}</div></div></div>
<h3 class="soluk" style="margin:14px 0 6px;font-size:.85rem">Seçim karmaşıklık tablosu (tüm etiketli örnekler; köşegen = uyum)</h3>${matrisTablosu(g.tumu.matris)}`;

  const maliyetHtml = !varMi("logs/olaylar.jsonl") ? yokNotu("logs/olaylar.jsonl") : t.maliyet.length
    ? `<p class="soluk">Birikimli tutar (sunucu oturumu başından); aralıktaki en yüksek değer.</p>${tablo(["Ajan", "#Olay", "#Maliyet (USD)"], [...t.maliyet.map((m) => `<tr><td>${esc(m.ajan)}</td><td class="n">${m.olay}</td><td class="n">${m.usd.toFixed(4)}</td></tr>`), `<tr><th>Toplam</th><td></td><td class="n"><b>${o.maliyetToplam.toFixed(4)}</b></td></tr>`])}`
    : '<p class="yok-not">Aralıkta maliyet olayı yok.</p>';

  const yavasHtml = t.yavas.length
    ? `<h3 class="soluk" style="margin:14px 0 6px;font-size:.85rem">En yavaş 10 araç</h3>${tablo(["Zaman", "Ajan", "Araç", "#Süre (sn)"], t.yavas.map((y) => `<tr><td>${esc(tarih(y.ts))}</td><td class="kod">${esc(y.ajan)}</td><td>${esc(y.arac)}</td><td class="n">${(y.sure_ms / 1000).toFixed(1)}</td></tr>`))}`
    : "";

  const pcHtml = !varMi("~/.nobetci-gunluk.jsonl") ? yokNotu("~/.nobetci-gunluk.jsonl") : t.pc.length
    ? tablo(["Zaman", "Tür", "Açıklama", "Hata?"], [...t.pc].reverse().slice(0, 100).map((k) => `<tr${k.baglam.hata ? "" : ' class="dim"'}><td>${esc(tarih(k.ts))}</td><td class="kod">${esc(k.tur_adi)}</td><td>${esc(k.mesaj)}</td><td>${k.baglam.hata ? "evet" : "hayır"}</td></tr>`))
    : '<p class="yok-not">Aralıkta nöbetçi kaydı yok.</p>';

  const etiketMetni = (m) => Object.keys(ETIKET_AD).filter((e) => m[e]).map((e) => `${ETIKET_AD[e]} ${m[e]}`).join(", ");
  const etiketSay = (l) => etiketMetni(say(l, (h) => h.baglam.etiket)) || "yok";
  const dosyaEtiket = etiketMetni(t.oturum.etiket);
  const oturumHtml = !varMi("~/.claude/projects/<zepul-os>/*.jsonl") ? yokNotu("~/.claude/projects/…/*.jsonl") : `<p class="soluk">${t.oturum.dosya} dosya${dosyaEtiket ? ` (${esc(dosyaEtiket)})` : ""}, ${t.oturum.hatalar.length} hata sayıldı (ana, alt ajan, orkestra). Ayrı etiketlenen (sayılmadı): ${esc(etiketSay(t.oturum.ayri))}. Reddedilen araç çağrısı (izin/plan reddi): ${t.oturum.reddedilen}; bunlar hata sayılmadı.</p>
<p class="soluk">Sınır: etiket dosya meta verisinden çıkar. SDK oturumu, kimliği olaylar.jsonl'daki bir maliyet olayında geçiyorsa orkestra, geçmiyorsa test sayılır; result üretmeden çöken orkestra oturumu bu yüzden test görünür. Alt ajan, meta.json'daki tür ya da açıklamada denetçi, kabul ya da hata avı geçiyorsa denetçidir. Geçici klasörde çalışan işçilerin oturumları bu klasörde değildir, sayılmaz.</p>${t.oturum.hatalar.length
    ? tablo(["Tür", "Araç", "#Adet"], oturumGruplari.map(([a, n]) => { const [tur, arac] = a.split("|"); return `<tr><td class="kod">${esc(tur)}</td><td>${esc(arac)}</td><td class="n">${n}</td></tr>`; })) + `<h3 class="soluk" style="margin:14px 0 6px;font-size:.85rem">Son 20 hata</h3>` + tablo(["Zaman", "Etiket", "Ajan", "Araç", "Tür", "Mesaj"], [...t.oturum.hatalar].reverse().slice(0, 20).map((h) => `<tr><td>${esc(tarih(h.ts))}</td><td>${esc(ETIKET_AD[h.baglam.etiket] ?? h.baglam.etiket)}</td><td class="kod">${esc(h.baglam.ajan)}</td><td>${esc(h.baglam.arac ?? "-")}</td><td class="kod">${esc(h.tur_adi)}</td><td>${esc(h.mesaj)}</td></tr>`))
    : '<p class="yok-not">Aralıkta oturum hatası yok.</p>'}`;

  const dikkatHtml = o.dikkat.length
    ? `<ul>${o.dikkat.map((x) => `<li><b><code>${esc(x.tur_adi)}</code></b> × ${x.adet} <span class="soluk">(${esc(x.kaynaklar.map((k) => ETIKET[k]).join(", "))})</span>: ${x.tur_adi === "bilinmiyor" ? "sınıflandırıcıya kural ekle" : "skill'e ya da kurala dönüştür (KURALLAR J)"}.<br><span class="soluk">Örnek: ${esc(x.ornek)}</span></li>`).join("")}</ul>`
    : '<p class="yok-not">Tekrarlayan hata yok (eşik: aynı tur_adi en az 3 kez).</p>';

  const tumHatalar = `<p><label>Kaynak: <select id="suz"><option value="">tümü</option>${gecerliKaynaklar.map((k) => `<option value="${k}">${esc(ETIKET[k])}</option>`).join("")}</select></label></p>${tablo(["Zaman", "Kaynak", "Tür", "Mesaj", "Geri alınabilir", "Devam edilebilir", "Öneri"], ilkHatalar.slice(0, 300).map(hataSatiri), "hatatablo")}${ilkHatalar.length > 300 ? `<p class="soluk">En yeni 300 kayıt gösterildi (toplam ${ilkHatalar.length}).</p>` : ""}`;

  const veri = { ozet: o, aralik: { bas: new Date(t.bas).toISOString(), son: new Date(t.simdi).toISOString() }, durum: t.durum, hatalar: t.hatalar.slice(-1000), pc: t.pc.slice(-200), maliyet: t.maliyet };
  return `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark">
<title>Zepul OS log raporu</title><style>${CSS}</style></head><body><main>
<header><div><h1>Zepul OS log raporu</h1><div class="soluk">Son ${t.saat} saat: ${esc(tarih(t.bas, true))} – ${esc(tarih(t.simdi, true))} (yerel saat) · üretildi ${esc(tarih(uretim, true))}</div></div><button id="tema" type="button">Tema</button></header>
<div class="chips" aria-label="Kaynak durumu">${durumChip}</div>
${sec("1. Özet", kartlar)}
${sec("2. Zaman çizelgesi", zamanCizelgesi(t))}
${sec("3. Kapı kararları", kapiHtml)}
${sec("4. Laya eğitim ilerlemesi", layaHtml)}
${sec("5. Maliyet", maliyetHtml + yavasHtml)}
${sec("6. PC olayları", pcHtml)}
${sec("7. Claude Code oturum hataları", oturumHtml)}
${sec("8. Dikkat", dikkatHtml)}
${sec("Ek: tüm hata kayıtları", tumHatalar)}
</main>
<script type="application/json" id="veri">${JSON.stringify(veri).replace(/</g, "\\u003c")}</script>
<script>${JS}</script></body></html>`;
}

// ---------- Ana giriş ----------

const iki = (n) => String(n).padStart(2, "0");

// Sunucu bunu 6 saatte bir çağırır (bağlama talimatı: docs/rapor.md). `cikti` göreliyse depo köküne göre çözülür.
// Ek seçenekler: bildir (ntfy gönder), simdi (ms, test için), kaynaklar (yol geçersiz kılma, test için).
export async function raporUret({ saat = 6, cikti = "raporlar", bildir = false, simdi = Date.now(), kaynaklar } = {}) {
  const t = await topla({ saat, simdi, kaynaklar });
  const o = ozetle(t);
  const d = new Date(simdi);
  const klasor = path.resolve(REPO, cikti);
  await mkdir(klasor, { recursive: true });
  const yol = path.join(klasor, `log-raporu-${d.getFullYear()}${iki(d.getMonth() + 1)}${iki(d.getDate())}-${iki(d.getHours())}${iki(d.getMinutes())}.html`);
  await writeFile(yol, htmlUret(t, o, d), "utf8");
  let bildirildi = false;
  if (bildir) { const b = bildirMetni(o); bildirildi = await ntfyBildir(b.baslik, b.mesaj, "bar_chart", 3); }
  return { yol, ozet: o, bildirildi };
}

if (path.basename(process.argv[1] ?? "") === "rapor.mjs") {
  const a = process.argv.slice(2);
  if (a.includes("--test")) {
    process.exit(spawnSync(process.execPath, ["--test", path.join(path.dirname(fileURLToPath(import.meta.url)), "rapor.test.mjs")], { stdio: "inherit" }).status ?? 1);
  }
  const deger = (bayrak, varsayilan) => (a.includes(bayrak) ? a[a.indexOf(bayrak) + 1] : varsayilan);
  const saat = Number(deger("--saat", 6));
  const { yol, ozet, bildirildi } = await raporUret({ saat: saat > 0 ? saat : 6, cikti: deger("--cikti", "raporlar"), bildir: a.includes("--bildir") });
  console.log(`rapor: ${yol}\n${ozet.toplam} hata (geri alınamaz ${ozet.geriAlinamaz}, devam edilemez ${ozet.devamEdilemez})${a.includes("--bildir") ? `; ntfy ${bildirildi ? "gönderildi" : "gönderilemedi"}` : ""}`);
}
