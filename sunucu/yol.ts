// Yol kanonikleştirme ve OWNS deseni. Sır, git iç dosyası, sahiplik ve proje kökü denetimleri aynı biçimi karşılaştırır:
// aynı dosyanın başka yazımı (8.3 kısa ad, Git Bash, \\?\, \\localhost\C$, junction) korumayı atlatmasın (W1).
// Testler: test/yol.test.ts (gerçek dosya ve gerçek kısa adla).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const kacis = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// \\localhost\C$\x, \\127.0.0.1\c$\x, \\<makine>\C$\x → C:\x
const YEREL_PAY = new RegExp(`^\\\\\\\\(?:localhost|127\\.0\\.0\\.1|${kacis(os.hostname())})\\\\([a-z])\\$(?:\\\\|$)`, "i");

// 0: av12 Bulgu 1: ~, ~/ ve ~\ ev dizinine açılır (Claude Code ~ ve ~/'yi açar; ~\ kapalı kapı için de açılır).
// 1-3: Git Bash (/c/x), \\?\ ve \\.\ önekleri, \\?\UNC\, yerel yönetim paylaşımı (C$).
function onIsle(yol: string): string {
  return yol.trim()
    .replace(/^~(?=[\\/]|$)/, () => os.homedir())
    .replace(/^\/([a-z])(\/|$)/i, "$1:/")
    .replace(/\//g, "\\")
    .replace(/^\\\\[?.]\\UNC\\/i, "\\\\")
    .replace(/^\\\\[?.]\\(?=[a-z]:)/i, "")
    .replace(YEREL_PAY, "$1:\\")
    // av7 B1: yalnız nokta ve boşluktan oluşan bileşen ("...", ".. ", ". ") Windows'ta kırpılır, sonucu belirsiz. Güvenli yan:
    // iki ya da daha çok nokta "..", tek nokta "." sayılır.
    .split("\\").map((b) => (/^[. ]+$/.test(b) ? (b.replace(/ /g, "").length > 1 ? ".." : ".") : b)).join("\\");
}

type Cozum = { yol: string; kisaAd: boolean };

function coz(yol: string, kok: string): Cozum {
  // 4. path.resolve; Win32 gibi: parçanın sonundaki nokta ve boşluk atılır (.git. → .git), alternatif veri akışı kesilir (.env::$DATA → .env).
  const r = path.resolve(onIsle(kok), onIsle(yol));
  const kokDizin = path.parse(r).root;
  const parcalar = r.slice(kokDizin.length).split("\\").filter(Boolean).map((p) => p.replace(/:.*$/, "").replace(/[. ]+$/, "") || p);
  const tam = path.join(kokDizin, ...parcalar);
  let gercek = tam;
  const kalan: string[] = [];
  if (tam.startsWith("\\\\")) kalan.push(...parcalar);
  else {
    for (let p = tam; ; ) {
      try { gercek = path.join(fs.realpathSync.native(p), ...kalan); break; }
      catch { const ust = path.dirname(p); if (ust === p) break; kalan.unshift(path.basename(p)); p = ust; }
    }
  }
  // 6. Karşılaştırma biçimi: küçük harf, / ayırıcı.
  return { yol: gercek.replace(/\\/g, "/").toLowerCase(), kisaAd: kalan.some((p) => /~\d/.test(p)) };
}

// Karşılaştırma için kanonik yol: küçük harf, "/" ayırıcı, var olan kısmı gerçek (uzun) adıyla.
export function kanonik(yol: string, kok: string = process.cwd()): string {
  return coz(yol, kok).yol;
}

// Yolda gerçek adına çözülemeyen bir 8.3 kısa ad (~1) parçası var mı? Var olmayan kısa ad neye işaret edeceği bilinmez:
// yazma reddedilir, okuma insana gider (olay.ts kesinYasakMi).
export function kisaAdCozulemedi(yol: string, kok: string = process.cwd()): boolean {
  return coz(yol, kok).kisaAd;
}

// av12: açılışı belirsiz yazım: ~kullanici, %VAR%, $VAR, ${VAR}, $env:VAR. Araç bunları açmaz ama kapı neye işaret ettiğini
// bilemez; kapalı kapı, insana gider (kapi.ts). \\localhost\C$\ ve ::$DATA gibi yazımlar da $ içerir; ikincisi zaten insana gider.
export const belirsizYol = (yol: string) => /^\s*~[^\\/]|%[^%\\/]+%|\$(?:env:)?[A-Za-z_{]/i.test(yol);

// İki kanonik yol: y, t'nin kendisi ya da altında mı?
export const altinda = (y: string, t: string) => y === t || y.startsWith(t.endsWith("/") ? t : t + "/");

// ---------- OWNS deseni (glob) ----------
// İki desen türü: "alt" = taban yol ve altındaki her şey (tam yol, çıplak ad, dizin/**, **);
// "yaprak" = bir dizinin doğrudan çocukları (dizin/*, *.uzanti, dizin/a*.md).

export type Desen = { tur: "alt"; taban: string } | { tur: "yaprak"; dizin: string; yaprak: string; re: RegExp };
const JOKER = /[*?[\]{}]/;
const duz = (d: string) => d.trim().replace(/\\/g, "/").replace(/^(\.\/)+/, "").replace(/\/+$/, "/**");
const ust = (p: string) => { const d = path.posix.dirname(p); return d === "." ? "" : d; };

// Desteklenmeyen biçim (dizin içinde joker, ?, [], {}, **/x ...) null döner.
export function desenCoz(d: string): Desen | null {
  const s = path.posix.normalize(duz(d).toLowerCase());
  if (s === "**" || s === ".") return { tur: "alt", taban: "" };
  if (s.endsWith("/**")) return JOKER.test(s.slice(0, -3)) ? null : { tur: "alt", taban: s.slice(0, -3) };
  if (!JOKER.test(s)) return { tur: "alt", taban: s };
  const dizin = ust(s), yaprak = path.posix.basename(s);
  if (JOKER.test(dizin) || /[?[\]{}]/.test(yaprak)) return null;
  return { tur: "yaprak", dizin, yaprak, re: new RegExp("^" + yaprak.split("*").map((p) => p.replace(/[.+^$|()\\]/g, "\\$&")).join("[^/]*") + "$") };
}

// Sahiplik anahtarı: \ → /, baştaki ./ atılır, sondaki / → /**. Çıplak ad olduğu gibi kalır (sahiplik onu hem tam yol hem ad/** sayar).
// Desteklenmeyen biçimde hata fırlatır: ajan başlatılmaz.
export function desenNormalize(d: string): string {
  const s = duz(d);
  if (!s || !desenCoz(s)) throw new Error(`desteklenmeyen OWNS deseni: "${d}"; tam yol, dizin/, dizin/**, dizin/* ya da *.uzanti yazılır`);
  return s;
}

export function desenEslesir(desen: string, yol: string, kok: string = process.cwd()): boolean {
  const d = desenCoz(desen);
  if (!d) return false;
  const y = kanonik(yol, kok);
  if (d.tur === "alt") return altinda(y, kanonik(d.taban || ".", kok));
  const dizin = kanonik(d.dizin || ".", kok);
  return y.slice(0, y.lastIndexOf("/") + 1) === (dizin.endsWith("/") ? dizin : dizin + "/") && d.re.test(y.slice(y.lastIndexOf("/") + 1));
}

// ---------- Glob çakışması (brif) ----------

// yol, taban dizininin içinde (ya da kendisi) mi? Göreli desenler process.cwd()'ye göre çözülür.
const altta = (yol: string, taban: string) => !taban || altinda(kanonik(yol), kanonik(taban));

// Jokerin çocukları taban altında kalır (dizin ≤ taban), ya da taban jokerin kendi çocuğudur.
type Alt = Extract<Desen, { tur: "alt" }>;
type Yaprak = Extract<Desen, { tur: "yaprak" }>;
const karma = (p: Alt, g: Yaprak) => altta(g.dizin, p.taban) || (ust(p.taban) === g.dizin && g.re.test(path.posix.basename(p.taban)));

// Aynı dizinde iki joker: ön ek ve son ek uyumluysa kesişebilir (`*.md` ile `*.ts` kesişmez).
function yapYap(x: Yaprak, y: Yaprak): boolean {
  const uc = (p: string) => [p.slice(0, p.indexOf("*")), p.slice(p.lastIndexOf("*") + 1)];
  const [[o1, s1], [o2, s2]] = [uc(x.yaprak), uc(y.yaprak)];
  return x.dizin === y.dizin && (o1.startsWith(o2) || o2.startsWith(o1)) && (s1.endsWith(s2) || s2.endsWith(s1));
}

// Muhafazakâr: emin değilse true. Windows: harf duyarsız, \ ve / eşit.
// Not: tam yol dizin olabilir; "docs" ile "docs/a.md" çakışır (dosya ise altında dosya olamayacağı için zararsız).
export function globlarCakisirMi(a: string, b: string): boolean {
  const x = desenCoz(a), y = desenCoz(b);
  if (!x || !y) return true;
  if (x.tur === "alt") return y.tur === "alt" ? altta(x.taban, y.taban) || altta(y.taban, x.taban) : karma(x, y);
  return y.tur === "alt" ? karma(y, x) : yapYap(x, y);
}
