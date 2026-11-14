// ntfy bildirimi: hem CLI hem modül. Node 18+ (yerleşik fetch), bağımlılık yok.
// CLI:   node araclar/ntfy.mjs "<KONU: DURUM: açıklama>" "<tek satır mesaj>" [tag] [öncelik]
// Modül: import { bildir } from "./ntfy.mjs"
// Test konusu: ZEPUL_NTFY_KONU=<konu> (varsayılan ornek_konu)
// Öz-kontrol (ağa gitmez): node araclar/ntfy.mjs --test
// Bildirim bir kolaylıktır: hata yutulur, çıkış kodu 0 kalır, iş durmaz.
import assert from "node:assert/strict";
import { basename } from "node:path";

const URL_ = "https://ntfy.sh/";
const KONU = "ornek_konu";
const BASLIKLAR = { "Content-Type": "application/json; charset=utf-8" };
const BASLIK_BICIMI = /^[^:]+: [^:]+: .+/; // "KONU: DURUM: açıklama"

// Gönderilecek JSON gövdesi (ağdan bağımsız, öz-kontrol bunu sınar).
export function govde(title, message, tag, priority) {
  const oncelik = Math.min(5, Math.max(1, Math.trunc(Number(priority)) || 3));
  return { topic: process.env.ZEPUL_NTFY_KONU || KONU, title, message, priority: oncelik, tags: tag ? [tag] : [] };
}

// K12: ZEPUL_TEST=1 iken bildirim atlanır; ZEPUL_NTFY_KONU verilmişse test bildirimi o ayrı konuya gider.
export const atlanir = (env = process.env) => env.ZEPUL_TEST === "1" && !env.ZEPUL_NTFY_KONU;

export async function bildir(title, message, tag, priority) {
  if (!BASLIK_BICIMI.test(title ?? "")) {
    console.error('ntfy uyarı: başlık "KONU: DURUM: açıklama" biçiminde değil');
  }
  try {
    const res = await fetch(URL_, {
      method: "POST",
      headers: BASLIKLAR,
      body: JSON.stringify(govde(title, message, tag, priority)),
      signal: AbortSignal.timeout(10_000), // ağ takılırsa iş durmasın
    });
    return res.ok;
  } catch {
    return false; // yut: bildirim gereklilik değil
  }
}

function ozKontrol() {
  const baslik = "Örnek İş: bilgilendirme: çğıöşü denemesi";
  const g = JSON.parse(JSON.stringify(govde(baslik, "tek satır", "white_check_mark", 4)));
  assert.deepEqual(g, {
    topic: "ornek_konu",
    title: baslik,
    message: "tek satır",
    priority: 4,
    tags: ["white_check_mark"],
  });
  assert.equal(govde("a", "b").priority, 3, "varsayılan öncelik 3");
  assert.deepEqual(govde("a", "b").tags, [], "tag yoksa boş dizi");
  assert.equal(govde("a", "b", "x", "abc").priority, 3, "sayı olmayan öncelik 3'e düşer");
  assert.equal(govde("a", "b", "x", 9).priority, 5, "öncelik 5'te kırpılır");
  assert.equal(BASLIKLAR["Content-Type"], "application/json; charset=utf-8");
  assert.ok(BASLIK_BICIMI.test("Örnek Proje: soru: karar lazım"));
  assert.ok(BASLIK_BICIMI.test("Kısa: hata: ekstre: okunamıyor"), "açıklamada iki nokta olabilir");
  assert.ok(!BASLIK_BICIMI.test("sadece başlık"));
  assert.ok(!BASLIK_BICIMI.test("Konu: durum"));
  console.log("ntfy öz-kontrol: geçti");
}

// Yalnızca doğrudan çalıştırılınca CLI olur; import edilince hiçbir şey yapmaz.
if (basename(process.argv[1] ?? "") === "ntfy.mjs") {
  const [a, b, tag, oncelik] = process.argv.slice(2);
  if (a === "--test") {
    ozKontrol();
  } else if (a === undefined || b === undefined) {
    console.error('Kullanım: node araclar/ntfy.mjs "<KONU: DURUM: açıklama>" "<tek satır mesaj>" [tag] [öncelik]');
  } else {
    await bildir(a, b, tag, oncelik);
  }
}
