import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { kanonik, kisaAdCozulemedi, desenNormalize, desenEslesir } from "../sunucu/yol.ts";
import { kesinYasakMi, sahiplikIhlaliMi } from "../sunucu/olay.ts";

// Deneme ağacı: .git/hooks, .env, panel-url.txt, uzun adlı dizin. Kısa adlar `dir /x` çıktısından okunur (fsutil yönetici ister).
const KOK = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "zepul-yol-")));
fs.mkdirSync(path.join(KOK, ".git", "hooks"), { recursive: true });
fs.writeFileSync(path.join(KOK, ".env"), "GIZLI=1\n");
fs.writeFileSync(path.join(KOK, "panel-url.txt"), "http://127.0.0.1:1/?t=sahte\n");
fs.mkdirSync(path.join(KOK, "uzun-adli-dizin-klasoru"));
process.on("exit", () => fs.rmSync(KOK, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));

function kisaAd(ad: string): string | null {
  try {
    const cikti = execSync(`dir /x /a "${KOK}"`, { shell: "cmd.exe", encoding: "latin1" });
    const m = cikti.match(new RegExp(`\\s(\\S+~\\d+\\S*)\\s+${ad.replace(/[.-]/g, "\\$&")}\\s*$`, "m"));
    return m ? m[1] : null;
  } catch { return null; }
}
const GIT = kisaAd(".git"), ENV = kisaAd(".env"), PNL = kisaAd("panel-url.txt"), UZUN = kisaAd("uzun-adli-dizin-klasoru");
const kisaYok = !GIT || !ENV || !PNL || !UZUN ? "bu birimde 8.3 kısa ad üretilmiyor" : false;

const k = (y: string) => kanonik(y, KOK);

test("kanonik: 8.3 kısa ad uzun ada çözülür (W1)", { skip: kisaYok }, () => {
  assert.equal(k(`${GIT}\\hooks\\pre-commit`), k(".git/hooks/pre-commit"));
  assert.match(k(`${GIT}\\hooks\\pre-commit`), /\/\.git\/hooks\/pre-commit$/);
  assert.equal(k(path.join(KOK, ENV!)), k(".env"));
  assert.match(k(ENV!), /\/\.env$/);
  assert.equal(k(`${UZUN}/a/b.ts`), k("uzun-adli-dizin-klasoru/a/b.ts"), "var olmayan kalan üstüne eklenir");
  assert.equal(kisaAdCozulemedi(`${GIT}\\hooks\\x`, KOK), false);
  assert.equal(kisaAdCozulemedi("YOKYOK~1\\x", KOK), true, "çözülemeyen kısa ad");
  assert.equal(kisaAdCozulemedi("a/b~2.txt", KOK), true);
  assert.equal(kisaAdCozulemedi("a/b.txt", KOK), false);
});

test("kanonik: Git Bash, \\\\?\\, \\\\?\\UNC\\ ve \\\\localhost\\C$ yazımları aynı yola çıkar (W1)", () => {
  const hedef = path.join(KOK, ".git", "hooks", "x");
  const beklenen = kanonik(hedef);
  assert.equal(beklenen, hedef.replace(/\\/g, "/").toLowerCase());
  const surucu = hedef[0], govde = hedef.slice(2); // \Users\...
  const bicimler = [
    `/${surucu.toLowerCase()}${govde.replace(/\\/g, "/")}`, // Git Bash: /c/Users/...
    `\\\\?\\${hedef}`,
    `//?/${hedef.replace(/\\/g, "/")}`,
    `\\\\.\\${hedef}`,
    `\\\\?\\UNC\\localhost\\${surucu}$${govde}`,
    `\\\\localhost\\${surucu}$${govde}`,
    `\\\\127.0.0.1\\${surucu.toLowerCase()}$${govde}`,
    `\\\\${os.hostname()}\\${surucu}$${govde}`,
    hedef.toUpperCase(),
  ];
  for (const b of bicimler) assert.equal(kanonik(b, "C:\\baska"), beklenen, b);
  assert.equal(kanonik(`/${surucu.toLowerCase()}`), `${surucu.toLowerCase()}:/`, "yalnızca sürücü");
});

test("kanonik: junction hedefine, sondaki nokta ve veri akışı Win32 gibi çözülür", () => {
  fs.symlinkSync(path.join(KOK, ".git"), path.join(KOK, "bag"), "junction");
  assert.equal(k("bag/hooks/x"), k(".git/hooks/x"));
  assert.equal(k(".git.\\hooks\\x"), k(".git/hooks/x"));
  assert.equal(k(".env::$DATA"), k(".env"));
  assert.equal(k(".env "), k(".env"));
  assert.equal(k("yok/.env.::$DATA"), k("yok/.env"));
});

// Kesin yasak: sonuç "mutlak" (red), "insan" ya da "izin".
function sinif(arac: string, v: string): string {
  const girdi = /^(Bash|PowerShell)$/.test(arac) ? { command: v } : { file_path: v, content: "x" };
  const y = kesinYasakMi(arac, girdi, KOK);
  return y.mutlak ? "mutlak" : y.yasak ? "insan" : "izin";
}

test("kesinYasakMi: kısa ad, Git Bash, \\\\?\\, C$, junction ve Win32 yazımlarıyla git kancası ve panel belirteci dosyası (W1)", { skip: kisaYok }, () => {
  fs.symlinkSync(path.join(KOK, ".git"), path.join(KOK, "bag2"), "junction");
  const hooks = path.join(KOK, ".git", "hooks", "pre-commit");
  const ornekler: [string, string, string][] = [
    ["Write", `${GIT}\\hooks\\pre-commit`, "mutlak"],
    ["Edit", `${KOK}\\${GIT}\\config`, "mutlak"],
    ["Write", `/${hooks[0].toLowerCase()}${hooks.slice(2).replace(/\\/g, "/")}`, "mutlak"],
    ["Write", `\\\\?\\${hooks}`, "mutlak"],
    ["Write", `\\\\localhost\\${hooks[0]}$${hooks.slice(2)}`, "mutlak"],
    ["Write", "bag2/hooks/pre-commit", "mutlak"],
    ["Write", ".git.\\hooks\\pre-commit", "mutlak"],
    ["Read", PNL!, "insan"],
    ["Read", `${KOK}\\${PNL}`, "insan"],
    ["Read", "panel-url.txt::$DATA", "insan"],
    ["Write", "panel-url.txt.", "insan"],
    ["Bash", `cat ${PNL}`, "insan"],
    ["PowerShell", `Get-Content ${KOK}\\${PNL}`, "insan"],
    ["Bash", `node x.js --dosya=${PNL}`, "insan"],
    // 27.10.2026: genel sır dosyası (.env) kısa adla da izinli
    ["Read", ENV!, "izin"],
    ["Bash", `cat ${ENV}`, "izin"],
    // çözülemeyen kısa ad: yazma red, okuma insan
    ["Write", "YOKYOK~1\\a.ts", "mutlak"],
    ["Edit", `${UZUN}\\YOK~2\\a.ts`, "mutlak"],
    ["Read", "YOKYOK~1\\a.ts", "insan"],
    // negatif: çözülen kısa ad, git revizyonu, git ayarını okuma
    ["Read", `${UZUN}\\a.ts`, "izin"],
    ["Write", `${UZUN}\\a.ts`, "izin"],
    ["Bash", "git show HEAD~1", "izin"],
    ["Bash", "git diff HEAD~2 -- a.ts", "izin"],
    ["Read", `${GIT}\\config`, "izin"],
    ["Bash", `rm -rf ${UZUN}`, "izin"],
    ["Bash", "rm -rf YOKYOK~1", "insan"],
    ["Bash", `rm -rf /${KOK[0].toLowerCase()}${KOK.slice(2).replace(/\\/g, "/")}/..`, "insan"],
  ];
  for (const [arac, v, beklenen] of ornekler) assert.equal(sinif(arac, v), beklenen, `${arac}: ${v} → ${kesinYasakMi(arac, { file_path: v, command: v }, KOK).neden}`);
});

test("sahiplikIhlaliMi: 8.3 kısa adla başkasının OWNS'u atlatılamaz (W2)", { skip: kisaYok }, () => {
  const s = new Map([["uzun-adli-dizin-klasoru/**", "sahip"], [".env", "sahip"]]);
  assert.deepEqual(sahiplikIhlaliMi("baska", `${UZUN}\\a.ts`, s, KOK), { ihlal: true, sahip: "sahip" });
  assert.equal(sahiplikIhlaliMi("baska", ENV!, s, KOK).ihlal, true);
  assert.equal(sahiplikIhlaliMi("sahip", `${UZUN}\\a.ts`, s, KOK).ihlal, false);
});

test("desenNormalize: \\ → /, ./ atılır, sondaki / → /**, çıplak ad kalır; desteklenmeyen biçim hata", () => {
  const ornekler: [string, string][] = [
    ["sunucu\\kapi.ts", "sunucu/kapi.ts"],
    ["./docs/**", "docs/**"],
    ["docs/", "docs/**"],
    ["docs\\", "docs/**"],
    ["docs", "docs"],
    ["docs/*", "docs/*"],
    ["*.md", "*.md"],
    ["docs/a*.md", "docs/a*.md"],
    ["**", "**"],
  ];
  for (const [g, b] of ornekler) assert.equal(desenNormalize(g), b, g);
  for (const g of ["", "  ", "src/*/x.ts", "**/*.md", "docs/a?.md", "docs/[ab].md", "docs/{a,b}.md", "docs/**/x"]) {
    assert.throws(() => desenNormalize(g), /desteklenmeyen OWNS deseni/, g);
  }
});

test("desenEslesir: çıplak ad hem tam yol hem ad/**; dizin/* tek seviye; *.uzanti kök seviyesi", () => {
  const e = (d: string, y: string) => desenEslesir(d, y, KOK);
  assert.equal(e("docs", "docs"), true);
  assert.equal(e("docs", "docs/a/b.md"), true);
  assert.equal(e("docs", "docsx/a.md"), false);
  assert.equal(e("docs/*", "docs/a.md"), true);
  assert.equal(e("docs/*", "DOCS\\A.MD"), true);
  assert.equal(e("docs/*", "docs/a/b.md"), false);
  assert.equal(e("docs/*.md", "docs/a.ts"), false);
  assert.equal(e("*.md", "README.md"), true);
  assert.equal(e("*.md", "docs/a.md"), false);
  assert.equal(e("**", "a/b/c"), true);
  assert.equal(e("**", path.join(os.tmpdir(), "baska")), false, "kök dışı");
  assert.equal(e("src/*/x.ts", "src/a/x.ts"), false, "desteklenmeyen desen hiçbir yola uymaz");
});

// av7 B1: yalnız nokta ve boşluktan oluşan bileşen Windows'ta kırpılır; kanonik iki ve daha çok noktayı "..", tek noktayı "." sayar.
test("kanonik: '...', '.. ' ve '. ' bileşeni üst ya da aynı dizin sayılır (av7 B1)", () => {
  assert.equal(kanonik("C:/a/b/.../x"), kanonik("C:/a/x"));
  assert.equal(kanonik("C:/a/b/.. /.. /x"), kanonik("C:/x"));
  assert.equal(kanonik("C:/a/b/. /x"), kanonik("C:/a/b/x"));
});

test("kesinYasakMi: Grep/Glob path'inin sır dizini denetimi kanonik yolla; Win32 yazımları aynı sonucu verir (av10 Bulgu 2)", () => {
  const proje = path.join(KOK, "proje"), sir = path.join(KOK, "uzun-adli-sir-dizini");
  fs.mkdirSync(proje, { recursive: true });
  fs.mkdirSync(sir, { recursive: true });
  fs.writeFileSync(path.join(sir, "panel-url.txt"), "http://127.0.0.1:1/?t=sahte\n");
  const kisa = kisaAd("uzun-adli-sir-dizini");
  const ileri = sir.replace(/\\/g, "/");
  const yazimlar = [sir, ileri, `${sir}.`, `${sir} `, `${ileri}.`, `${sir}\\.`, sir.toUpperCase(), ileri.toLowerCase(),
    `/${ileri[0].toLowerCase()}${ileri.slice(2)}`, ...(kisa ? [path.join(KOK, kisa)] : [])];
  for (const arac of ["Grep", "Glob"]) {
    for (const p of yazimlar) {
      const y = kesinYasakMi(arac, { pattern: arac === "Glob" ? "*" : "=", path: p }, proje);
      assert.ok(y.yasak && !y.mutlak, `${arac} ${JSON.stringify(p)} → ${y.neden || "izin"}`);
    }
  }
  assert.equal(kesinYasakMi("Grep", { pattern: "=", path: path.join(KOK, "uzun-adli-dizin-klasoru") }, proje).yasak, false, "sırsız dizin");
});
