"""Auto-classify all instruments based on name pattern matching."""
import os, re, sys

sys.stdout = open(1, 'w', encoding='utf-8', errors='replace', closefd=False)

MD_DIR = "D:/nextdoor/python-python-django-world-musical-instrument/content/instruments"

# Build sound class rules from clean string data
SC_RULES = []

# 弦鸣 (chordophones)
SC_RULES.append((
    "guitar,lute,banjo,violin,viola,cello,bass-fiddle,double-bass,harp,sitar,zither,pipa,erhu,koto,shamisen,sanxian,liuqin,yueqin,ruan,dombra,mandolin,balalaika,bouzouki,ukulele,charango,cuatro,cavaquinho,bandura,archlute,theorbo,oud,tanbur,sarod,veena,sarangi,dilruba,esraj,kamancheh,morin,igil,banhu,jinghu,gaohu,zhonghu,guzheng,gayageum,kacapi,kantele,kora,nyatiti,ngoni,dulcimer,cimbalom,santur,yangqin,autoharp,psaltery,epinette".split(","),
    "弦鳴"  # 弦鸣
))

# 膜鸣 (membranophones)
SC_RULES.append((
    "drum,djembe,conga,bongo,tabla,taiko,tambourine,timpani,darbuka,doumbek,goblet-drum,frame-drum,bodhran,daf,dayereh,bendir,pandeiro,tamborim,surdo,dhol,dholak,mridangam,pakhawaj,kendang,davul,cajon,tombak,zarb,tsuzumi,naqqara,naker".split(","),
    "膜鳴"  # 膜鸣
))

# 体鸣 (idiophones)
SC_RULES.append((
    "gong,cymbal,bell,xylophone,marimba,vibraphone,glockenspiel,castanet,rattle,shaker,maraca,cabasa,claves,guiro,triangle,agogo,caxixi,shekere,rainstick,temple-block,woodblock,clapper,vibraslap,flexatone,jaw-harp,kalimba,mbira,likembe,balafon,gender,gamelan,kulintang,angklung,crotales,sleigh-bell,cowbell,steelpan,steel-drum,washboard,bones,musical-bow".split(","),
    "体鳴"  # 体鸣
))

# 气鸣 (aerophones)
SC_RULES.append((
    "flute,recorder,clarinet,saxophone,oboe,bassoon,trumpet,trombone,horn,tuba,cornet,flugelhorn,bugle,piccolo,ocarina,harmonica,melodica,bagpipe,didgeridoo,shakuhachi,dizi,xiao,pan-flute,pan-pipes,whistle,pipe,shawm,crumhorn,serpent,alphorn,ney,kaval,duduk,balaban,sheng,mizmar,zurna,hulusi,bawu,khaen,launeddas,gaida,gaita,accordion,concertina,bandoneon,melodeon,organ,calliope,saxhorn,euphonium,helicon,fife,tin-whistle,bansuri,nose-flute,daegeum,suling,arghul,shehnai".split(","),
    "气鳴"  # 气鸣
))

# 电鸣 (electrophones)
SC_RULES.append((
    "synthesizer,theremin,ondes-martenot,mellotron,optigan,sampler,drum-machine,groovebox,midi,sequencer,eurorack,modular-synth,fairlight,synclavier,clavinet,wurlitzer,rhodes,hammond,moog,buchla,tb-303,tr-808,akai,vocoder,eigenharp,stylophone,otamatone,continuum,seaboard,mpe-controller".split(","),
    "电鳴"  # 电鸣
))

CATEGORY_MAP = {
    "弦鳴": "弦樂器",
    "膜鳴": "打擊樂器",
    "体鳴": "打擊樂器",
    "气鳴": "管樂器",
    "电鳴": "電子樂器",
}

DEFAULT_HS = {
    "弦鳴": "3 弦鳴樂器",
    "膜鳴": "2 膜鳴樂器",
    "体鳴": "1 体鳴樂器",
    "气鳴": "4 气鳴樂器",
    "电鳴": "5 电鳴樂器",
}

DEFAULT_FAMILY = {
    "弦鳴": "弦樂器類",
    "膜鳴": "鼓類",
    "体鳴": "體鳴打擊樂器類",
    "气鳴": "管樂器類",
    "电鳴": "電子樂器類",
}

DEFAULT_PM = {
    "弦鳴": "撥弦／擦弦／擊弦",
    "膜鳴": "敲擊鼓面",
    "体鳴": "敲擊／搖晃／撥彈",
    "气鳴": "吹奏",
    "电鳴": "電子控制／演奏",
}


def detect_sc(slug, title):
    text = (slug + " " + title).lower().replace("-", " ").replace("_", " ")
    for keywords, sc in SC_RULES:
        for kw in keywords:
            if kw.lower() in text:
                return sc
    return None


def process():
    fixed = 0
    for fname in sorted(os.listdir(MD_DIR)):
        if not fname.endswith(".md"):
            continue
        fpath = os.path.join(MD_DIR, fname)
        with open(fpath, "r", encoding="utf-8") as f:
            content = f.read()

        m = re.search(r"^sound_class:\s*(.+)$", content, re.MULTILINE)
        if m and m.group(1).strip():
            continue

        slug = fname.replace(".md", "")
        tm = re.search(r"^title:\s*(.+)$", content, re.MULTILINE)
        title = tm.group(1).strip() if tm else ""

        sc = detect_sc(slug, title)
        if not sc:
            continue

        cm = re.search(r"^category:\s*(.+)$", content, re.MULTILINE)
        cur_cat = cm.group(1).strip() if cm else ""

        cat = CATEGORY_MAP.get(sc, cur_cat)
        hs = DEFAULT_HS.get(sc, "")
        family = DEFAULT_FAMILY.get(sc, "")
        pm = DEFAULT_PM.get(sc, "")

        if cur_cat and cur_cat != cat and cat:
            content = re.sub(r"^category:.*$", "category: " + cat, content, count=1, flags=re.MULTILINE)

        for field, val in [("sound_class", sc), ("hs_class", hs), ("family", family), ("playing_method", pm)]:
            if re.search(r"^" + field + ":", content, re.MULTILINE):
                content = re.sub(r"^" + field + ":.*$", field + ": " + val, content, count=1, flags=re.MULTILINE)
            else:
                content = re.sub(r"^(category:.+)$", r"\1\n" + field + ": " + val, content, count=1, flags=re.MULTILINE)

        with open(fpath, "w", encoding="utf-8") as f:
            f.write(content)
        fixed += 1
        print(f"  {slug} -> {sc}")

    print(f"\nFixed: {fixed}")


process()
