type Token = {
    kind: 'word' | 'quoted' | 'string' | 'symbol' | 'space';
    text: string;
};
/** SQL lexer: parameters and identifiers inside strings/comments are never rewritten. */
function tokens(sql: string): Token[] {
    const out: Token[] = [];
    for (let i = 0; i < sql.length;) {
        const start = i, c = sql[i];
        if (/\s/.test(c)) {
            while (/\s/.test(sql[++i] || '') && i < sql.length) { }
            out.push({ kind: 'space', text: sql.slice(start, i) });
            continue;
        }
        if (c === "'" || c === '"') {
            i++;
            while (i < sql.length) {
                if (sql[i++] === c) {
                    if (sql[i] === c) {
                        i++;
                        continue;
                    }
                    break;
                }
            }
            out.push({ kind: c === "'" ? 'string' : 'quoted', text: sql.slice(start, i) });
            continue;
        }
        if (sql.slice(i, i + 2) === '--') {
            i = sql.indexOf('\n', i);
            if (i < 0)
                i = sql.length;
            out.push({ kind: 'space', text: sql.slice(start, i) });
            continue;
        }
        if (sql.slice(i, i + 2) === '/*') {
            const end = sql.indexOf('*/', i + 2);
            i = end < 0 ? sql.length : end + 2;
            out.push({ kind: 'space', text: sql.slice(start, i) });
            continue;
        }
        if (/[A-Za-z_]/.test(c)) {
            i++;
            while (/[A-Za-z0-9_$]/.test(sql[i] || '') && i < sql.length)
                i++;
            out.push({ kind: 'word', text: sql.slice(start, i) });
            continue;
        }
        i++;
        out.push({ kind: 'symbol', text: c });
    }
    return out;
}
const utcText = `to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')`;
function render(input: Token[]): string {
    let out = '';
    for (let i = 0; i < input.length; i++) {
        const t = input[i], word = t.kind === 'word' ? t.text.toUpperCase() : '';
        let open = i + 1;
        while (input[open]?.kind === 'space')
            open++;
        if (['MAX', 'MIN', 'GROUP_CONCAT', 'STRFTIME', 'DATE', 'DATETIME'].includes(word) && input[open]?.text === '(') {
            let depth = 1, end = open + 1, start = end;
            const args: Token[][] = [];
            for (; end < input.length; end++) {
                if (input[end].text === '(' && input[end].kind === 'symbol')
                    depth++;
                if (input[end].text === ')' && input[end].kind === 'symbol') {
                    if (--depth === 0) {
                        args.push(input.slice(start, end));
                        break;
                    }
                }
                if (input[end].text === ',' && depth === 1 && input[end].kind === 'symbol') {
                    args.push(input.slice(start, end));
                    start = end + 1;
                }
            }
            if (depth)
                throw new Error('SQL com parênteses não balanceados.');
            const rendered = args.map(a => render(a).trim());
            if (word === 'MAX' || word === 'MIN')
                out += `${rendered.length > 1 ? (word === 'MAX' ? 'GREATEST' : 'LEAST') : word}(${rendered.join(',')})`;
            else if (word === 'GROUP_CONCAT') {
                const distinct = /^DISTINCT\s+/i.test(rendered[0]);
                out += `STRING_AGG(${distinct ? 'DISTINCT ' : ''}(${rendered[0].replace(/^DISTINCT\s+/i, '')})::text,${rendered[1] || "','"})`;
            }
            else if (word === 'STRFTIME') {
                if (rendered[0] !== "'%Y-%m-%dT%H:%M:%fZ'" || rendered[1] !== "'now'")
                    throw new Error('Formato strftime sem tradução PostgreSQL.');
                out += `to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
            }
            else {
                const origem = rendered[0] === "'now'" ? 'CURRENT_TIMESTAMP' : `(${rendered[0]})::timestamptz`;
                const zona = rendered.slice(1).some(a => a.toLowerCase() === "'localtime'") ? 'America/Sao_Paulo' : 'UTC';
                out += `to_char((${origem}) AT TIME ZONE '${zona}',${word === 'DATE' ? "'YYYY-MM-DD'" : "'YYYY-MM-DD HH24:MI:SS'"})`;
            }
            i = end;
            continue;
        }
        if (word === 'CURRENT_TIMESTAMP')
            out += utcText;
        else if (word === 'LIKE')
            out += 'ILIKE';
        else if (word === 'AS') {
            out += t.text;
            let next = i + 1;
            while (input[next]?.kind === 'space')
                next++;
            if (input[next]?.kind === 'word' && /[a-z]/.test(input[next].text) && /[A-Z]/.test(input[next].text)) {
                out += input.slice(i + 1, next).map(t => t.text).join('') + `"${input[next].text}"`;
                i = next;
            }
        }
        else
            out += t.text;
    }
    return out;
}
export function postgresSql(sql: string): string {
    const protectedSegments: string[] = [];
    let translated = tokens(render(tokens(sql))).map(t => {
        if (t.kind === 'string' || t.kind === 'quoted' || t.kind === 'space' && /^(--|\/\*)/.test(t.text)) {
            const key = `__SQL_PROTECTED_${protectedSegments.length}__`;
            protectedSegments.push(t.text);
            return key;
        }
        return t.text;
    }).join('');
    // SQLite NOCASE applies to both operands in comparisons, and to the sort expression.
    translated = translated.replace(/([\w.]+)\s*=\s*(\?)\s+COLLATE\s+NOCASE/gi, 'LOWER($1::text) = LOWER($2::text)');
    translated = translated.replace(/([\w.]+)\s+COLLATE\s+NOCASE/gi, 'LOWER($1::text)');
    translated = translated.replace(/\bBEGIN\s+IMMEDIATE\s+TRANSACTION\b/gi, 'BEGIN');
    if (/^\s*INSERT\s+OR\s+IGNORE\b/i.test(translated))
        translated = translated.replace(/INSERT\s+OR\s+IGNORE/i, 'INSERT').trim().replace(/;$/, '') + ' ON CONFLICT DO NOTHING';
    if (/\bsqlite_master\b/i.test(translated))
        translated = translated.replace(/\bsqlite_master\b/gi, "(SELECT tablename AS name, 'table'::text AS type FROM pg_catalog.pg_tables WHERE schemaname = 'public') sqlite_master");
    translated = translated.replace(/__SQL_PROTECTED_(\d+)__/g, (_match, index) => protectedSegments[Number(index)]);
    let parameter = 0;
    return tokens(translated).map(t => t.kind === 'symbol' && t.text === '?' ? `$${++parameter}` : t.text).join('');
}
