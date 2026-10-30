# The decisions appendix: every fix row in the four fix tables with its time in the series video, its category, and
# its note (the reviewer's "your ..." asides taken out). Prints Markdown.
import re, sys
sys.stdout.reconfigure(encoding='utf-8')
start = {}
for l in open('review/master_series.log', encoding='utf-8'):
    m = re.match(r'(.+?): frames (\d+)-(\d+) from', l)
    if m: start[m.group(1)] = int(m.group(2))
CHANGE = {'U12', 'U14a', 'U14b', 'U14c', 'R4', 'M1a', 'M1b', 'T1', 'BB3'}
COMPROMISE = {'U13b', 'U16', 'U18', 'V4s', 'R1', 'R2', 'RH', 'R5r', 'R8a', 'R8b', 'R8c', 'HH'}
cat = lambda i: 'change to the original' if i in CHANGE else 'compromise' if i in COMPROMISE else 'correction'
def clean(n):
    n = re.sub(r'\s*\((?:[^()]|\([^()]*\))*\byour\b(?:[^()]|\([^()]*\))*\)', '', n)
    n = re.sub(r'\s*;?\s*\byour (pick|call|note|notes|idea|OK)[^;)]*', '', n)
    n = re.sub(r'\s*\(tools/[^)]*\)|\s*\(composited from [^)]*\)', '', n)
    n = n.replace('|', '/').strip(' ;')
    return n[:1].upper() + n[1:]
t = lambda f: f'{int(f * 1001 / 30000) // 60}:{int(f * 1001 / 30000) % 60:02d}'
counts = {}
rows = []
for ep in ('101', '102', '103', '104'):
    for l in open(f'review/fixes_{ep}.tsv', encoding='utf-8'):
        if l.startswith(('id\t', '#')) or not l.strip(): continue
        c = l.rstrip('\n').split('\t'); i, part, a = c[0], c[1], int(c[2])
        rows.append((start[part] + a, ep, i, cat(i), clean(c[6] if len(c) > 6 else '')))
        counts[(ep, cat(i))] = counts.get((ep, cat(i)), 0) + 1
rows.sort()
print('| Episode | Corrections | Compromises | Changes to the original | All |\n|---|---|---|---|---|')
for ep in ('101', '102', '103', '104'):
    a, b, c = (counts.get((ep, k), 0) for k in ('correction', 'compromise', 'change to the original'))
    print(f'| {ep} | {a} | {b} | {c} | {a + b + c} |')
A, B, C = (sum(v for (e, k), v in counts.items() if k == x) for x in ('correction', 'compromise', 'change to the original'))
print(f'| **All** | **{A}** | **{B}** | **{C}** | **{A + B + C}** |\n')
print('| Time | Ep. | Fix | Kind | What |\n|---|---|---|---|---|')
for f, ep, i, k, n in rows: print(f'| {t(f)} | {ep} | {i} | {k} | {n} |')
