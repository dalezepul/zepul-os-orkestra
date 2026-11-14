// Skill bahçıvanı (Faz 5, KURALLAR J): 2-3 kez tekrarlanan işi bulur, SKILL.md taslağı yazar; işçiye hangi skill'in verileceğini seçtirir.
// "Kod sayar, Jev yargılar": tekrarı kod bulur; skill'e değip değmeyeceğini ve hangi skill'in gerektiğini Jev söyler;
// taslağı şef ya da kullanıcı onaylar, otomatik etkinleştirme yoktur. Dosya sistemi enjekte edilir; Jev çağrısını çağıran yapar.
import { createHash } from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";
import { jevMaskele } from "./kapi.ts";

export type IzOlay = { ts: number; ajan: string; oturum?: string; tur: string; arac?: string; girdi_ozet?: string; gorev?: string; ozet?: string };
export type Aday = { kimlik: string; tur: "dizi" | "gorev"; ornek_sayisi: number; farkli_is: number; adimlar?: string[]; gorev_ornekleri?: string[]; ilk_ts: number; son_ts: number };
export type SkillOzeti = { ad: string; aciklama: string };

const ESIK = 0.8; // Jev güveni bunun altındaysa karar "belirsiz" (kapı ile aynı, KURALLAR F)
const DURUM_SINIRI = 4000;
const kirp = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const tarih = (ts: number) => new Date(ts).toISOString().slice(0, 10);
const ozut = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 10);

// ---------- 1) Tekrar tespiti (saf) ----------

const GECICI = /(^|[\\/])(te?mp|scratchpad|\.tmp|\.worktrees)([\\/]|$)/i;
const UZANTI = /(?<!\.)\.([A-Za-z][A-Za-z0-9]{0,7})$/; // a1b2..HEAD uzantı değil

function yolNormalize(t: string): string {
  if (GECICI.test(t)) return "<gecici>";
  const u = UZANTI.exec(t);
  if (u) return `*.${u[1].toLowerCase()}`;
  return /[\\/]/.test(t) ? "<yol>" : t;
}

// Aynı işin iki yazımı aynı metne insin: tırnak içi → <m> (tek yol ise yol kuralı), yollar → sınıf, zaman → <zaman>, sha → <sha>, sayı → <n>.
export function girdiNormalize(s: string): string {
  return s
    .replace(/"((?:[^"\\]|\\.)*)"|'([^']*)'/g, (_m, c?: string, t?: string) => {
      const ic = c ?? t ?? "";
      return /^\S+$/.test(ic) && (/[\\/]/.test(ic) || UZANTI.test(ic)) ? yolNormalize(ic) : "<m>";
    })
    .replace(/[^\s"'`<>|;&(),=]+/g, yolNormalize)
    .replace(/\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?/g, "<zaman>")
    .replace(/\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b/gi, "<sha>")
    .replace(/(?<!\*\.\w*)\d+/g, "<n>") // *.mp4 uzantısı korunur
    .replace(/\s+/g, " ")
    .trim();
}

// Araç olayından adım: araç adı + ilk anlamlı alan (komut ya da yol). Grep deseni, Edit metni gibi değişken alanlar alınmaz.
// girdi_ozet 300 karakterde kırpılmış JSON olabilir; bu yüzden ayrıştırılmaz, alan düzenli ifadeyle okunur.
const ALAN = /"(command|file_path|notebook_path|path)"\s*:\s*"((?:[^"\\]|\\.)*)/;
const GURULTU = new Set(["TodoWrite", "ToolSearch"]);
function adim(o: IzOlay): string {
  const m = ALAN.exec(o.girdi_ozet ?? "");
  if (!m) return o.arac!;
  let v = m[2];
  try { v = JSON.parse(`"${v}"`); } catch { /* kırpılmış kaçış: ham kalır */ }
  return `${o.arac} ${girdiNormalize(v)}`;
}

// Görev metni benzerliği: normalize edilmiş, en az 3 harfli sözcük kümesi.
const kelimeler = (s: string) => new Set(girdiNormalize(s).toLocaleLowerCase("tr").split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3));
const jaccard = (a: Set<string>, b: Set<string>) => {
  let ortak = 0;
  for (const w of a) if (b.has(w)) ortak++;
  return ortak / (a.size + b.size - ortak || 1);
};

type Say = { isler: Set<string>; n: number; ilk: number; son: number };

export function tekrarAdaylari(olaylar: IzOlay[], opt: { esik?: number; minUzunluk?: number; maxUzunluk?: number } = {}): Aday[] {
  const { esik = 2, minUzunluk = 3, maxUzunluk = 8 } = opt;
  const sirali = [...olaylar].sort((a, b) => a.ts - b.ts);
  const isAdi = (o: IzOlay) => o.oturum ?? o.ajan;

  // (a) Dizi: her iş için adım listesi; art arda aynı adım bir sayılır (üç Read, tek Read).
  const isler = new Map<string, { adim: string; ts: number }[]>();
  for (const o of sirali) {
    if (o.tur !== "arac" || !o.arac || GURULTU.has(o.arac)) continue;
    const d = isler.get(isAdi(o)) ?? [];
    isler.set(isAdi(o), d);
    const a = adim(o);
    if (d.at(-1)?.adim !== a) d.push({ adim: a, ts: o.ts });
  }
  const diziler = new Map<string, Say>();
  for (const [is, d] of isler) {
    for (let u = minUzunluk; u <= maxUzunluk; u++) {
      for (let i = 0; i + u <= d.length; i++) {
        const k = d.slice(i, i + u).map((x) => x.adim).join("\n");
        const s = diziler.get(k) ?? { isler: new Set<string>(), n: 0, ilk: Infinity, son: -Infinity };
        diziler.set(k, s);
        s.isler.add(is);
        s.n++;
        s.ilk = Math.min(s.ilk, d[i].ts);
        s.son = Math.max(s.son, d[i + u - 1].ts);
      }
    }
  }
  // Aynı işteki tekrar sayılmaz (o döngü bekçisinin işi): eşik farklı iş sayısına uygulanır.
  const anlamli = [...diziler].filter(([, s]) => s.isler.size >= esik);
  const kapsanan = (k: string) => anlamli.some(([b]) => b.length > k.length && `\n${b}\n`.includes(`\n${k}\n`));
  const adaylar: Aday[] = anlamli
    .filter(([k]) => !kapsanan(k))
    .map(([k, s]) => ({ kimlik: `dizi-${ozut(k)}`, tur: "dizi", ornek_sayisi: s.n, farkli_is: s.isler.size, adimlar: k.split("\n"), ilk_ts: s.ilk, son_ts: s.son }));

  const kumeler: { lider: Set<string>; uyeler: { metin: string; is: string; ts: number }[] }[] = [];
  for (const o of sirali) {
    const metin = o.gorev ?? (o.tur === "sozlesme" ? o.ozet : undefined);
    if (!metin) continue;
    const k = kelimeler(metin);
    if (k.size < 3) continue;
    const uye = { metin, is: isAdi(o), ts: o.ts };
    const kume = kumeler.find((c) => jaccard(c.lider, k) >= 0.6);
    if (kume) kume.uyeler.push(uye);
    else kumeler.push({ lider: k, uyeler: [uye] });
  }
  for (const { lider, uyeler } of kumeler) {
    const farkli = new Set(uyeler.map((u) => u.is)).size;
    if (farkli < esik) continue;
    adaylar.push({
      kimlik: `gorev-${ozut([...lider].sort().join(" "))}`, tur: "gorev", ornek_sayisi: uyeler.length, farkli_is: farkli,
      gorev_ornekleri: [...new Set(uyeler.map((u) => u.metin))].slice(0, 5), ilk_ts: uyeler[0].ts, son_ts: uyeler.at(-1)!.ts,
    });
  }
  return adaylar.sort((a, b) => b.ornek_sayisi - a.ornek_sayisi);
}

// ---------- 2) Jev kararı ----------

const KARAR_SORULARI = {
  karar: {
    type: "choice",
    instructions: "Bu tekrar eden iş kalıcı hâle getirilmeli mi, getirilecekse nasıl?",
    criteria: {
      skill: "her seferinde aynı adımlarla yapılan, tekrar kullanılabilir bir iş; adımları bir tarif olarak yazılabilir",
      kural: "bir kez söylenmesi yeten bir düzeltme ya da tercih (ör. hep şu klasöre yaz, şu komutu kullanma); kural defterine bir satır olarak girer",
      "tek-seferlik": "rastlantısal benzerlik ya da her işte zaten yapılan sıradan adımlar; kalıcılaştırmaya değmez",
    },
  },
  genel: { type: "noul", instructions: "Bu iş başka projelerde de işe yarar mı?" },
};

function adayOzeti(a: Aday): string {
  const bas = `Tekrar adayı (${a.tur === "dizi" ? "araç dizisi" : "benzer görevler"}): ${a.ornek_sayisi} örnek, ${a.farkli_is} farklı iş, ${tarih(a.ilk_ts)} – ${tarih(a.son_ts)}.`;
  const govde = a.tur === "dizi"
    ? `Her seferinde bu sırayla yapılan adımlar (<m> değişken metin, <n> sayı, *.ts o uzantılı bir dosya):\n${(a.adimlar ?? []).map((x, i) => `${i + 1}. ${x}`).join("\n")}`
    : `Görev örnekleri:\n${(a.gorev_ornekleri ?? []).map((x) => `- ${kirp(x, 400)}`).join("\n")}`;
  return kirp(jevMaskele(`${bas}\n${govde}`), DURUM_SINIRI);
}

// Jev /v1/systemone gövdesi; model alanını kapi.ts varsayilanBagimlilik().jevSor ekler.
export function skillKarariGovdesi(a: Aday): object {
  return { state: adayOzeti(a), questions: KARAR_SORULARI };
}

const KARARLAR = ["skill", "kural", "tek-seferlik"] as const;
export function skillKarariniOku(yanit: any): { karar: "skill" | "kural" | "tek-seferlik" | "belirsiz"; guven: number; genel: number | null } {
  const k = yanit?.answers?.karar;
  const g = Number(k?.confidence ?? k?.answer_confidence);
  const guven = Number.isFinite(g) ? g : 0;
  const n = yanit?.answers?.genel?.noul;
  const genel = typeof n === "number" ? n : null;
  const secim = KARARLAR.find((x) => x === k?.choice);
  return { karar: secim && guven >= ESIK ? secim : "belirsiz", guven, genel };
}

// ---------- 3) Taslak ----------

const TR: Record<string, string> = { ç: "c", ğ: "g", ı: "i", İ: "i", ö: "o", ş: "s", ü: "u", Ç: "c", Ğ: "g", Ö: "o", Ş: "s", Ü: "u" };

export function skillAdi(a: Aday): string {
  const kaynak = a.tur === "dizi" ? (a.adimlar ?? []).join(" ").replace(/mcp__[a-z0-9]+__/gi, "") : (a.gorev_ornekleri?.[0] ?? "");
  const sozcukler = new Set(jevMaskele(kaynak).replace(/<\w+>/g, " ").replace(/[çğıİöşüÇĞÖŞÜ]/g, (c) => TR[c]).normalize("NFKD").toLowerCase()
    .split(/[^a-z0-9]+/).filter((w) => w && !/^\d+$/.test(w)));
  let ad = "";
  for (const w of sozcukler) {
    const yeni = ad ? `${ad}-${w}` : w;
    if (yeni.length > 40) break;
    ad = yeni;
  }
  return ad || `skill-${a.kimlik.slice(-8)}`;
}

// Normalize adım → Türkçe madde.
function adimMaddesi(s: string): string {
  const i = s.indexOf(" ");
  const arac = i < 0 ? s : s.slice(0, i);
  const x = i < 0 ? "" : `\`${s.slice(i + 1).replaceAll("`", "'")}\``;
  const bus = /^mcp__bus__(.+)$/.exec(arac);
  if (bus) return `Bus aracını çağır: \`${bus[1]}\`.`;
  if (!x) return `\`${arac}\` aracını çağır.`;
  switch (arac) {
    case "Read": return `${x} dosyasını oku.`;
    case "Write": return `${x} dosyasını yaz.`;
    case "Edit": case "MultiEdit": case "NotebookEdit": return `${x} dosyasını düzenle.`;
    case "Grep": return `${x} içinde ara.`;
    case "Glob": return `${x} altındaki dosyaları bul.`;
    case "Bash": case "PowerShell": return `Komutu çalıştır: ${x}.`;
    default: return `\`${arac}\` aracını çağır: ${x}.`;
  }
}

// Sır, yol ve kullanıcı adı jevMaskele ile gider. Frontmatter değerleri JSON dizgesi (geçerli YAML); maske dizgelemeden önce uygulanır.
export function taslakMetni(a: Aday, ad = skillAdi(a)): string {
  const m = jevMaskele;
  const dizi = a.tur === "dizi";
  const adimlar = a.adimlar ?? [];
  const ornekler = (a.gorev_ornekleri ?? []).map((x) => m(kirp(x.replace(/\s+/g, " "), 300)));
  const aciklama = dizi ? `Tekrar eden ${adimlar.length} adımlık iş: ${m(adimlar.join(" → "))}` : `Tekrar eden görev: ${ornekler[0] ?? ""}`;
  const neZaman = dizi
    ? `Aynı adımları bu sırayla yeniden yapacakken kullan (ilk adım: ${m(adimlar[0] ?? "")}).`
    : `Şuna benzer bir görev geldiğinde kullan: ${ornekler[0] ?? ""}`;
  const test = adimlar.find((x) => /^(Bash|PowerShell) .*\b(test|tsc|lint|build)\b/.test(x));
  const govde = [
    `# ${ad}`,
    "",
    `> Taslak: skill bahçıvanı ${a.ornek_sayisi} tekrardan çıkardı. Şef ya da kullanıcı onaylayınca etkinleşir.`,
    "",
    "## Ne zaman",
    "",
    dizi ? `Aşağıdaki adımları bu sırayla yeniden yapman gerektiğinde. Örnekler ${a.farkli_is} farklı işten geldi.` : "Şu görevlere benzer bir iş geldiğinde:",
    ...(dizi ? [] : ["", ...ornekler.map((x) => `- ${x}`)]),
    "",
    "## Adımlar",
    "",
    ...(dizi
      ? [...adimlar.map((x, i) => `${i + 1}. ${adimMaddesi(x)}`), "", "Yer tutucular: `<m>` değişken metin, `<n>` sayı, `<sha>` commit kimliği, `<zaman>` zaman damgası, `<yol>` bir yol, `<gecici>` geçici klasör, `*.ts` o uzantılı bir dosya."]
      : ["1. Örnek görevlerin ortak adımlarını buraya yaz (bahçıvan adım dizisi çıkaramadı; onaydan önce doldurulur)."]),
    "",
    "## Doğrulama",
    "",
    ...(test ? [`- Şu komut hatasız bitmeli: ${adimMaddesi(test).replace(/^Komutu çalıştır: /, "")}`] : []),
    "- Sonuç önceki örneklerdekiyle aynı biçimde olmalı; değilse skill'i bırak ve şefe bildir.",
    "",
    "## Kaynak",
    "",
    `${a.ornek_sayisi} tekrar, ${a.farkli_is} farklı iş, ${tarih(a.ilk_ts)} – ${tarih(a.son_ts)}. Aday kimliği: \`${a.kimlik}\`.`,
    "",
  ].join("\n");
  return `---\nname: ${ad}\ndescription: ${JSON.stringify(kirp(aciklama, 300))}\nwhen_to_use: ${JSON.stringify(kirp(neZaman, 300))}\n---\n\n${m(govde)}`;
}

export const taslakYolu = (repo: string, ad: string) => path.join(repo, ".claude", "skills-taslak", ad, "SKILL.md");
export const etkinYolu = (repo: string, ad: string) => path.join(repo, ".claude", "skills", ad, "SKILL.md");

type FsDep = Pick<typeof fsp, "mkdir" | "writeFile" | "rename" | "access">;
const varMi = (f: FsDep, p: string) => f.access(p).then(() => true, () => false);

// Var olan taslağın ya da etkin skill'in adını almaz: ad, ad-2, ad-3 … Dizin tek adımda (mkdir) alınır; yarışta da üzerine yazılmaz.
export async function taslakYaz(repo: string, a: Aday, f: FsDep = fsp): Promise<string> {
  const kok = skillAdi(a);
  for (let i = 1; ; i++) {
    const ad = i === 1 ? kok : `${kok}-${i}`;
    const yol = taslakYolu(repo, ad);
    if (await varMi(f, path.dirname(etkinYolu(repo, ad)))) continue;
    await f.mkdir(path.dirname(path.dirname(yol)), { recursive: true });
    try {
      await f.mkdir(path.dirname(yol));
    } catch (e: any) {
      if (e?.code === "EEXIST") continue;
      throw e;
    }
    await f.writeFile(yol, taslakMetni(a, ad), { flag: "wx" });
    return yol;
  }
}

// Biçim kapısı: anthropics/skills (commit dbd4588f9e1033efb41dad4bef2f7947c8993d44, Apache-2.0) skill-creator/scripts/quick_validate.py
// kurallarının uyarlaması. Farklar: when_to_use izinli (Claude Code alanı, bahçıvan yazar); açıklamada < > yasağı alınmadı
// (claude.ai'ye özgü; bahçıvan açıklamaları <yol> gibi yer tutucu taşır); ad klasör adıyla aynı olmalı. null = geçerli.
const SKILL_ALANLARI = new Set(["name", "description", "when_to_use", "license", "allowed-tools", "metadata", "compatibility"]);
export function skillBicimHatasi(metin: string, klasor: string): string | null {
  if (!/^---\r?\n[\s\S]*?\r?\n---/.test(metin)) return "frontmatter yok";
  const fm = onBilgi(metin);
  const fazla = Object.keys(fm).filter((k) => !SKILL_ALANLARI.has(k));
  if (fazla.length) return `izinsiz frontmatter alanı: ${fazla.join(", ")}`;
  const ad = (fm.name ?? "").trim();
  if (!ad) return "name yok";
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(ad) || ad.length > 64) return `name kebab-case değil ya da 64 karakterden uzun: ${ad}`;
  if (ad !== klasor) return `name (${ad}) klasör adıyla (${klasor}) aynı değil`;
  const ac = (fm.description ?? "").trim();
  if (!ac) return "description yok ya da boş";
  if (ac.length > 1024) return `description 1024 karakterden uzun (${ac.length})`;
  return null;
}

// Şefin skill_onayla aracı buraya gelir: ad güven sınırından geçer, yol dışına çıkamaz; biçimi bozuk taslak etkinleşmez.
const AD = /^[a-z0-9][a-z0-9-]{0,63}$/;
export async function taslakOnayla(repo: string, ad: string, f: FsDep & Pick<typeof fsp, "readFile"> = fsp): Promise<string> {
  if (!AD.test(ad)) throw new Error(`geçersiz skill adı: ${ad}`);
  const kaynak = path.dirname(taslakYolu(repo, ad));
  const hedef = path.dirname(etkinYolu(repo, ad));
  if (!(await varMi(f, kaynak))) throw new Error(`taslak yok: ${ad}`);
  if (await varMi(f, hedef)) throw new Error(`etkin skill zaten var: ${ad}; üzerine yazılmaz`);
  const bicim = skillBicimHatasi(await f.readFile(taslakYolu(repo, ad), "utf8").catch(() => ""), ad);
  if (bicim) throw new Error(`taslak biçimi geçersiz (${ad}): ${bicim}`);
  await f.mkdir(path.dirname(hedef), { recursive: true });
  await f.rename(kaynak, hedef);
  return etkinYolu(repo, ad);
}

// ---------- 4) Skill kullanımı ----------

// Küçük YAML frontmatter okuyucu: anahtar: değer, "…" / '…' dizge, | ve > blokları, girintili devam satırları.
function onBilgi(metin: string): Record<string, string> {
  const out: Record<string, string> = {};
  let anahtar = "";
  for (const satir of (/^---\r?\n([\s\S]*?)\r?\n---/.exec(metin)?.[1] ?? "").split(/\r?\n/)) {
    const k = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(satir);
    if (k) {
      anahtar = k[1];
      const v = k[2].trim();
      out[anahtar] = /^[|>][+-]?$/.test(v) ? "" : /^'.*'$/.test(v) ? v.slice(1, -1).replaceAll("''", "'") : v;
      if (v.startsWith('"')) {
        try { out[anahtar] = JSON.parse(v); } catch { /* çok satırlı dizge: ham kalır */ }
      }
    } else if (anahtar && /^\s+\S/.test(satir)) out[anahtar] = `${out[anahtar]} ${satir.trim()}`.trim();
  }
  return out;
}

// kokler: .claude klasörünü içeren dizinler (repo, ev dizini). Aynı ad ikinci kez görülürse ilki kalır.
export async function skillleriListele(kokler: string[]): Promise<SkillOzeti[]> {
  const out = new Map<string, SkillOzeti>();
  for (const kok of kokler) {
    const dizin = path.join(kok, ".claude", "skills");
    for (const d of (await fsp.readdir(dizin).catch(() => [] as string[])).sort()) {
      const metin = await fsp.readFile(path.join(dizin, d, "SKILL.md"), "utf8").catch(() => "");
      if (!metin) continue;
      const fm = onBilgi(metin);
      const ad = fm.name || d;
      if (!out.has(ad)) out.set(ad, { ad, aciklama: [fm.description, fm.when_to_use && `Ne zaman: ${fm.when_to_use}`].filter(Boolean).join(" ") });
    }
  }
  return [...out.values()];
}

const AZAMI_SORU = 20;
const soruAnahtari = (ad: string) => ad.replace(/[^A-Za-z0-9_-]/g, "_");
// Kaba eleme için Türkçe ekleri yutan 5 harflik kökler (düğme, düğmesi).
const kokleri = (s: string) => new Set([...kelimeler(s)].map((w) => w.slice(0, 5)));

export function skillSecimGovdesi(gorev: string, skilller: SkillOzeti[]): object {
  let secilen = skilller;
  if (secilen.length > AZAMI_SORU) {
    const g = kokleri(gorev);
    // Kökler farklı uzunlukta olabilir (test / testi): biri ötekinin öneki ise örtüşür.
    const puan = (s: SkillOzeti) => { const k = [...kokleri(`${s.ad} ${s.aciklama}`)]; return [...g].filter((w) => k.some((x) => x.startsWith(w) || w.startsWith(x))).length; };
    secilen = skilller.map((s) => ({ s, p: puan(s) })).sort((a, b) => b.p - a.p).slice(0, AZAMI_SORU).map((x) => x.s);
  }
  const liste = secilen.map((s) => `- ${s.ad}: ${kirp(s.aciklama, 150)}`).join("\n");
  return {
    state: kirp(jevMaskele(`Görev: ${gorev}\n\nKullanılabilir skill'ler:\n${liste}`), DURUM_SINIRI),
    questions: Object.fromEntries(secilen.map((s) => [soruAnahtari(s.ad), { type: "noul", instructions: jevMaskele(`Bu görev için ${s.ad} gerekli mi? (${kirp(s.aciklama, 120)})`) }])),
  };
}

// Jev olasılıkları şişkin: eşik yüksek (0,7), en çok 5 skill, olasılığa göre azalan.
export function skillSeciminiOku(yanit: any, skilller: SkillOzeti[], esik = 0.7): string[] {
  return skilller
    .map((s) => ({ ad: s.ad, p: yanit?.answers?.[soruAnahtari(s.ad)]?.noul }))
    .filter((x): x is { ad: string; p: number } => typeof x.p === "number" && x.p >= esik)
    .sort((a, b) => b.p - a.p)
    .slice(0, 5)
    .map((x) => x.ad);
}
