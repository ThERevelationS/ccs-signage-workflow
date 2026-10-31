src = open('src/main.jsx').read()
old = "import '@/index.css'\nimport '@mantine/core/styles.css'\nimport '@mantine/dates/styles.css'"
new = "import '@mantine/core/styles.css'\nimport '@mantine/dates/styles.css'\nimport '@/index.css'"
assert old in src, 'pattern not found'
open('src/main.jsx','w').write(src.replace(old, new))
print('reordered')
