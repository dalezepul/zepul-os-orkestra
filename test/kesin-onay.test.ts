import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { kapiKarari, type KapiBagimlilik } from "../sunucu/kapi.ts";
import { kapiHookOlustur, kapiBagimliligi, hepsiniOnayla, KULLANICI_ISTEGI_KURALI, KESIN_ETIKET, sefTalimati } from "../sunucu/baglama.ts";

const SIR = fs.mkdtempSync(path.join(os.tmpdir(), "kesin-sir-"));
fs.writeFileSync(path.join(SIR, "panel-url.txt"), "http://127.0.0.1:1/?t=sahte\n");
after(() => fs.rmSync(SIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));

const cevap = (secim: string) => ({ answers: { risk: { type: "choice", choice: secim, confidence: 0.95, probabilities: {} }, dis_etki: { noul: 0.1 } } });
const bag = (laya = "guvenli", ek: Partial<KapiBagimlilik> = {}): KapiBagimlilik =>
  ({ jevSor: async () => cevap("guvenli"), layaSor: async () => cevap(laya), golgeYaz: () => {}, hataYaz: () => {}, ...ek });
const girdi = (arac: string, g: object, kademe: "jev" | "tam" | "kullanici" = "jev") =>
  ({ rol: "sef", ajan: "sef", arac, girdi: g, sahiplik: new Map(), guven: { kademe, alan_otomatik: true } });

test("kesin onay: panel belirteci hedefli Grep/Glob, kimlik deposu ve belirteç içeren dizin red değil, kesin işaretli insan (her kademede)", async () => {
  const ornekler: [string, object][] = [
    ["Grep", { pattern: "t=", path: SIR }],
    ["Grep", { pattern: "=", glob: "panel-url.*" }],
    ["Glob", { pattern: "**/panel-url.txt" }],
    ["Read", { file_path: "panel-url.txt" }],
    ["Bash", { command: "git credential fill" }],
    ["Bash", { command: "git reset --hard HEAD~1" }],
    ["Bash", { command: "git clean -fd" }],
    ["Bash", { command: "rm -rf C:/x" }],
    ["PowerShell", { command: "Set-ExecutionPolicy Bypass" }],
  ];
  for (const kademe of ["jev", "tam", "kullanici"] as const) for (const [arac, g] of ornekler) {
    const k = await kapiKarari(girdi(arac, g, kademe), bag());
    assert.deepEqual([k.karar, k.kesin, !!k.mutlak], ["insan", true, false], `${kademe} ${arac} ${JSON.stringify(g)}: ${k.neden}`);
    assert.doesNotMatch(k.neden, /onay sorulmaz/);
  }
});

test("ASLA: force push ve biçimleri her kademede red, mutlak", async () => {
  for (const kademe of ["jev", "tam", "kullanici"] as const) for (const c of ["git push --force", "git push -f origin main", "git push origin +main", "git push --mirror"]) {
    const k = await kapiKarari(girdi("Bash", { command: c }, kademe), bag());
    assert.deepEqual([k.karar, k.mutlak], ["red", true], `${kademe} ${c}`);
  }
});

const hookKur = (kademe: "jev" | "tam", ek: { bildir?: (a: string, k?: boolean) => void; laya?: string; ntfy?: (b: string, m: string) => void; simdi?: () => number } = {}) => {
  const olaylar: any[] = [], onaylar = new Map<string, any>();
  const yay = (o: any) => olaylar.push(o);
  const hook = kapiHookOlustur({ ajan: { id: "isci1", rol: "isci" }, kok: process.cwd(), sahiplik: new Map(), yay, onaylar, onayMs: 500,
    bagimlilik: kapiBagimliligi(yay, bag(ek.laya), ek.ntfy, ek.simdi), bildir: ek.bildir ?? (() => {}), guven: () => ({ kademe, alan_otomatik: false }) });
  const cagir = (arac: string, g: object) => hook({ hook_event_name: "PreToolUse", tool_name: arac, tool_input: g } as any, "t", { signal: new AbortController().signal });
  return { olaylar, onaylar, cagir };
};

test("kesin kart: onay_tur kesin + etiket, ntfy soru kesin işaretli; toplu onay atlar, tek tek onayla izin alır", async () => {
  const bildirim: [string, boolean | undefined][] = [];
  const { olaylar, onaylar, cagir } = hookKur("tam", { bildir: (a, k) => bildirim.push([a, k]) });
  const bekle = cagir("Grep", { pattern: "t=", path: SIR });
  await new Promise((r) => setTimeout(r, 20));
  const istek = olaylar.find((o) => o.tur === "onay_istek");
  assert.equal(istek.onay_tur, "kesin");
  assert.equal(istek.etiket, KESIN_ETIKET);
  assert.match(KESIN_ETIKET, /Kesin yasak: yalnızca sen onaylarsan/);
  assert.deepEqual(bildirim, [["Grep", true]]);
  assert.deepEqual(hepsiniOnayla(onaylar), { onaylanan: 0, atlanan: 1 });
  [...onaylar.values()][0].bitir("evet");
  const s = await bekle as any;
  assert.equal(s.hookSpecificOutput.permissionDecision, "allow");
  assert.ok(!JSON.stringify(olaylar).includes("t=sahte"), "sırrın değeri olaylara yazılmaz");
});

test("tam güven: Laya riskli/geri-alınamaz derse araç izin alır ama uyari olayı ve ntfy uyarı gider; aynı ajana 10 dk'da bir ntfy", async () => {
  let t = 1_000_000;
  const ntfy: [string, string][] = [];
  const { olaylar, cagir } = hookKur("tam", { laya: "geri-alinamaz", ntfy: (b, m) => ntfy.push([b, m]), simdi: () => t });
  assert.deepEqual(await cagir("Bash", { command: "npm install x" }), {});
  await new Promise((r) => setTimeout(r, 20));
  const u = olaylar.filter((o) => o.tur === "uyari");
  assert.equal(u.length, 1);
  assert.deepEqual([u[0].ajan, u[0].arac, u[0].sinif], ["isci1", "Bash", "geri-alinamaz"]);
  assert.deepEqual(ntfy, [["Zepul OS: uyarı: isci1 riskli işlem yaptı", "Bash: geri alınamaz (tam güven, Laya gölgesi)"]]);
  assert.ok(!ntfy[0][1].includes("npm install"), "ntfy'ye komut ya da yol yazılmaz");
  t += 5 * 60_000;
  await cagir("Bash", { command: "npm install y" });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(olaylar.filter((o) => o.tur === "uyari").length, 2, "panelde toplanır");
  assert.equal(ntfy.length, 1, "10 dk dolmadan ikinci ntfy yok");
  t += 5 * 60_000 + 1;
  await cagir("Bash", { command: "npm install z" });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(ntfy.length, 2);
});

test("tam güven: Laya güvenli derse uyarı yok; jev kademesinde uyarı üretilmez", async () => {
  const a = hookKur("tam", { laya: "guvenli", ntfy: () => assert.fail("ntfy gitmemeli") });
  await a.cagir("Bash", { command: "npm install x" });
  const b = hookKur("jev", { laya: "riskli", ntfy: () => assert.fail("ntfy gitmemeli") });
  await b.cagir("Bash", { command: "npm test" });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal([...a.olaylar, ...b.olaylar].filter((o) => o.tur === "uyari").length, 0);
});

test("orkestra: ntfy kapı bağımlılığına bağlı, kesin kart için ayrı soru başlığı", () => {
  const k = fs.readFileSync(path.join(process.cwd(), "sunucu", "orkestra.ts"), "utf8");
  assert.match(k, /kapiBagimliligi\(yay, undefined, ntfy\)/);
  assert.match(k, /Zepul OS: soru: kesin yasak onayı bekleniyor/);
});

test("şef talimatı: kullanıcının isteği kural gerekçesiyle reddedilmez; insan kararı sorulur; yalnız ASLA ve imkânsız red", () => {
  assert.match(KULLANICI_ISTEGI_KURALI, /kural ya da politika gerekçesiyle reddetme/);
  assert.match(KULLANICI_ISTEGI_KURALI, /zepul_ai_sor/);
  assert.match(KULLANICI_ISTEGI_KURALI, /force push/);
  assert.match(KULLANICI_ISTEGI_KURALI, /teknik olarak imkânsız/);
  assert.match(KULLANICI_ISTEGI_KURALI, /alternatif/);
  assert.match(KULLANICI_ISTEGI_KURALI, /düğme/, "zepul-ai metni onay yerine geçmez");
  assert.ok(sefTalimati(4).split("\n").includes(KULLANICI_ISTEGI_KURALI), "şef talimatında (üretilen metin)");
});
