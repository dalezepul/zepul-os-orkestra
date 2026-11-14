import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { kapiKarari, jevMaskele, type KapiBagimlilik, type KapiGirdi } from "../sunucu/kapi.ts";

const KOK = process.cwd();
const WT = path.join(KOK, ".worktrees", "isci1").replace(/\\/g, "/");
const KOPYA = path.join(path.dirname(KOK), "zepul-ayar", "denetim", "isci1-1").replace(/\\/g, "/");
const ANA = KOK.replace(/\\/g, "/");
const TEMP = path.dirname(KOK).replace(/\\/g, "/");
// av9: <SIR> doğrudan içinde sahte panel-url.txt olan proje dışı dizin (Grep/Glob dizin denetimi gerçek dosya ister).
const SIR = fs.mkdtempSync(path.join(os.tmpdir(), "av9-sir-")).replace(/\\/g, "/");
fs.writeFileSync(path.join(SIR, "panel-url.txt"), "http://127.0.0.1:1/?t=sahte\n");
after(() => fs.rmSync(SIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));
// Çalışma alanı (docs/sozlesme/calisma-alanlari.md): <ALAN> satırın alan listesindeki proje dışı klasör; <DIS> listede olmayan klasör.
const ALAN = fs.mkdtempSync(path.join(os.tmpdir(), "alan-tablo-")).replace(/\\/g, "/");
const DIS = fs.mkdtempSync(path.join(os.tmpdir(), "alan-dis-")).replace(/\\/g, "/");
fs.writeFileSync(path.join(ALAN, "a.txt"), "x");
after(() => { fs.rmSync(ALAN, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); fs.rmSync(DIS, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); });
const ac = (s: string) => s.replaceAll("<KOPYA\\>", KOPYA.replaceAll("/", "\\")).replaceAll("<KOPYA_UP>", KOPYA.toUpperCase())
  .replaceAll("<KOPYA_LO>", KOPYA.toLowerCase()).replaceAll("<KOPYA_GB>", KOPYA.replace(/^([A-Za-z]):/, (_, d) => "/" + d.toLowerCase()))
  .replaceAll("<TEMP>", TEMP).replaceAll("<REPO>", path.basename(KOK)).replaceAll("<KOPYA>", KOPYA)
  .replaceAll("<WT\\>", WT.replaceAll("/", "\\")).replaceAll("<WT>", WT).replaceAll("<ANA>", ANA).replaceAll("<SIR>", SIR)
  .replaceAll("<ALAN>", ALAN).replaceAll("<DISAD>", path.basename(DIS)).replaceAll("<DIS>", DIS);
const cevap = { answers: { risk: { type: "choice", choice: "guvenli", confidence: 0.95, probabilities: { guvenli: 0.95 } }, dis_etki: { type: "noul", noul: 0.1 } } };

// girdi: kabuk komutu (command) ya da kabuk dışı aracın girdi nesnesi (av9: Grep). IZIN: Jev'siz salt okuma izni.
// alanlar: kapıya giden calisma_alanlari (yer tutuculu). ALAN etiketi: insan kararı + alan kartı önerisi (tur:"alan").
// kademe (docs/sozlesme/guven-modu.md): verilmezse kapıya guven gitmez (bugünkü jev kapısı). TAM etiketi: Jev'siz "izin (tam güven)".
type Satir = { b: string; rol: string; arac: string; girdi: string | Record<string, string>; karar: string; jev: string[]; yerel?: boolean; alanlar?: string[];
  kademe?: "kullanici" | "jev" | "tam"; alan_otomatik?: boolean;
  jevHata?: number; laya?: "guvenli" | "riskli" | "hata" }; // Laya yedeği: Jev HTTP hatası (429) verir, karar Laya'dan; LAYA: öneki karar_kaynagi "laya-yedek"
const layaCevap = (secim: string, guven: number) => ({ answers: { risk: { type: "choice", choice: secim, confidence: guven, probabilities: {} }, dis_etki: { noul: 0.1 } } });
const TABLO: Satir[] = [
  // Tur 5 örnekleri (T5)
  { b: "T5", rol: "isci", arac: "Bash", girdi: "echo $'\\' | grep '; touch PWN #'", karar: "TEK", jev: ["echo $'\\' | grep '; touch PWN #'"] },
  { b: "T5", rol: "isci", arac: "Bash", girdi: "ls; echo $'\\' | grep '; touch PWN #'", karar: "TEK", jev: ["ls; echo $'\\' | grep '; touch PWN #'"] },
  { b: "T5", rol: "isci", arac: "PowerShell", girdi: "sal grep Out-File; Get-Content a.txt | grep hedef.txt", karar: "TEK", jev: ["sal grep Out-File; Get-Content a.txt | grep hedef.txt"] },
  { b: "T5", rol: "isci", arac: "PowerShell", girdi: "nal grep Out-File; Get-Content a.txt | grep hedef.txt", karar: "TEK", jev: ["nal grep Out-File; Get-Content a.txt | grep hedef.txt"] },
  { b: "T5", rol: "isci", arac: "PowerShell", girdi: "Set-Content Env:PATH C:/x; Get-Content a.txt | Select-Object -First 1", karar: "TEK", jev: ["Set-Content Env:PATH C:/x; Get-Content a.txt | Select-Object -First 1"] },
  { b: "T5", rol: "isci", arac: "PowerShell", girdi: "ni Env:PATH -Value C:/x -Force; Get-Content a.txt | Select-Object -First 1", karar: "TEK", jev: ["ni Env:PATH -Value C:/x -Force; Get-Content a.txt | Select-Object -First 1"] },
  { b: "T5", rol: "isci", arac: "Bash", girdi: "printf -v PATH %s /c/x/araclar; cat a.txt | grep x", karar: "TEK", jev: ["printf -v PATH %s /c/x/araclar; cat a.txt | grep x"] },
  { b: "T5", rol: "isci", arac: "Bash", girdi: "read -r P < yol.txt; cat a.txt | grep x", karar: "TEK", jev: ["read -r P < yol.txt; cat a.txt | grep x"] },
  { b: "T5", rol: "isci", arac: "Bash", girdi: "cp betik bin/grep; cat a | grep x", karar: "TEK", jev: ["cp betik bin/grep; cat a | grep x"] },
  { b: "T5", rol: "isci", arac: "PowerShell", girdi: "New-Item function:grep -Value 'x'; Get-Content a | grep y", karar: "TEK", jev: ["New-Item function:grep -Value 'x'; Get-Content a | grep y"] },
  { b: "T5", rol: "isci", arac: "Bash", girdi: "X=1; ls", karar: "TEK", jev: ["X=1; ls"] },
  { b: "T5", rol: "isci", arac: "Bash", girdi: "echo $\"a\" | grep x", karar: "TEK", jev: ["echo $\"a\" | grep x"] },
  // worktree kısa yolu (WT)
  { b: "WT", rol: "denetci", arac: "Bash", girdi: "git worktree add --detach \"<KOPYA>/m1\" is/x", karar: "TEK", jev: ["git worktree add --detach \"<KOPYA>/m1\" is/x"] },
  { b: "WT", rol: "denetci", arac: "Bash", girdi: "git -C \"<WT>\" worktree add --detach \"<KOPYA>/m1\" HEAD", karar: "TEK", jev: ["git -C \"<WT>\" worktree add --detach \"<KOPYA>/m1\" HEAD"] },
  { b: "WT", rol: "denetci", arac: "Bash", girdi: "git worktree add --detach \"<KOPYA>/m1\" HEAD 2>&1 | tail -2", karar: "PARCA:1", jev: ["git worktree add --detach \"<KOPYA>/m1\" HEAD 2>&1"] },
  { b: "WT", rol: "denetci", arac: "PowerShell", girdi: "git -C '<WT>' worktree add '<KOPYA>/m1' HEAD", karar: "TEK", jev: ["git -C '<WT>' worktree add '<KOPYA>/m1' HEAD"] },
  { b: "WT", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/m1\" --detach", karar: "TEK", jev: ["git worktree add \"<KOPYA>/m1\" --detach"] },
  { b: "WT", rol: "denetci", arac: "Bash", girdi: "git worktree --detach add \"<KOPYA>/m1\"", karar: "TEK", jev: ["git worktree --detach add \"<KOPYA>/m1\""] },
  { b: "WT", rol: "denetci", arac: "Bash", girdi: "git worktree add -- \"<KOPYA>/m1\" HEAD", karar: "TEK", jev: ["git worktree add -- \"<KOPYA>/m1\" HEAD"] },
  { b: "WT", rol: "denetci", arac: "Bash", girdi: "git worktree add --detach -- \"<KOPYA>/m1\"", karar: "TEK", jev: ["git worktree add --detach -- \"<KOPYA>/m1\""] },
  { b: "WT", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/m1\" -- HEAD", karar: "TEK", jev: ["git worktree add \"<KOPYA>/m1\" -- HEAD"] },
  { b: "WT", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/m1\" HEAD --", karar: "TEK", jev: ["git worktree add \"<KOPYA>/m1\" HEAD --"] },
  { b: "WT", rol: "denetci", arac: "Bash", girdi: "git worktree add --det \"<KOPYA>/m1\" HEAD", karar: "TEK", jev: ["git worktree add --det \"<KOPYA>/m1\" HEAD"] },
  { b: "WT", rol: "denetci", arac: "Bash", girdi: "git worktree add --detac \"<KOPYA>/m1\"", karar: "TEK", jev: ["git worktree add --detac \"<KOPYA>/m1\""] },
  { b: "WT", rol: "denetci", arac: "Bash", girdi: "git worktree add --detach=1 \"<KOPYA>/m1\"", karar: "TEK", jev: ["git worktree add --detach=1 \"<KOPYA>/m1\""] },
  { b: "WT", rol: "denetci", arac: "Bash", girdi: "git -c core.hooksPath=C:/x worktree add --detach \"<KOPYA>/m1\"", karar: "RED", jev: [] }, // av6: kesin yasak beklenenden sıkı, red beklenir
  { b: "WT", rol: "denetci", arac: "Bash", girdi: "git -C \"<WT>\" -c x.y=z worktree add \"<KOPYA>/m1\"", karar: "TEK", jev: ["git -C \"<WT>\" -c x.y=z worktree add \"<KOPYA>/m1\""] },
  { b: "WT", rol: "denetci", arac: "Bash", girdi: "git --git-dir=C:/x worktree add \"<KOPYA>/m1\"", karar: "TEK", jev: ["git --git-dir=C:/x worktree add \"<KOPYA>/m1\""] },
  { b: "WT", rol: "denetci", arac: "Bash", girdi: "git -C\"<WT>\" worktree add \"<KOPYA>/m1\"", karar: "TEK", jev: ["git -C\"<WT>\" worktree add \"<KOPYA>/m1\""] },
  { b: "WT", rol: "denetci", arac: "Bash", girdi: "git -C \"<WT>/../isci1\" worktree add \"<KOPYA>/m1\"", karar: "TEK", jev: ["git -C \"<WT>/../isci1\" worktree add \"<KOPYA>/m1\""] },
  { b: "WT", rol: "denetci", arac: "Bash", girdi: "git -C .worktrees/isci1 worktree add \"<KOPYA>/m1\"", karar: "TEK", jev: ["git -C .worktrees/isci1 worktree add \"<KOPYA>/m1\""] },
  { b: "WT", rol: "denetci", arac: "Bash", girdi: "git -C <WT\\> worktree add \"<KOPYA>/m1\"", karar: "TEK", jev: ["git -C <WT\\> worktree add \"<KOPYA>/m1\""] },
  { b: "WT", rol: "denetci", arac: "Bash", girdi: "git -C \"<ANA>\" worktree add \"<KOPYA>/m1\"", karar: "TEK", jev: ["git -C \"<ANA>\" worktree add \"<KOPYA>/m1\""] },
  { b: "WT", rol: "denetci", arac: "Bash", girdi: "git -C \"//sunucu/pay/repo\" worktree add \"<KOPYA>/m1\"", karar: "TEK", jev: ["git -C \"//sunucu/pay/repo\" worktree add \"<KOPYA>/m1\""] },
  { b: "WT", rol: "denetci", arac: "Bash", girdi: "git -C \"C:/\" worktree add \"<KOPYA>/m1\"", karar: "TEK", jev: ["git -C \"C:/\" worktree add \"<KOPYA>/m1\""] },
  { b: "WT", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/m1\" -b", karar: "TEK", jev: ["git worktree add \"<KOPYA>/m1\" -b"] },
  { b: "WT", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/m1\" '-b'", karar: "TEK", jev: ["git worktree add \"<KOPYA>/m1\" '-b'"] },
  { b: "WT", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/m1\" --orphan", karar: "TEK", jev: ["git worktree add \"<KOPYA>/m1\" --orphan"] },
  { b: "WT", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/m1\" HEAD -f", karar: "TEK", jev: ["git worktree add \"<KOPYA>/m1\" HEAD -f"] },
  { b: "WT", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/m1\" @{-1}", karar: "TEK", jev: ["git worktree add \"<KOPYA>/m1\" @{-1}"] },
  { b: "WT", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/m1\" \"HEAD\"", karar: "TEK", jev: ["git worktree add \"<KOPYA>/m1\" \"HEAD\""] },
  { b: "WT", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/m1\" HEAD 2>&1 > out.txt", karar: "TEK", jev: ["git worktree add \"<KOPYA>/m1\" HEAD 2>&1 > out.txt"] },
  { b: "WT", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/m1\" HEAD 1>&2", karar: "TEK", jev: ["git worktree add \"<KOPYA>/m1\" HEAD 1>&2"] },
  { b: "WT", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/m1\" HEAD | tail -2; ls", karar: "PARCA:2", jev: ["git worktree add \"<KOPYA>/m1\" HEAD","ls"] },
  { b: "WT", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>\" HEAD", karar: "TEK", jev: ["git worktree add \"<KOPYA>\" HEAD"] },
  { b: "WT", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/a/../../x\" HEAD", karar: "TEK", jev: ["git worktree add \"<KOPYA>/a/../../x\" HEAD"] },
  { b: "WT", rol: "denetci", arac: "Bash", girdi: "git.exe worktree add \"<KOPYA>/m1\"", karar: "TEK", jev: ["git.exe worktree add \"<KOPYA>/m1\""] },
  { b: "WT", rol: "isci", arac: "Bash", girdi: "git worktree add --detach \"<KOPYA>/m1\" HEAD", karar: "TEK", jev: ["git worktree add --detach \"<KOPYA>/m1\" HEAD"] },
  { b: "WT", rol: "denetci", arac: "PowerShell", girdi: "git worktree add '<KOPYA>/m1' HEAD,--force", karar: "TEK", jev: ["git worktree add '<KOPYA>/m1' HEAD,--force"] },
  { b: "WT", rol: "denetci", arac: "PowerShell", girdi: "git worktree add '<KOPYA>/m1',-b,yeni", karar: "TEK", jev: ["git worktree add '<KOPYA>/m1',-b,yeni"] },
  { b: "WT", rol: "denetci", arac: "PowerShell", girdi: "git -C '<WT>',-c,core.hooksPath=C:/x worktree add '<KOPYA>/m1'", karar: "RED", jev: [] }, // av6: kesin yasak beklenenden sıkı, red beklenir
  { b: "WT", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/m1\" HEAD,--force", karar: "TEK", jev: ["git worktree add \"<KOPYA>/m1\" HEAD,--force"] },
  { b: "WT", rol: "denetci", arac: "PowerShell", girdi: "git -C '<WT>',-c,core.fsmonitor=x worktree add '<KOPYA>/m1'", karar: "RED", jev: [] }, // av6: kesin yasak beklenenden sıkı, red beklenir
  { b: "WT", rol: "denetci", arac: "PowerShell", girdi: "git -C '<WT>',-c,core.sshCommand=x worktree add '<KOPYA>/m1'", karar: "TEK", jev: ["git -C '<WT>',-c,core.sshCommand=x worktree add '<KOPYA>/m1'"] },
  { b: "WT", rol: "denetci", arac: "PowerShell", girdi: "git -C '<WT>',--exec-path=C:/x worktree add '<KOPYA>/m1'", karar: "TEK", jev: ["git -C '<WT>',--exec-path=C:/x worktree add '<KOPYA>/m1'"] },
  { b: "WT", rol: "denetci", arac: "PowerShell", girdi: "git worktree add '<KOPYA>/m1' HEAD,--no-checkout", karar: "TEK", jev: ["git worktree add '<KOPYA>/m1' HEAD,--no-checkout"] },
  { b: "WT", rol: "denetci", arac: "Bash", girdi: "git -C \"<WT>\",-c,core.fsmonitor=x worktree add \"<KOPYA>/m1\"", karar: "RED", jev: [] }, // av6: kesin yasak beklenenden sıkı, red beklenir
  { b: "WT", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/a\"; git worktree add \"<KOPYA>/m1\" HEAD", karar: "TEK", jev: ["rm -rf \"<KOPYA>/a\"; git worktree add \"<KOPYA>/m1\" HEAD"] },
  // izin listesindeki komutların kod çalıştıran biçimleri (KC)
  { b: "KC", rol: "isci", arac: "Bash", girdi: "node -e \"require('fs').writeFileSync('x','y')\"", karar: "TEK", jev: ["node -e \"require('fs').writeFileSync('x','y')\""] },
  { b: "KC", rol: "isci", arac: "Bash", girdi: "ls; node -e \"console.log(1)\"", karar: "PARCA:2", jev: ["ls","node -e \"console.log(1)\""] },
  { b: "KC", rol: "isci", arac: "Bash", girdi: "npx cowsay hi; ls", karar: "PARCA:2", jev: ["npx cowsay hi","ls"] },
  { b: "KC", rol: "isci", arac: "Bash", girdi: "npm run kapat && ls", karar: "PARCA:2", jev: ["npm run kapat","ls"] },
  { b: "KC", rol: "isci", arac: "Bash", girdi: "echo x > a.txt; ls", karar: "PARCA:2", jev: ["echo x > a.txt","ls"] },
  { b: "KC", rol: "isci", arac: "Bash", girdi: "cat a.txt | grep x", karar: "PARCA:1", jev: ["cat a.txt"] },
  { b: "KC", rol: "isci", arac: "Bash", girdi: "ls | cat a.txt", karar: "TEK", jev: ["ls | cat a.txt"] },
  { b: "KC", rol: "isci", arac: "Bash", girdi: "git status | cat", karar: "PARCA:1", jev: ["git status"] },
  { b: "KC", rol: "isci", arac: "Bash", girdi: "npm test | node -e \"x\"", karar: "TEK", jev: ["npm test | node -e \"x\""] },
  { b: "KC", rol: "isci", arac: "Bash", girdi: "tsx x.ts; ls", karar: "PARCA:2", jev: ["tsx x.ts","ls"] },
  { b: "KC", rol: "isci", arac: "Bash", girdi: "echo hi | tee x", karar: "TEK", jev: ["echo hi | tee x"] },
  { b: "KC", rol: "isci", arac: "Bash", girdi: "node x.js | tail -2", karar: "PARCA:1", jev: ["node x.js"] },
  { b: "KC", rol: "isci", arac: "PowerShell", girdi: "Write-Output a > b.txt; dir", karar: "PARCA:2", jev: ["Write-Output a > b.txt","dir"] },
  { b: "KC", rol: "isci", arac: "Bash", girdi: "cat a | tail -2 > x", karar: "TEK", jev: ["cat a | tail -2 > x"] },
  { b: "KC", rol: "isci", arac: "Bash", girdi: "npx -y paket && npm install x", karar: "PARCA:2", jev: ["npx -y paket","npm install x"] },
  { b: "KC", rol: "isci", arac: "Bash", girdi: "node --eval x; ls", karar: "PARCA:2", jev: ["node --eval x","ls"] },
  { b: "KC", rol: "isci", arac: "Bash", girdi: "ls; npm exec -- x", karar: "PARCA:2", jev: ["ls","npm exec -- x"] },
  { b: "KC", rol: "denetci", arac: "Bash", girdi: "node -e \"x\"; git worktree add \"<KOPYA>/m1\"", karar: "PARCA:2", jev: ["node -e \"x\"","git worktree add \"<KOPYA>/m1\""] },
  // silme (SL)
  { b: "SL", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/m1/dist\"", karar: "TEK", jev: ["rm -rf \"<KOPYA>/m1/dist\""] },
  { b: "SL", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/m1/dist\"; ls", karar: "TEK", jev: ["rm -rf \"<KOPYA>/m1/dist\"; ls"] },
  { b: "SL", rol: "denetci", arac: "Bash", girdi: "ls && rm -rf \"<KOPYA>/m1/dist\"", karar: "TEK", jev: ["ls && rm -rf \"<KOPYA>/m1/dist\""] },
  { b: "SL", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/a'", karar: "TEK", jev: ["Remove-Item -Recurse -Force '<KOPYA>/a'"] },
  { b: "SL", rol: "denetci", arac: "Bash", girdi: "rm -rf dist", karar: "TEK", jev: ["rm -rf dist"] },
  { b: "SL", rol: "denetci", arac: "Bash", girdi: "rm -rf dist; ls", karar: "TEK", jev: ["rm -rf dist; ls"] },
  { b: "SL", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>\"", karar: "INSAN", jev: [] },
  { b: "SL", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/x/../..\"", karar: "INSAN", jev: [] },
  { b: "SL", rol: "denetci", arac: "PowerShell", girdi: "rm -r -fo '<KOPYA>/a','<ANA>'", karar: "INSAN", jev: [] },
  { b: "SL", rol: "denetci", arac: "Bash", girdi: "rm -rf \"$D/x\"", karar: "RED", jev: [] },
  { b: "SL", rol: "denetci", arac: "Bash", girdi: "ls; rm -rf \"$D/x\"", karar: "RED", jev: [] },
  { b: "SL", rol: "denetci", arac: "Bash", girdi: "rm -rf %TEMP%/x", karar: "RED", jev: [] },
  { b: "SL", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force \"$env:TEMP/x\"", karar: "RED", jev: [] },
  { b: "SL", rol: "isci", arac: "Bash", girdi: "rm -rf \"$D/x\"", karar: "INSAN", jev: [] },
  { b: "SL", rol: "isci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force \"$env:TEMP/x\"", karar: "INSAN", jev: [] },
  { b: "SL", rol: "sef", arac: "Bash", girdi: "rm -rf \"$D/x\"", karar: "INSAN", jev: [] },
  { b: "SL", rol: "isci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/a\"", karar: "INSAN", jev: [] },
  { b: "SL", rol: "denetci", arac: "Bash", girdi: "rm \"$D/x\"", karar: "TEK", jev: ["rm \"$D/x\""] },
  // kesin yasak önce (KY)
  { b: "KY", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/m1\" HEAD; git push --force", karar: "RED", jev: [] },
  { b: "KY", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/a\"; git push --force", karar: "RED", jev: [] },
  { b: "KY", rol: "denetci", arac: "Bash", girdi: "rm -rf \"$D/x\"; git push --force", karar: "RED", jev: [] },
  { b: "KY", rol: "isci", arac: "Bash", girdi: "ls; git reset --hard", karar: "INSAN", jev: [] },
  // hata-avi-7 (av7)
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "ls; git status", karar: "PARCA:2", jev: ["ls","git status"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "ls\ngit status", karar: "TEK", jev: ["ls\ngit status"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "ls\r\ngit status", karar: "TEK", jev: ["ls\r\ngit status"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "git status | Select-Object -First 2", karar: "PARCA:1", jev: ["git status"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "git status && ls", karar: "PARCA:2", jev: ["git status","ls"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "git status || ls", karar: "PARCA:2", jev: ["git status","ls"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "(git status); ls", karar: "TEK", jev: ["(git status); ls"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "$(git status); ls", karar: "TEK", jev: ["$(git status); ls"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "@(git status); ls", karar: "TEK", jev: ["@(git status); ls"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "{ git status }; ls", karar: "TEK", jev: ["{ git status }; ls"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "& git status; ls", karar: "TEK", jev: ["& git status; ls"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "& 'C:/x/a.exe'", karar: "TEK", jev: ["& 'C:/x/a.exe'"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: ". ./betik.ps1; ls", karar: "TEK", jev: [". ./betik.ps1; ls"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: ". .\\betik.ps1", karar: "TEK", jev: [". .\\betik.ps1"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "git --% status; ls", karar: "TEK", jev: ["git --% status; ls"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "git sta`tus; ls", karar: "TEK", jev: ["git sta`tus; ls"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "ls `; git status", karar: "TEK", jev: ["ls `; git status"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "echo a,b; ls", karar: "TEK", jev: ["echo a,b; ls"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "ls; git @a", karar: "TEK", jev: ["ls; git @a"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "ls; echo \"$x\"", karar: "PARCA:2", jev: ["ls","echo \"$x\""] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "ls; echo \"$(git push --force)\"", karar: "RED", jev: [] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "ls # yorum", karar: "TEK", jev: ["ls # yorum"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "ls; <# a #> git status", karar: "TEK", jev: ["ls; <# a #> git status"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "ls 2>$null; git status", karar: "TEK", jev: ["ls 2>$null; git status"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "ls; git status *> x.txt", karar: "PARCA:2", jev: ["ls","git status *> x.txt"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "ls; echo ‘a; git status’", karar: "TEK", jev: ["ls; echo ‘a; git status’"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "ls; git –version", karar: "TEK", jev: ["ls; git –version"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "ls; git status", karar: "TEK", jev: ["ls; git status"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "ls;git status", karar: "PARCA:2", jev: ["ls","git status"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "Get-ChildItem | Select-Object -First 3; git status", karar: "PARCA:2", jev: ["Get-ChildItem","git status"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "ls; Get-Content a.txt | Out-File b.txt", karar: "TEK", jev: ["ls; Get-Content a.txt | Out-File b.txt"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "ls; [IO.File]::Delete('x')", karar: "TEK", jev: ["ls; [IO.File]::Delete('x')"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "ls; mkdir x", karar: "PARCA:2", jev: ["ls","mkdir x"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "echo 'a'';ls;''b'", karar: "TEK", jev: ["echo 'a'';ls;''b'"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "ls; echo \"a\"\";ls;\"\"b\"", karar: "PARCA:2", jev: ["ls","echo \"a\"\";ls;\"\"b\""] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "ls; git log --format=%H", karar: "PARCA:2", jev: ["ls","git log --format=%H"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "ls | Remove-Item", karar: "TEK", jev: ["ls | Remove-Item"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "ls | % { $_ }", karar: "TEK", jev: ["ls | % { $_ }"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "ls; sal ls Remove-Item", karar: "TEK", jev: ["ls; sal ls Remove-Item"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "ls; function ls { x }", karar: "TEK", jev: ["ls; function ls { x }"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "ls; git status 2>&1 | iex", karar: "TEK", jev: ["ls; git status 2>&1 | iex"] },
  { b: "L1", rol: "isci", arac: "PowerShell", girdi: "Get-ChildItem -Path . | Invoke-Expression", karar: "TEK", jev: ["Get-ChildItem -Path . | Invoke-Expression"] },
  { b: "L2", rol: "isci", arac: "Bash", girdi: "ls & git status", karar: "TEK", jev: ["ls & git status"] },
  { b: "L2", rol: "isci", arac: "Bash", girdi: "ls ^& git status", karar: "TEK", jev: ["ls ^& git status"] },
  { b: "L2", rol: "isci", arac: "Bash", girdi: "echo %PATH%; ls", karar: "PARCA:2", jev: ["echo %PATH%","ls"] },
  { b: "L2", rol: "isci", arac: "Bash", girdi: "cmd /c \"ls & git status\"", karar: "TEK", jev: ["cmd /c \"ls & git status\""] },
  { b: "L2", rol: "isci", arac: "Bash", girdi: "ls; cmd /c git status", karar: "TEK", jev: ["ls; cmd /c git status"] },
  { b: "L2", rol: "isci", arac: "Bash", girdi: "ls; cmd.exe /c git status", karar: "TEK", jev: ["ls; cmd.exe /c git status"] },
  { b: "L2", rol: "isci", arac: "Bash", girdi: "ls\ngit status", karar: "TEK", jev: ["ls\ngit status"] },
  { b: "L2", rol: "isci", arac: "Bash", girdi: "ls; git status &", karar: "TEK", jev: ["ls; git status &"] },
  { b: "L2", rol: "isci", arac: "Bash", girdi: "cmd /c rd /s /q C:\\x", karar: "INSAN", jev: [] },
  { b: "L2", rol: "isci", arac: "Bash", girdi: "ls; (git status)", karar: "TEK", jev: ["ls; (git status)"] },
  { b: "L2", rol: "isci", arac: "Bash", girdi: "ls; { git status; }", karar: "TEK", jev: ["ls; { git status; }"] },
  { b: "L2", rol: "isci", arac: "Bash", girdi: "ls; git status |& cat", karar: "TEK", jev: ["ls; git status |& cat"] },
  { b: "L2", rol: "isci", arac: "Bash", girdi: "ls; git status >| x", karar: "TEK", jev: ["ls; git status >| x"] },
  { b: "L2", rol: "isci", arac: "Bash", girdi: "ls; . ./x.sh", karar: "TEK", jev: ["ls; . ./x.sh"] },
  { b: "L2", rol: "isci", arac: "Bash", girdi: "ls; source x.sh", karar: "TEK", jev: ["ls; source x.sh"] },
  { b: "L2", rol: "isci", arac: "Bash", girdi: "ls; exec git status", karar: "TEK", jev: ["ls; exec git status"] },
  { b: "L2", rol: "isci", arac: "Bash", girdi: "ls; command git status", karar: "TEK", jev: ["ls; command git status"] },
  { b: "L2", rol: "isci", arac: "Bash", girdi: "ls; git status <<< x", karar: "TEK", jev: ["ls; git status <<< x"] },
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA_UP>/a\"", karar: "TEK", jev: ["rm -rf \"<KOPYA_UP>/a\""] },
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA_LO>/a\"", karar: "TEK", jev: ["rm -rf \"<KOPYA_LO>/a\""] },
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA\\>\\a\"", karar: "TEK", jev: ["rm -rf \"<KOPYA\\>\\a\""] },
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm -rf <KOPYA\\>\\a", karar: "TEK", jev: ["rm -rf <KOPYA\\>\\a"] },
  { b: "SL2", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force <KOPYA\\>\\a", karar: "TEK", jev: ["Remove-Item -Recurse -Force <KOPYA\\>\\a"] },
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA_GB>/a\"", karar: "TEK", jev: ["rm -rf \"<KOPYA_GB>/a\""] },
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"//?/<KOPYA>/a\"", karar: "TEK", jev: ["rm -rf \"//?/<KOPYA>/a\""] },
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"//sunucu/pay/isci1-1/a\"", karar: "INSAN", jev: [] },
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"//localhost/C$/x/a\"", karar: "RED", jev: [] },
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/\"", karar: "INSAN", jev: [] },
  { b: "SL2", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA\\>\\'", karar: "INSAN", jev: [] },
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/.\"", karar: "INSAN", jev: [] },
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/./\"", karar: "INSAN", jev: [] },
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>//\"", karar: "INSAN", jev: [] },
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>.\"", karar: "INSAN", jev: [] },
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/...\"", karar: "INSAN", jev: [] }, // av7 B1: kanonik "..." ve ".. " bileşenini ".." sayar, hedef kopya dışı: kesin yasak (TEK'ten sıkı)
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/.. \"", karar: "INSAN", jev: [] },
  { b: "SL2", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/.. /x'", karar: "INSAN", jev: [] }, // av7 B1: kanonik "..." ve ".. " bileşenini ".." sayar, hedef kopya dışı: kesin yasak (TEK'ten sıkı)
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/ \"", karar: "INSAN", jev: [] },
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/. \"", karar: "INSAN", jev: [] },
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/m1/.\"", karar: "TEK", jev: ["rm -rf \"<KOPYA>/m1/.\""] }, // av7 B1: yalnız [A-Za-z0-9._-] bileşen kısa yola girer (KOD'dan sıkı)
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/./m1\"", karar: "TEK", jev: ["rm -rf \"<KOPYA>/./m1\""] }, // av7 B1: yalnız [A-Za-z0-9._-] bileşen kısa yola girer (KOD'dan sıkı)
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/m1:x\"", karar: "TEK", jev: ["rm -rf \"<KOPYA>/m1:x\""] }, // av7 B1: yalnız [A-Za-z0-9._-] bileşen kısa yola girer (KOD'dan sıkı)
  { b: "SL2", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/a' -LiteralPath:'<ANA>'", karar: "INSAN", jev: [] }, // av7: bugün KOD
  { b: "SL2", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force -Path:'<ANA>'", karar: "INSAN", jev: [] },
  { b: "SL2", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force -Path:'<KOPYA>/a' '<ANA>'", karar: "INSAN", jev: [] },
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm -rf -- \"<KOPYA>/a\"", karar: "TEK", jev: ["rm -rf -- \"<KOPYA>/a\""] },
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/a\" -- \"<ANA>\"", karar: "INSAN", jev: [] },
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm -rf -- \"<KOPYA>/a\" -src", karar: "TEK", jev: ["rm -rf -- \"<KOPYA>/a\" -src"] }, // av7: bugün KOD
  { b: "SL2", rol: "denetci", arac: "PowerShell", girdi: "rm -r -fo '<KOPYA>/a' & rm -r -fo '<ANA>'", karar: "INSAN", jev: [] },
  { b: "SL2", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/a'; Remove-Item -Recurse -Force '<KOPYA>/b'", karar: "TEK", jev: ["Remove-Item -Recurse -Force '<KOPYA>/a'; Remove-Item -Recurse -Force '<KOPYA>/b'"] },
  { b: "SL2", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force ('<KOPYA>/a')", karar: "INSAN", jev: [] },
  { b: "SL2", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/a' -WhatIf:$false", karar: "TEK", jev: ["Remove-Item -Recurse -Force '<KOPYA>/a' -WhatIf:$false"] },
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/a\" 2>/dev/null", karar: "INSAN", jev: [] },
  { b: "SL2", rol: "denetci", arac: "PowerShell", girdi: "rd -r '<KOPYA>/a'", karar: "TEK", jev: ["rd -r '<KOPYA>/a'"] },
  { b: "SL2", rol: "denetci", arac: "PowerShell", girdi: "del -r '<KOPYA>/a'", karar: "TEK", jev: ["del -r '<KOPYA>/a'"] },
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/a\" \"<KOPYA>/b\"", karar: "TEK", jev: ["rm -rf \"<KOPYA>/a\" \"<KOPYA>/b\""] },
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/a\" \"<KOPYA>\"", karar: "INSAN", jev: [] },
  { b: "SL2", rol: "isci", arac: "Bash", girdi: "rm -rf \"<KOPYA_UP>/a\"", karar: "INSAN", jev: [] },
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm -Rf \"<KOPYA>/a\"", karar: "TEK", jev: ["rm -Rf \"<KOPYA>/a\""] },
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm --recursive --force \"<KOPYA>/a\"", karar: "TEK", jev: ["rm --recursive --force \"<KOPYA>/a\""] },
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "/bin/rm -rf \"<KOPYA>/a\"", karar: "TEK", jev: ["/bin/rm -rf \"<KOPYA>/a\""] },
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm.exe -rf \"<KOPYA>/a\"", karar: "TEK", jev: ["rm.exe -rf \"<KOPYA>/a\""] },
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "command rm -rf \"<KOPYA>/a\"", karar: "TEK", jev: ["command rm -rf \"<KOPYA>/a\""] },
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/a\" ~", karar: "INSAN", jev: [] },
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/a\" \"~/x\"", karar: "INSAN", jev: [] },
  { b: "SL2", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/a' -Path 'C:/'", karar: "INSAN", jev: [] },
  { b: "WT2", rol: "denetci", arac: "PowerShell", girdi: "git worktree add --detach '<KOPYA>/m1' HEAD", karar: "TEK", jev: ["git worktree add --detach '<KOPYA>/m1' HEAD"] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA_UP>/m1\"", karar: "TEK", jev: ["git worktree add \"<KOPYA_UP>/m1\""] },
  { b: "WT2", rol: "denetci", arac: "PowerShell", girdi: "git worktree add '<KOPYA_LO>/m1'", karar: "TEK", jev: ["git worktree add '<KOPYA_LO>/m1'"] },
  { b: "WT2", rol: "denetci", arac: "PowerShell", girdi: "git worktree add '<KOPYA\\>\\m1'", karar: "TEK", jev: ["git worktree add '<KOPYA\\>\\m1'"] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add <KOPYA\\>\\m1", karar: "TEK", jev: ["git worktree add <KOPYA\\>\\m1"] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA_GB>/m1\"", karar: "TEK", jev: ["git worktree add \"<KOPYA_GB>/m1\""] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA_83>/m1\"", karar: "TEK", jev: ["git worktree add \"<KOPYA_83>/m1\""] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/.\"", karar: "TEK", jev: ["git worktree add \"<KOPYA>/.\""] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>.\"", karar: "TEK", jev: ["git worktree add \"<KOPYA>.\""] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/...\"", karar: "TEK", jev: ["git worktree add \"<KOPYA>/...\""] }, // av7: bugün KOD
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/ \"", karar: "TEK", jev: ["git worktree add \"<KOPYA>/ \""] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/.. /x\"", karar: "TEK", jev: ["git worktree add \"<KOPYA>/.. /x\""] }, // av7: bugün KOD
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add \"//sunucu/pay/m1\"", karar: "TEK", jev: ["git worktree add \"//sunucu/pay/m1\""] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add -f \"<KOPYA>/m1\"", karar: "TEK", jev: ["git worktree add -f \"<KOPYA>/m1\""] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add --force \"<KOPYA>/m1\"", karar: "TEK", jev: ["git worktree add --force \"<KOPYA>/m1\""] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add -b x \"<KOPYA>/m1\"", karar: "TEK", jev: ["git worktree add -b x \"<KOPYA>/m1\""] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add -B x \"<KOPYA>/m1\"", karar: "TEK", jev: ["git worktree add -B x \"<KOPYA>/m1\""] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add --lock \"<KOPYA>/m1\"", karar: "TEK", jev: ["git worktree add --lock \"<KOPYA>/m1\""] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add --lock --reason x \"<KOPYA>/m1\"", karar: "TEK", jev: ["git worktree add --lock --reason x \"<KOPYA>/m1\""] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add --no-checkout \"<KOPYA>/m1\"", karar: "TEK", jev: ["git worktree add --no-checkout \"<KOPYA>/m1\""] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add -q \"<KOPYA>/m1\"", karar: "TEK", jev: ["git worktree add -q \"<KOPYA>/m1\""] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add --track \"<KOPYA>/m1\" origin/main", karar: "TEK", jev: ["git worktree add --track \"<KOPYA>/m1\" origin/main"] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add --guess-remote \"<KOPYA>/m1\"", karar: "TEK", jev: ["git worktree add --guess-remote \"<KOPYA>/m1\""] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add --orphan \"<KOPYA>/m1\"", karar: "TEK", jev: ["git worktree add --orphan \"<KOPYA>/m1\""] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add --detach --detach \"<KOPYA>/m1\"", karar: "TEK", jev: ["git worktree add --detach --detach \"<KOPYA>/m1\""] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add --detach -f \"<KOPYA>/m1\"", karar: "TEK", jev: ["git worktree add --detach -f \"<KOPYA>/m1\""] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add --relative-paths \"<KOPYA>/m1\"", karar: "TEK", jev: ["git worktree add --relative-paths \"<KOPYA>/m1\""] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/m1\" HEAD~1", karar: "TEK", jev: ["git worktree add \"<KOPYA>/m1\" HEAD~1"] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/m1\" origin/main", karar: "TEK", jev: ["git worktree add \"<KOPYA>/m1\" origin/main"] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/m1\" \\-b", karar: "TEK", jev: ["git worktree add \"<KOPYA>/m1\" \\-b"] },
  { b: "WT2", rol: "denetci", arac: "PowerShell", girdi: "git worktree add '<KOPYA>/m1' -b", karar: "TEK", jev: ["git worktree add '<KOPYA>/m1' -b"] },
  { b: "WT2", rol: "denetci", arac: "PowerShell", girdi: "git worktree add '<KOPYA>/m1' `-b", karar: "TEK", jev: ["git worktree add '<KOPYA>/m1' `-b"] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/m1\" HEAD 2>&1 | grep -v x", karar: "PARCA:1", jev: ["git worktree add \"<KOPYA>/m1\" HEAD 2>&1"] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/m1\" HEAD 2>&1 | grep x y.txt", karar: "TEK", jev: ["git worktree add \"<KOPYA>/m1\" HEAD 2>&1 | grep x y.txt"] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git -C \"<KOPYA>\" worktree add \"<KOPYA>/m1\"", karar: "TEK", jev: ["git -C \"<KOPYA>\" worktree add \"<KOPYA>/m1\""] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git -C \"<WT>\" -C \"<ANA>\" worktree add \"<KOPYA>/m1\"", karar: "TEK", jev: ["git -C \"<WT>\" -C \"<ANA>\" worktree add \"<KOPYA>/m1\""] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git --work-tree=x worktree add \"<KOPYA>/m1\"", karar: "TEK", jev: ["git --work-tree=x worktree add \"<KOPYA>/m1\""] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git --no-pager worktree add \"<KOPYA>/m1\"", karar: "TEK", jev: ["git --no-pager worktree add \"<KOPYA>/m1\""] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git -C \"<WT>\" worktree add \"<KOPYA>/m1\" HEAD; git push --force", karar: "RED", jev: [] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/m1\" HEAD && git reset --hard", karar: "INSAN", jev: [] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/m1\" HEAD 2>&1", karar: "TEK", jev: ["git worktree add \"<KOPYA>/m1\" HEAD 2>&1"] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/m1\" HEAD 2> x", karar: "TEK", jev: ["git worktree add \"<KOPYA>/m1\" HEAD 2> x"] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/m1\" HEAD 2>&1 1>&2", karar: "TEK", jev: ["git worktree add \"<KOPYA>/m1\" HEAD 2>&1 1>&2"] },
  { b: "WT2", rol: "denetci", arac: "PowerShell", girdi: "git worktree add '<KOPYA>/m1' \"$x\"", karar: "TEK", jev: ["git worktree add '<KOPYA>/m1' \"$x\""] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/m1\" HEAD 2>&1 | tail -2 | head -1", karar: "PARCA:1", jev: ["git worktree add \"<KOPYA>/m1\" HEAD 2>&1"] },
  { b: "WT2", rol: "isci", arac: "PowerShell", girdi: "git worktree add '<KOPYA>/m1' HEAD", karar: "TEK", jev: ["git worktree add '<KOPYA>/m1' HEAD"] },
  { b: "WT2", rol: "denetci", arac: "PowerShell", girdi: "git worktree add '<KOPYA>/m1' HEAD 2>&1", karar: "TEK", jev: ["git worktree add '<KOPYA>/m1' HEAD 2>&1"] },
  { b: "WT2", rol: "denetci", arac: "PowerShell", girdi: "git worktree add '<KOPYA>/m1' HEAD *>&1", karar: "TEK", jev: ["git worktree add '<KOPYA>/m1' HEAD *>&1"] },
  { b: "WT2", rol: "denetci", arac: "PowerShell", girdi: "git worktree add '<KOPYA>/m1' HEAD\ngit status", karar: "TEK", jev: ["git worktree add '<KOPYA>/m1' HEAD\ngit status"] },
  { b: "WT2", rol: "denetci", arac: "PowerShell", girdi: "& git worktree add '<KOPYA>/m1' HEAD", karar: "TEK", jev: ["& git worktree add '<KOPYA>/m1' HEAD"] },
  { b: "WT2", rol: "denetci", arac: "PowerShell", girdi: "git worktree add '<KOPYA>/m1' HEAD --% -f", karar: "TEK", jev: ["git worktree add '<KOPYA>/m1' HEAD --% -f"] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/m1\" HEAD & ls", karar: "TEK", jev: ["git worktree add \"<KOPYA>/m1\" HEAD & ls"] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "GIT_DIR=x git worktree add \"<KOPYA>/m1\"", karar: "TEK", jev: ["GIT_DIR=x git worktree add \"<KOPYA>/m1\""] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git -c core.hooksPath= worktree add \"<KOPYA>/m1\"", karar: "RED", jev: [] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree \"add\" \"<KOPYA>/m1\" -- ", karar: "TEK", jev: ["git worktree \"add\" \"<KOPYA>/m1\" -- "] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/m1\" HEAD 2>&1 | Select-Object -First 1 | grep x z", karar: "TEK", jev: ["git worktree add \"<KOPYA>/m1\" HEAD 2>&1 | Select-Object -First 1 | grep x z"] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "git -c core.pager=x log; ls", karar: "PARCA:2", jev: ["git -c core.pager=x log","ls"] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "git -c core.hooksPath=x status; ls", karar: "RED", jev: [] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "git --config-env=core.hooksPath=H status; ls", karar: "RED", jev: [] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "git -c Core.HooksPath=x status", karar: "RED", jev: [] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "git -c core.hooksPath status; ls", karar: "RED", jev: [] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "git --exec-path=C:/x status; ls", karar: "PARCA:2", jev: ["git --exec-path=C:/x status","ls"] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "git --exec-path C:/x reset --hard; ls", karar: "PARCA:2", jev: ["git --exec-path C:/x reset --hard","ls"] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "git --git-dir=C:/x reset --hard; ls", karar: "INSAN", jev: [] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "git --git-dir C:/x clean -fd; ls", karar: "INSAN", jev: [] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "git -C C:/x reset --hard", karar: "INSAN", jev: [] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "git -C C:/x -c x.y=z clean -n; ls", karar: "INSAN", jev: [] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "git -C C:/x status; ls", karar: "PARCA:2", jev: ["git -C C:/x status","ls"] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "git -C C:/x push --force; ls", karar: "RED", jev: [] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "git --no-pager -C x push -f", karar: "RED", jev: [] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "git --namespace=x push --force", karar: "RED", jev: [] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "git --work-tree x checkout -- .; ls", karar: "INSAN", jev: [] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "git --bare reset --hard", karar: "INSAN", jev: [] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "git --literal-pathspecs clean -fd", karar: "INSAN", jev: [] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "git -c alias.st=status st; ls", karar: "RED", jev: [] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "git -c x.y=z worktree remove --force x; ls", karar: "PARCA:2", jev: ["git -c x.y=z worktree remove --force x","ls"] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "npm --prefix C:/x run kapat; ls", karar: "PARCA:2", jev: ["npm --prefix C:/x run kapat","ls"] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "npm -C C:/x test; ls", karar: "PARCA:2", jev: ["npm -C C:/x test","ls"] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "npm exec -c \"git push --force\"", karar: "RED", jev: [] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "npx -c 'git reset --hard'; ls", karar: "INSAN", jev: [] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "npm exec --call=\"git clean -fd\"; ls", karar: "INSAN", jev: [] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "npx -c git\\ push\\ --force", karar: "RED", jev: [] }, // av7: bugün TEK
  { b: "IL", rol: "isci", arac: "Bash", girdi: "npx --call=git\\ reset\\ --hard; ls", karar: "INSAN", jev: [] }, // av7: bugün PARCA:2
  { b: "IL", rol: "isci", arac: "Bash", girdi: "npm exec -- git push --force", karar: "RED", jev: [] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "npx git push -f; ls", karar: "RED", jev: [] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "npm run x -- && git push --force", karar: "RED", jev: [] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "node --require ./x.js a.js; ls", karar: "PARCA:2", jev: ["node --require ./x.js a.js","ls"] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "node -r ./x.js a.js | tail -2", karar: "PARCA:1", jev: ["node -r ./x.js a.js"] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "node --import ./x.mjs a.js; ls", karar: "PARCA:2", jev: ["node --import ./x.mjs a.js","ls"] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "node --import=tsx a.ts; ls", karar: "PARCA:2", jev: ["node --import=tsx a.ts","ls"] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "node --import data:text/javascript,x a.js; ls", karar: "PARCA:2", jev: ["node --import data:text/javascript,x a.js","ls"] },
  { b: "IL", rol: "isci", arac: "PowerShell", girdi: "node --import data:text/javascript,x a.js; ls", karar: "TEK", jev: ["node --import data:text/javascript,x a.js; ls"] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "node -e \"require('child_process').execSync('git push --force')\"", karar: "RED", jev: [] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "node -e \"require('child_process').execSync('git reset --hard')\"; ls", karar: "INSAN", jev: [] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "tsx --require ./x.js a.ts; ls", karar: "PARCA:2", jev: ["tsx --require ./x.js a.ts","ls"] },
  { b: "IL", rol: "isci", arac: "Bash", girdi: "node -p \"1\"; ls", karar: "PARCA:2", jev: ["node -p \"1\"","ls"] },
  { b: "IL", rol: "isci", arac: "PowerShell", girdi: "npm --prefix C:/x run kapat; ls", karar: "PARCA:2", jev: ["npm --prefix C:/x run kapat","ls"] },
  { b: "IL", rol: "isci", arac: "PowerShell", girdi: "node --require ./x.js a.js; ls", karar: "PARCA:2", jev: ["node --require ./x.js a.js","ls"] },
  { b: "IL", rol: "isci", arac: "PowerShell", girdi: "git -C C:/x reset --hard; ls", karar: "INSAN", jev: [] },
  { b: "IL", rol: "isci", arac: "PowerShell", girdi: "git -C 'C:/x' -c x.y=z status; ls", karar: "PARCA:2", jev: ["git -C 'C:/x' -c x.y=z status","ls"] },
  { b: "KY2", rol: "isci", arac: "PowerShell", girdi: "npx -c 'git push --force'; ls", karar: "RED", jev: [] },
  { b: "KY2", rol: "isci", arac: "PowerShell", girdi: "npx -c git` push` --force", karar: "RED", jev: [] }, // av7: bugün TEK
  { b: "KY2", rol: "isci", arac: "Bash", girdi: "echo git push --force | sh", karar: "RED", jev: [] },
  { b: "KY2", rol: "isci", arac: "Bash", girdi: "ls; npm exec -c \"rm -rf C:/\"", karar: "INSAN", jev: [] },
  { b: "KY2", rol: "isci", arac: "Bash", girdi: "test -f x && git clean -fd", karar: "INSAN", jev: [] },
  { b: "KY2", rol: "isci", arac: "Bash", girdi: "[ -f x ] && git reset --hard", karar: "INSAN", jev: [] },
  { b: "KY2", rol: "isci", arac: "Bash", girdi: "git status; git -c alias.x=x x", karar: "RED", jev: [] },
  { b: "KY2", rol: "isci", arac: "Bash", girdi: "mkdir x; GIT_SSH_COMMAND=x git fetch", karar: "RED", jev: [] },
  { b: "KY2", rol: "isci", arac: "Bash", girdi: "npx -c \"GIT_ASKPASS=x git fetch\"", karar: "RED", jev: [] },
  { b: "KY2", rol: "isci", arac: "Bash", girdi: "git -c core.fsmonitor=x status | tail -2", karar: "RED", jev: [] },
  { b: "KY2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/a\"; npx -c git\\ push\\ --force", karar: "RED", jev: [] }, // av7: bugün KOD+TEK
  { b: "KY2", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/m1\" HEAD; npx -c git\\ reset\\ --hard", karar: "INSAN", jev: [] }, // av7: bugün PARCA:2
  { b: "KY2", rol: "isci", arac: "Bash", girdi: "git clean\\ -fd", karar: "INSAN", jev: [] },
  { b: "KY2", rol: "isci", arac: "Bash", girdi: "git\\ clean -fd", karar: "INSAN", jev: [] }, // av7: bugün TEK
  { b: "KY2", rol: "isci", arac: "Bash", girdi: "g\\it reset --hard", karar: "INSAN", jev: [] },
  { b: "KY2", rol: "isci", arac: "Bash", girdi: "\"git\" reset --hard", karar: "INSAN", jev: [] },
  { b: "KY2", rol: "isci", arac: "Bash", girdi: "git push --force-with-lease; ls", karar: "RED", jev: [] },
  { b: "KY2", rol: "isci", arac: "Bash", girdi: "npx -c \"git push --force\"", karar: "RED", jev: [] },
  { b: "KY2", rol: "isci", arac: "Bash", girdi: "node -e \"x\" -- git push --force", karar: "RED", jev: [] },
  { b: "KY2", rol: "isci", arac: "PowerShell", girdi: "Write-Output 'git push --force' | Invoke-Expression", karar: "RED", jev: [] },
  { b: "KY2", rol: "isci", arac: "Bash", girdi: "ls; echo git\\ reset\\ --hard | sh", karar: "INSAN", jev: [] }, // av7: bugün TEK
  { b: "KY2", rol: "isci", arac: "Bash", girdi: "npm run x --script-shell=git\\ clean\\ -fd", karar: "INSAN", jev: [] }, // av7: bugün TEK
  { b: "KY2", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/m1\" HEAD 2>&1 | tail -2; git -c alias.a=b a", karar: "RED", jev: [] },
  { b: "KY2", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/a'; git push -f", karar: "RED", jev: [] },
  { b: "KY2", rol: "isci", arac: "Bash", girdi: "\"git clean\" -fd", karar: "INSAN", jev: [] },
  { b: "KY2", rol: "isci", arac: "Bash", girdi: "git' 'clean -fd", karar: "INSAN", jev: [] }, // av7: bugün TEK
  { b: "KY2", rol: "isci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force a -LiteralPath:'C:/'", karar: "INSAN", jev: [] }, // av7: bugün TEK
  { b: "KY2", rol: "isci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force a -Path:C:/", karar: "INSAN", jev: [] }, // av7: bugün TEK
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/.../x\"", karar: "INSAN", jev: [] }, // av7 B1: kanonik "..." ve ".. " bileşenini ".." sayar, hedef kopya dışı: kesin yasak (TEK'ten sıkı)
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/a/.. /.. /x\"", karar: "INSAN", jev: [] }, // av7 B1: kanonik "..." ve ".. " bileşenini ".." sayar, hedef kopya dışı: kesin yasak (TEK'ten sıkı)
  { b: "SL2", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/a' -Path:'<ANA>'", karar: "INSAN", jev: [] }, // av7: bugün KOD
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git -C \"<WT>/...\" worktree add \"<KOPYA>/m1\"", karar: "TEK", jev: ["git -C \"<WT>/...\" worktree add \"<KOPYA>/m1\""] }, // av7: bugün KOD
  // av7 B1 düzeltmesi: \\.\ öneki ("." ve "C:" bileşeni) kısa yolu tutturmaz
  { b: "SL2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"//./<KOPYA>/a\"", karar: "TEK", jev: ["rm -rf \"//./<KOPYA>/a\""] },
  { b: "WT2", rol: "denetci", arac: "Bash", girdi: "git worktree add \"//./<KOPYA>/m1\"", karar: "TEK", jev: ["git worktree add \"//./<KOPYA>/m1\""] },
  // av7 B2 düzeltmesi: -Ad:değer kısaltmaları da hedef; anahtar değeri ($true) hedef değil
  { b: "SL2", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/a' -Lit:'<ANA>'", karar: "INSAN", jev: [] },
  { b: "SL2", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force -Pa:'<KOPYA>/a' '<KOPYA>/b'", karar: "TEK", jev: ["Remove-Item -Recurse -Force -Pa:'<KOPYA>/a' '<KOPYA>/b'"] },
  { b: "KY2", rol: "isci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force a -Pa:C:/", karar: "INSAN", jev: [] },
  { b: "KY2", rol: "isci", arac: "PowerShell", girdi: "Remove-Item -Recurse:$true -Force a", karar: "TEK", jev: ["Remove-Item -Recurse:$true -Force a"] },
  // hata-avi-8 (av8): U1-U4, KY3, RL kümeleri; <REPO> ana repo klasörünün adı
  { b: "U1", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/a\uFF0E\uFF0E/x\"", karar: "TEK", jev: ["rm -rf \"<KOPYA>/a\uFF0E\uFF0E/x\""] },
  { b: "U1", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/\uFF0E\uFF0E\"", karar: "INSAN", jev: [] },
  { b: "U1", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/\u2024\u2024/x\"", karar: "INSAN", jev: [] },
  { b: "U1", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/\u2025\"", karar: "INSAN", jev: [] },
  { b: "U1", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/a\u200B\"", karar: "TEK", jev: ["rm -rf \"<KOPYA>/a\u200B\""] },
  { b: "U1", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/\u200B../x\"", karar: "TEK", jev: ["rm -rf \"<KOPYA>/\u200B../x\""] },
  { b: "U1", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/..\u200B/x\"", karar: "TEK", jev: ["rm -rf \"<KOPYA>/..\u200B/x\""] },
  { b: "U1", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/.\u200D./x\"", karar: "TEK", jev: ["rm -rf \"<KOPYA>/.\u200D./x\""] },
  { b: "U1", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/\uFEFF\"", karar: "INSAN", jev: [] },
  { b: "U1", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>\uFF0Fa\"", karar: "INSAN", jev: [] },
  { b: "U1", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>\u2215a\"", karar: "INSAN", jev: [] },
  { b: "U1", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/m\u0307\"", karar: "TEK", jev: ["rm -rf \"<KOPYA>/m\u0307\""] },
  { b: "U1", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/\uFF0E\uFF0E/x'", karar: "INSAN", jev: [] },
  { b: "U1", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/\u2024\u2024'", karar: "INSAN", jev: [] },
  { b: "U1", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/a\u200B'", karar: "TEK", jev: ["Remove-Item -Recurse -Force '<KOPYA>/a\u200B'"] },
  { b: "U1", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/\uFF0E\uFF0E/m1\"", karar: "TEK", jev: ["git worktree add \"<KOPYA>/\uFF0E\uFF0E/m1\""] },
  { b: "U1", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/\u2024\u2024\"", karar: "TEK", jev: ["git worktree add \"<KOPYA>/\u2024\u2024\""] },
  { b: "U1", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/m1\u200B\"", karar: "TEK", jev: ["git worktree add \"<KOPYA>/m1\u200B\""] },
  { b: "U1", rol: "denetci", arac: "Bash", girdi: "git -C \"<WT>/\u200B\" worktree add \"<KOPYA>/m1\"", karar: "TEK", jev: ["git -C \"<WT>/\u200B\" worktree add \"<KOPYA>/m1\""] },
  { b: "U1", rol: "denetci", arac: "Bash", girdi: "git -C \"<WT>/\uFF0E\uFF0E\" worktree add \"<KOPYA>/m1\"", karar: "TEK", jev: ["git -C \"<WT>/\uFF0E\uFF0E\" worktree add \"<KOPYA>/m1\""] },
  { b: "U1", rol: "isci", arac: "Bash", girdi: "ls; git\u200B push --force", karar: "TEK", jev: ["ls; git\u200B push --force"] },
  { b: "U1", rol: "isci", arac: "Bash", girdi: "ls; git push \uFF0D\uFF0Dforce", karar: "RED", jev: [] },
  { b: "U1", rol: "isci", arac: "PowerShell", girdi: "ls; git status\u3000", karar: "TEK", jev: ["ls; git status\u3000"] },
  { b: "U1", rol: "isci", arac: "Bash", girdi: "ls\u037E git status", karar: "TEK", jev: ["ls\u037E git status"] },
  { b: "U1", rol: "isci", arac: "PowerShell", girdi: "Remove-Item \u2013Recurse \u2013Force C:/x", karar: "INSAN", jev: [] }, // av8: bugün TEK
  { b: "U1", rol: "isci", arac: "PowerShell", girdi: "Remove-Item \u2014Recurse \u2014Force C:/x", karar: "INSAN", jev: [] }, // av8: bugün TEK
  { b: "U1", rol: "isci", arac: "PowerShell", girdi: "Remove-Item \u2015Recurse -Force C:/x", karar: "INSAN", jev: [] }, // av8: bugün TEK
  { b: "U1", rol: "isci", arac: "PowerShell", girdi: "ri \u2013r \u2013fo C:/x", karar: "INSAN", jev: [] }, // av8: bugün TEK
  { b: "U1", rol: "isci", arac: "PowerShell", girdi: "rm \u2013r -fo '<ANA>'", karar: "INSAN", jev: [] }, // av8: bugün TEK
  { b: "U1", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item \u2013Recurse \u2013Force '<ANA>'", karar: "INSAN", jev: [] }, // av8: bugün TEK
  { b: "U1", rol: "isci", arac: "PowerShell", girdi: "Remove-Item -Recurse \u2013Force C:/x", karar: "INSAN", jev: [] },
  { b: "U1", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item \u2013Recurse \u2013Force '<KOPYA>/a'", karar: "TEK", jev: ["Remove-Item \u2013Recurse \u2013Force '<KOPYA>/a'"] },
  { b: "U1", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/a' \u2013LiteralPath:'<ANA>'", karar: "INSAN", jev: [] }, // av8 B2: tire benzeri önek "-" sayılır, -LiteralPath:<ANA> hedef (TEK'ten sıkı)
  { b: "U2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/çıktı\"", karar: "TEK", jev: ["rm -rf \"<KOPYA>/çıktı\""] },
  { b: "U2", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/şube/ağaç'", karar: "TEK", jev: ["Remove-Item -Recurse -Force '<KOPYA>/şube/ağaç'"] },
  { b: "U2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/İ\"", karar: "TEK", jev: ["rm -rf \"<KOPYA>/İ\""] },
  { b: "U2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/a b\"", karar: "TEK", jev: ["rm -rf \"<KOPYA>/a b\""] },
  { b: "U2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/a+b\"", karar: "TEK", jev: ["rm -rf \"<KOPYA>/a+b\""] },
  { b: "U2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/çıktı\"; ls", karar: "TEK", jev: ["rm -rf \"<KOPYA>/çıktı\"; ls"] },
  { b: "U2", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/a\" \"<KOPYA>/ö\"", karar: "TEK", jev: ["rm -rf \"<KOPYA>/a\" \"<KOPYA>/ö\""] },
  { b: "U2", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/dal-ğ\"", karar: "TEK", jev: ["git worktree add \"<KOPYA>/dal-ğ\""] },
  { b: "U2", rol: "denetci", arac: "PowerShell", girdi: "git worktree add '<KOPYA>/şube' HEAD", karar: "TEK", jev: ["git worktree add '<KOPYA>/şube' HEAD"] },
  { b: "U3", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/a' -LP:'<ANA>'", karar: "INSAN", jev: [] },
  { b: "U3", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/a' -PSPath:'<ANA>'", karar: "INSAN", jev: [] },
  { b: "U3", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/a' -L:'<ANA>'", karar: "INSAN", jev: [] },
  { b: "U3", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/a' -LITERALPATH:'<ANA>'", karar: "INSAN", jev: [] },
  { b: "U3", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/a' -LiteralPath: '<ANA>'", karar: "INSAN", jev: [] },
  { b: "U3", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/a' -LiteralPath '<ANA>'", karar: "INSAN", jev: [] },
  { b: "U3", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/a' -Path '<ANA>'", karar: "INSAN", jev: [] },
  { b: "U3", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/a' -Pa '<ANA>'", karar: "INSAN", jev: [] },
  { b: "U3", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force -Path '<KOPYA>/a'", karar: "TEK", jev: ["Remove-Item -Recurse -Force -Path '<KOPYA>/a'"] },
  { b: "U3", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force -LiteralPath '<KOPYA>/a'", karar: "TEK", jev: ["Remove-Item -Recurse -Force -LiteralPath '<KOPYA>/a'"] },
  { b: "U3", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force -Path:\"<KOPYA>/a\"", karar: "TEK", jev: ["Remove-Item -Recurse -Force -Path:\"<KOPYA>/a\""] },
  { b: "U3", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force -Path:<KOPYA\\>\\a", karar: "TEK", jev: ["Remove-Item -Recurse -Force -Path:<KOPYA\\>\\a"] },
  { b: "U3", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse:$true -Force '<KOPYA>/a'", karar: "TEK", jev: ["Remove-Item -Recurse:$true -Force '<KOPYA>/a'"] },
  { b: "U3", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/a' -Exclude:x", karar: "TEK", jev: ["Remove-Item -Recurse -Force '<KOPYA>/a' -Exclude:x"] },
  { b: "U3", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse:$true -Force '<ANA>'", karar: "INSAN", jev: [] },
  { b: "U3", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -r:$true -Force '<ANA>'", karar: "INSAN", jev: [] }, // av8: bugün TEK
  { b: "U3", rol: "isci", arac: "PowerShell", girdi: "Remove-Item -r:$true -fo C:/x", karar: "INSAN", jev: [] }, // av8: bugün TEK
  { b: "U3", rol: "isci", arac: "PowerShell", girdi: "Remove-Item -Rec:$true -fo C:/x", karar: "INSAN", jev: [] },
  { b: "U3", rol: "isci", arac: "PowerShell", girdi: "Remove-Item -re:$true C:/x", karar: "INSAN", jev: [] }, // av8: bugün TEK
  { b: "U3", rol: "isci", arac: "PowerShell", girdi: "rm -r:1 -fo C:/x", karar: "INSAN", jev: [] }, // av8: bugün TEK
  { b: "U3", rol: "isci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force -Path: C:/x", karar: "INSAN", jev: [] },
  { b: "U3", rol: "isci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force a -LP:C:/x", karar: "INSAN", jev: [] },
  { b: "U3", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/a','-x/../../..'", karar: "INSAN", jev: [] }, // av8: bugün KOD
  { b: "U3", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force -Path '<KOPYA>/a','-x'", karar: "TEK", jev: ["Remove-Item -Recurse -Force -Path '<KOPYA>/a','-x'"] }, // av8: bugün KOD
  { b: "U3", rol: "denetci", arac: "PowerShell", girdi: "rm -r -fo '<KOPYA>/a','-x\\..\\..'", karar: "INSAN", jev: [] }, // av8: bugün KOD
  { b: "U3", rol: "denetci", arac: "PowerShell", girdi: "mkdir '-x'; Remove-Item -Recurse -Force '<KOPYA>/a','-x/../../..'", karar: "INSAN", jev: [] }, // av8: bugün KOD+TEK
  { b: "U3", rol: "isci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force a,'-x/../../..'", karar: "INSAN", jev: [] }, // av8: bugün TEK
  { b: "U3", rol: "isci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force 'a','-x\\..\\..'", karar: "INSAN", jev: [] }, // av8: bugün TEK
  { b: "U3", rol: "isci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '-x/../..'", karar: "INSAN", jev: [] },
  { b: "U3", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/a\" \"-x/../../..\"", karar: "INSAN", jev: [] }, // av8 B1: bayrak biçimine uymayan -x/../../.. hedef, kopya dışı (KOD'dan sıkı)
  { b: "U3", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/a\",-x/../../../../<REPO>", karar: "INSAN", jev: [] }, // av8: bugün KOD
  { b: "U3", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/a,\"-x/../../../../<REPO>", karar: "INSAN", jev: [] },
  { b: "U3", rol: "isci", arac: "Bash", girdi: "rm -rf a,-x/../../x", karar: "INSAN", jev: [] }, // av8: bugün TEK
  { b: "U3", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/a\",b", karar: "TEK", jev: ["rm -rf \"<KOPYA>/a\",b"] },
  { b: "U3", rol: "isci", arac: "Bash", girdi: "rm -dvfr /c/x", karar: "INSAN", jev: [] }, // av8: bugün TEK
  { b: "U3", rol: "isci", arac: "Bash", girdi: "rm --r -f /c/x", karar: "INSAN", jev: [] }, // av8: bugün TEK
  { b: "U3", rol: "isci", arac: "Bash", girdi: "rm --re -f /c/x", karar: "INSAN", jev: [] }, // av8: bugün TEK
  { b: "U3", rol: "isci", arac: "Bash", girdi: "rm -vRf /c/x", karar: "INSAN", jev: [] },
  { b: "U3", rol: "isci", arac: "Bash", girdi: "rm --recursive -f /c/x", karar: "INSAN", jev: [] }, // av8 B2: --r öneki
  { b: "U3", rol: "isci", arac: "PowerShell", girdi: "Remove-Item -Recur -fo C:/x", karar: "INSAN", jev: [] }, // av8 B2: -Recurse öneki
  { b: "U3", rol: "denetci", arac: "Bash", girdi: "rm -dvfr \"<ANA>\"", karar: "INSAN", jev: [] }, // av8: bugün TEK
  { b: "U3", rol: "denetci", arac: "Bash", girdi: "rm -dvfr \"<KOPYA>/a\"", karar: "TEK", jev: ["rm -dvfr \"<KOPYA>/a\""] },
  { b: "U4", rol: "isci", arac: "Bash", girdi: "npx -c git\\ \\ push\\ \\ --force", karar: "RED", jev: [] },
  { b: "U4", rol: "isci", arac: "Bash", girdi: "npx -c g\\it\\ pu\\sh\\ --for\\ce", karar: "RED", jev: [] },
  { b: "U4", rol: "isci", arac: "Bash", girdi: "npx -c git\\ push\\ -\\-force", karar: "RED", jev: [] },
  { b: "U4", rol: "isci", arac: "Bash", girdi: "npx -c \"git\"\\ push\\ --force", karar: "RED", jev: [] },
  { b: "U4", rol: "isci", arac: "Bash", girdi: "npx -c git\\ push' '--force", karar: "RED", jev: [] },
  { b: "U4", rol: "isci", arac: "Bash", girdi: "npx -c \"npx -c git\\\\ push\\\\ --force\"", karar: "RED", jev: [] },
  { b: "U4", rol: "isci", arac: "Bash", girdi: "ls; npx -c git\\ reset\\ --hard\\ \\&\\&\\ ls", karar: "INSAN", jev: [] },
  { b: "U4", rol: "isci", arac: "Bash", girdi: "npx -c git\\\tpush\\\t--force", karar: "RED", jev: [] },
  { b: "U4", rol: "isci", arac: "Bash", girdi: "npm exec --call=npx\\ -c\\ git\\\\\\ push\\\\\\ --force", karar: "RED", jev: [] },
  { b: "U4", rol: "isci", arac: "Bash", girdi: "npm exec --call=git\\ clean\\ -fd", karar: "INSAN", jev: [] },
  { b: "U4", rol: "isci", arac: "PowerShell", girdi: "npx -c git`  push` --force", karar: "TEK", jev: ["npx -c git`  push` --force"] },
  { b: "U4", rol: "isci", arac: "PowerShell", girdi: "npx -c git` ` push` --force", karar: "RED", jev: [] },
  { b: "U4", rol: "isci", arac: "PowerShell", girdi: "npx -c g`it` pu`sh` --force", karar: "RED", jev: [] },
  { b: "U4", rol: "isci", arac: "PowerShell", girdi: "npx -c git` reset` --hard; ls", karar: "INSAN", jev: [] },
  { b: "U4", rol: "isci", arac: "PowerShell", girdi: "npx -c \"npx -c git`` push`` --force\"", karar: "RED", jev: [] },
  { b: "U4", rol: "isci", arac: "Bash", girdi: "npx -c npx\\ -c\\ git\\\\\\ push\\\\\\ --force", karar: "RED", jev: [] },
  { b: "U4", rol: "isci", arac: "Bash", girdi: "npx -c npx\\ -c\\ npx\\\\\\ -c\\\\\\ git\\\\\\\\\\\\\\ push\\\\\\\\\\\\\\ --force", karar: "RED", jev: [] },
  { b: "U4", rol: "isci", arac: "Bash", girdi: "npx -c npx\\ -c\\ npx\\\\\\ -c\\\\\\ npx\\\\\\\\\\\\\\ -c\\\\\\\\\\\\\\ git\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ push\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ --force", karar: "RED", jev: [] },
  { b: "U4", rol: "isci", arac: "Bash", girdi: "npx -c npx\\ -c\\ npx\\\\\\ -c\\\\\\ npx\\\\\\\\\\\\\\ -c\\\\\\\\\\\\\\ npx\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ -c\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ git\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ push\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ --force", karar: "RED", jev: [] }, // av8: bugün TEK
  { b: "U4", rol: "isci", arac: "Bash", girdi: "npx -c npx\\ -c\\ npx\\\\\\ -c\\\\\\ npx\\\\\\\\\\\\\\ -c\\\\\\\\\\\\\\ npx\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ -c\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ git\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ reset\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ --hard", karar: "INSAN", jev: [] }, // av8: bugün TEK
  { b: "U4", rol: "isci", arac: "Bash", girdi: "npx -c npx\\ -c\\ npx\\\\\\ -c\\\\\\ git\\\\\\\\\\\\\\ reset\\\\\\\\\\\\\\ --hard", karar: "INSAN", jev: [] },
  { b: "U4", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/a\"; npx -c g\\it\\ pu\\sh\\ -f", karar: "RED", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "git config alias.p \"push --force\"", karar: "RED", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "git config --global alias.st status", karar: "RED", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "git config alias.x '!rm -rf C:/'", karar: "RED", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "git config set alias.p push", karar: "RED", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "git config --add alias.p push; ls", karar: "RED", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "git config --file x.cfg alias.p push", karar: "RED", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "ls && git config Alias.P push", karar: "RED", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "git config core.hooksPath x", karar: "RED", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "git -c alias.p=push p --force", karar: "RED", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "git config --unset alias.p", karar: "RED", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "git config --get alias.p", karar: "TEK", jev: ["git config --get alias.p"] },
  { b: "KY3", rol: "isci", arac: "PowerShell", girdi: "git config alias.p 'push --force'", karar: "RED", jev: [] },
  { b: "KY3", rol: "isci", arac: "PowerShell", girdi: "ls; git config alias.p push", karar: "RED", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "npm exec -- git -C C:/x reset --hard", karar: "INSAN", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "npm exec --yes -- git push -f", karar: "RED", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "npm x -- git clean -fd", karar: "INSAN", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "npm exec --package=x -c \"git push --force\"", karar: "RED", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "npm exec -c 'git -c alias.a=b a'", karar: "RED", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "npm exec -- rm -rf C:/x", karar: "INSAN", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "npm exec -- npx -c \"git reset --hard\"", karar: "INSAN", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "npm exec -c \"git push --force\" --yes", karar: "RED", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "npm exec -- node -e \"require('child_process').execSync('git push --force')\"", karar: "RED", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "npx --yes git push --force", karar: "RED", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "npx --yes -- git clean -fd; ls", karar: "INSAN", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "npx --yes -p git-credential-manager x", karar: "INSAN", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "npx -y rm -rf C:/x", karar: "INSAN", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "npx --yes --package git push --force", karar: "RED", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "npx --yes cowsay hi; ls", karar: "PARCA:2", jev: ["npx --yes cowsay hi","ls"] },
  { b: "KY3", rol: "isci", arac: "PowerShell", girdi: "npx --yes -c 'git reset --hard'", karar: "INSAN", jev: [] },
  { b: "KY3", rol: "isci", arac: "PowerShell", girdi: "npx --yes git push -f; ls", karar: "RED", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "node --eval \"require('child_process').execSync('git push --force')\"", karar: "RED", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "node --eval=\"require('child_process').execSync('git clean -fd')\"", karar: "INSAN", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "node --eval 'x' -- git reset --hard", karar: "INSAN", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "node -e \"require('child_process').execSync('rm -rf C:/x')\"", karar: "INSAN", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "node --eval \"x\"; git push -f", karar: "RED", jev: [] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "node --eval \"require('fs').rmSync('C:/x',{recursive:true})\"", karar: "TEK", jev: ["node --eval \"require('fs').rmSync('C:/x',{recursive:true})\""] },
  { b: "KY3", rol: "isci", arac: "Bash", girdi: "node --eval \"console.log(1)\"; ls", karar: "PARCA:2", jev: ["node --eval \"console.log(1)\"","ls"] },
  { b: "KY3", rol: "isci", arac: "PowerShell", girdi: "node --eval \"require('child_process').execSync('git push --force')\"", karar: "RED", jev: [] },
  { b: "KY3", rol: "isci", arac: "PowerShell", girdi: "node --eval \"require('child_process').execSync('git reset --hard')\"; ls", karar: "INSAN", jev: [] },
  { b: "KY3", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/m1\" HEAD; git config alias.p push", karar: "RED", jev: [] },
  { b: "KY3", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/a\"; npx --yes -- git clean -fd", karar: "INSAN", jev: [] },
  { b: "KY3", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/a'; node --eval \"require('child_process').execSync('git push -f')\"", karar: "RED", jev: [] },
  { b: "RL", rol: "isci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/m1/dist\"", karar: "INSAN", jev: [] },
  { b: "RL", rol: "sef", arac: "Bash", girdi: "rm -rf \"<KOPYA>/m1/dist\"", karar: "INSAN", jev: [] },
  { b: "RL", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/m1/dist\"", karar: "TEK", jev: ["rm -rf \"<KOPYA>/m1/dist\""] },
  { b: "RL", rol: "isci", arac: "Bash", girdi: "git worktree add --detach \"<KOPYA>/m1\" HEAD", karar: "TEK", jev: ["git worktree add --detach \"<KOPYA>/m1\" HEAD"] },
  { b: "RL", rol: "sef", arac: "Bash", girdi: "git worktree add --detach \"<KOPYA>/m1\" HEAD", karar: "TEK", jev: ["git worktree add --detach \"<KOPYA>/m1\" HEAD"] },
  { b: "RL", rol: "denetci", arac: "Bash", girdi: "git worktree add --detach \"<KOPYA>/m1\" HEAD", karar: "TEK", jev: ["git worktree add --detach \"<KOPYA>/m1\" HEAD"] },
  { b: "RL", rol: "isci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/a'; ls", karar: "INSAN", jev: [] },
  { b: "RL", rol: "sef", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/a'; ls", karar: "INSAN", jev: [] },
  { b: "RL", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/a'; ls", karar: "TEK", jev: ["Remove-Item -Recurse -Force '<KOPYA>/a'; ls"] },
  { b: "RL", rol: "isci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/a\"; git worktree add \"<KOPYA>/m1\" HEAD", karar: "INSAN", jev: [] },
  { b: "RL", rol: "sef", arac: "Bash", girdi: "rm -rf \"<KOPYA>/a\"; git worktree add \"<KOPYA>/m1\" HEAD", karar: "INSAN", jev: [] },
  { b: "RL", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/a\"; git worktree add \"<KOPYA>/m1\" HEAD", karar: "TEK", jev: ["rm -rf \"<KOPYA>/a\"; git worktree add \"<KOPYA>/m1\" HEAD"] },
  { b: "RL", rol: "isci", arac: "Bash", girdi: "ls; git status", karar: "PARCA:2", jev: ["ls","git status"] },
  { b: "RL", rol: "sef", arac: "Bash", girdi: "ls; git status", karar: "PARCA:2", jev: ["ls","git status"] },
  { b: "RL", rol: "denetci", arac: "Bash", girdi: "ls; git status", karar: "PARCA:2", jev: ["ls","git status"] },
  { b: "RL", rol: "DENETCI", arac: "Bash", girdi: "rm -rf \"<KOPYA>/a\"", karar: "INSAN", jev: [] },
  { b: "RL", rol: "denetci ", arac: "Bash", girdi: "rm -rf \"<KOPYA>/a\"", karar: "INSAN", jev: [] },
  // Hata avı 9 (docs/kabul/hata-avi-9.md): 149 hazır kabuk satırı + Bulgu 3'ün 4 Grep satırı. "av9: bugün X" yorumu düzeltme öncesini anlatır.
  { b: "av9-OB", rol: "isci", arac: "Bash", girdi: "rm -fr C:/x", karar: "INSAN", jev: [] },
  { b: "av9-OB", rol: "isci", arac: "Bash", girdi: "rm -Rf C:/x", karar: "INSAN", jev: [] },
  { b: "av9-OB", rol: "isci", arac: "Bash", girdi: "rm -f -R -- C:/x", karar: "INSAN", jev: [] },
  { b: "av9-OB", rol: "isci", arac: "Bash", girdi: "rm --recursive --force C:/x", karar: "INSAN", jev: [] },
  { b: "av9-OB", rol: "isci", arac: "Bash", girdi: "rm --recu -f C:/x", karar: "INSAN", jev: [] },
  { b: "av9-OB", rol: "isci", arac: "Bash", girdi: "rm -\\r -f C:/x", karar: "INSAN", jev: [] },
  { b: "av9-OB", rol: "isci", arac: "Bash", girdi: "rm \"-rf\" C:/x", karar: "INSAN", jev: [] },
  { b: "av9-OB", rol: "isci", arac: "Bash", girdi: "rm -vfdR /c/x", karar: "INSAN", jev: [] },
  { b: "av9-OB", rol: "isci", arac: "PowerShell", girdi: "Remove-Item -Rec -Fo C:/x", karar: "INSAN", jev: [] },
  { b: "av9-OB", rol: "isci", arac: "PowerShell", girdi: "Remove-Item C:/x -Recurse:$true", karar: "INSAN", jev: [] },
  { b: "av9-OB", rol: "isci", arac: "PowerShell", girdi: "Remove-Item C:/x -Recurse:(1)", karar: "INSAN", jev: [] },
  { b: "av9-OB", rol: "isci", arac: "PowerShell", girdi: "ri C:/x –r", karar: "INSAN", jev: [] },
  { b: "av9-OB", rol: "isci", arac: "PowerShell", girdi: "rd -R C:/x", karar: "INSAN", jev: [] },
  { b: "av9-OB", rol: "isci", arac: "Bash", girdi: "cmd /c rd /S /Q C:\\x", karar: "INSAN", jev: [] },
  { b: "av9-OB", rol: "isci", arac: "Bash", girdi: "cmd /c \"rmdir /q /s C:\\x\"", karar: "INSAN", jev: [] },
  { b: "av9-OB", rol: "isci", arac: "Bash", girdi: "ls C:/x | xargs rm -rf", karar: "INSAN", jev: [] },
  { b: "av9-OB", rol: "isci", arac: "PowerShell", girdi: "Get-ChildItem C:/x | Remove-Item -Recurse", karar: "INSAN", jev: [] },
  { b: "av9-OB", rol: "isci", arac: "Bash", girdi: "cmd /c rd /s/q C:\\x", karar: "INSAN", jev: [] }, // av9: bugün TEK
  { b: "av9-OB", rol: "isci", arac: "Bash", girdi: "cmd /c \"rmdir /S/Q C:\\x\"", karar: "INSAN", jev: [] }, // av9: bugün TEK
  { b: "av9-OB", rol: "isci", arac: "Bash", girdi: "cmd /c rd/s/q C:\\x", karar: "INSAN", jev: [] }, // av9: bugün TEK
  { b: "av9-OB", rol: "isci", arac: "Bash", girdi: "cmd /c del /f/s/q C:\\x", karar: "INSAN", jev: [] }, // av9: bugün TEK
  { b: "av9-OB", rol: "isci", arac: "Bash", girdi: "find C:/x -mindepth 1 -exec rm -rf {} +", karar: "INSAN", jev: [] }, // av9: bugün TEK
  { b: "av9-OB", rol: "isci", arac: "Bash", girdi: "find C:/x -mindepth 1 -exec rm -rf '{}' ';'", karar: "INSAN", jev: [] }, // av9: bugün TEK
  { b: "av9-OB", rol: "isci", arac: "Bash", girdi: "find C:/x -mindepth 1 -execdir rm -r {} +", karar: "INSAN", jev: [] }, // av9: bugün TEK
  { b: "av9-OB", rol: "isci", arac: "PowerShell", girdi: "$p=@{Recurse=$true;Force=$true}; Remove-Item C:/x @p", karar: "INSAN", jev: [] }, // av9: bugün TEK
  { b: "av9-OB-YP", rol: "isci", arac: "Bash", girdi: "rm -f C:/x/a.txt", karar: "TEK", jev: ["rm -f C:/x/a.txt"] },
  { b: "av9-OB-YP", rol: "isci", arac: "Bash", girdi: "rm --force C:/x/a.txt", karar: "TEK", jev: ["rm --force C:/x/a.txt"] },
  { b: "av9-OB-YP", rol: "isci", arac: "Bash", girdi: "rm --preserve-root -f C:/x/a.txt", karar: "TEK", jev: ["rm --preserve-root -f C:/x/a.txt"] },
  { b: "av9-OB-YP", rol: "isci", arac: "PowerShell", girdi: "Remove-Item -Force a.txt", karar: "TEK", jev: ["Remove-Item -Force a.txt"] },
  { b: "av9-OB-YP", rol: "isci", arac: "PowerShell", girdi: "Remove-Item -Recurse dist", karar: "TEK", jev: ["Remove-Item -Recurse dist"] },
  { b: "av9-OB-YP", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Force '<KOPYA>/a.txt'", karar: "TEK", jev: ["Remove-Item -Force '<KOPYA>/a.txt'"] },
  { b: "av9-OB-YP", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/a'", karar: "TEK", jev: ["Remove-Item -Recurse -Force '<KOPYA>/a'"] }, // av9: kısa yol kaldırıldı (rapor KOD bekliyordu); kabuktaki kopya silmesi Jev'e gider, denetçi mutasyon_kopyasi_sil kullanır
  { b: "av9-OB-YP", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item –Recurse -Force '<KOPYA>/a'", karar: "TEK", jev: ["Remove-Item –Recurse -Force '<KOPYA>/a'"] },
  { b: "av9-OB-YP", rol: "denetci", arac: "Bash", girdi: "rm -dvfr \"<KOPYA>/a\"", karar: "TEK", jev: ["rm -dvfr \"<KOPYA>/a\""] },
  { b: "av9-VG", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/a,b\"", karar: "TEK", jev: ["rm -rf \"<KOPYA>/a,b\""] },
  { b: "av9-VG", rol: "denetci", arac: "Bash", girdi: "rm -rf '<KOPYA>/a,b'", karar: "TEK", jev: ["rm -rf '<KOPYA>/a,b'"] },
  { b: "av9-VG", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/a,b'", karar: "TEK", jev: ["Remove-Item -Recurse -Force '<KOPYA>/a,b'"] },
  { b: "av9-VG", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force -LiteralPath \"<KOPYA>/a,b\"", karar: "TEK", jev: ["Remove-Item -Recurse -Force -LiteralPath \"<KOPYA>/a,b\""] },
  { b: "av9-VG", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/a\" \"<KOPYA>/b,c\"", karar: "TEK", jev: ["rm -rf \"<KOPYA>/a\" \"<KOPYA>/b,c\""] },
  { b: "av9-VG", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/a,b\" HEAD", karar: "TEK", jev: ["git worktree add \"<KOPYA>/a,b\" HEAD"] },
  { b: "av9-VG", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/a' ,'<ANA>'", karar: "INSAN", jev: [] },
  { b: "av9-VG", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/a' , '<ANA>'", karar: "INSAN", jev: [] },
  { b: "av9-VG", rol: "isci", arac: "Bash", girdi: "rm -rf \"a,b\"", karar: "TEK", jev: ["rm -rf \"a,b\""] },
  { b: "av9-VG", rol: "isci", arac: "Bash", girdi: "rm -rf \"a,C:/x\"", karar: "TEK", jev: ["rm -rf \"a,C:/x\""] },
  { b: "av9-VG", rol: "isci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force \"C:/x,a\"", karar: "INSAN", jev: [] },
  { b: "av9-VG", rol: "isci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force 'a' ,'C:/x'", karar: "INSAN", jev: [] },
  { b: "av9-VG", rol: "isci", arac: "Bash", girdi: "git commit -m \"a, b ve c\"; ls", karar: "PARCA:2", jev: ["git commit -m \"a, b ve c\"","ls"] },
  { b: "av9-VG", rol: "isci", arac: "PowerShell", girdi: "git commit -m 'a, b'; ls", karar: "PARCA:2", jev: ["git commit -m 'a, b'","ls"] },
  { b: "av9-TH", rol: "denetci", arac: "Bash", girdi: "rm -rf -- \"<KOPYA>/-x\"", karar: "TEK", jev: ["rm -rf -- \"<KOPYA>/-x\""] }, // av9: kısa yol kaldırıldı (rapor KOD bekliyordu); kabuktaki kopya silmesi Jev'e gider, denetçi mutasyon_kopyasi_sil kullanır
  { b: "av9-TH", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/a\" --", karar: "TEK", jev: ["rm -rf \"<KOPYA>/a\" --"] }, // av9: kısa yol kaldırıldı (rapor KOD bekliyordu); kabuktaki kopya silmesi Jev'e gider, denetçi mutasyon_kopyasi_sil kullanır
  { b: "av9-TH", rol: "denetci", arac: "Bash", girdi: "rm -rf -- -x", karar: "TEK", jev: ["rm -rf -- -x"] },
  { b: "av9-TH", rol: "denetci", arac: "Bash", girdi: "rm -rf -- -x/../../..", karar: "INSAN", jev: [] },
  { b: "av9-TH", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/a\" -- -x", karar: "TEK", jev: ["rm -rf \"<KOPYA>/a\" -- -x"] },
  { b: "av9-TH", rol: "denetci", arac: "Bash", girdi: "rm -rf -- -- \"<KOPYA>/a\"", karar: "TEK", jev: ["rm -rf -- -- \"<KOPYA>/a\""] },
  { b: "av9-TH", rol: "denetci", arac: "Bash", girdi: "rm -- -rf \"<KOPYA>/a\"", karar: "TEK", jev: ["rm -- -rf \"<KOPYA>/a\""] },
  { b: "av9-TH", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force -- '<KOPYA>/-x'", karar: "TEK", jev: ["Remove-Item -Recurse -Force -- '<KOPYA>/-x'"] }, // av9: kısa yol kaldırıldı (rapor KOD bekliyordu); kabuktaki kopya silmesi Jev'e gider, denetçi mutasyon_kopyasi_sil kullanır
  { b: "av9-TH", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force -- '-x=/../../..'", karar: "INSAN", jev: [] },
  { b: "av9-TH", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force -LiteralPath '-x=/../../..' -Exclude '<KOPYA>/a'", karar: "INSAN", jev: [] }, // av9: bugün KOD
  { b: "av9-TH", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item '-x=/../../..' -Recurse -Force -Filter '<KOPYA>/a'", karar: "INSAN", jev: [] }, // av9: bugün KOD
  { b: "av9-TH", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force -Path '-x=\\..\\..\\..' -Include '<KOPYA>/a'", karar: "INSAN", jev: [] }, // av9: bugün KOD
  { b: "av9-TH", rol: "denetci", arac: "PowerShell", girdi: "mkdir '-x='; Remove-Item -Recurse -Force -LiteralPath '-x=/../../..' -Exclude '<KOPYA>/a'", karar: "INSAN", jev: [] }, // av9: bugün KOD+TEK
  { b: "av9-TH", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force -LiteralPath '-src' -Exclude '<KOPYA>/a'", karar: "TEK", jev: ["Remove-Item -Recurse -Force -LiteralPath '-src' -Exclude '<KOPYA>/a'"] }, // av9: bugün KOD
  { b: "av9-TH", rol: "isci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force -LiteralPath '-x=/../../..'", karar: "INSAN", jev: [] },
  { b: "av9-TH", rol: "isci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force -LiteralPath '-x=/../../..' -Exclude a", karar: "INSAN", jev: [] }, // av9: bugün TEK
  { b: "av9-TH", rol: "isci", arac: "PowerShell", girdi: "Remove-Item '-x=/../../..' -Recurse -Filter a", karar: "INSAN", jev: [] }, // av9: bugün TEK
  { b: "av9-TH", rol: "isci", arac: "Bash", girdi: "rm -rf -- -x/../../..", karar: "INSAN", jev: [] },
  { b: "av9-TH", rol: "isci", arac: "Bash", girdi: "rm -rf -- -x", karar: "TEK", jev: ["rm -rf -- -x"] },
  { b: "av9-DR", rol: "isci", arac: "Bash", girdi: "npx -c npx\\ -c\\ npx\\\\\\ -c\\\\\\ git\\\\\\\\\\\\\\ push\\\\\\\\\\\\\\ --force", karar: "RED", jev: [] },
  { b: "av9-DR", rol: "isci", arac: "Bash", girdi: "npx -c npx\\ -c\\ npx\\\\\\ -c\\\\\\ npx\\\\\\\\\\\\\\ -c\\\\\\\\\\\\\\ git\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ push\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ --force", karar: "RED", jev: [] },
  { b: "av9-DR", rol: "isci", arac: "Bash", girdi: "npx -c npx\\ -c\\ npx\\\\\\ -c\\\\\\ npx\\\\\\\\\\\\\\ -c\\\\\\\\\\\\\\ npx\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ -c\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ git\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ push\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ --force", karar: "RED", jev: [] },
  { b: "av9-DR", rol: "isci", arac: "Bash", girdi: "npx -c npx\\ -c\\ npx\\\\\\ -c\\\\\\ npx\\\\\\\\\\\\\\ -c\\\\\\\\\\\\\\ npx\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ -c\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ npx\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ -c\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ git\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ push\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ --force", karar: "RED", jev: [] },
  { b: "av9-DR", rol: "isci", arac: "Bash", girdi: "npx -c npx\\ -c\\ npx\\\\\\ -c\\\\\\ git\\\\\\\\\\\\\\ reset\\\\\\\\\\\\\\ --hard", karar: "INSAN", jev: [] },
  { b: "av9-DR", rol: "isci", arac: "Bash", girdi: "npx -c npx\\ -c\\ npx\\\\\\ -c\\\\\\ npx\\\\\\\\\\\\\\ -c\\\\\\\\\\\\\\ git\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ reset\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ --hard", karar: "INSAN", jev: [] },
  { b: "av9-DR", rol: "isci", arac: "Bash", girdi: "npx -c npx\\ -c\\ npx\\\\\\ -c\\\\\\ npx\\\\\\\\\\\\\\ -c\\\\\\\\\\\\\\ npx\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ -c\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ git\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ reset\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ --hard", karar: "INSAN", jev: [] },
  { b: "av9-DR", rol: "isci", arac: "Bash", girdi: "npx -c npx\\ -c\\ npx\\\\\\ -c\\\\\\ npx\\\\\\\\\\\\\\ -c\\\\\\\\\\\\\\ npx\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ -c\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ npx\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ -c\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ git\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ reset\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ --hard", karar: "INSAN", jev: [] },
  { b: "av9-DR", rol: "isci", arac: "Bash", girdi: "npx -c npx\\ -c\\ npx\\\\\\ -c\\\\\\ npx\\\\\\\\\\\\\\ -c\\\\\\\\\\\\\\ rm\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ -rf\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ C:/x", karar: "INSAN", jev: [] },
  { b: "av9-DR", rol: "isci", arac: "Bash", girdi: "npx -c npx\\ -c\\ npx\\\\\\ -c\\\\\\ npx\\\\\\\\\\\\\\ -c\\\\\\\\\\\\\\ npx\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ -c\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ rm\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ -rf\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ C:/x", karar: "INSAN", jev: [] },
  { b: "av9-DR", rol: "isci", arac: "Bash", girdi: "npx -c npx\\ -c\\ ls\\\\\\ -la", karar: "TEK", jev: ["npx -c npx\\ -c\\ ls\\\\\\ -la"] },
  { b: "av9-DR", rol: "isci", arac: "Bash", girdi: "npx -c npx\\ -c\\ npx\\\\\\ -c\\\\\\ ls\\\\\\\\\\\\\\ -la", karar: "TEK", jev: ["npx -c npx\\ -c\\ npx\\\\\\ -c\\\\\\ ls\\\\\\\\\\\\\\ -la"] },
  { b: "av9-DR", rol: "isci", arac: "Bash", girdi: "npx -c npx\\ -c\\ npx\\\\\\ -c\\\\\\ npx\\\\\\\\\\\\\\ -c\\\\\\\\\\\\\\ npx\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ -c\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ ls\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ -la", karar: "INSAN", jev: [] },
  { b: "av9-DR", rol: "isci", arac: "Bash", girdi: "npx -c npx\\ -c\\ npx\\\\\\ -c\\\\\\ npx\\\\\\\\\\\\\\ -c\\\\\\\\\\\\\\ npx\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ -c\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ npx\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ -c\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ ls\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ -la", karar: "INSAN", jev: [] },
  { b: "av9-DR", rol: "isci", arac: "Bash", girdi: "git commit -m \"x: 'a b' ve \\\"c d\\\"\"", karar: "TEK", jev: ["git commit -m \"x: 'a b' ve \\\"c d\\\"\""] },
  { b: "av9-DR", rol: "isci", arac: "PowerShell", girdi: "git commit -m \"x: 'a \"\"b c\"\"' d\"", karar: "TEK", jev: ["git commit -m \"x: 'a \"\"b c\"\"' d\""] },
  { b: "av9-DR", rol: "isci", arac: "PowerShell", girdi: "npx -c \"npx -c 'npx -c \"\"npx -c ''git push --force''\"\"'\"", karar: "RED", jev: [] },
  { b: "av9-SR", rol: "isci", arac: "PowerShell", girdi: "Get-Content 'C:/x/sir\\Panel-Url.TXT'", karar: "INSAN", jev: [] },
  { b: "av9-SR", rol: "isci", arac: "Bash", girdi: "cat C:/x/sir/panel-url.*", karar: "INSAN", jev: [] }, // av9: bugün TEK
  { b: "av9-SR", rol: "isci", arac: "Bash", girdi: "cat .env.example", karar: "TEK", jev: ["cat .env.example"] },
  { b: "av9-SR", rol: "isci", arac: "Bash", girdi: "cat .env.EXAMPLE", karar: "TEK", jev: ["cat .env.EXAMPLE"] },
  { b: "av9-SR", rol: "isci", arac: "PowerShell", girdi: "Get-Content ‘C:/x/sir/panel-url.txt’", karar: "INSAN", jev: [] }, // av9: bugün TEK
  { b: "av9-PQ", rol: "isci", arac: "PowerShell", girdi: "git push\u0085--force", karar: "RED", jev: [] }, // av9: bugün TEK
  { b: "av9-PQ", rol: "isci", arac: "PowerShell", girdi: "git\u0085push -f", karar: "RED", jev: [] }, // av9: bugün TEK
  { b: "av9-PQ", rol: "isci", arac: "PowerShell", girdi: "git push ‘--force’", karar: "RED", jev: [] }, // av9: bugün TEK
  { b: "av9-PQ", rol: "isci", arac: "PowerShell", girdi: "git push origin “+main”", karar: "RED", jev: [] }, // av9: bugün TEK
  { b: "av9-PQ", rol: "isci", arac: "PowerShell", girdi: "cmd /c “git push --force”", karar: "RED", jev: [] }, // av9: bugün TEK
  { b: "av9-PQ", rol: "isci", arac: "PowerShell", girdi: "git reset ‘--hard’", karar: "INSAN", jev: [] }, // av9: bugün TEK
  { b: "av9-PQ", rol: "isci", arac: "PowerShell", girdi: "git reset\u0085--hard", karar: "INSAN", jev: [] }, // av9: bugün TEK
  { b: "av9-PQ", rol: "isci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force “C:/x”", karar: "INSAN", jev: [] }, // av9: bugün TEK
  { b: "av9-PQ", rol: "isci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force\u0085C:/x", karar: "INSAN", jev: [] }, // av9: bugün TEK
  { b: "av9-PQ", rol: "isci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force a\u0085C:/x", karar: "INSAN", jev: [] }, // av9: bugün TEK
  { b: "av9-PQ", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/a'\u0085'<ANA>'", karar: "INSAN", jev: [] }, // av9: U+0085 normalleştirmede boşluk sayılır, '<ANA>' ikinci hedef olur (rapor TEK bekliyordu); daha sıkı yön
  { b: "av9-PQ", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force ‘<KOPYA>/a’", karar: "TEK", jev: ["Remove-Item -Recurse -Force ‘<KOPYA>/a’"] },
  { b: "av9-BZN", rol: "denetci", arac: "PowerShell", girdi: "New-Item -ItemType Junction -Path '<KOPYA>/j' -Target '<ANA>'; Remove-Item -Recurse -Force '<KOPYA>/j'", karar: "TEK", jev: ["New-Item -ItemType Junction -Path '<KOPYA>/j' -Target '<ANA>'; Remove-Item -Recurse -Force '<KOPYA>/j'"] }, // av9: bugün KOD+TEK
  { b: "av9-BZN", rol: "denetci", arac: "Bash", girdi: "cmd /c mklink /J \"<KOPYA\\>\\j\" \"<ANA>\" && rm -rf \"<KOPYA>/j/\"", karar: "TEK", jev: ["cmd /c mklink /J \"<KOPYA\\>\\j\" \"<ANA>\" && rm -rf \"<KOPYA>/j/\""] }, // av9: bugün KOD+TEK
  { b: "av9-BZN", rol: "denetci", arac: "Bash", girdi: "ln -s \"<ANA>\" \"<KOPYA>/j\"; rm -rf \"<KOPYA>/j/\"", karar: "TEK", jev: ["ln -s \"<ANA>\" \"<KOPYA>/j\"; rm -rf \"<KOPYA>/j/\""] }, // av9: bugün KOD+TEK
  { b: "av9-PS", rol: "isci", arac: "Bash", girdi: "ls; pwd; git status; echo a", karar: "PARCA:4", jev: ["ls","pwd","git status","echo a"] },
  { b: "av9-PS", rol: "isci", arac: "Bash", girdi: "ls && pwd || git status; echo a", karar: "PARCA:4", jev: ["ls","pwd","git status","echo a"] },
  { b: "av9-PS", rol: "isci", arac: "Bash", girdi: "ls | head -2; pwd; git status | tail -1; echo a", karar: "PARCA:4", jev: ["ls","pwd","git status","echo a"] },
  { b: "av9-PS", rol: "isci", arac: "PowerShell", girdi: "ls; dir; git status; Write-Output a", karar: "PARCA:4", jev: ["ls","dir","git status","Write-Output a"] },
  { b: "av9-PS", rol: "isci", arac: "Bash", girdi: "ls; pwd; git status; echo a; dir", karar: "TEK", jev: ["ls; pwd; git status; echo a; dir"] },
  { b: "av9-PS", rol: "isci", arac: "Bash", girdi: "ls; pwd; git status; echo a; dir; ls", karar: "TEK", jev: ["ls; pwd; git status; echo a; dir; ls"] },
  { b: "av9-PS", rol: "isci", arac: "Bash", girdi: "ls; ls; ls; ls; ls; ls; ls; ls; ls; ls", karar: "TEK", jev: ["ls; ls; ls; ls; ls; ls; ls; ls; ls; ls"] },
  { b: "av9-PS", rol: "isci", arac: "Bash", girdi: "echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a", karar: "TEK", jev: ["echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a && echo a"] },
  { b: "av9-PS", rol: "isci", arac: "PowerShell", girdi: "ls; dir; git status; Write-Output a; pwd", karar: "TEK", jev: ["ls; dir; git status; Write-Output a; pwd"] },
  { b: "av9-PS", rol: "isci", arac: "Bash", girdi: "ls; pwd; echo a; dir; git push -f", karar: "RED", jev: [] },
  { b: "av9-PS", rol: "isci", arac: "Bash", girdi: "ls; pwd; echo a; dir; rm -rf C:/x", karar: "INSAN", jev: [] },
  { b: "av9-PS", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/a\"; ls; pwd; git status; echo a", karar: "TEK", jev: ["rm -rf \"<KOPYA>/a\"; ls; pwd; git status; echo a"] }, // av9: kısa yol kaldırıldı (rapor KOD+TEK bekliyordu); kabuktaki kopya silmesi Jev'e gider, denetçi mutasyon_kopyasi_sil kullanır
  { b: "av9-PS", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/a\"; ls; pwd; git status; echo a; dir", karar: "TEK", jev: ["rm -rf \"<KOPYA>/a\"; ls; pwd; git status; echo a; dir"] }, // av9: kısa yol kaldırıldı (rapor KOD+TEK bekliyordu); kabuktaki kopya silmesi Jev'e gider, denetçi mutasyon_kopyasi_sil kullanır
  { b: "av9-PS", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/a\"; rm -rf b; ls; pwd; git status", karar: "TEK", jev: ["rm -rf \"<KOPYA>/a\"; rm -rf b; ls; pwd; git status"] },
  { b: "av9-PS", rol: "isci", arac: "Bash", girdi: "ls;; pwd", karar: "TEK", jev: ["ls;; pwd"] },
  { b: "av9-PS", rol: "isci", arac: "Bash", girdi: "ls; ; pwd", karar: "TEK", jev: ["ls; ; pwd"] },
  { b: "av9-PS", rol: "isci", arac: "Bash", girdi: "ls;", karar: "TEK", jev: ["ls;"] },
  { b: "av9-PS", rol: "isci", arac: "Bash", girdi: ";ls", karar: "TEK", jev: [";ls"] },
  { b: "av9-PS", rol: "isci", arac: "Bash", girdi: "; ;", karar: "TEK", jev: ["; ;"] },
  { b: "av9-PS", rol: "isci", arac: "Bash", girdi: "ls && && pwd", karar: "TEK", jev: ["ls && && pwd"] },
  { b: "av9-PS", rol: "isci", arac: "Bash", girdi: "ls | | cat", karar: "TEK", jev: ["ls | | cat"] },
  { b: "av9-PS", rol: "isci", arac: "Bash", girdi: "ls ;; pwd; git status", karar: "TEK", jev: ["ls ;; pwd; git status"] },
  { b: "av9-PS", rol: "isci", arac: "PowerShell", girdi: "ls;; dir", karar: "TEK", jev: ["ls;; dir"] },
  { b: "av9-PS", rol: "isci", arac: "PowerShell", girdi: "ls; ; dir", karar: "TEK", jev: ["ls; ; dir"] },
  { b: "av9-PS", rol: "isci", arac: "Bash", girdi: "ls;; git push --force", karar: "RED", jev: [] },
  { b: "av9-PS", rol: "isci", arac: "Bash", girdi: ";; git push --force", karar: "RED", jev: [] },
  { b: "av9-PS", rol: "isci", arac: "Bash", girdi: "ls; ; rm -rf C:/x", karar: "INSAN", jev: [] },
  { b: "av9-PS", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/a\";; ls", karar: "TEK", jev: ["rm -rf \"<KOPYA>/a\";; ls"] },
  { b: "av9-PS", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/a\"; ;", karar: "TEK", jev: ["rm -rf \"<KOPYA>/a\"; ;"] }, // av9: kısa yol kaldırıldı (rapor KOD bekliyordu); kabuktaki kopya silmesi Jev'e gider, denetçi mutasyon_kopyasi_sil kullanır
  { b: "av9-BZ", rol: "denetci", arac: "PowerShell", girdi: "git\u0085-C '<WT>',-c,core.fsmonitor=x worktree add '<KOPYA>/m1'", karar: "RED", jev: [] }, // av9: bugün TEK
  { b: "av9-BZ", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item\u0085-Recurse -Force '<KOPYA>/a' -LiteralPath '<ANA>'", karar: "INSAN", jev: [] }, // av9: bugün TEK
  { b: "av9-BZ", rol: "isci", arac: "PowerShell", girdi: "Remove-Item\u0085-re:$true C:/x", karar: "INSAN", jev: [] }, // av9: bugün TEK
  { b: "av9-BZ", rol: "isci", arac: "PowerShell", girdi: "npx -c g`it` pu`sh` --force\u0085", karar: "RED", jev: [] }, // av9: bugün INSAN
  { b: "av9-SR", rol: "sef", arac: "Grep", girdi: { pattern: "t=", path: "<SIR>" }, karar: "INSAN", jev: [] },
  { b: "av9-SR", rol: "sef", arac: "Grep", girdi: { pattern: "t=", path: "<SIR>", glob: "panel-url.*", output_mode: "content" }, karar: "INSAN", jev: [] },
  { b: "av9-SR", rol: "sef", arac: "Grep", girdi: { pattern: "token", path: "C:/Users/kisi/.claude", glob: ".cred*" }, karar: "INSAN", jev: [] },
  // Tur 10 örnekleri (hata-avi-10, K15)
  { b: "av10-AR", rol: "denetci", arac: "mcp__bus__mutasyon_kopyasi_ac", girdi: { ad: "m1" }, karar: "IZIN", jev: [] },
  { b: "av10-AR", rol: "denetci", arac: "mcp__bus__mutasyon_kopyasi_ac", girdi: { ad: "../..", ref: "--orphan" }, karar: "IZIN", jev: [] },
  { b: "av10-AR", rol: "denetci", arac: "mcp__bus__mutasyon_kopyasi_sil", girdi: { ad: "m1" }, karar: "IZIN", jev: [] },
  { b: "av10-AR", rol: "isci", arac: "mcp__bus__mutasyon_kopyasi_sil", girdi: { ad: "m1" }, karar: "IZIN", jev: [] },
  { b: "av10-AR", rol: "sef", arac: "mcp__bus__mutasyon_kopyasi_ac", girdi: { ad: "m1" }, karar: "IZIN", jev: [] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/m1\"", karar: "TEK", jev: ["rm -rf \"<KOPYA>/m1\""] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "rm -rf <KOPYA>/m1", karar: "TEK", jev: ["rm -rf <KOPYA>/m1"] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "rm -r -f '<KOPYA>/m1'", karar: "TEK", jev: ["rm -r -f '<KOPYA>/m1'"] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "rm -fr \"<KOPYA>/m1/\"", karar: "TEK", jev: ["rm -fr \"<KOPYA>/m1/\""] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA\\>\\m1\"", karar: "TEK", jev: ["rm -rf \"<KOPYA\\>\\m1\""] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA_UP>/m1\"", karar: "TEK", jev: ["rm -rf \"<KOPYA_UP>/m1\""] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA_LO>/m1\"", karar: "TEK", jev: ["rm -rf \"<KOPYA_LO>/m1\""] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA_GB>/m1\"", karar: "TEK", jev: ["rm -rf \"<KOPYA_GB>/m1\""] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/m1\" \"<KOPYA>/m2\"", karar: "TEK", jev: ["rm -rf \"<KOPYA>/m1\" \"<KOPYA>/m2\""] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/m1/node_modules\"", karar: "TEK", jev: ["rm -rf \"<KOPYA>/m1/node_modules\""] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "rm --recursive --force \"<KOPYA>/m1\"", karar: "TEK", jev: ["rm --recursive --force \"<KOPYA>/m1\""] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "/usr/bin/rm -rf \"<KOPYA>/m1\"", karar: "TEK", jev: ["/usr/bin/rm -rf \"<KOPYA>/m1\""] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "rm.exe -rf \"<KOPYA>/m1\"", karar: "TEK", jev: ["rm.exe -rf \"<KOPYA>/m1\""] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/m1\" | tail -1", karar: "TEK", jev: ["rm -rf \"<KOPYA>/m1\" | tail -1"] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/m1\"; ls", karar: "TEK", jev: ["rm -rf \"<KOPYA>/m1\"; ls"] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/m1\" && git status", karar: "TEK", jev: ["rm -rf \"<KOPYA>/m1\" && git status"] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "ls && rm -rf \"<KOPYA>/m1\"", karar: "TEK", jev: ["ls && rm -rf \"<KOPYA>/m1\""] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>\"", karar: "INSAN", jev: [] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/..\"", karar: "INSAN", jev: [] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/m1/../..\"", karar: "INSAN", jev: [] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/m1\" \"<ANA>\"", karar: "INSAN", jev: [] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/$M\"", karar: "RED", jev: [] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "rm -rf \"$KOPYA/m1\"", karar: "RED", jev: [] },
  { b: "av10-KY", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/m1'", karar: "TEK", jev: ["Remove-Item -Recurse -Force '<KOPYA>/m1'"] },
  { b: "av10-KY", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -LiteralPath '<KOPYA>/m1' -Recurse -Force", karar: "TEK", jev: ["Remove-Item -LiteralPath '<KOPYA>/m1' -Recurse -Force"] },
  { b: "av10-KY", rol: "denetci", arac: "PowerShell", girdi: "ri -r -fo '<KOPYA>/m1'", karar: "TEK", jev: ["ri -r -fo '<KOPYA>/m1'"] },
  { b: "av10-KY", rol: "denetci", arac: "PowerShell", girdi: "rd -Recurse '<KOPYA>/m1'", karar: "TEK", jev: ["rd -Recurse '<KOPYA>/m1'"] },
  { b: "av10-KY", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/m1'; ls", karar: "TEK", jev: ["Remove-Item -Recurse -Force '<KOPYA>/m1'; ls"] },
  { b: "av10-KY", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force \"$env:TEMP/zepul-ayar/m1\"", karar: "RED", jev: [] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "cmd /c rd /s /q \"<KOPYA\\>\\m1\"", karar: "TEK", jev: ["cmd /c rd /s /q \"<KOPYA\\>\\m1\""] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "cmd /c \"rd /s /q <KOPYA\\>\\m1\"", karar: "TEK", jev: ["cmd /c \"rd /s /q <KOPYA\\>\\m1\""] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "git worktree add --detach \"<KOPYA>/m9\" HEAD", karar: "TEK", jev: ["git worktree add --detach \"<KOPYA>/m9\" HEAD"] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "git -C \"<WT>\" worktree add --detach \"<KOPYA>/m9\" is/isci1", karar: "TEK", jev: ["git -C \"<WT>\" worktree add --detach \"<KOPYA>/m9\" is/isci1"] },
  { b: "av10-KY", rol: "denetci", arac: "PowerShell", girdi: "git -C '<WT>' worktree add --detach '<KOPYA>/m9' HEAD", karar: "TEK", jev: ["git -C '<WT>' worktree add --detach '<KOPYA>/m9' HEAD"] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "git worktree remove \"<KOPYA>/m1\"", karar: "TEK", jev: ["git worktree remove \"<KOPYA>/m1\""] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "git worktree remove --force \"<KOPYA>/m1\"", karar: "TEK", jev: ["git worktree remove --force \"<KOPYA>/m1\""] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "git -C \"<WT>\" worktree remove -f -f \"<KOPYA>/m1\"", karar: "TEK", jev: ["git -C \"<WT>\" worktree remove -f -f \"<KOPYA>/m1\""] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "git worktree prune", karar: "TEK", jev: ["git worktree prune"] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "git worktree add \"<KOPYA>/m9\" HEAD && rm -rf \"<KOPYA>/m9\"", karar: "TEK", jev: ["git worktree add \"<KOPYA>/m9\" HEAD && rm -rf \"<KOPYA>/m9\""] },
  { b: "av10-KY", rol: "denetci", arac: "Bash", girdi: "git worktree add --detach \"<KOPYA>/m8\" HEAD; git worktree add --detach \"<KOPYA>/m9\" HEAD", karar: "PARCA:2", jev: ["git worktree add --detach \"<KOPYA>/m8\" HEAD","git worktree add --detach \"<KOPYA>/m9\" HEAD"] },
  { b: "av10-KY", rol: "isci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/m1\"", karar: "INSAN", jev: [] },
  { b: "av10-KY", rol: "sef", arac: "Bash", girdi: "rm -rf \"<KOPYA>/m1\"", karar: "INSAN", jev: [] },
  { b: "av10-KY", rol: "isci", arac: "Bash", girdi: "git worktree add --detach \"<KOPYA>/m9\" HEAD", karar: "TEK", jev: ["git worktree add --detach \"<KOPYA>/m9\" HEAD"] },
  { b: "av10-NZ", rol: "isci", arac: "PowerShell", girdi: "git push\u3000--force", karar: "RED", jev: [] },
  { b: "av10-NZ", rol: "isci", arac: "PowerShell", girdi: "git push\u00a0--force", karar: "RED", jev: [] },
  { b: "av10-NZ", rol: "isci", arac: "PowerShell", girdi: "git push\u2007--force", karar: "RED", jev: [] },
  { b: "av10-NZ", rol: "isci", arac: "PowerShell", girdi: "git push\u205f--force", karar: "RED", jev: [] },
  { b: "av10-NZ", rol: "isci", arac: "PowerShell", girdi: "git push\u202f--force", karar: "RED", jev: [] },
  { b: "av10-NZ", rol: "isci", arac: "PowerShell", girdi: "git push\u1680--force", karar: "RED", jev: [] },
  { b: "av10-NZ", rol: "isci", arac: "PowerShell", girdi: "git\u1680push\u1680-f", karar: "RED", jev: [] },
  { b: "av10-NZ", rol: "isci", arac: "PowerShell", girdi: "git push\u2028--force", karar: "RED", jev: [] },
  { b: "av10-NZ", rol: "isci", arac: "PowerShell", girdi: "git push\u2029--force", karar: "RED", jev: [] },
  { b: "av10-NZ", rol: "isci", arac: "PowerShell", girdi: "git push\u000b--force", karar: "RED", jev: [] },
  { b: "av10-NZ", rol: "isci", arac: "PowerShell", girdi: "git push\f--force", karar: "RED", jev: [] },
  { b: "av10-NZ", rol: "isci", arac: "PowerShell", girdi: "git reset\u1680--hard", karar: "INSAN", jev: [] },
  { b: "av10-NZ", rol: "isci", arac: "PowerShell", girdi: "Remove-Item\u1680-Recurse\u1680-Force\u1680C:/x", karar: "INSAN", jev: [] },
  { b: "av10-NZ", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/a'\u1680'<ANA>'", karar: "INSAN", jev: [] },
  { b: "av10-NZ", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force '<KOPYA>/a'\u3000'<ANA>'", karar: "INSAN", jev: [] },
  { b: "av10-NZ", rol: "isci", arac: "PowerShell", girdi: "git push\ufeff--force", karar: "RED", jev: [] },
  { b: "av10-NF", rol: "isci", arac: "Bash", girdi: "ls\uff1bgit push --force", karar: "RED", jev: [] },
  { b: "av10-NF", rol: "isci", arac: "Bash", girdi: "ls\uff5cgit push --force", karar: "RED", jev: [] },
  { b: "av10-NF", rol: "isci", arac: "Bash", girdi: "ls\uff06\uff06git push --force", karar: "RED", jev: [] },
  { b: "av10-NF", rol: "isci", arac: "Bash", girdi: "ls \uff06 git push --force", karar: "RED", jev: [] },
  { b: "av10-NF", rol: "isci", arac: "PowerShell", girdi: "ls\uff1bgit push --force", karar: "RED", jev: [] },
  { b: "av10-NF", rol: "isci", arac: "PowerShell", girdi: "ls\uff1bRemove-Item -Recurse C:/x", karar: "INSAN", jev: [] },
  { b: "av10-NF", rol: "isci", arac: "Bash", girdi: "echo a\uff1brm -rf C:/x", karar: "INSAN", jev: [] },
  { b: "av10-NF", rol: "isci", arac: "Bash", girdi: "ls\uff1bpwd", karar: "TEK", jev: ["ls\uff1bpwd"] },
  { b: "av10-NF", rol: "isci", arac: "Bash", girdi: "echo \uff41\uff1b\uff42", karar: "TEK", jev: ["echo \uff41\uff1b\uff42"] },
  { b: "av10-NY", rol: "isci", arac: "Bash", girdi: "\uff47\uff49\uff54 \uff50\uff55\uff53\uff48 --force", karar: "RED", jev: [] },
  { b: "av10-NY", rol: "isci", arac: "Bash", girdi: "git push \uff0d\uff0dforce", karar: "RED", jev: [] },
  { b: "av10-NY", rol: "isci", arac: "Bash", girdi: "git push \u2010\u2010force", karar: "RED", jev: [] },
  { b: "av10-NY", rol: "isci", arac: "Bash", girdi: "git push \u2212f", karar: "RED", jev: [] },
  { b: "av10-NY", rol: "isci", arac: "Bash", girdi: "\uff52\uff4d -rf C:/x", karar: "INSAN", jev: [] },
  { b: "av10-NY", rol: "isci", arac: "Bash", girdi: "git reset --\uff48\uff41\uff52\uff44", karar: "INSAN", jev: [] },
  { b: "av10-NY", rol: "isci", arac: "Bash", girdi: "cat panel\uff0durl.txt", karar: "INSAN", jev: [] },
  { b: "av10-NY", rol: "isci", arac: "Bash", girdi: "git push \ufe63\ufe63force", karar: "RED", jev: [] },
  { b: "av10-NB", rol: "isci", arac: "Bash", girdi: "git push --force \u0301", karar: "RED", jev: [] },
  { b: "av10-NB", rol: "isci", arac: "Bash", girdi: "git push --force\u0301", karar: "TEK", jev: ["git push --force\u0301"] },
  { b: "av10-NB", rol: "isci", arac: "Bash", girdi: "rm -rf C:/x\u0301", karar: "INSAN", jev: [] },
  { b: "av10-NB", rol: "isci", arac: "Bash", girdi: "cat .env\u0301", karar: "TEK", jev: ["cat .env\u0301"] },
  { b: "av10-NB", rol: "isci", arac: "Bash", girdi: "git push --\u0338force", karar: "TEK", jev: ["git push --\u0338force"] },
  { b: "av10-NB", rol: "isci", arac: "Bash", girdi: "ls; git push --force\u034f", karar: "PARCA:2", jev: ["ls","git push --force\u034f"] },
  { b: "av10-NB", rol: "isci", arac: "Bash", girdi: "ls\u0301; pwd", karar: "TEK", jev: ["ls\u0301; pwd"] },
  { b: "av10-NB", rol: "isci", arac: "PowerShell", girdi: "git push -\u0300-force", karar: "RED", jev: [] },
  { b: "av10-NR", rol: "isci", arac: "Bash", girdi: "git push \u202e--force", karar: "TEK", jev: ["git push \u202e--force"] },
  { b: "av10-NR", rol: "isci", arac: "Bash", girdi: "git push --force\u200f", karar: "TEK", jev: ["git push --force\u200f"] },
  { b: "av10-NR", rol: "isci", arac: "Bash", girdi: "\u200fgit push --force", karar: "TEK", jev: ["\u200fgit push --force"] },
  { b: "av10-NR", rol: "isci", arac: "Bash", girdi: "rm -rf C:/x\u200e", karar: "INSAN", jev: [] },
  { b: "av10-NR", rol: "isci", arac: "Bash", girdi: "rm -rf \u202eC:/x", karar: "TEK", jev: ["rm -rf \u202eC:/x"] },
  { b: "av10-NR", rol: "isci", arac: "Bash", girdi: "echo \u202eecrof-- hsup tig", karar: "TEK", jev: ["echo \u202eecrof-- hsup tig"] },
  { b: "av10-NR", rol: "isci", arac: "Bash", girdi: "ls \u2066a\u2069; pwd", karar: "TEK", jev: ["ls \u2066a\u2069; pwd"] },
  { b: "av10-NR", rol: "denetci", arac: "Bash", girdi: "rm -rf \"<KOPYA>/m1\u202e/../../..\"", karar: "INSAN", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", glob: "[.]env" }, karar: "INSAN", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", glob: "[!a]env" }, karar: "INSAN", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", glob: ".en[v]" }, karar: "INSAN", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", glob: "panel-url*" }, karar: "INSAN", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", glob: "**/panel-url.txt" }, karar: "INSAN", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", glob: "zepul-ai-anahtar.*" }, karar: "INSAN", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", glob: "a.md,.env" }, karar: "INSAN", jev: [] }, // av10: bugün IZIN (Bulgu 1); şef kararı: süslü/köşeli parantez ve liste biçimli desen ayrıştırılmaz, insana gider
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", glob: "*.md .env" }, karar: "INSAN", jev: [] }, // av10: bugün IZIN (Bulgu 1); şef kararı: süslü/köşeli parantez ve liste biçimli desen ayrıştırılmaz, insana gider
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", glob: "*.md,*.key" }, karar: "INSAN", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "t=", path: "<ANA>", glob: "**/{panel-url.txt,x}" }, karar: "INSAN", jev: [] }, // av10: bugün IZIN (Bulgu 1); rapordaki path <TEMP> idi, burada <TEMP> masaüstü ve .env içerdiği için dizin denetimi RED verirdi; parantez denetimi makineden bağımsız sınansın diye <ANA>
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "t=", path: "<TEMP>", glob: "**/panel-url.txt" }, karar: "INSAN", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", glob: "*.ke[y]" }, karar: "INSAN", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", glob: "*" }, karar: "IZIN", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", glob: "*.txt" }, karar: "IZIN", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", glob: ".env.example" }, karar: "IZIN", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", glob: "!.env" }, karar: "IZIN", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", type: "sh" }, karar: "IZIN", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", type: "env" }, karar: "IZIN", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", type: "sh", path: "<SIR>" }, karar: "INSAN", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", path: "<SIR>/panel-url.txt" }, karar: "INSAN", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", path: "<SIR>" }, karar: "INSAN", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", path: "<SIR>/" }, karar: "INSAN", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", path: "<SIR>/." }, karar: "INSAN", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", path: "<SIR>" }, karar: "INSAN", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", path: "<SIR>." }, karar: "INSAN", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Grep", girdi: { pattern: "=", path: "<SIR>/./" }, karar: "INSAN", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Glob", girdi: { pattern: "<SIR>/panel-url.*" }, karar: "INSAN", jev: [] },
  { b: "av10-SJ", rol: "sef", arac: "Glob", girdi: { pattern: "*", path: "<SIR>" }, karar: "INSAN", jev: [] },
  { b: "av10-BZ", rol: "isci", arac: "Bash", girdi: "\r\nprintf -v PATH %s /c/x/araclar; cat a.txt | grep x", karar: "TEK", jev: ["\r\nprintf -v PATH %s /c/x/araclar; cat a.txt | grep x"] }, // CRLF-bas, tablo #7
  { b: "av10-BZ", rol: "denetci", arac: "Bash", girdi: "\r\ngit -C \"<WT>\" worktree add --detach \"<KOPYA>/m1\" HEAD", karar: "TEK", jev: ["\r\ngit -C \"<WT>\" worktree add --detach \"<KOPYA>/m1\" HEAD"] }, // CRLF-bas, tablo #14
  { b: "av10-BZ", rol: "denetci", arac: "Bash", girdi: "\r\ngit worktree add --det \"<KOPYA>/m1\" HEAD", karar: "TEK", jev: ["\r\ngit worktree add --det \"<KOPYA>/m1\" HEAD"] }, // CRLF-bas, tablo #23
  { b: "av10-BZ", rol: "denetci", arac: "Bash", girdi: "\r\ngit -C \"<WT>\" -c x.y=z worktree add \"<KOPYA>/m1\"", karar: "TEK", jev: ["\r\ngit -C \"<WT>\" -c x.y=z worktree add \"<KOPYA>/m1\""] }, // CRLF-bas, tablo #27
  { b: "av10-BZ", rol: "denetci", arac: "Bash", girdi: "\r\ngit --git-dir=C:/x worktree add \"<KOPYA>/m1\"", karar: "TEK", jev: ["\r\ngit --git-dir=C:/x worktree add \"<KOPYA>/m1\""] }, // CRLF-bas, tablo #28
  { b: "av10-BZ", rol: "sef", arac: "Bash", girdi: "\r\nrm -rf \"$D/x\"", karar: "INSAN", jev: [] }, // CRLF-bas, tablo #92
  { b: "av10-BZ", rol: "isci", arac: "PowerShell", girdi: "git\u3000status\u3000||\u3000ls", karar: "TEK", jev: ["git\u3000status\u3000||\u3000ls"] }, // TG-bosluk, tablo #105
  { b: "av10-BZ", rol: "isci", arac: "PowerShell", girdi: "\r\ngit status || ls", karar: "TEK", jev: ["\r\ngit status || ls"] }, // CRLF-bas, tablo #105
  { b: "av10-BZ", rol: "isci", arac: "PowerShell", girdi: "git status || ls\r\n", karar: "TEK", jev: ["git status || ls\r\n"] }, // CRLF-son, tablo #105
  { b: "av10-BZ", rol: "isci", arac: "PowerShell", girdi: "&\u3000'C:/x/a.exe'", karar: "TEK", jev: ["&\u3000'C:/x/a.exe'"] }, // TG-bosluk, tablo #111
  { b: "av10-BZ", rol: "isci", arac: "PowerShell", girdi: "\r\n& 'C:/x/a.exe'", karar: "TEK", jev: ["\r\n& 'C:/x/a.exe'"] }, // CRLF-bas, tablo #111
  { b: "av10-BZ", rol: "isci", arac: "PowerShell", girdi: "& 'C:/x/a.exe'\r\n", karar: "TEK", jev: ["& 'C:/x/a.exe'\r\n"] }, // CRLF-son, tablo #111
  { b: "av10-BZ", rol: "isci", arac: "PowerShell", girdi: "git\u3000sta`tus;\u3000ls", karar: "TEK", jev: ["git\u3000sta`tus;\u3000ls"] }, // TG-bosluk, tablo #115
  { b: "av10-BZ", rol: "isci", arac: "PowerShell", girdi: "\r\ngit sta`tus; ls", karar: "TEK", jev: ["\r\ngit sta`tus; ls"] }, // CRLF-bas, tablo #115
  { b: "av10-BZ", rol: "isci", arac: "PowerShell", girdi: "git sta`tus; ls\r\n", karar: "TEK", jev: ["git sta`tus; ls\r\n"] }, // CRLF-son, tablo #115
  { b: "av10-BZ", rol: "isci", arac: "PowerShell", girdi: "ls;\u3000git\u3000@a", karar: "TEK", jev: ["ls;\u3000git\u3000@a"] }, // TG-bosluk, tablo #118
  { b: "av10-BZ", rol: "isci", arac: "PowerShell", girdi: "\r\nls; git @a", karar: "TEK", jev: ["\r\nls; git @a"] }, // CRLF-bas, tablo #118
  { b: "av10-BZ", rol: "isci", arac: "PowerShell", girdi: "ls; git @a\r\n", karar: "TEK", jev: ["ls; git @a\r\n"] }, // CRLF-son, tablo #118
  { b: "av10-BZ", rol: "isci", arac: "Bash", girdi: "\r\ncmd /c rd /s /q C:\\x", karar: "INSAN", jev: [] }, // CRLF-bas, tablo #150
  { b: "av10-BZ", rol: "isci", arac: "Bash", girdi: "\r\nls; { git status; }", karar: "TEK", jev: ["\r\nls; { git status; }"] }, // CRLF-bas, tablo #152
  { b: "av10-BZ", rol: "denetci", arac: "Bash", girdi: "\r\nrm -rf \"<KOPYA>/. \"", karar: "INSAN", jev: [] }, // CRLF-bas, tablo #179
  { b: "av10-BZ", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item\u3000-Recurse\u3000-Force\u3000-Path:'<KOPYA>/a'\u3000'<ANA>'", karar: "INSAN", jev: [] }, // TG-bosluk, tablo #185
  { b: "av10-BZ", rol: "denetci", arac: "PowerShell", girdi: "\r\nRemove-Item -Recurse -Force -Path:'<KOPYA>/a' '<ANA>'", karar: "INSAN", jev: [] }, // CRLF-bas, tablo #185
  { b: "av10-BZ", rol: "denetci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Force -Path:'<KOPYA>/a' '<ANA>'\r\n", karar: "INSAN", jev: [] }, // CRLF-son, tablo #185
  { b: "av10-BZ", rol: "denetci", arac: "Bash", girdi: "\r\nrm -rf \"<KOPYA>/a\" \"<KOPYA>/b\"", karar: "TEK", jev: ["\r\nrm -rf \"<KOPYA>/a\" \"<KOPYA>/b\""] }, // CRLF-bas, tablo #196
  { b: "av10-BZ", rol: "denetci", arac: "Bash", girdi: "\r\ngit worktree add --no-checkout \"<KOPYA>/m1\"", karar: "TEK", jev: ["\r\ngit worktree add --no-checkout \"<KOPYA>/m1\""] }, // CRLF-bas, tablo #226
  { b: "av10-BZ", rol: "isci", arac: "Bash", girdi: "\r\nnpm exec --call=\"git clean -fd\"; ls", karar: "INSAN", jev: [] }, // CRLF-bas, tablo #287
  { b: "av10-BZ", rol: "isci", arac: "PowerShell", girdi: "npx\u3000-c\u3000'git\u3000push\u3000--force';\u3000ls", karar: "RED", jev: [] }, // TG-bosluk, tablo #311
  { b: "av10-BZ", rol: "isci", arac: "PowerShell", girdi: "\r\nnpx -c 'git push --force'; ls", karar: "RED", jev: [] }, // CRLF-bas, tablo #311
  { b: "av10-BZ", rol: "isci", arac: "PowerShell", girdi: "npx -c 'git push --force'; ls\r\n", karar: "RED", jev: [] }, // CRLF-son, tablo #311
  { b: "av10-PR", rol: "sef", arac: "Grep", girdi: { pattern: "a[bc]" }, karar: "IZIN", jev: [] }, // av10 düzeltme: pattern dosya adı değil, içerik regex'i; parantez sır açılımı doğurmaz, normal yoldan geçer
  { b: "av10-PR", rol: "sef", arac: "Grep", girdi: { pattern: "[a-z]+", path: "<ANA>/sunucu" }, karar: "IZIN", jev: [] }, // gerekçe: regex karakter sınıfı, glob/path/type zararsız
  { b: "av10-PR", rol: "sef", arac: "Grep", girdi: { pattern: "foo\[0\]", path: "<ANA>/sunucu" }, karar: "IZIN", jev: [] }, // gerekçe: kaçışlı köşeli parantez regex'i
  { b: "av10-PR", rol: "sef", arac: "Grep", girdi: { pattern: "\{", path: "<ANA>/sunucu" }, karar: "IZIN", jev: [] }, // gerekçe: kaçışlı süslü parantez regex'i
  { b: "av10-PR", rol: "sef", arac: "Grep", girdi: { pattern: "x", type: "{ts,env}" }, karar: "INSAN", jev: [] }, // av10 şef kararı: Grep glob/pattern/path/type alanında { } [ ] insana gider
  { b: "av10-PR", rol: "sef", arac: "Grep", girdi: { pattern: "x", path: "sunucu/{a,b}" }, karar: "INSAN", jev: [] }, // av10 şef kararı: Grep glob/pattern/path/type alanında { } [ ] insana gider
  { b: "av10-PR", rol: "sef", arac: "Grep", girdi: { pattern: "x", glob: "*.ts" }, karar: "IZIN", jev: [] },
  { b: "av10-PR", rol: "sef", arac: "Glob", girdi: { pattern: "*.ts", path: "sunucu/[s]" }, karar: "INSAN", jev: [] }, // av10 şef kararı: Glob pattern/path alanında { } [ ] insana gider
  { b: "av10-PR", rol: "sef", arac: "Glob", girdi: { pattern: "sunucu/*.ts" }, karar: "IZIN", jev: [] },
  { b: "av11-GT", rol: "sef", arac: "Grep", girdi: { pattern: "=", type: "env" }, karar: "IZIN", jev: [] },
  { b: "av11-GT", rol: "sef", arac: "Grep", girdi: { pattern: "=", type: "key" }, karar: "IZIN", jev: [] },
  { b: "av11-GT", rol: "sef", arac: "Grep", girdi: { pattern: "=", type: "{env}" }, karar: "INSAN", jev: [] },
  { b: "av11-GT", rol: "sef", arac: "Grep", girdi: { pattern: "=", type: "[e]nv" }, karar: "INSAN", jev: [] },
  { b: "av11-GT", rol: "sef", arac: "Grep", girdi: { pattern: "=", type: "txt", path: "<SIR>" }, karar: "INSAN", jev: [] },
  { b: "av11-GN", rol: "sef", arac: "Grep", girdi: { pattern: "=", glob: "!*.md" }, karar: "IZIN", jev: [] },
  { b: "av11-GN", rol: "sef", arac: "Grep", girdi: { pattern: "=", glob: "!!.env" }, karar: "IZIN", jev: [] },
  { b: "av11-GN", rol: "sef", arac: "Grep", girdi: { pattern: "=", glob: "!*.md .env" }, karar: "INSAN", jev: [] },
  { b: "av11-GN", rol: "sef", arac: "Grep", girdi: { pattern: "=", glob: "!*.md,.env" }, karar: "INSAN", jev: [] },
  { b: "av11-GN", rol: "sef", arac: "Grep", girdi: { pattern: "=", glob: "!{a,b}" }, karar: "INSAN", jev: [] },
  { b: "av11-GS", rol: "sef", arac: "Grep", girdi: { pattern: "=", glob: "**/*-url.txt" }, karar: "INSAN", jev: [] },
  { b: "av11-GS", rol: "sef", arac: "Grep", girdi: { pattern: "=", glob: "**/panel-url.tx?" }, karar: "INSAN", jev: [] },
  { b: "av11-GS", rol: "sef", arac: "Grep", girdi: { pattern: "t=", path: "<SIR>/..", glob: "*/panel-url.txt" }, karar: "INSAN", jev: [] },
  { b: "av11-GS", rol: "sef", arac: "Grep", girdi: { pattern: "t=", path: "<SIR>/.." }, karar: "INSAN", jev: [] }, // av11: bugün IZIN (Bulgu 1)
  { b: "av11-GS", rol: "sef", arac: "Grep", girdi: { pattern: "t=", path: "<SIR>/..", type: "txt" }, karar: "INSAN", jev: [] }, // av11: bugün IZIN (Bulgu 1)
  { b: "av11-GS", rol: "sef", arac: "Grep", girdi: { pattern: "t=", path: "<SIR>/..", glob: "**" }, karar: "INSAN", jev: [] }, // av11: bugün IZIN (Bulgu 1)
  { b: "av11-GP", rol: "sef", arac: "Grep", girdi: { pattern: "=", path: ".env::$DATA" }, karar: "INSAN", jev: [] },
  { b: "av11-GP", rol: "sef", arac: "Grep", girdi: { pattern: "=", path: "file:///<ANA>/.env" }, karar: "INSAN", jev: [] },
  { b: "av11-GP", rol: "sef", arac: "Grep", girdi: { pattern: "=", path: "<SIR>/panel-url.txt::$DATA" }, karar: "INSAN", jev: [] },
  { b: "av11-GG", rol: "sef", arac: "Glob", girdi: { pattern: "*.txt", path: "<SIR>" }, karar: "INSAN", jev: [] },
  { b: "av11-GG", rol: "sef", arac: "Glob", girdi: { pattern: "x/../.tmp/*" }, karar: "INSAN", jev: [] },
  { b: "av11-RS", rol: "isci", arac: "Read", girdi: { file_path: ".env::$DATA" }, karar: "INSAN", jev: [] },
  { b: "av11-RS", rol: "isci", arac: "Read", girdi: { file_path: "\\\\?\\GLOBALROOT\\Device\\HarddiskVolume3\\x\\.env" }, karar: "INSAN", jev: [] },
  { b: "av11-RS", rol: "isci", arac: "Read", girdi: { file_path: "\\\\0--1.ipv6-literal.net\\C$\\x\\.tmp\\x.txt" }, karar: "INSAN", jev: [] },
  { b: "av11-RS", rol: "isci", arac: "Read", girdi: { file_path: "file:///<ANA>/.tmp/x.txt" }, karar: "INSAN", jev: [] },
  { b: "av11-RS", rol: "isci", arac: "Read", girdi: { file_path: "<ANA>/.tmp::$INDEX_ALLOCATION/x.txt" }, karar: "INSAN", jev: [] },
  { b: "av11-RS", rol: "isci", arac: "Read", girdi: { file_path: "<SIR>/panel-url.txt:x" }, karar: "INSAN", jev: [] },
  { b: "av11-RS", rol: "isci", arac: "Read", girdi: { file_path: "deneme/dosya.txt:gizli" }, karar: "IZIN", jev: [] },
  { b: "av11-WF", rol: "isci", arac: "WebFetch", girdi: { url: "http://127.0.0.1:8820/api/olaylar", prompt: "x" }, karar: "RED", jev: [] }, // av11: bugün TEK (Bulgu 3); şef kararı: yerel/özel adres ve file: şeması kodla red
  { b: "av11-WF", rol: "isci", arac: "WebFetch", girdi: { url: "http://[::1]:8820/", prompt: "x" }, karar: "RED", jev: [] }, // av11: bugün TEK (Bulgu 3); şef kararı: yerel/özel adres ve file: şeması kodla red
  { b: "av11-WF", rol: "isci", arac: "WebFetch", girdi: { url: "http://2130706433:8820/", prompt: "x" }, karar: "RED", jev: [] }, // av11: bugün TEK (Bulgu 3); şef kararı: yerel/özel adres ve file: şeması kodla red
  { b: "av11-WF", rol: "isci", arac: "WebFetch", girdi: { url: "file:///<ANA>/.env", prompt: "x" }, karar: "RED", jev: [] }, // av11: bugün TEK (Bulgu 3); şef kararı: yerel/özel adres ve file: şeması kodla red
  { b: "av11-WF", rol: "isci", arac: "WebFetch", girdi: { url: "http://127.0.0.1.nip.io:8820/api/olaylar", prompt: "x" }, karar: "RED", jev: [] }, // av11 güvenlik incelemesi: ad yerel adrese çözülüyor (sahte DNS)
  { b: "av11-WF", rol: "isci", arac: "WebFetch", girdi: { url: "http://localtest.me:8820/", prompt: "x" }, karar: "RED", jev: [] }, // av11 güvenlik incelemesi: ad yerel adrese çözülüyor (sahte DNS)
  { b: "av11-WF", rol: "isci", arac: "WebFetch", girdi: { url: "https://ornek.com/", prompt: "x" }, karar: "INSAN", jev: [], yerel: true }, // av11: yerel ajanda yönlendirme sınırı, ikinci ağ yok
  // hata-avi-12 (av12)
  { b: "av12-TL", rol: "isci", arac: "Read", girdi: { file_path: "~/x.txt" }, karar: "INSAN", jev: [] }, // av12: bugün IZIN (Bulgu 1)
  { b: "av12-TL", rol: "isci", arac: "Read", girdi: { file_path: "~" }, karar: "INSAN", jev: [] }, // av12: bugün IZIN (Bulgu 1)
  { b: "av12-TL", rol: "isci", arac: "Grep", girdi: { pattern: "a", path: "~" }, karar: "INSAN", jev: [] }, // av12: bugün IZIN (Bulgu 1)
  { b: "av12-TL", rol: "isci", arac: "Grep", girdi: { pattern: "a", path: "~/av12-yok" }, karar: "INSAN", jev: [] }, // av12: bugün IZIN (Bulgu 1); raporda ~/Desktop, bu makinede Desktop sır içerdiği için RED alır
  { b: "av12-TL", rol: "isci", arac: "Glob", girdi: { pattern: "*.txt", path: "~/av12-yok" }, karar: "INSAN", jev: [] }, // av12: bugün IZIN (Bulgu 1); raporda ~/Desktop, bu makinede Desktop sır içerdiği için RED alır
  { b: "av12-TL", rol: "isci", arac: "LS", girdi: { path: "~/Desktop" }, karar: "INSAN", jev: [] }, // av12: bugün IZIN (Bulgu 1)
  { b: "av12-TL", rol: "isci", arac: "NotebookRead", girdi: { notebook_path: "~/a.ipynb" }, karar: "INSAN", jev: [] }, // av12: bugün IZIN (Bulgu 1)
  { b: "av12-TL", rol: "isci", arac: "Read", girdi: { file_path: "~\\x.txt" }, karar: "INSAN", jev: [] }, // av12: bugün IZIN; CLI ~\ açmaz, kapı kapalı kapı için ~\'yi de ev dizinine açar
  { b: "av12-WS", rol: "isci", arac: "WebSearch", girdi: { query: "x" }, karar: "INSAN", jev: [], yerel: true }, // av12: bugün TEK (Bulgu 2)
  { b: "av12-WS", rol: "sef", arac: "WebSearch", girdi: { query: "x" }, karar: "INSAN", jev: [], yerel: true }, // av12: bugün TEK (Bulgu 2)
  { b: "av12-WS", rol: "isci", arac: "WebSearch", girdi: { query: "http://127.0.0.1:8820/api" }, karar: "TEK", jev: ["?"] }, // sorgu sunucu tarafında; Claude ajanında Jev
  { b: "av12-GD", rol: "isci", arac: "Glob", girdi: { pattern: "*/../../x/*.txt" }, karar: "INSAN", jev: [] }, // av12: bugün IZIN (Bulgu 3)
  { b: "av12-GD", rol: "isci", arac: "Glob", girdi: { pattern: "**/../../x/a.txt" }, karar: "INSAN", jev: [] }, // av12: bugün IZIN (Bulgu 3)
  { b: "av12-GD", rol: "isci", arac: "Glob", girdi: { pattern: "?eneme/../../x/a.txt" }, karar: "INSAN", jev: [] }, // av12: bugün IZIN (Bulgu 3)
  { b: "av12-KS", rol: "isci", arac: "Read", girdi: { file_path: "<TEMP>/<REPO>2/x.txt" }, karar: "INSAN", jev: [] },
  { b: "av12-KS", rol: "isci", arac: "Read", girdi: { file_path: "<TEMP>/<REPO>-yedek-1235/x.txt" }, karar: "INSAN", jev: [] },
  { b: "av12-KS", rol: "isci", arac: "Read", girdi: { file_path: "../<REPO>2/x.txt" }, karar: "INSAN", jev: [] },
  { b: "av12-KS", rol: "isci", arac: "Glob", girdi: { pattern: "<TEMP>/<REPO>2/*.txt" }, karar: "INSAN", jev: [] },
  { b: "av12-KS", rol: "isci", arac: "Grep", girdi: { pattern: "a", path: "<ANA>/../<REPO>2" }, karar: "INSAN", jev: [] }, // raporda <ANA>/..; bu makinede üst dizin sır içerdiği için RED alır, kardeş klasöre çevrildi
  { b: "av12-KS", rol: "sef", arac: "Read", girdi: { file_path: "<KOPYA>/a.txt" }, karar: "INSAN", jev: [] },
  { b: "av12-KS", rol: "denetci", arac: "Read", girdi: { file_path: "<KOPYA>2/a.txt" }, karar: "INSAN", jev: [] },
  { b: "av12-URL", rol: "isci", arac: "WebFetch", girdi: { url: "http://iyi.com@127.0.0.1/", prompt: "x" }, karar: "RED", jev: [] },
  { b: "av12-URL", rol: "isci", arac: "WebFetch", girdi: { url: "http://127%2e0.0.1/", prompt: "x" }, karar: "RED", jev: [] },
  { b: "av12-URL", rol: "isci", arac: "WebFetch", girdi: { url: "http://localhost%2e/", prompt: "x" }, karar: "RED", jev: [] },
  { b: "av12-URL", rol: "isci", arac: "WebFetch", girdi: { url: "http:\\\\127.0.0.1\\", prompt: "x" }, karar: "RED", jev: [] },
  { b: "av12-URL", rol: "isci", arac: "WebFetch", girdi: { url: "http://12\t7.0.0.1/", prompt: "x" }, karar: "RED", jev: [] },
  { b: "av12-URL", rol: "isci", arac: "WebFetch", girdi: { url: "http://[fe80::1%25eth0]/", prompt: "x" }, karar: "RED", jev: [] },
  { b: "av12-URL", rol: "isci", arac: "WebFetch", girdi: { url: "http://①②⑦.0.0.1/", prompt: "x" }, karar: "RED", jev: [] },
  { b: "av12-URL", rol: "isci", arac: "WebFetch", girdi: { url: "http://localhost../", prompt: "x" }, karar: "RED", jev: [] },
  // av12 şef kararı: açılması belirsiz ev ve ortam değişkeni yazımı insana (kapalı kapı), Glob'da her .. bileşeni insana
  { b: "av12-BY", rol: "isci", arac: "Read", girdi: { file_path: "~kullanici/x.txt" }, karar: "INSAN", jev: [] },
  { b: "av12-BY", rol: "isci", arac: "Read", girdi: { file_path: "%USERPROFILE%/x.txt" }, karar: "INSAN", jev: [] },
  { b: "av12-BY", rol: "isci", arac: "Read", girdi: { file_path: "$env:USERPROFILE/x.txt" }, karar: "INSAN", jev: [] },
  { b: "av12-BY", rol: "isci", arac: "Read", girdi: { file_path: "$HOME/x.txt" }, karar: "INSAN", jev: [] },
  { b: "av12-BY", rol: "isci", arac: "Grep", girdi: { pattern: "a", path: "${HOME}" }, karar: "INSAN", jev: [] },
  { b: "av12-BY", rol: "isci", arac: "Glob", girdi: { pattern: "$HOME/*.txt" }, karar: "INSAN", jev: [] },
  { b: "av12-BY", rol: "isci", arac: "Write", girdi: { file_path: "%APPDATA%/x.txt", content: "x" }, karar: "INSAN", jev: [] },
  { b: "av12-BY", rol: "isci", arac: "Read", girdi: { file_path: "deneme/a~b.txt" }, karar: "IZIN", jev: [] },
  { b: "av12-BY", rol: "isci", arac: "Read", girdi: { file_path: "deneme/100%.txt" }, karar: "IZIN", jev: [] },
  { b: "av12-GD", rol: "isci", arac: "Glob", girdi: { pattern: "deneme/../*.ts" }, karar: "INSAN", jev: [] },
  { b: "av12-GD", rol: "isci", arac: "Glob", girdi: { pattern: "deneme/../sunucu/a.ts" }, karar: "INSAN", jev: [] },
  { b: "av12-GD", rol: "isci", arac: "Glob", girdi: { pattern: "sunucu/**/*.ts" }, karar: "IZIN", jev: [] },  // hata-avi-13 (av13)
  { b: "av13-NK", rol: "sef", arac: "Glob", girdi: { pattern: "**/panel-url.txt/." }, karar: "INSAN", jev: [] },
  { b: "av13-NK", rol: "sef", arac: "Grep", girdi: { pattern: "=", glob: "**/panel-url.txt/." }, karar: "INSAN", jev: [] },
  { b: "av13-FU", rol: "isci", arac: "Read", girdi: { file_path: "file:///<ANA>/%2Eenv" }, karar: "INSAN", jev: [] }, // av13: bugün IZIN (Bulgu 2)
  { b: "av13-FU", rol: "isci", arac: "Read", girdi: { file_path: "file:///<ANA>/.%65nv" }, karar: "INSAN", jev: [] }, // av13: bugün IZIN (Bulgu 2)
  { b: "av13-FU", rol: "isci", arac: "Read", girdi: { file_path: "file:///C:.env" }, karar: "INSAN", jev: [] }, // av13: bugün IZIN (Bulgu 2)
  { b: "av13-FU", rol: "isci", arac: "Read", girdi: { file_path: "file:///<ANA>/%2Etmp/x.txt" }, karar: "INSAN", jev: [] }, // av13: bugün IZIN (Bulgu 2)
  { b: "av13-FU", rol: "sef", arac: "Grep", girdi: { pattern: "=", path: "file:///C:.env" }, karar: "INSAN", jev: [] }, // av13: bugün IZIN (Bulgu 2); RED de kabul
  { b: "av13-FU", rol: "sef", arac: "Grep", girdi: { pattern: "t=", path: "file:///<ANA>/%2Etmp" }, karar: "INSAN", jev: [] }, // av13: bugün IZIN (Bulgu 2); RED de kabul
  { b: "av13-FU", rol: "isci", arac: "Write", girdi: { file_path: "file:///<ANA>/%2Eenv", content: "x" }, karar: "INSAN", jev: [] }, // av13: bugün TEK (Bulgu 2)
  { b: "av13-FU", rol: "sef", arac: "Grep", girdi: { pattern: "t=", path: "file:///<SIR>" }, karar: "INSAN", jev: [] }, // bugün INSAN; çeviri onIsle'a taşınırsa RED
  { b: "av13-TL", rol: "isci", arac: "Read", girdi: { file_path: "~/.." }, karar: "INSAN", jev: [] },
  { b: "av13-TL", rol: "isci", arac: "Read", girdi: { file_path: "~//" }, karar: "INSAN", jev: [] },
  { b: "av13-TL", rol: "isci", arac: "Read", girdi: { file_path: "~\\..\\" }, karar: "INSAN", jev: [] },
  { b: "av13-TL", rol: "isci", arac: "Read", girdi: { file_path: " ~/x.txt" }, karar: "INSAN", jev: [] },
  { b: "av13-TL", rol: "isci", arac: "LS", girdi: { path: "~/" }, karar: "INSAN", jev: [] },
  { b: "av13-TL", rol: "isci", arac: "Read", girdi: { file_path: "~́/x.txt" }, karar: "INSAN", jev: [] },
  { b: "av13-TL", rol: "isci", arac: "Read", girdi: { file_path: "~+/x" }, karar: "INSAN", jev: [] },
  { b: "av13-TL", rol: "isci", arac: "Read", girdi: { file_path: "～/x.txt" }, karar: "IZIN", jev: [] }, // CLI açmaz: kökte harfi harfine klasör
  { b: "av13-TL", rol: "isci", arac: "Read", girdi: { file_path: "~/.claude/.credentials.json" }, karar: "INSAN", jev: [] },
  { b: "av13-TL", rol: "isci", arac: "Glob", girdi: { pattern: "~/**/panel-url.txt" }, karar: "INSAN", jev: [] },
  { b: "av13-TL", rol: "isci", arac: "Glob", girdi: { pattern: "~/.claude/.cred*" }, karar: "INSAN", jev: [] },
  { b: "av13-TL", rol: "isci", arac: "Glob", girdi: { pattern: "~/*.txt" }, karar: "INSAN", jev: [] },
  { b: "av13-KB", rol: "isci", arac: "Bash", girdi: "rm -rf ~/..", karar: "INSAN", jev: [] },
  { b: "av13-KB", rol: "isci", arac: "Bash", girdi: "rm -rf ~+/x", karar: "INSAN", jev: [] },
  { b: "av13-KB", rol: "isci", arac: "Bash", girdi: "rm -r -- ~", karar: "INSAN", jev: [] },
  { b: "av13-KB", rol: "isci", arac: "PowerShell", girdi: "Remove-Item -Recurse -Path:~", karar: "INSAN", jev: [] },
  { b: "av13-KB", rol: "isci", arac: "PowerShell", girdi: "Remove-Item -Recurse (Resolve-Path ~)", karar: "INSAN", jev: [] },
  { b: "av13-KB", rol: "isci", arac: "PowerShell", girdi: "rd /s /q %USERPROFILE%", karar: "INSAN", jev: [] },
  { b: "av13-KB", rol: "isci", arac: "Bash", girdi: "cd $HOME; git push --force", karar: "RED", jev: [] },
  { b: "av13-KB", rol: "isci", arac: "PowerShell", girdi: "Set-Location ~; git push --force", karar: "RED", jev: [] },
  { b: "av13-KB", rol: "isci", arac: "Bash", girdi: "cd ~ && rm -rf Desktop", karar: "TEK", jev: ["cd ~ && rm -rf Desktop"] },
  { b: "av13-KB", rol: "isci", arac: "Bash", girdi: "rm -rf ./~", karar: "TEK", jev: ["rm -rf ./~"] },
  { b: "av13-KB", rol: "isci", arac: "Bash", girdi: "ls ~; ls", karar: "PARCA:2", jev: ["ls ~", "ls"] },
  { b: "av13-YZ", rol: "isci", arac: "Write", girdi: { file_path: "~/.git/hooks/pre-commit", content: "x" }, karar: "RED", jev: [] },
  { b: "av13-YZ", rol: "isci", arac: "Write", girdi: { file_path: "${HOME}/x.txt", content: "x" }, karar: "INSAN", jev: [] },
  { b: "av13-YZ", rol: "isci", arac: "Write", girdi: { file_path: "$env:USERPROFILE\\x.txt", content: "x" }, karar: "INSAN", jev: [] },
  { b: "av13-YZ", rol: "isci", arac: "Edit", girdi: { file_path: "%LOCALAPPDATA%/zepul-os/panel-url.txt", old_string: "a", new_string: "b" }, karar: "INSAN", jev: [] },
  { b: "av13-YZ", rol: "isci", arac: "MultiEdit", girdi: { file_path: "$HOME/x.txt" }, karar: "INSAN", jev: [] },
  { b: "av13-YZ", rol: "isci", arac: "NotebookEdit", girdi: { notebook_path: "deneme/a.ipynb", file_path: "~/a.ipynb", new_source: "x" }, karar: "INSAN", jev: [] },
  { b: "av13-YZ", rol: "isci", arac: "NotebookEdit", girdi: { notebook_path: "deneme/a.ipynb", file_path: "$HOME/a.ipynb", new_source: "x" }, karar: "INSAN", jev: [] },
  { b: "av13-AD", rol: "isci", arac: "read", girdi: { file_path: "deneme/a.txt" }, karar: "TEK", jev: ["?"] }, // bilinmeyen ad Jev'siz izin almaz
  { b: "av13-AD", rol: "isci", arac: "BASH", girdi: "git push --force", karar: "RED", jev: [] },
  { b: "av13-AD", rol: "isci", arac: "Foo", girdi: "rm -rf ~", karar: "INSAN", jev: [] },
  { b: "av13-AD", rol: "isci", arac: "", girdi: {}, karar: "TEK", jev: ["?"] },
  { b: "av13-AD", rol: "isci", arac: "mcp__bus__x", girdi: { file_path: "$HOME/x" }, karar: "INSAN", jev: [] },
  { b: "av13-AD", rol: "isci", arac: "mcp__bus__x", girdi: "git push --force", karar: "RED", jev: [] },
  // hata-avi-14 (av14): tur 2-4 kritik örnekleri (kapi.test.ts'te vardı, tabloda yoktu), normalize kenarları, file: biçimleri
  { b: "av14-T24", rol: "denetci", arac: "Bash", girdi: "cd \"<KOPYA>/m1\"; cd -; rm -rf src", karar: "TEK", jev: ["cd \"<KOPYA>/m1\"; cd -; rm -rf src"] },
  { b: "av14-T24", rol: "denetci", arac: "PowerShell", girdi: "cd '<KOPYA>\\m1'; cd -; Remove-Item -Recurse -Force src", karar: "TEK", jev: ["cd '<KOPYA>\\m1'; cd -; Remove-Item -Recurse -Force src"] },
  { b: "av14-T24", rol: "denetci", arac: "Bash", girdi: "cd - && rm -rf src", karar: "TEK", jev: ["cd - && rm -rf src"] },
  { b: "av14-T24", rol: "denetci", arac: "Bash", girdi: "cd \"<KOPYA>/m1\"; cd C:; rm -rf src", karar: "TEK", jev: ["cd \"<KOPYA>/m1\"; cd C:; rm -rf src"] },
  { b: "av14-T24", rol: "denetci", arac: "Bash", girdi: "cd \"<KOPYA>/m1\" & rm -rf src", karar: "TEK", jev: ["cd \"<KOPYA>/m1\" & rm -rf src"] },
  { b: "av14-T24", rol: "denetci", arac: "Bash", girdi: "chdir \"<KOPYA>/m1\"; rm -rf src", karar: "TEK", jev: ["chdir \"<KOPYA>/m1\"; rm -rf src"] },
  { b: "av14-T24", rol: "isci", arac: "Bash", girdi: "ls; cat a.txt | uniq - hedef.txt", karar: "TEK", jev: ["ls; cat a.txt | uniq - hedef.txt"] },
  { b: "av14-T24", rol: "isci", arac: "PowerShell", girdi: "ls; Get-Content a.txt | sort.exe /O C:/x/y.txt", karar: "TEK", jev: ["ls; Get-Content a.txt | sort.exe /O C:/x/y.txt"] },
  { b: "av14-T24", rol: "isci", arac: "Bash", girdi: "ls; echo veri >| C:/x/bin/grep", karar: "TEK", jev: ["ls; echo veri >| C:/x/bin/grep"] },
  { b: "av14-NK", rol: "sef", arac: "Glob", girdi: { pattern: "a/../.env" }, karar: "INSAN", jev: [] },
  { b: "av14-NK", rol: "sef", arac: "Glob", girdi: { pattern: "**/.env/x/.." }, karar: "INSAN", jev: [] },
  { b: "av14-NK", rol: "sef", arac: "Glob", girdi: { pattern: "a/../.en*" }, karar: "INSAN", jev: [] },
  { b: "av14-NK", rol: "sef", arac: "Glob", girdi: { pattern: ".env/.." }, karar: "INSAN", jev: [] },
  { b: "av14-NK", rol: "sef", arac: "Grep", girdi: { pattern: "=", glob: ".env/.." }, karar: "IZIN", jev: [] }, // ripgrep globu .. içeren yola uymaz
  { b: "av14-NK", rol: "isci", arac: "Read", girdi: { file_path: ".env/.." }, karar: "IZIN", jev: [] }, // kökün kendisi
  { b: "av14-NK", rol: "sef", arac: "Grep", girdi: { pattern: "t=", path: "<SIR>/x/.." }, karar: "INSAN", jev: [] },
  { b: "av14-NK", rol: "sef", arac: "Glob", girdi: { pattern: "<SIR>/x/../panel-url.txt" }, karar: "INSAN", jev: [] },
  { b: "av14-FU", rol: "isci", arac: "Read", girdi: { file_path: "FILE:///<ANA>/deneme/a.txt" }, karar: "INSAN", jev: [] },
  { b: "av14-FU", rol: "isci", arac: "Read", girdi: { file_path: "\tfile:///<ANA>/deneme/a.txt" }, karar: "INSAN", jev: [] },
  { b: "av14-FU", rol: "isci", arac: "Read", girdi: { file_path: "\u00A0file:///<ANA>/deneme/a.txt" }, karar: "INSAN", jev: [] },
  { b: "av14-FU", rol: "isci", arac: "Read", girdi: { file_path: "\u3000file:///<ANA>/deneme/a.txt" }, karar: "INSAN", jev: [] },
  { b: "av14-FU", rol: "isci", arac: "Read", girdi: { file_path: "file:deneme/a.txt" }, karar: "INSAN", jev: [] },
  { b: "av14-FU", rol: "isci", arac: "NotebookRead", girdi: { notebook_path: "File:///<ANA>/a.ipynb" }, karar: "INSAN", jev: [] },
  { b: "av14-FU", rol: "isci", arac: "LS", girdi: { path: " FILE:///<ANA>" }, karar: "INSAN", jev: [] },
  { b: "av14-FU", rol: "sef", arac: "Glob", girdi: { pattern: "FILE:///<ANA>/*.ts" }, karar: "INSAN", jev: [] },
  { b: "av14-FU", rol: "sef", arac: "Glob", girdi: { pattern: "*", path: "fIlE:///<SIR>" }, karar: "INSAN", jev: [] },
  { b: "av14-FU", rol: "sef", arac: "Glob", girdi: { pattern: "File:///**/.env" }, karar: "INSAN", jev: [] },
  { b: "av14-FU", rol: "isci", arac: "Read", girdi: { file_path: "FILE:///<ANA>/deneme/a.txt" }, karar: "INSAN", jev: [], yerel: true },
  { b: "av14-FU", rol: "isci", arac: "mcp__bus__x", girdi: { file_path: "FILE:///<ANA>/deneme/a.txt" }, karar: "INSAN", jev: [] },
  { b: "av14-FU", rol: "isci", arac: "Read", girdi: { file_path: "ｆｉｌｅ:///<ANA>/%2Eenv" }, karar: "IZIN", jev: [] }, // şema değil: CLI de kökte geçersiz göreli yol açar
  { b: "av14-FU", rol: "isci", arac: "Read", girdi: { file_path: "\u200Bfile:///<ANA>/%2Eenv" }, karar: "IZIN", jev: [] }, // U+200B trim edilmez; CLI ile aynı yorum
  // Çalışma alanları (calisma-alanlari.md): alan içi salt okuma Jev'siz izin; alan dışı ilk dokunuş alan kartı; sır kuralı alanda da geçerli;
  // listeye elle yazılmış yasak kök (sürücü kökü, kullanıcı dizini) kapıda yok sayılır, alan kartı da yasak kökü önermez.
  { b: "ALAN", rol: "isci", arac: "Read", girdi: { file_path: "<ALAN>/a.txt" }, karar: "IZIN", jev: [], alanlar: ["<ALAN>"] },
  { b: "ALAN", rol: "isci", arac: "Grep", girdi: { pattern: "x", path: "<ALAN>" }, karar: "IZIN", jev: [], alanlar: ["<ALAN>"] },
  { b: "ALAN", rol: "sef", arac: "Glob", girdi: { pattern: "<ALAN>/**/*.ts" }, karar: "IZIN", jev: [], alanlar: ["<ALAN>"] },
  { b: "ALAN", rol: "isci", arac: "Read", girdi: { file_path: "<ALAN>/a.txt" }, karar: "IZIN", jev: [], alanlar: ["<ALAN>"], yerel: true },
  { b: "ALAN", rol: "isci", arac: "Read", girdi: { file_path: "<DIS>/a.txt" }, karar: "ALAN", jev: [], alanlar: ["<ALAN>"] },
  { b: "ALAN", rol: "sef", arac: "Grep", girdi: { pattern: "x", path: "<DIS>" }, karar: "ALAN", jev: [] },
  { b: "ALAN", rol: "isci", arac: "Read", girdi: { file_path: "<ALAN>/../<DISAD>/a.txt" }, karar: "ALAN", jev: [], alanlar: ["<ALAN>"] },
  { b: "ALAN", rol: "isci", arac: "Read", girdi: { file_path: "<DIS>/a.txt" }, karar: "ALAN", jev: [], alanlar: ["C:/"] },
  { b: "ALAN", rol: "isci", arac: "Read", girdi: { file_path: "C:/Windows/win.ini" }, karar: "INSAN", jev: [], alanlar: ["C:/"] },
  { b: "ALAN", rol: "isci", arac: "Read", girdi: { file_path: "C:/Windows/win.ini" }, karar: "INSAN", jev: [], alanlar: ["C:/Windows"] },
  // Güven modu (guven-modu.md). tam: Jev ve insan sorulmaz; kesin yasak, sır kuralı, sahiplik ve (alan_otomatik yoksa) alan kartı kalır.
  { b: "GM-jev", rol: "isci", arac: "Bash", girdi: "npm install left-pad", karar: "TEK", jev: ["npm install left-pad"], kademe: "jev" },
  { b: "GM-jev", rol: "isci", arac: "Bash", girdi: "ls; git status", karar: "PARCA:2", jev: ["ls", "git status"], kademe: "jev" },
  // Aday 1: tam güvende kabuk aracında Jev gölgede bütün komutla sorulur; kararı etkilemez (TAM yine izin).
  { b: "GM-tam", rol: "isci", arac: "Bash", girdi: "npm install left-pad", karar: "TAM", jev: ["npm install left-pad"], kademe: "tam" },
  { b: "GM-tam", rol: "isci", arac: "Bash", girdi: "npm install left-pad", karar: "TAM", jev: ["npm install left-pad"], kademe: "tam", yerel: true },
  { b: "GM-tam", rol: "isci", arac: "Bash", girdi: "ls; git status", karar: "TAM", jev: ["ls; git status"], kademe: "tam" },
  { b: "GM-tam", rol: "isci", arac: "Write", girdi: { file_path: "deneme/x.txt", content: "x" }, karar: "TAM", jev: [], kademe: "tam" },
  { b: "GM-tam", rol: "isci", arac: "Bash", girdi: "git push --force origin main", karar: "RED", jev: [], kademe: "tam" },
  { b: "GM-tam", rol: "isci", arac: "Bash", girdi: "ls; git push --force origin main", karar: "RED", jev: [], kademe: "tam" },
  { b: "GM-tam", rol: "isci", arac: "PowerShell", girdi: "Write-Output 'git push --force' | Invoke-Expression", karar: "RED", jev: [], kademe: "tam" },
  { b: "GM-tam", rol: "isci", arac: "Bash", girdi: "git reset --hard HEAD~1", karar: "INSAN", jev: [], kademe: "tam" },
  { b: "GM-tam", rol: "isci", arac: "Write", girdi: { file_path: "%APPDATA%/x.txt", content: "x" }, karar: "INSAN", jev: [], kademe: "tam" },
  { b: "GM-tam", rol: "isci", arac: "Read", girdi: { file_path: "<DIS>/a.txt" }, karar: "ALAN", jev: [], alanlar: ["<ALAN>"], kademe: "tam" },
  { b: "GM-tam", rol: "isci", arac: "Read", girdi: { file_path: "<DIS>/a.txt" }, karar: "TAM", jev: [], alanlar: ["<ALAN>"], kademe: "tam", alan_otomatik: true },
  { b: "GM-tam", rol: "isci", arac: "Read", girdi: { file_path: "C:/Windows/win.ini" }, karar: "INSAN", jev: [], kademe: "tam", alan_otomatik: true },
  { b: "GM-tam", rol: "isci", arac: "Read", girdi: { file_path: "<DIS>/a.txt" }, karar: "ALAN", jev: [], alanlar: ["<ALAN>"], kademe: "jev", alan_otomatik: true },
  { b: "GM-kul", rol: "isci", arac: "Bash", girdi: "ls", karar: "INSAN", jev: [], kademe: "kullanici" },
  { b: "GM-kul", rol: "isci", arac: "Bash", girdi: "ls; git status", karar: "INSAN", jev: [], kademe: "kullanici" },
  { b: "GM-kul", rol: "isci", arac: "Write", girdi: { file_path: "deneme/x.txt", content: "x" }, karar: "INSAN", jev: [], kademe: "kullanici" },
  { b: "GM-kul", rol: "isci", arac: "Read", girdi: { file_path: "<ALAN>/a.txt" }, karar: "IZIN", jev: [], alanlar: ["<ALAN>"], kademe: "kullanici" },
  { b: "GM-kul", rol: "isci", arac: "Bash", girdi: "git push --force origin main", karar: "RED", jev: [], kademe: "kullanici" },
  { b: "LY", rol: "isci", arac: "Bash", girdi: "npm test", karar: "LAYA:TEK", jev: ["npm test"], jevHata: 429, laya: "guvenli" },
  { b: "LY", rol: "isci", arac: "Bash", girdi: "ls; git status", karar: "LAYA:PARCA:2", jev: ["ls", "git status"], jevHata: 429, laya: "guvenli" },
  { b: "LY", rol: "isci", arac: "Bash", girdi: "npm install left-pad", karar: "LAYA:INSAN", jev: ["npm install left-pad"], jevHata: 429, laya: "riskli" },
  { b: "LY", rol: "isci", arac: "Bash", girdi: "ls; git status", karar: "LAYA:INSAN", jev: ["ls", "git status"], jevHata: 429, laya: "riskli" },
  { b: "LY", rol: "isci", arac: "Bash", girdi: "npm test", karar: "TEK", jev: ["npm test"], jevHata: 429, laya: "hata" },
  { b: "LY", rol: "isci", arac: "Bash", girdi: "npm test", karar: "INSAN", jev: ["npm test"], jevHata: 429, laya: "hata", yerel: true },
  { b: "LY", rol: "isci", arac: "Bash", girdi: "git push --force origin main", karar: "RED", jev: [], jevHata: 429, laya: "guvenli" },
  // Aday 5: süslü parantez alt kümesi (KAPI.md). Her desen hem Glob pattern'i hem Grep glob'u olarak sınanır.
  // İzin: tek düzey {a,b}, yalnız [A-Za-z0-9_.\-/*]; her açılım panel belirteci ve proje dışı denetiminden ayrı geçti.
  ...["**/*.{html,js,css,tsx,jsx}", "{sunucu,test}/**", "{panel/*,sunucu/ses.ts,test/*}", "sunucu/{a,b}.ts", "{a,b}/{c,d}.md", "{a,b,c,d}/{e,f,g,h,i,j,k,l}",
    // Kullanıcı kararı 27.10.2026: genel sır listesi kaldırıldı; .env, *.key, .credentials.json ve .tmp açılımları da izinli.
    "{.env,a}", "**/*.{key,pem}", "{.credentials.json,a}", "**/{x,.credentials.json}", "{.tmp,a}/**", "{.tm*,a}/**", "{a,b}/.e{nv,x}", "{.e,x}{nv,y}"].flatMap((p): Satir[] => [
    { b: "SU", rol: "sef", arac: "Glob", girdi: { pattern: p }, karar: "IZIN", jev: [] },
    { b: "SU", rol: "sef", arac: "Grep", girdi: { pattern: "x", glob: p }, karar: "IZIN", jev: [] }]),
  // İnsana: .., iç içe, köşeli, mutlak, sürücü, ~, boş alternatif, büyük açılım
  // (6×6=36 > 32), üç grup, alt küme dışı karakter (! ? boşluk), grup dışı virgül.
  ...["{..,x}/**", "a/{b,..}/c", "{a,{b,c}}", "[ab]*", "{C:/x,y}", "{~/.ssh,a}", "{a,}", "{,a}", "{}",
    "{a,b,c,d,e,f}/{a,b,c,d,e,f}", "{a,b}{c,d}{e,f}",
    "/{a,b}", "{/etc,a}", "{a,b}?", "!{a,b}", "{a,b} .env", "x,{a,b}", "{a,b}}", "{{a,b}"].flatMap((p): Satir[] => [
    { b: "SU", rol: "sef", arac: "Glob", girdi: { pattern: p }, karar: "INSAN", jev: [] },
    { b: "SU", rol: "sef", arac: "Grep", girdi: { pattern: "x", glob: p }, karar: "INSAN", jev: [] }]),
  // path ve type'ta parantez açılmaz (araç onu harfi harfine okur), insana kalır; Grep'in pattern'i içerik regex'idir, kural dışı.
  { b: "SU", rol: "sef", arac: "Glob", girdi: { pattern: "*.ts", path: "{sunucu,test}" }, karar: "INSAN", jev: [] },
  { b: "SU", rol: "sef", arac: "Grep", girdi: { pattern: "x", path: "{sunucu,test}" }, karar: "INSAN", jev: [] },
  { b: "SU", rol: "sef", arac: "Grep", girdi: { pattern: "a{2,3}", glob: "*.ts" }, karar: "IZIN", jev: [] },
  // Alt kümedeki desen de proje dışı denetiminden geçer: path proje dışıysa açılım dışarıdadır.
  { b: "SU", rol: "sef", arac: "Glob", girdi: { pattern: "{a,b}/**", path: "<DIS>" }, karar: "INSAN", jev: [] },
];

for (const [n, s] of TABLO.entries()) {
  test(`karar tablosu ${n + 1} ${s.b} ${s.rol}/${s.arac}: ${typeof s.girdi === "string" ? s.girdi : JSON.stringify(s.girdi)}`, async () => {
    const sorulan: string[] = [];
    const d: KapiBagimlilik = {
      jevSor: async (g: any) => {
        sorulan.push(/Komut:\n([\s\S]*?)(\nBağlam:|$)/.exec(g.state)?.[1] ?? "?");
        if (s.jevHata) throw Object.assign(new Error(`HTTP ${s.jevHata}`), { status: s.jevHata });
        return cevap;
      },
      layaSor: async () => { if (!s.laya || s.laya === "hata") throw new Error("yok"); return layaCevap(s.laya, 0.9); }, golgeYaz: () => {}, hataYaz: () => {},
      // av11: sahte DNS, gerçek ağ yok. nip.io ve localtest.me yerel adrese, kalan adlar belgeleme adresine çözülür.
      dnsCoz: async (ad: string) => (/(^|\.)(nip\.io|localtest\.me)$/i.test(ad) ? ["127.0.0.1"] : ["203.0.113.7"]),
    };
    const g: KapiGirdi = { rol: s.rol, ajan: `${s.rol}-isci1`, arac: s.arac, girdi: typeof s.girdi === "string" ? { command: ac(s.girdi) } : JSON.parse(ac(JSON.stringify(s.girdi))), sahiplik: new Map(), yerel: s.yerel,
      kok: s.rol === "denetci" ? WT : KOK, kopya_kokleri: [KOPYA], ...(s.alanlar ? { alanlar: s.alanlar.map(ac) } : {}),
      ...(s.kademe ? { guven: { kademe: s.kademe, alan_otomatik: !!s.alan_otomatik } } : {}) };
    const k = await kapiKarari(g, d);
    const karar0 = k.karar === "izin" && /^izin \(tam güven\)/.test(k.neden) && k.karar_kaynagi === "tam-guven" && !k.parcalar ? "TAM" : k.karar === "red" ? "RED" : k.karar === "insan" && k.alan && /^(ALAN|GM)/.test(s.b) ? "ALAN" : k.karar === "insan" ? "INSAN" : k.karar === "izin" && !k.parcalar && !sorulan.length ? "IZIN"
      : k.parcalar ? `PARCA:${sorulan.length}` : sorulan.length === 1 && k.karar === "gec" ? "TEK" : `?${k.karar}:${sorulan.length}`;
    const karar = (k.karar_kaynagi === "laya-yedek" ? "LAYA:" : "") + karar0;
    assert.equal(karar, s.karar, k.neden);
    assert.deepEqual(sorulan, s.jev.map((p) => jevMaskele(ac(p))));
  });
}
