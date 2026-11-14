"""Laya ince ayarı: kapının "risk" (choice) ve "dis_etki" (noul) sorularını Jev etiketiyle öğretir.

Yöntem: Laya'nın kendi DecisionModel'i (mmBERT gövde + 2 katmanlı baş + seçenek puanlayıcı) aynen
kullanılır. Gövde donuk; baş, puanlayıcı ve tip gömmesi eğitilir (--acik-katman N ile gövdenin son N
katmanı da açılır). Hedef, Jev olasılıkları (yumuşak etiket, damıtma). Çıktı, laya'nın okuduğu
checkpoint biçimindedir: Agent("<klasör>") ya da Router(models={"multilingual": "<klasör>"}) yükler.

Çalıştırma (laya-env'in python'u; paket kurmaz, laya-env'e yazmaz):
  C:\\Users\\kullanici\\laya-env\\Scripts\\python.exe araclar/laya-egit.py --cihaz cpu --kuru
  C:\\Users\\kullanici\\laya-env\\Scripts\\python.exe araclar/laya-egit.py --cihaz cuda --tur 6
Metrikler araclar/laya-olc.mjs'teki metrik() ile (node alt süreci) hesaplanır: aynı ölçüt.
Çıktı: her koşu veri/laya-egitim/kosular/<zaman>-<ayar özeti>/{model/ (git dışı), metrik.json};
veri/laya-egitim/metrik.json "son koşu" özeti, kosular.jsonl her koşunun bir satırı. Kuru koşu: metrik-kuru.json.
En iyi tur: eşiğe uzaklığı en küçük olan (eşikleri geçenlerin uzaklığı 0), eşitlikte yüksek kappa. Uzaklık, üç eşiğin
her biri için açığın normalize toplamıdır (bkz. uzaklik()); tek boyuta bakan yanlı seçim olmaz.
--kfold K: Jev sınıfına göre tabakalı K kat; her kat aynı başlangıç ağırlıklarından ayrı eğitilir, tur başına metrikler
kat ortalaması ± sapma olarak raporlanır ve en iyi tur ortalamaya göre seçilir. Son model tüm veriyle o tur sayısı kadar
eğitilip kaydedilir.
--etiket-modu uzlasi: Jev'in şablonun "beklenen" sınıfıyla uyuşmadığı ve Jev güveni 0,8'in altındaki kayıtlar atılır
(gölge kayıtlarında "beklenen" yok, yalnızca güven süzgeci).
"""
import argparse
import json
import os
import random
import shutil
import subprocess
import sys
import time
from collections import defaultdict
from pathlib import Path

os.environ.setdefault("HF_HUB_OFFLINE", "1")  # önbellekteki checkpoint yeter; ağa çıkma

import torch  # noqa: E402
from laya.agent import Agent  # noqa: E402
from laya.common import collate_items  # noqa: E402

KOK = Path(__file__).resolve().parent.parent
CIKTI = KOK / "veri" / "laya-egitim"
SINIFLAR = ["guvenli", "riskli", "geri-alinamaz", "belirsiz"]
ESIK_GUVENLIK, ESIK_KACIRMA, ESIK_KAPPA = 0.95, 0.02, 0.80  # devralma eşikleri


ANAHTARLAR = ("dogruluk", "kappa", "guvenlik_geri_cagirma", "riskliyi_guvenli_sanma")


def _sayi(m, k):
    """None: güvenlik yoksa 0, kaçırma yoksa 1 (kötü taraf)."""
    v = m[k]
    return (1.0 if k == "riskliyi_guvenli_sanma" else 0.0) if v is None else v


def uzaklik(m):
    """Eşiğe uzaklık: her eşik için açığın, o ölçünün eşikten en kötü değerine aralığa bölümü, toplanır.
    Aralıklar: güvenlik 0..0,95, kaçırma 0,02..1, kappa 0..0,80. 0 = üç eşik de geçildi."""
    g, k, kp = _sayi(m, "guvenlik_geri_cagirma"), _sayi(m, "riskliyi_guvenli_sanma"), m["kappa"]
    return (max(0.0, ESIK_GUVENLIK - g) / ESIK_GUVENLIK + max(0.0, k - ESIK_KACIRMA) / (1 - ESIK_KACIRMA)
            + max(0.0, ESIK_KAPPA - kp) / ESIK_KAPPA)


def tur_anahtari(m):
    """Küçük olan iyi: (eşiğe uzaklık, -kappa). Eşikleri geçenler arasında kappa belirler."""
    return (uzaklik(m), -m["kappa"])


def kat_ozeti(ms):
    """Katların metrikleri -> ortalama ve örneklem sapması (dört ana ölçü)."""
    import statistics
    o = {k: statistics.fmean(_sayi(m, k) for m in ms) for k in ANAHTARLAR}
    o["sapma"] = {k: statistics.stdev([_sayi(m, k) for m in ms]) if len(ms) > 1 else 0.0 for k in ANAHTARLAR}
    o["n"] = sum(m["n"] for m in ms)
    return o


# öz-denetim: eşikleri geçen 0; 20 tur koşusu (kappa yüksek, güvenlik az eksik) sınıf ağırlıklı koşudan önde
assert uzaklik({"guvenlik_geri_cagirma": 0.96, "riskliyi_guvenli_sanma": 0.01, "kappa": 0.85}) == 0
assert tur_anahtari({"guvenlik_geri_cagirma": 0.945, "riskliyi_guvenli_sanma": 0.018, "kappa": 0.864}) < \
    tur_anahtari({"guvenlik_geri_cagirma": 0.964, "riskliyi_guvenli_sanma": 0.036, "kappa": 0.622})


def agirlik_oku(metin):
    """'riskli=2,geri-alinamaz=2' -> {sınıf: ağırlık}; verilmeyen sınıf 1."""
    w = dict.fromkeys(SINIFLAR, 1.0)
    for parca in filter(None, (metin or "").split(",")):
        ad, _, deger = parca.partition("=")
        if ad.strip() not in w:
            raise SystemExit(f"--sinif-agirlik: bilinmeyen sınıf {ad!r}; geçerli: {', '.join(SINIFLAR)}")
        w[ad.strip()] = float(deger)
    return w


def node(js, girdi=None):
    """Kapının SORULAR'ını ve laya-olc.mjs'in metrik()'ini tek kaynaktan almak için."""
    r = subprocess.run(["node", "--input-type=module", "-e", js], cwd=KOK, input=girdi,
                       capture_output=True, text=True, encoding="utf-8", check=True)
    return json.loads(r.stdout)


def sorular():
    return node('const m = await import("./sunucu/kapi.ts"); console.log(JSON.stringify(m.SORULAR));')


def metrik_cok(listeler):
    """Tek node çağrısıyla çok sayıda tahmin listesinin metriği (tarama için)."""
    js = ('import fs from "node:fs"; const { metrik } = await import("./araclar/laya-olc.mjs");'
          'console.log(JSON.stringify(JSON.parse(fs.readFileSync(0, "utf8")).map((c) => metrik(c))));')
    return node(js, json.dumps(listeler))


def metrik(ciftler):
    return metrik_cok([ciftler])[0]


def esik_uygula(ciftler, t):
    """Güvenli olasılığı t'nin altındaki "güvenli" kararlar "belirsiz" olur."""
    return [{**c, "laya": "belirsiz"} if c["laya"] == "guvenli" and c["p_guvenli"] < t else c for c in ciftler]


# öz-denetim: eşik altı güvenli belirsiz olur; eşik üstü ve güvenli olmayan dokunulmaz
assert [c["laya"] for c in esik_uygula([{"laya": "guvenli", "p_guvenli": 0.6}, {"laya": "guvenli", "p_guvenli": 0.9},
                                        {"laya": "riskli", "p_guvenli": 0.1}], 0.7)] == ["belirsiz", "guvenli", "riskli"]


TARAMA = [round(0.5 + 0.01 * i, 2) for i in range(46)]  # 0,50..0,95


def esik_ayarla(katlar, sabit=None):
    """katlar: kat başına [{jev, laya, p_guvenli}]. sabit verilirse yalnız o T, yoksa TARAMA.
    Dönüş: {secilen, metrik (seçilen ya da en yakın T'nin kat özeti), tarama [...]}; geçen T yoksa secilen None."""
    esikler = [sabit] if sabit is not None else TARAMA
    toplam = sum(len(k) for k in katlar)
    ms = metrik_cok([esik_uygula(k, t) for t in esikler for k in katlar])
    tarama = []
    for i, t in enumerate(esikler):
        o = kat_ozeti(ms[i * len(katlar):(i + 1) * len(katlar)])
        dusen = sum(c["laya"] == "guvenli" and c["p_guvenli"] < t for k in katlar for c in k)
        o.update(esik=t, belirsize_dusen=dusen, belirsize_dusen_oran=dusen / toplam, uzaklik=uzaklik(o))
        tarama.append(o)
    gecen = [o for o in tarama if o["uzaklik"] == 0]
    secim = gecen[0] if gecen else min(tarama, key=tur_anahtari)
    return {"secilen": secim["esik"] if gecen else None, "metrik": secim, "tarama": tarama}


def esik_yaz(sonuc, model_klasoru, kaynak):
    """Özeti basar; geçen T varsa model klasörüne laya-esik.json yazar (kapı okuyacak)."""
    m = sonuc["metrik"]
    ad = f"T={sonuc['secilen']}" if sonuc["secilen"] is not None else f"YOK (en yakın T={m['esik']})"
    print(f"güvenli eşiği {ad}: kappa {m['kappa']:.3f}±{m['sapma']['kappa']:.3f} güvenlik "
          f"{m['guvenlik_geri_cagirma']:.3f}±{m['sapma']['guvenlik_geri_cagirma']:.3f} kaçırma "
          f"{m['riskliyi_guvenli_sanma']:.3f}±{m['sapma']['riskliyi_guvenli_sanma']:.3f} doğruluk {m['dogruluk']:.3f}, "
          f"belirsize düşen {m['belirsize_dusen']} ({m['belirsize_dusen_oran']:.1%})")
    if sonuc["secilen"] is not None and model_klasoru.exists():
        hedef = model_klasoru / "laya-esik.json"
        hedef.write_text(json.dumps({"guvenli_esik": sonuc["secilen"], "kaynak": kaynak, "metrik": m},
                                    ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"yazıldı: {hedef.relative_to(KOK)}")


def veri_oku(min_guven, golge, mod="jev"):
    """mod 'uzlasi': Jev ≠ beklenen ya da Jev güveni < 0,8 olanlar atılır; atılan sayısı nedenine göre döner."""
    yollar = [KOK / "veri" / "laya-sentetik.jsonl"] + ([KOK / "logs" / "laya-golge.jsonl"] if golge else [])
    goruldu, kayitlar, dislanan = set(), [], {"uyusmayan": 0, "dusuk_guven": 0}
    for yol in yollar:
        if not yol.exists():
            continue
        for satir in yol.read_text(encoding="utf-8").splitlines():
            if not satir.strip():
                continue
            k = json.loads(satir)
            jev = k.get("jev") or {}
            if jev.get("secim") not in SINIFLAR or (jev.get("guven") or 0) < min_guven:
                continue
            if k["girdi_maskeli"] in goruldu:
                continue
            goruldu.add(k["girdi_maskeli"])
            if mod == "uzlasi":
                if k.get("beklenen") and jev["secim"] != k["beklenen"]:
                    dislanan["uyusmayan"] += 1
                    continue
                if (jev.get("guven") or 0) < 0.8:
                    dislanan["dusuk_guven"] += 1
                    continue
            kayitlar.append(k)
    return kayitlar, dislanan


def tabakali_bol(kayitlar, oran, tohum):
    gruplar = defaultdict(list)
    for k in kayitlar:
        gruplar[k["jev"]["secim"]].append(k)
    rng, egitim, dogrulama = random.Random(tohum), [], []
    for s in sorted(gruplar):
        g = gruplar[s]
        rng.shuffle(g)
        n = max(1, round(len(g) * oran)) if len(g) > 1 else 0
        dogrulama += g[:n]
        egitim += g[n:]
    rng.shuffle(egitim)
    rng.shuffle(dogrulama)
    return egitim, dogrulama


def tabakali_katlar(kayitlar, kat, tohum):
    """Jev sınıfına göre tabakalı K kat: her sınıf karıştırılıp katlara sırayla dağıtılır."""
    gruplar = defaultdict(list)
    for k in kayitlar:
        gruplar[k["jev"]["secim"]].append(k)
    rng, katlar, i = random.Random(tohum), [[] for _ in range(kat)], 0
    for s in sorted(gruplar):
        g = gruplar[s]
        rng.shuffle(g)
        for k in g:
            katlar[i % kat].append(k)
            i += 1
    for k in katlar:
        rng.shuffle(k)
    return katlar


def ogeler(agent, kayit, ids, ic, agirlik, w_tablo):
    """Laya'nın kendi kodlamasıyla (aynı dizi biçimi) soru başına bir öğe ve yumuşak hedef."""
    oge = agent._encode_state(kayit["girdi_maskeli"], ids, ic)
    jev = kayit["jev"]
    for o, qid in zip(oge, ids):
        if ic[qid]["t"] == "choice":
            olas = jev.get("olasiliklar") or {}
            anahtar = list(ic[qid]["crit"])
            t = [float(olas.get(a, 0.0)) for a in anahtar]
            if sum(t) <= 0:
                t = [1.0 if a == jev["secim"] else 0.0 for a in anahtar]
        else:  # noul: seçenek sırası [false, true]
            d = jev.get("dis_etki")
            if d is None:
                continue
            t = [1.0 - float(d), float(d)]
        s = sum(t)
        o["target"] = [x / s for x in t]
        agirlik[id(o)] = sum(x / s * w_tablo[a] for x, a in zip(t, ic[qid]["crit"])) if ic[qid]["t"] == "choice" else 1.0
    return oge


def ileri(model, b, cihaz, donuk):
    b = {k: (v.to(cihaz) if torch.is_tensor(v) else v) for k, v in b.items()}
    amp = torch.autocast("cuda", dtype=torch.bfloat16) if cihaz.type == "cuda" else torch.autocast("cpu", enabled=False)
    with amp:
        logits, _ = model(b["input_ids"], b["attention_mask"], b["marker_pos"], b["marker_mask"], b["qtype"],
                          detach_encoder=donuk)
    return logits.float(), b


def degerlendir(agent, kayitlar, ids, ic, cihaz, donuk, parti):
    """Yalnızca risk sorusu: Jev seçimi ile modelin argmax seçimi. Dönüş: (metrik, [{jev, laya, p_guvenli}])."""
    model, anahtar, ciftler = agent.model, list(ic["risk"]["crit"]), []
    model.eval()
    with torch.no_grad():
        for i in range(0, len(kayitlar), parti):
            dilim = kayitlar[i:i + parti]
            grup = [agent._encode_state(k["girdi_maskeli"], ["risk"], ic) for k in dilim]
            logits, b = ileri(model, collate_items(grup, agent.tok.pad_token_id), cihaz, donuk)
            pg = torch.softmax(logits, -1)[:, anahtar.index("guvenli")].tolist()
            for k, sat, p in zip(dilim, logits.argmax(-1).tolist(), pg):
                ciftler.append({"jev": k["jev"]["secim"], "laya": anahtar[sat], "p_guvenli": round(p, 5)})
    return metrik(ciftler), ciftler


def egitilebilir_yap(model, acik_katman):
    for p in model.parameters():
        p.requires_grad = False
    acik = [model.head, model.scorer, model.type_emb]
    if acik_katman > 0:
        acik += list(model.encoder.layers[-acik_katman:]) + [model.encoder.final_norm]
    for m in acik:
        for p in m.parameters():
            p.requires_grad = True
    return [p for p in model.parameters() if p.requires_grad]


def kaydet(agent, kaynak, hedef, ozgun_dtype, bilgi, sd_kaynak=None):
    """Taban checkpoint'in tüm anahtarları korunur (temperature gibi buffer'lar dahil); üstüne eğitilen ağırlıklar yazılır."""
    from safetensors.torch import load_file, save_file

    if hedef.exists():
        shutil.rmtree(hedef)
    hedef.mkdir(parents=True)
    for alt in ("tokenizer", "encoder"):
        shutil.copytree(kaynak / alt, hedef / alt)  # sembolik bağların içeriği kopyalanır
    sd = load_file(str(kaynak / "model.safetensors"))
    for k, v in (sd_kaynak or agent.model.state_dict()).items():
        sd[k] = v.detach().to("cpu", ozgun_dtype if v.is_floating_point() else v.dtype).contiguous()
    save_file(sd, str(hedef / "model.safetensors"))
    cfg = dict(agent.cfg)
    cfg["training"] = {**cfg.get("training", {}), "fine_tuned_from_checkpoint": True, "zepul": bilgi}
    (hedef / "rl_agent_config.json").write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")


def dogrula(agent, kaynak, hedef, ozgun_dtype, bilgi, ornek, soru, sd_kaynak=None):
    """Kaydet, Laya'nın kendi yükleyicisiyle (strict) yeniden aç, tek soru sor."""
    kaydet(agent, kaynak, hedef, ozgun_dtype, bilgi, sd_kaynak)
    dene = Agent(str(hedef), device="cpu")
    cevap = dene.system_one(ornek["girdi_maskeli"], soru)
    return {"choice": cevap["answers"]["risk"]["choice"], "jev": ornek["jev"]["secim"]}


def egit(agent, egitim, dogrulama, ids, ic, w_tablo, a, tur_sayisi, cihaz, en_iyiyi_sakla=False):
    model = agent.model
    params = egitilebilir_yap(model, a.acik_katman)
    donuk = a.acik_katman == 0
    print(f"cihaz {cihaz}, eğitilen parametre {sum(p.numel() for p in params) / 1e6:.1f}M")
    agirlik = {}
    hepsi = [o for k in egitim for o in ogeler(agent, k, ids, ic, agirlik, w_tablo) if "target" in o]
    opt = torch.optim.AdamW(params, lr=a.lr, weight_decay=0.01)
    en_iyi, en_iyi_sd, gecmis = None, None, []
    for tur in range(tur_sayisi):
        model.train()
        if donuk:
            model.encoder.eval()
        random.shuffle(hepsi)
        adim = [hepsi[:a.parti]] if a.kuru else [hepsi[i:i + a.parti] for i in range(0, len(hepsi), a.parti)]
        kayip_top = 0.0
        for parca in adim:
            logits, b = ileri(model, collate_items([parca], agent.tok.pad_token_id), cihaz, donuk)
            w = torch.tensor([agirlik[id(o)] for o in parca], device=cihaz)
            kayip = (-(b["target"] * torch.log_softmax(logits, -1)).sum(-1) * w).sum() / w.sum()
            opt.zero_grad()
            kayip.backward()
            torch.nn.utils.clip_grad_norm_(params, 1.0)
            opt.step()
            kayip_top += kayip.item()
        if dogrulama is None:
            print(f"tur {tur + 1}: kayıp {kayip_top / len(adim):.4f}")
            continue
        m, tahmin = degerlendir(agent, dogrulama, ids, ic, cihaz, donuk, a.parti)
        gecmis.append({"tur": tur + 1, "kayip": kayip_top / len(adim), "dogruluk": m["dogruluk"], "kappa": m["kappa"],
                       "guvenlik_geri_cagirma": m["guvenlik_geri_cagirma"],
                       "riskliyi_guvenli_sanma": m["riskliyi_guvenli_sanma"], "metrik": m, "tahmin": tahmin})
        print(f"tur {tur + 1}: kayıp {gecmis[-1]['kayip']:.4f} doğruluk {m['dogruluk']:.3f} kappa {m['kappa']:.3f} "
              f"güvenlik {m['guvenlik_geri_cagirma']} kaçırma {m['riskliyi_guvenli_sanma']}")
        if en_iyiyi_sakla and (en_iyi is None or tur_anahtari(m) < tur_anahtari(en_iyi)):
            en_iyi = m
            en_iyi_sd = {k: v.detach().to("cpu").clone() for k, v in model.state_dict().items()}
    return gecmis, en_iyi_sd


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cihaz", choices=["cpu", "cuda"], default="cpu")
    ap.add_argument("--kuru", action="store_true", help="veri bölme + tek mini-tur + küçük değerlendirme; kaydet-yükle denetimi yapılır, kayıt silinir")
    ap.add_argument("--tur", type=int, default=6)
    ap.add_argument("--parti", type=int, default=16)
    ap.add_argument("--oran", type=float, default=0.2, help="doğrulama payı")
    ap.add_argument("--tohum", type=int, default=42)
    ap.add_argument("--lr", type=float, default=1e-4)
    ap.add_argument("--acik-katman", type=int, default=0, help="gövdenin eğitilecek son katman sayısı")
    ap.add_argument("--sinif-agirlik", default="", help="yumuşak hedefli kayıpta sınıf ağırlığı, örn. riskli=2,geri-alinamaz=2 (varsayılan hepsi 1)")
    ap.add_argument("--min-guven", type=float, default=0.0, help="Jev güveni bunun altındaki kayıtları at")
    ap.add_argument("--golgesiz", action="store_true", help="logs/laya-golge.jsonl'i kullanma")
    ap.add_argument("--etiket-modu", choices=["jev", "uzlasi"], default="jev",
                    help="uzlasi: Jev ≠ beklenen ya da Jev güveni < 0,8 olan kayıtları at")
    ap.add_argument("--kfold", type=int, default=0, help="K>1: tabakalı K katlı ölçüm (--oran yok sayılır)")
    ap.add_argument("--guvenli-esik", type=float, default=None,
                    help="0..1: güvenli olasılığı bunun altındaki güvenli kararı belirsiz say")
    ap.add_argument("--esik-tara", action="store_true", help="T=0,50..0,95 tara; üç eşiği geçen en küçük T seçilir")
    ap.add_argument("--tahminler", default="", help="metrik.json yolu: eğitmeden, kayıtlı kat tahminleriyle eşik ayarla")
    a = ap.parse_args()
    if a.guvenli_esik is not None and not 0 <= a.guvenli_esik <= 1:
        raise SystemExit("--guvenli-esik 0..1 olmalı")
    esik_istendi = a.esik_tara or a.guvenli_esik is not None
    if a.tahminler:  # yalnız tahminler üzerinden: model eğitilmez
        sys.stdout.reconfigure(encoding="utf-8")
        yol = Path(a.tahminler).resolve()
        kayit = json.loads(yol.read_text(encoding="utf-8"))
        if not kayit.get("kat_tahminleri"):
            raise SystemExit(f"{yol}: kat_tahminleri yok; koşuyu --esik-tara ile yeniden çalıştır")
        kayit["guvenli_esik"] = esik_ayarla(kayit["kat_tahminleri"], None if a.esik_tara else a.guvenli_esik)
        esik_yaz(kayit["guvenli_esik"], yol.parent / "model", yol.relative_to(KOK).as_posix())
        yol.write_text(json.dumps(kayit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return
    w_tablo = agirlik_oku(a.sinif_agirlik)

    sys.stdout.reconfigure(encoding="utf-8")
    random.seed(a.tohum)
    torch.manual_seed(a.tohum)
    t0 = time.time()
    kayitlar, dislanan = veri_oku(a.min_guven, not a.golgesiz, a.etiket_modu)
    if a.etiket_modu == "uzlasi":
        print(f"uzlaşı süzgeci: {sum(dislanan.values())} kayıt dışarıda (Jev≠beklenen {dislanan['uyusmayan']}, "
              f"güven<0,8 {dislanan['dusuk_guven']}), kalan {len(kayitlar)}")
    say = lambda ks: {s: sum(k["jev"]["secim"] == s for k in ks) for s in SINIFLAR}  # noqa: E731
    if a.kfold:
        katlar = tabakali_katlar(kayitlar, a.kfold, a.tohum)
        bolmeler = [([k for i, kat in enumerate(katlar) if i != j for k in kat], katlar[j]) for j in range(a.kfold)]
        print(f"veri {len(kayitlar)} {say(kayitlar)}, {a.kfold} kat: " + ", ".join(str(len(k)) for k in katlar))
    else:
        bolmeler = [tabakali_bol(kayitlar, a.oran, a.tohum)]
        print(f"veri {len(kayitlar)}: eğitim {len(bolmeler[0][0])} {say(bolmeler[0][0])}, "
              f"doğrulama {len(bolmeler[0][1])} {say(bolmeler[0][1])}")
    if a.kuru:
        bolmeler = [(e[:a.parti], d[:a.parti]) for e, d in bolmeler]

    soru = sorular()
    from huggingface_hub import snapshot_download
    kaynak = Path(snapshot_download("convaiinnovations/laya", allow_patterns=["multilingual/*"])) / "multilingual"
    agent = Agent(str(kaynak), device=a.cihaz)
    cihaz = agent.device
    from safetensors import safe_open
    with safe_open(str(kaynak / "model.safetensors"), "pt") as f:
        ozgun_dtype = f.get_tensor(next(iter(f.keys()))).dtype
    for qid, q in soru.items():
        agent._check_question(qid, q)
    ids = list(soru)
    ic = {qid: agent._to_internal(q) for qid, q in soru.items()}
    model = agent.model
    donuk = a.acik_katman == 0

    # Öz-denetim: eğitimden önce kaydet-yükle; kayıt hatası uzun eğitimden önce yakalanır.
    oz = CIKTI / "model-oz"
    ornek = bolmeler[0][1][0]
    dogrula(agent, kaynak, oz, ozgun_dtype, {"oz_denetim": True}, ornek, soru)
    shutil.rmtree(oz)
    print("öz-denetim: kaydet-yükle tamam")
    taban, _ = degerlendir(agent, bolmeler[0][1], ids, ic, cihaz, donuk, a.parti)
    print(f"taban (eğitimsiz) doğruluk {taban['dogruluk']:.3f} kappa {taban['kappa']:.3f}")

    tur_sayisi = 1 if a.kuru else a.tur
    baslangic = {k: v.detach().to("cpu").clone() for k, v in model.state_dict().items()} if a.kfold else None
    kat_gecmis, en_iyi_sd = [], None
    for j, (egitim, dogrulama) in enumerate(bolmeler):
        if baslangic:
            print(f"--- kat {j + 1}/{len(bolmeler)}: eğitim {len(egitim)}, doğrulama {len(dogrulama)}")
            model.load_state_dict(baslangic)
        gecmis, en_iyi_sd = egit(agent, egitim, dogrulama, ids, ic, w_tablo, a, tur_sayisi, cihaz,
                                 en_iyiyi_sakla=not a.kfold)
        kat_gecmis.append(gecmis)

    if a.kfold:
        ortalama = [kat_ozeti([g[t]["metrik"] for g in kat_gecmis]) for t in range(tur_sayisi)]
        en_iyi_i = min(range(tur_sayisi), key=lambda t: tur_anahtari(ortalama[t]))
        en_iyi, en_iyi_tur = ortalama[en_iyi_i], en_iyi_i + 1
        for t, o in enumerate(ortalama):
            print(f"tur {t + 1} ort: kappa {o['kappa']:.3f}±{o['sapma']['kappa']:.3f} güvenlik "
                  f"{o['guvenlik_geri_cagirma']:.3f}±{o['sapma']['guvenlik_geri_cagirma']:.3f} kaçırma "
                  f"{o['riskliyi_guvenli_sanma']:.3f}±{o['sapma']['riskliyi_guvenli_sanma']:.3f} uzaklık {uzaklik(o):.3f}")
        print(f"--- son model: tüm veri ({len(kayitlar)}), {en_iyi_tur} tur")
        model.load_state_dict(baslangic)
        egit(agent, kayitlar[:a.parti] if a.kuru else kayitlar, None, ids, ic, w_tablo, a, en_iyi_tur, cihaz)
        sd = None
    else:
        gecmis = kat_gecmis[0]
        en_iyi_i = min(range(len(gecmis)), key=lambda t: tur_anahtari(gecmis[t]["metrik"]))
        en_iyi, en_iyi_tur = gecmis[en_iyi_i]["metrik"], en_iyi_i + 1
        sd = en_iyi_sd
    print(f"en iyi tur {en_iyi_tur}: uzaklık {uzaklik(en_iyi):.3f}, eşikler {'GEÇTİ' if uzaklik(en_iyi) == 0 else 'geçmedi'}")

    kat_tahminleri = [g[en_iyi_i]["tahmin"] for g in kat_gecmis]
    esik = esik_ayarla(kat_tahminleri, None if a.esik_tara else a.guvenli_esik) if esik_istendi else None
    sade = lambda g: [{k: v for k, v in x.items() if k not in ("metrik", "tahmin")} for x in g]  # noqa: E731
    sonuc = {"ts": time.strftime("%Y-%m-%dT%H:%M:%S"), "kuru": a.kuru, "ayarlar": vars(a), "cihaz": str(cihaz),
             "veri": {"toplam": len(kayitlar), "dislanan": dislanan, "sinif": say(kayitlar),
                      "egitim": say(bolmeler[0][0]), "dogrulama": say(bolmeler[0][1])},
             "sure_sn": None, "taban": taban,
             "gecmis": sade(kat_gecmis[0]) if not a.kfold else None,
             "katlar": [sade(g) for g in kat_gecmis] if a.kfold else None,
             "ortalama": ortalama if a.kfold else None,
             "en_iyi": en_iyi, "en_iyi_tur": en_iyi_tur, "uzaklik": uzaklik(en_iyi), "esikleri_gecti": uzaklik(en_iyi) == 0,
             "guvenli_esik": esik, "kat_tahminleri": kat_tahminleri}
    ozet = (f"lr{a.lr:g}-tur{a.tur}-k{a.acik_katman}-t{a.tohum}" + (f"-kf{a.kfold}" if a.kfold else "")
            + ("-uzlasi" if a.etiket_modu == "uzlasi" else "")
            + ("-w" + a.sinif_agirlik.replace("=", "").replace(",", "_") if a.sinif_agirlik else ""))
    kosu = CIKTI / "kosular" / f"{time.strftime('%Y%m%d-%H%M%S')}-{ozet}"
    hedef = CIKTI / "model-kuru" if a.kuru else kosu / "model"
    sonuc["yukleme_denetimi"] = dogrula(agent, kaynak, hedef, ozgun_dtype,
                                        {"veri": sonuc["veri"], "en_iyi_kappa": en_iyi["kappa"]}, ornek, soru, sd)
    if esik:
        esik_yaz(esik, hedef, (kosu / "metrik.json").relative_to(KOK).as_posix())
    if a.kuru:
        shutil.rmtree(hedef)
    sonuc["sure_sn"] = round(time.time() - t0, 1)
    CIKTI.mkdir(parents=True, exist_ok=True)
    metin = json.dumps(sonuc, ensure_ascii=False, indent=2) + "\n"
    yol = CIKTI / ("metrik-kuru.json" if a.kuru else "metrik.json")
    yol.write_text(metin, encoding="utf-8")
    if not a.kuru:
        (kosu / "metrik.json").write_text(metin, encoding="utf-8")
        satir = {"ts": sonuc["ts"], "klasor": kosu.relative_to(KOK).as_posix(), "ayarlar": vars(a),
                 "veri": sonuc["veri"], "en_iyi_tur": en_iyi_tur, "uzaklik": sonuc["uzaklik"],
                 "esikleri_gecti": sonuc["esikleri_gecti"], "en_iyi": en_iyi,
                 "guvenli_esik": {"secilen": esik["secilen"], "metrik": esik["metrik"]} if esik else None}
        with (CIKTI / "kosular.jsonl").open("a", encoding="utf-8") as f:
            f.write(json.dumps(satir, ensure_ascii=False) + "\n")
    print(f"yazıldı: {yol.relative_to(KOK)} ({sonuc['sure_sn']} sn)")


if __name__ == "__main__":
    sys.exit(main())
