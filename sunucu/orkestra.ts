// Zepul OS orkestra sunucusu (Faz 1): ajan oturumları, gelen kutuları, bus MCP, kapı, SSE, JSONL log.
// Çalıştırma: npm run baslat   ·   şefsiz (panel testi): npx tsx sunucu/orkestra.ts --sef-yok   ·   düzgün kapatma: npm run kapat
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { query, createSdkMcpServer, tool, type Query, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { sdkMesajiOlaya, ozetle, maskele, maskeEkle, type Olay, type OlayGovde } from "./olay.ts";
import { kapiHookOlustur, kapiBagimliligi, sozlesmeIsle, maliyetSayaci, izinliCwd, rolSecenekleri, panelBasliklari, ownsCakismasi, sahiplikDurumu,
  limitIzleyici, ajanBaslatIsle, bekciOlay, brifliBaslat, denetciIstegi, denetimClaudeBekler, denetimIsle, yerelKuyruk, kopyaTemizle, denetimKopyalariniTemizle, denetimKoku, oturumuBitir, kapanisSonucuMu, hamHata, sefeYazIsle, cerceve, notrle, iletIsle, portSec, portDolu, panelUrlDosyasi, PANEL_VENDOR, dalDegisiklikleri, mergeBase, acikWorktreeler, aracSureTakibi,
  sefBaglami, kilometreTasi, skillOnayla, mutasyonKopyasiIsle, skillSecimi, faz5Zamanlayici, type Faz5Bag,
  yerelModeller, yerelHazirlik, yerelBaglam, initModelHatasi, yerelOlay, claudeErisimi, yerelYedekSor, yedektenBaslat, ASGARI_BAGLAM, BAGLAM_UYARI,
  zepulAiAnahtari, yetki, olaySec, layaIstatistik, oncekiOturumuDenetle, yetimSonuclari, onayListesi, alanIstegi, guvenIstegi, hepsiniOnayla, zepulAiGorevleri, sefTalimati, ikinciGorusKur,
  type BekciBag, type BaslatIstek, type Onaylar, type YedekBag } from "./baglama.ts";
import { varsayilanBagimlilik, modelHatasi, yerelMi, yerelAd, CLAUDE_MODELLERI, SEF_FABLE } from "./kapi.ts";
import { DenetimSemasi, type OncekiDenetim } from "./denetci.ts";
import { katipNotYaz } from "./hafiza.ts";
import { takipciKur, mevcutListesi, yerelAdresMi } from "./takipci.ts";
import { calistir } from "./yasam.ts";
import { dalFarki } from "./worktree.ts";
import { BrifSemasi } from "./brif.ts";
import { ccYoneticisi } from "./harness.ts";
import { ajanOrtami } from "./ortam.ts";
import { ayarOku, kuyrukOku, kuyrukDinle, rolModeli, alanEkle, alanCikar, guvenYoneticisi, VARSAYILAN_AYAR, type Ayar } from "./bekci.ts";
import { SozlesmeSemasi, type Sozlesme } from "./sozlesme.ts";
import { desenNormalize } from "./yol.ts";
import { sahiplikBirak } from "./brif.ts";
import { raporUret, bildirMetni } from "../araclar/rapor.mjs";
import { atlanir as ntfyAtlanir, bildir as ntfyGonder } from "../araclar/ntfy.mjs"; // K12: test modunda ZEPUL_NTFY_KONU ile ayrı konuya gider // tsx .mjs'i doğrudan çözer
import { stopHook, olumAdaylari, olumEsigi, diriltmePlani, kirliDosyalar, sonCommit, bazAl, OLUM_ESIK_MS, AZAMI_DIRILTME, type Baz } from "./yasam.ts";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Çökme ve port dolu çıkışında: süreç kapanmadan ntfy doğrudan denenir (ntfy() alt süreci çıkışta ölebilir). En çok 2 sn, hata yutulur.
const ntfyBekle = (baslik: string, mesaj: string): Promise<unknown> => ntfyAtlanir()
  ? Promise.resolve(console.log(`[ntfy atlandı, ZEPUL_TEST] ${baslik} | ${mesaj}`))
  : Promise.race([ntfyGonder(baslik, mesaj).catch(() => {}), new Promise((r) => setTimeout(r, 2000))]);
const HOST = "127.0.0.1";
let PORT = 8820; // K18: ZEPUL_PORT ile değişir (baglama.ts portSec)
try { PORT = portSec(); } catch (e) { console.error(`HATA: ${(e as Error).message}`); process.exit(1); }
const TAMPON = 5000;
const ISCI_ROLLERI = ["isci", "denetci", "hata-avcisi", "birlestirici", "katip", "skill-bahcivani", "raporcu"] as const;
// D15: olaylarda ve bus'ta başka anlamı olan adlar; "sef" yalnızca şefin kendisine.
const AYRILMIS_ADLAR = ["sunucu", "kullanici", "kapi", "sef", "zepul-ai"];
const SEF_GOREV = "Hazırsın. Kullanıcıdan görev bekle. Görev gelince brif şablonuna göre işçi başlat.";
const HOST_IZINLI = new RegExp(String.raw`^(127\.0\.0\.1:${PORT}|localhost:${PORT}|([a-z0-9-]+\.)+ts\.net(:\d+)?)$`, "i");

// Oturumlar abonelikle çalışsın (SPIKE): API anahtarı alt süreçlere geçmesin.
if (process.env.ANTHROPIC_API_KEY !== undefined) {
  delete process.env.ANTHROPIC_API_KEY;
  console.log("ANTHROPIC_API_KEY süreçten silindi; oturumlar aboneliği kullanır.");
}

const TOKEN = process.env.ZEPUL_TOKEN || crypto.randomBytes(18).toString("base64url");
if (TOKEN.length < 22) { // S5: rastgele token 24 karakter; kısa elle token tahmin edilebilir
  console.error("HATA: ZEPUL_TOKEN en az 22 karakter olmalı. Boş bırakırsan her açılışta rastgele üretilir.");
  process.exit(1);
}
maskeEkle(TOKEN); // S2: token olay metnine, loga ya da Jev'e sızarsa maskelenir
const TOKEN_B = Buffer.from(TOKEN);
// S1: panel adresi (token'lı) repo dışında durur; ajanlar repoyu okur. Test modunda kullanıcının dosyası ezilmez (K23).
const PANEL_URL_DOSYASI = panelUrlDosyasi();
// Faz 7: zepul-ai'nin dar yetkili anahtarı (baglama.ts yetki). Test modunda test dizinine yazılır; okunamazsa sunucu açılmaz.
let ZEPUL_AI_B: Buffer;
try { const k = zepulAiAnahtari(); maskeEkle(k); ZEPUL_AI_B = Buffer.from(k); }
catch (e) { console.error(`HATA: zepul-ai anahtarı hazırlanamadı: ${(e as Error).message}`); process.exit(1); }

// ---------- Olay deposu: halka tampon + JSONL + SSE ----------

fs.mkdirSync(path.join(REPO, "logs"), { recursive: true });
const olayLog = fs.createWriteStream(path.join(REPO, "logs/olaylar.jsonl"), { flags: "a" });
const hataLog = fs.createWriteStream(path.join(REPO, "logs/hatalar.jsonl"), { flags: "a" });
// D1: log dosyası yazılamazsa (disk dolu, kilit, izin) sunucu düşmez: dosya kaydı durur, SSE ve tampon sürer, insana bir kez ntfy.
let logDurdu = false;
function logHatasi(e: Error) {
  if (logDurdu) return;
  logDurdu = true;
  console.error(`HATA: log dosyasına yazılamıyor, dosya kaydı durdu (SSE ve tampon sürüyor): ${e.message}`);
  ntfy("Zepul OS: hata: log yazılamıyor", "olay logu diske yazılamıyor; sunucu çalışıyor, disk ve izinlere bak");
}
olayLog.on("error", logHatasi);
hataLog.on("error", logHatasi);
const OTURUM = Date.now().toString(36); // yeniden başlatmada olay id'leri çakışmasın
let sayac = 0;
const olaylar: Olay[] = [];
const akislar = new Set<http.ServerResponse>();
// S4: en çok 8 canlı akış; okumayan akışın kuyruğu 1 MB'ı aşınca kesilir (bellek şişmesin). Panel yeniden bağlanır,
// boşluğu /api/olaylar ile doldurur.
const AZAMI_AKIS = 8, AKIS_KUYRUK = 1_000_000;
// tarama-3 aday 2: açılışta (SSE istemcisi yokken) kapatılan yetim görevlerin sonuçları ilk zepul-ai akışına yeniden gönderilir.
const yetimler = yetimSonuclari(yay);
function akisYaz(r: http.ServerResponse, veri: string) {
  if (r.writableLength <= AKIS_KUYRUK) return void r.write(veri);
  akislar.delete(r);
  r.destroy();
}

type Kutu = ReturnType<typeof gelenKutusu>;
type Ajan = {
  id: string; ad: string; rol: string; model: string; durum: string; maliyet_usd: number;
  baslangic: string; son_olay_ts: string; worktree: string; dal: string | null; gorev_ozet: string;
  gorev: string; // D5: tam görev; session_id'siz yeni oturumda diriltme metninin önüne eklenir (API'de yok)
  owns?: string[]; kutu: Kutu; q?: Query; onEk?: string;
  sessionId?: string; oturumBitti?: boolean; // resume için: init'teki session_id; query iterator'ü bitti ya da çöktü
  acikArac: Set<string>; // arac olayı gelmiş, arac_sonuc gelmemiş arac_id'ler (F4: uzun araç ölü sayılmasın)
  maliyet: ReturnType<typeof maliyetSayaci>; // F10: oturumların toplamı
  baz?: Promise<Baz | null>; baz_sha?: string | null; // F9: ajan başlarken HEAD ve kirli yollar
  // Faz 3: talimat = brifMetni + npm notu (sistem talimatı; API'de yok). repo: işçinin birleşeceği ana depo (worktree'li işçi).
  talimat?: string; repo?: string; brif_kabul?: string;
  // Denetçi: incelediği işçi; Edit/Write yalnızca yazilabilir_kokler altına (kapı hook'u, baglama.ts). Kökler sahiplik haritasına
  // <kök>/** → denetçi olarak da yazılır; bitti/olu olunca bırakılır, diriltmede geri alınır.
  denetci_icin?: string; yazilabilir_kokler?: string[];
  denetimde?: boolean; // işçi: denetçisi çalışıyor, yeni sözleşme işlenmez
  onceki_denetim?: OncekiDenetim; // işçi (K30): son denetimin kararı; yeniden denetimde yeni denetçiye girdi
  denetim?: { degisen: string[]; commitler: string[]; kopya_koku: string }; // denetçi: başlarken dalFarki
};
const ajanlar = new Map<string, Ajan>();
// Yerel yuva (baglama.ts yerelKuyruk): ilk görev yuva boşalana dek bekler (durum kuyrukta). Her durum olayında ve oturum bırakılınca tik.
const yerelSira = yerelKuyruk({
  ajanlar: () => [...ajanlar.values()].map((a) => ({ id: a.id, rol: a.rol, model: a.model, durum: a.durum, denetimde: a.denetimde, oturum: !!a.q })),
  azami: () => limit.ayar.yerel_azami,
  durum: (id, durum) => void yay({ ajan: id, tur: "durum", durum }),
});
// Panel yoklamasın: `kuyruk` olayı = bekleyen iş kuyruğu (bekci.ts) + yerel yuva sırası (durum kuyrukta). Yerel sıra her durum geçişinde yeniden hesaplanır.
const yerelSirada = () => [...ajanlar.values()].filter((a) => a.durum === "kuyrukta").map((a) => ({ id: a.id, ad: a.ad, model: a.model }));
const kuyrukYay = (bekleyen: unknown[], sebep: string) => void yay({ ajan: "sunucu", tur: "kuyruk", bekleyen, yerel: yerelSirada(), sebep });
kuyrukDinle((bekleyen, sebep) => kuyrukYay(bekleyen, sebep));
const sahiplik = new Map<string, string>(); // glob → ajan id
const onaylar: Onaylar = new Map();
const duzeltmeSayisi = new Map<string, number>(); // ajan id → sözleşmeden açılan düzeltme turu
// Faz 7: zepul-ai görevleri (baglama.ts); yay() şefin olaylarını buraya geçirir, sonuç gorev_id'ye bağlanır. yay'dan önce kurulur.
const zai = zepulAiGorevleri({
  yay: (o) => void yay(o),
  sefe: (m, onek) => { const s = ajanlar.get("sef"); return !!s && !kapaniyor && mesajIlet("zepul-ai", s, m, onek); },
  sunucudan: (m) => sefeYaz("sunucu", m),
  ntfy: (baslik, mesaj) => ntfy(baslik, mesaj), // yetenek görevi TAMAM: "yeni yetenek hazır" bilgilendirmesi
  sureMs: (y) => (y ? limit.ayar.yetenek_gorev_sure_dk : limit.ayar.gorev_sure_dk) * 60_000, // görev açılırken geçerli ayar
  // Duman testi için ZEPUL_TEST=1 iken ZEPUL_ZAI_CEVAP_SN ile kısalır (ZEPUL_RAPOR_SN gibi); yoksa 24 saat.
  ...(process.env.ZEPUL_TEST === "1" && Number(process.env.ZEPUL_ZAI_CEVAP_SN) > 0 ? { cevapMs: Number(process.env.ZEPUL_ZAI_CEVAP_SN) * 1000 } : {}),
});

let takipOlay: ((o: Olay) => void) | undefined; // GitHub takipçisi (aşağıda kurulur): kurulum işçisinin birleşme/bitiş olayları
const aracSure = aracSureTakibi();
let yerelOnceki = 0; // son yayılan yerel sıra uzunluğu
function yay(g: OlayGovde): Olay {
  if ((g.tur === "arac" || g.tur === "metin") && ajanlar.get(g.ajan)?.durum === "bekliyor") yay({ ajan: g.ajan, tur: "durum", durum: "calisiyor" });
  const o = { id: `o-${OTURUM}-${++sayac}`, ts: new Date().toISOString(), ...g } as Olay;
  const sure = aracSure(o);
  if (sure) Object.assign(o, sure); // sure_ms (onay beklemesi hariç), varsa onay_ms
  const a = ajanlar.get(o.ajan.split("/")[0]);
  if (a) {
    a.son_olay_ts = o.ts;
    if (o.tur === "durum" && a.id === o.ajan) {
      a.durum = o.durum as string;
      sahiplikDurumu(a.id, a.durum, sahiplik); // D9: bitti/olu OWNS'u bırakır
    }
    if (o.tur === "arac") a.acikArac.add(o.arac_id as string);
    if (o.tur === "arac_sonuc") a.acikArac.delete(o.arac_id as string);
    // Tur bitti (result), oturum kapandı/çöktü ya da bekçi durdurdu: sonucu gelmeyecek araç kalmaz.
    if (o.tur === "durum" && a.id === o.ajan && ["bekliyor", "bitti", "hata", "durduruldu"].includes(o.durum as string)) a.acikArac.clear();
    if (o.tur === "maliyet" && a.id === o.ajan) { // alt maliyet (sef/ikinci-gorus) ayrı seridir, ajanın oturum maliyetini ezmez
      // Olaydaki maliyet_usd ajanın tüm oturumlarının toplamıdır (panel ve rapor birikimli değer bekler); oturum_usd bu query'ninki.
      // oturum: SDK session_id; rapor orkestra oturumlarını test oturumlarından bununla ayırır.
      o.oturum_usd = o.maliyet_usd;
      o.oturum = a.sessionId;
      o.maliyet_usd = a.maliyet_usd = a.maliyet.oturumUsd(o.maliyet_usd as number);
      o.toplam_usd = [...ajanlar.values()].reduce((t, x) => t + x.maliyet_usd, 0);
    }
  }
  if (o.tur === "hata" && typeof o.mesaj === "string" && !o.ayrinti) { const h = hamHata(o.mesaj); if (h.ayrinti) { o.mesaj = h.mesaj; o.ayrinti = ozetle(h.ayrinti); } }
  olaylar.push(o);
  if (olaylar.length > TAMPON) olaylar.shift();
  const satir = JSON.stringify(o);
  if (!logDurdu && !olayLog.writableEnded) {
    olayLog.write(satir + "\n");
    if (o.tur === "hata" || o.log_hata) hataLog.write(satir + "\n");
  }
  for (const r of akislar) akisYaz(r, `event: olay\ndata: ${satir}\n\n`);
  if (a && o.tur === "durum") {
    yerelSira.tik();
    const n = yerelSirada().length;
    if (n !== yerelOnceki) { yerelOnceki = n; void kuyrukOku().then((k) => kuyrukYay(k, "yerel-sira"), () => kuyrukYay([], "yerel-sira")); }
  }
  if (a) bekciOlay(o, bekciBag); // döngü bekçisi (baglama.ts); ürettiği olaylar yeniden buradan geçer
  zai.olay(o);
  takipOlay?.(o);
  return o;
}

const hataOlayi = (ajan: string, kaynak: string, tur_adi: string, mesaj: string, devam_edilebilir: boolean, oneri: string) =>
  yay({ ajan, tur: "hata", kaynak, tur_adi, ...((h) => ({ mesaj: ozetle(h.mesaj), ...(h.ayrinti && { ayrinti: ozetle(h.ayrinti) }) }))(hamHata(mesaj)), geri_alinabilir: true, devam_edilebilir, oneri });

// ---------- Gelen kutusu (spike deseni): push() mesaj ekler, close() akışı bitirir ----------

function gelenKutusu() {
  const kuyruk: SDKUserMessage[] = [];
  let uyandir: (() => void) | null = null;
  let kapali = false;
  return {
    get kapali() { return kapali; },
    push(metin: string) {
      if (kapali) return;
      kuyruk.push({ type: "user", message: { role: "user", content: metin }, parent_tool_use_id: null });
      uyandir?.();
    },
    close() { kapali = true; uyandir?.(); },
    async *[Symbol.asyncIterator]() {
      while (true) {
        while (kuyruk.length) yield kuyruk.shift()!;
        if (kapali) return;
        await new Promise<void>((r) => (uyandir = r));
        uyandir = null;
      }
    },
  };
}

// Ajanın gelen kutusuna iter; şefin bekleyen ilk görevi varsa ilk mesajın önüne eklenir. Yerel sıradaki ajanın mesajı
// ilk görevle birlikte gider (av2-3). D7: kutu kapalıysa mesaj kaybolur; false döner, çağıran hata verir.
function ilet(a: Ajan, metin: string): boolean { return iletIsle(a, metin, yay); }

function bilgiEkle(a: Ajan, satir: string) {
  if (!a.kutu.kapali) a.onEk = a.onEk ? `${a.onEk}\n${satir}` : satir;
}

// av2-1: gövde cerceve() ile nötrlenir; kaynak etiketi (ve zepul-ai'nin güven öneki) yalnızca kodun koyduğu öndür.
function mesajIlet(kimden: string, hedef: Ajan, metin: string, onek = ""): boolean {
  if (hedef.kutu.kapali) return false; // iletilmeyen mesaj panelde "gitti" görünmesin
  yay({ ajan: kimden, tur: "mesaj", kimden, kime: hedef.id, metin: maskele(metin) });
  return ilet(hedef, cerceve(`[${kimden} → ${hedef.id}]${onek && ` ${onek}`}`, metin));
}

// Şefe mesaj (tur başlatır) ve bilgi satırı (tur başlatmaz). --sef-yok: şef yok, yalnızca panelde görünür.
function sefeYaz(kimden: string, metin: string) {
  const sef = ajanlar.get("sef");
  sefeYazIsle(kimden, metin, { kapaniyor, ilet: sef ? () => mesajIlet(kimden, sef, metin) : null, yay });
}
function sefeBilgi(satir: string) {
  const sef = ajanlar.get("sef");
  if (sef) bilgiEkle(sef, satir);
}

// ---------- Kapı: her araç çağrısında PreToolUse ----------

// ntfy yalnızca onay sorusu ve diriltme tükendiğinde (KURALLAR L). Bildirim bir kolaylıktır: hata yutulur. Mesajda yol ya da sır yok.
// Duman testinde (ZEPUL_TEST=1) telefona sahte soru gitmesin diye yalnızca konsola yazılır.
function ntfy(baslik: string, mesaj: string) {
  if (ntfyAtlanir()) return void console.log(`[ntfy atlandı, ZEPUL_TEST] ${baslik} | ${mesaj}`);
  spawn(process.execPath, [path.join(REPO, "araclar/ntfy.mjs"), baslik, mesaj], { stdio: "ignore", windowsHide: true }).on("error", () => {});
}
// Aday 7: onay yaklaşık 10 dk (ONAY_MS) içinde gelmezse "hayir" sayılır; ilk bildirim bunu söyler, süre dolunca tek uyarı gider (girdi yok).
const bildir = (arac: string, kesin?: boolean) => kesin
  ? ntfy("Zepul OS: soru: kesin yasak onayı bekleniyor", `${arac} için yaklaşık 10 dk içinde yalnızca senin onayın gerekiyor (kesin yasak), yoksa reddedilir`)
  : ntfy("Zepul OS: soru: onay bekleniyor", `${arac} için yaklaşık 10 dk içinde onay gerekiyor, yoksa reddedilir`);
const sureDoldu = (arac: string) => ntfy("Zepul OS: uyarı: onay süresi doldu, reddedildi", `${arac} için onay süresinde gelmedi; işlem reddedildi`);

// Kapının tek kaynağı kapi.ts (kapiKarari); hook'a çeviren bağlama baglama.ts'te. Jev hatası → hata olayı (SSE + hatalar.jsonl).
const kapiBag = kapiBagimliligi(yay, undefined, ntfy); // ntfy: tam güvende ajanın riskli işlemi için uyarı (10 dk'da bir)

// ---------- Faz 5: hafıza (MyBrain) ve skill bahçıvanı (baglama.ts) ----------
// Bahçıvan ve işçi skill seçimi Jev'i 30 sn zaman aşımıyla sorar (kapının 2,5 sn'si değil). MyBrain'e yazma yalnızca kilometreTasi (kod).
const faz5: Faz5Bag = { repo: REPO, yay, sefeBilgi, jevSor: varsayilanBagimlilik({ zamanAsimiMs: 30_000 }).jevSor };
let faz5Z: ReturnType<typeof faz5Zamanlayici> | undefined; // sunucu dinlemeye başlayınca kurulur; _test/bahcivan ucu kullanır
const SEF_BAGLAM_SORGUSU = "Zepul OS orkestra şefi: oturum başı, açık işler, son kararlar ve kurallar";

const limit = limitIzleyici({ yay, ntfy, sefe: (m) => sefeYaz("sunucu", m), sefeBilgi });
setInterval(() => { if (!kapaniyor) void limit.tik(); }, 60_000).unref();

// ---------- Çalışma alanları (docs/sozlesme/calisma-alanlari.md) ----------
// Güncel liste bellekte: kapı her araç çağrısında okur (limit.ayar 60 sn bayat olabilir). Değişiklik ayar dosyasına yazılır, `alanlar` olayı yayılır.
let alanlar: string[] = (await ayarOku().catch(() => VARSAYILAN_AYAR)).calisma_alanlari;
async function alanIslem(islem: "ekle" | "cikar", yol: string, kim: string): Promise<string[]> {
  alanlar = islem === "ekle" ? await alanEkle(yol, kim) : await alanCikar(yol, kim);
  yay({ ajan: "sunucu", tur: "alanlar", alanlar });
  return alanlar;
}

// ---------- Claude Code oturumları (docs/harness-mimari.md) ----------
// Panelden `claude -p`; olaylar ajan id'si cc-<…> ile aynı SSE kanalına. Ortamda panel belirteci yok (ajanOrtami), cwd izinli köklerde.
const cc = ccYoneticisi({ kayitDosyasi: path.join(REPO, "logs/cc-oturumlar.jsonl"), yay: (g) => void yay(g), env: ajanOrtami(process.env), kurallar: () => kurallar(),
  cwdDenetle: (c) => izinliCwd(c, REPO, testKoku(), alanlar) });
const ccJson = (k: ReturnType<typeof cc.liste>[number]) => ({ id: k.id, ad: `Claude Code · ${path.basename(k.cwd)}`, rol: "claude-code", model: k.model,
  durum: k.durum, maliyet_usd: k.maliyet_usd, baslangic: k.baslangic, son_olay_ts: k.son_olay_ts, worktree: k.cwd, dal: null, gorev_ozet: k.istem_ozet,
  session_id: k.session_id, izin: k.izin, pid: k.pid, kabul: k.kabul ?? null, denetler: k.denetler ?? null });

// ---------- Güven modu (docs/sozlesme/guven-modu.md) ----------
// Kademe bellekte (kapı her araçta okur); yalnız POST /api/guven (panel ya da zepul-ai düğmesi) yazar. Süre dolunca jev'e döner.
// Her değişiklik `guven` olayıyla yayılır. Ayar dosyası okunamazsa varsayılan jev kalır.
const guven = guvenYoneticisi({ bildir: (g, neden) => yay({ ajan: "sunucu", tur: "guven", ...g, neden }) });
await guven.yukle().catch(() => {});
// ---------- İkinci görüş (yetenek-dongusu.md 3; baglama.ts ikinciGorusYoneticisi) ----------
// Şefin ikinci_gorus aracı: ayrı salt okur oturum, model ayardan (yalnız panel yazar). Araçları şef gibi kapıdan geçer.
const ikinciGorus = ikinciGorusKur({ repo: REPO, ayar: () => limit.ayar, sahiplik, bagimlilik: kapiBag, yay, onaylar, bildir, sureDoldu,
  alanlar: () => alanlar, guven: () => guven.al() });
const guvenDurumu = () => ({ ...guven.al(), jev_soguma_bitis: (kapiBag.soguma?.jev_bitis ?? 0) > Date.now() ? kapiBag.soguma!.jev_bitis : null });

// ---------- Günlük GitHub takipçisi (sunucu/takipci.ts) ----------
// Kurulum şefin ajan_baslat yolundan geçer (ajanBaslatIsle: brif, limit, worktree'li işçi, denetçi, birleşme). Ayarlar yalnız panelden.
const takip = takipciKur({ repo: REPO, raporDizin: path.join(REPO, "raporlar"), mevcut: () => mevcutListesi(REPO), ayar: () => limit.ayar, limit: () => limit.karar(),
  yay,
  kurulumBaslat: (brif) => {
    const baslat = (x: Parameters<typeof brifliBaslat>[0]) => brifliBaslat(x, { repo: REPO, kurallar: kurallar(), ajanBaslat, skillSec: (g) => skillSecimi(g, faz5), alanlar });
    return ajanBaslatIsle(brif as unknown as Record<string, unknown>, { karar: limit.karar, sahiplik, baslat, yedek: yedekBag(baslat) });
  } });
takipOlay = (o) => takip.olay(o);
// Takip kurulum işçisinin birleşme kapısı: worktree'de `npm run denetim` (npm-cli doğrudan node ile; kabuk yok). Çalışmazsa birleşmez.
const NPM_CLI = process.env.npm_execpath?.endsWith(".js") ? process.env.npm_execpath : path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
const takipDenetimi = (wt: string) => () => calistir(process.execPath, [NPM_CLI, "run", "denetim"], wt, 15 * 60_000).then(() => null, (e: Error) => `npm run denetim: ${ozetle(e.message)}`);

// ---------- Bekçi: döngü koruması (baglama.ts bekciOlay) ----------
// Durum olay.ajan başına (alt ajan ayrı), ajan kaydıyla birlikte ilk olayında açılır; diriltme ve yeni oturumda sıfırlanmaz.
const bekciBag: BekciBag = {
  durumlar: new Map(), commitAraclari: new Set(), ayar: () => limit.ayar, ajan: (id) => ajanlar.get(id), yay, ntfy, sefeBilgi,
  sefe: (m) => sefeYaz("sunucu", m),
  ajanaMesaj: (id, m) => { const x = ajanlar.get(id); if (x && !mesajIlet("sunucu", x, m)) hataOlayi(id, "ajan", "bekci_iletilemedi", "bekçi uyarısı iletilemedi: gelen kutusu kapalı", true, "şef ajana yeniden görev versin"); },
  interrupt: (id) => void ajanlar.get(id)?.q?.interrupt().catch(() => {}),
};

// ---------- Bus MCP (ajan başına ayrı örnek: çağıranın kimliği bilinir) ----------

const tavan = z.number().min(0).max(100).nullable().optional();
const pozitif = z.number().positive().optional();
const AyarYama = { haftalik_tavan_yuzde: tavan, bes_saat_tavan_yuzde: tavan, maliyet_hizi_usd_10dk: pozitif, tekrar_uyari: pozitif, tekrar_durdur: pozitif, ilerlemesiz_dk: pozitif };
const yanit = (text: string, isError = false) => ({ content: [{ type: "text" as const, text }], ...(isError ? { isError: true } : {}) });

function busSunucusu(a: Ajan) {
  const mesajGonder = tool("mesaj_gonder", "Başka bir ajanın gelen kutusuna mesaj gönderir. Şefe yazmak için kime=\"sef\".",
    { kime: z.string(), metin: z.string().min(1) },
    async ({ kime, metin }) => {
      const h = ajanlar.get(kime);
      if (!h || !mesajIlet(a.id, h, metin)) return yanit(`"${kime}" adlı açık bir ajan yok`, true);
      return yanit("iletildi");
    });

  if (a.rol === "sef") return createSdkMcpServer({ name: "bus", alwaysLoad: true, tools: [
    tool("ajan_baslat", `Yeni bir ajan başlatır. Brif alanları zorunlu: ad, rol, model (tam kimlik), gorev (en az 20 karakter), baglam (neden, mevcut durum, bilinmesi gereken; en az 20 karakter), owns (yazabileceği yollar, ör. "panel/**"; işçide en az 1), dokunma ([{yol, sahip}]; boş olamaz, yoksa [{yol:\"(yok)\", sahip:\"-\"}]), once_oku (en az 1), kabul (bitti tanımı). İşçiyi (rol isci, ad en çok 32 karakter) kod kendi worktree'sinde açar (dal is/<ad>); zepul-os işinde cwd verme. Başka bir projede iş için cwd o projenin klasörüdür (çalışma alanı olmalı; işçi o projenin git deposunda worktree açar, birleştirme deponun o anki dalına; depo değilse yazma görevi reddedilir). İşçi TAMAM dönünce denetçiyi kod başlatır, PASS ise kod main'e birleştirir. Diğer roller cwd'de (boşsa repo). Denetçi bu araçla açılmaz. En fazla ${azamiIsci()} aktif işçi (kullanıcı ayarı azami_isci). Yerel modelli ajanlardan aynı anda en çok yerel_azami (varsayılan 1) çalışır; fazlası "kuyrukta" durumunda sırasını bekler, reddedilmez. Limit tavanı doluysa iş kuyruğa alınır; kuyruktaki işi başlatmak için aynı alanlar + kuyruk_id.`,
      { ...BrifSemasi.shape, kuyruk_id: z.string().optional() },
      async (p) => {
        // Brif, limit kapısı ve kuyruk baglama.ts'te (ajanBaslatIsle); kuyruk dosyası okunamazsa aracın sonucu hata.
        try {
          const baslat = (brif: Parameters<typeof brifliBaslat>[0]) => brifliBaslat(brif, { repo: REPO, kurallar: kurallar(), ajanBaslat, skillSec: (g) => skillSecimi(g, faz5), alanlar });
          const r = await ajanBaslatIsle(p, { karar: limit.karar, sahiplik, baslat, yedek: yedekBag(baslat) });
          return yanit(r.metin, r.hata);
        } catch (e) { return yanit((e as Error).message, true); }
      }),
    mesajGonder,
    tool("ajanlar", "Ajanların kısa durum listesi.", {}, async () =>
      yanit(JSON.stringify([...ajanlar.values()].map((x) => ({ id: x.id, rol: x.rol, model: x.model, durum: x.durum, maliyet_usd: x.maliyet_usd }))))),
    tool("ayar_yaz", "Bekçi ayarlarını yazar; yalnızca verilen alanlar değişir. Tavanı kaldırmak için null. Yazımdan sonra limit hemen yeniden değerlendirilir.",
      AyarYama,
      async (p) => {
        try { const a = await limit.ayarYaz(p as Partial<Ayar>, "sef"); return yanit(`ayar yazıldı: ${JSON.stringify(a)}. Limit: ${limit.karar().neden}`); }
        catch (e) { return yanit((e as Error).message, true); }
      }),
    tool("zepul_ai_sor", "zepul-ai'den gelen görev riskli, geri alınamaz ya da belirsizse kullanıcıya zepul-ai üzerinden 'emin misin?' sorar. Cevap gelen kutuna '[kullanıcı, zepul-ai üzerinden] evet|hayir <not>' olarak gelir; gelene dek o görevde riskli adım atma, turu bitir. 24 saatte cevap gelmezse görev iptal olur. gorev_id verilmezse üzerinde çalıştığın zepul-ai görevi.",
      { soru: z.string().min(1).max(2000), gorev_id: z.string().optional() },
      async ({ soru, gorev_id }) => {
        const r = zai.soru(soru, gorev_id);
        return r.soru_id ? yanit(`soru gönderildi (${r.soru_id}); turu bitir, cevap gelen kutuna gelecek`) : yanit(r.hata!, true);
      }),
    tool("ikinci_gorus", "Ayrı bir modele (kullanıcının panelde seçtiği ikinci_gorus_modeli) salt okur, tek istemli bir oturumda danışır; görüşü metin olarak döner (en çok 5 dk). Reddetmeden önce, mimari ya da geri dönüşü zor planda ve VETO anlaşmazlığında kullan.",
      { soru: z.string().min(1).max(4000), baglam: z.string().max(12_000) },
      async (p) => { const r = await ikinciGorus(p); return yanit(r.metin, r.hata); }),
    tool("skill_onayla", "Skill bahçıvanının taslağını (.claude/skills-taslak/<ad>) etkin skill yapar ve commit'ler. Yalnızca sen onaylarsın; Jev onay vermez. Belirsiz adayları kullanıcıya sor.",
      { ad: z.string() },
      async ({ ad }) => {
        try { return yanit(`skill etkin: ${path.relative(REPO, await skillOnayla(REPO, ad, yay))}`); }
        catch (e) { return yanit(ozetle((e as Error).message), true); }
      }),
  ] });

  // Denetçi (Faz 3): DenetimSemasi'nda sozlesme_don. mesaj_gonder yok: ham denetim şefe gitmez (1. çivi), sonucu kod yönlendirir.
  // av9: mutasyon kopyasını kabuk değil kod açar ve siler (mutasyon_kopyasi_ac / _sil); bu araçları yalnız denetçi görür.
  const kopyaAraci = (islem: "ac" | "sil") => async (p: { ad: string; ref?: string }) => {
    const isci = a.denetci_icin ? ajanlar.get(a.denetci_icin) : undefined;
    if (!isci?.repo || !isci.dal || !a.denetim) return yanit("denetlenen işçi ya da denetim kaydı bulunamadı", true);
    const r = await mutasyonKopyasiIsle(islem, p, { repo: isci.repo, dal: isci.dal, kopya_koku: a.denetim.kopya_koku });
    return yanit(r.metin, r.hata);
  };
  if (a.rol === "denetci") return createSdkMcpServer({ name: "bus", alwaysLoad: true, tools: [
    tool("mutasyon_kopyasi_ac", "Mutasyon kopyası açar: kopya kökü altında <ad> için git worktree add --detach (ref verilmezse işçinin dalı). Kopyanın mutlak yolunu döner. Kabukta git worktree yazma.",
      { ad: z.string().regex(/^[a-z0-9][a-z0-9-]{0,31}$/), ref: z.string().min(1).optional() }, kopyaAraci("ac")),
    tool("mutasyon_kopyasi_sil", "Kopya kökü altındaki <ad> mutasyon kopyasını kaldırır; bağlantı ise yalnız bağı siler, hedefine dokunmaz. Kabukta rm yazma.",
      { ad: z.string().regex(/^[a-z0-9][a-z0-9-]{0,31}$/) }, kopyaAraci("sil")),
    tool("sozlesme_don", "Denetim bitince çağır: görevdeki şemayla tek JSON {verdict: PASS|VETO, gerekce, kanitlar, kirmiziya_dondu, blockers, kapsam_disi?}. Reddedilirse düzelt, yeniden çağır.",
      DenetimSemasi.shape,
      async (s) => {
        if (a.kutu.kapali) return yanit("denetim zaten alındı; oturum kapanıyor");
        const isci = a.denetci_icin ? ajanlar.get(a.denetci_icin) : undefined;
        if (!isci?.repo || !isci.dal || !a.denetim) return yanit("denetlenen işçi ya da denetim kaydı bulunamadı", true);
        const r = denetimIsle(s, { denetci: a.id, model: a.model, isci: isci as Ajan & { repo: string; dal: string }, ...a.denetim, duzeltmeSayisi, cakismaSayisi, yay, ntfy, sefeBilgi, kapatBekle,
          kilometreTasi: (f, o, c) => kilometreTasi(f, o, c, faz5),
          ...(isci.id.startsWith("takip-") ? { birlesmeOncesi: takipDenetimi(isci.worktree) } : {}),
          isciye: (m) => { if (!mesajIlet(a.id, isci, m)) hataOlayi(isci.id, "ajan", "isciye_iletilemedi", "denetim sonucu işçiye iletilemedi: gelen kutusu kapalı", true, "şef işçiyi yeniden görevlendirsin"); },
          sefe: (m) => sefeYaz(a.id, m),
          kapat: () => a.kutu.close() });
        r.arka?.catch((e) => hataOlayi(isci.id, "arac", "birlesme_hatasi", (e as Error).message, true, "git worktree list ve main'i elle kontrol et"));
        return yanit(r.metin, r.hata);
      }),
  ] });

  return createSdkMcpServer({ name: "bus", alwaysLoad: true, tools: [
    mesajGonder,
    tool("sozlesme_don", "İş bitince çağır (önce commit at): {verdict, blockers, commits, ozet}. Şef ham çıktıyı değil yalnızca bunu görür. Reddedilirse düzelt ve tekrar çağır.",
      SozlesmeSemasi.shape,
      async (s) => {
        if (a.kutu.kapali) return yanit("sözleşme zaten alındı; oturum kapanıyor");
        const faz3 = !!(a.repo && a.dal);
        const r = await sozlesmeIsle(s, { ajan: a, sahiplik, yay, duzeltmeSayisi,
          kendine: (m) => { if (!mesajIlet("sunucu", a, m)) hataOlayi(a.id, "ajan", "duzeltme_iletilemedi", "düzeltme talimatı iletilemedi: gelen kutusu kapalı", true, "şef işçiye yeniden görev versin"); },
          sefe: (m) => sefeYaz(a.id, m), // --sef-yok: şef yok, sözleşme yalnızca panelde
          kapat: () => a.kutu.close(),
          ...(faz3 ? { denetciye: (v: Sozlesme) => void denetciBaslat(a, v), degisiklik: dalDegisiklikleri } : {}) });
        return yanit(r.metin, r.hata);
      }),
  ] });
}

// ---------- Faz 3: denetçiyi kod başlatır, oturumları kod kapatır ----------

const cakismaSayisi = new Map<string, number>(); // işçi id → birleştirme çakışması turu

let claudeErisilemez = false;
const bekleyenDenetim = new Map<string, Sozlesme>(); // işçi id → TAMAM sözleşmesi
function claudeErisimiDegisti(erisilir: boolean) {
  if (claudeErisilemez === !erisilir) return;
  claudeErisilemez = !erisilir;
  if (claudeErisilemez) return void hataOlayi("sunucu", "claude-api", "claude_erisilemez", "Claude erişilemiyor (limit, aşırı yük ya da sunucu hatası); denetimler bekletilir", true, "yerel_yedek ayarı açıksa yeni iş yerel modelle başlar");
  for (const [id, v] of bekleyenDenetim) {
    bekleyenDenetim.delete(id);
    const i = ajanlar.get(id);
    if (i) void denetciBaslat(i, v);
  }
}
const yedekBag = (baslat: (brif: Parameters<typeof brifliBaslat>[0]) => Promise<unknown>): YedekBag => ({
  ayar: () => limit.ayar, hazir: (m) => yerelHazirlik(m), erisilemez: () => claudeErisilemez,
  sor: (is, model, neden) => void yerelYedekSor(is, model, neden, { yay, ntfy, onaylar, baslat: () => yedektenBaslat(is, model, { sahiplik, baslat }) }),
});

async function denetciBaslat(isci: Ajan, v: Sozlesme) {
  // Faz 5.5: Claude denetçi, Claude erişilemezken iş "denetim bekliyor"da tutulur, erişim dönünce başlar. Yerel denetçi beklemez.
  if (denetimClaudeBekler(limit.ayar.modeller.denetci, claudeErisilemez)) {
    bekleyenDenetim.set(isci.id, v);
    hataOlayi(isci.id, "claude-api", "denetim_bekliyor", "Claude erişilemiyor; iş denetim bekliyor, Claude dönünce denetçi kodla başlar (denetçi modeli Claude)", true, "Claude erişimi dönünce kendiliğinden sürer");
    return;
  }
  try {
    const fark = await dalFarki(isci.repo!, isci.dal!);
    const istek = denetciIstegi({ id: isci.id, dal: isci.dal!, worktree: isci.worktree, brif_kabul: isci.brif_kabul, onceki_denetim: isci.onceki_denetim }, v, fark, await mergeBase(isci.repo!, isci.dal!));
    await fs.promises.mkdir(istek.kopya_koku, { recursive: true });
    const eski = ajanlar.get(istek.ad);
    let d: Ajan;
    if (!eski) d = ajanBaslat(istek);
    else {
      if (!eski.kutu.kapali) throw new Error(`${eski.id} hâlâ açık (durum: ${eski.durum})`);
      await kapatBekle(eski.id);
      if (kapaniyor) throw new Error("sunucu kapanıyor");
      Object.assign(eski, { gorev: istek.gorev, gorev_ozet: ozetle(istek.gorev).slice(0, 160), worktree: istek.cwd, yazilabilir_kokler: istek.yazilabilir_kokler });
      sahiplikBirak(sahiplik, eski.id); // önceki kopya kökünün kaydı
      kokleriSahiplen(eski);
      oturumuYenile(eski);
      await yerelSira.bekle(eski.id); // yerel denetçi de yuva bekler (işçinin turu bitmeden başlamaz)
      if (kapaniyor) throw new Error("sunucu kapanıyor");
      if (!ilet(eski, istek.gorev)) throw new Error("denetçinin gelen kutusu kapalı");
      d = eski;
    }
    d.denetim = { degisen: fark.dosyalar, commitler: fark.commitler.map((c) => `${c.sha.slice(0, 7)} ${c.mesaj}`), kopya_koku: istek.kopya_koku };
  } catch (e) {
    isci.denetimde = false;
    hataOlayi(isci.id, "ajan", "denetci_baslatilamadi", (e as Error).message, true, "işçi yeniden TAMAM dönerse denetim yeniden denenir; şef karar versin");
    sefeYaz("sunucu", `Denetçi başlatılamadı (${isci.id}): ${ozetle((e as Error).message)}. İşçi bekliyor; şef kararı gerekli.`);
  }
}

async function kapatBekle(id: string) {
  const a = ajanlar.get(id), q = a?.q;
  if (!a || !q) return;
  if (!(await oturumuBitir(a, 30_000))) await new Promise((r) => setTimeout(r, 1000));
  if (a.q === q && a.durum !== "bitti") yay({ ajan: a.id, tur: "durum", durum: "bitti" });
}

// ---------- Ajan kaydı ----------

function rolTalimati(p: { ad: string; rol: string; owns?: string[]; denetci_icin?: string }): string {
  if (p.rol === "denetci") return [
    `Sen Zepul OS orkestrasında "${p.ad}" adlı denetçisin; "${p.denetci_icin}" işçisinin işini bağımsız denetlersin. Görevin gelen kutundaki ilk mesajdır.`,
    "Salt okursun: Edit/Write yalnızca görevdeki kopya kökü altında çalışır; işçinin worktree'sine ve ana repoya yazma, commit atma.",
    "Sonucu yalnızca sozlesme_don ile, görevdeki şemada tek JSON olarak dön (verdict PASS|VETO, gerekce, kanitlar, kirmiziya_dondu, blockers). Araç reddederse düzelt, yeniden çağır. Rapor yazma.",
  ].join("\n");
  if (p.rol === "sef") return sefTalimati(azamiIsci());
  return [
    `Sen Zepul OS orkestrasında "${p.ad}" adlı ${p.rol} ajanısın. Görevin gelen kutundaki ilk mesajdır.`,
    p.owns?.length ? `OWNS (yalnızca buraya yazarsın): ${p.owns.join(", ")}` : "",
    "Başka bir ajanın dosyasına ihtiyaç duyarsan dokunma; mesaj_gonder ile sahibine yaz (şefe: kime=\"sef\").",
    "İş bitince commit at, sonra sozlesme_don aracını çağır: {verdict: TAMAM|KISMI|BASARISIZ, blockers[], commits[], ozet (en çok 3 cümle)}. Araç reddederse ya da düzeltme turu açarsa düzelt ve yeniden çağır. Uzun rapor yazma.",
  ].filter(Boolean).join("\n");
}

const blokSayaci = new Map<string, number>(); // Stop hook: session_id → engel sayısı

function oturumAc(a: Ajan, resume?: string) {
  const sef = a.rol === "sef";
  const kutu = gelenKutusu();
  const yerel = yerelMi(a.model);
  const q = query({ prompt: kutu, options: {
    model: yerel ? yerelAd(a.model) : a.model, // Faz 5.5: yerelde Ollama'daki ad; env rolSecenekleri'nde Ollama'ya yönlenir
    cwd: a.worktree,
    ...(resume ? { resume } : {}),
    systemPrompt: { type: "preset", preset: "claude_code", append: `${rolTalimati(a)}\n\n${a.talimat ?? kurallar()}` }, // brifli ajanda KURALLAR brifMetni'nin içinde
    settingSources: ["project"], // kullanıcı ayarları, hook'ları ve MCP'leri yüklenmez (SPIKE bulgu 1)
    strictMcpConfig: true,
    mcpServers: { bus: busSunucusu(a) },
    ...rolSecenekleri(a.rol, process.env, a.model), // araç listesi ve izin modu (baglama.ts); diriltme/resume da buradan geçer
    hooks: {
      PreToolUse: [{ hooks: [kapiHookOlustur({ ajan: a, kok: a.worktree, sahiplik, bagimlilik: kapiBag, yay, onaylar, bildir, sureDoldu,
        alanlar: () => alanlar, guven: () => guven.al(), alanEkle: (y) => alanIslem("ekle", y, "onay") })], timeout: 600 }],
      // Commit zorunluluğu: kirli ağaçla bitirme en çok iki kez engellenir; OWNS varsa yalnızca OWNS içi sayılır (F7). Şef dosya yazmaz, bağlanmaz.
      // Denetçi commit atmaz; işçinin worktree'si kirliyse onu durdurmak yanlış olurdu.
      ...(sef || a.rol === "denetci" ? {} : { Stop: [{ hooks: [stopHook(() => a.worktree, blokSayaci, (o) => yay({ ajan: a.id, ...o } as OlayGovde), a.owns)], timeout: 30 }] }),
    },
    forwardSubagentText: true,
    stderr: (d: string) => process.stderr.write(`[${a.id}] ${d}`),
  } });
  a.kutu = kutu;
  a.q = q;
  a.oturumBitti = false;
  a.maliyet.yeniOturum();

  (async () => {
    const altlar = new Map<string, string>();
    let initYazildi = false, baglamBakildi = false;
    try {
      for await (const m of q) {
        if (a.q !== q) break; // bırakılmış oturumun (vazgec, şef yeniden) geç mesajı ajanın durumunu ezmesin
        if (m.type === "system" && m.subtype === "init") {
          // Faz 5.5: yerel oturum init.model'i yerel ad değilse Claude'a düşmüş olabilir: istek gitmeden kapatılır, diriltilmez.
          const yonHata = initModelHatasi(a.model, m.model);
          if (yonHata) { vazgec(a, "yerel_yonlendirme_hatasi", yonHata, "yerel yönlendirme başarısız"); break; }
          a.sessionId = m.session_id;
          if (!initYazildi) console.log(`[${a.id}] init`, JSON.stringify({ model: m.model, apiKeySource: m.apiKeySource, permissionMode: m.permissionMode, tools: m.tools, mcp_servers: m.mcp_servers, resume: !!resume }));
          initYazildi = true;
        }
        if (m.type === "result" && !m.is_error) diriltmeDenemesi.delete(a.id); // tur hatasız bitti: ajan gerçekten dirildi
        if (!yerel) { const e = claudeErisimi(m as Parameters<typeof claudeErisimi>[0]); if (e !== null) claudeErisimiDegisti(e); }
        else if (m.type === "result" && !baglamBakildi) { // model artık yüklü: /api/ps gerçek bağlamı verir
          baglamBakildi = true;
          void yerelBaglam(yerelAd(a.model)).then((n) => {
            if (n === null || n < ASGARI_BAGLAM) hataOlayi(a.id, "ajan", "yerel_baglam_yetersiz", `${BAGLAM_UYARI} (${yerelAd(a.model)}: ${n ?? "bilinmiyor"}); istem kırpılıyor, yanıt güvenilmez`, true, "Ollama ayarı kullanıcı kararıdır");
          });
        }
        for (const o of sdkMesajiOlaya(a.id, m, altlar)) {
          // Bekçi durdurduysa interrupt'ın ürettiği tur sonucu (bekliyor/hata) durumu ezmez: hata diriltme turuna girerdi.
          // Kullanıcı ya da şef mesaj atınca ilet() calisiyor yayar, durdurma kalkar.
          if (o.tur === "durum" && o.ajan === a.id && a.durum === "durduruldu") continue;
          if ((kapaniyor || a.durum === "durduruldu") && kapanisSonucuMu(m, o)) continue; // K28: kapanış ve bekçi durdurması interrupt'ı hata değil
          yay(yerelOlay(o, a.model)); // yerel ajanın sahte maliyeti 0
        }
      }
      if (a.q === q && !kapaniyor) yay({ ajan: a.id, tur: "durum", durum: "bitti" }); // D12: kapanışta bitti'yi kapat() bir kez yayar
    } catch (e) {
      if (kapaniyor || a.q !== q) return;
      if (kutu.kapali || a.durum === "durduruldu") return void yay({ ajan: a.id, tur: "durum", durum: "bitti" });
      hataOlayi(a.id, "ajan", "oturum_coktu", (e as Error).message, true, "sunucu diriltmeyi dener (en çok 3 kez)");
      yay({ ajan: a.id, tur: "durum", durum: "hata" }); // ölüm döngüsü durum "hata" olanı diriltme planına alır
    } finally {
      kutu.close();
      if (a.q === q) a.oturumBitti = true;
    }
  })();
}

// D2: yuva durumdan sayılır (kutu sözleşmeyle erken kapanır, ölü ajanın kutusu açık kalabilir). haric: diriltilen ajanın kendisi.
// Denetçi yuva tutmaz: kod başlatır, işçisi o sırada bekler (tüm işçiler TAMAM dönünce denetçiler kilitlenmesin).
// Yuva sayısı bekçi ayarından (azami_isci, varsayılan 4); ayar dosyası okunamazsa son geçerli değer (limitIzleyici).
const azamiIsci = () => limit.ayar.azami_isci;
const yuvaTutar = (rol: string) => rol !== "sef" && rol !== "denetci";
const aktifIsci = (haric?: Ajan) => [...ajanlar.values()].filter((x) => x !== haric && yuvaTutar(x.rol) && x.durum !== "bitti" && x.durum !== "olu").length;

// Aynı kayıtta yeni oturum (resume yok): şefi yeniden başlatma, yeniden denetim. Maliyet ve bekçi durumu birikmeye devam eder.
function oturumuYenile(a: Ajan) {
  oturumuBirak(a);
  diriltmeDenemesi.delete(a.id);
  a.sessionId = undefined;
  oturumAc(a);
  yay({ ajan: a.id, tur: "durum", durum: "bekliyor" });
}

function oturumuBirak(a: Ajan) {
  const q = a.q;
  a.q = undefined;
  a.kutu.close();
  q?.close();
  yerelSira.tik(); // vazgeçilen yerel ajan yuvayı boşaltır
}

// Ajandan vazgeçilir: durum olu (yuva boşalır), oturum kapanır, insana ntfy. kisa: ntfy'ye giden, yol ve sır içermeyen neden.
function vazgec(a: Ajan, tur_adi: string, neden: string, kisa: string) {
  const sef = a.rol === "sef";
  // Denetçi dirilmezse işçisi sonsuza dek beklemesin: yeniden TAMAM dönebilir, şef karar verir.
  const isci = a.rol === "denetci" && a.denetci_icin ? ajanlar.get(a.denetci_icin) : undefined;
  if (isci?.denetimde) { isci.denetimde = false; sefeYaz("sunucu", `Denetçi ${a.id} dirilmedi (${kisa}); ${isci.id} denetimsiz bekliyor, şef kararı gerekli.`); }
  if (a.durum !== "olu") yay({ ajan: a.id, tur: "durum", durum: "olu" });
  yay({ ajan: a.id, tur: "hata", kaynak: "ajan", tur_adi, mesaj: neden, geri_alinabilir: true, devam_edilebilir: false,
    oneri: sef ? "panelden şefi yeniden başlat: POST /api/sef/yeniden" : "insan bakmalı" });
  oturumuBirak(a);
  if (isci?.repo && a.denetim) void kopyaTemizle({ denetci: a.id, isci: { repo: isci.repo }, kopya_koku: a.denetim.kopya_koku, yay }); // K17
  if (sef) ntfy("Zepul OS: hata: şef öldü", `şef ${kisa}; panelde 'Şefi yeniden başlat' düğmesine bas`);
  else ntfy("Zepul OS: hata: ajan dirilmedi", `${a.id} ${kisa}`);
}

// Denetçinin kopya kökü kapıda kendi alanı sayılsın (kapi.ts değişmez; baglama.ts kök dışını zaten reddeder).
const kokleriSahiplen = (a: Ajan) => { for (const k of a.yazilabilir_kokler ?? []) sahiplik.set(desenNormalize(`${k}/**`), a.id); };
const kurallar = () => fs.readFileSync(path.join(REPO, "KURALLAR.md"), "utf8"); // her oturumda güncel (kâtip budar)
const testKoku = () => (process.env.ZEPUL_TEST === "1" ? process.env.ZEPUL_TEST_KOK || os.tmpdir() : undefined);

function ajanBaslat(p: BaslatIstek): Ajan {
  const sef = p.rol === "sef";
  // Faz 5.5: gerçek model rol ayarından (yalnızca yeni başlayan ajan; diriltme ve yeni oturum kayıttaki modeli kullanır).
  const model = rolModeli(p.rol, p.model, limit.ayar.modeller), modelRed = modelHatasi(model, sef ? "sef" : p.rol);
  // F5: cwd yalnızca repo, repo/.worktrees/*, çalışma alanları ya da (ZEPUL_TEST=1) test kökü altında olabilir.
  const testKok = testKoku();
  const cwd = p.cwd === undefined ? REPO : izinliCwd(p.cwd, REPO, testKok, alanlar);
  // W4: OWNS desenleri kapının ve sahipliğin anladığı biçime çevrilir; desteklenmeyen desen başlatmayı reddeder.
  let owns: string[] | undefined, ownsHata = "";
  try { owns = p.owns?.map(desenNormalize); } catch (e) { ownsHata = (e as Error).message; }
  const cakisma = owns?.length ? ownsCakismasi(owns, sahiplik) : null; // D9
  const red =
    kapaniyor ? "sunucu kapanıyor" : // D11
    !/^[\w-]{1,40}$/.test(p.ad) ? "ajan adı yalnızca harf, rakam, - ve _ içerebilir" :
    !sef && AYRILMIS_ADLAR.includes(p.ad.toLowerCase()) ? `"${p.ad}" ayrılmış bir ad (${AYRILMIS_ADLAR.join(", ")})` :
    !sef && !(ISCI_ROLLERI as readonly string[]).includes(p.rol) ? `bilinmeyen rol: ${p.rol}` :
    modelRed ? modelRed :
    ajanlar.has(p.ad) ? `"${p.ad}" adlı ajan zaten var` :
    ownsHata ? ownsHata :
    cakisma ? cakisma :
    yuvaTutar(p.rol) && aktifIsci() >= azamiIsci() ? `en fazla ${azamiIsci()} aktif işçi olabilir` :
    cwd === null ? `cwd izinli köklerin dışında (repo, repo/.worktrees/*, çalışma alanları${testKok ? ", test kökü" : ""})` :
    !fs.statSync(cwd, { throwIfNoEntry: false })?.isDirectory() ? "cwd bir klasör değil ya da yok (worktree önce açılmalı)" : ""; // yoksa oturum çöker, diriltme boşa döner
  if (red) {
    hataOlayi(p.ad, "kapi", "ajan_reddi", `${p.ad} başlatılmadı: ${red}`, true, "geçerli ad, rol ve model ile yeniden dene");
    throw new Error(red);
  }

  const simdi = new Date().toISOString();
  const a: Ajan = { id: p.ad, ad: p.ad, rol: p.rol, model, durum: "bekliyor", maliyet_usd: 0, baslangic: simdi, son_olay_ts: simdi,
    worktree: cwd!, dal: p.dal ?? null, gorev_ozet: ozetle(p.gorev).slice(0, 160), gorev: p.gorev, owns, kutu: gelenKutusu(), acikArac: new Set(), maliyet: maliyetSayaci(),
    talimat: p.talimat, repo: p.repo, brif_kabul: p.brif_kabul, denetci_icin: p.denetci_icin, yazilabilir_kokler: p.yazilabilir_kokler };
  ajanlar.set(a.id, a);
  for (const d of owns ?? []) sahiplik.set(d, a.id);
  kokleriSahiplen(a);
  try {
    oturumAc(a);
  } catch (e) {
    // D14: oturum açılamadıysa kayıt ve sahiplik geri alınır; ad, yuva ve OWNS yeniden kullanılabilir.
    ajanlar.delete(a.id);
    sahiplikBirak(sahiplik, a.id);
    hataOlayi(a.id, "ajan", "oturum_acilamadi", `${a.id} başlatılmadı: ${(e as Error).message}`, true, "hatayı düzeltip yeniden başlat");
    throw e;
  }
  // F9: başlangıçtaki HEAD (baz_sha) ve kirli yollar; sozlesme_don OWNS dışı değişikliği buna göre bulur.
  // W5: git okunamazsa hata olayı; OWNS'lu ajanda sozlesme_don bazı yeniden dener, alamazsa sözleşmeyi almaz.
  if (!sef) a.baz = bazAl(a.worktree).then((b) => ((a.baz_sha = b.sha), b)).catch((e) => {
    hataOlayi(a.id, "arac", "baz_alinamadi", (e as Error).message, true, "worktree'yi ve git durumunu kontrol et; sozlesme_don bazı yeniden dener");
    return null;
  });

  yay({ ajan: a.id, tur: "durum", durum: "bekliyor" });
  const hazir = yerelMi(model) ? yerelSira.bekle(a.id).then(() => yerelHazirlik(model)) : null;
  if (hazir) void hazir.then((h) => {
    if (h.uygun || ajanlar.get(a.id) !== a || a.durum === "olu") return;
    hataOlayi(a.id, "ajan", "yerel_model_hazir_degil", `${h.neden}; ilk görev gönderilmedi, model yüklenmedi`, false,
      "Ollama ayarı ve GPU paylaşımı kullanıcı kararıdır: bağlamı 32768'e çıkar, GPU'yu boşalt ya da panelden Claude modeli seç");
    yay({ ajan: a.id, tur: "durum", durum: "olu" });
    oturumuBirak(a);
    ntfy("Zepul OS: uyarı: yerel model başlatılmadı", `${a.id}: bağlam ya da GPU yetersiz; ayrıntı panelde`);
  });

  if (sef) a.onEk = p.gorev;
  else void Promise.all([a.baz!, hazir]).then(([, h]) => {
    if (h && !h.uygun) return;
    if (!ilet(a, p.gorev) && !kapaniyor) hataOlayi(a.id, "ajan", "gorev_iletilemedi", "ilk görev iletilemedi: gelen kutusu kapalı", true, "şef ajanı yeniden başlatsın");
  });
  return a;
}

// ---------- Ölüm ve diriltme: calisiyor + OLUM_ESIK_MS sessizlik ya da durum "hata" → diriltmePlani ----------

const diriltmeDenemesi = new Map<string, number>(); // ajan id → bu ölüm için yapılan diriltme; hatasız result sıfırlar

async function dirilt(a: Ajan) {
  const son = olaylar.findLast((o) => o.ajan === a.id && (o.tur === "metin" || o.tur === "sozlesme"));
  // D3: git okunamazsa diriltme durmaz; mesaj "son commit yok, kirli 0" der, ajan hasarı kendisi kontrol eder.
  const [c, kirli] = await Promise.all([sonCommit(a.worktree).catch(() => null), kirliDosyalar(a.worktree).catch((): string[] => [])]);
  if (kapaniyor) return; // D11: git beklenirken kapanış başladıysa yeni oturum açılmaz
  const deneme = diriltmeDenemesi.get(a.id) ?? 0;
  const plan = diriltmePlani({ deneme, oturumBitti: !!a.oturumBitti, sessionId: a.sessionId, sonOzet: (son?.metin ?? son?.ozet) as string | undefined,
    sha: c?.sha, kirli });
  if (plan.eylem === "vazgec") return vazgec(a, "diriltme-tukendi", plan.neden, `${AZAMI_DIRILTME} denemede dirilmedi`);
  // D2: yeni oturum yuva ister; ölü ajanın boşalttığı yuvayı bu arada başka işçi almış olabilir.
  if (a.oturumBitti && yuvaTutar(a.rol) && aktifIsci(a) >= azamiIsci()) {
    return vazgec(a, "diriltme-yuva-yok", `${azamiIsci()} işçi yuvası dolu; oturum yeniden açılmadı`, "yuva dolu, dirilmedi");
  }
  // D9: olu olunca bırakılan OWNS geri alınır; bu arada çakışan OWNS'la başka ajan başladıysa diriltilmez.
  const cakisma = a.owns?.length ? ownsCakismasi(a.owns, sahiplik, a.id) : null;
  if (cakisma) return vazgec(a, "diriltme-sahiplik", cakisma, "OWNS çakışması, dirilmedi");
  for (const d of a.owns ?? []) sahiplik.set(d, a.id);
  kokleriSahiplen(a);
  diriltmeDenemesi.set(a.id, deneme + 1);
  // resume: aynı session_id ile yeni query. mesaj + oturum kapalı + session_id yok: yeni oturum, metin ilk görev olur.
  // D4: plan anındaki değil canlı a.oturumBitti; oturum bitmişse ve session_id varsa her zaman resume.
  // D5: session_id yoksa yeni oturum görevi bilmez; tam görev diriltme metninin önüne eklenir.
  const metin = a.oturumBitti && !a.sessionId ? `${a.gorev}\n\n${plan.mesaj}` : plan.mesaj!;
  if (a.oturumBitti) oturumAc(a, a.sessionId);
  // ilet() durumu calisiyor yapar ve son_olay_ts tazelenir. Kutu kapalıysa (D7) hata olur: döngü diriltme_basarisiz yayar.
  if (!mesajIlet("sunucu", a, metin)) throw new Error("diriltme mesajı iletilemedi: gelen kutusu kapalı");
}

// D13: git çağrıları (ajan başına 15 sn'ye kadar) turu 30 sn'den uzatabilir; önceki tur bitmeden yenisi başlamaz,
// aynı ajan iki kez diriltilmez.
let olumTurunda = false;
setInterval(async () => {
  if (kapaniyor || olumTurunda) return;
  olumTurunda = true;
  try { await olumTuru(); } finally { olumTurunda = false; }
}, 30_000).unref();

async function olumTuru() {
  yerelSira.tik(); // güvenlik: kaçan bir durum değişimi sırayı kilitlemesin
  const onayBekleyen = new Set([...onaylar.values()].map((o) => o.ajan)); // insan onayı bekleniyor, sessizlik normal
  const liste = [...ajanlar.values()].filter((a) => !onayBekleyen.has(a.id));
  const carpan = (a: Ajan) => (yerelMi(a.model) ? limit.ayar.yerel_esik_carpani : 1);
  const sessiz = new Set(olumAdaylari(liste.map((a) => ({ id: a.id, durum: a.durum, son_olay_ts: Date.parse(a.son_olay_ts), acikArac: a.acikArac.size, carpan: carpan(a) })), Date.now(), OLUM_ESIK_MS));
  for (const a of liste) {
    if (!sessiz.has(a.id) && a.durum !== "hata") continue;
    if (sessiz.has(a.id)) {
      yay({ ajan: a.id, tur: "durum", durum: "olu" });
      hataOlayi(a.id, "ajan", "sessizlik", `${a.acikArac.size ? "açık araç çağrısıyla " : ""}${olumEsigi(OLUM_ESIK_MS, a.acikArac.size, carpan(a)) / 1000} sn boyunca olay yok`, true, "sunucu diriltme deniyor");
    }
    await dirilt(a).catch((e) => hataOlayi(a.id, "arac", "diriltme_basarisiz", (e as Error).message, true, "worktree'yi ve git durumunu kontrol et"));
  }
}

setInterval(() => { for (const r of akislar) akisYaz(r, ": ping\n\n"); }, 15_000).unref();

// 6 saatte bir log raporu (docs/rapor.md). ZEPUL_RAPOR_SN yalnızca duman testi için (ZEPUL_OLUM_SN gibi).
// Rapor hazır olunca durum olayı yayınlanır; ntfy yalnızca geri alınamaz hata varsa (rutin bildirim gürültü, KURALLAR L).
// Hata sunucuyu düşürmez, hata olayı olur.
const RAPOR_MS = (Number(process.env.ZEPUL_RAPOR_SN) > 0 ? Number(process.env.ZEPUL_RAPOR_SN) : 6 * 3600) * 1000;
setInterval(() => {
  if (kapaniyor) return;
  raporUret({ saat: 6 })
    .then(({ yol, ozet }) => {
      yay({ ajan: "sunucu", tur: "durum", durum: "rapor", rapor: path.basename(yol), hata_sayisi: ozet.toplam, geri_alinamaz: ozet.geriAlinamaz });
      if (ozet.geriAlinamaz > 0) { const b = bildirMetni(ozet); ntfy(b.baslik, b.mesaj); }
    })
    .catch((e) => hataOlayi("sunucu", "arac", "rapor_hatasi", (e as Error).message, true, "node araclar/rapor.mjs ile elle çalıştırıp hatayı gör"));
}, RAPOR_MS).unref();

// ---------- HTTP ----------

function json(res: http.ServerResponse, kod: number, veri: unknown) {
  res.writeHead(kod, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  res.end(JSON.stringify(veri));
}
const hataYaniti = (res: http.ServerResponse, kod: number, hata: string) => json(res, kod, { ok: false, hata });

async function govde(req: http.IncomingMessage): Promise<unknown> {
  const parcalar: Buffer[] = [];
  let boy = 0;
  for await (const c of req) {
    boy += (c as Buffer).length;
    if (boy > 1_000_000) throw new SyntaxError("gövde 1 MB'tan büyük");
    parcalar.push(c as Buffer);
  }
  return JSON.parse(Buffer.concat(parcalar).toString("utf8") || "{}");
}

const ajanJson = ({ kutu, q, onEk, acikArac, maliyet, baz, gorev, talimat, repo, yazilabilir_kokler, denetim, denetimde, ...a }: Ajan) => ({ ...a, acik_arac: acikArac.size });
const MesajGovde = z.object({ ajan: z.string(), metin: z.string().min(1).max(20_000) });
const GorevGovde = z.object({ metin: z.string().min(1).max(20_000), gorev_id: z.string().regex(/^[\w-]{1,64}$/).optional() });
const GorevIptalGovde = z.object({ gorev_id: z.string().regex(/^[\w-]{1,64}$/) });
const CevapGovde = z.object({ soru_id: z.string().max(64), karar: z.enum(["evet", "hayir"]), not: z.string().max(2000).optional() });
const OnayGovde = z.object({ onay_id: z.string(), karar: z.enum(["evet", "hayir"]), not: z.string().max(2000).optional(), alana_ekle: z.boolean().optional() });
const TestIsciGovde = z.object({ ad: z.string().optional(), model: z.string().optional(), gorev: z.string().optional(), cwd: z.string().optional(), owns: z.array(z.string()).optional(),
  repo: z.string().optional(), dokunma: z.array(z.object({ yol: z.string(), sahip: z.string() })).optional(), once_oku: z.array(z.string()).optional(), kabul: z.string().optional(), baglam: z.string().optional() });

const sunucu = http.createServer(async (req, res) => {
  try {
    if (!HOST_IZINLI.test(req.headers.host ?? "")) return hataYaniti(res, 403, "izin verilmeyen Host başlığı");
    const url = new URL(req.url ?? "/", "http://yerel");
    const yol = url.pathname;
    const uc = `${req.method} ${yol}`;
    // Panel sayfası token'sız sunulur (veri ya da sır içermez, yenilemede 401 vermesin); Host denetimi yukarıda geçerli.
    // /api/* ve SSE token ister; sorgu token'ı (?t=) yalnızca SSE'de kabul edilir (EventSource başlık gönderemez).
    const sorguToken = yol === "/api/akis" || yol === "/api/takip/rapor" ? url.searchParams.get("t") : null; // takip raporu yeni sekmede açılır (başlık gönderilemez)
    // Faz 7: zepul-ai anahtarı yalnızca sözleşmedeki uçlara (baglama.ts ZEPUL_AI_UCLARI); başka uçta 403.
    const kim = uc === "GET /" || uc === `GET ${PANEL_VENDOR}` ? "panel" : yetki(uc, [req.headers["x-token"], sorguToken], TOKEN_B, ZEPUL_AI_B);
    if (kim === 401) return hataYaniti(res, 401, "token yok ya da yanlış");
    if (kim === 403) return hataYaniti(res, 403, "zepul-ai anahtarı bu uca yetkili değil");

    if (uc === "GET /") {
      try {
        const sayfa = await fs.promises.readFile(path.join(REPO, "panel/index.html"), "utf8");
        // S3: CSP özeti sayfadaki satır içi betikten her istekte hesaplanır (baglama.ts).
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer", ...panelBasliklari(sayfa) });
        return res.end(sayfa);
      } catch {
        res.writeHead(200, { "content-type": "text/plain; charset=utf-8", "x-content-type-options": "nosniff" });
        return res.end("panel henüz yok");
      }
    }
    // Uydu görünümünün gömülü three.js modülü (veri ya da sır içermez, token istemez); tek sabit yol, başka dosya verilmez.
    if (uc === `GET ${PANEL_VENDOR}`) {
      const dosya = await fs.promises.readFile(path.join(REPO, "panel", PANEL_VENDOR));
      res.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff" });
      return res.end(dosya);
    }
    if (uc === "GET /api/ajanlar") return json(res, 200, [...[...ajanlar.values()].map(ajanJson), ...(kim === "zepul-ai" ? [] : cc.liste().map(ccJson))]);
    // Claude Code oturumları: yalnız panel token'ı (zepul-ai listesinde yok) ve yerel bağlantı. Devam ettirme POST /api/mesaj ya da /api/cc/devam.
    if (yol.startsWith("/api/cc") && !yerelAdresMi(req.socket.remoteAddress)) return hataYaniti(res, 404, "bulunamadı");
    if (uc === "GET /api/cc") return json(res, 200, cc.liste().map(ccJson));
    if (uc === "POST /api/cc/baslat") {
      const g = (await govde(req) ?? {}) as Record<string, unknown>;
      try { return json(res, 200, ccJson(cc.baslat({ cwd: g.cwd, istem: g.istem, model: g.model, izin: g.izin, brif: g.brif }))); }
      catch (e) { return hataYaniti(res, 400, (e as Error).message); }
    }
    if (uc === "POST /api/cc/devam" || uc === "POST /api/cc/durdur" || uc === "POST /api/cc/denetle") {
      const g = (await govde(req) ?? {}) as { id?: unknown; istem?: unknown };
      if (typeof g.id !== "string" || !cc.al(g.id)) return hataYaniti(res, 404, "bilinmeyen Claude Code oturumu");
      if (uc === "POST /api/cc/durdur") return cc.durdur(g.id) ? json(res, 200, { ok: true }) : hataYaniti(res, 409, "oturum çalışmıyor");
      try { if (uc === "POST /api/cc/denetle") return json(res, 200, ccJson(cc.denetle(g.id)));
        return json(res, 200, ccJson(cc.devam(g.id, typeof g.istem === "string" ? g.istem : ""))); }
      catch (e) { return hataYaniti(res, (e as { kod?: number }).kod ?? 400, (e as Error).message); }
    }
    if (uc === "GET /api/limit") return json(res, 200, { limit: limit.son, karar: limit.karar(), ayar: limit.ayar });
    if (uc === "GET /api/laya-istatistik") {
      const oku = (y: string) => fs.promises.readFile(path.join(REPO, y), "utf8").catch(() => "");
      const [golge, taban] = await Promise.all([oku("logs/laya-golge.jsonl"), oku("veri/laya-taban.json")]);
      let t = null; try { t = JSON.parse(taban); } catch { /* taban yok ya da bozuk */ }
      return json(res, 200, layaIstatistik(golge, t));
    }
    if (uc === "GET /api/bekleyen") return json(res, 200, await kuyrukOku());
    // GitHub takip: son raporun özeti (panel kartı) ve raporun kendisi (tek dosyalık HTML; betik yok, dış istek yok, referrer yok).
    if (uc === "GET /api/takip") {
      const ad = takip.sonRapor();
      let ozet: Record<string, unknown> = {};
      try { if (ad) { const g = JSON.parse(await fs.promises.readFile(path.join(REPO, "raporlar", ad.replace(/\.html$/, ".json")), "utf8"));
        const say = (d: string) => g.adaylar.filter((k: { durum: string }) => k.durum === d).length;
        ozet = { tarih: g.tarih, toplam: g.adaylar.length, oneri: say("oneri"), kuruldu: say("kuruldu"), elendi: say("elendi"),
          oneriler: g.adaylar.filter((k: { durum: string }) => k.durum === "oneri").map((k: { ad: string; puan: number; ne_yapar: string }) => ({ ad: k.ad, puan: k.puan, ne_yapar: k.ne_yapar })) }; } } catch { /* özet yok */ }
      return json(res, 200, { rapor: ad, ...ozet, acik: limit.ayar.takip_acik, otomatik: limit.ayar.takip_otomatik });
    }
    // Kullanıcı panelde "Kur"a basınca: onay kartı açılmaz, basmak onaydır. Yalnız panel token'ı (zepul-ai uçlarında yok) ve yerel bağlantı.
    if (uc === "POST /api/takip/kur") {
      if (!yerelAdresMi(req.socket.remoteAddress)) return hataYaniti(res, 404, "bulunamadı");
      const r = await takip.kur((await govde(req) as { ad?: unknown } | null)?.ad);
      return json(res, r.kod, r.veri);
    }
    if (uc === "GET /api/takip/rapor") {
      const ad = takip.sonRapor();
      if (!ad) return hataYaniti(res, 404, "henüz GitHub takip raporu yok");
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" });
      return res.end(await fs.promises.readFile(path.join(REPO, "raporlar", ad)));
    }
    // Faz 5.5: panel model seçicisi. Fable yalnız şefte ve ikinci görüşte (kapi.ts IKINCI_GORUS_ROLU); yerel liste Ollama'dan canlı (kapalıysa boş). yedek: seçili yedek modelin hazırlığı.
    if (uc === "GET /api/modeller") {
      const [yerel, yedek] = await Promise.all([yerelModeller(), yerelHazirlik(limit.ayar.yerel_model)]);
      return json(res, 200, { claude: CLAUDE_MODELLERI, sef_ek: [SEF_FABLE], ikinci_gorus_ek: [SEF_FABLE], yerel, yedek });
    }
    if (uc === "GET /api/ayarlar") {
      try { return json(res, 200, await ayarOku()); }
      catch (e) { return hataYaniti(res, 500, `ayar dosyası okunamadı: ${ozetle((e as Error).message)}`); }
    }
    if (uc === "POST /api/ayarlar") {
      const g = await govde(req);
      if (!g || typeof g !== "object" || Array.isArray(g)) return hataYaniti(res, 400, "gövde Partial<Ayar> nesnesi olmalı");
      if ("guven_modu" in g) return hataYaniti(res, 400, "guven_modu yalnız POST /api/guven ile değişir");
      try {
        const a = await limit.ayarYaz(g as Partial<Ayar>, "panel");
        if ("calisma_alanlari" in g) { alanlar = a.calisma_alanlari; yay({ ajan: "sunucu", tur: "alanlar", alanlar }); }
        return json(res, 200, a);
      }
      catch (e) { return hataYaniti(res, (e as NodeJS.ErrnoException).code ? 500 : 400, ozetle((e as Error).message)); }
    }
    // Çalışma alanları (calisma-alanlari.md): panel token'ı ve zepul-ai anahtarı; her değişiklik `alanlar` olayıyla yayılır.
    if (uc === "GET /api/alanlar") return json(res, 200, { alanlar });
    if (uc === "POST /api/alanlar") {
      const r = await alanIstegi(await govde(req), (i, y) => alanIslem(i, y, kim === "zepul-ai" ? "zepul-ai" : "panel"));
      return json(res, r.kod, r.veri);
    }
    // Güven modu: panel token'ı ve zepul-ai anahtarı (zepul-ai'de yalnız kullanıcının düğmesi). jev_soguma_bitis: Jev 429 soğuması.
    if (uc === "GET /api/guven") return json(res, 200, guvenDurumu());
    if (uc === "POST /api/guven") {
      const r = await guvenIstegi(await govde(req), (i) => guven.ayarla(i, kim === "zepul-ai" ? "zepul-ai" : "panel"));
      return json(res, r.kod, r.kod === 200 ? guvenDurumu() : r.veri);
    }
    // Aday 7: bekleyen onaylar (panel açılışta ve yeniden bağlanmada kartlarını düzeltir). Yalnız panel token'ı: zepul-ai kartı olaydan alır.
    if (uc === "GET /api/onaylar") return json(res, 200, onayListesi(onaylar));
    if (uc === "POST /api/onay/hepsi") {
      const g = await govde(req) as { karar?: unknown } | null;
      if (g?.karar !== "evet") return hataYaniti(res, 400, "gövde {karar: \"evet\"} olmalı");
      return json(res, 200, hepsiniOnayla(onaylar, kim === "zepul-ai" ? "zepul-ai" : undefined));
    }
    if (uc === "GET /api/olaylar") {
      const n = Math.min(TAMPON, Math.max(1, Math.trunc(Number(url.searchParams.get("son") ?? 200)) || 200));
      return json(res, 200, olaySec(olaylar, n, url.searchParams.get("tur"))); // ?tur=: zepul-ai gecmisiIsle
    }
    if (uc === "GET /api/akis") {
      if (akislar.size >= AZAMI_AKIS) return hataYaniti(res, 429, `en fazla ${AZAMI_AKIS} canlı akış açılabilir; kullanılmayan panel sekmelerini kapat`);
      res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache", connection: "keep-alive", "x-accel-buffering": "no" });
      res.write(": bağlandı\n\n");
      if (kim === "zepul-ai") yetimler.zepulAiBaglandi((v) => akisYaz(res, v)); // tarama-3 aday 2: açılışta kapatılan görevler bir kez
      akislar.add(res);
      req.on("close", () => akislar.delete(res));
      res.on("error", () => akislar.delete(res)); // D12: kopan soket yazımda hata verirse kümede kalmasın
      return;
    }
    if (uc === "POST /api/mesaj") {
      const g = MesajGovde.safeParse(await govde(req));
      if (!g.success) return hataYaniti(res, 400, "gövde {ajan, metin} olmalı");
      if (cc.al(g.data.ajan)) { // panelin yazma kutusu: Claude Code oturumunu --resume ile sürdürür
        if (!yerelAdresMi(req.socket.remoteAddress)) return hataYaniti(res, 404, "bilinmeyen ajan");
        try { cc.devam(g.data.ajan, g.data.metin); return json(res, 200, { ok: true }); }
        catch (e) { return hataYaniti(res, (e as { kod?: number }).kod ?? 400, (e as Error).message); }
      }
      const a = ajanlar.get(g.data.ajan);
      if (!a) return hataYaniti(res, 404, "bilinmeyen ajan");
      if (!mesajIlet("kullanici", a, g.data.metin)) return hataYaniti(res, 409, "ajanın oturumu kapalı");
      const sef = ajanlar.get("sef");
      if (sef && a !== sef) bilgiEkle(sef, `[bilgi] kullanıcı → ${a.id}: ${notrle(g.data.metin.slice(0, 200))}`);
      return json(res, 200, { ok: true });
    }
    // Faz 7: zepul-ai görevi şefe etiketli gider (kullanıcı talimatı değil); sonuç gorev_sonuc olayıyla döner.
    if (uc === "POST /api/gorev") {
      const g = GorevGovde.safeParse(await govde(req));
      if (!g.success) return hataYaniti(res, 400, "gövde {metin, gorev_id?} olmalı (gorev_id: harf, rakam, - ve _, en çok 64)");
      const r = zai.al(g.data.metin, g.data.gorev_id);
      return "hata" in r ? hataYaniti(res, r.kod, r.hata) : json(res, 200, r);
    }
    // Denetim bulgusu 2: panel ya da zepul-ai düğmesi açık görevi iptal eder (BASARISIZ "iptal edildi", şefe not).
    if (uc === "POST /api/gorev/iptal") {
      const g = GorevIptalGovde.safeParse(await govde(req));
      if (!g.success) return hataYaniti(res, 400, "gövde {gorev_id} olmalı");
      const r = zai.iptal(g.data.gorev_id);
      return r.ok ? json(res, 200, { ok: true }) : hataYaniti(res, r.kod!, r.hata!);
    }
    if (uc === "POST /api/zepul-ai/cevap") {
      const g = CevapGovde.safeParse(await govde(req));
      if (!g.success) return hataYaniti(res, 400, "gövde {soru_id, karar:\"evet|hayir\", not?} olmalı");
      const r = zai.cevap(g.data.soru_id, g.data.karar, g.data.not);
      return r.ok ? json(res, 200, { ok: true }) : hataYaniti(res, r.kod!, r.hata!);
    }
    // Faz 7: zepul-ai'nin notu kâtip yoluyla MyBrain'e (hafiza.ts katipNotYaz doğrular: tür, boyut, yol). Hata → hata olayı.
    if (uc === "POST /api/katip-not") {
      const r = await katipNotYaz(await govde(req), { hata: (m) => hataOlayi("sunucu", "arac", "mybrain", m, true, "zepul-ai notu kuyruğunda tutar; py -3 beyin.py doctor ile elle dene") });
      return r.tamam ? json(res, 200, { tamam: true, id: r.id }) : json(res, r.kod, { ok: false, tamam: false, hata: r.hata });
    }
    if (uc === "POST /api/onay") {
      const g = OnayGovde.safeParse(await govde(req));
      if (!g.success) return hataYaniti(res, 400, "gövde {onay_id, karar:\"evet|hayir\", not?, alana_ekle?} olmalı");
      const o = onaylar.get(g.data.onay_id);
      if (!o) return hataYaniti(res, 404, "bekleyen böyle bir onay yok");
      o.bitir(g.data.karar, g.data.not, kim === "zepul-ai" ? "zepul-ai" : undefined, g.data.alana_ekle); // Faz 7: kayıtta kaynak
      return json(res, 200, { ok: true });
    }
    // D2: diriltmeden vazgeçilen (olu) ya da biten şef aynı kayıtla, yeni oturumda (resume yok) başlar; maliyeti birikmeye devam eder.
    if (uc === "POST /api/sef/yeniden") {
      const sef = ajanlar.get("sef");
      if (!sef) return hataYaniti(res, 404, "şef yok (sunucu --sef-yok ile açıldı)");
      if (kapaniyor) return hataYaniti(res, 409, "sunucu kapanıyor");
      if (sef.durum !== "olu" && sef.durum !== "bitti") return hataYaniti(res, 409, `şef zaten açık (durum: ${sef.durum})`);
      oturumuYenile(sef); // hata verirse durum olu kalır, 500 + hata olayı
      sef.onEk = SEF_GOREV; // ilk görev panelden gelen ilk mesajla birlikte iletilir (ajanBaslat'taki gibi)
      return json(res, 200, { ok: true });
    }
    // Düzgün kapanış (Windows'ta taskkill /F kapat()'ı atlıyor): onaylar reddedilir, son durum yazılır, süreç çıkar.
    if (uc === "POST /api/kapat") {
      json(res, 200, { ok: true });
      void kapat();
      return;
    }
    // Yalnızca test için: ZEPUL_TEST=1 iken bahçıvan turunu hemen bir kez çalıştırır (Faz 5 canlı kabul).
    if (uc === "POST /api/_test/bahcivan" && process.env.ZEPUL_TEST === "1") {
      if (!faz5Z) return hataYaniti(res, 409, "zamanlayıcı henüz açılmadı");
      await faz5Z.bahce();
      return json(res, 200, { ok: true });
    }
    // Yalnızca test için: ZEPUL_TEST=1 iken GitHub takip turunu hemen bir kez çalıştırır (bugün yapıldıysa yeniden yapmaz).
    if (uc === "POST /api/_test/takip" && process.env.ZEPUL_TEST === "1") return json(res, 200, await takip.tur());
    // Yalnızca duman testi için: ZEPUL_TEST=1 iken tek işçi başlatır.
    if (uc === "POST /api/_test/isci" && process.env.ZEPUL_TEST === "1") {
      const g = TestIsciGovde.safeParse(await govde(req));
      if (!g.success) return hataYaniti(res, 400, "gövde {ad?, model?, gorev?, cwd?, owns?: string[], repo?, dokunma?, once_oku?, kabul?} olmalı");
      const b = g.data;
      // repo: Faz 3 yolu (ajan_baslat ile aynı): brif doğrulanır, limit kapısından geçer, işçi <repo>/.worktrees/<ad>'da açılır.
      if (b.repo !== undefined) {
        const repo = izinliCwd(b.repo, REPO, testKoku(), alanlar);
        if (!repo || !fs.statSync(repo, { throwIfNoEntry: false })?.isDirectory()) return hataYaniti(res, 400, "repo izinli köklerin dışında ya da yok");
        const r = await ajanBaslatIsle({ ad: b.ad ?? "test-isci", rol: "isci", model: b.model ?? "claude-sonnet-5-5", gorev: b.gorev ?? "",
          owns: b.owns ?? [], dokunma: b.dokunma ?? [], once_oku: b.once_oku ?? [], kabul: b.kabul ?? "", baglam: b.baglam ?? "" },
          { karar: limit.karar, sahiplik, baslat: (brif) => brifliBaslat(brif, { repo, kurallar: kurallar(), ajanBaslat, alanlar }), yedek: yedekBag((brif) => brifliBaslat(brif, { repo, kurallar: kurallar(), ajanBaslat, alanlar })) });
        return r.hata ? hataYaniti(res, 400, r.metin) : json(res, 200, { ok: true, id: b.ad ?? "test-isci", sonuc: r.metin });
      }
      try {
        const a = ajanBaslat({ ad: b.ad ?? "test-isci", rol: "isci", model: b.model ?? "claude-sonnet-5-5", cwd: b.cwd, owns: b.owns,
          gorev: b.gorev ?? "package.json'daki name alanını oku ve sozlesme_don ile TAMAM dön." });
        return json(res, 200, { ok: true, id: a.id });
      } catch (e) { return hataYaniti(res, 400, (e as Error).message); }
    }
    return hataYaniti(res, 404, "bilinmeyen uç nokta");
  } catch (e) {
    if (e instanceof SyntaxError) return hataYaniti(res, 400, `geçersiz JSON: ${e.message}`);
    hataOlayi("sunucu", "pc", "sunucu_istisnasi", (e as Error).message, true, "logs/hatalar.jsonl kaydına bak");
    if (!res.headersSent) hataYaniti(res, 500, "sunucu hatası");
  }
});

sunucu.on("error", (e: NodeJS.ErrnoException) => {
  console.error(e.code === "EADDRINUSE"
    ? `HATA: ${PORT} portu dolu. Başka bir orkestra açık olabilir; onu kapatıp yeniden başlat. Başka porta geçilmez.`
    : `HATA: sunucu açılamadı: ${e.message}`);
  if (e.code !== "EADDRINUSE") return void process.exit(1);
  void ntfyBekle("Zepul OS: hata: port dolu", `${PORT} portu dolu, sunucu açılmadı; başka bir orkestra açık olabilir`).then(() => process.exit(1));
});

// K18: 0.0.0.0'da başka süreç varken 127.0.0.1 açılışı EADDRINUSE vermez; önce her arayüz denetlenir.
if (await portDolu(PORT)) {
  console.error(`HATA: ${PORT} portu başka bir süreçte dolu (herhangi bir arayüzde). O süreci kontrol et ya da ZEPUL_PORT ile başka port seç.`);
  await ntfyBekle("Zepul OS: hata: port dolu", `${PORT} portu dolu, sunucu açılmadı; başka bir orkestra açık olabilir`);
  process.exit(1);
}
// Aday 4: önceki oturum kapanis olmadan bittiyse uyarı + ntfy; askıda kalan zepul-ai görevleri BASARISIZ kapanır. Hata açılışı durdurmaz.
await oncekiOturumuDenetle(path.join(REPO, "logs/olaylar.jsonl"), OTURUM, { yay: yetimler.yay, ntfy })
  .catch((e) => hataOlayi("sunucu", "pc", "onceki_oturum_okunamadi", (e as Error).message, true, "logs/olaylar.jsonl dosyasına bak"));
await denetimKopyalariniTemizle([REPO], denetimKoku(), yay); // K25: önceki koşudan (çökme, zorla çıkış) kalan denetçi kopyaları
sunucu.listen(PORT, HOST, () => {
  const panelUrl = `http://${HOST}:${PORT}/?t=${TOKEN}`;
  fs.mkdirSync(path.dirname(PANEL_URL_DOSYASI), { recursive: true });
  fs.writeFileSync(PANEL_URL_DOSYASI, panelUrl + "\n", { mode: 0o600 });
  fs.rmSync(path.join(REPO, ".tmp/panel-url.txt"), { force: true });
  console.log(`Panel: ${process.stdout.isTTY ? panelUrl : `http://${HOST}:${PORT}/?t=***`}`); // günlük dosyasına/boruya token yazılmaz
  console.log(`Adres dosyası (npm run kapat bunu okur): ${PANEL_URL_DOSYASI}`);
  faz5Z = faz5Zamanlayici(faz5); // günlük MyBrain sağlığı (açılışta da) ve ZEPUL_BAHCIVAN_SN'de (yoksa 6 saatte) bir bahçıvan
  void limit.tik().then(() => { if (!kapaniyor) takip.baslat(); });
  if (process.argv.includes("--sef-yok")) {
    console.log("--sef-yok: şef başlatılmadı.");
    return void limit.tik();
  }
  // Şef MyBrain bağlamıyla başlar; MyBrain yoksa ya da hata verirse bağlamsız (hata olayı yayılır).
  // Ardından ilk limit ölçümü: kapalıysa şefe de gider.
  void sefBaglami(SEF_BAGLAM_SORGUSU, faz5).then((baglam) => {
    if (kapaniyor) return;
    try { ajanBaslat({ ad: "sef", rol: "sef", model: "claude-opus-5-5", cwd: REPO, gorev: SEF_GOREV, talimat: `${kurallar()}\n\n${baglam}` }); }
    catch { /* ajanBaslat reddi hata olayı olarak yayıldı */ }
    void limit.tik();
  });
});

// ---------- Kapanış ----------

let kapaniyor = false;
async function kapat(kod = 0) {
  if (kapaniyor) return;
  kapaniyor = true;
  console.log("Kapanıyor: oturumlar durduruluyor…");
  setTimeout(() => process.exit(kod), 8000).unref(); // takılırsa zorla çık
  for (const o of onaylar.values()) o.bitir("hayir", "sunucu kapanıyor");
  zai.kapat();
  takip.durdur();
  for (const k of cc.liste()) cc.durdur(k.id); // yalnız kendi başlattığımız claude süreçleri
  await Promise.allSettled([...ajanlar.values()].map((a) => oturumuBitir(a, 3000, true)));
  // D11: interrupt beklenirken açılan oturum (diriltme, başlatma) kalmasın: yeniden taranır, kapatma tekrarında zarar yok.
  for (const a of ajanlar.values()) { a.kutu.close(); a.q?.close(); }
  const repolar = [REPO, ...[...ajanlar.values()].flatMap((a) => (a.repo ? [a.repo] : []))];
  // K25: denetçi kopyaları oturumlar kapanır kapanmaz kaldırılır; arka plandaki kapatBekle'nin 30 sn'si beklenmez (8 sn'de zorla çıkış).
  await denetimKopyalariniTemizle(repolar, denetimKoku(), yay);
  // C: açık worktree'ler silinmez (commit'lenmemiş iş kaybolmasın); listesi kapanış olayına yazılır. Ana depo + işçilerin depoları.
  const acik_worktreeler = await acikWorktreeler(repolar);
  yay({ ajan: "sunucu", tur: "durum", durum: "kapanis", acik_worktreeler });
  for (const a of ajanlar.values()) if (a.durum !== "bitti") yay({ ajan: a.id, tur: "durum", durum: "bitti" });
  for (const r of akislar) r.end();
  akislar.clear();
  sunucu.close();
  olayLog.end();
  hataLog.end(() => process.exit(kod)); // akış hatalıysa da geri çağrı gelir (ERR_STREAM_DESTROYED)
}
process.on("SIGINT", () => void kapat());
process.on("SIGTERM", () => void kapat());
process.on("SIGHUP", () => void kapat());
process.on("SIGBREAK", () => void kapat());

process.on("unhandledRejection", (e) => {
  console.error("Yakalanmamış ret:", e);
  hataOlayi("sunucu", "pc", "yakalanmamis_ret", String((e as Error)?.stack ?? e), true, "logs/hatalar.jsonl kaydına bak");
});
let coktu = false;
process.on("uncaughtException", (e) => {
  console.error("Yakalanmamış istisna:", e);
  try { hataOlayi("sunucu", "pc", "yakalanmamis_istisna", e.stack ?? e.message, false, "sunucuyu yeniden başlat; logs/hatalar.jsonl kaydına bak"); } catch { /* kapanış yine denenir */ }
  if (coktu) return;
  coktu = true; // aday 4: kapanmadan önce tek ntfy (en çok 2 sn); mesajda hata metni yok (yol ya da sır taşıyabilir)
  void ntfyBekle("Zepul OS: hata: sunucu çöktü", "yakalanmamış istisna; sunucu kapanıyor, yeniden başlatman gerekiyor").then(() => kapat(1));
});
