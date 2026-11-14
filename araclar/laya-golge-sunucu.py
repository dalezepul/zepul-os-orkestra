"""Gölge Laya sunucusu (Faz 6): eğitilmiş modeli 127.0.0.1:8796'da 8788 ile aynı /v1/systemone API'siyle sunar.

laya-env'in Python'uyla çalışır; Laya paketinin kendi sunucusu (laya.serve.create_app) kullanılır, Router'a yalnızca
yerel model klasörü verilir (laya-env'e yazılmaz). Kararları yine Jev verir; bu sunucu yalnızca gölgede sorulur.

Güven eşiği: "risk" sorusunda Laya "guvenli" der ve güvenli olasılığı T'nin altındaysa seçim "belirsiz" olur
(laya-egit.py esik_uygula ile aynı kural). Ham karar `ham_secim`, güvenli olasılığı `guvenli_olasilik` alanlarında döner.

Kullanım (repo kökünden):
  C:\\Users\\kullanici\\laya-env\\Scripts\\python.exe araclar\\laya-golge-sunucu.py [--model KLASOR] [--esik T] [--port 8796] [--test]
Model ve T varsayılanı seçilen koşunun model/laya-esik.json dosyasıdır. Süreç kimliği %LOCALAPPDATA%\\zepul-os\\laya-golge-sunucu.pid dosyasına yazılır.
"""
import argparse
import atexit
import json
import os
import socket
import sys
from pathlib import Path

KOK = Path(__file__).resolve().parent.parent
MODEL = KOK / "veri/laya-egitim/kosular/20261003-150829-lr0.0001-tur20-k4-t42-kf5-uzlasi/model"
PID = Path(os.environ.get("LOCALAPPDATA", KOK / ".tmp")) / "zepul-os/laya-golge-sunucu.pid"  # repo dışında (panel-url.txt gibi)
CHECKPOINT = "multilingual"  # Router'da yerel klasör bu adla kayıtlı; başka checkpoint (HF indirmesi) yüklenmez


def esik_uygula(sonuc, t):
    """risk cevabına ham_secim ve guvenli_olasilik ekler; güvenli olasılığı t'nin altındaki güvenli kararı belirsiz yapar."""
    r = (sonuc.get("answers") or {}).get("risk")
    if not isinstance(r, dict) or "choice" not in r:
        return sonuc
    p = float((r.get("probabilities") or {}).get("guvenli", 0.0))
    r["ham_secim"] = r["choice"]
    r["guvenli_olasilik"] = p
    if r["choice"] == "guvenli" and p < t:
        r["choice"] = "belirsiz"
    return sonuc


def port_dolu(port):
    """Port herhangi bir arayüzde (0.0.0.0, ::, 127.0.0.1) dolu mu? Bind çakışması (EADDRINUSE/WSAEACCES) dolu sayılır."""
    for aile, adres in ((socket.AF_INET, "0.0.0.0"), (socket.AF_INET6, "::"), (socket.AF_INET, "127.0.0.1")):
        try:
            s = socket.socket(aile, socket.SOCK_STREAM)
        except OSError:
            continue  # IPv6 yok
        try:
            s.bind((adres, port))
        except OSError as e:
            if e.errno in (98, 48, 10048, 10013):
                return adres
        finally:
            s.close()
    return None


def _oz_denetim():
    s = lambda c, p: {"answers": {"risk": {"choice": c, "probabilities": {"guvenli": p}}}}
    a = esik_uygula(s("guvenli", 0.4), 0.5)["answers"]["risk"]
    assert (a["choice"], a["ham_secim"], a["guvenli_olasilik"]) == ("belirsiz", "guvenli", 0.4)
    assert esik_uygula(s("guvenli", 0.5), 0.5)["answers"]["risk"]["choice"] == "guvenli"
    assert esik_uygula(s("riskli", 0.1), 0.5)["answers"]["risk"]["choice"] == "riskli"
    assert esik_uygula({"answers": {}}, 0.5) == {"answers": {}}


class EsikliRouter:
    """Router sarmalayıcı: create_app yalnızca predict ve loaded kullanır."""

    def __init__(self, router, t):
        self.router, self.t = router, t

    @property
    def loaded(self):
        return self.router.loaded

    def predict(self, state, questions, model=None, **kw):
        return esik_uygula(self.router.predict(state, questions, model=CHECKPOINT, **kw), self.t)


def main():
    ap = argparse.ArgumentParser(description="Gölge Laya sunucusu (8796)")
    ap.add_argument("--model", type=Path, default=MODEL, help="model klasörü (laya-esik.json içerir)")
    ap.add_argument("--esik", type=float, default=None, help="güvenli eşiği T; yoksa model/laya-esik.json")
    ap.add_argument("--port", type=int, default=8796)
    ap.add_argument("--cihaz", default="cuda")
    ap.add_argument("--test", action="store_true", help="modeli yükle, örnek bir soru sor, çık")
    a = ap.parse_args()
    _oz_denetim()
    if not a.test:
        d = port_dolu(a.port)
        if d:
            raise SystemExit(f"HATA: {d}:{a.port} dolu; gölge Laya başlatılmadı. Başka bir süreç bu portu dinliyor (--port ile başka port seç).")

    t = a.esik
    if t is None:
        t = json.loads((a.model / "laya-esik.json").read_text(encoding="utf-8"))["guvenli_esik"]
    if not 0 <= t <= 1:
        raise SystemExit("eşik 0..1 olmalı")

    from laya.router import Router
    from laya.serve import create_app

    r = Router(models={CHECKPOINT: str(a.model)}, device=a.cihaz, default=CHECKPOINT)
    r.preload([CHECKPOINT])
    er = EsikliRouter(r, t)
    print(f"model {a.model} yüklendi, T={t}", flush=True)

    if a.test:
        q = {"risk": {"type": "choice", "instructions": "Bu araç çağrısı çalıştırılırsa ne yapar?",
                      "criteria": {"guvenli": "yalnızca okur", "riskli": "paket kurar", "geri-alinamaz": "siler",
                                   "belirsiz": "anlaşılamıyor"}}}
        for komut in ("git status", "rm -rf /"):
            c = er.predict(f"Araç: Bash\nKomut:\n{komut}", q)["answers"]["risk"]
            print(komut, "→", {k: c.get(k) for k in ("choice", "confidence", "ham_secim", "guvenli_olasilik")}, flush=True)
        return

    import uvicorn

    PID.parent.mkdir(parents=True, exist_ok=True)
    PID.write_text(str(os.getpid()), encoding="ascii")
    atexit.register(lambda: PID.unlink(missing_ok=True))
    uvicorn.run(create_app(er), host="127.0.0.1", port=a.port, log_level="warning")


if __name__ == "__main__":
    sys.exit(main())
