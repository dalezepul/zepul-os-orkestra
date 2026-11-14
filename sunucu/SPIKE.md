# Faz 1 spike: Agent SDK ve abonelik girişi

- **Tarih:** 2026-09-29
- **Ortam:** Windows 11, Node v22.23.2, `@anthropic-ai/claude-agent-sdk` 0.3.284. SDK, `claude-agent-sdk-win32-x64` ile gelen CLI 2.1.284 ikilisini kullanıyor.
- **Betik:** `sunucu/spike.ts`, çalıştırmak için `npx tsx sunucu/spike.ts`.
- **Koşu:** Tek koşu yapıldı, toplam süre 28,5 sn, çıkış kodu 0. `AbortController` sınırı 170 sn'ydi ve dolmadı.
- **Kapsam:** İki `query()` oturumu açıldı:
  - **Koşu 1:** streaming input ile 3 mesaj, hook ve maliyet ölçümü.
  - **Koşu 2:** alt ajan.

## Sonuçlar

| Test | Sonuç | Kanıt |
|---|---|---|
| (a) Abonelik | **ÇALIŞIYOR** | `ANTHROPIC_API_KEY` tanımlı değildi. Her `init` mesajında `apiKeySource: "none"` geldi (tip belgesine göre "claude.ai OAuth login" demek). Akışta `rate_limit_event` de geldi; bu olay tipi belgede "claude.ai subscription users" için tanımlı. |
| (b) Streaming input | **ÇALIŞIYOR** | Tek oturumda 3 `result` geldi. İkinci mesaj ("Az önce ne dedin, tek kelime") bağlamı hatırlayarak işlendi, cevap `Merhaba` oldu. |
| (c) PreToolUse hook | **ÇALIŞIYOR** | Hook 4 kez tetiklendi: `Glob`, `Read`, `Agent` ve alt ajanın `Read` çağrısı. `permissionDecision: "allow"` döndürüldü. Ana ajanda `agent_id` değeri `null`, alt ajanda dolu (`a11c39e333652253d`). |
| (d) Maliyet | **VAR** | `total_cost_usd`, `usage` ve `modelUsage` geliyor. `costBasis: "list"`, yani liste fiyatı tahmini; fatura değil. |
| (e) Alt ajan `parent_tool_use_id` | **DOLU** | Koşu 2'de 6 mesaj `parent_tool_use_id=toolu_0149…` ile geldi. Ayar: `forwardSubagentText: true`. |

## Çıktı parçaları

### (a) init

```
[env] ANTHROPIC_API_KEY tanımlı değil
[koşu1] rate_limit_event/- parent=null
[koşu1] init {"apiKeySource":"none","model":"claude-sonnet-5-5","claude_code_version":"2.1.284", ... ,"permissionMode":"default"}
[koşu1] init anahtarları: type,subtype,cwd,session_id,tools,mcp_servers,model,permissionMode,slash_commands,terminal_slash_commands,apiKeySource,claude_code_version,output_style,agents,skills,plugins,capabilities,analytics_disabled,product_feedback_disabled,uuid,memory_paths,messaging_socket_path,fast_mode_state,fast_mode_disabled_reason,per_turn_effort_active,view_mode,powershell_path
```

### (b) Streaming input ve (c) hook

```
[koşu1] assistant parent=null araç: Glob
[hook PreToolUse] {"tool_name":"Glob","agent_id":null}
[koşu1] assistant parent=null metin: merhaba
[koşu1] result {"subtype":"success","num_turns":2,"result":"merhaba","total_cost_usd":0.0975, ...}
[koşu1] gelen kutusuna itildi: Az önce ne dedin, tek kelime
[koşu1] assistant parent=null metin: Merhaba
[koşu1] result {"subtype":"success","num_turns":1,"result":"Merhaba","total_cost_usd":0.4610, ...}
[koşu1] gelen kutusuna itildi: package.json'ı oku ve name alanını söyle
[koşu1] assistant parent=null araç: Read
[hook PreToolUse] {"tool_name":"Read","agent_id":null}
[koşu1] result {"subtype":"success","num_turns":2,"result":"`name` alanı: **zepul-os**","total_cost_usd":0.5032, ...}
```

### (d) Maliyet: koşu 1'in son `result` mesajı

`total_cost_usd` kümülatif; her `result` o ana kadarki toplamı taşıyor.

```
"total_cost_usd": 0.5032,
"usage": {"input_tokens":4,"cache_creation_input_tokens":1190,"cache_read_input_tokens":182554,"output_tokens":90, ...},
"modelUsage": {
  "claude-haiku-4-5-20251001": {"inputTokens":889,"outputTokens":11,"costUSD":0.00094,"costBasis":"list"},
  "claude-sonnet-5-5": {"inputTokens":10,"outputTokens":178,"cacheReadInputTokens":203858,"cacheCreationInputTokens":114923,"costUSD":0.5023,"costBasis":"list"}
}
```

### (e) Alt ajan (koşu 2)

```
[koşu2] init {... "tools":["Task","Glob","Read", ...], "agents":[..., "yardimci"]}
[koşu2] assistant parent=null araç: Agent
[hook PreToolUse] {"tool_name":"Agent","agent_id":null}
[koşu2] system/task_started parent=null
[koşu2] user parent=toolu_0149AX2FH2UDq7xi6h86x59Q
[hook PreToolUse] {"tool_name":"Read","agent_id":"a11c39e333652253d"}
[koşu2] assistant parent=toolu_0149AX2FH2UDq7xi6h86x59Q araç: Read
[koşu2] assistant parent=toolu_0149AX2FH2UDq7xi6h86x59Q metin: Name alanının değeri: **zepul-os**
[koşu2] system/task_notification parent=null
[koşu2] assistant parent=null metin: package.json içindeki `name` alanı **zepul-os**.
[koşu2] result {"subtype":"success","num_turns":2,"total_cost_usd":0.4051, ...}
```

Toplam liste fiyatı tahmini yaklaşık **0,91 USD**. Abonelikte bu tutar fatura edilmez; abonelik kullanım kotasından düşer.

## Mimariyi etkileyen bulgular

1. **`tools` yalnızca yerleşik araçları kısıtlıyor; MCP araçları sızıyor.**
   - **Ne oldu:** `tools: ["Read","Glob"]` verilmesine rağmen `init.tools` içinde kullanıcı ayarlarından gelen MCP araçları vardı:
     - `mcp__ai-os__*` (`do_run`, `agent_run` dahil)
     - `mcp__claude_ai_Claude_Docs__*`
     - yaklaşık 90 `mcp__higgsfield__*` aracı (`sandbox_exec` dahil)
   - **Sonuç:** "Şef yazamaz" garantisi yalnızca `tools` ile **sağlanmıyor**.
   - **Faz 1 için öneri:**
     - `strictMcpConfig: true` ve `mcpServers` içinde yalnızca bus MCP'si.
     - Ek güvence: `disallowedTools: ["mcp__*"]` ya da kapıda (PreToolUse) MCP adlarına izin listesi.
     - `settingSources` bilinçli seçilmeli. Varsayılan tüm kaynakları yüklüyor; kullanıcının global hook'ları da (`hook_started/hook_response`) tetiklendi.
   - **Doğrulanmadı:** claude.ai bağlayıcılarının (`Claude_Docs`) `strictMcpConfig` ile kapanıp kapanmadığı.
2. **Bağlam şişkinliği maliyeti büyütüyor.**
   - İkinci turda `cache_creation_input_tokens: 90867` oluştu. Neden: higgsfield MCP'si 1. turdan sonra bağlandı, araç listesi değişti ve önbellek geçersiz oldu.
   - Bu yüzden kısa bir "Merhaba" 0,36 USD (liste) tuttu.
   - MCP'yi kısmak hem güvenlik hem maliyet için gerekli.
3. **Alt ajan `model: "sonnet"` ile muhtemelen Haiku 4.5'te koştu.** Bu bir çıkarım; kanıt `modelUsage` sayıları:
   - Koşu 2'de `claude-sonnet-5-5` kullanımı, `result.usage` (yalnızca ana döngü) ile birebir aynı.
   - Alt ajanın token'ları `claude-haiku-4-5` altında görünüyor: 288 çıktı, 8385 önbellek yazımı, 188 thinking.
   - **Öneri:** Alt ajanda takma ad yerine tam kimlik (`claude-sonnet-5-5`) verilmeli ve `modelUsage` ile doğrulanmalı. Faz 1'de ayrı `query()` oturumları kullanılacağı için bu risk küçük.
4. **Alt ajan aracının adı:** `init.tools` içinde `Task` görünüyor, ama `tool_use` adı ve hook'taki `tool_name` `Agent`. `tools` listesine `"Agent"` yazmak yetti.
5. **`maxTurns` streaming modunda tur başına uygulanıyor.** 3 mesaj `maxTurns: 3` ile sorunsuz işlendi.
6. **`system/init` her turun başında yeniden geliyor.** `apiKeySource` her turda okunabilir.

## Yedek yol (CLI stream-json)

`sunucu/spike-cli.mjs` **yazılmadı.** SDK abonelik girişiyle çalıştığı için yedek yola gerek kalmadı; kotayı gereksiz harcamamak için de tekrar koşu yapılmadı.

## Öneri: **SDK**

- SDK abonelikle çalışıyor (`apiKeySource: "none"`, `rate_limit_event`).
- Planın ihtiyaç duyduğu her şey tek süreçte ve tipli olarak geliyor:
  - streaming input ile ajan başına gelen kutusu
  - `agent_id` taşıyan fail-closed PreToolUse hook
  - `total_cost_usd` ve `modelUsage` ile ajan başına maliyet
  - `parent_tool_use_id`
- CLI yolunda aynı şeyler satır parse ederek ve hook'ları ayar dosyasıyla yaparak elde edilirdi.
- Faz 1'de `strictMcpConfig` ve `settingSources` ayarları zorunlu tutulmalı (bkz. bulgu 1-2).
