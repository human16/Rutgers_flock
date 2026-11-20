import csv, os, re, sys
COLS="name,lat,lng,year_built,year_demolished,campus,description,image_file,image_year,image_credit,image_license,source_url,notes".split(",")
CAMPUS={"College Ave","Busch","Livingston","Cook-Douglass","Downtown"}
path=sys.argv[1] if len(sys.argv)>1 else "buildings.csv"
imgdir=sys.argv[2] if len(sys.argv)>2 else "images"
BOX=(40.46,40.54,-74.49,-74.41)  # lat_min,lat_max,lng_min,lng_max
errs=[];warns=[]
with open(path,newline="",encoding="utf-8") as f:
    r=csv.DictReader(f)
    if r.fieldnames!=COLS: errs.append(f"header mismatch: {r.fieldnames}")
    rows=list(r)
def num(v):return bool(re.fullmatch(r"\d{3,4}",v))
for i,row in enumerate(rows,start=2):
    n=row.get("name") or f"row{i}"
    def E(m):errs.append(f"line {i} [{n}]: {m}")
    def W(m):warns.append(f"line {i} [{n}]: {m}")
    if not row["name"].strip():E("name empty")
    if row["campus"] not in CAMPUS:E(f"bad campus '{row['campus']}'")
    for c in("year_built","year_demolished","image_year"):
        if row[c] and not num(row[c]):E(f"{c} must be a plain number")
    if num(row["year_built"]) and num(row["year_demolished"]) and int(row["year_demolished"])<int(row["year_built"]):E("demolished before built")
    for c in("lat","lng"):
        if row[c]:
            try:float(row[c])
            except ValueError:E(f"{c} not a number")
    if row["lat"] and row["lng"]:
        try:
            la,ln=float(row["lat"]),float(row["lng"])
            if not(BOX[0]<=la<=BOX[1] and BOX[2]<=ln<=BOX[3]):E(f"coordinates outside campus box {BOX}")
        except ValueError:pass
    if (row["lat"]=="")!=(row["lng"]==""):E("lat/lng must both be set or both blank")
    if not row["description"].strip():E("description empty")
    if not row["source_url"].startswith("http"):E("source_url missing")
    if row["image_file"]:
        for c in("image_credit","image_license"):
            if not row[c]:E(f"image present but {c} empty")
        if not row["image_year"]:W("image_year blank (photo year not stated)")
        if not os.path.isfile(os.path.join(imgdir,row["image_file"])):E(f"image file not found: {row['image_file']}")
    else:W("no image")
    if not row["lat"]:W("no coordinates")
for e in errs:print("ERROR",e)
for w in warns:print("warn ",w)
print(f"{len(rows)} rows, {len(errs)} errors, {len(warns)} warnings")
sys.exit(1 if errs else 0)
