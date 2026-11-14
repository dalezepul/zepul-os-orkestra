// Sahte claude: stream-json satırları üretir (test/harness.test.ts). Gerçek claude çağrılmaz.
// SAHTE_MOD=uyu: init sonrası bekler (durdurma testi); SAHTE_MOD=cik: stderr yazıp 3 ile çıkar.
let istem = "";
const DENETIM = "Sonuç: " +JSON.stringify({ verdict: "PASS", gerekce: "kabul maddelerinin ikisi de dosyada bulundu ve okunarak doğrulandı",
  kanitlar: [{ iddia: "a", cikti_ozet: "var" }, { iddia: "b", cikti_ozet: "var" }],
  kirmiziya_dondu: [{ test: "-", geri_alinan: "-", sonuc: "uygulanamadi", not: "plan modu" }], blockers: [] });
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => (istem += d));
process.stdin.on("end", () => {
  const argv = process.argv.slice(2);
  const yaz = (o) => process.stdout.write(JSON.stringify(o) + "\n");
  if (process.env.SAHTE_MOD === "cik") { process.stderr.write("kimlik yok"); process.exit(3); }
  const i = argv.indexOf("--resume");
  const sid = i >= 0 ? argv[i + 1] : "sahte-oturum-1";
  yaz({ type: "system", subtype: "init", session_id: sid, argv, istem, cwd: process.cwd() });
  if (process.env.SAHTE_MOD === "uyu") return setInterval(() => {}, 1000);
  process.stdout.write("stream-json olmayan satır\n");
  yaz({ type: "assistant", session_id: sid, parent_tool_use_id: null, message: { content: [{ type: "text", text: `istem: ${istem}${i >= 0 ? ` (resume ${sid})` : ""}` }, { type: "tool_use", id: "t1", name: "Read", input: { file_path: "a.txt" } }] } });
  yaz({ type: "user", session_id: sid, parent_tool_use_id: null, message: { content: [{ type: "tool_result", tool_use_id: "t1", content: "dosya içeriği" }] } });
  yaz({ type: "result", subtype: "success", is_error: false, session_id: sid, total_cost_usd: 0.25, num_turns: 2, duration_ms: 10, result: istem.includes("# Bağımsız doğrulama") ? process.env.SAHTE_DENETIM ?? DENETIM : "tamam" });
});
