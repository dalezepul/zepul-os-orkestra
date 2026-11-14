// Faz 1 spike: Agent SDK abonelik girişiyle çalışıyor mu? Ürün kodu değil, yalnızca ölçüm.
// Çalıştırma: npx tsx sunucu/spike.ts
import { query, type SDKMessage, type SDKUserMessage, type HookCallback } from "@anthropic-ai/claude-agent-sdk";

const REPO = "C:/Users/kullanici/Desktop/zepul-os";

if (process.env.ANTHROPIC_API_KEY !== undefined) {
  delete process.env.ANTHROPIC_API_KEY;
  console.log("[env] ANTHROPIC_API_KEY tanımlıydı, süreçten silindi (değer yazdırılmadı)");
} else console.log("[env] ANTHROPIC_API_KEY tanımlı değil");

// Tüm spike 3 dakikayı geçmesin.
const iptal = new AbortController();
const zamanlayici = setTimeout(() => { console.log("[zaman] 170 sn doldu, iptal"); iptal.abort(); }, 170_000);

// Gelen kutusu: push() mesaj ekler, close() akışı bitirir.
function gelenKutusu() {
  const kuyruk: SDKUserMessage[] = [];
  let uyandir: (() => void) | null = null;
  let kapali = false;
  return {
    push(metin: string) {
      kuyruk.push({ type: "user", message: { role: "user", content: metin }, parent_tool_use_id: null });
      uyandir?.();
    },
    close() { kapali = true; uyandir?.(); },
    async *[Symbol.asyncIterator]() {
      while (true) {
        while (kuyruk.length) yield kuyruk.shift()!;
        if (kapali) return;
        await new Promise<void>((r) => (uyandir = r));
        uyandir = null;
      }
    },
  };
}

const bulgular = { apiKeySource: [] as string[], model: [] as string[], hook: [] as { tool_name: string; agent_id: string | null }[], parentToolUseIds: [] as string[], sonuclar: [] as unknown[] };

const hook: HookCallback = async (girdi) => {
  const g = girdi as { tool_name: string; agent_id?: string };
  const kayit = { tool_name: g.tool_name, agent_id: g.agent_id ?? null };
  bulgular.hook.push(kayit);
  console.log("[hook PreToolUse]", JSON.stringify(kayit));
  return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow" } };
};

function yaz(etiket: string, m: SDKMessage) {
  const p = (m as { parent_tool_use_id?: string | null }).parent_tool_use_id;
  if (p) bulgular.parentToolUseIds.push(p);
  if (m.type === "system" && m.subtype === "init") {
    bulgular.apiKeySource.push(m.apiKeySource);
    bulgular.model.push(m.model);
    console.log(`[${etiket}] init`, JSON.stringify({ apiKeySource: m.apiKeySource, model: m.model, claude_code_version: m.claude_code_version, tools: m.tools, agents: m.agents, permissionMode: m.permissionMode }));
    console.log(`[${etiket}] init anahtarları:`, Object.keys(m).join(","));
  } else if (m.type === "assistant") {
    const parcalar = m.message.content.map((b) => (b.type === "text" ? `metin: ${b.text}` : b.type === "tool_use" ? `araç: ${b.name}` : b.type));
    console.log(`[${etiket}] assistant parent=${p ?? "null"}`, parcalar.join(" | "));
  } else if (m.type === "user") {
    console.log(`[${etiket}] user parent=${p ?? "null"}`);
  } else if (m.type === "result") {
    const r = { subtype: m.subtype, is_error: m.is_error, num_turns: m.num_turns, result: "result" in m ? m.result : undefined, total_cost_usd: m.total_cost_usd, usage: m.usage, modelUsage: m.modelUsage };
    bulgular.sonuclar.push({ etiket, ...r });
    console.log(`[${etiket}] result`, JSON.stringify(r));
  } else {
    console.log(`[${etiket}] ${m.type}/${(m as { subtype?: string }).subtype ?? "-"} parent=${p ?? "null"}`);
  }
}

const ortak = {
  model: "claude-sonnet-5-5",
  cwd: REPO,
  systemPrompt: { type: "preset", preset: "claude_code" } as const,
  maxTurns: 3,
  env: { ...process.env },
  abortController: iptal,
  hooks: { PreToolUse: [{ hooks: [hook] }] },
  stderr: (d: string) => process.stderr.write(`[stderr] ${d}`),
};

// Koşu 1: streaming input + hook + maliyet.
const kutu = gelenKutusu();
const sorular = ["README yoksa sadece 'merhaba' de", "Az önce ne dedin, tek kelime", "package.json'ı oku ve name alanını söyle"];
let sira = 0;
kutu.push(sorular[sira++]);
let sonucSayisi1 = 0;
try {
  for await (const m of query({ prompt: kutu, options: { ...ortak, tools: ["Read", "Glob"], persistSession: false } })) {
    yaz("koşu1", m);
    if (m.type === "result") {
      sonucSayisi1++;
      if (sira < sorular.length) { console.log(`[koşu1] gelen kutusuna itildi: ${sorular[sira]}`); kutu.push(sorular[sira++]); }
      else kutu.close();
    }
  }
} catch (e) { console.log("[koşu1] HATA", (e as Error).message); }

// Koşu 2: alt ajan, parent_tool_use_id kontrolü.
const parentOncesi = bulgular.parentToolUseIds.length;
try {
  for await (const m of query({
    prompt: "yardimci alt ajanını Agent aracıyla çağır: package.json'ı okusun ve name alanını söylesin. Sonra sonucu tek satırda bildir.",
    options: {
      ...ortak,
      tools: ["Read", "Glob", "Agent"],
      forwardSubagentText: true,
      persistSession: false,
      agents: { yardimci: { description: "Dosya okuyup kısa cevap veren yardımcı", prompt: "Sana verilen dosyayı Read ile oku, istenen alanı tek satırda söyle.", model: "sonnet", tools: ["Read"] } },
    },
  })) yaz("koşu2", m);
} catch (e) { console.log("[koşu2] HATA", (e as Error).message); }

clearTimeout(zamanlayici);
console.log("\n[ÖZET]", JSON.stringify({
  apiKeySource: [...new Set(bulgular.apiKeySource)],
  model: [...new Set(bulgular.model)],
  streaming_sonuc_sayisi: sonucSayisi1,
  hook_sayisi: bulgular.hook.length,
  hook_agent_id_dolu: bulgular.hook.filter((h) => h.agent_id).length,
  parent_tool_use_id_kosu2: bulgular.parentToolUseIds.length - parentOncesi,
}, null, 2));
