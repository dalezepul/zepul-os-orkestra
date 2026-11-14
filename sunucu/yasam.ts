// Ajan yaşam döngüsü (Faz 2): commit zorunluluğu (Stop hook), ölüm tespiti, diriltme planı.
// Kararlar saf fonksiyondur. Yan etkiler (kutuya itme, query yeniden başlatma, ntfy) entegratöre kalır.
// Git yalnızca execFile ile çağrılır: shell yok, argüman dizisi. Bağlama talimatı: sunucu/YASAM.md.
import { execFile } from "node:child_process";
import path from "node:path";
import type { HookCallback, StopHookInput } from "@anthropic-ai/claude-agent-sdk";
import { ozetle, sahiplikIhlaliMi } from "./olay.ts";

export function calistir(komut: string, args: string[], cwd: string, zamanAsimiMs: number): Promise<string> {
  return new Promise((coz, reddet) => {
    const c = execFile(komut, args, { cwd, shell: false, windowsHide: true, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
      (e, stdout) => { if (doldu) return; clearTimeout(z); if (e) reddet(e); else coz(stdout); });
    let doldu = false;
    const z = setTimeout(() => {
      doldu = true;
      const red = () => reddet(new Error(`zaman aşımı (${zamanAsimiMs} ms), süreç ağacı öldürüldü: ${komut} ${args.join(" ")}`));
      if (process.platform === "win32") execFile("taskkill", ["/T", "/F", "/PID", String(c.pid)], { windowsHide: true }, red);
      else { c.kill("SIGKILL"); red(); }
    }, zamanAsimiMs);
  });
}

// Stop hook 30 sn'de kesilir; degisiklikler'in git çağrıları paralel, her biri en çok 8 sn (W9).
export const GIT_ZAMAN_ASIMI_MS = 8_000;

// --no-optional-locks: status index.lock almasın; ajanın kendi commit'iyle yarışmasın.
const git = (cwd: string, args: string[]) => calistir("git", ["--no-optional-locks", ...args], cwd, GIT_ZAMAN_ASIMI_MS);

// Commit edilmemiş yollar (depo köküne göre). -z: tırnaksız ham UTF-8 yol (Türkçe adlar bozulmaz), yeniden adlandırmada
// kaynak yol ayrı bir kayıt olarak gelir ve atlanır. -uall: izlenmeyen klasör dosya dosya gelir (OWNS eşlemesi klasörde şaşmasın).
export async function kirliDosyalar(cwd: string): Promise<string[]> {
  const kayitlar = (await git(cwd, ["status", "--porcelain=v1", "-z", "--untracked-files=all"])).split("\0");
  const yollar: string[] = [];
  for (let i = 0; i < kayitlar.length; i++) {
    const k = kayitlar[i];
    if (k.length < 4) continue;
    yollar.push(k.slice(3));
    if (k[0] === "R" || k[0] === "C") i++;
  }
  return yollar;
}

// Son commit; depoda hiç commit yoksa null. Depo değilse ya da git çalışmıyorsa hata fırlatır (yutulmaz).
export async function sonCommit(cwd: string): Promise<{ sha: string; mesaj: string } | null> {
  let cikti: string;
  try {
    cikti = await git(cwd, ["log", "-1", "--format=%H%x00%s"]);
  } catch (e) {
    await git(cwd, ["rev-parse", "--git-dir"]).catch(() => { throw e; }); // depo değil: asıl hata
    return null; // depo var ama HEAD yok
  }
  const [sha, mesaj = ""] = cikti.trimEnd().split("\0");
  return sha ? { sha, mesaj } : null;
}

// ---------- OWNS ile sınırlama (F7) ----------

export function ownsIcinde(yol: string, owns: string[] | undefined, kok: string): boolean {
  if (!owns?.length) return true;
  return sahiplikIhlaliMi("", yol, new Map(owns.map((d) => [d, "owns"])), kok).ihlal;
}

export type Degisiklik = { ust: string; kok: string; kirli: string[]; commitli: string[] };
export async function degisiklikler(cwd: string, bazSha?: string | null): Promise<Degisiklik> {
  const [kokCikti, fark, kirli] = await Promise.all([
    git(cwd, ["rev-parse", "--show-toplevel", "--show-prefix"]),
    bazSha ? git(cwd, ["diff", "--name-only", "--no-renames", "-z", `${bazSha}..HEAD`]) : "",
    kirliDosyalar(cwd),
  ]);
  const [ust, onEk = ""] = kokCikti.split(/\r?\n/);
  return { ust, kok: path.resolve(ust, onEk), kirli, commitli: fark.split("\0").filter(Boolean) };
}

// Ajan başlarken ağacın durumu (F9): HEAD (depoda commit yoksa null) ve o an zaten kirli olan yollar.
// Başlangıçta kirli olan dosya ajanın işi sayılmaz (başkasının commit'lenmemiş işi, kabul K6).
export type Baz = { sha: string | null; kirli: string[] };
export async function bazAl(cwd: string): Promise<Baz> {
  const [c, kirli] = await Promise.all([sonCommit(cwd), kirliDosyalar(cwd)]);
  return { sha: c?.sha ?? null, kirli };
}

// Depo köküne göre yolları [OWNS içi, OWNS dışı] diye ayırır.
export function ownsAyir(d: { ust: string; kok: string }, yollar: string[], owns: string[] | undefined): [string[], string[]] {
  const ic = (y: string) => ownsIcinde(path.resolve(d.ust, y), owns, d.kok);
  return [yollar.filter(ic), yollar.filter((y) => !ic(y))];
}

// ---------- Commit zorunluluğu ----------

export const AZAMI_BLOK = 2;

export function stopKarari(kirli: string[], blokSayisi: number): { engelle: boolean; neden: string; hata?: object } {
  if (!kirli.length) return { engelle: false, neden: "çalışma ağacı temiz" };
  const ilk5 = kirli.slice(0, 5).join(", ");
  if (blokSayisi < AZAMI_BLOK) {
    return { engelle: true, neden: `Commit edilmemiş ${kirli.length} dosya var (ilk 5): ${ilk5}. Commit at, sonra bitir.` };
  }
  const mesaj = `${AZAMI_BLOK} engelden sonra ${kirli.length} commit edilmemiş dosyayla bitti (ilk 5): ${ilk5}`;
  return {
    engelle: false,
    neden: mesaj,
    hata: { kaynak: "ajan", tur_adi: "kirli-agacla-bitti", mesaj, geri_alinabilir: true, devam_edilebilir: true,
      oneri: "şef işçiye commit için diriltme mesajı göndersin" },
  };
}

// SDK Stop hook'u. Blok sayacı session_id başına tutulur; stop_hook_active=false yeni bir bitirme
// zinciri demektir (önceki engelin devamı değil), sayaç sıfırlanır. Ağaç temizlenince sayaç silinir.
// olayYaz'a giden olaylarda `ajan` alanı yok; entegratör ekler: (o) => yay({ ajan: a.id, ...o }).
// owns verilirse yalnızca OWNS içindeki kirli dosyalar engeller (F7): başkasının commit'lenmemiş işi ajanı kilitlemez.
export function stopHook(ajanCwd: (ajanId?: string) => string, blokSayaci: Map<string, number>, olayYaz: (o: object) => void, owns?: string[]): HookCallback {
  return async (girdi) => {
    if (girdi.hook_event_name !== "Stop") return {};
    const g = girdi as StopHookInput;
    const anahtar = g.session_id;
    if (!g.stop_hook_active) blokSayaci.delete(anahtar);

    let kirli: string[];
    try {
      const d = await degisiklikler(ajanCwd(g.agent_id));
      kirli = ownsAyir(d, d.kirli, owns)[0];
    } catch (e) {
      // git okunamadıysa engelleme (yanlış gerekçeyle döngü olmasın) ama sessizce de geçme.
      olayYaz({ tur: "hata", kaynak: "arac", tur_adi: "git-status-okunamadi", mesaj: ozetle((e as Error).message),
        geri_alinabilir: true, devam_edilebilir: true, oneri: "ajanın worktree yolunu ve git kurulumunu kontrol et" });
      return {};
    }

    const sayi = blokSayaci.get(anahtar) ?? 0;
    const k = stopKarari(kirli, sayi);
    if (!kirli.length) blokSayaci.delete(anahtar);
    if (k.engelle) {
      blokSayaci.set(anahtar, sayi + 1);
      olayYaz({ tur: "kapi", karar: "red", alt_karar: "red", neden: `Stop engellendi (${sayi + 1}/${AZAMI_BLOK}): ${ozetle(k.neden)}` });
      return { decision: "block", reason: k.neden };
    }
    if (k.hata) olayYaz({ tur: "hata", ...k.hata });
    return {};
  };
}

// ---------- Ölüm ve diriltme ----------

const olumSn = Number(process.env.ZEPUL_OLUM_SN);
export const OLUM_ESIK_MS: number = (olumSn > 0 ? olumSn : 600) * 1000;

// Açık araç çağrısı (arac geldi, arac_sonuc gelmedi) sessizliği normaldir: uzun test, derleme, ping (kabul K3).
export const ACIK_ARAC_ESIK_MS = 15 * 60_000;

// Yalnızca "calisiyor" durumundaki ve en az esikMs sessiz kalan ajanlar. son_olay_ts: epoch ms.
// acikArac > 0 olan ajanın eşiği max(esikMs, 15 dk). İnsan onayı bekleyen ajanları ayıklamak entegratörün işi (sessizlik orada normal).
// carpan: yerel modelli ajanda ayar yerel_esik_carpani (ilk tur model yükleme + istem işleme ~280 sn sürer); Claude ajanında 1.
export const olumEsigi = (esikMs: number, acikArac = 0, carpan = 1) => (acikArac ? Math.max(esikMs, ACIK_ARAC_ESIK_MS) : esikMs) * carpan;
export function olumAdaylari(ajanlar: { id: string; durum: string; son_olay_ts: number; acikArac?: number; carpan?: number }[], simdi: number, esikMs: number): string[] {
  return ajanlar
    .filter((a) => a.durum === "calisiyor" && simdi - a.son_olay_ts >= olumEsigi(esikMs, a.acikArac, a.carpan))
    .map((a) => a.id);
}

export const AZAMI_DIRILTME = 3;
export type DiriltmePlani = { eylem: "mesaj" | "resume" | "vazgec"; mesaj?: string; neden: string };

// deneme: bu ölüm için şimdiye kadar yapılmış diriltme sayısı (ilk diriltmede 0).
export function diriltmePlani(a: { deneme: number; oturumBitti: boolean; sessionId?: string; sonOzet?: string; sha?: string; kirli: string[] }): DiriltmePlani {
  if (a.deneme >= AZAMI_DIRILTME) {
    return { eylem: "vazgec", neden: `${AZAMI_DIRILTME} diriltme denemesi tükendi; insana haber ver (ntfy hata)` };
  }
  const mesaj = `Diriltme (deneme ${a.deneme + 1}/${AZAMI_DIRILTME}): kaldığın yer: ${a.sonOzet?.trim() ? ozetle(a.sonOzet.trim()) : "bilinmiyor"}. ` +
    `Son commit: ${a.sha ? a.sha.slice(0, 7) : "yok"}. Kirli dosya: ${a.kirli.length}. ` +
    "Önce hasarı kontrol et (git status, git log -3), commit'lenmemiş işi kaybetme, sonra kaldığın yerden devam et.";
  if (a.oturumBitti && a.sessionId) {
    return { eylem: "resume", mesaj, neden: `oturum kapanmış; query yeniden başlatılır (resume: ${a.sessionId})` };
  }
  return {
    eylem: "mesaj", mesaj,
    neden: a.oturumBitti ? "oturum kapanmış ve session_id yok; yeni oturum açılıp mesaj ilk görev olarak verilir" : "oturum açık; mesaj gelen kutusuna itilir",
  };
}
