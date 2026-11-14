// Sunucu açılış yardımcıları (baglama.ts): port seçimi ve doluluk denetimi (K18), panel adresi dosyası (K23). Çalıştırma: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import path from "node:path";
import os from "node:os";
import { portSec, portDolu, DOLU_PORTLAR, panelUrlDosyasi } from "../sunucu/baglama.ts";

const dinle = (host: string) => new Promise<net.Server>((ok, red) => {
  const s = net.createServer();
  s.once("error", red).listen(0, host, () => ok(s));
});
const kapat = (s: net.Server) => new Promise((ok) => s.close(ok));

test("portDolu: başka süreç 0.0.0.0'da dinlerken port dolu sayılır; kapanınca boş (K18)", async () => {
  const s = await dinle("0.0.0.0");
  const port = (s.address() as net.AddressInfo).port;
  try { assert.equal(await portDolu(port), true, "0.0.0.0'daki dinleyici 127.0.0.1 açılışını engellemeli"); }
  finally { await kapat(s); } // assert düşerse açık dinleyici test sürecini asılı bırakmasın
  assert.equal(await portDolu(port), false);
});

test("portDolu: 127.0.0.1'deki dinleyici de dolu sayılır", async () => {
  const s = await dinle("127.0.0.1");
  const port = (s.address() as net.AddressInfo).port;
  try { assert.equal(await portDolu(port), true); } finally { await kapat(s); }
});

test("portSec: ZEPUL_PORT yoksa 8820; geçerli değer alınır; geçersiz ya da dolu listedeki port hata", () => {
  assert.equal(portSec({}), 8820);
  assert.equal(portSec({ ZEPUL_PORT: "8830" }), 8830);
  for (const p of ["abc", "0", "70000", "88.2", "-1"]) assert.throws(() => portSec({ ZEPUL_PORT: p }), /ZEPUL_PORT/);
  for (const p of [8787, 8793, 11434]) {
    assert.ok(DOLU_PORTLAR.includes(p));
    assert.throws(() => portSec({ ZEPUL_PORT: String(p) }), /dolu/);
  }
});

test("panelUrlDosyasi: test modunda kullanıcının panel-url.txt dosyasına yazılmaz (K23)", () => {
  const LA = path.join("C:", "Kullanici", "AppData", "Local");
  const gercek = path.join(LA, "zepul-os", "panel-url.txt");
  assert.equal(panelUrlDosyasi({ LOCALAPPDATA: LA }), gercek);
  assert.equal(panelUrlDosyasi({}), path.join(os.homedir(), ".zepul-os", "panel-url.txt"));
  const ayar = path.join(os.tmpdir(), "ayar-test");
  assert.equal(panelUrlDosyasi({ LOCALAPPDATA: LA, ZEPUL_TEST: "1", ZEPUL_AYAR_DIZIN: ayar }), path.join(ayar, "panel-url.txt"));
  const t = panelUrlDosyasi({ LOCALAPPDATA: LA, ZEPUL_TEST: "1" });
  assert.notEqual(t, gercek);
  assert.ok(!t.startsWith(path.join(LA, "zepul-os")), t);
});
