import re
import pathlib
import sys

MAP = {"date": "CcsDateField", "datetime-local": "CcsDateTimeField", "time": "CcsTimeField"}
SKIP = {"src/components/timeclock/TimeQuickPick.jsx", "src/components/ui/ccs-date-field.jsx"}


def tag_end(s, i):
    depth = 0
    j = i
    while j < len(s):
        c = s[j]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
        elif c == ">" and depth == 0:
            return j
        j += 1
    return -1


def transform(path):
    t = path.read_text()
    out = []
    i = 0
    used = set()
    while True:
        m = re.search(r"<(Input|input)\b", t[i:])
        if not m:
            break
        st = i + m.start()
        en = tag_end(t, st)
        if en < 0:
            break
        tag = t[st:en + 1]
        tm = re.search(r'type="(date|datetime-local|time)"', tag)
        if tm:
            comp = MAP[tm.group(1)]
            newtag = re.sub(r'\s*type="(?:date|datetime-local|time)"', "", tag, count=1)
            newtag = re.sub(r"^<(Input|input)", "<" + comp, newtag, count=1)
            used.add(comp)
            out.append(t[i:st])
            out.append(newtag)
        else:
            out.append(t[i:en + 1])
        i = en + 1
    out.append(t[i:])
    newt = "".join(out)
    if not used:
        return False
    imps = ", ".join(sorted(used))
    imp = 'import { %s } from "@/components/ui/ccs-date-field";' % imps
    last = -1
    for mm in re.finditer(r"^import .*$", newt, re.M):
        last = mm.end()
    if last >= 0:
        newt = newt[:last] + "\n" + imp + newt[last:]
    else:
        newt = imp + "\n" + newt
    path.write_text(newt)
    return True


count = 0
for f in sorted(pathlib.Path("src").rglob("*.jsx")) + sorted(pathlib.Path("src").rglob("*.js")):
    if str(f).replace("\\", "/") in SKIP:
        continue
    try:
        if transform(f):
            count += 1
            print("EDITED", f)
    except Exception as e:
        print("FAIL", f, e, file=sys.stderr)
print("files edited:", count)
