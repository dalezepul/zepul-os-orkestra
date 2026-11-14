import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const calistir = (dosya: string, ...arg: string[]) =>
  execFileSync(process.execPath, [fileURLToPath(new URL(`../araclar/${dosya}`, import.meta.url)), ...arg], {
    encoding: "utf8", windowsHide: true, timeout: 60_000, env: { ...process.env, ZEPUL_ARAC_TEST: "1", NODE_TEST_CONTEXT: undefined }, // bu olmadan alt node:test ikili çıktı verir
  });

test("araclar/rapor.test.mjs geçer", () => {
  assert.match(calistir("rapor.test.mjs"), /# fail 0/); // sıfır olmayan çıkış zaten fırlatır
});
test("araclar/ozet.mjs --test geçer", () => {
  assert.match(calistir("ozet.mjs", "--test"), /öz-denetim geçti/);
});
test("araclar/ilerleme.mjs --test geçer", () => {
  assert.match(calistir("ilerleme.mjs", "--test"), /ilerleme testleri geçti/);
});
test("araclar/laya-olc.mjs --test geçer", () => {
  calistir("laya-olc.mjs", "--test");
});
test("araclar/laya-veri.mjs --test geçer", () => {
  calistir("laya-veri.mjs", "--test");
});
test("araclar/komut-merkezi.mjs --test geçer", () => {
  assert.match(calistir("komut-merkezi.mjs", "--test"), /öz-denetim: tamam/);
});
