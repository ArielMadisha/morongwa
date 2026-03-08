import re
with open('frontend/app/store/page.tsx', 'r', encoding='utf-8') as f:
    s = f.read()
s = re.sub(r"\)\}\s*they['']ll\s+</div>", ')}\n                    </div>', s)
with open('frontend/app/store/page.tsx', 'w', encoding='utf-8') as f:
    f.write(s)
print('Done')
