// Claude Code oturum yöneticisi (sunucu/harness.ts): sahte ikiliyle ayrıştırma, olay yayını, durdurma, resume ve cwd reddi.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ccYoneticisi, ccArgumanlari, type CcKayit } from "../sunucu/harness.ts";
import { izinliCwd } from "../sunucu/baglama.ts";
import type { OlayGovde } from "../sunucu/olay.ts";

const KOK = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "zepul-cc-")));
const ALAN = path.join(KOK, "alan");
fs.mkdirSync(ALAN);
process.on("exit", () => fs.rmSync(KOK, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));
const SAHTE = fileURLToPath(new URL("./sahte-claude.mjs", import.meta.url));

function kur(env: NodeJS.ProcessEnv = {}, dosya = path.join(KOK, `kayit-${Math.random()}.jsonl`)) {
  const olaylar: OlayGovde[] = [];
  const y = ccYoneticisi({ kayitDosyasi: dosya, yay: (o) => void olaylar.push(o), komut: [process.execPath, SAHTE],
    cwdDenetle: (c) => izinliCwd(c, path.join(KOK, "repo"), undefined, [ALAN]), env: { ...process.env, ...env } });
  return { y, olaylar, dosya };
}
const bekle = (f: () => boolean, ms = 10_000) => new Promise<void>((ok, red) => {
  const bas = Date.now();
  const t = setInterval(() => { if (f()) { clearInterval(t); ok(); } else if (Date.now() - bas > ms) { clearInterval(t); red(new Error("zaman aşımı")); } }, 20);
});
const durumlar = (o: OlayGovde[], id: string) => o.filter((x) => x.tur === "durum" && x.ajan === id).map((x) => x.durum);

test("argümanlar: stream-json, model, izin; resume ve max-turns yalnız verilince", () => {
  assert.deepEqual(ccArgumanlari({ model: "claude-sonnet-5-5", izin: "plan" }),
    ["-p", "--output-format", "stream-json", "--verbose", "--model", "claude-sonnet-5-5", "--permission-mode", "plan"]);
  assert.deepEqual(ccArgumanlari({ model: "m", izin: "default", sessionId: "s1", azamiTur: 1 }).slice(-4), ["--resume", "s1", "--max-turns", "1"]);
});

test("başlat: akış olaylara çevrilir, istem stdin'den kaçışsız geçer, maliyet ve sonuç satırı", async () => {
  const { y, olaylar, dosya } = kur();
  const istem = `tırnak " ve 'tek' & | $HOME %PATH% \`ters\` satır\nikinci`;
  const k = y.baslat({ cwd: ALAN, istem, model: "sonnet", izin: "acceptEdits" });
  await bekle(() => k.durum === "bekliyor" && !y.calisiyor(k.id));
  assert.equal(k.session_id, "sahte-oturum-1");
  assert.equal(k.model, "claude-sonnet-5-5");
  const benim = olaylar.filter((o) => o.ajan === k.id);
  assert.equal(benim.find((o) => o.tur === "metin")?.metin, `istem: ${istem}`);
  assert.deepEqual(benim.filter((o) => o.tur === "arac").map((o) => o.arac), ["Read"]);
  assert.equal(benim.find((o) => o.tur === "arac_sonuc")?.basarili, true);
  const m = benim.find((o) => o.tur === "maliyet")!;
  assert.equal(m.maliyet_usd, 0.25);
  assert.deepEqual(m.sonuc, { basarili: true, tur: "success", tur_sayisi: 2, sure_ms: 10 });
  assert.deepEqual(durumlar(olaylar, k.id), ["calisiyor", "bekliyor"]);
  assert.ok(olaylar.some((o) => o.tur === "mesaj" && o.kime === k.id && o.metin === istem));
  const son = fs.readFileSync(dosya, "utf8").trim().split("\n").map((s) => JSON.parse(s) as CcKayit).filter((x) => x.id === k.id).at(-1)!;
  assert.equal(son.session_id, "sahte-oturum-1");
  assert.equal(son.pid, null);
});

test("devam: --resume <session_id> ile çalışır, maliyet birikir; çalışırken reddedilir", async () => {
  const { y, olaylar } = kur();
  const k = y.baslat({ cwd: ALAN, istem: "bir", model: "opus", izin: "plan" });
  await bekle(() => !y.calisiyor(k.id) && k.durum === "bekliyor");
  y.devam(k.id, "iki");
  assert.throws(() => y.devam(k.id, "üç"), /çalışıyor/);
  await bekle(() => !y.calisiyor(k.id) && k.durum === "bekliyor");
  assert.equal(k.maliyet_usd, 0.5);
  const metinler = olaylar.filter((o) => o.ajan === k.id && o.tur === "metin").map((o) => o.metin);
  assert.deepEqual(metinler, ["istem: bir", "istem: iki (resume sahte-oturum-1)"]);
  assert.throws(() => y.devam("cc-yok", "x"), /bilinmeyen/);
});

test("durdur: yalnız kendi süreci; durum durdu, sonra sürdürülebilir", async () => {
  const { y, olaylar } = kur({ SAHTE_MOD: "uyu" });
  const k = y.baslat({ cwd: ALAN, istem: "uzun iş", model: "sonnet", izin: "default" });
  await bekle(() => k.session_id !== null);
  const pid = k.pid!;
  assert.ok(pid > 0);
  assert.equal(y.durdur(k.id), true);
  await bekle(() => k.durum === "durdu");
  assert.equal(k.pid, null);
  assert.throws(() => process.kill(pid, 0)); // süreç gerçekten öldü
  assert.equal(y.durdur(k.id), false); // çalışmayan oturum
  assert.deepEqual(durumlar(olaylar, k.id), ["calisiyor", "durdu"]);
});

test("çıkış hatası: stderr hata olayına, durum hata", async () => {
  const { y, olaylar } = kur({ SAHTE_MOD: "cik" });
  const k = y.baslat({ cwd: ALAN, istem: "x", model: "sonnet", izin: "default" });
  await bekle(() => k.durum === "hata");
  const h = olaylar.find((o) => o.ajan === k.id && o.tur === "hata")!;
  assert.match(String(h.mesaj), /çıkış kodu 3: kimlik yok/);
});

test("ret: izinli kök dışı cwd, fable/bilinmeyen model, bypassPermissions, boş istem", () => {
  const { y } = kur();
  const t = { cwd: ALAN, istem: "x", model: "sonnet", izin: "default" };
  assert.throws(() => y.baslat({ ...t, cwd: os.homedir() }), /izinli köklerin dışında/);
  assert.throws(() => y.baslat({ ...t, cwd: path.join(ALAN, "..", "baska") }), /izinli köklerin dışında/);
  assert.throws(() => y.baslat({ ...t, cwd: path.join(ALAN, "yok") }), /klasör değil/);
  assert.throws(() => y.baslat({ ...t, model: "fable" }), /model/);
  assert.throws(() => y.baslat({ ...t, model: "claude-sonnet-5-5" }), /model/);
  assert.throws(() => y.baslat({ ...t, izin: "bypassPermissions" }), /izin modu/);
  assert.throws(() => y.baslat({ ...t, istem: "  " }), /istem/);
  assert.equal(y.liste().length, 0);
});

test("kalıcı kayıt: yeniden açılışta çalışan oturum durdu olur, PID'e dokunulmaz", () => {
  const dosya = path.join(KOK, "eski.jsonl");
  const eski: CcKayit = { id: "cc-eski", session_id: "s9", cwd: ALAN, model: "claude-sonnet-5-5", izin: "default", durum: "calisiyor", pid: 999999,
    baslangic: "", son_olay_ts: "", maliyet_usd: 1, istem_ozet: "" };
  fs.writeFileSync(dosya, JSON.stringify({ ...eski, durum: "bekliyor", pid: null }) + "\nbozuk satır\n" + JSON.stringify(eski) + "\n");
  const { y } = kur({}, dosya);
  assert.deepEqual([y.al("cc-eski")?.durum, y.al("cc-eski")?.pid, y.al("cc-eski")?.session_id], ["durdu", null, "s9"]);
});

const BRIF = { baglam: "kullanıcı panelden başlattı; dosya henüz yok", owns: ["a.txt"], dokunma: [{ yol: "(yok)", sahip: "-" }], once_oku: ["CLAUDE.md"], kabul: "a.txt yazıldı ve commit edildi" };

test("brifli başlatma: şablon metni istem olur; eksik alanlı brif reddedilir", async () => {
  const { y, olaylar } = kur();
  const { baglam: _, ...eksik } = BRIF;
  assert.throws(() => y.baslat({ cwd: ALAN, istem: "a.txt dosyasını yaz ve commit et", model: "sonnet", izin: "plan", brif: eksik }), /brif eksik.*baglam/);
  assert.throws(() => y.baslat({ cwd: ALAN, istem: "kısa", model: "sonnet", izin: "plan", brif: BRIF }), /brif eksik.*gorev/);
  const k = y.baslat({ cwd: ALAN, istem: "a.txt dosyasını yaz ve commit et", model: "sonnet", izin: "plan", brif: BRIF });
  await bekle(() => !y.calisiyor(k.id) && k.durum === "bekliyor");
  const m = String(olaylar.find((o) => o.ajan === k.id && o.tur === "metin")?.metin);
  for (const b of ["## Görev", "## Bağlam", "## OWNS", "## Bitti tanımı (kabul)", "## Dönüş sözleşmesi", "## Kurallar"]) assert.ok(m.includes(b), b);
  assert.equal(k.kabul, BRIF.kabul);
});

test("denetle: ayrı plan modu oturumu, kabule karşı; geçerli JSON denetim olayı, geçersiz JSON hata olayı", async () => {
  const { y, olaylar } = kur();
  const bos = y.baslat({ cwd: ALAN, istem: "brifsiz", model: "sonnet", izin: "plan" });
  await bekle(() => !y.calisiyor(bos.id));
  assert.throws(() => y.denetle(bos.id), /kabul ölçütü yok/);
  const k = y.baslat({ cwd: ALAN, istem: "a.txt dosyasını yaz ve commit et", model: "sonnet", izin: "acceptEdits", brif: BRIF });
  await bekle(() => !y.calisiyor(k.id));
  const d = y.denetle(k.id);
  assert.deepEqual([d.izin, d.model, d.denetler], ["plan", "claude-opus-5-5", k.id]);
  await bekle(() => !y.calisiyor(d.id));
  const ist = String(olaylar.find((o) => o.tur === "mesaj" && o.kime === d.id)?.metin);
  assert.match(ist, /> a\.txt yazıldı ve commit edildi/);
  const den = olaylar.find((o) => o.tur === "denetim")!;
  assert.deepEqual([den.ajan, den.isci, den.verdict], [d.id, k.id, "PASS"]);

  const h = kur({ SAHTE_DENETIM: '{"verdict":"PASS","gerekce":"kısa"}' });
  const k2 = h.y.baslat({ cwd: ALAN, istem: "a.txt dosyasını yaz ve commit et", model: "sonnet", izin: "plan", brif: BRIF });
  await bekle(() => !h.y.calisiyor(k2.id));
  const d2 = h.y.denetle(k2.id);
  await bekle(() => !h.y.calisiyor(d2.id));
  assert.ok(h.olaylar.some((o) => o.tur === "hata" && o.tur_adi === "cc_denetim_gecersiz"));
  assert.ok(!h.olaylar.some((o) => o.tur === "denetim"));
});
