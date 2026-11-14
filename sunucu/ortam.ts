const ENGEL = "engelli://push-yasak"; // böyle bir uzak yardımcı yok: git "remote-engelli" bulamayıp durur

// GIT_CONFIG_COUNT ile verilen ayarlar dosyalardaki ayarları ezer; yalnızca komut satırındaki -c bunları ezebilir (F3 yasaklar).
const GIT_AYARLARI: [string, string][] = [
  ["remote.origin.pushurl", ENGEL], // git push, git push origin
  [`url.${ENGEL}/.pushInsteadOf`, "https://"], // açık URL ile push
  [`url.${ENGEL}/.pushInsteadOf`, "git@"],
  [`url.${ENGEL}/.pushInsteadOf`, "ssh://"],
  [`url.${ENGEL}/.pushInsteadOf`, ""], // boş önek her URL'ye uyar: açık yerel yol ve pushurl'süz diğer uzaklar
  ["credential.helper", ""], // boş değer yardımcı listesini (sistemdeki manager dahil) sıfırlar
];

// Kullanıcı kararı 27.10.2026: _API_KEY, _SECRET, _PASSWORD, _TOKEN adlı değişkenler (OPENCODE_API_KEY …) artık ajana geçer.
// Silinenler sır koruması değildir: ZEPUL_* (panel belirteci ZEPUL_TOKEN; token ile panel koruması), GH_TOKEN/GITHUB_TOKEN
// (push yolu; yıkıcı git koruması), ANTHROPIC_API_KEY ve CLAUDE_CODE_* kimlikleri (ajan abonelikle girsin, API anahtarına kaymasın).
const SILINEN = /^(ZEPUL_.*|GH_TOKEN|GITHUB_TOKEN|ANTHROPIC_API_KEY|CLAUDE_CODE_(\w*_)?(TOKEN|API_KEY))$/i;
// Tek istisna, tam adla: abonelik girişi (ileride) için Claude Code'un OAuth belirteci geçer.
const GECER = /^CLAUDE_CODE_OAUTH_TOKEN$/i;

export function ajanOrtami(taban: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(taban).filter(([k]) => GECER.test(k) || !SILINEN.test(k)));
}

// GH_TOKEN ve GITHUB_TOKEN: ajanOrtami onları siler, aşağıda "engelli" olarak yeniden yazılır. Sıra bozulmasın.
export function isciOrtami(taban: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env = ajanOrtami(taban);
  const n = Math.max(0, Number.parseInt(taban.GIT_CONFIG_COUNT ?? "", 10) || 0);
  GIT_AYARLARI.forEach(([k, v], i) => {
    env[`GIT_CONFIG_KEY_${n + i}`] = k;
    env[`GIT_CONFIG_VALUE_${n + i}`] = v;
  });
  env.GIT_CONFIG_COUNT = String(n + GIT_AYARLARI.length);
  return Object.assign(env, {
    GIT_TERMINAL_PROMPT: "0",
    GCM_INTERACTIVE: "never",
    // Var olmayan program: VS Code gibi bir askpass kimlik veremez. Ortam değişkeni core.askPass'ten önce gelir, -c ezemez.
    GIT_ASKPASS: "engelli-askpass",
    SSH_ASKPASS: "engelli-askpass",
    // ssh anahtarıyla push ve send-pack düşer; GIT_SSH_COMMAND core.sshCommand'dan önce gelir, -c ezemez.
    GIT_SSH_COMMAND: "engelli-ssh",
    // gh CLI keyring yerine bunları kullanır; kimlik doğrulama düşer.
    GH_TOKEN: "engelli",
    GITHUB_TOKEN: "engelli",
  });
}

const YEREL_SURE_MS = "1800000";
export function yerelOrtam(env: NodeJS.ProcessEnv, ad: string, url = process.env.ZEPUL_OLLAMA_URL || "http://127.0.0.1:11434"): NodeJS.ProcessEnv {
  const e = Object.fromEntries(Object.entries(env).filter(([k]) => !/^(ANTHROPIC_|CLAUDE_CODE_OAUTH)/i.test(k)));
  return Object.assign(e, {
    ANTHROPIC_BASE_URL: url, ANTHROPIC_AUTH_TOKEN: "ollama", ANTHROPIC_API_KEY: "",
    ANTHROPIC_DEFAULT_HAIKU_MODEL: ad, ANTHROPIC_DEFAULT_SONNET_MODEL: ad, ANTHROPIC_DEFAULT_OPUS_MODEL: ad, ANTHROPIC_SMALL_FAST_MODEL: ad,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1", DISABLE_TELEMETRY: "1",
    API_TIMEOUT_MS: YEREL_SURE_MS, CLAUDE_STREAM_IDLE_TIMEOUT_MS: YEREL_SURE_MS, CLAUDE_STREAM_FIRST_BYTE_TIMEOUT_MS: YEREL_SURE_MS, CLAUDE_CODE_MAX_RETRIES: "1",
  });
}
