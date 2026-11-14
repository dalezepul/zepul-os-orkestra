// Kapı: her araç çağrısı için karar. "Kod sayar, Jev yargılar": Jev yalnızca risk sınıflar;
// eşikler, ret ve onay bu dosyadaki koddadır. Laya gölge modda aynı soruyu görür, kararı hiç etkilemez.
// Bağımlılıklar (Jev, Laya, log yazıcıları) enjekte edilir; testler sahtelerini verir. Ayrıntı: sunucu/KAPI.md
import dns from "node:dns/promises";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { kesinYasakMi, ozelIpMi, kabukKomutu, riskliKabukMu, sahiplikIhlaliMi, maskele, listeOgeleri, ozyineliBayrak, susluAc, type Lehce, type Risk } from "./olay.ts";
import { altinda, belirsizYol, kanonik } from "./yol.ts";
import { alanHatasi } from "./bekci.ts";

// ---------- Model kimliği (KURALLAR B, Faz 5.5) ----------
// Claude tam kimlikle; takma ad ve boş geçersiz. Yerel model `ollama:<ad>` (ad Ollama'daki adıdır, ör. qwen3-coder:30b).
// Fable yalnızca şefte ve yalnızca tam Claude kimliğiyle; `ollama:` altında da her biçimde reddedilir. Denetçi de yerel olabilir
// (test aşaması, kullanıcı 03.10); bağımsızlığı modelden değil ayrı ajan ve oturumdan gelir (denetci-<işçi>, kod başlatır).
export const CLAUDE_MODELLERI = ["claude-sonnet-5-5", "claude-opus-5-5"] as const;
export const SEF_FABLE = "claude-fable-5-1";
const YEREL = /^ollama:[A-Za-z0-9][\w.\-/]*(:[\w.\-]+)?$/;
export const yerelMi = (m: unknown): m is string => typeof m === "string" && m.startsWith("ollama:");
export const yerelAd = (m: string) => m.slice("ollama:".length);

export const IKINCI_GORUS_ROLU = "ikinci_gorus";

// Red nedeni ya da null.
export function modelHatasi(m: unknown, rol: string): string | null {
  if (typeof m !== "string" || !m) return "model boş; tam kimlik yaz (claude-sonnet-5-5 | claude-opus-5-5 | ollama:<ad>)";
  if (/fable/i.test(m)) return (rol === "sef" || rol === IKINCI_GORUS_ROLU) && m === SEF_FABLE ? null : `Fable yalnızca şefte ve ikinci görüşte (${SEF_FABLE}); alt ajanda ve yerel kimlikte yasak`;
  if (yerelMi(m)) {
    if (rol === IKINCI_GORUS_ROLU) return "ikinci görüş yalnızca Claude modeliyle açılır (yerel model yok)";
    return YEREL.test(m) && !m.includes("..") ? null : `yerel model kimliği ollama:<ad> biçiminde olmalı: ${m}`;
  }
  return (CLAUDE_MODELLERI as readonly string[]).includes(m) ? null
    : `model tam kimlikle yazılır (${CLAUDE_MODELLERI.join(" | ")}${rol === "sef" ? ` | ${SEF_FABLE}` : ""} | ollama:<ad>); takma ad reddedilir`;
}

export type KapiGirdi = {
  rol: string;
  ajan: string;
  yerel?: boolean; // yerel (ollama:) modelli ajan: Jev hatasında salt okuma dışı her araç insana gider
  arac: string;
  girdi: unknown;
  sahiplik: Map<string, string>;
  kok?: string; // ajanın çalışma dizini (worktree); yoksa process.cwd()
  kopya_kokleri?: string[]; // denetçinin mutasyon kopya kökleri (yazilabilir_kokler): özyineli silmede proje içi sayılır (K26)
  alanlar?: string[]; // calisma_alanlari (docs/sozlesme/calisma-alanlari.md): salt okumada kök sayılır; yasak kök yazılmışsa yok sayılır
  guven?: { kademe: "kullanici" | "jev" | "tam"; alan_otomatik?: boolean }; // docs/sozlesme/guven-modu.md; yoksa jev
};
export type KapiKarar = {
  karar: "izin" | "red" | "insan" | "gec"; // gec: kapı karar vermez, yerleşik auto moduna bırakır
  neden: string;
  risk?: Risk;
  jev?: { secim: string; guven: number; esige_yakin?: boolean };
  karar_kaynagi?: "laya-yedek" | "tam-guven"; // laya-yedek: Jev hata verdi ya da soğumada, karar Laya'dan (aynı eşik ve kurallarla); tam-guven: güven modu tam
  mutlak?: boolean;
  kesin?: true; // kesin yasak listesinden insana giden karar: toplu onay (POST /api/onay/hepsi) bunu atlar, tek tek onaylanır
  parcalar?: KapiParca[]; // bileşik kabuk komutunda parça kararları (kapı olayına geçer, panelde görünür)
  alan?: { yol: string; onerilen: string }; // insan: alan dışı ilk dokunuş; onay kartı tur:"alan" (baglama.ts), "alana ekle" onerilen'i ekler
};
export type KapiParca = { parca: string; secim: string; guven: number };
export type KapiBagimlilik = {
  jevSor: (govde: object) => Promise<any>;
  layaSor: (govde: object) => Promise<any>;
  golgeYaz: (kayit: object) => void;
  hataYaz: (hata: object) => void;
  simdi?: () => number;
  kesinYasak?: typeof kesinYasakMi; // yalnızca test için; varsayılan olay.ts
  tamOrnek?: { sayac: number }; // tam güvende kabuk dışı araçta Jev gölgesi örneklem sayacı (TAM_JEV_ORNEK); yoksa yalnız kabuk araçları
  soguma?: { jev_bitis: number }; // Jev 429 soğuması (ms); bu ana dek Jev'e gidilmez, karar Laya'dan. Yoksa soğuma tutulmaz
  dnsCoz?: (ad: string) => Promise<string[]>; // av11: WebFetch adının adresleri; testler sahtesini verir, varsayılan dns.promises.lookup
  uyariYaz?: (u: { ajan: string; arac: string; sinif: "riskli" | "geri-alinamaz" | "dusuk-guven" }) => void;
};

const SALT_OKUMA = new Set(["Read", "Grep", "Glob", "LS", "NotebookRead", "TodoWrite", "ToolSearch"]);
const YAZMA = new Set(["Edit", "Write", "NotebookEdit", "MultiEdit"]);
const ESIK = 0.8; // Jev güveni bunun altındaysa sonuç "belirsiz" (KURALLAR F)
const YAKIN = 0.05; // K13: |güven − ESIK| bundan küçükse karar "eşiğe yakın" sayılır
const DURUM_SINIRI = 4000;
const RISK: Record<string, Risk> = { guvenli: "dusuk", riskli: "yuksek", "geri-alinamaz": "geri-alinamaz", belirsiz: "orta" };

// Jev'e ve Laya'ya tek istekte giden sorular. İfade ölçümle bir kez iyileştirildi (KAPI.md).
export const SORULAR = {
  risk: {
    type: "choice",
    instructions: "Bu araç çağrısı çalıştırılırsa bilgisayara, projeye ve dış sistemlere ne yapar? Yalnızca verilen komuta ve girdiye bak.",
    criteria: {
      // v2: "paket kurmaz" ve örnekler eklendi; v1'de npm install güvenli/riskli arasında kaldı (güven 0,39).
      // v3 (F13): ping 0,73 ile eşiğin altına düştü; somut güvenli örnekler eklendi, "bir şey" → "veri" (ping ağa veri göndermez).
      guvenli: "yalnızca okur ya da yalnızca proje klasöründeki dosyalarda git ile geri alınabilir değişiklik yapar; paket kurmaz, ağa veri göndermez. Yerel ve geri alınabilir olanlar güvenlidir (ör. ls, git status, npm test, ping)",
      riskli: "paket kurar ya da günceller (npm install, pip install), proje dışına yazar, ağa veri gönderir ya da yükler, süreç öldürür",
      "geri-alinamaz": "dosya ya da veri siler, git geçmişini yeniden yazar ya da dış sisteme kalıcı etki eder (push, deploy, e-posta)",
      belirsiz: "komuttan ne yapacağı anlaşılamıyor",
    },
  },
  dis_etki: { type: "noul", instructions: "Bu komut makine veya proje dışına kalıcı etki eder mi?" },
};

// olay.ts maskelemesine ek olarak: kullanıcı dizini → ~, e-posta → <eposta>.
export function jevMaskele(s: string): string {
  return maskele(s)
    .replace(/\b[a-z]:[\\/]+users[\\/]+[^\\/\s"'`]+/gi, "~")
    .replace(/\b[a-z]--users-[^-\s\\/"'`]+/gi, "~") // Claude Code proje klasörü adı: C--Users-<ad>-Desktop-… (duman testinde sızdı)
    .replace(/(^|[\s"'`=(])\/(?:[a-z]\/)?(?:users|home)\/[^/\s"'`]+/gi, "$1~")
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}\b/gi, "<eposta>");
}

const kisalt = (s: string, n: number) => (s.length > n ? `${s.slice(0, n / 2)} … ${s.slice(-n / 2)}` : s);
const BAGLAM_SINIRI = 1600;
function durum(g: KapiGirdi, kok: string, tam?: string): string {
  const komut = kabukKomutu(g.girdi);
  const icerik = komut !== null ? `Komut:\n${komut}` : `Girdi (JSON):\n${JSON.stringify(g.girdi ?? {})}`;
  const baglam = tam ? `\nBağlam: bu komut, aşağıdaki bileşik komutun bir parçası; yalnızca yukarıdaki parçayı değerlendir.\n${kisalt(tam, BAGLAM_SINIRI)}` : "";
  const s = jevMaskele(`Araç: ${g.arac}\nÇalışma dizini (proje kökü): ${kok}\n${icerik}${baglam}`);
  return kisalt(s, DURUM_SINIRI);
}

// ham_secim / guvenli_olasilik: yalnız gölge Laya (8796) döner; eşik öncesi karar ve güvenli olasılığı (Faz 6).
type Cevap = { secim: string; guven: number; olasiliklar: Record<string, number>; dis_etki?: number; ham_secim?: string; guvenli_olasilik?: number; laya_yedek?: true };

function cevapOku(j: any): Cevap {
  const r = j?.answers?.risk;
  const guven = Number(r?.confidence ?? r?.answer_confidence);
  if (typeof r?.choice !== "string" || !Number.isFinite(guven)) throw Object.assign(new Error("bozuk yanıt: answers.risk yok"), { bozuk: true });
  return { secim: r.choice, guven, olasiliklar: r.probabilities ?? {}, dis_etki: j.answers.dis_etki?.noul,
    ...(typeof r.ham_secim === "string" ? { ham_secim: r.ham_secim } : {}), ...(Number.isFinite(r.guvenli_olasilik) ? { guvenli_olasilik: r.guvenli_olasilik } : {}) };
}

function hataSinifi(e: any): { kaynak: "ag" | "kapi"; tur_adi: string } {
  if (e?.name === "TimeoutError" || e?.name === "AbortError") return { kaynak: "ag", tur_adi: "zaman_asimi" };
  if (e?.status) return { kaynak: "ag", tur_adi: `http_${e.status}` };
  if (e?.bozuk || e instanceof SyntaxError) return { kaynak: "kapi", tur_adi: "bozuk_yanit" };
  return { kaynak: "ag", tur_adi: "ag_hatasi" };
}

// Eşikler: Jev olasılığı yüzde değil; yalnızca seçim ve güven eşiği kullanılır.
function esikKarari(kabuk: boolean, c: Cevap): KapiKarar {
  // K13: güven eşiğe YAKIN'dan yakınsa (dalgalanma bölgesi) işaretlenir; kapı olayına geçer, olay logunda izlenir.
  const jev = { secim: c.secim, guven: c.guven, ...(Math.abs(c.guven - ESIK) < YAKIN ? { esige_yakin: true } : {}) };
  const ozet = `${c.laya_yedek ? "Laya (Jev yedeği)" : "Jev"}: ${c.secim} (güven ${c.guven.toFixed(2)})`;
  if (c.secim === "geri-alinamaz") return { karar: "insan", neden: `${ozet}, geri alınamaz`, risk: "geri-alinamaz", jev };
  if (c.guven < ESIK || c.secim === "belirsiz" || !Object.hasOwn(RISK, c.secim)) {
    return kabuk
      ? { karar: "insan", neden: `${ozet}, belirsiz: kabuk komutu insana`, risk: "orta", jev }
      : { karar: "gec", neden: `${ozet}, belirsiz: auto moda bırakıldı`, risk: "orta", jev };
  }
  if (c.secim === "riskli") return { karar: "insan", neden: `${ozet}, riskli`, risk: "yuksek", jev };
  return { karar: "gec", neden: `${ozet}, güvenli`, risk: "dusuk", jev };
}

// av9 şef kararı: kabuktaki kopya içi silme (K26) ve kopya içi worktree (faz3-kapanis B2) kısa yolları kaldırıldı. Denetçi
// mutasyon kopyasını bus araçlarıyla açar ve siler (mutasyon_kopyasi_ac / _sil, worktree.ts). Kabuktaki silme ve worktree add
// her rolde normal yoldan (kesin yasak, sahiplik, Jev) geçer; kod izni yoktur.
const SILME = /^(rm|remove-item|ri|rmdir|rd|del|erase)$/i;
const adi = (s: string) => (s.split(/[\\/]/).pop() ?? "").replace(/\.exe$/i, ""); // olay.ts'teki eşi gibi iki ayırıcı (hata-avi-3 B8)

// Özyineli silmenin bir hedefinde değişken ya da çözülemeyen ifade var mı ($X, ${X}, $env:X, %X%)? Yalnız denetçide kullanılır.
function degiskenliSilme(komut: string, lehce: Lehce): boolean {
  return listeOgeleri(komut, lehce).some(({ parcalar }) => parcalar.some((t) => {
    const i = t.findIndex((s) => SILME.test(adi(s)));
    const arg = i < 0 ? [] : t.slice(i + 1);
    return arg.some(ozyineliBayrak) && arg.some((a) => !/^-|^\/[a-z]$/i.test(a) && /\$|%[^%\s]+%/.test(a));
  }));
}

const PARCA_SINIRI = 4;
type Soz = { v: string; ozel: boolean }; // v: tırnaksız değer; ozel: tırnak dışı @*?[]~ ya da çift tırnakta $
type Asama = { ham: string; sozler: Soz[]; yon: boolean };
const KARAKTER = /^[\t\x20-\x7e\p{L}\p{M}\p{N}]*$/u; // satır sonu, \r, NUL, diğer kontrol ve akıllı tırnaklar dışarıda
const YASAK_DIZI = /`|\$\(|<<|<\(|>\(|--%|\$env:/i;
// av9: rm listeden çıktı (kopya içi silme kısa yolu yok); silme içeren bileşik komut bölünmez, tek soru gider (hata-avi-5 B2).
const ILK_IZIN = new Set(["git", "npm", "npx", "node", "tsx", "ls", "dir", "mkdir", "cat", "echo", "test", "[", "pwd",
  "get-childitem", "get-content", "test-path", "write-output"]);
const KABUK = new Set(["bash", "sh", "zsh", "dash", "ksh", "cmd", "powershell", "pwsh", "eval", "iex", "invoke-expression", "invoke-command", "icm", "start-process"]);
function altKume(komut: string, lehce: Lehce): Asama[][] | null {
  if (!KARAKTER.test(komut) || YASAK_DIZI.test(komut)) return null;
  const ogeler: Asama[][] = [];
  let asamalar: Asama[] = [], sozler: Soz[] = [], soz: Soz | null = null, yon = false, bas = 0;
  const ek = (v: string, ozel = false) => { soz ??= { v: "", ozel: false }; soz.v += v; soz.ozel ||= ozel; };
  const sozBitir = () => { if (soz) sozler.push(soz); soz = null; };
  const asamaBitir = (son: number) => {
    sozBitir();
    if (!sozler.length) return false; // boş öğe ya da aşama (;; , | |, sondaki ;): alt küme dışı
    asamalar.push({ ham: komut.slice(bas, son).trim(), sozler, yon });
    sozler = []; yon = false;
    return true;
  };
  for (let i = 0; i < komut.length; i++) {
    const c = komut[i], s = komut[i + 1];
    if (c === "'") {
      const j = komut.indexOf("'", i + 1);
      if (j < 0) return null;
      ek(komut.slice(i + 1, j)); i = j;
    } else if (c === '"') {
      let ic = "", j = i + 1;
      for (; j < komut.length && komut[j] !== '"'; j++) {
        if (lehce === "bash" && komut[j] === "\\" && '$"\\'.includes(komut[j + 1] ?? "")) j++;
        ic += komut[j];
      }
      if (j >= komut.length) return null;
      ek(ic, ic.includes("$")); i = j;
    } else if (c === "\\" && lehce === "bash") {
      if (s === undefined) return null;
      ek(s); i++;
    } else if (c === " " || c === "\t") sozBitir();
    else if (c === "#" && soz === null) return null; // yorum
    else if (c === ";" || (c === "&" && s === "&") || (c === "|" && s === "|")) {
      if (!asamaBitir(i)) return null;
      ogeler.push(asamalar); asamalar = [];
      if (c !== ";") i++;
      bas = i + 1;
    } else if (c === "|") {
      if (s === "&" || !asamaBitir(i)) return null;
      bas = i + 1;
    } else if (c === "<" || c === ">") {
      sozBitir(); yon = true;
      if (s === "|") return null; // >| noclobber yönlendirmesi
      if (s === "&" || (c === ">" && s === ">")) i++;
    } else if (/[&(){}]/.test(c)) return null; // arka plan, çağırma işleci, alt kabuk, küme, betik bloğu
    else if (c === "$") return null; // hata-avi-5 B1: tırnak dışı $ ($'…', $"…", $X, ${X}): genişletme farkı, bölünmez
    else if (c === "," && lehce === "ps") return null; // av6 B1: PowerShell'de tırnak dışı a,b dizidir, öğeler ayrı argüman olur
    else ek(c, /[@*?[\]~]/.test(c));
  }
  if (!asamaBitir(komut.length)) return null;
  ogeler.push(asamalar);
  if (ogeler.some((o) => !ILK_IZIN.has(o[0].sozler[0].v.toLowerCase()))) return null;
  if (ogeler.flat().some((a) => a.sozler.some((w) => KABUK.has(adi(w.v).toLowerCase())))) return null;
  // av9: find -exec/-execdir ve xargs başka komut çalıştırır; PowerShell @splat bayrakları değişkende taşır. Bölünmez, tek soru.
  if (ogeler.flat().some((a) => a.sozler.some((w) => /^(find|xargs)$/i.test(adi(w.v)) || /^-exec/i.test(w.v) || (lehce === "ps" && w.ozel && w.v.startsWith("@"))))) return null;
  return ogeler;
}

// Süzgeç beyaz listesi: yalınç ad (yol öneki ve .exe yok), açık bayrak listesi, dosya argümanı ve yönlendirme yok; yalnız stdin.
const sayi = (x?: string) => x !== undefined && /^\d+$/.test(x);
const nSatir = (a: string[]) => !a.length || (a.length === 1 && /^-\d+$/.test(a[0])) || (a.length === 2 && a[0] === "-n" && sayi(a[1]));
const tekDesen = (a: string[], bayrak: (x: string) => boolean) => a.filter((x) => !bayrak(x)).length === 1 && a.filter((x) => !bayrak(x)).every((x) => !/^[-/]/.test(x));
// PowerShell parametreleri: tam ad (kısaltma yok), değerli olanın değeri denetlenir. Dönüş: konum argümanı sayısı, geçersizse -1.
const psParam = (a: string[], anahtar: string[], degerli: Record<string, (x?: string) => boolean>) => {
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i].toLowerCase();
    if (anahtar.includes(x)) continue;
    if (Object.hasOwn(degerli, x)) { if (!degerli[x](a[++i])) return -1; continue; }
    if (x.startsWith("-")) return -1;
    k++;
  }
  return k;
};
const desen = (x?: string) => x !== undefined && !x.startsWith("-");
const SUZGEC: Record<string, (a: string[]) => boolean> = {
  tail: nSatir,
  head: nSatir,
  grep: (a) => tekDesen(a, (x) => /^-[Eivcnoq]+$/.test(x)),
  sort: (a) => a.every((x) => /^-[rnu]+$/.test(x)),
  wc: (a) => a.every((x) => /^-[lcw]+$/.test(x)),
  cat: (a) => !a.length,
  cut: (a) => {
    for (let i = 0; i < a.length; i++) {
      if (/^-d.$/.test(a[i]) || /^-[fc][\d,-]+$/.test(a[i])) continue;
      if (a[i] === "-d" && a[i + 1]?.length === 1) { i++; continue; }
      if (/^-[fc]$/.test(a[i]) && /^[\d,-]+$/.test(a[i + 1] ?? "")) { i++; continue; }
      return false;
    }
    return a.length > 0;
  },
  tr: (a) => { const k = a.filter((x) => !/^-[cds]+$/.test(x)); return k.length >= 1 && k.length <= 2 && k.every((x) => !x.startsWith("-")); },
  findstr: (a) => a.filter((x) => /^\/c:/i.test(x)).length + a.filter((x) => !x.startsWith("/")).length === 1 && a.every((x) => !x.startsWith("/") || /^\/([ivnbelr]|c:.+)$/i.test(x)),
  "select-string": (a) => {
    const k = psParam(a, ["-simplematch", "-notmatch", "-casesensitive", "-allmatches", "-quiet"], { "-pattern": desen });
    return k >= 0 && k + a.filter((x) => /^-pattern$/i.test(x)).length === 1 && (k === 0 || a.filter((x) => !x.startsWith("-")).every(desen));
  },
  "select-object": (a) => psParam(a, ["-unique"], { "-first": sayi, "-last": sayi, "-skip": sayi }) === 0,
  "out-string": (a) => psParam(a, ["-stream"], { "-width": sayi }) === 0,
};
function suzgecMi(a: Asama): boolean {
  const [ad, ...arg] = a.sozler, f = Object.hasOwn(SUZGEC, ad.v.toLowerCase()) ? SUZGEC[ad.v.toLowerCase()] : undefined;
  return !!f && !a.yon && !ad.ozel && !arg.some((w) => w.ozel) && f(arg.map((w) => w.v));
}
// Parçalar ya da null (bölme yok, tümü tek soru). Tek öğeli borulu komutta süzgeç atıldıysa tek parça döner (faz3-k26-final B1).
function bilesikParcalar(komut: string, lehce: Lehce): string[] | null {
  const ogeler = altKume(komut, lehce);
  if (!ogeler) return null;
  let atildi = false;
  for (const o of ogeler) {
    if (o.length === 1) continue;
    if (!o.slice(1).every(suzgecMi)) return null; // süzgeç dışı boru: aşamalar veri aktarır, bütün sorulur
    atildi = true;
  }
  return ogeler.length > 1 || atildi ? ogeler.map((o) => o[0].ham) : null;
}
const RISK_SIRA: (Risk | undefined)[] = ["geri-alinamaz", "yuksek", "orta"];

const yut = (f: () => void) => { try { f(); } catch { /* log yazılamadı: karar etkilenmez */ } };

// OWNS deseni ağaca göredir: repo ya da repo/.worktrees/<ad>. Yol bu ağaçlardan birindeyse onun kökü, değilse ajanın kökü.
function agacKoku(yol: string, kok: string): string {
  const y = kanonik(yol, kok), r = kanonik(REPO);
  if (!altinda(y, r)) return kok;
  const wt = y.slice(r.length).match(/^\/\.worktrees\/[^/]+/);
  return wt ? r + wt[0] : r;
}

// av11 şef kararı (Bulgu 1, 2): proje dışı okuma sınıfı kapalı. Salt okur aracın hedefi kanonik çözülür; ajanın kökü (worktree),
// kök ana repodaysa ana repo ve denetçide kopya kökleri dışındaysa insan. Yol yoksa (Grep/Glob) hedef cwd'dir, o da kök.
// Glob pattern'inin jokersiz öneki de hedeftir (mutlak desen, ../). file: adresi yola çevrilir; çevrilemezse dışarıda sayılır.
// Çalışma alanları da köktür (calisma-alanlari.md). Dönüş: dışarıdaki ilk hedef (ham, çözülmüş kanonik ya da null) ya da null.
const OKUMA_YOLU = new Set(["Read", "Grep", "Glob", "NotebookRead", "LS"]);
function projeDisiOkuma(g: KapiGirdi, kok: string): [string, string | null] | null {
  if (!OKUMA_YOLU.has(g.arac)) return null;
  const i = (g.girdi ?? {}) as Record<string, unknown>;
  const ana = kanonik(REPO), k = kanonik(kok);
  const kokler = [k, ...(altinda(k, ana) ? [ana] : []), ...(g.rol === "denetci" ? (g.kopya_kokleri ?? []).map((x) => kanonik(x)) : []),
    ...(g.alanlar ?? []).filter((x) => !alanHatasi(x, false)).map((x) => kanonik(x))];
  const coz = (v: string, taban: string): string | null => {
    if (!/^file:/i.test(v)) return kanonik(v, taban);
    try { return kanonik(fileURLToPath(v), taban); } catch { return null; }
  };
  const hedefler: [string, string | null][] = [];
  for (const a of ["file_path", "notebook_path", "path"]) if (typeof i[a] === "string") hedefler.push([i[a] as string, coz(i[a] as string, kok)]);
  if (g.arac === "Glob" && typeof i.pattern === "string") {
    const taban = typeof i.path === "string" ? coz(i.path, kok) : k;
    // Aday 5: süslü parantez alt kümesindeki desenin her açılımı ayrı hedeftir ({sunucu/ses.ts,x} → sunucu).
    for (const desen of susluAc(i.pattern) ?? [i.pattern]) {
      const onek = desen.replace(/\\/g, "/").split("/");
      if (onek.some((p) => /^\.\.[. ]*$/.test(p))) return [i.pattern, null];
      const n = onek.findIndex((p) => /[*?[\]{}]/.test(p));
      const s = n < 0 ? onek.slice(0, -1) : onek.slice(0, n), sabit = s.length ? s.join("/") || "/" : ".";
      hedefler.push([i.pattern, taban === null ? null : coz(sabit, taban)]);
    }
  }
  return hedefler.find(([, h]) => h === null || !kokler.some((x) => altinda(h, x))) ?? null;
}

// Alan kartının önerisi: yolun git kökü; yoksa yolun bulunduğu klasör (yol klasörse kendisi). Gerçek adıyla döner.
// Öneri yasak köke düşerse (sürücü kökü, kullanıcı dizini …) null: kart düz insan onayı olur, "alana ekle" sunulmaz.
export function alanOnerisi(hedef: string): string | null {
  let d = fs.statSync(hedef, { throwIfNoEntry: false })?.isDirectory() ? hedef : path.dirname(hedef);
  for (let x = d; ; x = path.dirname(x)) {
    if (fs.existsSync(path.join(x, ".git"))) { d = x; break; }
    if (path.dirname(x) === x) break;
  }
  try { d = fs.realpathSync.native(d); } catch { return null; }
  return alanHatasi(d) ? null : d;
}

// av11 (güvenlik incelemesi): metin denetimini geçen WebFetch/WebSearch adı DNS ile çözülür; adreslerden biri yerel ya da özelse
// red (127.0.0.1.nip.io, localtest.me). Çözüm hatası ya da DNS_MS aşımı insana (kapalı kapı). IP yazımı çözülmez, metin yeterli.
// Bilinen sınır: WebFetch'in kendi yönlendirmesi ve çözüm ile istek arasındaki DNS değişimi (rebinding) burada görülmez.
const DNS_MS = 2000;
const dnsCoz = async (ad: string) => (await dns.lookup(ad, { all: true })).map((a) => a.address);
async function adCozumKarari(g: KapiGirdi, d: KapiBagimlilik): Promise<KapiKarar | null> {
  const url = ((g.girdi ?? {}) as Record<string, unknown>).url;
  if (g.arac !== "WebFetch" && g.arac !== "WebSearch") return null;
  // Yönlendirmeyi kapı denetleyemez; yerel ajanda ikinci ağ yok, Jev'e sorulmadan insana. av12 Bulgu 2: url olmasa da
  // (WebSearch {query}); yerel ajanda gec açık allow'dur (baglama.ts).
  if (g.yerel) return { karar: "insan", neden: `${g.arac}: yerel ajanda ağ erişimi insana (yönlendirme denetlenemez)`, risk: "yuksek" };
  if (typeof url !== "string") return null;
  let ad: string;
  try { ad = new URL(url.trim()).hostname.replace(/\.+$/, ""); } catch { return { karar: "insan", neden: `${g.arac}: adres ayrıştırılamadı`, risk: "orta" }; }
  if (ad.startsWith("[") || /^\d+\.\d+\.\d+\.\d+$/.test(ad)) return null;
  let sure: ReturnType<typeof setTimeout> | undefined;
  try {
    const adresler = await Promise.race([(d.dnsCoz ?? dnsCoz)(ad),
      new Promise<never>((_, ret) => { sure = setTimeout(() => ret(new Error(`${DNS_MS} ms aşıldı`)), DNS_MS); })]);
    const ozel = adresler.find(ozelIpMi);
    if (ozel !== undefined) return { karar: "red", neden: `${g.arac}: ${ad} yerel ya da özel adrese çözülüyor (${ozel})`, risk: "yuksek", mutlak: true };
    return adresler.length ? null : { karar: "insan", neden: `${g.arac}: ${ad} hiçbir adrese çözülmedi`, risk: "orta" };
  } catch (e: any) {
    return { karar: "insan", neden: `${g.arac}: ${ad} çözülemedi (${String(e?.message ?? e).slice(0, 100)}); kapalı kapı`, risk: "orta" };
  } finally { clearTimeout(sure); }
}

// Kesin yasak (1-2): yasaksa karar, değilse null. Denetçide özyineli silme yasağı kopya köküne göre yeniden denetlenir (K26):
// kopya içi silme yasak sayılmaz, normal yoldan Jev'e gider (av9: kod izni yok).
function yasakKarari(g: KapiGirdi, girdi: unknown, kok: string, d: KapiBagimlilik): KapiKarar | null {
  // `mutlak` alanını olay.ts ekliyor (faz1 B10); yoksa yasak insana gider.
  const kesin = (k: string) => (d.kesinYasak ?? kesinYasakMi)(g.arac, girdi, k) as ReturnType<typeof kesinYasakMi> & { mutlak?: boolean };
  let y = kesin(kok);
  // K26: denetçinin proje kökü kendi kopya köküdür. Yalnız özyineli silme yasağında, yalnız denetçide: kopya kökü kök sayılarak
  // yeniden denetlenir, tüm komut temiz çıkarsa yasak kalkar. Kökün kendisi, ana repo ve diğer yollar (kanonik, yol.ts) yasak kalır.
  // Göreli hedef iki kökte de içeride sayılır: çalışma dizinindeki göreli silme bugünkü gibi serbest kalır, gevşeme yok.
  if (y.yasak && !y.mutlak && g.rol === "denetci" && /özyineli silme/.test(y.neden)) {
    const k = (g.kopya_kokleri ?? []).map(kesin).find((x) => !x.yasak);
    if (k) y = k;
    // faz3-kapanis B1: hedef değişkenliyse kod çözemez; insana sormak yerine red (sorulmaz; güvenli yan). av9: silme aracı var.
    const komut = kabukKomutu(girdi);
    if (y.yasak && komut !== null && degiskenliSilme(komut, g.arac === "PowerShell" ? "ps" : "bash")) {
      return { karar: "red", neden: `${y.neden}: hedef değişken içeriyor; silme için mutasyon_kopyasi_sil aracını kullan`, risk: y.risk };
    }
  }
  if (!y.yasak) return null;
  return y.mutlak ? { karar: "red", neden: y.neden, risk: y.risk, mutlak: true } : { karar: "insan", neden: y.neden, risk: y.risk, kesin: true };
}

export const JEV_SOGUMA_MS = 10 * 60_000;
async function jevSorgu(g: KapiGirdi, d: KapiBagimlilik, state: string): Promise<Cevap> {
  const simdi = d.simdi ?? Date.now;
  const govde = { state, questions: SORULAR };
  const t0 = simdi();
  // Hata hemen yakalanır: Jev beklenirken Laya reddederse işlenmemiş ret süreci düşürmesin.
  const laya: Promise<(Cevap & { ms: number }) | { hata: any }> = Promise.resolve()
    .then(() => d.layaSor(govde))
    .then((j) => ({ ...cevapOku(j), ms: simdi() - t0 }))
    .catch((hata) => ({ hata }));
  const layaHatasi = (l: { hata: any }) => yut(() => d.hataYaz({ ...hataSinifi(l.hata), mesaj: `Laya (gölge): ${String(l.hata?.message ?? l.hata)}`, geri_alinabilir: true, devam_edilebilir: true, oneri: "Gölge Laya sunucusunu (8796, araclar/laya-golge-sunucu.py) kontrol et", baglam: { ajan: g.ajan, arac: g.arac } }));
  const ozet = ({ ms: _ms, ...c }: Cevap & { ms: number }) => c;
  let jev: Cevap & { ms: number };
  try {
    if (d.soguma && simdi() < d.soguma.jev_bitis) throw Object.assign(new Error("Jev soğumada (429), doğrudan Laya"), { soguma: true });
    jev = { ...cevapOku(await d.jevSor(govde)), ms: simdi() - t0 };
  } catch (e: any) {
    if (!e?.soguma) {
      // Etiket yok: gölge kaydı yazılmaz.
      yut(() => d.hataYaz({ ...hataSinifi(e), mesaj: String(e?.message ?? e), geri_alinabilir: true, devam_edilebilir: true, oneri: "Jev bağlantısını (ZEPUL_JEV_URL, opencode.ai) ve ağı kontrol et", baglam: { ajan: g.ajan, arac: g.arac } }));
      if (d.soguma && (e?.status === 429 || /429|FreeUsageLimit/i.test(String(e?.message ?? "")))) d.soguma.jev_bitis = simdi() + JEV_SOGUMA_MS;
    }
    const l = await laya;
    if ("hata" in l) { layaHatasi(l); throw e; }
    yut(() => d.golgeYaz({ ts: new Date().toISOString(), arac: g.arac, girdi_maskeli: govde.state, jev: null, laya: ozet(l), karar_kaynagi: "laya-yedek", laya_ms: l.ms }));
    return { ...ozet(l), laya_yedek: true };
  }
  laya.then((l) => "hata" in l ? layaHatasi(l)
    : yut(() => d.golgeYaz({ ts: new Date().toISOString(), arac: g.arac, girdi_maskeli: govde.state, jev: ozet(jev), laya: ozet(l), uyum: jev.secim === l.secim, jev_ms: jev.ms, laya_ms: l.ms })));
  return jev;
}

// Kesin yasak ve sahiplik yukarıda zaten çalıştı. F8: riskli sezgisine uyan kabuk komutu insana; kalanı yerleşik
// auto sınıflandırıcıya (fail-open, ikinci ağ). Yol haritası: "Jev çökerse riskli sınıf insana gider, düşük risk devam eder".
// Yerel ajanda auto sınıflandırıcı kapalı (dontAsk): "gec" = izin olurdu. Salt okuma yukarıda döndü; kalan her araç insana.
function jevHatasiKarari(g: KapiGirdi): KapiKarar {
  if (g.yerel) return { karar: "insan", neden: "Jev erişilemedi; yerel ajanda salt okuma dışı araç insana", risk: "yuksek" };
  const komut = kabukKomutu(g.girdi);
  if (komut !== null && riskliKabukMu(komut)) return { karar: "insan", neden: "Jev erişilemedi; riskli kabuk komutu insana", risk: "yuksek" };
  return { karar: "gec", neden: "Jev erişilemedi, auto moda bırakıldı" };
}

const parcaGirdi = (g: KapiGirdi, p: string) => ({ ...((g.girdi ?? {}) as Record<string, unknown>), command: p });
function parcaYasak(g: KapiGirdi, d: KapiBagimlilik, kok: string, oge: string[]): KapiKarar | null {
  for (const p of oge) {
    const y = yasakKarari(g, parcaGirdi(g, p), kok, d);
    if (y) return { ...y, neden: `bileşik komutun bir parçası yasak (${maskele(p).slice(0, 200)}): ${y.neden}` };
  }
  return null;
}

// Tam güven: karar anında izin. Laya gölgede sorulur, beklenmez. Jev de gölgede sorulur (aday 1, uyum ölçümü için):
// kabuk aracında her zaman, diğerlerinde her TAM_JEV_ORNEK kararın birinde (d.tamOrnek yoksa yalnız kabuk). Jev kararı etkilemez,
// beklenmez; soğumada atlanır, hatası sessizce yutulur (429 soğumayı başlatır). Kayıt Jev ve Laya'yı aynı satıra yazar.
export const TAM_JEV_ORNEK = 3;
export const TAM_UYARI_GUVEN = 0.5;
function tamIzin(g: KapiGirdi, d: KapiBagimlilik, kok: string, ne: string): KapiKarar {
  const simdi = d.simdi ?? Date.now, govde = { state: durum(g, kok), questions: SORULAR }, t0 = simdi();
  const kabuk = g.arac === "Bash" || g.arac === "PowerShell";
  const ornek = !!d.tamOrnek && ++d.tamOrnek.sayac % TAM_JEV_ORNEK === 0;
  const jev: Promise<(Cevap & { ms: number }) | null> = (kabuk || ornek) && !(d.soguma && t0 < d.soguma.jev_bitis)
    ? Promise.resolve().then(() => d.jevSor(govde)).then((j) => ({ ...cevapOku(j), ms: simdi() - t0 })).catch((e) => {
      if (d.soguma && (e?.status === 429 || /429|FreeUsageLimit/i.test(String(e?.message ?? "")))) d.soguma.jev_bitis = simdi() + JEV_SOGUMA_MS;
      return null;
    })
    : Promise.resolve(null);
  void Promise.resolve().then(() => d.layaSor(govde)).then(async (j) => {
    const l = cevapOku(j), laya_ms = simdi() - t0;
    if (l.secim === "riskli" || l.secim === "geri-alinamaz") yut(() => d.uyariYaz?.({ ajan: g.ajan, arac: g.arac, sinif: l.secim as "riskli" }));
    else if (kabuk && l.secim === "guvenli" && l.guven < TAM_UYARI_GUVEN) yut(() => d.uyariYaz?.({ ajan: g.ajan, arac: g.arac, sinif: "dusuk-guven" }));
    const jv = await jev;
    const jevAlan = jv ? (({ ms, ...c }) => ({ jev: c, uyum: c.secim === l.secim, jev_ms: ms }))(jv) : { jev: null };
    yut(() => d.golgeYaz({ ts: new Date().toISOString(), arac: g.arac, girdi_maskeli: govde.state, ...jevAlan, laya: l, kademe: "tam", laya_ms }));
  }).catch((e) => yut(() => d.hataYaz({ ...hataSinifi(e), mesaj: `Laya (gölge): ${String(e?.message ?? e)}`, geri_alinabilir: true, devam_edilebilir: true,
    oneri: "Gölge Laya sunucusunu (8796, araclar/laya-golge-sunucu.py) kontrol et", baglam: { ajan: g.ajan, arac: g.arac } })));
  return { karar: "izin", neden: `izin (tam güven): ${ne}`, risk: "dusuk", karar_kaynagi: "tam-guven" };
}

async function parcaliKarar(g: KapiGirdi, d: KapiBagimlilik, kok: string, komut: string, oge: string[]): Promise<KapiKarar | null> {
  const y = parcaYasak(g, d, kok, oge);
  if (y) return y;
  if (oge.length > PARCA_SINIRI) return null;
  let cevaplar: Cevap[];
  try {
    cevaplar = await Promise.all(oge.map((p) => jevSorgu(g, d, durum({ ...g, girdi: parcaGirdi(g, p) }, kok, komut))));
  } catch {
    return jevHatasiKarari(g);
  }
  const parcalar: KapiParca[] = oge.map((p, k) => ({ parca: maskele(p).slice(0, 200), secim: cevaplar[k].secim, guven: cevaplar[k].guven }));
  const kaynak = cevaplar.some((c) => c.laya_yedek) ? { karar_kaynagi: "laya-yedek" as const } : {};
  const kotu = cevaplar.map((c) => esikKarari(true, c)).filter((k) => k.karar !== "gec")
    .sort((a, b) => RISK_SIRA.indexOf(a.risk) - RISK_SIRA.indexOf(b.risk))[0];
  if (kotu) return { ...kotu, neden: `bileşik komut, ${oge.length} parça; en riskli parça: ${kotu.neden}`, parcalar, ...kaynak };
  return { karar: "izin", neden: `bileşik komut, ${oge.length} parçanın hepsi güvenli (${"karar_kaynagi" in kaynak ? "Laya (Jev yedeği)" : "Jev"} güveni ≥ ${ESIK})`, risk: "dusuk", parcalar, ...kaynak };
}

export async function kapiKarari(g: KapiGirdi, d: KapiBagimlilik): Promise<KapiKarar> {
  const kok = g.kok ?? process.cwd();
  const i = (g.girdi ?? {}) as Record<string, unknown>;

  // 1-2) Kesin yasak her araçta önce çalışır: salt okuma aracıyla sır dosyası okuma da yakalanır.
  const y = yasakKarari(g, g.girdi, kok, d);
  if (y) return y;
  // av12: açılışı belirsiz yol (~kullanici, %VAR%, $VAR, $env:VAR) izin sayılmaz; kapalı kapı.
  // av13 Bulgu 2: file: adresini CLI açmaz, denetimler farklı yorumlar; her yol alanında insana.
  const belirsiz = ["file_path", "notebook_path", "path", ...(g.arac === "Glob" ? ["pattern"] : [])].map((a) => i[a]).find((v) => typeof v === "string" && (belirsizYol(v) || /^\s*file:/i.test(v)));
  if (belirsiz) return { karar: "insan", neden: `${g.arac}: açılışı belirsiz yol (~kullanici, %VAR%, $VAR): ${maskele(String(belirsiz)).slice(0, 200)}`, risk: "orta" };
  const kademe = g.guven?.kademe ?? "jev";
  const ac = await adCozumKarari(g, d);
  if (ac) return ac;
  const dis = projeDisiOkuma(g, kok);
  if (dis) {
    const onerilen = dis[1] && alanOnerisi(dis[1]);
    if (onerilen && kademe === "tam" && g.guven?.alan_otomatik) return tamIzin(g, d, kok, "çalışma alanı kartı otomatik onaylandı");
    return { karar: "insan", neden: `${onerilen ? "çalışma alanı dışı" : "proje dışı"} okuma (${g.arac}): ${maskele(dis[0]).slice(0, 200)}`, risk: "orta",
      ...(onerilen ? { alan: { yol: maskele(dis[0]).slice(0, 200), onerilen } } : {}) };
  }
  if (SALT_OKUMA.has(g.arac) || g.arac.startsWith("mcp__bus__")) return { karar: "izin", neden: "salt okuma", risk: "dusuk" };
  const komut = kabukKomutu(g.girdi);
  const lehce: Lehce = g.arac === "PowerShell" ? "ps" : "bash";

  // 3-4) Sahiplik (kod). Kendi OWNS alanında yazma Jev'e sorulmaz: auto modu ve sahiplik yeterli.
  // Yol ve desen kanonikleştirilir (olay.ts sahiplikIhlaliMi → yol.ts). W2: başkasının OWNS'u, yolun bulunduğu ağaca göre de
  // denetlenir; OWNS'u olmayan ajan worktree'den ana repodaki sahipli dosyaya mutlak yolla yazıp Jev'e düşmesin.
  // av11 Bulgu 4: NotebookEdit'in yolu notebook_path'tir; fazladan farklı bir file_path verilmişse hangisine yazılacağı bilinmez.
  const yol = g.arac === "NotebookEdit" ? i.notebook_path : i.file_path;
  if (g.arac === "NotebookEdit" && typeof yol === "string" && typeof i.file_path === "string" && kanonik(i.file_path, kok) !== kanonik(yol, kok)) {
    return { karar: "insan", neden: "NotebookEdit: notebook_path ile file_path farklı yolu gösteriyor", risk: "yuksek" };
  }
  if (YAZMA.has(g.arac) && typeof yol === "string") {
    const s = [kok, agacKoku(yol, kok)].map((k) => sahiplikIhlaliMi(g.ajan, yol, g.sahiplik, k)).find((x) => x.ihlal);
    if (s) return { karar: "red", neden: `bu dosyanın sahibi ${s.sahip}; sahibine mesaj_gonder ile yaz` };
    const kendi = new Map([...g.sahiplik].filter(([, sahip]) => sahip === g.ajan));
    // Boş kimlikle sorulunca "ihlal" = yol kendi desenlerimizden birine düşüyor.
    if (sahiplikIhlaliMi("", yol, kendi, kok).ihlal) { if (kademe === "jev") return { karar: "gec", neden: "kendi OWNS alanında yazma" }; }
    else if (kendi.size) return { karar: "red", neden: "OWNS dışı yol (KURALLAR D); şefe mesaj_gonder ile yaz" };
  }

  const oge = komut !== null ? bilesikParcalar(komut, lehce) : null;
  if (kademe !== "jev") {
    const py = oge && parcaYasak(g, d, kok, oge);
    if (py) return py;
    if (kademe === "kullanici") return { karar: "insan", neden: "güven modu kullanıcı: salt okuma dışı her araç insana", risk: "orta" };
    return tamIzin(g, d, kok, "Jev ve onay sorulmadı");
  }

  // 5) Jev yargılar, kod karar verir. Bileşik kabuk komutu parça parça sorulur.
  const pk = oge ? await parcaliKarar(g, d, kok, komut!, oge) : null;
  if (pk) return pk;
  let jev: Cevap;
  try {
    jev = await jevSorgu(g, d, durum(g, kok));
  } catch {
    return jevHatasiKarari(g);
  }
  // hata-avi-3 B3: yerel ajanda "gec" doğrudan izin olur (ikinci ağ yok); belirsiz sonuç her araçta insana (KURALLAR F).
  const k = esikKarari(komut !== null || !!g.yerel, jev);
  return jev.laya_yedek ? { ...k, karar_kaynagi: "laya-yedek" } : k;
}

// ---------- Gerçek bağımlılıklar ----------

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function post(url: string, govde: object, ms: number, baslik: Record<string, string> = {}): Promise<any> {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...baslik }, body: JSON.stringify(govde), signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { status: r.status });
  return r.json(); // bozuk JSON → SyntaxError
}

function jsonlEkle(dosya: string, kayit: object) {
  fs.mkdirSync(path.dirname(dosya), { recursive: true });
  fs.appendFileSync(dosya, JSON.stringify(kayit) + "\n");
}

export function varsayilanBagimlilik(opts: { jevUrl?: string; layaUrl?: string; zamanAsimiMs?: number } = {}): KapiBagimlilik {
  const env = process.env;
  const jevUrl = opts.jevUrl ?? (env.ZEPUL_JEV_URL || "https://opencode.ai/zen/v1/systemone");
  const layaUrl = opts.layaUrl ?? (env.ZEPUL_LAYA_URL || "http://127.0.0.1:8796/v1/systemone") // Faz 6: gölge Laya (eğitilmiş model);
  const jevModel = env.ZEPUL_JEV_MODEL || "jev-1.13-free";
  const layaModel = env.ZEPUL_LAYA_MODEL || "multilingual";
  const anahtar = env.OPENCODE_API_KEY || "";
  const jevBaslik: Record<string, string> = anahtar ? { Authorization: `Bearer ${anahtar}` } : {};
  const jevMs = opts.zamanAsimiMs ?? 2500;
  return {
    soguma: { jev_bitis: 0 },
    tamOrnek: { sayac: 0 },
    jevSor: (govde) => post(jevUrl, { ...govde, model: jevModel }, jevMs, jevBaslik),
    layaSor: (govde) => post(layaUrl, { ...govde, model: layaModel }, Math.min(1500, jevMs)),
    golgeYaz: (k) => jsonlEkle(path.join(REPO, "logs/laya-golge.jsonl"), k),
    hataYaz: (h) => jsonlEkle(path.join(REPO, "logs/hatalar.jsonl"), { ts: new Date().toISOString(), tur: "hata", ajan: "kapi", ...h }),
  };
}
