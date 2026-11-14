import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ajanOrtami, isciOrtami } from "../sunucu/ortam.ts";
import { kesinYasakMi } from "../sunucu/olay.ts";

type Env = NodeJS.ProcessEnv;
const ENGEL = "engelli://push-yasak";

test("isciOrtami: kimlik ve soru kapalı, API anahtarı silinir, tabandaki GIT_CONFIG_* korunur", () => {
  const taban: Env = { PATH: "p", ANTHROPIC_API_KEY: "sk-ant-x", GH_TOKEN: "gercek", GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "user.name", GIT_CONFIG_VALUE_0: "korunan" };
  const e = isciOrtami(taban);
  assert.ok(!("ANTHROPIC_API_KEY" in e), "abonelik kullanılsın");
  assert.equal(taban.ANTHROPIC_API_KEY, "sk-ant-x", "taban değişmez");
  assert.equal(e.PATH, "p");
  assert.deepEqual([e.GH_TOKEN, e.GITHUB_TOKEN, e.GIT_TERMINAL_PROMPT, e.GCM_INTERACTIVE], ["engelli", "engelli", "0", "never"]);
  const n = Number(e.GIT_CONFIG_COUNT);
  const ayarlar = Array.from({ length: n }, (_, i) => `${e[`GIT_CONFIG_KEY_${i}`]}=${e[`GIT_CONFIG_VALUE_${i}`]}`);
  assert.equal(ayarlar[0], "user.name=korunan", "sayaç tabanın üstüne eklenir");
  for (const a of [`remote.origin.pushurl=${ENGEL}`, `url.${ENGEL}/.pushInsteadOf=https://`, `url.${ENGEL}/.pushInsteadOf=git@`, `url.${ENGEL}/.pushInsteadOf=ssh://`, "credential.helper="]) {
    assert.ok(ayarlar.includes(a), `eksik: ${a}`);
  }
});

// Abonelik girişi (ileride) için CLAUDE_CODE_OAUTH_TOKEN geçer; istisna yalnızca bu ad. Diğer sır adlı CLAUDE_CODE_* silinir.
test("ajanOrtami ve isciOrtami: CLAUDE_CODE_* kimliklerinden yalnızca CLAUDE_CODE_OAUTH_TOKEN geçer", () => {
  const taban: Env = { CLAUDE_CODE_OAUTH_TOKEN: "oauth", CLAUDE_CODE_OAUTH_REFRESH_TOKEN: "r", CLAUDE_CODE_SESSION_ACCESS_TOKEN: "s", CLAUDE_CODE_API_KEY: "k",
    X_CLAUDE_CODE_OAUTH_TOKEN: "x", CLAUDE_CODE_ENTRYPOINT: "sdk-ts" };
  for (const e of [ajanOrtami(taban), isciOrtami(taban)]) {
    assert.equal(e.CLAUDE_CODE_OAUTH_TOKEN, "oauth");
    assert.equal(e.CLAUDE_CODE_ENTRYPOINT, "sdk-ts", "sır adı olmayan CLAUDE_CODE_* zaten geçer");
    for (const k of ["CLAUDE_CODE_OAUTH_REFRESH_TOKEN", "CLAUDE_CODE_SESSION_ACCESS_TOKEN", "CLAUDE_CODE_API_KEY"]) assert.ok(!(k in e), k);
    assert.equal(e.X_CLAUDE_CODE_OAUTH_TOKEN, "x", "27.10.2026: genel _TOKEN kuralı kalktı");
  }
  assert.equal(ajanOrtami({ claude_code_oauth_token: "o" }).claude_code_oauth_token, "o", "Windows'ta ad harf duyarsız");
});

// S1: panel belirteci (ZEPUL_TOKEN) ve diğer ZEPUL_* ayarları ajan süreçlerine (şef dahil) geçmez.
test("ajanOrtami ve isciOrtami: ZEPUL_* ve ANTHROPIC_API_KEY silinir; ajanOrtami push engeli koymaz (S1)", () => {
  const taban: Env = { PATH: "p", ZEPUL_TOKEN: "gizli", ZEPUL_TEST: "1", zepul_jev_url: "x", ZEPUL_OLUM_SN: "5", Anthropic_Api_Key: "sk", ZEPULX: "kalir" };
  assert.deepEqual(ajanOrtami(taban), { PATH: "p", ZEPULX: "kalir" });
  assert.equal(taban.ZEPUL_TOKEN, "gizli", "taban değişmez");
  const i = isciOrtami(taban);
  for (const k of Object.keys(i)) assert.doesNotMatch(k, /^(zepul_|anthropic_api_key$)/i, k);
  assert.equal(i.ZEPULX, "kalir");
  assert.equal(i.GH_TOKEN, "engelli", "işçide push engeli sürer");
});

// Kullanıcı kararı 27.10.2026: sır adı kuralı (_API_KEY/_TOKEN/_SECRET/_PASSWORD) kaldırıldı; bu değişkenler ajana geçer.
test("ajanOrtami ve isciOrtami: sır adlı değişkenler geçer, işçide GH_TOKEN engelli kalır", () => {
  const taban: Env = {
    PATH: "p", USERPROFILE: "u", OPENCODE_API_KEY: "a", OPENROUTER_API_KEY: "c", FOO_TOKEN: "e", X_SECRET: "f", db_password: "g", GH_TOKEN: "gercek", GITHUB_TOKEN: "gercek",
  };
  assert.deepEqual(ajanOrtami(taban), { PATH: "p", USERPROFILE: "u", OPENCODE_API_KEY: "a", OPENROUTER_API_KEY: "c", FOO_TOKEN: "e", X_SECRET: "f", db_password: "g" });
  const i = isciOrtami(taban);
  for (const k of ["OPENCODE_API_KEY", "OPENROUTER_API_KEY", "FOO_TOKEN", "X_SECRET", "db_password"]) assert.equal(i[k], taban[k], `geçmeliydi: ${k}`);
  assert.deepEqual([i.GH_TOKEN, i.GITHUB_TOKEN], ["engelli", "engelli"], "silinip yeniden yazılır");
});

test("isciOrtami: gerçek git ile push düşer, kimlik alınamaz, commit çalışır", () => {
  const kok = fs.mkdtempSync(path.join(os.tmpdir(), "zepul-ortam-"));
  const is = path.join(kok, "is"), uzak = path.join(kok, "uzak.git");
  const bos = path.join(kok, "bos.gitconfig");
  const askpass = path.join(kok, "askpass.sh");
  fs.writeFileSync(bos, "");
  fs.writeFileSync(askpass, "#!/bin/sh\necho GIZLI-ASKPASS\n", { mode: 0o755 }); // VS Code gibi kimlik veren bir askpass
  // Test kendi ortamını temizler: işçi içinde koşarsa dıştaki isciOrtami ayarları kurulumu bozmasın.
  const temiz = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(GIT_CONFIG|GIT_ASKPASS$|SSH_ASKPASS$|GIT_SSH|GIT_TERMINAL_PROMPT$|GCM_|GH_TOKEN$|GITHUB_TOKEN$)/i.test(k)));
  // Kullanıcı ve sistem git ayarı okunmaz (GCM açılmasın); tabanda korunacak bir -c benzeri ayar var.
  const taban: Env = { ...temiz, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: bos, GIT_ASKPASS: askpass, GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "user.name", GIT_CONFIG_VALUE_0: "korunan" };
  const g = (env: Env, args: string[], input?: string) => spawnSync("git", args, { cwd: is, env, input, encoding: "utf8", timeout: 20_000 });
  const tamam = (env: Env, ...args: string[]) => { const r = g(env, args); assert.equal(r.status, 0, `${args.join(" ")}: ${r.stderr}`); return r.stdout.trim(); };
  const uzakUc = () => spawnSync("git", ["rev-parse", "main"], { cwd: uzak, env: taban, encoding: "utf8" }).stdout.trim();
  const kimlik = "protocol=https\nhost=127.0.0.1\n\n";
  try {
    fs.mkdirSync(is);
    tamam(taban, "init", "-q", "-b", "main");
    tamam(taban, "config", "user.email", "t@t");
    // Yerel depoda gerçek bir yardımcı gibi parola veren credential.helper.
    tamam(taban, "config", "credential.helper", "!f() { echo username=u; echo password=GIZLI-YARDIMCI; }; f");
    fs.writeFileSync(path.join(is, "a.txt"), "1\n");
    tamam(taban, "add", "a.txt");
    tamam(taban, "commit", "-qm", "ilk");
    tamam(taban, "clone", "-q", "--bare", ".", uzak);
    tamam(taban, "remote", "add", "origin", uzak);
    tamam(taban, "fetch", "-q", "origin");
    tamam(taban, "branch", "-q", "-u", "origin/main");
    fs.appendFileSync(path.join(is, "a.txt"), "2\n");
    tamam(taban, "commit", "-qam", "iki");
    // Taban ortamında yardımcı gerçekten parola veriyor: aşağıdaki "alınamaz" sonucu anlamlı.
    assert.match(g(taban, ["credential", "fill"], kimlik).stdout, /GIZLI-YARDIMCI/);

    const w = isciOrtami(taban);
    const once = uzakUc();
    assert.equal(tamam(w, "config", "user.name"), "korunan", "tabandaki GIT_CONFIG_* korunur");

    const dusmeli: string[][] = [
      ["push"],
      ["push", "origin", "main"],
      ["push", "--force", "origin", "main"],
      ["push", "--mirror", "origin"],
      ["-c", "remote.origin.mirror=true", "push", "origin"],
      ["push", "https://127.0.0.1:1/yok.git", "main"], // açık URL: pushInsteadOf
      ["push", "ssh://git@127.0.0.1:1/yok.git", "main"],
      ["push", "git@127.0.0.1:yok.git", "main"],
      ["push", uzak, "main"], // açık yerel yol: boş önekli pushInsteadOf
      ["send-pack", uzak, "main"], // alt düzey: uzak ayarı ve pushInsteadOf'u kullanmaz, yerel yolda geçer (bilinen sınır)
      // -c ile pushurl eklemek ezmez: ortamdaki pushurl önce gelir, git ilk başarısız URL'de durur.
      ["-c", `remote.origin.pushurl=${uzak}`, "push", "origin", "main"],
    ];
    for (const args of dusmeli) {
      const r = g(w, args);
      if (args[0] === "send-pack") {
        // send-pack yerel yola doğrudan yazar; GitHub'a ancak ssh ile gidebilir, o da GIT_SSH_COMMAND ile kapalı (aşağıda).
        assert.equal(r.status, 0, "send-pack yerel yolda geçer: sınır belgelensin");
        spawnSync("git", ["update-ref", "refs/heads/main", once], { cwd: uzak, env: taban });
        assert.equal(kesinYasakMi("Bash", { command: `git send-pack ${uzak} main` }).yasak, true, "metin katmanı send-pack'i push sayar");
        continue;
      }
      assert.notEqual(r.status, 0, `düşmeliydi: git ${args.join(" ")}`);
      assert.match(r.stderr, /engelli/, `engel ortamdan gelmeli: git ${args.join(" ")} → ${r.stderr}`);
      assert.equal(uzakUc(), once, `uzak değişti: git ${args.join(" ")}`);
    }

    // Bilinen sınır 1: komut satırı -c url.*.pushInsteadOf daha uzun önekle ortamı ezer. F3 bu yüzden -c url.* yasaklar.
    const ezen = ["-c", `url.${uzak}.pushInsteadOf=${uzak}`, "push", uzak, "main"];
    assert.equal(g(w, ezen).status, 0, "-c url.* ortamı ezer (belgelenen sınır)");
    assert.notEqual(uzakUc(), once);
    spawnSync("git", ["update-ref", "refs/heads/main", once], { cwd: uzak, env: taban });
    assert.equal(kesinYasakMi("Bash", { command: `git ${ezen.join(" ")}` }).mutlak, true, "F3: -c url.* mutlak yasak");

    // Bilinen sınır 2: depo ayarına yazılmış pushurl ortamdakinden önce okunur ve push geçer. F3 git config ile yazmayı yasaklar.
    tamam(w, "config", "remote.origin.pushurl", uzak);
    assert.equal(g(w, ["push", "origin", "main"]).status, 128, "ilk URL geçer, ortamdaki engelde durur");
    assert.notEqual(uzakUc(), once, "depo ayarındaki pushurl sızar (belgelenen sınır)");
    tamam(w, "config", "--unset", "remote.origin.pushurl");
    spawnSync("git", ["update-ref", "refs/heads/main", once], { cwd: uzak, env: taban });
    assert.equal(kesinYasakMi("Bash", { command: `git config remote.origin.pushurl ${uzak}` }).mutlak, true, "F3: git config remote.*.pushurl mutlak");

    // Kimlik: yardımcı listesi sıfır, askpass kapalı, terminal kapalı → parola alınamaz.
    const k = g(w, ["credential", "fill"], kimlik);
    assert.notEqual(k.status, 0);
    assert.doesNotMatch(k.stdout + k.stderr, /GIZLI/, "kimlik sızdı");
    // Bilinen sınır 3: -c credential.helper yardımcıyı geri getirir. F3 bunu yasaklar.
    const kc = g(w, ["-c", "credential.helper=!f() { echo username=u; echo password=GIZLI-C; }; f", "credential", "fill"], kimlik);
    assert.match(kc.stdout, /GIZLI-C/, "-c credential.helper ortamı ezer (belgelenen sınır)");
    assert.equal(kesinYasakMi("Bash", { command: "git -c credential.helper=manager push" }).mutlak, true);

    // ssh: git bizim komutumuzu çalıştırır (anahtarla bağlanamaz); -c core.sshCommand GIT_SSH_COMMAND'i ezemez.
    for (const args of [["ls-remote", "ssh://127.0.0.1:1/x"], ["-c", "core.sshCommand=ssh", "ls-remote", "ssh://127.0.0.1:1/x"]]) {
      const s = g(w, args);
      assert.notEqual(s.status, 0);
      assert.match(s.stderr, /engelli-ssh/, `ssh ortamdan gelmeli: ${s.stderr}`);
    }

    // Yerel iş sürer.
    fs.appendFileSync(path.join(is, "a.txt"), "3\n");
    tamam(w, "commit", "-qam", "uc");
    assert.equal(tamam(w, "status", "--porcelain"), "");
    assert.equal(uzakUc(), once);
  } finally {
    fs.rmSync(kok, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
