import re, glob, os

def lucide_names(src):
    names = set()
    for m in re.finditer(r'import\s*\{([^}]*)\}\s*from\s*["\']lucide-react["\']', src):
        for n in m.group(1).split(','):
            n = n.strip().split(' as ')[-1].strip()
            if n:
                names.add(n)
    return names

skip = {
    'src/components/estimator/a11y.js',
    'src/components/estimator/CustomerMergeDialog.jsx',
    'src/components/estimator/AddSectionDialog.jsx',
    'src/components/estimator/aio/CancelEstimateModal.jsx',
    'src/components/estimator/aio/MergeEstimateDialog.jsx',
    'src/components/estimator/aio/AioEstimateHeader.jsx',
    'src/components/estimator/aio/AddProductGrid.jsx',
    'src/components/estimator/aio/BuilderPartsPanel.jsx',
    'src/components/estimator/aio/ProductRow.jsx',
    'src/components/estimator/aio/EstimateProductsList.jsx',
    'src/components/estimator/aio/ClipboardManagerModal.jsx',
    'src/components/estimator/aio/Step1EstimateDetails.jsx',
    'src/pages/Estimator.jsx',
    'src/pages/FoundationCatalog.jsx',
    'src/pages/EstimatorQueues.jsx',
    'src/pages/QuickPrice.jsx',
    'src/pages/Estimating.jsx',
    'src/pages/MasterInventory.jsx',
    'src/pages/EstimateDetail.jsx',
    'src/pages/EstimatorParts.jsx',
    'src/pages/EstimatorProducts.jsx',
    'src/pages/EstimatorCustomers.jsx',
}

report = []
for path in sorted(glob.glob('src/**/*.jsx', recursive=True)):
    rel = path.replace(os.sep, '/')
    if rel in skip:
        continue
    src = open(path, encoding='utf-8').read()
    names = lucide_names(src)
    if not names:
        continue
    def fix_icon(m):
        tag = m.group(0)
        if 'aria-hidden' in tag or 'aria-label' in tag:
            return tag
        return tag[:-2].rstrip() + ' aria-hidden="true" />'
    pattern = re.compile(r'<(' + '|'.join(re.escape(n) for n in sorted(names, key=len, reverse=True)) + r')\b[^>]*/>', re.S)
    new = pattern.sub(fix_icon, src)
    changed = new != src
    if changed:
        open(path, 'w', encoding='utf-8').write(new)
        report.append(rel + ': icons hidden')
    icon_alt = '|'.join(re.escape(n) for n in sorted(names, key=len, reverse=True))
    btn_pat = re.compile(r'<button\b[^>]*>\s*<(?:' + icon_alt + r')\b[^>]*/>\s*</button>', re.S)
    for bm in btn_pat.finditer(new):
        head = bm.group(0)
        if 'aria-label' not in head and 'title=' not in head and 'aria-labelledby' not in head:
            line = new[:bm.start()].count('\n') + 1
            report.append('%s:%d: ICON-ONLY BUTTON, no accessible name: %r' % (rel, line, head[:110]))

for r in report:
    print(r)
