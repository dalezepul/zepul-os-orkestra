// Panel öz-kontrolü (panel/panel.test.mjs) npm test'e bağlanır: kart sözleşmesi, CSP kuralları ve XSS kaçışı. Çalıştırma: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("panel/panel.test.mjs geçer", () => {
  const cikti = execFileSync(process.execPath, [fileURLToPath(new URL("../panel/panel.test.mjs", import.meta.url))], { encoding: "utf8", windowsHide: true });
  assert.match(cikti, /tüm denetimler geçti/);
});
