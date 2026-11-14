// araclar/ntfy.mjs: test modunda ayrı konu (K12). fetch sahte; ağa hiçbir şey gitmez.
import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-ignore: .mjs modülünün tip bildirimi yok
import { govde, bildir, atlanir } from "../araclar/ntfy.mjs";

test("ZEPUL_NTFY_KONU verilince gövde o konuya gider, yoksa varsayılan konu (K12)", async () => {
  const eski = process.env.ZEPUL_NTFY_KONU, eskiFetch = globalThis.fetch;
  const giden: any[] = [];
  globalThis.fetch = (async (_u: unknown, i: any) => { giden.push(JSON.parse(i.body)); return new Response("{}"); }) as typeof fetch;
  try {
    delete process.env.ZEPUL_NTFY_KONU;
    assert.equal(govde("a: b: c", "m").topic, "ornek_konu");
    process.env.ZEPUL_NTFY_KONU = "zepul_test_k12";
    assert.equal(await bildir("Test: bilgilendirme: ayrı konu", "m"), true);
    assert.equal(giden[0].topic, "zepul_test_k12");
  } finally {
    globalThis.fetch = eskiFetch;
    if (eski === undefined) delete process.env.ZEPUL_NTFY_KONU; else process.env.ZEPUL_NTFY_KONU = eski;
  }
});

test("atlanir: ZEPUL_TEST=1 iken yalnızca ayrı konu verilmemişse atlanır (K12)", () => {
  assert.equal(atlanir({}), false);
  assert.equal(atlanir({ ZEPUL_TEST: "1" }), true);
  assert.equal(atlanir({ ZEPUL_TEST: "1", ZEPUL_NTFY_KONU: "zepul_test_k12" }), false);
});
