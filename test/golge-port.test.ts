import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync, existsSync } from "node:fs"
import { createServer } from "node:net"
import { spawnSync } from "node:child_process"
import { join } from "node:path"

const py = join(process.env.USERPROFILE ?? "", "laya-env/Scripts/python.exe")

test("gölge Laya portu 8796: py, Baslat.bat (ASCII, CRLF), DUMAN.md", () => {
  assert.match(readFileSync("araclar/laya-golge-sunucu.py", "utf8"), /"--port", type=int, default=8796/)
  const bat = readFileSync("Baslat.bat", "latin1")
  assert.ok(!/[^\x00-\x7f]/.test(bat) && /\r\n/.test(bat) && !/(?<!\r)\n/.test(bat), "yalnızca ASCII ve CRLF")
  assert.ok(bat.includes("8796") && !bat.includes("8789"))
  assert.ok(!readFileSync("sunucu/DUMAN.md", "utf8").includes("Faz 6 gölge Laya: 8789"))
})

// K29: CRLF kullanıcının core.autocrlf ayarından değil depodan gelsin; autocrlf=false klonda da .bat CRLF çıkar (DEVIR 6).
test("K29: izlenen .bat/.cmd dosyaları .gitattributes ile eol=crlf", () => {
  const git = (...a: string[]) => spawnSync("git", a, { encoding: "utf8" }).stdout
  const dosyalar = git("ls-files", "*.bat", "*.cmd").split("\n").filter(Boolean)
  assert.ok(dosyalar.includes("Baslat.bat"), dosyalar.join(","))
  const attr = git("check-attr", "text", "eol", "--", ...dosyalar)
  for (const f of dosyalar) {
    assert.ok(attr.includes(`${f}: text: set`) && attr.includes(`${f}: eol: crlf`), attr)
  }
})

test("gölge Laya sunucusu dolu portta açık hatayla çıkar", { skip: !existsSync(py) }, async () => {
  const s = createServer()
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r))
  const port = (s.address() as { port: number }).port
  try {
    const r = spawnSync(py, ["araclar/laya-golge-sunucu.py", "--port", String(port)], { encoding: "utf8", timeout: 30000, env: { ...process.env, PYTHONIOENCODING: "utf-8" } })
    assert.notEqual(r.status, 0)
    assert.match(r.stderr + r.stdout, /dolu/)
  } finally { s.close() }
})
