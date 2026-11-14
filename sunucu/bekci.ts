// Bekçi: canlı kullanım limiti (yeni iş kapısı), bekleyen iş kuyruğu, kontrolsüz döngü koruması.
// Kararlar saf fonksiyondur; süreç çağrısı enjekte edilir, dosya yazımı ayrı yardımcılardadır. Bağlama: entegratör (orkestra/baglama).
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { calistir } from "./yasam.ts";
import { maskele } from "./olay.ts";
import { modelHatasi, yerelMi, IKINCI_GORUS_ROLU } from "./kapi.ts";
import { altinda, kanonik } from "./yol.ts";

const DK = 60_000;

// ---------- 1) Canlı limit ----------

export type LimitPencere = { yuzde: number; sifirlanma: string | null };
// kaynak: ortak önbelleğin kaynağı (canli · son-canli · gozlem · yerel-onbellek); yas_sn: verinin gerçek yaşı (limit.py).
export type LimitDurumu = {
  bes_saat?: LimitPencere; yedi_gun?: LimitPencere; plan?: string; kaynak: string; yas_dk: number; ts: number;
  guncellendi_iso?: string | null; yas_sn?: number | null; bayat?: boolean;
};

export const LIMIT_BETIGI = path.join(os.homedir(), ".claude", "skills", "limit", "scripts", "limit.py");
export const LIMIT_ZAMAN_ASIMI_MS = 20_000;
export const BAYAT_DK = 30;
export const LIMIT_YENILE_MS = 5 * DK;
const limitOkumaDurumu = { sonYenileme: 0 };

// Dakikada bir `--onbellek --json` (uca gitmez); 5 dk'da bir ya da önbellek bayatsa `--json` (yenilemeyi betik dener).
// limit.py token'ı kendisi okur, çıktıda token yok. Yalnız beyaz listedeki alanlar alınır (account/email/org hiç girmez).
// Hata, parse hatası ya da penceresiz çıktı → null. Bayat çıktı null değil, `bayat: true` işaretli döner.
export async function limitOku(calistirFn: typeof calistir = calistir, durum = limitOkumaDurumu, simdi = Date.now()): Promise<LimitDurumu | null> {
  const oku = async (...bayrak: string[]) =>
    JSON.parse(await calistirFn("py", ["-3", LIMIT_BETIGI, ...bayrak, "--json", "--color", "never"], os.homedir(), LIMIT_ZAMAN_ASIMI_MS));
  try {
    let j = await oku("--onbellek").catch(() => null);
    if (!j || j.bayat === true || simdi - durum.sonYenileme >= LIMIT_YENILE_MS) {
      durum.sonYenileme = simdi;
      j = await oku();
    }
    const c = j?.claude ?? j;
    const pencere = (ad: string): LimitPencere | undefined => {
      const w = (Array.isArray(c?.windows) ? c.windows : []).find((x: any) => x?.name === ad && !x.expired && typeof x.used_percent === "number");
      return w ? { yuzde: w.used_percent, sifirlanma: typeof w.resets_at === "string" ? w.resets_at : null } : undefined;
    };
    const bes_saat = pencere("5-hour"), yedi_gun = pencere("7-day");
    if (!bes_saat && !yedi_gun) return null;
    const yas_sn = "yas_sn" in j ? (typeof j.yas_sn === "number" ? j.yas_sn : null)
      : typeof c?.age_minutes === "number" ? c.age_minutes * 60 : null;
    return {
      ...(bes_saat && { bes_saat }), ...(yedi_gun && { yedi_gun }), ...(typeof c.plan === "string" && { plan: c.plan }),
      kaynak: maskele(String(typeof j.kaynak === "string" ? j.kaynak : c.source ?? "")),
      yas_dk: yas_sn === null ? Infinity : Math.round(yas_sn / 6) / 10, yas_sn,
      guncellendi_iso: typeof j.guncellendi_iso === "string" ? j.guncellendi_iso : null,
      bayat: j.bayat === true || yas_sn === null || yas_sn > BAYAT_DK * 60, ts: Date.now(),
    };
  } catch {
    return null;
  }
}

export type Ayar = {
  haftalik_tavan_yuzde: number | null; bes_saat_tavan_yuzde: number | null; maliyet_hizi_usd_10dk: number;
  tekrar_uyari: number; tekrar_durdur: number; ilerlemesiz_dk: number;
  azami_isci: number; // eşzamanlı işçi yuvası (şef ve denetçi sayılmaz); 1-12 tam sayı
  modeller: Modeller; // Faz 5.5: rol başına model; yalnızca yeni başlayan ajanlara uygulanır
  yerel_yedek: YerelYedek; // limit tavanında ya da Claude erişilemezken kuyruktaki işe ne olur
  yerel_model: string; // yedek model, ollama:<ad>
  yerel_azami: number; // eşzamanlı yerel ajan (şef sayılmaz, denetçi sayılır); 1-4 tam sayı, fazlası sırada (baglama.ts yerelKuyruk)
  yerel_esik_carpani: number; // yerel modelli ajanda ölüm, ilerlemesiz süre ve tekrar durdurma eşiklerinin katı; 1-10 tam sayı
  calisma_alanlari: string[]; // docs/sozlesme/calisma-alanlari.md: ajanların okuyup işçi açabildiği klasörler (zepul-os her zaman alan, listede yok)
  guven_modu: GuvenModu; // docs/sozlesme/guven-modu.md: kapının kademesi; yalnız panel düğmesi yazar
  ikinci_gorus_modeli: string; // yetenek-dongusu.md 3: şefin ikinci_gorus danışma oturumunun modeli (Claude; Fable yalnız burada, kapi.ts)
  // Günlük GitHub takipçisi (takipci.ts): yalnız panel yazar. takip_otomatik kapalıyken ≥ otomatik eşik de onay kartı alır.
  takip_acik: boolean; takip_saat: string; takip_otomatik: boolean; takip_otomatik_esik: number; takip_sor_esik: number; takip_liste: number;
  gorev_sure_dk: number; yetenek_gorev_sure_dk: number; // zepul-ai görevinin süre sınırı (dk); dolunca BASARISIZ "süre doldu" (baglama.ts zepulAiGorevleri)
  guncelleyen?: string; guncelleme_ts?: number;
};
export type Kademe = "kullanici" | "jev" | "tam";
export type GuvenModu = { kademe: Kademe; bitis: number | null; alan_otomatik: boolean }; // bitis: ms zaman damgası, null süresiz
const KADEMELER: Kademe[] = ["kullanici", "jev", "tam"];
export const VARSAYILAN_GUVEN: GuvenModu = Object.freeze({ kademe: "jev" as Kademe, bitis: null, alan_otomatik: false });
export type Modeller = { sef: string; isci_basit: string; isci_hassas: string; denetci: string };
export type YerelYedek = "kapali" | "sor" | "otomatik";
const YEDEK_MODLARI: YerelYedek[] = ["kapali", "sor", "otomatik"];
// Modeller alanının anahtarı → kapının rolü (Fable yalnız şefte).
const MODEL_ROLU: Record<keyof Modeller, string> = { sef: "sef", isci_basit: "isci", isci_hassas: "isci", denetci: "denetci" };
export const YEREL_VARSAYILAN = "ollama:zepul-gptoss-cpu:latest";
export const VARSAYILAN_MODELLER: Modeller = Object.freeze({ sef: "claude-sonnet-5-5", isci_basit: YEREL_VARSAYILAN, isci_hassas: YEREL_VARSAYILAN, denetci: "claude-sonnet-5-5" });
export const VARSAYILAN_AYAR: Ayar = Object.freeze({
  haftalik_tavan_yuzde: null, bes_saat_tavan_yuzde: null, maliyet_hizi_usd_10dk: 3, tekrar_uyari: 3, tekrar_durdur: 5, ilerlemesiz_dk: 30, azami_isci: 4,
  modeller: VARSAYILAN_MODELLER, yerel_yedek: "kapali" as YerelYedek, yerel_model: YEREL_VARSAYILAN, yerel_esik_carpani: 3, yerel_azami: 1,
  calisma_alanlari: Object.freeze([]) as unknown as string[], guven_modu: VARSAYILAN_GUVEN, ikinci_gorus_modeli: "claude-opus-5-5",
  gorev_sure_dk: 120, yetenek_gorev_sure_dk: 240,
  takip_acik: true, takip_saat: "09:00", takip_otomatik: false, takip_otomatik_esik: 8, takip_sor_esik: 5, takip_liste: 10,
});
export const SEF_YAZAMAZ = ["azami_isci", "modeller", "yerel_yedek", "yerel_model", "yerel_esik_carpani", "yerel_azami", "calisma_alanlari", "guven_modu", "ikinci_gorus_modeli", "gorev_sure_dk", "yetenek_gorev_sure_dk",
  "takip_acik", "takip_saat", "takip_otomatik", "takip_otomatik_esik", "takip_sor_esik", "takip_liste"];

// Yerel (CPU) modelde tur 18-37 sn, ilk tur ~280 sn (DUMAN.md L2): süre ve sayı eşikleri çarpanla genişler. Tekrar uyarısı erken kalır
// (ucuz dürtme); maliyet hızı değişmez, yerel maliyet zaten 0 (baglama.ts yerelOlay). Ölüm eşiği: yasam.ts olumAdaylari carpan.
export const yerelAyar = (a: Ayar): Ayar =>
  ({ ...a, ilerlemesiz_dk: a.ilerlemesiz_dk * a.yerel_esik_carpani, tekrar_durdur: a.tekrar_durdur * a.yerel_esik_carpani });

// Ajanın gerçek modeli: şef ve denetçi doğrudan ayardan; diğer roller şefin istediği sınıfa göre (Sonnet → basit, Opus → hassas).
// ollama:<ad> (yerel yedek, test ucu) ve geçersiz istek değişmez; geçersizi kapı (modelHatasi) reddeder.
export function rolModeli(rol: string, istenen: string, m: Modeller): string {
  if (rol === "sef") return m.sef;
  if (rol === "denetci") return m.denetci;
  return istenen === "claude-sonnet-5-5" ? m.isci_basit : istenen === "claude-opus-5-5" ? m.isci_hassas : istenen;
}

// Repo dışı: %LOCALAPPDATA%\zepul-os (yoksa ~/.zepul-os). Testte ZEPUL_AYAR_DIZIN.
const dizin = () => process.env.ZEPUL_AYAR_DIZIN ||
  (process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "zepul-os") : path.join(os.homedir(), ".zepul-os"));
export const ayarYolu = () => path.join(dizin(), "ayarlar.json");
export const kuyrukYolu = () => path.join(dizin(), "bekleyen-isler.json");

async function atomikYaz(yol: string, veri: unknown): Promise<void> {
  await fs.mkdir(path.dirname(yol), { recursive: true });
  const gecici = `${yol}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`;
  try {
    await fs.writeFile(gecici, JSON.stringify(veri, null, 2), "utf8");
    // Windows: hedef o an okunuyorsa (panel, şef, başka yazım) rename EPERM/EACCES/EBUSY verir; kısa aralıkla yeniden denenir.
    for (let i = 0; ; i++) {
      try { await fs.rename(gecici, yol); break; }
      catch (e) {
        if (i >= 50 || !["EPERM", "EACCES", "EBUSY"].includes((e as NodeJS.ErrnoException).code!)) throw e;
        await new Promise((r) => setTimeout(r, Math.min(5 * (i + 1), 50)));
      }
    }
  } catch (e) {
    await fs.rm(gecici, { force: true });
    throw e;
  }
}

// Dosya yoksa varsayılan; bozuksa hata fırlar (sessizce varsayılana dönmek tavanı kapatırdı).
async function jsonOku<T>(yol: string, varsayilan: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(yol, "utf8"));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return varsayilan;
    throw e;
  }
}

const ZEPUL_REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export function alanHatasi(yol: unknown, varOlmali = true): string | null {
  if (typeof yol !== "string" || !yol.trim()) return "alan yolu boş";
  if (!path.isAbsolute(yol)) return `alan yolu mutlak olmalı: ${yol}`;
  const k = kanonik(yol), kok = (x: string) => kanonik(x);
  const windir = process.env.WINDIR || process.env.SystemRoot || "C:\Windows";
  if (/^[a-z]:\/?$/.test(k) || k.startsWith("//")) return `sürücü kökü ya da ağ yolu alan olamaz: ${yol}`;
  if (altinda(k, kok(windir))) return `Windows klasörü alan olamaz: ${yol}`;
  if (/^[a-z]:\/program files[^/]*(\/|$)/.test(k)) return `Program Files alan olamaz: ${yol}`;
  if (k === kok(os.homedir()) || (process.env.USERPROFILE && k === kok(process.env.USERPROFILE))) return `kullanıcı dizininin kendisi alan olamaz (alt klasörü olur): ${yol}`;
  const sir = kok(dizin());
  if (altinda(k, sir) || altinda(sir, k)) return `zepul-os ayar dizini ve onu içeren klasör alan olamaz (panel belirteci): ${yol}`;
  if (k.split("/").includes(".git")) return `.git içi alan olamaz: ${yol}`;
  if (altinda(k, kok(ZEPUL_REPO)) || altinda(kok(ZEPUL_REPO), k)) return `zepul-os reposu zaten alan; onu içeren klasör de eklenemez: ${yol}`;
  if (varOlmali && !fsSync.statSync(yol, { throwIfNoEntry: false })?.isDirectory()) return `alan var olan bir klasör olmalı: ${yol}`;
  return null;
}

export const SAAT = /^([01]\d|2[0-3]):[0-5]\d$/;
const YUZDE_ALANLARI = ["haftalik_tavan_yuzde", "bes_saat_tavan_yuzde"];
const IZINLI = new Set([...Object.keys(VARSAYILAN_AYAR), "guncelleyen", "guncelleme_ts"]);
function ayarDogrula(a: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(a)) {
    if (!IZINLI.has(k)) throw new Error(`bilinmeyen ayar: ${k}`);
    if (k === "guncelleyen" || k === "guncelleme_ts") continue;
    if (k === "calisma_alanlari") {
      if (!Array.isArray(v)) throw new Error(`calisma_alanlari bir dizi olmalı: ${JSON.stringify(v)}`);
      for (const y of v) { const h = alanHatasi(y, false); if (h) throw new Error(`calisma_alanlari: ${h}`); }
    } else if (k === "guven_modu") {
      const g = v as Record<string, unknown> | null;
      if (!g || typeof g !== "object" || Array.isArray(g)) throw new Error(`guven_modu bir nesne olmalı: ${JSON.stringify(v)}`);
      for (const x of Object.keys(g)) if (!(x in VARSAYILAN_GUVEN)) throw new Error(`guven_modu: bilinmeyen alan ${x}`);
      if (!KADEMELER.includes(g.kademe as Kademe)) throw new Error(`guven_modu.kademe ${KADEMELER.join(" | ")} olmalı: ${JSON.stringify(g.kademe)}`);
      if (g.bitis !== null && !(typeof g.bitis === "number" && Number.isFinite(g.bitis))) throw new Error(`guven_modu.bitis ms zaman damgası ya da null olmalı: ${JSON.stringify(g.bitis)}`);
      if (typeof g.alan_otomatik !== "boolean") throw new Error(`guven_modu.alan_otomatik true/false olmalı: ${JSON.stringify(g.alan_otomatik)}`);
    } else if (k === "modeller") {
      if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error(`modeller bir nesne olmalı: ${JSON.stringify(v)}`);
      for (const [r, m] of Object.entries(v)) {
        if (!(r in MODEL_ROLU)) throw new Error(`bilinmeyen model rolü: ${r}`);
        const h = modelHatasi(m, MODEL_ROLU[r as keyof Modeller]);
        if (h) throw new Error(`modeller.${r}: ${h}`);
      }
    } else if (k === "ikinci_gorus_modeli") {
      const h = modelHatasi(v, IKINCI_GORUS_ROLU);
      if (h) throw new Error(`ikinci_gorus_modeli: ${h}`);
    } else if (k === "yerel_yedek") {
      if (!YEDEK_MODLARI.includes(v as YerelYedek)) throw new Error(`yerel_yedek ${YEDEK_MODLARI.join(" | ")} olmalı: ${JSON.stringify(v)}`);
    } else if (k === "yerel_model") {
      if (!yerelMi(v) || modelHatasi(v, "isci")) throw new Error(`yerel_model ollama:<ad> olmalı: ${modelHatasi(v, "isci") ?? JSON.stringify(v)}`);
    } else if (k === "azami_isci") {
      if (!(Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 12)) throw new Error(`azami_isci 1-12 arası bir tam sayı olmalı: ${JSON.stringify(v)}`);
    } else if (k === "yerel_azami") {
      if (!(Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 4)) throw new Error(`yerel_azami 1-4 arası bir tam sayı olmalı: ${JSON.stringify(v)}`);
    } else if (k === "yerel_esik_carpani") {
      if (!(Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 10)) throw new Error(`yerel_esik_carpani 1-10 arası bir tam sayı olmalı: ${JSON.stringify(v)}`);
    } else if (k === "takip_acik" || k === "takip_otomatik") {
      if (typeof v !== "boolean") throw new Error(`${k} true/false olmalı: ${JSON.stringify(v)}`);
    } else if (k === "takip_saat") {
      if (typeof v !== "string" || !SAAT.test(v)) throw new Error(`takip_saat SS:DD biçiminde olmalı (00:00-23:59): ${JSON.stringify(v)}`);
    } else if (k === "takip_otomatik_esik" || k === "takip_sor_esik") {
      if (!(typeof v === "number" && v >= 0 && v <= 10)) throw new Error(`${k} 0-10 arası bir sayı olmalı: ${JSON.stringify(v)}`);
    } else if (k === "takip_liste") {
      if (!(Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 30)) throw new Error(`takip_liste 1-30 arası bir tam sayı olmalı: ${JSON.stringify(v)}`);
    } else if (YUZDE_ALANLARI.includes(k)) {
      if (v !== null && !(typeof v === "number" && v >= 0 && v <= 100)) throw new Error(`${k} 0-100 arası bir sayı ya da null olmalı: ${JSON.stringify(v)}`);
    } else if (!(typeof v === "number" && Number.isFinite(v) && v > 0)) throw new Error(`${k} pozitif bir sayı olmalı: ${JSON.stringify(v)}`);
  }
}

export async function ayarOku(): Promise<Ayar> {
  const d = await jsonOku<Partial<Ayar>>(ayarYolu(), {});
  const a = { ...VARSAYILAN_AYAR, ...d, modeller: { ...VARSAYILAN_MODELLER, ...d.modeller }, guven_modu: { ...VARSAYILAN_GUVEN, ...d.guven_modu } };
  ayarDogrula(a); // elle bozulmuş dosya da reddedilir
  return a;
}

let ayarKuyruk: Promise<unknown> = Promise.resolve();
export const ayarYaz = (yama: Partial<Ayar>, guncelleyen: string): Promise<Ayar> => ayarGuncelle(() => yama, guncelleyen);
export function ayarGuncelle(fn: (eski: Ayar) => Partial<Ayar>, guncelleyen: string): Promise<Ayar> {
  const is = ayarKuyruk.then(async () => {
    const eski = await ayarOku();
    const yama = fn(eski);
    ayarDogrula(yama as Record<string, unknown>); // hata sync değil reddedilen söz olarak döner
    const yeni: Ayar = { ...eski, ...yama, modeller: { ...eski.modeller, ...yama.modeller }, guncelleyen, guncelleme_ts: Date.now() };
    if (yeni.takip_sor_esik > yeni.takip_otomatik_esik) throw new Error(`takip_sor_esik (${yeni.takip_sor_esik}) takip_otomatik_esik'ten (${yeni.takip_otomatik_esik}) büyük olamaz`);
    await atomikYaz(ayarYolu(), yeni);
    return yeni;
  });
  ayarKuyruk = is.catch(() => {}); // hata kuyruğu tıkamasın
  return is;
}

// ---------- Güven modu (docs/sozlesme/guven-modu.md) ----------
// Bitişi geçmiş kademe jev sayılır: zamanlayıcı gecikse de kapı süresi dolmuş tam'ı uygulamaz.
export const guvenGecerli = (g: GuvenModu, simdi: number = Date.now()): GuvenModu =>
  g.bitis !== null && g.bitis <= simdi ? { kademe: "jev", bitis: null, alan_otomatik: g.alan_otomatik } : g;

export type GuvenIstek = { kademe: Kademe; sure_dk?: number; alan_otomatik?: boolean };
const AZAMI_SURE_DK = 7 * 24 * 60; // setTimeout sınırının (~24,8 gün) altında kalır
// Bellekte güncel kademe (kapı her araçta okur) + ayar dosyası + süre zamanlayıcısı. Süre dolunca jev'e döner, bildir("süre doldu").
export function guvenYoneticisi(o: { bildir: (g: GuvenModu, neden: string) => void; simdi?: () => number }) {
  const simdi = o.simdi ?? Date.now;
  let g: GuvenModu = VARSAYILAN_GUVEN, t: ReturnType<typeof setTimeout> | undefined;
  const dondur = async () => {
    g = { ...g, kademe: "jev", bitis: null };
    try { await ayarYaz({ guven_modu: g }, "sure"); } catch { /* bellek jev'de; dosya bir sonraki yazımda düzelir */ }
    o.bildir(g, "süre doldu");
  };
  const kur = () => {
    clearTimeout(t);
    if (g.bitis === null) return;
    t = setTimeout(() => void dondur(), Math.max(0, g.bitis - simdi()));
    t.unref?.();
  };
  return {
    async yukle() {
      g = (await ayarOku()).guven_modu;
      if (g.bitis !== null && g.bitis <= simdi()) await dondur(); else kur();
    },
    al: (): GuvenModu => guvenGecerli(g, simdi()),
    async ayarla(istek: GuvenIstek, kim: string): Promise<GuvenModu> {
      const i = istek as Record<string, unknown>;
      if (!KADEMELER.includes(i?.kademe as Kademe)) throw new Error(`kademe ${KADEMELER.join(" | ")} olmalı: ${JSON.stringify(i?.kademe)}`);
      if (i.sure_dk !== undefined && i.sure_dk !== null && !(typeof i.sure_dk === "number" && i.sure_dk > 0 && i.sure_dk <= AZAMI_SURE_DK))
        throw new Error(`sure_dk 0-${AZAMI_SURE_DK} arası pozitif sayı olmalı (verilmezse süresiz): ${JSON.stringify(i.sure_dk)}`);
      if (i.alan_otomatik !== undefined && typeof i.alan_otomatik !== "boolean") throw new Error("alan_otomatik true/false olmalı");
      const yeni: GuvenModu = { kademe: istek.kademe, bitis: istek.sure_dk ? simdi() + Math.round(istek.sure_dk * 60_000) : null,
        alan_otomatik: istek.alan_otomatik ?? g.alan_otomatik };
      await ayarYaz({ guven_modu: yeni }, kim);
      g = yeni;
      kur();
      o.bildir(g, kim);
      return g;
    },
    kapat: () => clearTimeout(t),
  };
}

// Alan listesi kanonik tekil tutulur; kayıtta gerçek ad (realpath, Windows yazımı). Ekleme doğrulanır, çıkarma her zaman serbest.
export async function alanEkle(yol: string, guncelleyen: string): Promise<string[]> {
  const h = alanHatasi(yol);
  if (h) throw new Error(h);
  const gercek = fsSync.realpathSync.native(path.resolve(yol));
  return (await ayarGuncelle((a) => a.calisma_alanlari.some((x) => kanonik(x) === kanonik(gercek)) ? {} : { calisma_alanlari: [...a.calisma_alanlari, gercek] }, guncelleyen)).calisma_alanlari;
}
export async function alanCikar(yol: string, guncelleyen: string): Promise<string[]> {
  const k = kanonik(yol);
  return (await ayarGuncelle((a) => ({ calisma_alanlari: a.calisma_alanlari.filter((x) => kanonik(x) !== k) }), guncelleyen)).calisma_alanlari;
}

export type LimitKarari = { yeniIsSerbest: boolean; neden: string; uyari?: string; esik_asildi?: "haftalik" | "bes_saat"; bayat?: true };

// d: son başarılı okuma (okuma düşerse bir öncekini ver: `son = (await limitOku()) ?? son`).
// Ölçümün yaşı = kaynaktaki bayatlık + okunalı geçen süre. Bayat değer (d.bayat ya da BAYAT_DK'yı aşan yaş) tavan kararında
// kullanılmaz: iş gereksiz yere kuyruğa düşmesin; yerine "limit bilinmiyor (bayat)" uyarısı verilir. Hiç ölçüm yoksa güvenli taraf.
export function limitKarari(d: LimitDurumu | null, a: Ayar, simdi: number = Date.now()): LimitKarari {
  const esikler = ([
    ["haftalik", "haftalık", a.haftalik_tavan_yuzde, d?.yedi_gun],
    ["bes_saat", "5 saatlik", a.bes_saat_tavan_yuzde, d?.bes_saat],
  ] as const).filter(([, , tavan]) => tavan !== null);
  if (!esikler.length) return { yeniIsSerbest: true, neden: "tavan tanımlı değil" };

  const yasDk = d ? (simdi - d.ts) / DK + d.yas_dk : Infinity;
  const okunamadi = (ne: string): LimitKarari =>
    ({ yeniIsSerbest: false, neden: `limit okunamadı (${ne}); tavan tanımlıyken güvenli taraf: yeni iş başlamaz` });
  if (!d) return okunamadi("hiç ölçüm yok");
  if (d.bayat || yasDk > BAYAT_DK) {
    const yas = Number.isFinite(yasDk) ? `son ölçüm ${Math.round(yasDk)} dk önce` : "ölçüm yaşı bilinmiyor";
    return { yeniIsSerbest: true, bayat: true, neden: `limit bilinmiyor (bayat), ${yas}; tavan kararı bu değerle verilmez`, uyari: `limit bilinmiyor (bayat), ${yas}` };
  }

  const uyarilar: string[] = [], durumlar: string[] = [];
  for (const [anahtar, ad, tavan, w] of esikler) {
    if (!w) return okunamadi(`${ad} pencere yanıtta yok`);
    const metin = `${ad} %${w.yuzde}`;
    if (w.yuzde >= tavan!) {
      return { yeniIsSerbest: false, neden: `${metin} ≥ tavan %${tavan} (sıfırlanma: ${w.sifirlanma ?? "bilinmiyor"})`, esik_asildi: anahtar };
    }
    if (w.yuzde * 10 >= tavan! * 9) uyarilar.push(`${metin}, tavan %${tavan}'a yaklaştı`);
    durumlar.push(`${metin} < tavan %${tavan}`);
  }
  return { yeniIsSerbest: true, neden: durumlar.join("; "), ...(uyarilar.length && { uyari: uyarilar.join("; ") }) };
}

// ---------- 2) Bekleyen iş kuyruğu ----------
// Limit kapalıyken istenen iş buraya yazılır. Otomatik başlatma YOK: limit açılınca şefe sorulur.

export type BekleyenIs = { id: string; istek: object; neden: string; ts: number };

export function kuyrugaEkle(kuyruk: BekleyenIs[], istek: object, neden: string): BekleyenIs {
  const is: BekleyenIs = { id: `is-${randomUUID().slice(0, 8)}`, istek, neden, ts: Date.now() };
  kuyruk.push(is);
  return is;
}
export const kuyrukOku = (): Promise<BekleyenIs[]> => jsonOku(kuyrukYolu(), []);
// Kuyruk değişince (ekleme, çıkarma, başlatma) dinleyiciler haberdar olur: orkestra bunu panele `kuyruk` olayıyla yayar.
// Dinleyici hatası yazmayı bozmaz.
type KuyrukDinleyici = (k: BekleyenIs[], sebep: "eklendi" | "cikarildi") => void;
const kuyrukDinleyicileri = new Set<KuyrukDinleyici>();
export function kuyrukDinle(f: KuyrukDinleyici): () => void {
  kuyrukDinleyicileri.add(f);
  return () => void kuyrukDinleyicileri.delete(f);
}
export async function kuyrukYaz(k: BekleyenIs[]): Promise<void> {
  const once = kuyrukDinleyicileri.size ? (await kuyrukOku()).length : 0;
  await atomikYaz(kuyrukYolu(), k);
  for (const f of kuyrukDinleyicileri) { try { f(k, k.length > once ? "eklendi" : "cikarildi"); } catch { /* dinleyici hatası yazmayı bozmaz */ } }
}

// ---------- 3) Döngü bekçisi ----------

export type BekciOlay = { tur: "arac" | "commit" | "sozlesme" | "maliyet" | "metin"; arac?: string; girdi_ozet?: string; usd?: number; ts: number };
// uyar: mesaj varsa ajana gider; sefe true ise neden şefe de gider. durdur: her zaman şefe.
export type BekciKarar = { eylem: "yok" | "uyar" | "durdur"; neden?: string; mesaj?: string; sefe?: boolean };
export type BekciDurumu = {
  son: string[]; // son 8 çağrının anahtarı (arac + normalize girdi)
  tekrar: number; // son anahtarın art arda sayısı
  sonIlerleme: number; pencere: number; pencereArac: number; ilerlemesizUyarildi: boolean;
  maliyet: { ts: number; usd: number }[]; // birikimli maliyet örnekleri; ilki başlangıç (0 USD)
};

const SON_N = 8, ARAC_ESIK = 20, MALIYET_PENCERE_MS = 10 * DK;

const SALT_OKUR = new Set(["Read", "Grep", "Glob"]);
const normal = (s = "") => s.replace(/\d{4}-\d\d-\d\dT[\d:.]+(Z|[+-]\d\d:?\d\d)?|\d+/g, "#").replace(/\s+/g, " ").trim();
const kisa = (s = "") => (s.length > 80 ? s.slice(0, 79) + "…" : s);

// Durum ajan kaydıyla birlikte bir kez oluşturulur (diriltme/yeni oturumda değil); maliyet hızı buradan başlar.
export function bekciDurumuYeni(simdi: number = Date.now()): BekciDurumu {
  return { son: [], tekrar: 0, sonIlerleme: simdi, pencere: simdi, pencereArac: 0, ilerlemesizUyarildi: false, maliyet: [{ ts: simdi, usd: 0 }] };
}

// Birikimli maliyetin t anındaki değeri (örnekler arası doğrusal): uzun bir turun maliyeti tek ana yığılmasın.
function birikimAn(o: { ts: number; usd: number }[], t: number): number {
  if (t <= o[0].ts) return o[0].usd;
  for (let i = 1; i < o.length; i++) {
    if (o[i].ts >= t) return o[i - 1].usd + ((o[i].usd - o[i - 1].usd) * (t - o[i - 1].ts)) / (o[i].ts - o[i - 1].ts || 1);
  }
  return o[o.length - 1].usd;
}

export function bekciGozle(d: BekciDurumu, o: BekciOlay, a: Ayar, simdi: number): BekciKarar {
  const kararlar: BekciKarar[] = [];

  if (o.tur === "commit" || o.tur === "sozlesme") {
    Object.assign(d, { sonIlerleme: simdi, pencere: simdi, pencereArac: 0, ilerlemesizUyarildi: false });
  }

  if (o.tur === "arac") {
    const anahtar = `${o.arac ?? ""}\u0000${SALT_OKUR.has(o.arac ?? "") ? (o.girdi_ozet ?? "") : normal(o.girdi_ozet)}`;
    d.tekrar = d.son[d.son.length - 1] === anahtar ? d.tekrar + 1 : 1;
    d.son = [...d.son, anahtar].slice(-SON_N);
    d.pencereArac++;
    const n = d.tekrar;
    if (n >= a.tekrar_durdur) {
      kararlar.push({ eylem: "durdur", neden: `${o.arac} aynı girdiyle ${n} kez art arda çağrıldı: ${kisa(o.girdi_ozet)}` });
    } else if (n === a.tekrar_uyari) {
      kararlar.push({ eylem: "uyar", neden: `${o.arac} aynı girdiyle ${n} kez art arda çağrıldı`, mesaj: `Aynı çağrıyı ${n} kez tekrarladın; yaklaşım değiştir ya da şefe sor.` });
    }
    const s = d.son;
    if (s.length === SON_N && s[0] !== s[1] && s.every((k, i) => k === s[i % 2])) {
      const ad = (k: string) => kisa(k.replace("\u0000", " "));
      kararlar.push({ eylem: "durdur", neden: `iki çağrılı döngü: "${ad(s[0])}" ↔ "${ad(s[1])}" son ${SON_N} çağrıda ${SON_N / 2} kez tekrarlandı` });
    }
  }

  if (simdi - d.pencere >= a.ilerlemesiz_dk * DK && d.pencereArac >= ARAC_ESIK) {
    const dk = Math.round((simdi - d.sonIlerleme) / DK);
    const ne = `son commit/sözleşmeden beri ${dk} dk geçti, bu pencerede ${d.pencereArac} araç çağrısı yapıldı, ilerleme yok`;
    if (d.ilerlemesizUyarildi) kararlar.push({ eylem: "durdur", neden: `${ne} (uyarıdan sonra ikinci kez)` });
    else {
      kararlar.push({ eylem: "uyar", neden: ne, sefe: true });
      // İkinci karar için yeni bir tam pencere (süre + araç sayısı) beklenir; ajana düzeltme şansı.
      Object.assign(d, { pencere: simdi, pencereArac: 0, ilerlemesizUyarildi: true });
    }
  }

  if (o.tur === "maliyet" && typeof o.usd === "number") {
    d.maliyet.push({ ts: simdi, usd: o.usd });
    while (d.maliyet.length > 2 && d.maliyet[1].ts <= simdi - MALIYET_PENCERE_MS) d.maliyet.shift();
    const artis = o.usd - birikimAn(d.maliyet, simdi - MALIYET_PENCERE_MS);
    if (artis > a.maliyet_hizi_usd_10dk) {
      kararlar.push({ eylem: "durdur", neden: `son 10 dk'da ~$${artis.toFixed(2)} harcandı (liste fiyatı tahmini), sınır $${a.maliyet_hizi_usd_10dk.toFixed(2)}` });
    }
  }

  const dur = kararlar.find((k) => k.eylem === "durdur");
  if (dur) return dur;
  if (!kararlar.length) return { eylem: "yok" };
  const mesaj = kararlar.map((k) => k.mesaj).filter(Boolean).join(" ");
  return { eylem: "uyar", neden: kararlar.map((k) => k.neden).join("; "), ...(mesaj && { mesaj }), ...(kararlar.some((k) => k.sefe) && { sefe: true }) };
}
