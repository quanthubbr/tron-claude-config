// Minimal POSIX-shell lexer for hook guards. It does not evaluate anything; it answers
// "which simple commands would run, with which words" well enough to spot flags.
// Output: flat list of { words: string[], heredocs: string[] } — one per simple command,
// including commands inside $(...), backticks and ( ... ) subshells.
'use strict';

const SEPARATORS = new Set([';', '&', '|']);
const WORD_BREAK = /[\s;&|<>()]/;

function lex(src, maxDepth = 8) {
  const out = [];
  scan(src, 0, null, out, maxDepth);
  return out;
}

function scan(src, start, closer, out, depth) {
  let segment = { words: [], heredocs: [] };
  let word = null;
  let skipNext = false;
  let pending = [];
  let i = start;

  const endWord = () => {
    if (word === null) return;
    if (skipNext) skipNext = false;
    else segment.words.push(word);
    word = null;
  };
  const endSegment = () => {
    endWord();
    if (segment.words.length || segment.heredocs.length) out.push(segment);
    segment = { words: [], heredocs: [] };
  };
  const nested = (from, close) => {
    if (depth <= 0) return skipTo(src, from, close);
    return scan(src, from, close, out, depth - 1);
  };
  const readBodies = (from) => {
    let pos = from;
    for (const doc of pending) {
      const lines = [];
      while (pos < src.length) {
        const nl = src.indexOf('\n', pos);
        const line = src.slice(pos, nl === -1 ? src.length : nl);
        pos = nl === -1 ? src.length : nl + 1;
        if ((doc.strip ? line.replace(/^\t+/, '') : line) === doc.delim) break;
        lines.push(line);
      }
      doc.segment.heredocs.push(lines.join('\n'));
    }
    pending = [];
    return pos;
  };

  while (i < src.length) {
    const c = src[i];

    if (closer && c === closer && closer !== '`') {
      endSegment();
      return i + 1;
    }
    if (closer === '`' && c === '`') {
      endSegment();
      return i + 1;
    }
    if (c === '\n') {
      endSegment();
      i = pending.length ? readBodies(i + 1) : i + 1;
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\r') {
      endWord();
      i++;
      continue;
    }
    if (SEPARATORS.has(c)) {
      endSegment();
      i++;
      continue;
    }
    if (c === '#' && word === null) {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (c === '(' && word === null) {
      endSegment();
      i = nested(i + 1, ')');
      continue;
    }
    if (c === '<' || c === '>') {
      endWord();
      if (src.startsWith('<<<', i)) {
        skipNext = true;
        i += 3;
        continue;
      }
      if (c === '<' && src[i + 1] === '<') {
        i += 2;
        const strip = src[i] === '-';
        if (strip) i++;
        while (src[i] === ' ' || src[i] === '\t') i++;
        const delim = readDelimiter(src, i);
        i = delim.end;
        pending.push({ delim: delim.text, strip, segment });
        continue;
      }
      i++;
      while (src[i] === '>' || src[i] === '&' || src[i] === '|') i++;
      if (/\d/.test(src[i] || '')) {
        while (/\d/.test(src[i] || '')) i++;
        if (src[i] === '-') i++;
        continue;
      }
      skipNext = true;
      continue;
    }
    if (c === '\\') {
      if (src[i + 1] !== '\n') word = (word ?? '') + (src[i + 1] ?? '');
      i += 2;
      continue;
    }
    if (c === "'") {
      const end = src.indexOf("'", i + 1);
      const stop = end === -1 ? src.length : end;
      word = (word ?? '') + src.slice(i + 1, stop);
      i = stop + 1;
      continue;
    }
    if (c === '$' && src[i + 1] === "'") {
      let j = i + 2;
      let text = '';
      while (j < src.length && src[j] !== "'") {
        if (src[j] === '\\' && j + 1 < src.length) j++;
        text += src[j++];
      }
      word = (word ?? '') + text;
      i = j + 1;
      continue;
    }
    if (c === '"') {
      word = word ?? '';
      i++;
      while (i < src.length && src[i] !== '"') {
        if (src[i] === '\\' && '"\\$`\n'.includes(src[i + 1])) {
          if (src[i + 1] !== '\n') word += src[i + 1];
          i += 2;
        } else if (src[i] === '$' && src[i + 1] === '(' && src[i + 2] !== '(') {
          i = nested(i + 2, ')');
        } else if (src[i] === '`') {
          i = nested(i + 1, '`');
        } else {
          word += src[i++];
        }
      }
      i++;
      continue;
    }
    if (c === '$' && src[i + 1] === '(') {
      if (src[i + 2] === '(') {
        i = skipTo(src, i + 3, '))');
      } else {
        word = word ?? '';
        i = nested(i + 2, ')');
      }
      continue;
    }
    if (c === '`') {
      word = word ?? '';
      i = nested(i + 1, '`');
      continue;
    }
    word = (word ?? '') + c;
    i++;
  }
  endSegment();
  return src.length;
}

function readDelimiter(src, i) {
  let text = '';
  while (i < src.length && !WORD_BREAK.test(src[i])) {
    const c = src[i];
    if (c === "'" || c === '"') {
      const end = src.indexOf(c, i + 1);
      const stop = end === -1 ? src.length : end;
      text += src.slice(i + 1, stop);
      i = stop + 1;
    } else if (c === '\\') {
      text += src[i + 1] ?? '';
      i += 2;
    } else {
      text += c;
      i++;
    }
  }
  return { text, end: i };
}

function skipTo(src, from, token) {
  const at = src.indexOf(token, from);
  return at === -1 ? src.length : at + token.length;
}

module.exports = { lex };
