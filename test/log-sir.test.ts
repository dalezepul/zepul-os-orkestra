// Günlük dosyasına token sızmasın: TTY olmayan çıktıda panel adresi maskelenir, günlükler sır listesindedir.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { kapiKarari, type KapiBagimlilik, type KapiGirdi } from "../sunucu/kapi.ts";

const KOK = path.join(import.meta.dirname, "..");

test("orkestra.ts: TTY olmayan çıktıda panel adresi token'sız yazılır", () => {
  const k = fs.readFileSync(path.join(KOK, "sunucu", "orkestra.ts"), "utf8");
  assert.doesNotMatch(k, /console\.log\(`Panel: \$\{panelUrl\}`\)/, "adres doğrudan yazılmamalı");
  assert.match(k, /process\.stdout\.isTTY \? panelUrl : /, "TTY denetimi");
  assert.match(k, /\?t=\*\*\*/, "maskeli adres");
});

test(".gitignore: logs/*.log git dışında", () => {
  assert.match(fs.readFileSync(path.join(KOK, ".gitignore"), "utf8"), /^logs\/\*\.log$/m);
});

test("sır listesi: orkestra-sunucu.log ve zepul-ai-sunucu.log okunamaz", async () => {
  const guvenli = { answers: { risk: { type: "choice", choice: "guvenli", confidence: 0.95, probabilities: { guvenli: 0.95 } }, dis_etki: { type: "noul", noul: 0.1 } } };
  const d: KapiBagimlilik = { jevSor: async () => guvenli, layaSor: async () => guvenli, golgeYaz: () => {}, hataYaz: () => {}, simdi: () => 1000, dnsCoz: async () => ["203.0.113.7"] } as KapiBagimlilik;
  const g = (arac: string, girdi: unknown): KapiGirdi => ({ rol: "isci", ajan: "kapi", arac, girdi, sahiplik: new Map(), kok: KOK });
  assert.equal((await kapiKarari(g("Read", { file_path: "logs/diger.log" }), d)).karar, "izin", "kontrol: sıradan günlük izinli");
  for (const ad of ["orkestra-sunucu.log", "zepul-ai-sunucu.log"]) {
    for (const [arac, gi] of [["Read", { file_path: `logs/${ad}` }], ["Bash", { command: `cat logs/${ad}` }]] as const) {
      const k = await kapiKarari(g(arac, gi), d);
      assert.ok(["red", "insan"].includes(k.karar), `${arac} ${ad}: ${k.neden}`);
    }
  }
});
