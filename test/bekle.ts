// Sabit uyku yerine koşul bekleme: koşul doğru olana dek yoklar, üst sınırda açıklayıcı hatayla düşer.
// Yük altında (paralel testler, GPU işi) sabit 20-200 ms yetmiyordu; burada yalnız tavan bol, normalde ilk yoklamalarda biter.
export async function bekleKadar(kosul: () => unknown, mesaj = "koşul gerçekleşmedi", sureMs = 10_000, aralikMs = 10): Promise<void> {
  for (const son = Date.now() + sureMs; ;) {
    if (await kosul()) return;
    if (Date.now() > son) throw new Error(`bekleKadar: ${mesaj} (${sureMs} ms)`);
    await new Promise((r) => setTimeout(r, aralikMs));
  }
}
