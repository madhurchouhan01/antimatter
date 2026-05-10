import re

with open(r'd:\AntiMatter\project\frontend\index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Check for literal '${BACKEND}' (single-quoted template literal bug)
bad = [(m.start(), content[max(0, m.start()-30):m.end()+30]) 
       for m in re.finditer(r"'\$\{BACKEND\}", content)]
print(f'Bad fetch URLs with single quotes: {len(bad)}')
for pos, ctx in bad:
    print(f'  ...{ctx}...')

# Check for unclosed CSS braces
style_start = content.index('<style>')
style_end = content.index('</style>')
css = content[style_start:style_end]
opens = css.count('{')
closes = css.count('}')
print(f'\nCSS brace balance: opens={opens}, closes={closes}, diff={opens-closes}')

# Check for renderFileList calls that no longer exist
render_calls = re.findall(r'renderFileList\(\)', content)
print(f'\nrenderFileList() calls remaining: {len(render_calls)}')

print('\nValidation complete.')
