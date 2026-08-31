#!/usr/bin/env python3
#!/usr/bin/env python3
"""Convert OpenCode session export JSON to readable Markdown."""
import json, glob, os, datetime, re

def ts(ms):
    return datetime.datetime.fromtimestamp(ms/1000).strftime('%Y-%m-%d %H:%M:%S') if ms else ''

def tool_line(p):
    st = p.get('state') or {}
    inp = st.get('input') or {}
    keys = ('path','file_path','command','pattern','description','query','url','cmd')
    bits = [f"{k}={inp[k]}" for k in keys if k in inp]
    status = st.get('status', '?')
    s = f"🔧 `{p.get('name','tool')}`"
    if bits: s += ' ' + ' '.join(bits[:2])
    return s + f" _({status})_"

def convert(src, dst):
    data = json.load(open(src))['data']
    info = data.get('info') or {}
    msgs = data.get('messages') or []
    lines = []
    lines.append(f"# {info.get('title','(untitled)')}\n")
    lines.append(f"- Session: `{info.get('id')}`")
    lines.append(f"- Directory: `{info.get('directory') or 'n/a'}`")
    lines.append(f"- Created: {ts(info.get('time',{}).get('created'))}\n")
    lines.append("---\n")
    for m in msgs:
        t = m.get('type')
        time = ts((m.get('time') or {}).get('created'))
        if t == 'user':
            body = (m.get('metadata') or {}).get('displayText') or m.get('text') or ''
            lines.append(f"## 👤 User  \n_{time}_\n\n{body}\n")
        elif t == 'synthetic':
            body = m.get('text') or json.dumps(m.get('metadata') or {}, ensure_ascii=False)
            lines.append(f"## ⚙️ Synthetic  \n_{time}_\n\n{body[:500]}\n")
        elif t == 'assistant':
            model = (m.get('model') or {})
            label = f"{model.get('providerID','?')}/{model.get('id') or model.get('modelID','?')}"
            lines.append(f"## 🤖 Assistant ({label})  \n_{time}_\n")
            for p in (m.get('content') or []):
                if not isinstance(p, dict): continue
                pt = p.get('type')
                if pt == 'reasoning':
                    txt = (p.get('text') or '').strip()
                    if txt:
                        lines.append('> 💭 ' + txt.replace('\n', '\n> ') + '\n')
                elif pt == 'text':
                    txt = (p.get('text') or '').strip()
                    if txt: lines.append(txt + '\n')
                elif pt == 'tool':
                    lines.append('- ' + tool_line(p))
            lines.append('')
    open(dst, 'w').write('\n'.join(lines))
    return len(msgs)

if __name__ == '__main__':
    import sys
    base = sys.argv[1] if len(sys.argv) > 1 else '.'
    for f in sorted(glob.glob(os.path.join(base, 'ses_*.json'))):
        dst = f.replace('.json', '.md')
        n = convert(f, dst)
        print(f"{os.path.basename(dst)}: {n} messages, {os.path.getsize(dst):,} bytes")
