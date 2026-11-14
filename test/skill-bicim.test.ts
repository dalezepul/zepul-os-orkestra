// Skill biçim kapısı (anthropics/skills skill-creator quick_validate kurallarının zepul-os uyarlaması): onaydan önce frontmatter denetimi.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { skillBicimHatasi, taslakOnayla, taslakYolu, etkinYolu } from "../sunucu/bahcivan.ts";

const REPO = fileURLToPath(new URL("..", import.meta.url));
const fm = (govde: string) => `---\n${govde}\n---\n\n# gövde\n`;

test("skillBicimHatasi: geçerli frontmatter null, bozuklar gerekçeli", () => {
  assert.equal(skillBicimHatasi(fm('name: a-b\ndescription: "Ne yapar."\nwhen_to_use: "Ne zaman."'), "a-b"), null);
  assert.equal(skillBicimHatasi(fm("name: a-b\ndescription: Ne yapar.").replaceAll("\n", "\r\n"), "a-b"), null);
  assert.match(skillBicimHatasi("# frontmatter yok\n", "a") ?? "", /frontmatter/);
  assert.match(skillBicimHatasi(fm("description: x"), "a") ?? "", /name/);
  assert.match(skillBicimHatasi(fm("name: a"), "a") ?? "", /description/);
  assert.match(skillBicimHatasi(fm('name: a\ndescription: ""'), "a") ?? "", /description/);
  assert.match(skillBicimHatasi(fm("name: A_b\ndescription: x"), "A_b") ?? "", /kebab/);
  assert.match(skillBicimHatasi(fm("name: a--b\ndescription: x"), "a--b") ?? "", /kebab/);
  assert.match(skillBicimHatasi(fm("name: a\ndescription: x"), "b") ?? "", /klasör/);
  assert.match(skillBicimHatasi(fm(`name: a\ndescription: "${"x".repeat(1025)}"`), "a") ?? "", /1024/);
  assert.match(skillBicimHatasi(fm("name: a\ndescription: x\nhooks: y"), "a") ?? "", /hooks/);
});

test("taslakOnayla biçimi bozuk taslağı etkinleştirmez", async () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "skill-bicim-"));
  try {
    const y = taslakYolu(repo, "bozuk");
    fs.mkdirSync(path.dirname(y), { recursive: true });
    fs.writeFileSync(y, fm("name: baska-ad\ndescription: x"));
    await assert.rejects(taslakOnayla(repo, "bozuk"), /klasör/);
    assert.ok(fs.existsSync(y) && !fs.existsSync(etkinYolu(repo, "bozuk")), "bozuk taslak yerinde kalmalı");
  } finally { fs.rmSync(repo, { recursive: true, force: true }); }
});

test("depodaki tüm etkin skill'ler biçim kapısından geçer", () => {
  const dizin = path.join(REPO, ".claude", "skills");
  const adlar = fs.readdirSync(dizin).filter((d) => fs.existsSync(path.join(dizin, d, "SKILL.md")));
  assert.ok(adlar.length >= 7, adlar.join(","));
  for (const d of adlar) assert.equal(skillBicimHatasi(fs.readFileSync(path.join(dizin, d, "SKILL.md"), "utf8"), d), null, d);
});
