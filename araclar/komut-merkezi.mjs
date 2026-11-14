// Zepul komut merkezi: OS (8820) ve AI (8830) için tek tuşlu başlat / durdur / yeniden başlat menüsü.
// Kullanım: node araclar/komut-merkezi.mjs [tuş] [--kuru] [--durum] [--test]
//   tuş     : menüyü açmadan tek işlem yapar (ör. "4" = ikisini başlat; Baslat Hepsi.bat bunu kullanır)
//   --kuru  : hiçbir şeyi durdurmaz/başlatmaz/açmaz; yalnızca adımları yazdırır
//   --durum : durum satırını ve panel adreslerinin bulunup bulunmadığını yazdırıp çıkar
//   --test  : ağsız öz-denetimler
// Başlatma penceresizdir: npm run baslat doğrudan spawn edilir (detached + windowsHide), çıktı logs/*.log'a eklenir.
// Panel adresleri (token dahil) yalnızca terminal ekranına yazılır, günlüklere yazılmaz.
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import readline from "node:readline";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MASA = path.join(os.homedir(), "Desktop");
const AI_KOK = [path.join(MASA, "zepul-ai"), path.join(MASA, "02 Projeler", "zepul-ai")].find((d) => fs.existsSync(d)) ?? path.join(MASA, "zepul-ai");
const OS_URL_DOSYA = path.join(process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "zepul-os") : path.join(os.homedir(), ".zepul-os"), "panel-url.txt");
const AI_URL_DOSYA = path.join(AI_KOK, ".tmp", "panel-url.txt");
const ARAMA_URL = "http://127.0.0.1:8840/";
const ARAMA_LOG = path.join(process.env.LOCALAPPDATA ?? os.homedir(), "zepul-arama.log");
const LAYA_PY = path.join(os.homedir(), "laya-env", "Scripts", "python.exe");
const LIMIT_PY = path.join(os.homedir(), ".claude", "skills", "limit", "scripts", "limit.py");

const arg = process.argv.slice(2);
const KURU = arg.includes("--kuru");

// ---------- renk ----------
const r = (k) => (s) => `\x1b[${k}m${s}\x1b[0m`;
const c = { yesil: r(32), kirmizi: r(31), sari: r(33), mavi: r(36), gri: r(90), kalin: r(1) };
const yaz = (s = "") => process.stdout.write(s + "\n");
const adimYaz = (s) => yaz(`  ${c.mavi("›")} ${s}`);
const tamam = (s) => yaz(`  ${c.yesil("✓")} ${s}`);
const uyari = (s) => yaz(`  ${c.sari("!")} ${s}`);
const hataYaz = (s) => yaz(`  ${c.kirmizi("✗")} ${s}`);

// ---------- saf mantık (--test bunları denetler) ----------

// Yalnızca loopback dinleyicisi sayılır: servislerimiz yalnızca 127.0.0.1/::1'de dinler; 0.0.0.0 ve :: dinleyicileri
// liman gibi aynalardır (parolalı olarak yerel ağa açar), tailscaled'in tailnet adresi de sayılmaz.
const YEREL = new Set(["127.0.0.1", "::1"]);
export function yerelDinleyenler(liste) {
  return (Array.isArray(liste) ? liste : liste ? [liste] : []).filter((d) => YEREL.has(String(d.adres)));
}

// `netstat -ano` metninden yalnızca LISTENING satırları; yerel adres sütunu tam `:port` ile bitmeli (uzak adres, ESTABLISHED, TIME_WAIT, :58820 sayılmaz).
export function netstatDinleyenler(metin, port) {
  const out = [];
  for (const satir of String(metin ?? "").split(/\r?\n/)) {
    const k = satir.trim().split(/\s+/);
    if (k.length < 5 || k[0].toUpperCase() !== "TCP" || k[3].toUpperCase() !== "LISTENING") continue;
    const m = /^(.*):(\d+)$/.exec(k[1]);
    if (!m || Number(m[2]) !== Number(port)) continue;
    out.push({ adres: m[1].replace(/^\[|\]$/g, ""), pid: Number(k[4]) });
  }
  return out;
}

// Port durumu: "açık" (loopback'te dinleyen var) | "boş". 0.0.0.0/:: dinleyicisi tek başına "boş" sayılır.
export function portDurumu(metin, port) {
  return yerelDinleyenler(netstatDinleyenler(metin, port)).length ? "açık" : "boş";
}
// Loopback kapalı ama 0.0.0.0/:: açıksa: ayna (liman) dolu tutuyordur.
export function aynaVar(metin, port) {
  return portDurumu(metin, port) === "boş" && netstatDinleyenler(metin, port).length > 0;
}

// Zorla kapatmadan önce: süreç komut satırında beklenen etiket (zepul-os, zepul-ai, laya-golge-sunucu) geçmeli.
export function surecDogrula(surec, etiket) {
  const komut = String(surec?.komut ?? "").toLowerCase().replaceAll("\\", "/");
  return !!etiket && komut.includes(etiket.toLowerCase());
}

export function tokenliAdres(metin) {
  const u = new URL(String(metin).trim());
  const token = u.searchParams.get("t");
  if (!token) throw new Error("adreste token yok");
  return { url: u.href, kok: u.origin, token };
}

// Günlük satırlarında token görünmesin.
export function maskele(s, tokenlar = []) {
  let out = String(s).replace(/([?&]t=)[^&\s"']+/g, "$1***");
  for (const t of tokenlar) if (t && t.length >= 6) out = out.split(t).join("***");
  return out;
}

// Limit: ortak önbellek (~/.claude/limit-onbellek.json) limit.py üzerinden okunur. --onbellek uca gitmez; --yenile canlı
// sorguyu dener, 5 dk / 429 kuralına betik karar verir.
export const limitKomutu = (bayrak) => ({ komut: "py", args: ["-3", LIMIT_PY, bayrak, "--json", "--color", "never"] });
const LIMIT_KAYNAK = { "canli": "canlı", "son-canli": "son canlı", "gozlem": "gözlem", "yerel-onbellek": "önbellek" };
// "Limit: 5s %12 · hafta %40 · 13:48 (canlı, 3 dk önce)"; saat ve yaş verinin ölçüldüğü andır.
export function limitSatiri(j, simdi = Date.now()) {
  if (!j) return `Limit: ${c.kirmizi("okunamadı")}`;
  const p = (ad) => {
    const w = (j.claude?.windows ?? []).find((x) => x?.name === ad && !x.expired && typeof x.used_percent === "number");
    return w ? `%${Math.round(w.used_percent)}` : "?";
  };
  const yas = typeof j.yas_sn === "number" ? j.yas_sn : null;
  const zaman = yas == null ? "?" : new Date(simdi - yas * 1000).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  const kaynak = `${LIMIT_KAYNAK[j.kaynak] ?? j.kaynak ?? "kaynak yok"}, ${yas == null ? "yaşı bilinmiyor" : `${Math.round(yas / 60)} dk önce`}`;
  const bayat = j.bayat === true || yas == null || yas > 30 * 60;
  return `Limit: 5s ${p("5-hour")} · hafta ${p("7-day")} · ${zaman} ${c.gri(`(${kaynak})`)}` + (bayat ? ` · ${c.sari("BAYAT: limit bilinmiyor")}` : "");
}
function limitOku(bayrak) {
  const k = limitKomutu(bayrak);
  const s = spawnSync(k.komut, k.args, { encoding: "utf8", windowsHide: true, timeout: 25_000 });
  try { return JSON.parse(s.stdout); } catch { return null; }
}

// Jev'in son bilinen durumu, ağsız: kapının hata kaydı (hatalar.jsonl, ajan "kapi") ve gölge kaydı (laya-golge.jsonl).
export function jevSonBilinen(hataSatirlari, golgeSatirlari) {
  const oku = (s) => { try { return JSON.parse(s); } catch { return null; } };
  let son = null;
  const aday = (ts, durum, iyi) => { if (ts && (!son || ts > son.ts)) son = { ts, durum, iyi }; };
  for (const h of hataSatirlari.map(oku)) {
    if (!h || h.ajan !== "kapi" || /^Laya/.test(h.mesaj ?? "")) continue;
    const m = String(h.mesaj ?? "");
    aday(h.ts, /429/.test(m) ? "kota dolu (429)" : `erişilemedi (${m.slice(0, 40)})`, false);
  }
  for (const g of golgeSatirlari.map(oku)) if (g?.jev) aday(g.ts, "yanıt verdi", true);
  return son;
}

// ---------- yardımcılar ----------

function portAcik(port, host = "127.0.0.1", ms = 500) {
  return new Promise((coz) => {
    const s = net.connect({ port, host });
    const bit = (v) => { s.destroy(); coz(v); };
    s.setTimeout(ms, () => bit(false));
    s.once("connect", () => bit(true));
    s.once("error", () => bit(false));
  });
}

const netstatMetni = () => spawnSync("netstat.exe", ["-ano", "-p", "TCP"], { encoding: "utf8", windowsHide: true }).stdout;
// Servis açık mı: loopback dinleyicisine göre (TCP bağlantısı 0.0.0.0 aynasında da başarılı olurdu).
const servisAcik = async (port) => portDurumu(netstatMetni(), port) === "açık";

async function portBekle(port, acik, sn) {
  const son = Date.now() + sn * 1000;
  process.stdout.write(`  ${c.gri(`${port} ${acik ? "açılması" : "boşalması"} bekleniyor (en çok ${sn} sn) `)}`);
  while (Date.now() < son) {
    if ((await servisAcik(port)) === acik) { yaz(c.yesil(" tamam")); return true; }
    process.stdout.write(c.gri("."));
    await new Promise((z) => setTimeout(z, 500));
  }
  yaz(c.kirmizi(" süre doldu"));
  return false;
}

function sonSatirlar(dosya, n) {
  try {
    const fd = fs.openSync(dosya, "r");
    const boy = fs.fstatSync(fd).size, ok = Math.min(boy, 256 * 1024);
    const b = Buffer.alloc(ok);
    fs.readSync(fd, b, 0, ok, boy - ok);
    fs.closeSync(fd);
    return b.toString("utf8").split(/\r?\n/).filter(Boolean).slice(-n);
  } catch { return []; }
}

function adresOku(dosya) {
  try { return tokenliAdres(fs.readFileSync(dosya, "utf8")); } catch { return null; }
}

// Portu yerelde dinleyen süreçler: pid, ad, komut satırı (PowerShell; yalnızca zorla kapatmada çağrılır).
export function dinleyenler(port) {
  const adaylar = yerelDinleyenler(netstatDinleyenler(netstatMetni(), port));
  if (!adaylar.length) return [];
  const ps = `$ErrorActionPreference='SilentlyContinue'; @(${adaylar.map((d) => Number(d.pid)).join(",")} | ForEach-Object { $w = Get-CimInstance Win32_Process -Filter "ProcessId=$_"; [pscustomobject]@{ pid = $_; ad = $w.Name; komut = $w.CommandLine } }) | ConvertTo-Json -Compress`;
  const s = spawnSync("powershell.exe", ["-NoProfile", "-Command", ps], { encoding: "utf8", windowsHide: true });
  let bilgi = [];
  try { const j = JSON.parse(s.stdout.trim() || "[]"); bilgi = Array.isArray(j) ? j : [j]; } catch { /* komut satırı okunamazsa doğrulama zaten reddeder */ }
  return adaylar.map((d) => ({ ...d, ...bilgi.find((b) => b.pid === d.pid) }));
}

// Penceresiz, bağımsız başlatma: shell/cmd yok, pencere gizli, çıktı günlük dosyasına eklenir, unref ile komut merkezi kapansa da süreç yaşar.
const NPM_CLI = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
export const spawnSecenek = (cwd, env, fd) => ({ cwd, env, detached: true, windowsHide: true, stdio: ["ignore", fd, fd] });
export const logBaslik = (ad, tarih = new Date()) => `\n===== ${tarih.toISOString()} · ${ad} başlatılıyor =====\n`; // token yazılmaz: günlükleri ajanlar okur
// Başlatma komutu (saf): npm'in kendi betiği doğrudan node ile çalışır; npm.cmd/cmd.exe gerekmez.
export function baslatKomutu(s) {
  if (s === LAYA) return { komut: LAYA_PY, args: ["araclar\\laya-golge-sunucu.py"], cwd: KOK, env: { ...process.env, PYTHONIOENCODING: "utf-8" }, log: path.join(KOK, "logs", "orkestra-sunucu.log") };
  if (s === ARAMA) return { komut: process.execPath, args: [NPM_CLI, "run", "arama"], cwd: AI_KOK, env: process.env, log: ARAMA_LOG };
  const cwd = s === AI ? AI_KOK : KOK;
  return { komut: process.execPath, args: [NPM_CLI, "run", "baslat"], cwd, env: process.env, log: path.join(KOK, "logs", s === AI ? "zepul-ai-sunucu.log" : "orkestra-sunucu.log") };
}
function surecBaslat(s) {
  const k = baslatKomutu(s);
  fs.mkdirSync(path.dirname(k.log), { recursive: true });
  const fd = fs.openSync(k.log, "a");
  fs.writeSync(fd, logBaslik(s.ad));
  try { spawn(k.komut, k.args, spawnSecenek(k.cwd, k.env, fd)).unref(); } finally { fs.closeSync(fd); }
}
// Ekran satırı: tam adres (token dahil) yalnızca terminale yazılır; günlük dosyasına asla.
export const adresSatiri = (ad, a) => `${ad} paneli: ${a ? a.url : "adres yok (sunucu hiç açılmamış olabilir)"}`;

// Chrome yolu; yoksa null. Varsa adres mevcut Chrome'da yeni sekmede açılır (--new-window/--app yok).
function chromeYolu(var_ = fs.existsSync) {
  const yollar = [String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`];
  if (process.env.LOCALAPPDATA) yollar.push(path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"));
  return yollar.find((y) => var_(y)) ?? null;
}

// Argüman enjeksiyonuna karşı asıl koruma: yalnızca bilinen şemalar; "-" ile başlayan, boşluk/kontrol karakteri içeren red.
const adresGecerli = (h) => typeof h === "string" && /^(http:\/\/127\.0\.0\.1|http:\/\/localhost|https:\/\/|file:\/\/\/)/.test(h) && !/[\s\u0000-\u001f\u007f]/.test(h);

function acKomutu(hedef, chrome = chromeYolu()) {
  if (!adresGecerli(hedef)) throw new Error(`geçersiz adres, tarayıcı açılmadı: ${String(hedef).slice(0, 60)}`);
  return chrome ? { komut: chrome, args: ["--", hedef] } : { komut: "rundll32.exe", args: ["url.dll,FileProtocolHandler", hedef] };
}

function ac(hedef) {
  let c;
  try { c = acKomutu(hedef); } catch (e) { hataYaz(e.message); return; }
  const { komut, args } = c;
  spawn(komut, args, { detached: true, stdio: "ignore" }).unref();
}

function npm(betik) {
  return spawnSync("cmd.exe", ["/d", "/c", `npm run ${betik}`], { cwd: KOK, stdio: "inherit" }).status === 0;
}

// Kuru modda iş yapılmaz, yalnızca ne yapılacağı yazılır.
async function yap(metin, fn) {
  adimYaz(KURU ? `${c.sari("[kuru]")} ${metin}` : metin);
  return KURU ? undefined : fn();
}

// ---------- sistemler ----------

const OS = {
  ad: "OS", port: 8820, etiket: "zepul-os",
  kapatMetni: "düzgün kapatma: POST /api/kapat (token panel-url.txt'den)",
  async kapat() {
    const a = adresOku(OS_URL_DOSYA);
    if (!a) { hataYaz("panel-url.txt okunamadı"); return false; }
    try {
      const yanit = await fetch(new URL("/api/kapat", a.kok), { method: "POST", headers: { "x-token": a.token }, signal: AbortSignal.timeout(5000) });
      (yanit.ok ? tamam : hataYaz)(`/api/kapat → ${yanit.status}`);
      return yanit.ok;
    } catch (e) { hataYaz(`/api/kapat ulaşılamadı: ${e.message}`); return false; }
  },
  baslaticiMetni: "başlatıcı: npm run baslat (pencere yok, günlük logs/orkestra-sunucu.log); 8796 kapalıysa gölge Laya da pencere açmadan başlar",
  baslat: async () => { if (fs.existsSync(LAYA_PY) && !(await servisAcik(LAYA.port))) surecBaslat(LAYA); surecBaslat(OS); },
};

const AI = {
  ad: "AI", port: 8830, etiket: "zepul-ai",
  kapatMetni: "düzgün kapatma: zepul-ai\\Durdur.bat",
  kapat() {
    const s = spawnSync("cmd.exe", ["/d", "/c", path.join(AI_KOK, "Durdur.bat")], { cwd: AI_KOK, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    for (const l of `${s.stdout}`.split(/\r?\n/)) if (l.trim()) adimYaz(c.gri(l.trim()));
    return s.status === 0;
  },
  baslaticiMetni: "başlatıcı: zepul-ai içinde npm run baslat (pencere yok, günlük logs/zepul-ai-sunucu.log); panel açılmaz (9 ile açılır)",
  baslat: () => surecBaslat(AI),
  sonra: aramaBaslat, // panel kendiliğinden açılmaz; açmak için 9
};

// Arama paneli (zepul-ai/arama/sunucu.ts): Durdur.bat bunu da kapatır, AI başlayınca 8840 kapalıysa penceresiz yeniden açılır.
const ARAMA = { ad: "Arama paneli", port: 8840, etiket: "zepul-ai" };
async function aramaBaslat() {
  if (await servisAcik(ARAMA.port)) { tamam(`${ARAMA.ad} zaten açık (${ARAMA.port})`); return true; }
  await yap("arama paneli: zepul-ai içinde npm run arama (pencere yok, günlük %LOCALAPPDATA%\zepul-arama.log)", () => surecBaslat(ARAMA));
  if (KURU) { adimYaz(`${c.sari("[kuru]")} ${ARAMA.port} açılana kadar beklenir (en çok 20 sn)`); return true; }
  const ok = await portBekle(ARAMA.port, true, 20);
  if (!ok) uyari(`${ARAMA.ad} ${ARAMA.port}'de açılmadı; günlük: ${ARAMA_LOG}`);
  return ok;
}
async function aramaAc() {
  if (!(await servisAcik(ARAMA.port))) uyari(`${ARAMA.ad} kapalı (${ARAMA.port}); yine de açılıyor`);
  await yap(`${ARAMA.ad} tarayıcıda açılıyor: ${ARAMA_URL}`, () => ac(ARAMA_URL));
}

const LAYA = {
  ad: "Gölge Laya", port: 8796, etiket: "laya-golge-sunucu", bekleSn: 60,
  kapatMetni: null, // düzgün kapatma ucu yok; doğrulanmış süreç kapatılır (DUMAN.md'deki pid yöntemiyle aynı)
  baslaticiMetni: "başlatıcı: laya-env python araclar\\laya-golge-sunucu.py (pencere yok, günlük logs/orkestra-sunucu.log)",
  baslat: () => surecBaslat(LAYA),
};

async function zorlaKapat(s) {
  const liste = dinleyenler(s.port);
  if (!liste.length) { uyari(`${s.port} için yerel dinleyen süreç bulunamadı`); return false; }
  let hepsi = true;
  for (const d of liste) {
    if (!surecDogrula(d, s.etiket)) {
      hataYaz(`pid ${d.pid} (${d.ad}) komut satırında "${s.etiket}" yok; dokunulmadı`);
      hepsi = false;
      continue;
    }
    try { process.kill(d.pid); tamam(`pid ${d.pid} (${d.ad}) zorla kapatıldı`); } catch (e) { hataYaz(`pid ${d.pid} kapatılamadı: ${e.message}`); hepsi = false; }
  }
  return hepsi && portBekle(s.port, false, 5);
}

async function durdur(s) {
  yaz(c.kalin(`\n${s.ad} durduruluyor`));
  if (!(await servisAcik(s.port))) { tamam(`${s.ad} zaten kapalı (${s.port})`); return true; }
  if (s.kapatMetni) await yap(s.kapatMetni, () => s.kapat());
  if (KURU) {
    adimYaz(`${c.sari("[kuru]")} ${s.port} boşalana kadar beklenir (en çok 20 sn)`);
    adimYaz(`${c.sari("[kuru]")} boşalmazsa: ${s.port}'u yerelde dinleyen süreç komut satırında "${s.etiket}" geçiyorsa zorla kapatılır, geçmiyorsa dokunulmaz`);
    return true;
  }
  if (s.kapatMetni && (await portBekle(s.port, false, 20))) return true;
  uyari(s.kapatMetni ? "düzgün kapatma yetmedi; zorla kapatma deneniyor" : "doğrulanmış süreç kapatılıyor");
  return zorlaKapat(s);
}

async function baslat(s) {
  yaz(c.kalin(`\n${s.ad} başlatılıyor`));
  if (await servisAcik(s.port)) { tamam(`${s.ad} zaten açık (${s.port})`); return true; }
  await yap(s.baslaticiMetni, () => s.baslat());
  if (KURU) {
    adimYaz(`${c.sari("[kuru]")} ${s.port} açılana kadar beklenir (en çok ${s.bekleSn ?? 60} sn)`);
    if (s === AI) adimYaz(`${c.sari("[kuru]")} panel açılmaz (9 ile açılır)`);
    if (s === AI) await aramaBaslat();
    return true;
  }
  const acildi = await portBekle(s.port, true, s.bekleSn ?? 60);
  if (acildi && s.sonra) await s.sonra();
  return acildi;
}

async function yenidenBaslat(s) {
  if (!(await durdur(s))) { hataYaz(`${s.ad} durdurulamadı; başlatma atlandı`); return false; }
  return baslat(s);
}

async function panelAc(ad, dosya) {
  const a = adresOku(dosya);
  if (!a) { hataYaz(`${ad} panel adresi bulunamadı (sunucu hiç açılmamış olabilir)`); return; }
  yaz("  " + adresSatiri(ad, a));
  await yap(`${ad} paneli tarayıcıda açılıyor`, () => ac(a.url));
}

async function raporAc(betik, dosya) {
  const ok = await yap(`npm run ${betik}`, () => npm(betik));
  if (ok === false) { hataYaz(`npm run ${betik} başarısız`); return; }
  await yap(`${path.relative(KOK, dosya)} açılıyor`, () => ac(pathToFileURL(dosya).href));
}

function gunlukler() {
  const tokenlar = [adresOku(OS_URL_DOSYA)?.token, adresOku(AI_URL_DOSYA)?.token];
  const gen = Math.max(60, (process.stdout.columns || 120) - 4);
  const kirp = (s) => (s.length > gen ? s.slice(0, gen - 1) + "…" : s);
  yaz(c.kalin("\nOS: logs/olaylar.jsonl (son 20)"));
  for (const l of sonSatirlar(path.join(KOK, "logs", "olaylar.jsonl"), 20)) {
    let o; try { o = JSON.parse(l); } catch { o = null; }
    const metin = o ? `${String(o.ts ?? "").slice(5, 19).replace("T", " ")} ${o.ajan ?? "-"} ${o.tur ?? "-"} ${o.durum ?? o.tur_adi ?? ""} ${String(o.mesaj ?? o.metin ?? "").replace(/\s+/g, " ")}` : l;
    yaz("  " + kirp(maskele(metin, tokenlar)));
  }
  for (const [ad, f] of [["OS sunucu çıktısı", "orkestra-sunucu.log"], ["AI sunucu çıktısı (komut merkezi)", "zepul-ai-sunucu.log"]]) {
    yaz(c.kalin(`\n${ad}: logs/${f} (son 10)`));
    for (const l of sonSatirlar(path.join(KOK, "logs", f), 10)) yaz("  " + kirp(maskele(l, tokenlar)));
  }
  yaz(c.kalin("\nAI: zepul-ai/logs/sunucu.log (son 20)"));
  for (const l of sonSatirlar(path.join(AI_KOK, "logs", "sunucu.log"), 20)) yaz("  " + kirp(maskele(l, tokenlar)));
}

// J: canlı Jev sorgusu (tek istek, kotadan düşer); mevcut kapı koduyla, yalnızca istenince.
let jevCanli = null;
async function jevSor() {
  const kod = `import { varsayilanBagimlilik, SORULAR } from "./sunucu/kapi.ts";
try { const j = await varsayilanBagimlilik({ zamanAsimiMs: 8000 }).jevSor({ state: "Araç: Bash\\nGirdi: git status", questions: SORULAR }); console.log("OK " + JSON.stringify(j).length); }
catch (e) { console.log("HATA " + (e.status ?? e.message)); }`;
  const s = await yap("Jev'e tek deneme sorgusu (git status sınıflandırması)", () => spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", kod], { cwd: KOK, encoding: "utf8", windowsHide: true }));
  if (!s) return;
  const out = String(s.stdout).trim().split(/\r?\n/).pop() ?? "";
  jevCanli = { ts: new Date().toISOString(), iyi: out.startsWith("OK"), durum: out.startsWith("OK") ? "yanıt verdi" : /429/.test(out) ? "kota dolu (429)" : `erişilemedi (${out.slice(5, 45)})` };
  (jevCanli.iyi ? tamam : hataYaz)(`Jev: ${jevCanli.durum}`);
}

async function limitYenile() {
  const j = await yap("limit.py --yenile (canlı sorgu, kural izin verirse)", () => limitOku("--yenile"));
  if (KURU) return;
  if (!j) return hataYaz("limit.py okunamadı");
  if (j.not) uyari(j.not);
  (j.not ? yaz : tamam)(`${j.not ? "  " : ""}${limitSatiri(j)}`);
}

// ---------- durum satırı ----------

async function durumSatiri() {
  const p = [["OS", 8820], ["AI", 8830], ["Arama paneli", 8840], ["Gölge Laya", 8796], ["Eski Laya", 8788], ["Ollama", 11434]];
  const ns = netstatMetni();
  const acik = p.map(([, port]) => portDurumu(ns, port) === "açık");
  const parca = p.map(([ad, port], i) => `${acik[i] ? c.yesil("●") : c.kirmizi("○")} ${port === 8840 ? `${ad}: ${acik[i] ? "açık" : "kapalı"}` : ad} ${c.gri(port)}${aynaVar(ns, port) ? c.sari(" (ayna: liman)") : ""}`);
  const jev = jevCanli ?? jevSonBilinen(sonSatirlar(path.join(KOK, "logs", "hatalar.jsonl"), 300), sonSatirlar(path.join(KOK, "logs", "laya-golge.jsonl"), 300));
  const zaman = (ts) => new Date(ts).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const jevMetin = jev ? `${(jev.iyi ? c.yesil : c.sari)(jev.durum)} ${c.gri(`(${jevCanli ? "şimdi" : "son bilinen"}, ${zaman(jev.ts)})`)}` : c.gri("kayıt yok");
  const adresler = [["OS", OS_URL_DOSYA], ["AI", AI_URL_DOSYA]].map(([ad, d]) => `  ${adresSatiri(ad, adresOku(d))}`).join("\n"); // her yenilemede dosyadan; yalnızca ekrana
  return { satir: `${parca.join("   ")}\n  Jev: ${jevMetin}\n  ${limitSatiri(limitOku("--onbellek"))}\n${adresler}`, acik };
}

// ---------- menü ----------

const MENU = [
  ["1", "İkisini yeniden başlat (OS + AI)", () => yenidenBaslat(OS).then(() => yenidenBaslat(AI))],
  ["2", "OS'u yeniden başlat", () => yenidenBaslat(OS)],
  ["3", "AI'ı yeniden başlat", () => yenidenBaslat(AI)],
  ["4", "İkisini başlat (kapalıysa)", () => baslat(OS).then(() => baslat(AI))],
  ["5", "OS'u durdur", () => durdur(OS)],
  ["6", "AI'ı durdur", () => durdur(AI)],
  ["7", "İkisini durdur", () => durdur(OS).then(() => durdur(AI))],
  ["8", "OS panelini aç", () => panelAc("OS", OS_URL_DOSYA)],
  ["9", "AI panelini aç", () => panelAc("AI", AI_URL_DOSYA)],
  ["P", "İki paneli birlikte aç (OS + AI)", () => panelAc("OS", OS_URL_DOSYA).then(() => panelAc("AI", AI_URL_DOSYA))],
  ["A", "Arama panelini aç", aramaAc],
  ["R", "Raporu güncelle ve aç", () => raporAc("ozet", path.join(KOK, "raporlar", "ozet.html"))],
  ["I", "İlerleme sayfasını aç", () => raporAc("ilerleme", path.join(KOK, "raporlar", "ilerleme.html"))],
  ["L", "Gölge Laya'yı yeniden başlat", () => yenidenBaslat(LAYA)],
  ["J", "Jev'i şimdi sor (tek istek)", jevSor],
  ["G", "Son günlük satırları", async () => gunlukler()],
  ["U", "Limiti şimdi yenile (5 dk / 429 kuralı geçerli)", limitYenile],
  ["D", "Durumu yenile", null],
  ["Q", "Çıkış", null],
];

async function ciz() {
  const { satir } = await durumSatiri();
  process.stdout.write("\x1b[2J\x1b[H");
  yaz(c.kalin(c.mavi("  ZEPUL KOMUT MERKEZİ")) + (KURU ? c.sari("  [kuru çalıştırma: hiçbir şey yapılmaz]") : ""));
  yaz("  " + satir);
  yaz(c.gri("  " + "─".repeat(60)));
  MENU.forEach(([t, a], i) => yaz(`  ${c.kalin(c.sari(t))}  ${a}` + ([3, 6, 8, 13].includes(i) ? "\n" : "")));
  process.stdout.write(c.gri("\n  Bir tuşa bas: "));
}

async function calistir(tus) {
  const m = MENU.find(([t]) => t === tus.toUpperCase());
  if (!m || !m[2]) return false;
  yaz(c.kalin(`${m[0]} · ${m[1]}`));
  try { await m[2](); } catch (e) { hataYaz(e.message); }
  return true;
}

async function menu() {
  if (!process.stdin.isTTY) { hataYaz("etkileşimli terminal gerekli; tek işlem için: node araclar/komut-merkezi.mjs <tuş>"); process.exit(1); }
  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  let mesgul = false, bekliyor = false;
  await ciz();
  process.stdin.on("keypress", async (str, key) => {
    if (key?.ctrl && key.name === "c") process.exit(0);
    if (mesgul) return;
    if (bekliyor) { bekliyor = false; return ciz(); }
    const t = String(str ?? "").toUpperCase();
    if (t === "Q") { yaz("\n"); process.exit(0); }
    if (t === "D") return ciz();
    if (!MENU.some(([k, , f]) => k === t && f)) return;
    mesgul = true;
    yaz(t + "\n");
    process.stdin.setRawMode(false);
    await calistir(t);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    mesgul = false;
    bekliyor = true;
    process.stdout.write(c.gri("\n  Menüye dönmek için bir tuşa bas…"));
  });
}

// ---------- öz-denetim ----------

async function test() {
  // yerel dinleyen süzgeci: tailscaled'in tailnet adresi elenir
  const l = yerelDinleyenler([{ adres: "fd7a:115c:a1e0::7f01:aadb", pid: 1 }, { adres: "127.0.0.1", pid: 2 }, { adres: "::1", pid: 3 }, { adres: "100.64.0.5", pid: 4 }]);
  assert.deepEqual(l.map((d) => d.pid), [2, 3]);
  assert.deepEqual(yerelDinleyenler({ adres: "127.0.0.1", pid: 9 }).map((d) => d.pid), [9]); // ConvertTo-Json tek nesne
  assert.deepEqual(yerelDinleyenler([{ adres: "0.0.0.0", pid: 8 }, { adres: "::", pid: 7 }]), []);
  assert.deepEqual(yerelDinleyenler(null), []);
  // netstat çıktısı: yalnızca LISTENING ve yerel adres tam :port
  const ns = [
    "  TCP    0.0.0.0:8820           0.0.0.0:0              LISTENING       100",
    "  TCP    127.0.0.1:8820         0.0.0.0:0              LISTENING       101",
    "  TCP    [::1]:8820             [::]:0                 LISTENING       102",
    "  TCP    [::]:8820              [::]:0                 LISTENING       103",
    "  TCP    127.0.0.1:58820        0.0.0.0:0              LISTENING       104",
    "  TCP    127.0.0.1:50000        127.0.0.1:8820         ESTABLISHED     4012",
    "  TCP    127.0.0.1:50001        127.0.0.1:8820         TIME_WAIT       0",
    "  TCP    127.0.0.1:8820         127.0.0.1:50002        ESTABLISHED     105",
    "  TCP    127.0.0.1:8820         127.0.0.1:50003        TIME_WAIT       0",
    "  TCP    0.0.0.0:18820          0.0.0.0:0              LISTENING       106",
    "  TCP    0.0.0.0:8830           0.0.0.0:0              LISTENING       107",
  ].join("\r\n");
  assert.deepEqual(netstatDinleyenler(ns, 8820).map((d) => d.pid), [100, 101, 102, 103]);
  assert.deepEqual(netstatDinleyenler(ns, 8820).map((d) => d.adres), ["0.0.0.0", "127.0.0.1", "::1", "::"]);
  assert.deepEqual(netstatDinleyenler(ns, 58820).map((d) => d.pid), [104]);
  assert.deepEqual(netstatDinleyenler("  TCP    127.0.0.1:50000        127.0.0.1:8820         ESTABLISHED     4012", 8820), []);
  assert.deepEqual(netstatDinleyenler("", 8820), []);
  // port durumu yalnızca loopback'e göre; 0.0.0.0 ayna (liman) sayılır
  const aynaNs = "  TCP    0.0.0.0:8820           0.0.0.0:0              LISTENING       100\r\n  TCP    [::]:8820              [::]:0                 LISTENING       100";
  assert.equal(portDurumu(aynaNs, 8820), "boş", "loopback kapalı + 0.0.0.0 açık → boş");
  assert.equal(portDurumu(aynaNs + "\r\n  TCP    127.0.0.1:8820         0.0.0.0:0              LISTENING       101", 8820), "açık");
  assert.equal(portDurumu("  TCP    [::1]:8820             [::]:0                 LISTENING       102", 8820), "açık");
  assert.equal(portDurumu("", 8820), "boş");
  assert.equal(aynaVar(aynaNs, 8820), true);
  assert.equal(aynaVar("", 8820), false);
  assert.deepEqual(yerelDinleyenler(netstatDinleyenler(ns, 8820)).map((d) => d.pid), [101, 102], "zorla kapatma adayı yalnızca loopback");
  // süreç doğrulama
  const osSurec = { komut: String.raw`"C:\Program Files\nodejs\node.exe" --import file:///C:/Users/kullanici/Desktop/zepul-os/node_modules/tsx/dist/loader.mjs sunucu/orkestra.ts` };
  const aiSurec = { komut: String.raw`node C:\Users\kullanici\Desktop\Zepul-AI\node_modules\tsx\dist\cli.mjs sunucu/asistan.ts` };
  assert.ok(surecDogrula(osSurec, "zepul-os"));
  assert.ok(!surecDogrula(osSurec, "zepul-ai"));
  assert.ok(surecDogrula(aiSurec, "zepul-ai"), "büyük/küçük harf ve ters bölü");
  assert.ok(!surecDogrula({ komut: String.raw`C:\Users\kullanici\AppData\Local\Programs\Ollama\ollama.exe serve` }, "zepul-os"));
  assert.ok(!surecDogrula({ komut: null }, "zepul-ai"), "komut satırı okunamazsa dokunulmaz (tailscaled, yetkisiz süreç)");
  assert.ok(!surecDogrula({ komut: "python liman.py --port 8789" }, "zepul-os"));
  assert.ok(!surecDogrula(osSurec, ""));
  assert.ok(surecDogrula({ komut: String.raw`python.exe araclar\laya-golge-sunucu.py` }, "laya-golge-sunucu"));
  // adres ve maske
  const a = tokenliAdres("http://127.0.0.1:8820/?t=gizliToken123\r\n");
  assert.equal(a.kok, "http://127.0.0.1:8820");
  assert.equal(a.token, "gizliToken123");
  assert.throws(() => tokenliAdres("http://127.0.0.1:8830/"));
  assert.equal(maskele("panel http://x/?t=abcdef0123 hazır"), "panel http://x/?t=*** hazır");
  assert.equal(maskele("token gizliToken123 sızdı", ["gizliToken123"]), "token *** sızdı");
  // Jev son bilinen
  const h = [JSON.stringify({ ts: "2026-10-02T10:00:00Z", ajan: "kapi", mesaj: "HTTP 429" }), JSON.stringify({ ts: "2026-10-02T11:00:00Z", ajan: "kapi", mesaj: "Laya (gölge): HTTP 500" }), "bozuk"];
  const g = [JSON.stringify({ ts: "2026-10-01T09:00:00Z", jev: { secim: "guvenli" } })];
  assert.deepEqual(jevSonBilinen(h, g), { ts: "2026-10-02T10:00:00Z", durum: "kota dolu (429)", iyi: false });
  assert.equal(jevSonBilinen([], [...g, JSON.stringify({ ts: "2026-10-03T09:00:00Z", jev: {} })]).durum, "yanıt verdi");
  assert.equal(jevSonBilinen([], []), null);
  const sv = net.createServer().listen(0, "127.0.0.1");
  await new Promise((z) => sv.once("listening", z));
  const port = sv.address().port;
  assert.equal(await portAcik(port), true);
  await new Promise((z) => sv.close(z));
  assert.equal(await portAcik(port), false);
  // tarayıcı açma: Chrome tek argümanla, yeni pencere/uygulama kipi yok; Chrome yoksa rundll32'ye düşer
  const bulundu = chromeYolu((p) => p.startsWith(String.raw`C:\Program Files\Google`));
  assert.ok(bulundu?.endsWith("chrome.exe"), "Chrome yolu bulunuyor");
  assert.ok(chromeYolu(() => false) === null, "Chrome yoksa null");
  const ck = acKomutu("http://127.0.0.1:8820/?t=x", bulundu);
  assert.equal(ck.komut, bulundu);
  assert.ok(!ck.args.some((x) => /^--(new-window|app)/.test(x)), "--new-window/--app yok");
  // argüman enjeksiyonu: yalnızca güvenli şemalar, "--" ayırıcısı
  assert.deepEqual(ck.args, ["--", "http://127.0.0.1:8820/?t=x"], "ayırıcı + adres");
  for (const kotu of ["--app=http://evil", "-x", "javascript:alert(1)", "http://127.0.0.1 --x", "https://a\nb"]) {
    assert.equal(adresGecerli(kotu), false, "red: " + kotu);
    assert.throws(() => acKomutu(kotu, bulundu), /geçersiz adres/, "acKomutu red: " + kotu);
  }
  for (const iyi of ["http://127.0.0.1:8820/?t=x", "http://localhost:1/", "https://example.com/a", "file:///C:/Users/x/raporlar/ozet.html"]) assert.equal(adresGecerli(iyi), true, "kabul: " + iyi);
  const fk = acKomutu("file:///C:/r/rapor.html", null);
  assert.equal(fk.komut, "rundll32.exe", "fallback rundll32");
  assert.deepEqual(fk.args, ["url.dll,FileProtocolHandler", "file:///C:/r/rapor.html"]);
  // penceresiz başlatma: spawn seçenekleri ve komutlar (gerçekten başlatmaz)
  for (const s of [OS, AI, LAYA, ARAMA]) {
    const k = baslatKomutu(s), o = spawnSecenek(k.cwd, k.env, 7);
    assert.equal(o.windowsHide, true, s.ad + ": windowsHide");
    assert.equal(o.detached, true, s.ad + ": detached");
    assert.ok(!("shell" in o) && !o.windowsVerbatimArguments, s.ad + ": shell yok");
    assert.deepEqual(o.stdio, ["ignore", 7, 7], s.ad + ": çıktı günlüğe");
    assert.ok(!/(^|[\/])cmd(\.exe)?$/i.test(k.komut), s.ad + ": cmd yok");
    assert.ok(!k.args.some((x) => /^\/[kc]$/i.test(x) || /\.bat$/i.test(x)), s.ad + ": cmd /k ve .bat yok");
    assert.ok(k.log.endsWith(".log"), s.ad + ": günlük dosyası");
  }
  assert.ok(baslatKomutu(AI).args.join(" ").endsWith("run baslat") && baslatKomutu(AI).cwd === AI_KOK, "AI: npm run baslat zepul-ai içinde");
  assert.ok(baslatKomutu(AI).log.endsWith("zepul-ai-sunucu.log") && baslatKomutu(OS).log.endsWith("orkestra-sunucu.log"));
  // arama paneli: npm run arama, zepul-ai kökünde, günlük zepul-arama.log, 8840, adres geçerli
  const ak = baslatKomutu(ARAMA);
  assert.deepEqual(ak.args, [NPM_CLI, "run", "arama"]);
  assert.equal(ak.cwd, AI_KOK);
  assert.ok(ak.log.endsWith("zepul-arama.log") && ak.log === ARAMA_LOG);
  assert.equal(ARAMA.port, 8840);
  assert.equal(adresGecerli(ARAMA_URL), true, "arama adresi geçerli");
  assert.deepEqual(acKomutu(ARAMA_URL, bulundu).args, ["--", ARAMA_URL]);
  assert.ok(MENU.some(([t, ad, f]) => t === "A" && /Arama panelini aç/.test(ad) && f), "A tuşu arama panelini açar");
  assert.equal(typeof AI.sonra, "function", "AI başlayınca arama paneli de denenir");
  // token yalnızca ekranda: adres satırında tam adres var; günlük başlığı ve başlatma komutlarında token yok
  const ta = tokenliAdres("http://127.0.0.1:8830/?t=gizliToken123");
  assert.ok(adresSatiri("AI", ta).includes("http://127.0.0.1:8830/?t=gizliToken123"), "ekranda tam adres");
  assert.ok(!adresSatiri("AI", null).includes("?t="));
  assert.ok(!logBaslik("AI").includes("gizliToken123") && !logBaslik("AI").includes("?t="), "günlük başlığında token yok");
  for (const s of [OS, AI, LAYA, ARAMA]) assert.ok(!JSON.stringify(baslatKomutu(s).args).includes("?t="), "komutta token yok");
  // limit: ortak önbellekten okunur (--onbellek uca gitmez), U tuşu --yenile; durum satırı biçimi
  assert.deepEqual(limitKomutu("--onbellek").args.slice(2), ["--onbellek", "--json", "--color", "never"]);
  assert.deepEqual(limitKomutu("--yenile").args.slice(2), ["--yenile", "--json", "--color", "never"]);
  assert.ok(limitKomutu("--onbellek").args[1].endsWith("limit.py"));
  assert.ok(MENU.some(([t, ad, f]) => t === "U" && /yenile/i.test(ad) && f), "U tuşu limiti yeniler");
  const simdiL = Date.parse("2026-10-04T10:51:00Z");
  const lj = (ek) => ({ claude: { windows: [{ name: "5-hour", used_percent: 12.4 }, { name: "7-day", used_percent: 40 }] }, yas_sn: 180, kaynak: "canli", ...ek });
  const yalin = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");
  const saatL = new Date(simdiL - 180_000).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  assert.equal(yalin(limitSatiri(lj(), simdiL)), `Limit: 5s %12 · hafta %40 · ${saatL} (canlı, 3 dk önce)`);
  assert.match(yalin(limitSatiri(lj({ kaynak: "yerel-onbellek" }), simdiL)), /\(önbellek, 3 dk önce\)$/);
  assert.match(yalin(limitSatiri(lj({ kaynak: "son-canli", bayat: true, yas_sn: 2400 }), simdiL)), /\(son canlı, 40 dk önce\) · BAYAT: limit bilinmiyor$/);
  assert.match(yalin(limitSatiri({ claude: { windows: [] }, yas_sn: null }, simdiL)), /Limit: 5s \? · hafta \?/);
  assert.equal(yalin(limitSatiri(null, simdiL)), "Limit: okunamadı");
  yaz(c.yesil("komut-merkezi öz-denetim: tamam"));
}

// ---------- giriş ----------

if (arg.includes("--test")) await test();
else if (arg.includes("--durum")) {
  yaz("  " + (await durumSatiri()).satir);
  yaz(`  OS panel adresi: ${adresOku(OS_URL_DOSYA) ? "bulundu" : "yok"} · AI panel adresi: ${adresOku(AI_URL_DOSYA) ? "bulundu" : "yok"} · zepul-ai: ${fs.existsSync(path.join(AI_KOK, "Baslat.bat")) ? "bulundu" : "yok"}`);
} else {
  const tus = arg.find((x) => !x.startsWith("--"));
  if (tus) { const ok = await calistir(tus); if (!ok) { hataYaz(`bilinmeyen tuş: ${tus}`); process.exit(1); } }
  else await menu();
}
