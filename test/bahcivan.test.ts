import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  girdiNormalize, tekrarAdaylari, skillKarariGovdesi, skillKarariniOku, skillAdi, taslakMetni, taslakYolu, etkinYolu,
  taslakYaz, taslakOnayla, skillleriListele, skillSecimGovdesi, skillSeciminiOku, type IzOlay, type Aday, type SkillOzeti,
} from "../sunucu/bahcivan.ts";

const REPO = fileURLToPath(new URL("..", import.meta.url));
const KOK = fs.mkdtempSync(path.join(process.env.BAHCIVAN_TEST_DIZIN || os.tmpdir(), "bahcivan-"));
after(() => fs.rmSync(KOK, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));
const KULLANICI = os.userInfo().username;

// Bir işin araç olayları: [araç, girdi] çiftleri, ts sırayla artar.
let saat = Date.parse("2026-09-01T10:00:00Z");
const is = (ajan: string, adimlar: [string, object][]): IzOlay[] =>
  adimlar.map(([arac, girdi]) => ({ ts: (saat += 1000), ajan, tur: "arac", arac, girdi_ozet: JSON.stringify(girdi) }));
// Aynı 4 adımlık iş; dosya adı, commit mesajı ve sha her seferinde farklı.
const dortAdim = (n: number): [string, object][] => [
  ["Read", { file_path: `C:\\Users\\${KULLANICI}\\Desktop\\proje\\sunucu\\modul${n}.ts` }],
  ["Edit", { file_path: `C:\\Users\\${KULLANICI}\\Desktop\\proje\\sunucu\\modul${n}.ts`, old_string: `a${n}`, new_string: `b${n}` }],
  ["Bash", { command: "npm test", description: `test ${n}` }],
  ["Bash", { command: `git commit -m "feat: değişiklik ${n}" && git show ${n}a3f9c2e1d`, description: "commit" }],
];

test("girdiNormalize: sha, rakam, zaman damgası, yol, tırnak", () => {
  assert.equal(girdiNormalize("git show 3f9a2c1d8e && git diff a1b2c3d..HEAD"), "git show <sha> && git diff <sha>..HEAD");
  assert.equal(girdiNormalize("sleep 30 && echo 2026-09-29T13:27:04.206Z"), "sleep <n> && echo <zaman>");
  assert.equal(girdiNormalize("git log -n 15 --since 2026-09-01"), "git log -n <n> --since <zaman>");
  assert.equal(girdiNormalize(`cat C:\\Users\\${KULLANICI}\\Desktop\\proje\\sunucu\\kapi.ts`), "cat *.ts");
  assert.equal(girdiNormalize('node --import tsx --test "test/*.test.ts"'), "node --import tsx --test *.ts");
  assert.equal(girdiNormalize(`ls C:\\Users\\${KULLANICI}\\AppData\\Local\\Temp\\claude\\x`), "ls <gecici>");
  assert.equal(girdiNormalize("ls /tmp/abc/def"), "ls <gecici>");
  assert.equal(girdiNormalize("cd sunucu/alt && ls"), "cd <yol> && ls");
  assert.equal(girdiNormalize(`git commit -m "feat: yeni şey"   -m 'Co-Authored-By: X'`), "git commit -m <m> -m <m>");
  assert.equal(girdiNormalize("ffmpeg -i video.mp4 kare-12.png"), "ffmpeg -i *.mp4 *.png");
  // İki farklı yazım aynı adıma iner.
  assert.equal(girdiNormalize('git commit -m "a" && git show 1234abcd'), girdiNormalize('git commit -m "b c" && git show 9f8e7d6c5b'));
});

test("tekrarAdaylari: 3 farklı işte aynı 4 adımlık dizi → 1 aday", () => {
  const olaylar = [...is("i1", dortAdim(1)), ...is("i2", dortAdim(2)), ...is("i3", dortAdim(3))];
  const a = tekrarAdaylari(olaylar);
  assert.equal(a.length, 1, JSON.stringify(a, null, 1));
  assert.equal(a[0].tur, "dizi");
  assert.equal(a[0].farkli_is, 3);
  assert.equal(a[0].ornek_sayisi, 3);
  assert.deepEqual(a[0].adimlar, ["Read *.ts", "Edit *.ts", "Bash npm test", "Bash git commit -m <m> && git show <sha>"]);
  assert.ok(a[0].ilk_ts < a[0].son_ts);
  assert.match(a[0].kimlik, /^dizi-[0-9a-f]{10}$/);
});

test("tekrarAdaylari: aynı işte 3 tekrar sayılmaz → aday yok", () => {
  const olaylar = is("tek", [...dortAdim(1), ...dortAdim(2), ...dortAdim(3)]);
  assert.deepEqual(tekrarAdaylari(olaylar), []);
  // oturum alanı ajandan önce gelir: aynı ajan iki oturumda → iki farklı iş.
  const iki = [...is("ajan", dortAdim(1)).map((o) => ({ ...o, oturum: "s1" })), ...is("ajan", dortAdim(2)).map((o) => ({ ...o, oturum: "s2" }))];
  assert.equal(tekrarAdaylari(iki).length, 1);
});

test("tekrarAdaylari: birbirini kapsayan dizilerden yalnız en uzunu", () => {
  const bes = (n: number): [string, object][] => [...dortAdim(n), ["mcp__bus__sozlesme_don", { verdict: "TAMAM", ozet: `iş ${n}` }]];
  const a = tekrarAdaylari([...is("k1", bes(1)), ...is("k2", bes(2))]);
  assert.equal(a.length, 1, JSON.stringify(a.map((x) => x.adimlar), null, 1));
  assert.equal(a[0].adimlar!.length, 5);
  assert.equal(a[0].adimlar!.at(-1), "mcp__bus__sozlesme_don");
});

test("tekrarAdaylari: görev metinleri Jaccard kümesi", () => {
  const t = (ajan: string, gorev: string): IzOlay => ({ ts: (saat += 1000), ajan, tur: "durum", gorev });
  const olaylar: IzOlay[] = [
    t("g1", "panel arayüzüne yeni düğme ekle, testini yaz ve commit et"),
    t("g2", "panel arayüzüne yeni sekme ekle, testini yaz ve commit et"),
    { ts: (saat += 1000), ajan: "g3", tur: "sozlesme", ozet: "panel arayüzüne yeni filtre ekle, testini yaz ve commit et" },
    t("g4", "KURALLAR dosyasındaki tekrar eden satırları buda"),
    { ts: (saat += 1000), ajan: "g5", tur: "arac_sonuc", ozet: "panel arayüzüne yeni düğme ekle, testini yaz ve commit et" }, // araç sonucu görev sayılmaz
  ];
  const a = tekrarAdaylari(olaylar);
  assert.equal(a.length, 1, JSON.stringify(a, null, 1));
  assert.equal(a[0].tur, "gorev");
  assert.equal(a[0].farkli_is, 3);
  assert.equal(a[0].gorev_ornekleri!.length, 3);
  assert.ok(!a[0].gorev_ornekleri!.some((x) => x.includes("KURALLAR")));
});

test("tekrarAdaylari: eşik 3 iken 2 örnek → aday yok; sıralama örnek sayısına göre", () => {
  const iki = [...is("e1", dortAdim(1)), ...is("e2", dortAdim(2))];
  assert.deepEqual(tekrarAdaylari(iki, { esik: 3 }), []);
  assert.equal(tekrarAdaylari(iki).length, 1);
  const baska = (n: number): [string, object][] => [["Glob", { pattern: "**/*.md", path: "docs" }], ["Read", { file_path: `docs/b${n}.md` }], ["Write", { file_path: `docs/c${n}.md`, content: "x" }]];
  const a = tekrarAdaylari([...iki, ...is("e3", dortAdim(3)), ...is("b1", baska(1)), ...is("b2", baska(2))]);
  assert.deepEqual(a.map((x) => x.ornek_sayisi), [3, 2]);
});

const ADAY: Aday = {
  kimlik: "gorev-0123456789", tur: "gorev", ornek_sayisi: 3, farkli_is: 3, ilk_ts: Date.parse("2026-09-01"), son_ts: Date.parse("2026-09-29"),
  gorev_ornekleri: [
    `Panel arayüzüne düğme ekle; anahtar sk-abcdef1234567890XYZ, bildirim filo@lojistik-a.com.tr adresine, dosya C:\\Users\\${KULLANICI}\\Desktop\\proje\\panel.ts`,
    "Panel arayüzüne başka düğme ekle",
  ],
};
const DIZI: Aday = {
  kimlik: "dizi-abcdef0123", tur: "dizi", ornek_sayisi: 4, farkli_is: 3, ilk_ts: Date.parse("2026-09-01"), son_ts: Date.parse("2026-09-29"),
  adimlar: ["Read *.ts", "Edit *.ts", "Bash npm test", "mcp__bus__sozlesme_don"],
};
const kisiselYok = (s: string) => { // 27.10.2026: sır kalıbı (sk-) artık maskelenmez; e-posta ve kullanıcı yolu maskelenir
  assert.ok(!s.includes("filo@lojistik-a"), "e-posta sızdı");
  assert.ok(!new RegExp(`users[\\\\/]+${KULLANICI}`, "i").test(s), "kullanıcı yolu sızdı");
};

test("skillKarariGovdesi: sorular, ölçütler ve maskeli state", () => {
  const g = skillKarariGovdesi(ADAY) as any;
  assert.equal(g.questions.karar.type, "choice");
  assert.deepEqual(Object.keys(g.questions.karar.criteria).sort(), ["kural", "skill", "tek-seferlik"]);
  assert.ok(Object.values(g.questions.karar.criteria).every((x) => typeof x === "string" && x.length > 20));
  assert.equal(g.questions.genel.type, "noul");
  assert.match(g.questions.genel.instructions, /başka projelerde/);
  assert.match(g.state, /3 örnek, 3 farklı iş, 2026-09-01 – 2026-09-29/);
  kisiselYok(g.state);
  assert.match((skillKarariGovdesi(DIZI) as any).state, /1\. Read \*\.ts\n2\. Edit \*\.ts/);
});

test("skillKarariniOku: yüksek güven, düşük güven → belirsiz, bozuk yanıt → belirsiz", () => {
  const y = (choice: unknown, confidence: unknown, noul?: unknown) => ({ answers: { karar: { type: "choice", choice, confidence }, genel: { type: "noul", noul } } });
  assert.deepEqual(skillKarariniOku(y("skill", 0.92, 0.7)), { karar: "skill", guven: 0.92, genel: 0.7 });
  assert.deepEqual(skillKarariniOku(y("kural", 0.8)), { karar: "kural", guven: 0.8, genel: null });
  assert.deepEqual(skillKarariniOku(y("tek-seferlik", 0.6, 0.2)), { karar: "belirsiz", guven: 0.6, genel: 0.2 });
  assert.equal(skillKarariniOku(y("baska", 0.99)).karar, "belirsiz");
  assert.equal(skillKarariniOku(y("skill", "yok")).karar, "belirsiz");
  for (const bozuk of [null, undefined, {}, { answers: {} }, "metin", { answers: { karar: null } }]) {
    assert.deepEqual(skillKarariniOku(bozuk), { karar: "belirsiz", guven: 0, genel: null });
  }
});

test("skillAdi: kebab-case, ASCII, en çok 40 karakter", () => {
  assert.equal(skillAdi(DIZI), "read-ts-edit-bash-npm-test-sozlesme-don");
  const g = skillAdi(ADAY);
  assert.match(g, /^[a-z0-9]+(-[a-z0-9]+)*$/);
  assert.ok(g.length <= 40 && g.startsWith("panel-arayuzune-dugme-ekle"), g);
  assert.equal(skillAdi({ ...DIZI, adimlar: ["<m>"] }), "skill-cdef0123");
});

test("taslakMetni: geçerli frontmatter, bölümler, kişisel bilgi yok", () => {
  for (const a of [DIZI, ADAY]) {
    const t = taslakMetni(a);
    const fm = /^---\nname: (.+)\ndescription: (.+)\nwhen_to_use: (.+)\n---\n/.exec(t);
    assert.ok(fm, t.slice(0, 300));
    assert.equal(fm[1], skillAdi(a));
    assert.ok(JSON.parse(fm[2]).length > 10 && JSON.parse(fm[3]).length > 10);
    for (const b of ["## Ne zaman", "## Adımlar", "## Doğrulama", "## Kaynak"]) assert.ok(t.includes(b), b);
    assert.match(t, /\d tekrar, 3 farklı iş, 2026-09-01 – 2026-09-29/);
    kisiselYok(t);
  }
  const d = taslakMetni(DIZI);
  assert.match(d, /1\. `\*\.ts` dosyasını oku\.\n2\. `\*\.ts` dosyasını düzenle\.\n3\. Komutu çalıştır: `npm test`\.\n4\. Bus aracını çağır: `sozlesme_don`\./);
  assert.match(d, /Şu komut hatasız bitmeli: `npm test`/);
});

test("taslakYaz üzerine yazmaz (-2); taslakOnayla taşır, hedef varsa hata", async () => {
  const repo = path.join(KOK, "repo");
  const ad = skillAdi(DIZI);
  const y1 = await taslakYaz(repo, DIZI);
  assert.equal(y1, taslakYolu(repo, ad));
  fs.appendFileSync(y1, "\nelle eklenen satır\n");
  const y2 = await taslakYaz(repo, DIZI);
  assert.equal(y2, taslakYolu(repo, `${ad}-2`));
  assert.ok(fs.readFileSync(y1, "utf8").includes("elle eklenen satır"), "ilk taslağın üzerine yazıldı");
  assert.match(fs.readFileSync(y2, "utf8"), new RegExp(`^---\\nname: ${ad}-2\\n`));
  assert.ok(!fs.existsSync(etkinYolu(repo, ad)), "taslak kendiliğinden etkinleşmemeli");

  assert.equal(await taslakOnayla(repo, ad), etkinYolu(repo, ad));
  assert.ok(fs.existsSync(etkinYolu(repo, ad)) && !fs.existsSync(path.dirname(y1)));
  // Etkin ad dolu: yeni taslak o adı almaz.
  assert.equal(await taslakYaz(repo, DIZI), taslakYolu(repo, `${ad}-3`));

  fs.mkdirSync(path.dirname(etkinYolu(repo, `${ad}-2`)), { recursive: true });
  await assert.rejects(taslakOnayla(repo, `${ad}-2`), /zaten var/);
  assert.ok(fs.existsSync(y2), "hata sonrası taslak yerinde kalmalı");
  await assert.rejects(taslakOnayla(repo, "yok-boyle-bir-sey"), /taslak yok/);
  await assert.rejects(taslakOnayla(repo, "../../disari"), /geçersiz/);

  // Onaylanan taslak skill listesinde frontmatter'ıyla görünür.
  const liste = await skillleriListele([repo]);
  const s = liste.find((x) => x.ad === ad);
  assert.ok(s && s.aciklama.includes("Tekrar eden 4 adımlık iş") && s.aciklama.includes("Ne zaman:"), JSON.stringify(liste));
});

test("skillleriListele: gerçek .claude/skills (ntfy-bildir, orkestra-sefi)", async () => {
  const l = await skillleriListele([REPO, path.join(KOK, "olmayan")]);
  for (const ad of ["ntfy-bildir", "orkestra-sefi"]) {
    const s = l.find((x) => x.ad === ad);
    assert.ok(s && s.aciklama.length > 30, `${ad} bulunamadı: ${JSON.stringify(l)}`);
  }
  assert.match(l.find((x) => x.ad === "orkestra-sefi")!.aciklama, /^Zepul OS orkestrasının/); // tırnaklı YAML dizgesi çözüldü
  assert.match(l.find((x) => x.ad === "ntfy-bildir")!.aciklama, /Ne zaman: Kullanıcıya bir soru/);
});

test("skillSecimGovdesi: skill başına noul sorusu, en çok 20, fazlası kaba elemeyle", () => {
  const az: SkillOzeti[] = [{ ad: "ntfy-bildir", aciklama: "bildirim gönderir" }, { ad: "panel-test", aciklama: "panel düğmelerini test eder" }];
  const g = skillSecimGovdesi("panel arayüzünde bir düğme ekle", az) as any;
  assert.deepEqual(Object.keys(g.questions), ["ntfy-bildir", "panel-test"]);
  assert.equal(g.questions["panel-test"].type, "noul");
  assert.match(g.questions["panel-test"].instructions, /^Bu görev için panel-test gerekli mi\?/);
  assert.match(g.state, /^Görev: panel arayüzünde bir düğme ekle/);

  const cok: SkillOzeti[] = Array.from({ length: 30 }, (_, i) => ({ ad: `ilgisiz-${i}`, aciklama: `video kurgusu ve ses işleme ${i}` }));
  cok.push({ ad: "arayuz-dugme", aciklama: "Panel arayüzüne düğmeler ekler" }, { ad: "webapp-testing", aciklama: "Playwright web app testing" });
  const g2 = skillSecimGovdesi("panel arayüzünde bir düğme ekle ve test et", cok) as any;
  assert.equal(Object.keys(g2.questions).length, 20);
  assert.ok("arayuz-dugme" in g2.questions, "anahtar kelimesi örtüşen skill elemeden geçmeli");
  assert.ok("webapp-testing" in g2.questions, "test / testing önek örtüşmesi sayılmalı");
});

test("skillSeciminiOku: eşik 0,7 ve en çok 5, olasılığa göre sıralı", () => {
  const s: SkillOzeti[] = ["a", "b", "c", "d", "e", "f", "g", "h", "i"].map((ad) => ({ ad, aciklama: "" }));
  const p: Record<string, unknown> = { a: 0.72, b: 0.95, c: 0.69, d: 0.8, e: 0.9, f: 0.85, g: 0.75, h: "0.99", i: null };
  const yanit = { answers: Object.fromEntries(Object.entries(p).map(([k, noul]) => [k, { type: "noul", noul }])) };
  assert.deepEqual(skillSeciminiOku(yanit, s), ["b", "e", "f", "d", "g"]);
  assert.deepEqual(skillSeciminiOku(yanit, s, 0.9), ["b", "e"]);
  assert.deepEqual(skillSeciminiOku(null, s), []);
});
