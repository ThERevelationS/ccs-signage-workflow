p = '.audit-work/foundation-o093-labels/candidates/foundationGeometryInputs.js'
s = open(p, encoding='utf-8').read()
# Current broken state: placeholder: "4' 0\",  → need placeholder: "4' 0\"",
# i.e. the escaped inch-mark quote must be followed by the string's real closer.
s2 = s.replace('\\",', '\\"",')
open(p, 'w', encoding='utf-8', newline='').write(s2)
print('replacements:', s.count('\\",') - s2.count('\\",'), '| changed:', s != s2)
