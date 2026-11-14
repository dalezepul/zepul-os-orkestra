import { z } from "zod";

export const AZAMI_DUZELTME = 2;

const Blocker = z.union([
  z.string().min(1),
  z.object({ ne: z.string().min(1), nerede: z.string().optional(), onem: z.string().optional(), oneri: z.string().optional() }),
]);

export const SozlesmeSemasi = z.object({
  verdict: z.enum(["TAMAM", "KISMI", "BASARISIZ", "PASS", "VETO"]),
  blockers: z.array(Blocker),
  commits: z.array(z.string()),
  ozet: z.string().max(600),
}).superRefine((s, ctx) => {
  // KURALLAR G: gerekçesiz VETO geçersizdir; gerekçe blockers'ta durur.
  if (s.verdict === "VETO" && !s.blockers.length) ctx.addIssue({ code: "custom", path: ["blockers"], message: "gerekçesiz VETO geçersiz; blockers'a gerekçe yaz" });
});

export type Sozlesme = z.infer<typeof SozlesmeSemasi>;
export type Blocker = z.infer<typeof Blocker>;

// Metin gelirse (ajanın son mesajı gibi) önce JSON olarak çözülür.
export function sozlesmeDogrula(ham: unknown): { gecerli: true; veri: Sozlesme } | { gecerli: false; hata: string } {
  if (typeof ham === "string") {
    try { ham = JSON.parse(ham); } catch { return { gecerli: false, hata: "JSON çözülemedi" }; }
  }
  const r = SozlesmeSemasi.safeParse(ham);
  if (r.success) return { gecerli: true, veri: r.data };
  return { gecerli: false, hata: r.error.issues.map((i) => `${i.path.join(".") || "(kök)"}: ${i.message}`).join("; ") };
}

// Panel `blockers`'ı metin dizisi bekler (docs/panel-api.md); yayınlarken nesneler bununla düzleştirilir.
export function blockerMetni(b: Blocker): string {
  if (typeof b === "string") return b;
  return [b.onem && `[${b.onem}]`, b.ne, b.nerede && `(${b.nerede})`, b.oneri && `→ ${b.oneri}`].filter(Boolean).join(" ");
}

export type Adim = { adim: "denetciye" | "duzeltme" | "sefe" | "birlestiriciye"; mesaj: string };

// Kural ya da politika gereği yapılmayan iş düzeltilemez; düzeltme turu içeriksiz döner (kabul K9).
// KISMI + metinde kural/yasak/politika, ya da herhangi bir blocker'da onem "politika". Türkçe İ/ı için tr küçük harf + ı→i.
function politikaMi(s: Sozlesme): boolean {
  const sozcuk = (b: Blocker) => /kural|yasak|politika/.test(blockerMetni(b).toLocaleLowerCase("tr").replace(/ı/g, "i"));
  return s.blockers.some((b) => typeof b !== "string" && b.onem?.toLocaleLowerCase("tr") === "politika")
    || (s.verdict === "KISMI" && s.blockers.some(sozcuk));
}

/**
 * duzeltmeSayisi: bu iş için şimdiye kadar açılmış düzeltme turu sayısı. Rol denetimi (rolün gerçekten o ajana ait olması) baglama'nın işidir.
 * `duzeltme` mesajı her iki rolde de işi yapan işçiye yazılmıştır ("Düzelt, commit at …"). Denetçi VETO'sunda
 * yürütücü bu mesajı denetçiye değil işçiye iletmeli; denetçi salt okur, düzeltme yapmaz.
 */
export function sonrakiAdim(s: Sozlesme, rol: string, duzeltmeSayisi: number, denetciVar: boolean): Adim {
  const liste = s.blockers.map((b) => blockerMetni(b).replace(/[.\s]+$/, "")).join("; ") || "yok"; // sondaki nokta: ".." olmasın
  const ozet = `verdict ${s.verdict}; blocker'lar: ${liste}; commit'ler: ${s.commits.join(", ") || "yok"}; özet: ${s.ozet}`;
  const sefe = (neden: string): Adim => ({ adim: "sefe", mesaj: `Şef kararı gerekli: ${neden}. ${ozet}` });
  const duzeltme = (ek: string): Adim => ({
    adim: "duzeltme",
    mesaj: `Düzeltme turu ${duzeltmeSayisi + 1}/${AZAMI_DUZELTME}: blocker'lar: ${liste}. ${ek}Düzelt, commit at, sozlesme_don ile yeniden dön.`,
  });

  if (rol === "isci") {
    if (s.verdict === "PASS" || s.verdict === "VETO") return sefe(`işçi denetçi verdict'i (${s.verdict}) döndü`);
    if (s.verdict === "TAMAM" && !s.blockers.length) {
      return denetciVar
        ? { adim: "denetciye", mesaj: `Denetle: işçi TAMAM döndü. Commit'ler: ${s.commits.join(", ") || "yok"}. Özet: ${s.ozet} Düzeltmeyi geri alıp testin kırmızıya döndüğünü doğrula; PASS ya da VETO (gerekçeli) dön.` }
        : sefe("işçi TAMAM döndü, denetçi yok");
    }
    if (politikaMi(s)) return sefe("blocker kural ya da politika kaynaklı, düzeltme turu açılmadı");
    // D16: düzeltme turu yalnız blocker'ları okur; blocker'sız KISMI/BASARISIZ iki içeriksiz tur açardı. Şemada reddetmek yerine
    // şefe gider: ret sözleşmeyi hiç ulaştırmayabilir (kabul K6), şef özeti görüp karar verir.
    if (!s.blockers.length) return sefe(`işçi ${s.verdict} döndü ama blocker yok, düzeltme turunun okuyacağı içerik yok`);
    return duzeltmeSayisi < AZAMI_DUZELTME ? duzeltme(`İşçi verdict'i ${s.verdict}. `) : sefe(`${AZAMI_DUZELTME} düzeltme turu tükendi`);
  }
  if (rol === "denetci") {
    if (s.verdict === "PASS") return { adim: "birlestiriciye", mesaj: `Birleştir: denetçi PASS verdi. Commit'ler: ${s.commits.join(", ") || "yok"}. Özet: ${s.ozet}` };
    if (s.verdict === "VETO") return duzeltmeSayisi < AZAMI_DUZELTME ? duzeltme("Denetçi VETO verdi. ") : sefe(`VETO ve ${AZAMI_DUZELTME} düzeltme turu tükendi`);
    return sefe(`denetçi işçi verdict'i (${s.verdict}) döndü`);
  }
  return sefe(`"${rol}" rolü için otomatik adım yok`);
}

export function sozlesmeKirliAgacRed(kirli: string[]): string | null {
  return kirli.length ? `Önce commit at: ${kirli.length} dosya (ilk 5: ${kirli.slice(0, 5).join(", ")}).` : null;
}
