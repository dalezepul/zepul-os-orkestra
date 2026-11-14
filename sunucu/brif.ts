// Brif doğrulama ve sahiplik çakışma denetimi (Faz 3, 3. çivi: "Kimin dosyası?").
// Brifi şef yazar, kod doğrular: OWNS başka bir aktif ajanla çakışıyorsa ajan başlamaz. Üç çıkış: böl, ayır, sıraya koy.
import { z } from "zod";
import { modelHatasi } from "./kapi.ts";
import { desenNormalize, globlarCakisirMi } from "./yol.ts";

const ROLLER = ["isci", "denetci", "birlestirici", "katip", "hata-avcisi", "raporcu", "skill-bahcivani"] as const;
const dolu = z.string().trim().min(1);
// K20 / A3: DO-NOT-TOUCH bloğu boş olamaz. Dokunulmayacak yol yoksa açık beyan: [{ yol: "(yok)", sahip: "-" }] (tek başına).
export const DOKUNMA_YOK = "(yok)";
const yokMu = (d: { yol: string }) => d.yol.trim() === DOKUNMA_YOK;

export const BrifSemasi = z.object({
  ad: dolu,
  rol: z.enum(ROLLER),
  // Y4: model kuralı tek yerde (kapi.ts modelHatasi): tam Claude kimliği ya da ollama:<ad>; takma ad ve Fable (yerelde de) yasak.
  model: z.string({ error: "model zorunlu; tam kimlik yaz (claude-sonnet-5-5 | claude-opus-5-5 | ollama:<ad>)" }),
  gorev: z.string().trim().min(20),
  // B2 şablonu: bağlam (neden, mevcut durum, bilinmesi gereken) görevden ayrı ve zorunlu; eksik brif reddedilir.
  baglam: z.string({ error: "baglam zorunlu: işin nedenini, mevcut durumu ve işçinin bilmesi gerekeni yaz" }).trim().min(20),
  owns: z.array(dolu),
  dokunma: z.array(z.object({ yol: dolu, sahip: dolu })).min(1, `DO-NOT-TOUCH boş olamaz; yoksa açıkça [{"yol":"${DOKUNMA_YOK}","sahip":"-"}] yaz`)
    .refine((l) => l.length === 1 || !l.some(yokMu), `"${DOKUNMA_YOK}" beyanı tek başına olmalı`),
  once_oku: z.array(dolu).min(1),
  kabul: z.string().trim().min(10),
  cwd: z.string().optional(),
}).superRefine((b, ctx) => {
  const mh = modelHatasi(b.model, b.rol);
  if (mh) ctx.addIssue({ code: "custom", path: ["model"], message: mh });
  if (b.rol === "isci" && !b.owns.length) ctx.addIssue({ code: "custom", path: ["owns"], message: "işçinin en az 1 OWNS yolu olmalı" });
  if (b.rol === "denetci" && b.owns.length) ctx.addIssue({ code: "custom", path: ["owns"], message: "denetçi salt okur; OWNS boş olmalı" });
  b.owns.forEach((o, i) => { try { desenNormalize(o); } catch (e) { ctx.addIssue({ code: "custom", path: ["owns", i], message: (e as Error).message }); } });
});

export type Brif = z.infer<typeof BrifSemasi>;

// Glob çakışması ve desen normalizasyonu yol.ts'te: kapının sahiplik denetimi (olay.ts) aynı desenleri aynı kuralla eşler.
export { globlarCakisirMi };

// ---------- Doğrulama ----------

const ONERI = "böl (OWNS'u daralt), ayır (başka dosya), sıraya koy (sahibinin bitmesini bekle)";

export function brifDogrula(ham: unknown, aktifSahiplik: Map<string, string>, istekEden?: string):
  { gecerli: true; brif: Brif } | { gecerli: false; hata: string; cakisma?: { glob: string; sahip: string }[]; oneri?: string } {
  const r = BrifSemasi.safeParse(ham);
  if (!r.success) return { gecerli: false, hata: r.error.issues.map((i) => `${i.path.join(".") || "(kök)"}: ${i.message}`).join("; ") };
  const brif = r.data, kim = istekEden ?? brif.ad;

  const celisen = brif.owns.flatMap((o) => brif.dokunma.filter((d) => !yokMu(d) && globlarCakisirMi(o, d.yol)).map((d) => `${o} ↔ ${d.yol}`));
  if (celisen.length) return { gecerli: false, hata: `brif kendi içinde çelişiyor: OWNS yolu DO-NOT-TOUCH listesinde (${celisen.join(", ")})` };

  const cakisma = new Map<string, { glob: string; sahip: string }>();
  for (const [glob, sahip] of aktifSahiplik) {
    if (sahip !== kim && brif.owns.some((o) => globlarCakisirMi(o, glob))) cakisma.set(`${sahip}\0${glob}`, { glob, sahip });
  }
  if (cakisma.size) {
    const liste = [...cakisma.values()];
    return { gecerli: false, hata: `OWNS başka aktif ajanla çakışıyor: ${liste.map((c) => `${c.glob} (${c.sahip})`).join(", ")}`, cakisma: liste, oneri: ONERI };
  }
  return { gecerli: true, brif };
}

// ---------- Ajan talimatı ----------

const ROL_SATIRI: Partial<Record<Brif["rol"], string>> = {
  denetci: "salt okursun; yazma yok; kırmızıya döndür (düzeltmeyi geri al, test kırmızıya dönmüyorsa VETO)",
  isci: "her mantıklı adımda commit; OWNS dışına yazma; başkasının dosyası için mesaj_gonder",
};

const liste = (a: string[], bos: string) => (a.length ? a.map((x) => `- ${x}`).join("\n") : bos);

// Bölüm sırası sabittir (test sınar). Dönüş sözleşmesi sunucu/sozlesme.ts şemasıyla aynıdır.
export function brifMetni(b: Brif, kurallarMd: string): string {
  const denetci = b.rol === "denetci";
  const ornek = JSON.stringify({ verdict: denetci ? "PASS" : "TAMAM", blockers: [], commits: ["<sha> <mesaj>"], ozet: "<en çok 3 cümle>" });
  const rol = ROL_SATIRI[b.rol];
  return [
    "## Görev",
    b.gorev,
    `Ad: ${b.ad} · Rol: ${b.rol} · Model: ${b.model}${b.cwd ? ` · cwd: ${b.cwd}` : ""}`,
    ...(rol ? [`Rol kuralı: ${rol}.`] : []),
    "",
    "## Bağlam",
    b.baglam,
    "",
    "## OWNS (yalnız bunlara yaz)",
    liste(b.owns, "(yok: salt okursun)"),
    "",
    "## DO-NOT-TOUCH (sahibiyle)",
    liste(b.dokunma.filter((d) => !yokMu(d)).map((d) => `${d.yol} → ${d.sahip}`), "(yok)"),
    "OWNS dışında bir dosyaya ihtiyaç duyarsan dosyaya dokunma, sahibine mesaj_gonder ile yaz.",
    "",
    "## Önce oku",
    liste(b.once_oku, ""),
    "",
    "## Bitti tanımı (kabul)",
    b.kabul,
    "",
    "## Dönüş sözleşmesi",
    "İş bitince (önce commit at) sozlesme_don aracını çağır; şef ham çıktıyı değil yalnızca bunu görür. Uzun rapor yazma. Biçim:",
    ornek,
    `- verdict: ${denetci ? "PASS | VETO (gerekçesiz VETO geçersiz: blockers'a yaz)" : "TAMAM | KISMI | BASARISIZ"}`,
    "- blockers: metin ya da {ne, nerede, onem, oneri} dizisi",
    "- commits: commit sha ve mesajları; ozet: en çok 3 cümle",
    "",
    "## Kurallar",
    kurallarMd,
  ].join("\n");
}

// ---------- Aktif sahiplik haritası ----------

export function sahiplikEkle(harita: Map<string, string>, b: Brif): void {
  for (const g of b.owns) harita.set(desenNormalize(g), b.ad);
}

export function sahiplikBirak(harita: Map<string, string>, ajan: string): void {
  for (const [glob, sahip] of harita) if (sahip === ajan) harita.delete(glob);
}
