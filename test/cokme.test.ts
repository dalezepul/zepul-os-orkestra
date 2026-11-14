import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { oncekiOturumuDenetle, sonBolumOku, yetimSonuclari } from "../sunucu/baglama.ts";

const GECICI = fs.mkdtempSync(path.join(os.tmpdir(), "cokme-"));
after(() => fs.rmSync(GECICI, { recursive: true, force: true }));
const ORKESTRA = fs.readFileSync(path.join(process.cwd(), "sunucu", "orkestra.ts"), "utf8");

let n = 0;
const satir = (oturum: string, g: object) => JSON.stringify({ id: `o-${oturum}-${++n}`, ts: new Date().toISOString(), ...g });
const gunluk = (ad: string, satirlar: string[]) => { const d = path.join(GECICI, ad); fs.writeFileSync(d, satirlar.join("\n") + "\n"); return d; };
const duzen = () => { const olaylar: any[] = [], ntfy: string[][] = []; return { olaylar, ntfy, b: { yay: (o: any) => void olaylar.push(o), ntfy: (x: string, y: string) => void ntfy.push([x, y]) } }; };
const ZAI = { ajan: "zepul-ai", kaynak: "zepul-ai" };

test("(a) önceki oturumda kapanis yok: tek uyarı, tek ntfy, askıdaki görev BASARISIZ 'sunucu yeniden başladı'", async () => {
  const d = gunluk("a.jsonl", [
    satir("eski", { ajan: "sunucu", tur: "durum", durum: "kapanis" }),
    satir("onc", { ...ZAI, tur: "gorev_alindi", gorev_id: "g-1", metin: "x" }),
    satir("onc", { ...ZAI, tur: "gorev_alindi", gorev_id: "g-2", metin: "y", gorev_tur: "yetenek" }),
    satir("onc", { ...ZAI, tur: "gorev_alindi", gorev_id: "g-3", metin: "z" }),
    satir("onc", { ...ZAI, tur: "gorev_sonuc", gorev_id: "g-3", verdict: "TAMAM", ozet: "bitti" }),
    "{bozuk satır",
    satir("simdi", { ajan: "sunucu", tur: "bilgi" }), // bu oturumun açılışta yazılmış satırı önceki sayılmaz
  ]);
  const { olaylar, ntfy, b } = duzen();
  const r = await oncekiOturumuDenetle(d, "simdi", b);
  assert.deepEqual(r, { yarim: true, kapatilan: ["g-1", "g-2"] });
  const sonuc = olaylar.filter((o) => o.tur === "gorev_sonuc");
  assert.deepEqual(sonuc, [
    { ...ZAI, tur: "gorev_sonuc", gorev_id: "g-1", verdict: "BASARISIZ", ozet: "sunucu yeniden başladı" },
    { ...ZAI, tur: "gorev_sonuc", gorev_id: "g-2", verdict: "BASARISIZ", ozet: "sunucu yeniden başladı", gorev_tur: "yetenek" },
  ]);
  assert.equal(olaylar.filter((o) => o.tur === "uyari").length, 1, "tek uyarı olayı");
  assert.equal(ntfy.length, 1, "tek ntfy");
  assert.equal(ntfy[0][0], "Zepul OS: uyarı: önceki oturum beklenmedik kapandı");
  assert.ok(!ntfy[0][1].includes("\n"), "mesaj tek satır");
});

test("(b) önceki oturumda kapanis var: hiçbir şey yapılmaz; boş ya da olmayan günlükte de", async () => {
  const d = gunluk("b.jsonl", [
    satir("onc", { ...ZAI, tur: "gorev_alindi", gorev_id: "g-9", metin: "x" }),
    satir("onc", { ajan: "sunucu", tur: "durum", durum: "kapanis", acik_worktreeler: [] }),
  ]);
  for (const dosya of [d, path.join(GECICI, "yok.jsonl")]) {
    const { olaylar, ntfy, b } = duzen();
    assert.deepEqual(await oncekiOturumuDenetle(dosya, "simdi", b), { yarim: false, kapatilan: [] });
    assert.equal(olaylar.length + ntfy.length, 0);
  }
});

test("günlüğün yalnız son bölümü okunur; pencere ortadan başlarsa yarım ilk satır atılır", async () => {
  const d = gunluk("c.jsonl", ["a".repeat(100), '{"x":1}', '{"x":2}']);
  assert.deepEqual(await sonBolumOku(d, 20), ['{"x":1}', '{"x":2}']);
  assert.equal((await sonBolumOku(d)).length, 3);
});

test("orkestra.ts: çökmede ve port dolu çıkışında 2 sn sınırlı ntfy; açılışta önceki oturum denetlenir", () => {
  assert.match(ORKESTRA, /Promise\.race\(\[ntfyGonder\(baslik, mesaj\)\.catch\(\(\) => \{\}\), new Promise\(\(r\) => setTimeout\(r, 2000\)\)\]\)/);
  assert.match(ORKESTRA, /uncaughtException[\s\S]*ntfyBekle\("Zepul OS: hata: sunucu çöktü"[\s\S]*\.then\(\(\) => kapat\(1\)\)/);
  assert.equal(ORKESTRA.match(/ntfyBekle\("Zepul OS: hata: port dolu"/g)?.length, 2, "EADDRINUSE ve portDolu");
  assert.match(ORKESTRA, /await oncekiOturumuDenetle\(path\.join\(REPO, "logs\/olaylar\.jsonl"\), OTURUM, \{ yay: yetimler\.yay/);
});

test("tarama-3 aday 2: açılışta kapatılan görevin sonucu bağlantıdan önce yayılır, ilk zepul-ai akışında bir kez yeniden gönderilir", async () => {
  const d = gunluk("t3.jsonl", [satir("onc", { ...ZAI, tur: "gorev_alindi", gorev_id: "g-y", metin: "x" })]);
  const yayilan: any[] = [];
  const y = yetimSonuclari((g) => { const o = { id: `o-${yayilan.length}`, ...g }; yayilan.push(o); return o; });
  await oncekiOturumuDenetle(d, "simdi", { yay: y.yay, ntfy: () => {} });
  assert.ok(yayilan.some((o) => o.tur === "uyari"), "olaylar yine yayılır");
  const akis: string[] = [];
  y.zepulAiBaglandi((v) => akis.push(v));
  assert.equal(akis.length, 1, "yalnız gorev_sonuc yeniden gönderilir");
  assert.match(akis[0], /^event: olay\ndata: .*\n\n$/);
  const o = JSON.parse(akis[0].split("data: ")[1]);
  assert.deepEqual([o.tur, o.gorev_id, o.verdict, o.ozet], ["gorev_sonuc", "g-y", "BASARISIZ", "sunucu yeniden başladı"]);
  assert.ok(o.id, "yayılan olayın kendisi (kimlikli) gider");
  const ikinci: string[] = [];
  y.zepulAiBaglandi((v) => ikinci.push(v));
  assert.equal(ikinci.length, 0, "bir kez");
  assert.match(ORKESTRA, /if \(kim === "zepul-ai"\) yetimler\.zepulAiBaglandi\(/, "yalnız zepul-ai anahtarlı akışta");
});
