// Tarama-2 aday 7: bekleyen onaylar ucu, süre dolumunda `sure: true` ve tek ntfy. Sunucu açılmaz. Çalıştırma: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { kapiHookOlustur, kapiBagimliligi, onayListesi, yetki, ZEPUL_AI_UCLARI, type Onaylar } from "../sunucu/baglama.ts";
import type { KapiBagimlilik } from "../sunucu/kapi.ts";

const ORKESTRA = fs.readFileSync(path.join(process.cwd(), "sunucu", "orkestra.ts"), "utf8");

function duzen(onayMs: number) {
  const olaylar: any[] = [], onaylar: Onaylar = new Map(), suresi: string[] = [];
  const cevap = { answers: { risk: { choice: "riskli", confidence: 0.97, probabilities: { riskli: 0.97 } }, dis_etki: { noul: 0.1 } } };
  const temel: KapiBagimlilik = { jevSor: async () => cevap, layaSor: async () => cevap, golgeYaz: () => {}, hataYaz: () => {} };
  const yay = (o: any) => void olaylar.push(o);
  const hook = kapiHookOlustur({ ajan: { id: "isci1", rol: "isci" }, kok: process.cwd(), sahiplik: new Map(), bagimlilik: kapiBagimliligi(yay, temel), yay, onaylar,
    bildir: () => {}, sureDoldu: (a) => void suresi.push(a), onayMs });
  const cagir = (signal = new AbortController().signal) => hook({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "npm install lodash" }, session_id: "s", transcript_path: "", cwd: process.cwd() } as any, "t1", { signal });
  return { olaylar, onaylar, suresi, cagir };
}

test("GET /api/onaylar listesi: onay_id, ajan, arac, ozet, bitis; karar verilince listeden düşer", async () => {
  const d = duzen(5000);
  const p = d.cagir();
  await new Promise((r) => setTimeout(r, 20));
  const istek = d.olaylar.find((o) => o.tur === "onay_istek");
  const [k] = onayListesi(d.onaylar);
  assert.equal(k.onay_id, istek.onay_id);
  assert.equal(k.ajan, "isci1");
  assert.equal(k.arac, "Bash");
  assert.equal(k.ozet, istek.girdi_ozet);
  assert.equal(k.risk, istek.risk);
  const kalan = Date.parse(k.bitis!) - Date.now();
  assert.ok(kalan > 4000 && kalan <= 5000, `bitis onay süresinin sonu (${kalan} ms)`);
  d.onaylar.get(k.onay_id)!.bitir("evet");
  await p;
  assert.deepEqual(onayListesi(d.onaylar), []);
  const sonuc = d.olaylar.find((o) => o.tur === "onay_sonuc");
  assert.ok(!("sure" in sonuc), "insan kararında sure alanı yok");
  assert.deepEqual(d.suresi, [], "insan kararında süre ntfy'si yok");
});

test("tarama-3 aday 8: ajan kesilince bekleyen onay 'insan reddetti' değil; onay_sonuc kaynak: iptal, neden 'ajan kesildi'", async () => {
  const d = duzen(5000);
  const ac = new AbortController();
  const p = d.cagir(ac.signal);
  await new Promise((r) => setTimeout(r, 20));
  ac.abort();
  const r: any = await p;
  assert.equal(r.hookSpecificOutput.permissionDecision, "deny");
  assert.match(r.hookSpecificOutput.permissionDecisionReason, /^ajan kesildi: /);
  const sonuc = d.olaylar.filter((o) => o.tur === "onay_sonuc");
  assert.equal(sonuc.length, 1);
  assert.equal(sonuc[0].karar, "hayir");
  assert.equal(sonuc[0].kaynak, "iptal");
  assert.equal(sonuc[0].neden, "ajan kesildi");
  assert.ok(!("sure" in sonuc[0]));
  assert.ok(!d.olaylar.some((o) => o.tur === "kapi" && /insan reddetti/.test(o.neden)), "kapı kaydında insan reddi yok");
  assert.deepEqual(d.suresi, []);
  assert.deepEqual(onayListesi(d.onaylar), [], "kart listeden düşer");
});

test("süre dolunca onay_sonuc { karar: hayir, sure: true } ve tek ntfy (araç adı, girdi yok)", async () => {
  const d = duzen(30);
  const r: any = await d.cagir();
  assert.equal(r.hookSpecificOutput.permissionDecision, "deny");
  const sonuc = d.olaylar.filter((o) => o.tur === "onay_sonuc");
  assert.equal(sonuc.length, 1);
  assert.equal(sonuc[0].karar, "hayir");
  assert.equal(sonuc[0].sure, true);
  assert.deepEqual(d.suresi, ["Bash"], "tek bildirim, araç adıyla");
  const m = ORKESTRA.match(/const sureDoldu = \(arac: string\) => ntfy\("Zepul OS: uyarı: onay süresi doldu, reddedildi", `([^`]*)`\)/);
  assert.ok(m, "orkestra süre ntfy'si başlığı");
  assert.ok(m![1].includes("${arac}") && !/girdi|input/.test(m![1]), "mesaj araç adını içerir, girdiyi içermez");
});

test("uç yalnız panel token'ıyla: zepul-ai anahtarına kapalı (kartları olaydan alır); orkestra ucu ve ilk ntfy metni", () => {
  const panel = Buffer.from("p".repeat(24)), zai = Buffer.from("z".repeat(32));
  assert.equal(ZEPUL_AI_UCLARI.has("GET /api/onaylar"), false);
  assert.equal(yetki("GET /api/onaylar", ["z".repeat(32)], panel, zai), 403);
  assert.equal(yetki("GET /api/onaylar", ["p".repeat(24)], panel, zai), "panel");
  assert.equal(yetki("GET /api/onaylar", [], panel, zai), 401);
  assert.match(ORKESTRA, /if \(uc === "GET \/api\/onaylar"\) return json\(res, 200, onayListesi\(onaylar\)\);/);
  assert.equal(ORKESTRA.match(/için yaklaşık 10 dk içinde/g)?.length, 2, "ilk onay ntfy'si (normal ve kesin) süreyi söyler");
  assert.equal(ORKESTRA.match(/bildir, sureDoldu,/g)?.length, 2, "kapı ve ikinci görüş kancası süre ntfy'sine bağlı");
});
