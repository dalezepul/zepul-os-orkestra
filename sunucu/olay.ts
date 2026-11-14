// Saf fonksiyonlar: SDK mesajı → olay, kesin yasak kapısı, sahiplik denetimi.
// Yan etki yok; sunucu (orkestra.ts) bunları çağırır, testler doğrudan sınar.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { altinda, desenEslesir, kanonik, kisaAdCozulemedi } from "./yol.ts";

export type OlayGovde = { ajan: string; tur: string; [k: string]: unknown };
export type Olay = OlayGovde & { id: string; ts: string }; // id: "o-<oturum>-<sayaç>" (orkestra.ts yay)
export type Risk = "dusuk" | "orta" | "yuksek" | "geri-alinamaz";

const OZET_SINIRI = 300;

// S2: çalışma zamanında bilinen sırlar (panel belirteci …); maskele düz metin olarak *** yapar.
const KAYITLI = new Set<string>();
export function maskeEkle(deger: string): void {
  if (deger.length >= 4) KAYITLI.add(deger);
}

// Kullanıcı adı → ~, makine adı → <makine>: harf duyarsız, tam sözcük. Modül yüklenirken bir kez kurulur.
function sozcukRe(adlar: (string | undefined)[]): RegExp | null {
  const a = [...new Set(adlar.filter((x): x is string => !!x && x.length >= 3).map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))];
  return a.length ? new RegExp(`(?<![A-Za-z0-9_])(?:${a.join("|")})(?![A-Za-z0-9_])`, "gi") : null;
}
const KULLANICI = sozcukRe([(() => { try { return os.userInfo().username; } catch { return undefined; } })()]);
const MAKINE = sozcukRe([os.hostname(), process.env.USERDOMAIN, process.env.COMPUTERNAME]);

// Ürün adı kullanıcı adıyla aynı (zepul): bunlar kullanıcı adı maskesinden muaf, yoksa zepul-os → ~-os olup günlük okunmaz.
// Yol içindeki kullanıcı dizini (C:\Users\kullanici\) ürün adı değildir, yine maskelenir. Sağda tam sözcük: zepul-osx ürün adı sayılmaz (solda sınır gerekmez: xzepul zaten kullanıcı adı sayılmaz).
const URUN = /zepul(?:-os|-orkestra|-ai|_claude| os|os)(?![A-Za-z0-9_])/gi;

export function maskele(s: string): string {
  for (const d of KAYITLI) s = s.replaceAll(d, "***");
  // Kullanıcı kararı 27.10.2026: genel sır kalıpları (anahtar, JWT, parola …) maskelenmez; yalnızca panel belirteci (?t=, KAYITLI).
  s = s.replace(/([?&]t=)[^\s&#"'`]+/g, "$1***");
  const urunler: string[] = [];
  s = s.replace(URUN, (m) => (urunler.length < 0x1800 ? `${String.fromCharCode(0xe100 + urunler.push(m) - 1)}` : m));
  if (KULLANICI) s = s.replace(KULLANICI, "~");
  if (MAKINE) s = s.replace(MAKINE, "<makine>");
  return s.replace(/([-])/g, (m, k: string) => urunler[k.charCodeAt(0) - 0xe100] ?? m);
}

export function ozetle(v: unknown): string {
  const s = maskele(typeof v === "string" ? v : JSON.stringify(v) ?? "");
  return s.length > OZET_SINIRI ? s.slice(0, OZET_SINIRI - 1) + "…" : s;
}

type Blok = { type: string; text?: string; id?: string; name?: string; input?: unknown; tool_use_id?: string; is_error?: boolean; content?: unknown };

function sonucMetni(c: unknown): string {
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.map((b: Blok) => (b.type === "text" ? b.text : `[${b.type}]`)).join("\n");
  return "";
}

function hata(ajan: string, kaynak: string, tur_adi: string, mesaj: string, devam_edilebilir: boolean, oneri: string): OlayGovde {
  return { ajan, tur: "hata", kaynak, tur_adi, mesaj: ozetle(mesaj), geri_alinabilir: true, devam_edilebilir, oneri };
}

// SDK mesajını sözleşmedeki olaylara çevirir. `altlar`: Agent aracının tool_use id'si → alt ajan adı;
// alt ajan mesajları (parent_tool_use_id dolu) "<ana>/<alt>" olarak işaretlenir.
export function sdkMesajiOlaya(ajan: string, m: any, altlar: Map<string, string> = new Map()): OlayGovde[] {
  const ebeveyn: string | null = m.parent_tool_use_id ?? null;
  const kim = ebeveyn ? `${ajan}/${altlar.get(ebeveyn) ?? ebeveyn.slice(-6)}` : ajan;
  const out: OlayGovde[] = [];

  if (m.type === "assistant") {
    for (const b of (m.message?.content ?? []) as Blok[]) {
      if (b.type === "text" && b.text?.trim()) out.push({ ajan: kim, tur: "metin", metin: maskele(b.text) });
      else if (b.type === "tool_use") {
        if (b.name === "Agent" || b.name === "Task") {
          const g = (b.input ?? {}) as { subagent_type?: string; description?: string };
          altlar.set(b.id!, g.subagent_type ?? g.description ?? "alt");
        }
        out.push({ ajan: kim, tur: "arac", arac_id: b.id, arac: b.name, girdi_ozet: ozetle(b.input) });
      }
    }
    if (m.error) out.push(hata(kim, "claude-api", m.error, `asistan hatası: ${m.error}`, m.error !== "authentication_failed", "hata türüne bak; limitse sıfırlanmasını bekle"));
  } else if (m.type === "user" && Array.isArray(m.message?.content)) {
    for (const b of m.message.content as Blok[]) {
      if (b.type === "tool_result") out.push({ ajan: kim, tur: "arac_sonuc", arac_id: b.tool_use_id, basarili: !b.is_error, ozet: ozetle(sonucMetni(b.content)) });
    }
  } else if (m.type === "result") {
    out.push({ ajan, tur: "maliyet", maliyet_usd: m.total_cost_usd ?? 0 });
    if (m.is_error) {
      const mesaj = m.subtype === "success" ? String(m.result ?? "") : [m.subtype, ...(m.errors ?? [])].join(": ");
      out.push(hata(ajan, "claude-api", m.subtype, mesaj, true, "ajana mesaj göndererek yeniden dene"));
    }
    out.push({ ajan, tur: "durum", durum: m.is_error ? "hata" : "bekliyor" });
  } else if (m.type === "system" && m.subtype === "api_retry") {
    out.push(hata(kim, m.error_status == null ? "ag" : "claude-api", "api_retry", `${m.error} (HTTP ${m.error_status ?? "-"}), deneme ${m.attempt}/${m.max_retries}`, true, "SDK kendisi yeniden deniyor; sürerse ağı ve limiti kontrol et"));
  } else if (m.type === "rate_limit_event" && m.rate_limit_info && m.rate_limit_info.status !== "allowed") {
    const r = m.rate_limit_info;
    const sifir = r.resetsAt ? new Date(r.resetsAt * 1000).toISOString() : "bilinmiyor";
    out.push(hata(kim, "claude-api", "rate_limit", `limit ${r.status} (${r.rateLimitType ?? "-"}), sıfırlanma: ${sifir}`, r.status !== "rejected", "limit sıfırlanınca devam et"));
  }
  return out;
}

// ---------- Kesin yasak kapısı (deterministik) ----------
// Metin katmanı ilk katmandır; asıl koruma yeteneğin süreçten kaldırılmasıdır (ortam.ts, KAPI.md "Ortam katmanı").

// Kullanıcı kararı 27.10.2026: genel sır dosyası listesi (.env, *.key, .credentials.json …) ve .tmp/ kaldırıldı.
// Kalan yalnızca panel belirtecini taşıyan dosyalar (token ile panel koruması; okunursa ajan kendi onayını verebilir):
// panel-url.txt, panel-token, zepul-token, zepul-ai anahtarı ve adresi token'lı yazan sunucu günlükleri.
const BELIRTEC_ADI = /^(panel-url\.txt|(panel|zepul)-token(\..+)?|zepul-ai-anahtar(\..+)?|(orkestra|zepul-ai)-sunucu\.log)$/i;
const belirtecYolMu = (p: string) => BELIRTEC_ADI.test(path.posix.basename(p)); // p: / ayırıcılı
const BELIRTEC_KOMUTTA = /(^|[\s"'`/\\=:*])(panel-url\.txt|(panel|zepul)-token(\.[\w-]+)?|zepul-ai-anahtar(\.[\w-]+)?|(orkestra|zepul-ai)-sunucu\.log)(?=$|[\s"'`;|&)>])/i;
const BELIRTEC_ORNEK = ["panel-url.txt", "panel-token", "zepul-token", "zepul-ai-anahtar.txt", "orkestra-sunucu.log", "zepul-ai-sunucu.log"];
const SIRADAN = ["a", "a.txt", "a.json", "a.md", "a.ts", "a.js"];
function belirtecDeseniMi(s: string): boolean {
  const ad = s.replace(/\\/g, "/").split("/").pop() ?? "";
  if (!/[*?[]/.test(ad)) return false;
  let re: RegExp;
  try {
    re = new RegExp("^" + ad.split(/(\[!?[^\]]+\])/).map((p, i) => i % 2 ? p.replace(/^\[!/, "[^")
      : p.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")).join("") + "$", "i");
  } catch { return false; }
  return BELIRTEC_ORNEK.some((x) => re.test(x)) && !SIRADAN.some((x) => re.test(x));
}
const SIL = new Set(["rm", "remove-item", "ri", "rmdir", "rd", "del", "erase"]);
// F3: F1 ortamını değiştiren adlar ve ortamı toptan temizleyen biçimler (KAPI.md ortam sınırı 4). env -i/-u parçada denetlenir.
const ORTAM_EZME = /\b(GIT_CONFIG_(COUNT|KEY_\w*|VALUE_\w*|PARAMETERS)|GIT_ASKPASS|SSH_ASKPASS|GIT_SSH(_COMMAND)?|GIT_TERMINAL_PROMPT|GCM_INTERACTIVE|GH_TOKEN|GITHUB_TOKEN)\b|-UseNewEnvironment\b|\benv:[\\/]*\*/i;
// F3: F1'i ezen (url.*, credential.*, include*, remote.*.push*, remote.*.mirror), push'u gizleyen (alias.*, help.autocorrect)
// ya da kullanıcının oturumunda komut çalıştıran (core.hooksPath, core.fsmonitor) git ayarı. -c, --config-env ve git config ile mutlak yasak.
const TEHLIKELI_AYAR = /^\s*(alias|url|credential|include|includeif)\.|^\s*remote\..+\.(push|mirror)|^\s*(help\.autocorrect|core\.hookspath|core\.fsmonitor)\b/i;
// Bütün çalışma ağacını kapsayan yol belirteci: . ./ .\ :/ *
const TUMU = /^(\.[\\/]?|:[\\/]?|\*|\.[\\/]\*|:[\\/]\*)$/;
const YAZMA = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
const GIT_IC = /(^|\/)\.git\/(config$|hooks\/)/i;

export type Yasak = { yasak: boolean; neden: string; risk: Risk; mutlak: boolean };
const izin: Yasak = { yasak: false, neden: "", risk: "dusuk", mutlak: false };
const yasak = (neden: string, risk: Risk, mutlak = false): Yasak => ({ yasak: true, neden, risk, mutlak });
const ORTAM_YASAK = yasak("F1 ortam katmanını değiştirme (GIT_CONFIG_*, GIT_ASKPASS, GIT_SSH_COMMAND, GH_TOKEN, env -i): onayla bile yapılmaz", "geri-alinamaz", true);
const KIMLIK_YASAK = yasak("kimlik deposuna erişim (git credential, git-credential-*): sır okuma, yalnızca kullanıcı onayıyla", "geri-alinamaz");

export type Lehce = "bash" | "ps";
// av8 B3: iç içe yeniden tarama en çok DERIN kat. Sınırı aşan (DERIN. katta hâlâ boşluk ya da ayırıcı taşıyan) sözcük başlı başına
// şüphelidir: DERIN_ASIM işaret parçası kesin yasakta insana gider (Jev'e tek parça gitmez). Ayrıca kaçış ve tırnakları atılmış
// düz hâli bir kez taranır; içindeki mutlak yasak (git push --force) red alır.
const DERIN = 4, DERIN_ASIM = "\0derinlik";
const yenidenTara = (s: string, derinlik: number): string[][] => derinlik < DERIN ? parcalar(s, derinlik + 1)
  : derinlik === DERIN ? [[DERIN_ASIM], ...parcalar(s.replace(/[\\`'"]/g, ""), DERIN + 1)] : [];
function sozcukle(komut: string, lehce: Lehce, derinlik: number, araliklar?: [number, number][]): string[][] {
  const kacis = lehce === "bash" ? "\\" : "`";
  const ayirici = lehce === "bash" ? /[;&|()`\n]/ : /[;&|()\n]/;
  const out: string[][] = [];
  let parca: string[] = [], soz = "", var_ = false, bas = 0;
  const sozBitir = () => {
    if (var_) {
      parca.push(soz);
      if (/[\s;&|()`{},]/.test(soz)) out.push(...yenidenTara(soz, derinlik), ...(soz.includes("=") ? yenidenTara(soz.slice(soz.indexOf("=") + 1), derinlik) : []));
    }
    soz = ""; var_ = false;
  };
  const parcaBitir = (son: number) => { sozBitir(); if (parca.length) { out.push(parca); araliklar?.push([bas, son]); } parca = []; bas = son + 1; };
  const tirnakIci = (ic: string) => {
    soz += ic; var_ = true;
    if (/[\s;&|()`{},]/.test(ic)) out.push(...yenidenTara(ic, derinlik));
  };
  for (let i = 0; i < komut.length; i++) {
    const c = komut[i];
    if (c === kacis) {
      const s = komut[++i]; // kaçış + satır sonu: satır devamı
      if (s !== undefined && s !== "\n" && s !== "\r") { soz += s; var_ = true; }
    } else if (c === "'") {
      const j = komut.indexOf("'", i + 1);
      const son = j < 0 ? komut.length : j;
      tirnakIci(komut.slice(i + 1, son));
      i = son;
    } else if (c === '"') {
      // bash çift tırnakta \ yalnızca $ ` " \ önünde kaçıştır ("C:\Program Files" bozulmasın); PowerShell'de ` her yerde.
      let ic = "", j = i + 1;
      for (; j < komut.length && komut[j] !== '"'; j++) {
        if (komut[j] === kacis && j + 1 < komut.length && (lehce === "ps" || '$`"\\'.includes(komut[j + 1]))) j++;
        ic += komut[j];
      }
      tirnakIci(ic);
      i = j;
    } else if (ayirici.test(c)) parcaBitir(i);
    else if (/[\s<>{},]/.test(c)) sozBitir();
    else { soz += c; var_ = true; }
  }
  parcaBitir(komut.length);
  return out;
}

// K26: üst düzey liste öğeleri (; && || & ve satır sonuyla ayrılır), ham metin ve sözcük parçalarıyla. Boru, yönlendirme
// (2>&1, &>) ve alt kabuk öğeyi bölmez, öğenin birden çok parçası olur. Tırnak içi yeniden taranmaz (derinlik DERIN + 1).
export type ListeOgesi = { ham: string; parcalar: string[][] };
export function listeOgeleri(komut: string, lehce: Lehce): ListeOgesi[] {
  const ar: [number, number][] = [], out: (ListeOgesi & { bas: number })[] = [];
  sozcukle(komut, lehce, DERIN + 1, ar).forEach((t, k) => {
    const [bas, son] = ar[k], once = out.at(-1), ara = k ? komut.slice(ar[k - 1][1], bas).trim() : ""; // satır sonu trim'de boşalır
    const yonlendirme = ara === "&" && (/[<>]$/.test(komut.slice(0, ar[k - 1][1]).trimEnd()) || komut.slice(bas).trimStart().startsWith(">"));
    if (once && (!/^(;|&&|\|\||&|)$/.test(ara) || yonlendirme)) { once.parcalar.push(t); once.ham = komut.slice(once.bas, son).trim(); }
    else out.push({ bas, ham: komut.slice(bas, son).trim(), parcalar: [t] });
  });
  return out.map(({ ham, parcalar }) => ({ ham, parcalar }));
}

function parcalar(komut: string, derinlik = 0): string[][] {
  const k = komut.replace(/\$\{?IFS\}?/g, " "); // git${IFS}push
  return [...sozcukle(k, "bash", derinlik), ...sozcukle(k, "ps", derinlik)];
}

// Yol ve .exe olmadan komut adı: "C:\…\git.exe" → git, /bin/rm → rm.
const adi = (s: string) => (s.split(/[\\/]/).pop() ?? "").toLowerCase().replace(/\.exe$/, "");

// git uzun seçenek kısaltmalarını kabul eder (--force-w → --force-with-lease, --mirr → --mirror): en az bir harfli önek eşleşir.
// Belirsiz kısa önek (--f) git'te hata verir; burada yine yasak sayılır (güvenli yan).
const onekMi = (s: string, ad: string) => { const a = s.toLowerCase().split("=")[0]; return a.length > 2 && ad.startsWith(a); };

type GitCagri = { alt: string; arg: string[]; ayarlar: string[] };
// Bir parçadaki her git çağrısı: genel seçenekler atlanır, -c ve --config-env değerleri toplanır.
function gitCagrilari(t: string[]): GitCagri[] {
  const out: GitCagri[] = [];
  for (let i = 0; i < t.length; i++) {
    if (adi(t[i]) !== "git") continue;
    const ayarlar: string[] = [];
    let j = i + 1;
    for (; j < t.length && t[j].startsWith("-"); j++) {
      const s = t[j];
      if (s === "-c" || s === "--config-env") ayarlar.push(t[++j] ?? "");
      else if (s.startsWith("--config-env=")) ayarlar.push(s.slice(13));
      else if (/^(-C|--(git-dir|work-tree|namespace|super-prefix|attr-source))$/.test(s)) j++;
    }
    const [alt = "", ...ek] = (t[j] ?? "").trim().split(/\s+/); // Start-Process git -ArgumentList "push -f"
    out.push({ alt: alt.toLowerCase(), arg: [...ek, ...t.slice(j + 1)], ayarlar });
  }
  return out;
}

// Bir parçadaki git çağrılarını denetler. `komut`: ham metin (push'ta ikame aramak için).
function gitYasakMi(t: string[], komut: string): Yasak | null {
  if (t.some((s) => adi(s).startsWith("git-credential"))) return KIMLIK_YASAK;
  for (const { alt, arg, ayarlar } of gitCagrilari(t)) {
    const ayar = ayarlar.find((a) => TEHLIKELI_AYAR.test(a));
    if (ayar !== undefined) return yasak(`git -c ${ayar.split("=")[0].trim()}: ortam katmanını ezer ya da push'u gizler; onayla bile yapılmaz`, "geri-alinamaz", true);
    const uzun = (...adlar: string[]) => arg.some((s) => adlar.some((ad) => onekMi(s, ad)));
    const kisa = (h: string) => arg.some((s) => /^-[^-]/.test(s) && s.includes(h));
    if (alt === "push" || alt === "send-pack") {
      if (uzun("--force", "--force-with-lease", "--force-if-includes", "--mirror") || kisa("f") || arg.some((s) => s.startsWith("+"))) return yasak("zorla push (git push --force): onayla bile yapılmaz", "geri-alinamaz", true);
      if (uzun("--delete", "--prune") || kisa("d") || arg.some((s) => /^:./.test(s))) return yasak("uzak dal silme (git push --delete, :dal, --prune)", "geri-alinamaz");
      if (/[$`]/.test(komut)) return yasak("push'ta ikame ya da değişken ($(…), `…`, ${…}, $DEG): bayrağın değeri bilinemez", "yuksek");
      if (alt === "send-pack") return yasak("git send-pack uzak ayarını ve ortam engelini atlar", "yuksek");
    }
    if (alt.startsWith("credential")) return KIMLIK_YASAK;
    if (alt === "config" && !arg.some((s) => /^(--get(-all|-regexp|-urlmatch)?|-l|--list|get|list)$/i.test(s)) && arg.some((s) => TEHLIKELI_AYAR.test(s))) {
      return yasak("git config ile tehlikeli ayar (alias, url, credential, remote.*.pushurl, …): onayla bile yapılmaz", "geri-alinamaz", true);
    }
    if (alt === "remote" && uzun("--push", "--mirror")) return yasak("git remote --push/--mirror push adresini değiştirir: onayla bile yapılmaz", "geri-alinamaz", true);
    if (alt === "reset" && uzun("--hard", "--merge")) return yasak("git reset --hard/--merge commit'lenmemiş işi siler", "geri-alinamaz");
    if (alt === "clean") return yasak("git clean izlenmeyen dosyaları siler", "geri-alinamaz");
    const tumu = arg.some((s) => TUMU.test(s));
    if (alt === "checkout" && (tumu || kisa("f") || uzun("--force"))) return yasak("git checkout -- . / -f tüm değişiklikleri atar", "geri-alinamaz");
    if (alt === "restore" && tumu && (!(kisa("S") || uzun("--staged")) || kisa("W") || uzun("--worktree"))) return yasak("git restore . çalışma ağacındaki değişiklikleri atar", "geri-alinamaz");
    if (alt === "switch" && (kisa("f") || uzun("--discard-changes", "--force"))) return yasak("git switch --discard-changes yerel değişiklikleri atar", "geri-alinamaz");
    if (alt === "branch" && (kisa("D") || ((kisa("d") || uzun("--delete")) && (kisa("f") || uzun("--force"))))) return yasak("git branch -D birleşmemiş dalı siler", "geri-alinamaz");
    if (alt === "update-ref" && kisa("d")) return yasak("git update-ref -d dal ref'ini ve reflog'unu siler", "geri-alinamaz");
    if (alt === "stash") return yasak("git stash yasak", "orta");
  }
  return null;
}

// Silme hedefi proje dışında mı ya da kökün kendisi mi? Çözülemeyen hedef (değişken, ~, çözülemeyen 8.3 kısa ad) yasak sayılır.
// W1: kanonik yol; Git Bash, \\?\, C$ paylaşımı, kısa ad ve junction yazımı aynı yola çıkar.
// av8 B1: seçenek biçimi (-Recurse, -Path:X, --force=x). Tireyle başlayıp buna uymayan argüman hedeftir.
// av9 B1: "=" değerli biçim (-x=/../..) bayrak sayılmaz, hedeftir: sözcükleyici tırnağı attığı için PowerShell'in tırnaklı
// '-x=/../..' değeri bayraktan ayrılamaz. GNU --opt=değer de hedef sayılır (göreli, proje içi; güvenli yan).
export const BAYRAK = /^--?[A-Za-z][\w-]*(:.*)?$/;
// av8 B2: PowerShell – — ― karakterlerini de parametre öneki sayar (Remove-Item –Recurse).
const tire = (s: string) => s.replace(/^[–—―]/, "-");
// av8 B2: özyineli bayrak. Tek tirelide ":" ya da "=" öncesi adda r/R (-r, -re:$true, -r:1, -Recurse ve tüm önekleri, GNU -dvfr,
// -vRf), çift tirelide --r öneki (--r, --re, --recursive) ya da /s. Belirsiz olan özyineli sayılır: -Force gibi yanlış pozitif
// insana gider (güvenli yön). kapi.ts kopya içi kısa yolu kendi dar desenini kullanır (orada geniş desen kısa yolu gevşetirdi).
// av9 B6: cmd bitişik anahtarları (/s/q, /f/s/q) da /s içerir.
export const ozyineliBayrak = (s: string) => /^-(?!-)[^:=]*r|^--r|^(\/[a-z?]+)*\/s(\/[a-z?]+)*$/i.test(tire(s));

// av9 B6: find -exec'in {} + ; yer tutucuları ve PowerShell @splat hedefi çözülemez.
function projeDisi(hedef: string, kok: string): boolean {
  if (/[$%]|^[~@]|^(\{\}|\+|;)$/.test(hedef) || kisaAdCozulemedi(hedef, kok)) return true;
  const tam = kanonik(hedef, kok), k = kanonik(kok);
  return tam === k || !altinda(tam, k);
}

function parcaYasakMi(t: string[], komut: string, kok: string): Yasak | null {
  if (t[0] === DERIN_ASIM) return yasak(`iç içe kaçış ya da tırnak ${DERIN} kat sınırını aşıyor: içerik çözülemez`, "yuksek");
  // env -i / -u: F1 ortamını temizler. Yalnızca env'in kendi seçenekleri (komuttan önceki - ve A=b sözcükleri) bakılır.
  for (let e = t.findIndex((s) => adi(s) === "env"), j = e + 1; e >= 0 && j < t.length && (t[j].startsWith("-") || t[j].includes("=")); j++) {
    if (/^(-|-[a-z]*[iu].*|--ignore-env.*|--unset.*)$/i.test(t[j])) return ORTAM_YASAK;
  }
  const g = gitYasakMi(t, komut);
  if (g) return g;
  // av9 B6: cmd bitişik yazımı (rd/s/q, del/f/s/q) komut ve anahtarlara ayrılır.
  t = t.flatMap((s) => { const m = /^(rd|rmdir|del|erase)((\/[^/]+)+)$/i.exec(s); return m ? [m[1], ...m[2].match(/\/[^/]+/g)!] : [s]; });
  // "git rm" git'in işidir, dosya sistemi silmesi sayılmaz.
  const i = t.findIndex((s, j) => SIL.has(adi(s)) && adi(t[j - 1] ?? "") !== "git");
  if (i >= 0) {
    const arg = t.slice(i + 1).map(tire);
    // av9 B6: PowerShell @splat (Remove-Item C:/x @p) bayrakları değişkende taşır; özyineli sayılır.
    const ozyineli = arg.some(ozyineliBayrak) || arg.some((s) => /^@\w/.test(s));
    const dd = arg.indexOf("--");
    // av8 B1: bayrak biçimine uymayan tireli argüman (-x/../.., -x\..) bayrak değil, hedeftir.
    const hedefler = arg.flatMap((s, n) => (dd >= 0 && n > dd ? [s] : n === dd ? [] : !BAYRAK.test(s) ? (/^\/[a-z]$/i.test(s) ? [] : [s])
      : /^-[^:]*:./.test(s) ? [s.slice(s.indexOf(":") + 1)] : []))
      .filter((h) => !/^\$(true|false)$/i.test(h));
    if (ozyineli && (hedefler.length === 0 || hedefler.some((h) => projeDisi(h, kok)))) return yasak("proje dışı ya da kök dizinde özyineli silme", "geri-alinamaz");
  }
  return null;
}

// av9 B4: kesin yasak taramasından önce normal biçim. NFKC (tam genişlik harf, U+00A0 …); U+0085, U+2028, U+2029 verilen
// ayraç (PowerShell boşluk sayar; satır sonu sayan okuyucu için ikinci geçiş); PowerShell'in tırnak saydığı ‘ ’ ‚ ‛ “ ” „ ‟ düz
// tırnağa; tire benzerleri (‐ ‑ ‒ – — ― −) düz tireye.
const AYRAC_BENZERI = new RegExp(`[${String.fromCharCode(0x85, 0x2028, 0x2029)}]`, "g"); // NEL, LS, PS: kaynakta görünmez
const normalle = (s: string, ayrac: string) => s.normalize("NFKC").replace(AYRAC_BENZERI, ayrac)
  .replace(/[\u2018\u2019\u201A\u201B]/g, "'").replace(/[\u201C\u201D\u201E\u201F]/g, '"').replace(/[\u2010-\u2015\u2212]/g, "-");

function belirtecIceren(p: string, kok: string): boolean {
  const k = kanonik(p, kok);
  if (altinda(k, kanonik(kok))) return false;
  // av10 Bulgu 2: okuma da kanonik yolla (sondaki nokta/boşluk, 8.3, Git Bash, / ve \, harf farkı tek çözüme bağlanır).
  try { return fs.readdirSync(k).some((ad) => BELIRTEC_ADI.test(ad)); } catch { return false; }
}

// Mutlak yasak bulunursa hemen döner; yoksa ilk yasak (insan) döner. Düzenli ifadeler ham metinde ve iki lehçede
// kaçışı ve tırnağı çözülmüş metinde aranır (c\at .e\nv → cat .env).
function komutYasakMi(komut: string, kok: string): Yasak {
  const metinler = [komut, komut.replace(/\\([\s\S])/g, "$1"), komut.replace(/`([\s\S])/g, "$1")].map((s, i) => (i ? s.replace(/["']/g, "") : s).replace(/\$\{?IFS\}?/g, " "));
  const var_ = (re: RegExp) => metinler.some((s) => re.test(s));
  if (var_(ORTAM_EZME)) return ORTAM_YASAK;
  const adaylar: Yasak[] = [];
  if (var_(/\b(curl|wget)\b[^|;\n]*\|\s*(sudo\s+)?(ba|z|da)?sh\b/i)) adaylar.push(yasak("internetten indirilen betik doğrudan çalıştırılıyor (curl|sh)", "yuksek"));
  if (var_(/\b(iwr|irm|invoke-webrequest|invoke-restmethod|curl|wget)\b[^|;\n]*\|\s*(iex|invoke-expression)\b/i) ||
      var_(/\b(iex|invoke-expression)\b\s*\(?\s*(\(?\s*new-object\s+net\.webclient|iwr|irm|invoke-webrequest|invoke-restmethod)\b/i) ||
      var_(/\b(ba|z)?sh\b[^|;\n]*(<\(|\$\()\s*(curl|wget)\b/i)) adaylar.push(yasak("internetten indirilen betik doğrudan çalıştırılıyor (iwr|iex)", "yuksek"));
  if (var_(/\bset-executionpolicy\b/i)) adaylar.push(yasak("güvenlik ayarı değişikliği (Set-ExecutionPolicy)", "yuksek"));
  if (var_(/(^|[\s;&|(])(diskpart|format-volume|clear-disk|initialize-disk)\b/i) || var_(/(^|[\s;&|(])format(\.com)?\s+[a-z]:/i)) adaylar.push(yasak("disk biçimlendirme/bölümleme", "geri-alinamaz"));
  if (var_(/(^|[\s;&|(])reg(\.exe)?\s+delete\b/i) || var_(/\bremove-item\b[^;\n]*\bhk(lm|cu|cr|u|cc):/i)) adaylar.push(yasak("kayıt defteri silme (reg delete)", "geri-alinamaz"));
  if (var_(BELIRTEC_KOMUTTA)) adaylar.push(yasak("panel belirteci dosyasına erişim", "yuksek"));
  const pc = parcalar(komut);
  // W1: 8.3 kısa adlı sözcük (ENV~1) gerçek adına çözülür. Çözülemeyen (HEAD~1) sır sayılmaz: komutta yazma mı okuma mı bilinmez.
  if (pc.some((t) => t.some((s) => /~\d/.test(s) && belirtecYolMu(kanonik(s.slice(s.lastIndexOf("=") + 1), kok))))) {
    adaylar.push(yasak("panel belirteci dosyasına kısa adla erişim", "yuksek"));
  }
  if (pc.some((t) => t.some((s) => belirtecDeseniMi(s.slice(s.lastIndexOf("=") + 1))))) adaylar.push(yasak("panel belirteci dosyasına joker desenle erişim", "yuksek"));

  for (const t of pc) {
    const y = parcaYasakMi(t, komut, kok);
    if (y?.mutlak) return y;
    if (y) adaylar.push(y);
  }
  return adaylar[0] ?? izin;
}

// F8 (kabul K7): Jev erişilemezken kabuk komutunun kaba risk sezgisi. Yalnızca kapının Jev hatası dalında kullanılır;
// yanlış pozitif insana gider. Ağ istemcisi her biçimde riskli sayılır (GET de URL'de veri taşıyabilir).
const RISKLI_AD = new Set([...SIL, "curl", "wget", "iwr", "irm", "invoke-webrequest", "invoke-restmethod", "winget", "choco", "scoop",
  "reg", "sc", "schtasks", "setx", "netsh", "bcdedit", "shutdown", "taskkill", "stop-process", "kill", "crontab", "systemctl",
  "register-scheduledtask", "new-service", "set-service", "stop-service", "start-service", "restart-service", "remove-service",
  "restart-computer", "stop-computer", "set-itemproperty", "new-itemproperty", "remove-itemproperty", "install-module", "install-package"]);
const BETIK_AG = /\b(fetch\s*\(|https?\.(request|get)\b|http\.request|net\.connect|require\s*\(\s*['"](https?|net|child_process)['"]|urllib|requests|http\.client|socket)/i;
const BETIK_CAGRI = /\b(node|deno)\b[^\n]*(\s-e\b|\s--eval\b|\beval\b)|\b(python3?|py)\b[^\n]*\s-c\b/i;
const PS_AG = /net\.webclient|start-bitstransfer|\b(iex|invoke-expression)\b/i;
const PAKET = new Set(["npm", "pnpm", "yarn", "bun", "pip", "pip3", "gem", "cargo"]);
export function riskliKabukMu(komut: string): boolean {
  if ((BETIK_CAGRI.test(komut) && BETIK_AG.test(komut)) || PS_AG.test(komut)) return true;
  return parcalar(komut).some((t) =>
    gitCagrilari(t).some((g) => g.alt === "push" || g.alt === "send-pack") ||
    t.some((s, i) => (RISKLI_AD.has(adi(s)) && adi(t[i - 1] ?? "") !== "git") || // git rm yerel ve geri alınabilir
      (PAKET.has(adi(s)) && /^(i|install|add|ci|update|up|upgrade)$/i.test(t[i + 1] ?? ""))));
}

// F2 (kabul K1): string `command` alanı taşıyan her araç kabuktur (Bash, PowerShell, Monitor, …).
// Adla liste tutmak, kabuk çalıştıran her yeni aracı kapının dışında bırakırdı.
export function kabukKomutu(girdi: unknown): string | null {
  const c = (girdi as { command?: unknown } | null | undefined)?.command;
  return typeof c === "string" ? c : null;
}

// av11 şef kararı (Bulgu 3): WebFetch/WebSearch url'si. http(s) dışı şema (file:, data:, javascript: …), çözülemeyen adres,
// localhost ve *.localhost, 0/8, 127/8, 10/8, 172.16/12, 192.168/16, 169.254/16, :: önekli IPv6 (::1, ::, ::ffff: eşlemeli),
// fc00::/7, fe80::/10 ve noktalı ondalık dışında yazılmış IPv4 (2130706433, 0x7f000001, 0177.0.0.1, 127.1) red. Bu metin
// denetimi hızlı yoldur (WHATWG URL sayısal yazımları noktalı biçime çevirir; ham yazımla karşılaştırılır). Geçen ad kapıda DNS ile
// ayrıca çözülür (kapi.ts adCozumKarari: 127.0.0.1.nip.io). Dönüş: neden ya da null.
export function yerelAdresMi(url: string): string | null {
  let u: URL;
  try { u = new URL(url.trim()); } catch { return "çözülemeyen adres"; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return `${u.protocol} şeması`;
  const ad = u.hostname.toLowerCase().replace(/\.+$/, "");
  if (ad === "localhost" || ad.endsWith(".localhost")) return "localhost";
  if (ad.startsWith("[")) return ozelIpMi(ad) ? "yerel ya da özel IPv6" : null;
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(ad)) return null;
  const ham = /^[a-z][a-z0-9+.-]*:[\\/]*(?:[^@/?#\\]*@)?([^/?#:\\]*)/i.exec(url.trim())?.[1].toLowerCase().replace(/\.+$/, "");
  if (ham !== ad) return "sayısal IP yazımı (ondalık, sekizlik, onaltılık ya da kısa)";
  return ozelIpMi(ad) ? "yerel ya da özel ağ adresi" : null;
}

// av11: IP (noktalı IPv4 ya da köşeli/çıplak IPv6) yerel ya da özel aralıkta mı? DNS yanıtı da buradan geçer. IPv6 WHATWG ile
// kısa biçime getirilir (0:0:…:1 → ::1, ::ffff:127.0.0.1 → ::ffff:7f00:1). Ayrıştırılamayan adres özel sayılır (kapalı kapı).
export function ozelIpMi(ip: string): boolean {
  let ad: string;
  try { ad = new URL(`http://${ip.includes(":") && !ip.startsWith("[") ? `[${ip}]` : ip}/`).hostname.toLowerCase(); } catch { return true; }
  if (ad.startsWith("[")) return /^::|^f[cd][0-9a-f]{2}:|^fe[89ab][0-9a-f]:/.test(ad.slice(1, -1));
  const m = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(ad);
  if (!m) return true;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 0 || a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}

// Aday 5: süslü parantezin dar güvenli alt kümesi (KAPI.md). Desen yalnız [A-Za-z0-9_.\-/*] ve tek düzey {a,b,...} taşır;
// iç içe parantez, [..], boş alternatif, .., baştaki / ve grup dışında virgül yok; en çok 2 grup, en çok 32 açılım.
// Dönüş: açılımlar ya da null (alt küme dışı ya da parantezsiz). Açılımlar panel belirteci ve proje dışı denetimlerinden ayrı ayrı geçer.
export function susluAc(d: string): string[] | null {
  if (!/^[A-Za-z0-9_.\-/*{},]+$/.test(d) || d.startsWith("/") || d.includes("..")) return null;
  const parca = d.split(/(\{[^{}]*\})/); // tek indisler grup
  const grup = parca.length >> 1;
  if (grup < 1 || grup > 2 || parca.some((p, i) => i % 2 === 0 && /[{},]/.test(p))) return null;
  let acilim = [""];
  for (const [i, p] of parca.entries()) {
    const sec = i % 2 ? p.slice(1, -1).split(",") : [p];
    if (i % 2 && sec.some((x) => x === "" || x.startsWith("/"))) return null;
    acilim = acilim.flatMap((a) => sec.map((x) => a + x));
    if (acilim.length > 32) return null;
  }
  return acilim;
}

// Kesin yasak listesi: yasaksa insan onayına gider, mutlaksa doğrudan reddedilir. `kok`: ajanın proje kökü (rm -rf için).
export function kesinYasakMi(arac: string, girdi: unknown, kok: string = process.cwd()): Yasak {
  const g = (girdi ?? {}) as Record<string, unknown>;
  const komut = kabukKomutu(girdi);
  if (komut !== null) {
    // av9 B4: ham metin ve iki normal biçimi taranır, en sıkı sonuç alınır (mutlak > yasak).
    const ylar = [...new Set([komut, normalle(komut, " "), normalle(komut, "\n")])].map((k) => komutYasakMi(k, kok));
    const y = ylar.find((x) => x.mutlak) ?? ylar.find((x) => x.yasak);
    if (y) return y;
  }
  if ((arac === "WebFetch" || arac === "WebSearch") && typeof g.url === "string") {
    const n = yerelAdresMi(g.url);
    if (n) return yasak(`${arac}: ${n} (yerel ağ ve dosya okunmaz, onay sorulmaz)`, "yuksek", true);
  }
  const arama = arac === "Grep" || arac === "Glob";
  const sir = (neden: string) => yasak(`${neden}: ${arac} (panel belirteci, yalnızca kullanıcı onayıyla)`, "yuksek");
  if (arama && typeof g.path === "string" && belirtecIceren(g.path, kok)) return sir("panel belirteci dosyası içeren proje dışı dizin");
  for (const alan of ["file_path", "notebook_path", "path", "glob", ...(arac === "Glob" ? ["pattern"] : [])]) {
    const ham = g[alan];
    if (typeof ham !== "string") continue;
    // Aday 5: alt kümedeki desen açılır; ham yazım, her açılım ve (virgülden bölen okuyucu için) parantezsiz virgül parçaları ayrı ayrı denetlenir.
    const acilim = alan === "glob" || alan === "pattern" ? susluAc(ham) : null;
    for (const v of acilim ? [ham, ...acilim, ...ham.replace(/[{}]/g, "").split(",")] : [ham]) {
    // W1: ham yazım ve kanonik yol (8.3 kısa ad, Git Bash, \\?\, C$, junction, sondaki nokta, ::$DATA) birlikte denetlenir.
    const y = v.replace(/\\/g, "/");
    // av13 Bulgu 1: desen sondaki /., //, ./ ve a/.. katlanarak da denetlenir (**/.env/. son bileşeni . olup sırrı gizlemesin).
    const k = alan === "glob" || alan === "pattern" ? path.posix.normalize(y).replace(/(.)\/+$/, "$1") : kanonik(v, kok);
    if (belirtecYolMu(y) || belirtecYolMu(k)) return sir("panel belirteci dosyası");
    if (belirtecDeseniMi(y) || belirtecDeseniMi(k)) return sir("panel belirteci deseni (joker)");
    // F3: .git/config'e yazmak git config yasağını, kancaya yazmak kullanıcının oturumunu atlatır (KAPI.md ortam sınırı 2).
    if (YAZMA.has(arac) && (GIT_IC.test(y) || GIT_IC.test(k))) return yasak("git iç ayarı ya da kancası (.git/config, .git/hooks): onayla bile yapılmaz", "geri-alinamaz", true);
    // Var olmayan kısa ad neye işaret edeceği bilinmez: yazma red, okuma insana.
    if (alan !== "glob" && kisaAdCozulemedi(v, kok)) {
      return YAZMA.has(arac) ? yasak("çözülemeyen 8.3 kısa ad (~1) yola yazma: hedef bilinmiyor", "yuksek", true) : yasak("çözülemeyen 8.3 kısa ad (~1): hedef bilinmiyor", "orta");
    }
    }
  }
  // av10 Bulgu 1, 3: ripgrep {a,b} ve [..] seçeneklerini açar, Grep glob'u boşluk ve virgülden bölünür. Kapalı kapı: desen
  // ayrıştırılmaz; parantezli ya da liste biçimli desen yukarıdaki sır denetiminden geçtiyse insana gider. Aday 5 istisnası: Glob pattern'i
  // ve Grep glob'u susluAc alt kümesindeyse (açılımları yukarıda tek tek denetlendi) geçer; path ve type'ta parantez her zaman insana.
  // Grep'te pattern dosya adı değil içerik regex'idir ([a-z]+, \{); yalnızca Glob'da dosya adı desenidir.
  const desenAlani = arac === "Glob" ? "pattern" : "glob";
  const altKume = arama && typeof g[desenAlani] === "string" ? susluAc(g[desenAlani] as string) : null;
  if (arama && ((arac === "Glob" ? ["pattern", "path"] : ["glob", "path", "type"]).some((a) => typeof g[a] === "string" && /[{}[\]]/.test(g[a] as string) && !(a === desenAlani && altKume)) ||
      (typeof g.glob === "string" && (/\s/.test(g.glob) || (g.glob.includes(",") && !(arac === "Grep" && altKume)))))) return yasak(`parantezli ya da liste biçimli desen: ${arac} (belirteç açılımı denetlenmez)`, "yuksek");
  return izin;
}

// ---------- Ön süzgeç (kapının ilk adımı) ----------

// Ajan ve alt ajan modelleri yalnızca tam kimlikle (KURALLAR B); Fable alt ajanda yasak.
export const MODELLER = ["claude-sonnet-5-5", "claude-opus-5-5"] as const;

// Red nedeni ya da null. Yalnızca bus MCP'si; Agent/Task'ta model tam kimlik olmalı (takma ad yardımcı modele kayar, SPIKE bulgu 3).
// Not: SDK'nın Agent aracı model alanında yalnızca takma ad kabul ediyor; bu yüzden işçide Agent fiilen kapalı, alt iş ajan_baslat ile açılır.
export function onSuzgec(rol: string, arac: string, model: unknown): string | null {
  if (arac.startsWith("mcp__") && !arac.startsWith("mcp__bus__")) return "yalnızca bus MCP araçları kullanılabilir";
  if (arac !== "Agent" && arac !== "Task") return null;
  if (rol === "sef") return "şef alt ajan başlatmaz; işçiyi ajan_baslat ile başlat";
  if (/fable/i.test(String(model ?? ""))) return "alt ajanda Fable yasak; model olarak claude-sonnet-5-5 ya da claude-opus-5-5 yaz";
  if (!(MODELLER as readonly unknown[]).includes(model)) return `alt ajan modeli tam kimlikle yazılır (${MODELLER.join(" | ")}); takma ad ya da boş model reddedilir`;
  return null;
}

// ---------- Sahiplik ----------

// Yol, başka bir ajanın sahip olduğu bir desene düşüyor mu? Desen (yol.ts desenEslesir, brif globlarCakisirMi ile aynı):
// tam yol ya da çıplak ad (kendisi ve altı), dizin/**, dizin/* (tek seviye), *.uzanti (kök seviyesi).
// W2: yol ve desen kanonikleştirilir (8.3 kısa ad, Git Bash, \\?\, C$, junction); harf duyarsız.
export function sahiplikIhlaliMi(ajanId: string, yol: string, sahiplik: Map<string, string>, kok: string = process.cwd()): { ihlal: boolean; sahip?: string } {
  for (const [desen, sahip] of sahiplik) {
    if (sahip !== ajanId && desenEslesir(desen, yol, kok)) return { ihlal: true, sahip };
  }
  return { ihlal: false };
}
