// Valida os dicionários pt-BR em dicts/.
// Erros: JSON inválido, raiz que não é objeto, valor vazio ou não texto, caractere chinês/japonês/coreano
// no valor, chave duplicada no mesmo arquivo e placeholder, tag, URL ou trecho entre crases da chave
// que sumiu na tradução.
// Avisos: a mesma chave em arquivos diferentes com traduções diferentes (vale a do último arquivo em
// ordem alfabética, que é a ordem de carga do motor).
const fs = require('fs');
const path = require('path');

const dictsDir = path.join(__dirname, '../dicts');

// Ideogramas, kana, hangul e pontuação de largura total
const CJK_REGEX = /[⺀-鿿　-〿가-힯＀-￯]/;
// Trechos que a tradução tem de manter iguais ao inglês
const TOKEN_REGEX = /\{[^{}]*\}|%\d*\$?[sdif]|\$\{[^}]*\}|https?:\/\/[^\s)"']+|<\/?[a-zA-Z][^>]*>|`[^`]+`/g;

function normalizeText(text) {
    if (!text) return '';
    return text.replace(/\s+/g, ' ')
               .trim()
               .replace(/[‘’]/g, "'")
               .replace(/[“”]/g, '"')
               .replace(/…/g, '...');
}

function findDuplicateKeys(raw) {
    const seen = new Set();
    const dups = [];
    const keyRegex = /^\s*("(?:[^"\\]|\\.)*")\s*:/gm;
    let m;
    while ((m = keyRegex.exec(raw)) !== null) {
        const key = JSON.parse(m[1]);
        if (seen.has(key)) dups.push(key);
        seen.add(key);
    }
    return dups;
}

function compareDicts(targetDictsDir = dictsDir) {
    let hasError = false;
    const error = msg => { console.error(msg); hasError = true; };

    if (!fs.existsSync(targetDictsDir)) {
        error(`Erro: a pasta de dicionários não existe: ${targetDictsDir}`);
        return false;
    }
    const files = fs.readdirSync(targetDictsDir).filter(f => f.endsWith('.json')).sort();
    if (files.length === 0) {
        error(`Erro: nenhum arquivo .json em ${targetDictsDir}`);
        return false;
    }

    const seenAcrossFiles = new Map();
    let total = 0;
    let warnings = 0;
    for (const file of files) {
        let data;
        let raw;
        try {
            raw = fs.readFileSync(path.join(targetDictsDir, file), 'utf8');
            data = JSON.parse(raw.replace(/^﻿/, ''));
        } catch (e) {
            error(`Erro ao ler ${file}: ${e.message}`);
            continue;
        }
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
            error(`Erro em ${file}: a raiz do JSON tem de ser um objeto.`);
            continue;
        }
        for (const dup of findDuplicateKeys(raw)) {
            error(`Erro em ${file}: chave duplicada "${dup}".`);
        }
        for (const [key, value] of Object.entries(data)) {
            total++;
            if (typeof value !== 'string' || value.trim() === '') {
                error(`Erro em ${file}: a chave "${key}" tem valor vazio ou que não é texto.`);
                continue;
            }
            const cjk = value.match(CJK_REGEX);
            if (cjk) {
                error(`Erro em ${file}: a chave "${key}" tem o caractere "${cjk[0]}" no valor: ${value}`);
            }
            for (const token of new Set(key.match(TOKEN_REGEX) || [])) {
                if (!value.includes(token)) {
                    error(`Erro em ${file}: o trecho ${JSON.stringify(token)} da chave "${key}" sumiu no valor: ${value}`);
                }
            }
            const norm = normalizeText(key);
            const previous = seenAcrossFiles.get(norm);
            if (previous && previous.value !== value) {
                console.warn(`Aviso: "${key}" aparece em ${previous.file} e ${file} com traduções diferentes.`);
                warnings++;
            }
            seenAcrossFiles.set(norm, { file, value });
        }
    }

    if (!hasError) {
        console.log(`Dicionários válidos: ${files.length} arquivos, ${total} entradas, ${warnings} avisos.`);
    }
    return !hasError;
}

if (require.main === module) {
    process.exit(compareDicts() ? 0 : 1);
}

module.exports = {
    compareDicts,
    normalizeText,
    CJK_REGEX,
    TOKEN_REGEX
};
