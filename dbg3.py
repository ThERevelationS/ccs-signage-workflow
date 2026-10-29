BOM = chr(0xFEFF)
old = '"' + BOM + '" + csv'
new = '"\uFEFF" + csv'
print('old:', repr(old))
print('new:', repr(new))
print('equal:', old == new)
data = open('src/pages/EstimatorParts.jsx', encoding='utf-8').read()
res = data.replace(old, new)
print('in:', old in data, 'diff:', data != res)
print('snippet after:', repr(res[1105:1130]))
