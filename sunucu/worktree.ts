// Faz 3: ajan başına git worktree (dal is/<ad>) ve main'e birleştirme.
// Git yalnızca yasam.ts calistir ile çağrılır: shell yok, argüman dizisi, 60 sn zaman aşımında süreç ağacı öldürülür (W9).
// Yıkıcı bayrak yok: `branch -D`, `reset` kullanılmaz; `worktree remove --force` yalnız kopyaKaldir'a kopyaKoku verildiğinde, kodun
// açtığı dalsız denetçi kopyasına (K17). Kirli işi git'in kendi reddi korur;
// modül yalnızca sonucu sınıflandırır. Tek geri alma `merge --abort`: ağacı merge öncesine döndürür, yasak listesinde yok.
//
// Uzun yol (Windows): worktree `<repo>/.worktrees/<ad>` altına açılır; ad 40 karakterle sınırlıdır. Derin dosyalar
// (node_modules gibi) yine de 260 karakterlik MAX_PATH sınırını aşabilir. Git for Windows bu durumda "Filename too long"
// hatası verir; çözüm `git config core.longpaths true`. Bu bir sistem ayarı olduğu için modül ayarı kendisi değiştirmez.
import fs from "node:fs/promises";
import path from "node:path";
import { calistir, ownsAyir } from "./yasam.ts";
import { kanonik, altinda } from "./yol.ts";

const git = (cwd: string, args: string[]) => calistir("git", ["--no-optional-locks", ...args], cwd, 60_000);

const basarili = (p: Promise<unknown>) => p.then(() => true, () => false);
const kirliMi = async (cwd: string) => (await git(cwd, ["status", "--porcelain", "--untracked-files=all"])).trim() !== "";
// Windows'ta yol karşılaştırması harf duyarsızdır.
const norm = (p: string) => (process.platform === "win32" ? path.resolve(p).toLowerCase() : path.resolve(p));
const worktreeYolu = (repo: string, ad: string) => path.join(path.resolve(repo), ".worktrees", ad);

/** Yalnızca [a-z0-9-]. Türkçe harfler ASCII'ye çevrilir. En fazla 40 karakter olur, boş kalırsa hata fırlatır.
 *  Windows ayrılmış adlarına (con, nul, com1 …) klasör açılamaz; sona `-w` eklenir (W12). */
export function adTemizle(ad: string): string {
  const temiz = ad.toLocaleLowerCase("tr").replace(/ı/g, "i").normalize("NFD").replace(/\p{M}/gu, "") // ç→c, ğ→g, ö→o, ş→s, ü→u
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+/, "").slice(0, 40).replace(/-+$/, "");
  if (!temiz) throw new Error(`geçersiz worktree adı: ${JSON.stringify(ad)}`);
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(temiz) ? `${temiz}-w` : temiz;
}

/** `git worktree list --porcelain -z`. -z ile CRLF sorunu olmaz, boşluklu ya da satır sonlu yol bölünmez (git ≥ 2.36).
 *  Ayrılmış HEAD'de ya da bare depoda dal "" olur. Yol path.resolve ile normalize edilir. */
export async function worktreeListesi(repo: string): Promise<{ yol: string; dal: string; sha: string; kilitli: boolean }[]> {
  const liste: { yol: string; dal: string; sha: string; kilitli: boolean }[] = [];
  for (const satir of (await git(repo, ["worktree", "list", "--porcelain", "-z"])).split("\0")) {
    const i = satir.indexOf(" ");
    const [anahtar, deger] = i < 0 ? [satir, ""] : [satir.slice(0, i), satir.slice(i + 1)];
    if (anahtar === "worktree") { liste.push({ yol: path.resolve(deger), dal: "", sha: "", kilitli: false }); continue; }
    const w = liste.at(-1);
    if (!w) continue;
    if (anahtar === "HEAD") w.sha = deger;
    else if (anahtar === "branch") w.dal = deger.replace(/^refs\/heads\//, "");
    else if (anahtar === "locked") w.kilitli = true;
  }
  return liste;
}

// .worktrees/ ana ağaçta izlenmeyen dosya olarak görünmesin; yoksa birlestir her zaman 'kirli-ana' der.
// Satır depoya özel info/exclude dosyasına eklenir; commit'lenmez, .gitignore'a dokunulmaz.
async function worktreesDisla(repo: string): Promise<void> {
  const [yol, onEk = ""] = (await git(repo, ["rev-parse", "--git-path", "info/exclude", "--show-prefix"])).split(/\r?\n/);
  const dosya = path.resolve(repo, yol), satir = `/${onEk}.worktrees/`;
  const icerik = await fs.readFile(dosya, "utf8").catch(() => "");
  if (icerik.split(/\r?\n/).includes(satir)) return;
  await fs.mkdir(path.dirname(dosya), { recursive: true });
  await fs.appendFile(dosya, `${icerik && !icerik.endsWith("\n") ? "\n" : ""}${satir}\n`);
}

/** Worktree'yi `<repo>/.worktrees/<ad>` yolunda, `is/<ad>` dalında açar. baz verilmezse HEAD kullanılır.
 *  Ad zaten açık bir worktree'de kullanılıyorsa ya da dal zaten varsa hata fırlatır; hiçbir şeyin üzerine yazılmaz. */
export async function worktreeAc(repo: string, ad: string, baz = "HEAD"): Promise<{ yol: string; dal: string; baz_sha: string }> {
  ad = adTemizle(ad);
  const yol = worktreeYolu(repo, ad), dal = `is/${ad}`;
  if (baz.startsWith("-")) throw new Error(`geçersiz baz: ${baz}`);
  if ((await worktreeListesi(repo)).some((w) => norm(w.yol) === norm(yol))) throw new Error(`worktree zaten açık: ${yol}`);
  if (await basarili(git(repo, ["rev-parse", "--verify", "--quiet", `refs/heads/${dal}`]))) throw new Error(`dal zaten var: ${dal}`);
  const baz_sha = (await git(repo, ["rev-parse", "--verify", `${baz}^{commit}`])).trim();
  await worktreesDisla(repo);
  await git(repo, ["worktree", "add", "-b", dal, yol, baz_sha]); // -b (-B değil): var olan dal ezilmez
  return { yol, dal, baz_sha };
}

// Sembolik bağları ve junction'ları (Windows'ta lstat junction'ı da isSymbolicLink sayar) hedefine girmeden söker.
// Bağın içine inilmez; unlink yalnız bağı siler (dizin junction'ında da).
async function baglariSok(dizin: string): Promise<void> {
  await Promise.all((await fs.readdir(dizin)).map(async (ad) => {
    const p = path.join(dizin, ad), s = await fs.lstat(p);
    if (s.isSymbolicLink()) await fs.unlink(p);
    else if (s.isDirectory()) await baglariSok(p);
  }));
}

/** Bağlı worktree'yi (denetçi kopyası ya da işçi ağacı) kaldırır; `--force` kullanmaz (W3). git 2.51 (Windows) `worktree remove`
 *  yok sayılan bir junction'ın içine girip hedefi boşaltır (--force olmadan da, 29.09 deneyi); bu yüzden önce bağlar sökülür.
 *  Ana ağaç ya da repo'nun worktree'si olmayan yol için 'yok' döner, hiçbir şeye dokunmaz.
 *  Kirliyse yalnız bağlar sökülür, commit'lenmemiş iş yerinde kalır: 'kirli'. Kilitli worktree için hata fırlatır.
 *  kopyaKoku (K17): denetçinin mutasyon kopyası tanım gereği kirlidir. Kanonik yolu kökün kesin altında, dalı olmayan (detached)
 *  ve kök ana ağacı kapsamıyorsa `--force` ile kaldırılır. Ana ağaç (slice(1)) ve dallı işçi worktree'si bu yola hiç girmez. */
export async function kopyaKaldir(yol: string, repo: string, kopyaKoku?: string): Promise<{ durum: "kaldirildi" | "kirli" | "yok" }> {
  const [ana, ...digerleri] = await worktreeListesi(repo); // ilk kayıt ana ağaç
  const w = digerleri.find((x) => norm(x.yol) === norm(yol));
  if (!w) return { durum: "yok" };
  await baglariSok(w.yol);
  if (await kirliMi(w.yol)) {
    const kok = kopyaKoku && kanonik(kopyaKoku), y = kanonik(w.yol);
    if (!kok || w.dal || y === kok || !altinda(y, kok) || altinda(kanonik(ana.yol), kok)) return { durum: "kirli" };
    await git(repo, ["worktree", "remove", "--force", w.yol]);
    return { durum: "kaldirildi" };
  }
  await git(repo, ["worktree", "remove", w.yol]); // git kirli ağacı kendisi de reddeder
  return { durum: "kaldirildi" };
}

// av9 şef kararı: denetçinin mutasyon kopyası kabukta değil, bu iki işlevle (bus araçları mutasyon_kopyasi_ac / _sil) açılır ve
// silinir. Kapı kabuktaki rm ve git worktree için kısa yol tanımaz. Ad tek bileşendir: yol ayırıcı, nokta ve seçenek biçimi olamaz.
const KOPYA_ADI = /^[a-z0-9][a-z0-9-]{0,31}$/;
const kopyaYolu = (kok: string, ad: string) => {
  // av10 Bulgu 4: Windows ayrılmış adları (uzantılı biçimleri de) aygıttır, klasör değil.
  if (!KOPYA_ADI.test(ad) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(ad)) throw new Error(`geçersiz kopya adı (yalnız a-z, 0-9 ve -, en çok 32 karakter): ${JSON.stringify(ad)}`);
  return path.join(path.resolve(kok), ad);
};

/** `<kök>/<ad>` için `git worktree add --detach`. ref seçenek biçiminde olamaz; `rev-parse --verify` ile commit'e çözülür,
 *  worktree o sha'da açılır. Var olan yolun üzerine açılmaz. Mutlak yolu döner. */
export async function mutasyonKopyasiAc(repo: string, kok: string, ad: string, ref: string): Promise<string> {
  const yol = kopyaYolu(kok, ad);
  if (!ref || ref.startsWith("-")) throw new Error(`geçersiz ref: ${JSON.stringify(ref)}`);
  const sha = (await git(repo, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]).catch(() => "")).trim();
  if (!sha) throw new Error(`ref çözülemedi: ${JSON.stringify(ref)}`);
  if (await basarili(fs.lstat(yol))) throw new Error(`kopya zaten var: ${ad}`);
  await fs.mkdir(path.dirname(yol), { recursive: true });
  await git(repo, ["worktree", "add", "--detach", yol, sha]);
  return yol;
}

/** Yalnız `<kök>/<ad>` kopyasını kaldırır. Kopyanın kendisi bağlantıysa (symlink, junction) yalnız bağ silinir, hedefine
 *  dokunulmaz. Değilse kanonik olarak kökün kesin altında olmalı; kaldırma kopyaKaldir'ın güvenli yolundan gider (içteki bağlar
 *  önce sökülür, --force yalnız kökün altındaki dalsız kopyaya). Worktree olmayan klasör 'yok' döner, dokunulmaz. */
export async function mutasyonKopyasiSil(repo: string, kok: string, ad: string): Promise<{ durum: "kaldirildi" | "baglanti-silindi" | "kirli" | "yok" }> {
  const yol = kopyaYolu(kok, ad);
  const s = await fs.lstat(yol).catch(() => null);
  if (!s) return { durum: "yok" };
  if (s.isSymbolicLink()) { await fs.unlink(yol).catch(() => fs.rmdir(yol)); return { durum: "baglanti-silindi" }; }
  const k = kanonik(kok), y = kanonik(yol);
  if (y === k || !altinda(y, k)) throw new Error(`kopya kanonik olarak kökün altında değil: ${ad}`);
  return kopyaKaldir(yol, repo, kok);
}

/** Worktree'yi kapatır (kopyaKaldir). Kirliyse 'kirli' döner, commit'lenmemiş işe dokunmaz.
 *  dalSil yalnızca `git branch -d` çalıştırır: merge edilmemiş dal sessizce yerinde kalır. Kilitli worktree için hata fırlatır. */
export async function worktreeKapat(repo: string, ad: string, secenek: { dalSil: boolean }): Promise<{ durum: "kapandi" | "kirli" | "yok" }> {
  const yol = worktreeYolu(repo, adTemizle(ad));
  const w = (await worktreeListesi(repo)).find((x) => norm(x.yol) === norm(yol));
  if (!w) return { durum: "yok" };
  if ((await kopyaKaldir(w.yol, repo)).durum === "kirli") return { durum: "kirli" };
  if (secenek.dalSil && w.dal) await basarili(git(repo, ["branch", "-d", w.dal])); // -D yasak
  return { durum: "kapandi" };
}

/** Birleştirme hedefi: ana ağacın (worktree listesinin ilki) o anki dalı; ayrılmış HEAD'de sha'sı. Worktree içinden de aynı sonucu verir. */
export async function anaDal(repo: string): Promise<string> {
  const [ana] = await worktreeListesi(repo);
  return ana?.dal || ana?.sha || "HEAD";
}

export async function dalFarki(repo: string, dal: string): Promise<{ dosyalar: string[]; commitler: { sha: string; mesaj: string }[] }> {
  const hedef = await anaDal(repo);
  const dosyalar = (await git(repo, ["diff", "--name-only", "--no-renames", "-z", `${hedef}...${dal}`, "--"])).split("\0").filter(Boolean);
  const commitler = (await git(repo, ["log", "--format=%H %s", `${hedef}..${dal}`, "--"])).split(/\r?\n/).filter(Boolean)
    .map((s) => ({ sha: s.slice(0, s.indexOf(" ")), mesaj: s.slice(s.indexOf(" ") + 1) }));
  return { dosyalar, commitler };
}

export async function birlestir(repo: string, dal: string, mesaj: string, owns?: string[]): Promise<{ durum: "tamam" | "cakisma" | "kirli-ana" | "hata" | "owns-disi"; sha?: string; cakisan?: string[]; hata?: string; yollar?: string[]; commitler?: { sha: string; mesaj: string }[] }> {
  try {
    if (dal.startsWith("-")) throw new Error(`geçersiz dal: ${dal}`);
    if (await kirliMi(repo)) return { durum: "kirli-ana" };
    // K22: net fark değil, dalın her commit'i. OWNS dışına yazılıp geri alınan dosya da geçmişte kalır, main'e girmesin.
    if (owns?.length) {
      const k = kanonik(repo), yollar: string[] = [], commitler: { sha: string; mesaj: string }[] = [];
      for (const satir of (await git(repo, ["log", "--format=%H %s", `HEAD..${dal}`, "--"])).split(/\r?\n/).filter(Boolean)) {
        const sha = satir.slice(0, satir.indexOf(" ")), mesaj = satir.slice(satir.indexOf(" ") + 1);
        const dosyalar = (await git(repo, ["show", "--format=", "--name-only", "--no-renames", "-z", sha, "--"])).split(/\0|\r?\n/).filter(Boolean);
        const d = ownsAyir({ ust: k, kok: k }, dosyalar, owns)[1];
        if (d.length) { commitler.push({ sha, mesaj }); yollar.push(...d); }
      }
      const dis = [...new Set(yollar)].sort();
      if (dis.length) return { durum: "owns-disi", yollar: dis, commitler, hata: `dal geçmişinde OWNS dışı değişiklik: ${dis.slice(0, 5).join(", ")}${dis.length > 5 ? ` (+${dis.length - 5})` : ""}; geri alınmış olsa da birleşmez` };
    }
    try {
      await git(repo, ["merge", "--no-ff", "--no-edit", "-m", mesaj, dal]);
    } catch (e) {
      const cakisan = (await git(repo, ["diff", "--name-only", "--diff-filter=U", "-z"])).split("\0").filter(Boolean);
      await git(repo, ["merge", "--abort"]).catch(() => {}); // merge başlamadıysa abort hata verir; zararsız
      if (await kirliMi(repo)) return { durum: "hata", cakisan, hata: "merge --abort sonrası ana ağaç temiz değil; elle bakılmalı" };
      return cakisan.length ? { durum: "cakisma", cakisan } : { durum: "hata", hata: (e as Error).message.trim() };
    }
    return { durum: "tamam", sha: (await git(repo, ["rev-parse", "HEAD"])).trim() };
  } catch (e) {
    return { durum: "hata", hata: (e as Error).message.trim() };
  }
}
