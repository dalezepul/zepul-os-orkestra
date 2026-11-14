// hata-avi-12 Bulgu 1: ~ ev dizinine açılır. Sahte ev dizini (USERPROFILE, HOME) bu süreçte kurulur; gerçek ev dizini okunmaz.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const EV = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "av12-ev-")));
process.env.USERPROFILE = EV;
process.env.HOME = EV;
fs.mkdirSync(path.join(EV, "AppData", "Local", "zepul-os"), { recursive: true });
fs.writeFileSync(path.join(EV, "AppData", "Local", "zepul-os", "panel-url.txt"), "http://127.0.0.1:1/?t=sahte\n");
after(() => fs.rmSync(EV, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));

const { kanonik } = await import("../sunucu/yol.ts");
const { kapiKarari } = await import("../sunucu/kapi.ts");

test("kanonik: ~, ~/ ve ~\\ ev dizinine açılır (av12)", () => {
  assert.equal(os.homedir(), EV);
  const ev = EV.replace(/\\/g, "/").toLowerCase();
  assert.equal(kanonik("~"), ev);
  assert.equal(kanonik("~/a/b.txt"), ev + "/a/b.txt");
  assert.equal(kanonik("~\\a\\b.txt"), ev + "/a/b.txt");
  assert.notEqual(kanonik("a/~/b"), ev + "/b", "ortadaki ~ açılmaz");
});

test("kapı: ev dizinindeki panel token dizinine Grep ve Glob kesin onaya gider (av12, 04.10)", async () => {
  const d = { jevSor: async () => { throw new Error("Jev'e sorulmamalı"); }, layaSor: async () => { throw new Error("yok"); }, golgeYaz: () => {}, hataYaz: () => {} } as any;
  for (const [arac, girdi] of [["Grep", { pattern: "t=", path: "~/AppData/Local/zepul-os" }], ["Glob", { pattern: "*", path: "~/AppData/Local/zepul-os" }],
    ["Grep", { pattern: "t=", path: "~\\AppData\\Local\\zepul-os" }]] as const) {
    const k = await kapiKarari({ rol: "isci", ajan: "isci-isci1", arac, girdi, sahiplik: new Map(), kok: process.cwd() } as any, d);
    assert.deepEqual([k.karar, k.kesin], ["insan", true], `${arac} ${JSON.stringify(girdi)}: ${k.neden}`);
  }
});
