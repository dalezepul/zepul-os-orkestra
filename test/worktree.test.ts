import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { adTemizle, worktreeAc, worktreeKapat, dalFarki, birlestir, worktreeListesi, kopyaKaldir, mutasyonKopyasiAc, mutasyonKopyasiSil } from "../sunucu/worktree.ts";
import { mutasyonKopyasiIsle } from "../sunucu/baglama.ts";

const UST = process.env.WORKTREE_TEST_DIZIN || os.tmpdir();
fs.mkdirSync(UST, { recursive: true });
const KOK = fs.mkdtempSync(path.join(UST, "wt-"));
after(() => fs.rmSync(KOK, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, shell: false, windowsHide: true, encoding: "utf8" }).trim();
const temizMi = (d: string) => git(d, "status", "--porcelain", "--untracked-files=all") === "";
const oku = (...p: string[]) => fs.readFileSync(path.join(...p), "utf8");

let sayac = 0;
function depo(): string {
  const d = path.join(KOK, "iş yeri", `depo ${++sayac}`);
  fs.mkdirSync(d, { recursive: true });
  git(d, "init", "-q", "-b", "main");
  for (const [k, v] of [["user.name", "wt-test"], ["user.email", "wt@test.yerel"], ["commit.gpgsign", "false"], ["core.autocrlf", "false"]]) git(d, "config", k, v);
  commitAt(d, "ortak.txt", "bir\niki\nüç\n", "ilk");
  return d;
}
function commitAt(cwd: string, dosya: string, icerik: string, mesaj: string): string {
  fs.mkdirSync(path.dirname(path.join(cwd, dosya)), { recursive: true });
  fs.writeFileSync(path.join(cwd, dosya), icerik);
  git(cwd, "add", "--", dosya);
  git(cwd, "commit", "-q", "-m", mesaj);
  return git(cwd, "rev-parse", "HEAD");
}

test("adTemizle: Türkçe harf, boşluk, uzunluk, boş girdi", () => {
  assert.equal(adTemizle("Çığ Öşü İşçi"), "cig-osu-isci");
  assert.equal(adTemizle("ISIK"), "isik");
  assert.equal(adTemizle("  Brif   yazıcı!! "), "brif-yazici");
  assert.equal(adTemizle("--ağ/../ş--"), "ag-s");
  assert.equal(adTemizle("x".repeat(100)), "x".repeat(40));
  assert.equal(adTemizle("a".repeat(39) + " bcd"), "a".repeat(39), "40. karakter tire ise sondan kırpılır");
  for (const bos of ["", "   ", "!!!", "---", "·"]) assert.throws(() => adTemizle(bos), /geçersiz worktree adı/);
});

test("adTemizle: Windows ayrılmış adlarına -w eklenir (W12)", () => {
  for (const [ad, beklenen] of [["CON", "con-w"], ["nul", "nul-w"], ["Aux", "aux-w"], ["prn!", "prn-w"], ["COM1", "com1-w"], ["lpt9", "lpt9-w"]]) {
    assert.equal(adTemizle(ad), beklenen, ad);
  }
  for (const ad of ["console", "com0", "com10", "nul-x", "lpt"]) assert.equal(adTemizle(ad), ad, "ayrılmış değil");
});

test("worktreeAc: yol ve dal doğru, ana ağaç kirlenmez; aynı ad ya da var olan dal ikinci kez açılamaz", async () => {
  const d = depo();
  const bas = git(d, "rev-parse", "HEAD");
  const w = await worktreeAc(d, "Brif İşçisi");
  assert.deepEqual(w, { yol: path.join(d, ".worktrees", "brif-iscisi"), dal: "is/brif-iscisi", baz_sha: bas });
  assert.equal(git(w.yol, "rev-parse", "--abbrev-ref", "HEAD"), "is/brif-iscisi");
  assert.ok(temizMi(d), ".worktrees/ ana ağaçta izlenmeyen dosya olarak görünmemeli");

  // Boşluklu ve Türkçe karakterli yol porcelain ayrıştırmasında bölünmez.
  git(d, "worktree", "lock", "--reason", "deneme kilidi", w.yol);
  assert.deepEqual(await worktreeListesi(d), [
    { yol: d, dal: "main", sha: bas, kilitli: false },
    { yol: w.yol, dal: "is/brif-iscisi", sha: bas, kilitli: true },
  ]);
  await assert.rejects(worktreeKapat(d, "brif-iscisi", { dalSil: true }), "kilitli worktree kapatılmaz");
  assert.ok(fs.existsSync(w.yol));
  git(d, "worktree", "unlock", w.yol);

  await assert.rejects(worktreeAc(d, "brif işçisi"), /worktree zaten açık/);
  assert.deepEqual(await worktreeKapat(d, "brif-iscisi", { dalSil: false }), { durum: "kapandi" });
  await assert.rejects(worktreeAc(d, "brif-iscisi"), /dal zaten var: is\/brif-iscisi/);
  assert.equal(git(d, "rev-parse", "is/brif-iscisi"), bas, "var olan dal ezilmemeli");

  // baz verilirse o commit'ten açılır.
  const yeni = commitAt(d, "ikinci.txt", "2\n", "ikinci");
  const eski = await worktreeAc(d, "eski", bas);
  assert.equal(eski.baz_sha, bas);
  assert.equal(git(eski.yol, "rev-parse", "HEAD"), bas);
  assert.equal((await worktreeAc(d, "yeni")).baz_sha, yeni);
});

test("dalFarki ve birlestir: worktree'deki commit'ler main'e gelir", async () => {
  const d = depo();
  const w = await worktreeAc(d, "özellik");
  const s1 = commitAt(w.yol, "alt klasör/yeni dosya.txt", "merhaba\n", "feat: yeni dosya");
  const s2 = commitAt(w.yol, "şema.md", "# şema\n", "docs: şema eklendi");
  commitAt(d, "yalniz-main.txt", "m\n", "chore: yalnızca main"); // main...dal: main'in kendi değişikliği listeye girmez

  const f = await dalFarki(d, w.dal);
  assert.deepEqual(f.dosyalar.sort(), ["alt klasör/yeni dosya.txt", "şema.md"]);
  assert.deepEqual(f.commitler, [{ sha: s2, mesaj: "docs: şema eklendi" }, { sha: s1, mesaj: "feat: yeni dosya" }]);

  const b = await birlestir(d, w.dal, "merge: özellik");
  assert.equal(b.durum, "tamam");
  assert.equal(b.sha, git(d, "rev-parse", "HEAD"));
  assert.equal(git(d, "log", "-1", "--format=%s"), "merge: özellik");
  assert.equal(oku(d, "şema.md"), "# şema\n");
  assert.equal(oku(d, "alt klasör", "yeni dosya.txt"), "merhaba\n");
  assert.ok(temizMi(d));
  assert.deepEqual(await dalFarki(d, w.dal), { dosyalar: [], commitler: [] });

  // Merge edilmiş dal dalSil ile silinir; ikinci kapatma 'yok' döner.
  assert.deepEqual(await worktreeKapat(d, "özellik", { dalSil: true }), { durum: "kapandi" });
  assert.ok(!fs.existsSync(w.yol));
  assert.equal(git(d, "branch", "--list", w.dal), "");
  assert.deepEqual(await worktreeKapat(d, "özellik", { dalSil: true }), { durum: "yok" });
});

test("birlestir: çakışmada çakışan dosyalar listelenir, merge --abort ile ana ağaç temiz kalır", async () => {
  const d = depo();
  const a = await worktreeAc(d, "a"), b = await worktreeAc(d, "b");
  const sa = commitAt(a.yol, "ortak.txt", "bir\nA\nüç\n", "a: ikinci satır");
  commitAt(b.yol, "b-ozel.txt", "b\n", "b: özel dosya");
  commitAt(b.yol, "ortak.txt", "bir\nB\nüç\n", "b: ikinci satır");
  const bas = git(d, "rev-parse", "HEAD");

  const r1 = await birlestir(d, a.dal, "merge: a");
  assert.equal(r1.durum, "tamam");
  assert.equal(git(d, "log", "-1", "--format=%P"), `${bas} ${sa}`, "--no-ff: ileri sarılabilse de iki ebeveynli merge commit");
  const sonra = git(d, "rev-parse", "HEAD");

  const r2 = await birlestir(d, b.dal, "merge: b");
  assert.deepEqual(r2, { durum: "cakisma", cakisan: ["ortak.txt"] });
  assert.ok(temizMi(d), "merge --abort ağacı merge öncesine döndürmeli");
  assert.ok(!fs.existsSync(path.join(d, ".git", "MERGE_HEAD")), "yarım merge kalmamalı");
  assert.equal(git(d, "rev-parse", "HEAD"), sonra);
  assert.equal(oku(d, "ortak.txt"), "bir\nA\nüç\n");
  assert.ok(!fs.existsSync(path.join(d, "b-ozel.txt")));

  const yok = await birlestir(d, "is/olmayan", "merge: yok");
  assert.equal(yok.durum, "hata");
  assert.ok(yok.hata);
  assert.ok(temizMi(d));
});

test("birlestir: ana ağaç kirliyken 'kirli-ana' döner, hiçbir şey yapmaz", async () => {
  const d = depo();
  const w = await worktreeAc(d, "k");
  commitAt(w.yol, "k.txt", "k\n", "k");
  const bas = git(d, "rev-parse", "HEAD");

  fs.writeFileSync(path.join(d, "ortak.txt"), "değişti\n");
  assert.deepEqual(await birlestir(d, w.dal, "merge: k"), { durum: "kirli-ana" });
  fs.writeFileSync(path.join(d, "ortak.txt"), "bir\niki\nüç\n");
  fs.writeFileSync(path.join(d, "izlenmeyen.txt"), "?\n");
  assert.deepEqual(await birlestir(d, w.dal, "merge: k"), { durum: "kirli-ana" }, "izlenmeyen dosya da kirlilik sayılır");

  assert.equal(git(d, "rev-parse", "HEAD"), bas);
  assert.ok(!fs.existsSync(path.join(d, "k.txt")));
  assert.equal(oku(d, "izlenmeyen.txt"), "?\n");
});

test("worktreeKapat: kirli worktree kapanmaz, commit'lenmemiş iş yerinde kalır", async () => {
  const d = depo();
  const w = await worktreeAc(d, "kirli iş");
  fs.writeFileSync(path.join(w.yol, "taslak.txt"), "commit'lenmemiş\n");
  assert.deepEqual(await worktreeKapat(d, "kirli iş", { dalSil: true }), { durum: "kirli" });
  assert.equal(oku(w.yol, "taslak.txt"), "commit'lenmemiş\n");

  fs.rmSync(path.join(w.yol, "taslak.txt"));
  fs.writeFileSync(path.join(w.yol, "ortak.txt"), "izlenen dosyada değişiklik\n");
  assert.deepEqual(await worktreeKapat(d, "kirli iş", { dalSil: true }), { durum: "kirli" });
  assert.equal(oku(w.yol, "ortak.txt"), "izlenen dosyada değişiklik\n");

  assert.equal((await worktreeListesi(d)).length, 2);
  assert.equal(git(d, "rev-parse", w.dal), git(w.yol, "rev-parse", "HEAD"), "dal silinmemeli");
});

test("worktreeKapat: dalSil merge edilmemiş dalı silmez (branch -d)", async () => {
  const d = depo();
  const w = await worktreeAc(d, "yarım");
  const sha = commitAt(w.yol, "y.txt", "y\n", "yarım iş");
  assert.deepEqual(await worktreeKapat(d, "yarım", { dalSil: true }), { durum: "kapandi" });
  assert.ok(!fs.existsSync(w.yol));
  assert.equal(git(d, "rev-parse", w.dal), sha, "merge edilmemiş dal ve commit'i yerinde kalmalı");
});

test("kopyaKaldir ve worktreeKapat: junction sökülür, hedefin içeriği yerinde kalır (W3)", async () => {
  // git 2.51 (Windows) --force olmadan da yok sayılan junction'ın içine girip hedefi boşaltıyor (29.09 deneyi).
  const d = depo();
  commitAt(d, ".gitignore", "node_modules/\n", "chore: node_modules yok sayılır");
  const hedef = path.join(KOK, `hedef ${sayac}`);
  fs.mkdirSync(path.join(hedef, "alt"), { recursive: true });
  fs.writeFileSync(path.join(hedef, "alt", "önemli.txt"), "korunacak\n");
  const bagla = (klasor: string) => fs.symlinkSync(hedef, path.join(klasor, "node_modules"), "junction"); // mklink /J ile aynı bağ
  const hedefSaglam = () => assert.equal(oku(hedef, "alt", "önemli.txt"), "korunacak\n", "hedefin içeriği silinmemeli");

  // Temiz kopya (denetçi mutasyon kopyası gibi, repo dışında detached): bağ sökülür, kopya kaldırılır.
  const kopya = path.join(KOK, `kopya ${sayac}`);
  git(d, "worktree", "add", "--detach", kopya, "HEAD");
  bagla(kopya);
  assert.ok(fs.lstatSync(path.join(kopya, "node_modules")).isSymbolicLink(), "lstat junction'ı bağ sayar");
  assert.deepEqual(await kopyaKaldir(kopya, d), { durum: "kaldirildi" });
  assert.ok(!fs.existsSync(kopya));
  hedefSaglam();

  // Kirli kopya: yalnız bağ sökülür, commit'lenmemiş iş yerinde kalır.
  const kirli = path.join(KOK, `kirli kopya ${sayac}`);
  git(d, "worktree", "add", "--detach", kirli, "HEAD");
  fs.mkdirSync(path.join(kirli, "iç"));
  fs.symlinkSync(hedef, path.join(kirli, "iç", "bag"), "junction"); // iç içe bağ da bulunur
  fs.writeFileSync(path.join(kirli, "taslak.txt"), "x\n");
  assert.deepEqual(await kopyaKaldir(kirli, d), { durum: "kirli" });
  assert.ok(!fs.existsSync(path.join(kirli, "iç", "bag")), "bağ sökülmeli");
  assert.equal(oku(kirli, "taslak.txt"), "x\n");
  hedefSaglam();

  // Ana ağaç ya da worktree olmayan yol: hiçbir şeye dokunulmaz.
  bagla(d);
  assert.deepEqual(await kopyaKaldir(d, d), { durum: "yok" });
  assert.deepEqual(await kopyaKaldir(path.join(KOK, "yok"), d), { durum: "yok" });
  assert.ok(fs.lstatSync(path.join(d, "node_modules")).isSymbolicLink(), "ana ağaçtaki bağ yerinde");
  fs.unlinkSync(path.join(d, "node_modules"));

  // worktreeKapat da bağı söker.
  const w = await worktreeAc(d, "bagli");
  bagla(w.yol);
  assert.deepEqual(await worktreeKapat(d, "bagli", { dalSil: false }), { durum: "kapandi" });
  assert.ok(!fs.existsSync(w.yol));
  hedefSaglam();
});

test("kopyaKaldir kopyaKoku ile: kodun açtığı kirli denetçi kopyası --force ile kaldırılır; ana ağaç, işçi worktree'si ve kök dışı kopya korunur (K17)", async () => {
  const d = depo();
  const kok = path.join(KOK, `denetim kökü ${sayac}`);
  // Gerçek mutasyon kopyaları: m1 izlenen dosyayı değiştirir, m2 silmeyi sahneler (canlıdaki ` M` ve `D ` durumları).
  const m1 = path.join(kok, "m1"), m2 = path.join(kok, "m2");
  git(d, "worktree", "add", "--detach", m1, "HEAD");
  git(d, "worktree", "add", "--detach", m2, "HEAD");
  fs.writeFileSync(path.join(m1, "ortak.txt"), "mutasyon\n");
  fs.writeFileSync(path.join(m1, "yeni.txt"), "izlenmeyen\n");
  git(m2, "rm", "-q", "ortak.txt");
  assert.ok(!temizMi(m1) && !temizMi(m2));
  for (const m of [m1, m2]) {
    assert.deepEqual(await kopyaKaldir(m, d, kok), { durum: "kaldirildi" });
    assert.ok(!fs.existsSync(m), "kopya klasörü silinmeli");
  }
  const liste = () => git(d, "worktree", "list", "--porcelain").toLowerCase(); // git Windows'ta da / yazar
  assert.ok(!liste().includes("denetim kökü"), "git worktree list'te kopya kalmamalı");

  // İşçi worktree'si kirli: kök onu kapsasa bile (dallı) --force uygulanmaz.
  const w = await worktreeAc(d, "isci");
  fs.writeFileSync(path.join(w.yol, "taslak.txt"), "iş\n");
  assert.deepEqual(await kopyaKaldir(w.yol, d, path.dirname(w.yol)), { durum: "kirli" });
  assert.equal(oku(w.yol, "taslak.txt"), "iş\n");
  // Ana ağaç: hiçbir zaman.
  fs.writeFileSync(path.join(d, "ana.txt"), "ana\n");
  assert.deepEqual(await kopyaKaldir(d, d, path.dirname(d)), { durum: "yok" });
  assert.equal(oku(d, "ana.txt"), "ana\n");
  // Kök dışındaki kirli kopya: kirli kalır.
  const dis = path.join(KOK, `dış kopya ${sayac}`);
  git(d, "worktree", "add", "--detach", dis, "HEAD");
  fs.writeFileSync(path.join(dis, "x.txt"), "x\n");
  assert.deepEqual(await kopyaKaldir(dis, d, kok), { durum: "kirli" });
  assert.ok(fs.existsSync(path.join(dis, "x.txt")));
});

test("birlestir: dal geçmişindeki bir commit OWNS dışına dokunduysa birleşme reddedilir, gerekçe yazılır (K22)", async () => {
  const d = depo();
  const w = await worktreeAc(d, "geri alinan");
  commitAt(w.yol, "izinli/a.txt", "a\n", "feat: izinli");
  commitAt(w.yol, "dis.txt", "kaçak\n", "chore: OWNS dışı");
  git(w.yol, "rm", "-q", "--", "dis.txt");
  git(w.yol, "commit", "-q", "-m", "revert: OWNS dışı geri alındı");
  const bas = git(d, "rev-parse", "HEAD");
  assert.deepEqual((await dalFarki(d, w.dal)).dosyalar, ["izinli/a.txt"], "net farkta dis.txt yok");

  const r = await birlestir(d, w.dal, "merge: geri alinan", ["izinli/*"]);
  assert.equal(r.durum, "owns-disi");
  assert.match(r.hata ?? "", /dis\.txt/);
  assert.deepEqual(r.yollar, ["dis.txt"], "yalnızca OWNS dışı yol");
  assert.deepEqual(r.commitler?.map((c) => c.mesaj), ["revert: OWNS dışı geri alındı", "chore: OWNS dışı"], "OWNS dışına dokunan commitler, yeniden eskiye (izinli commit yok)");
  assert.ok(r.commitler?.every((c) => /^[0-9a-f]{40}$/.test(c.sha)));
  assert.equal(git(d, "rev-parse", "HEAD"), bas, "main değişmedi");
  assert.ok(temizMi(d));

  assert.equal((await birlestir(d, w.dal, "merge: geri alinan", ["izinli/*", "dis.txt"])).durum, "tamam", "geçmiş OWNS içindeyse birleşir");
});

// av9 şef kararı: denetçi mutasyon kopyasını kabukta değil, kodun iki aracıyla açar ve siler (mutasyon_kopyasi_ac / _sil).
test("mutasyonKopyasiAc: kök altında detached worktree açar, mutlak yol döner; ad ve ref denetlenir (av9)", async () => {
  const d = depo();
  const w = await worktreeAc(d, "isci");
  const sha = commitAt(w.yol, "a.txt", "a\n", "feat: a");
  const kok = path.join(KOK, `mutasyon kökü ${sayac}`);
  const yol = await mutasyonKopyasiAc(d, kok, "m1", w.dal);
  assert.equal(yol, path.join(kok, "m1"));
  assert.ok(path.isAbsolute(yol));
  assert.equal(git(yol, "rev-parse", "HEAD"), sha, "işçinin dalındaki commit");
  assert.equal(git(yol, "rev-parse", "--abbrev-ref", "HEAD"), "HEAD", "detached");
  // av10 Bulgu 4: Windows ayrılmış adları (uzantılı biçimleri de) reddedilir.
  const ayrilmis = ["con", "prn", "aux", "nul", ...[1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap((n) => [`com${n}`, `lpt${n}`]), "nul.txt", "con.x"];
  for (const ad of ["", "M1", "-x", "a/b", "..", "a.b", "a b", "ç", "a".repeat(33), "-", ...ayrilmis]) {
    await assert.rejects(mutasyonKopyasiAc(d, kok, ad, w.dal), /geçersiz kopya adı/, JSON.stringify(ad));
  }
  for (const ref of ["-b", "--orphan", "yok-dal", "HEAD..x", ""]) {
    await assert.rejects(mutasyonKopyasiAc(d, kok, "m2", ref), /ref/, ref);
  }
  await assert.rejects(mutasyonKopyasiAc(d, kok, "m1", w.dal), /zaten var/, "var olan kopyanın üzerine açılmaz");
  assert.deepEqual(fs.readdirSync(kok), ["m1"], "reddedilen çağrılar klasör bırakmaz");
});

test("mutasyonKopyasiSil: kirli kopyayı kaldırır; bağlantıyı söker, hedefine dokunmaz; ana ağaç ve işçi korunur (av9)", async () => {
  const d = depo();
  const w = await worktreeAc(d, "isci");
  const kok = path.join(KOK, `mutasyon kökü ${sayac}`);
  const hedef = path.join(KOK, `hedef ${sayac}`);
  fs.mkdirSync(hedef, { recursive: true });
  fs.writeFileSync(path.join(hedef, "önemli.txt"), "korunacak\n");
  const hedefSaglam = () => assert.equal(oku(hedef, "önemli.txt"), "korunacak\n");

  // Kirli kopya, içinde dışarıyı gösteren junction: bağ sökülür, kopya kalkar.
  const m1 = await mutasyonKopyasiAc(d, kok, "m1", w.dal);
  fs.writeFileSync(path.join(m1, "ortak.txt"), "mutasyon\n");
  fs.symlinkSync(hedef, path.join(m1, "bag"), "junction");
  assert.deepEqual(await mutasyonKopyasiSil(d, kok, "m1"), { durum: "kaldirildi" });
  assert.ok(!fs.existsSync(m1));
  hedefSaglam();
  assert.ok(!git(d, "worktree", "list").includes("mutasyon"), "git listesinde kalmaz");

  // Kopyanın kendisi bağlantı (işçinin worktree'sine ve dışarıya): yalnız bağ silinir.
  fs.symlinkSync(w.yol, path.join(kok, "m2"), "junction");
  fs.symlinkSync(hedef, path.join(kok, "m3"), "junction");
  fs.writeFileSync(path.join(w.yol, "taslak.txt"), "iş\n");
  assert.deepEqual(await mutasyonKopyasiSil(d, kok, "m2"), { durum: "baglanti-silindi" });
  assert.deepEqual(await mutasyonKopyasiSil(d, kok, "m3"), { durum: "baglanti-silindi" });
  assert.ok(!fs.existsSync(path.join(kok, "m2")) && !fs.existsSync(path.join(kok, "m3")));
  assert.equal(oku(w.yol, "taslak.txt"), "iş\n", "işçinin worktree'si yerinde");
  assert.ok(fs.existsSync(w.yol));
  hedefSaglam();

  // Yok, geçersiz ad, worktree olmayan klasör.
  assert.deepEqual(await mutasyonKopyasiSil(d, kok, "m9"), { durum: "yok" });
  await assert.rejects(mutasyonKopyasiSil(d, kok, ".."), /geçersiz kopya adı/);
  fs.mkdirSync(path.join(kok, "duz"));
  fs.writeFileSync(path.join(kok, "duz", "x.txt"), "x\n");
  assert.deepEqual(await mutasyonKopyasiSil(d, kok, "duz"), { durum: "yok" }, "worktree değilse dokunulmaz");
  assert.ok(fs.existsSync(path.join(kok, "duz", "x.txt")));
  assert.ok(fs.existsSync(path.join(d, "ortak.txt")), "ana ağaç yerinde");
});

test("mutasyonKopyasiIsle: ref yoksa işçinin dalı; hata araç hatası olur (av9)", async () => {
  const d = depo();
  const w = await worktreeAc(d, "isci");
  const sha = commitAt(w.yol, "b.txt", "b\n", "feat: b");
  const b = { repo: d, dal: w.dal, kopya_koku: path.join(KOK, `mutasyon kökü ${sayac}`) };
  const ac = await mutasyonKopyasiIsle("ac", { ad: "m1" }, b);
  assert.equal(ac.hata, false);
  assert.equal(ac.metin, path.join(b.kopya_koku, "m1"));
  assert.equal(git(ac.metin, "rev-parse", "HEAD"), sha);
  assert.equal((await mutasyonKopyasiIsle("ac", { ad: "m2", ref: "--orphan" }, b)).hata, true);
  assert.equal((await mutasyonKopyasiIsle("ac", { ad: "../x" }, b)).hata, true);
  const sil = await mutasyonKopyasiIsle("sil", { ad: "m1" }, b);
  assert.deepEqual([sil.hata, fs.existsSync(ac.metin)], [false, false]);
  assert.match(sil.metin, /kaldırıldı/);
  assert.equal((await mutasyonKopyasiIsle("sil", { ad: "m1" }, b)).hata, true, "olmayan kopya");
});
