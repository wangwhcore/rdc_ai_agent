/**
 * JSON 文本完整性分析
 *
 * 背景（真实事故）：
 *   设计器的 Layout JSON 里 `value` 字段本身是「一个 JSON 字符串」，
 *   里面还套着一层 JSON 文本。这两层一旦有一层转义丢了，就会出现
 *   「文件能被 JSON.parse，但 JSON.parse(value) 崩」的诡异现象。
 *
 * 最常见的成因：
 *   表达式（eventPayloadExpression / bodyExpression / customStyle）
 *   写成多行，换行被当成「真实换行符」写进了 value 文本，
 *   而 layer-2 的 JSON 里换行必须是 `\n` 两字符转义。
 *
 * 本模块提供两项能力：
 *   findRawControlChars(text)  —— 定位「双引号字符串内部」的裸控制字符
 *   describeFailure(text, err) —— 给出人类可读的成因判断与修复建议
 */

const ESCAPES = { 8: '\\b', 9: '\\t', 10: '\\n', 12: '\\f', 13: '\\r' };

/** 字符码 → 可读名 */
function charLabel(code) {
  if (ESCAPES[code]) return `${ESCAPES[code]} (U+${code.toString(16).padStart(4, '0').toUpperCase()})`;
  return `U+${code.toString(16).padStart(4, '0').toUpperCase()}`;
}

/** 偏移量 → { line, column }（皆从 1 开始） */
function lineColAt(text, index) {
  let line = 1;
  let lastBreak = -1;
  for (let i = 0; i < index && i < text.length; i++) {
    if (text[i] === '\n') {
      line++;
      lastBreak = i;
    }
  }
  return { line, column: index - lastBreak };
}

/**
 * 扫描 JSON 文本，找出「处于双引号字符串内部」的裸控制字符。
 * 这些字符一定导致 JSON.parse 失败（JSON 规范要求 U+0000–U+001F 必须转义）。
 * @param {string} text
 * @param {{max?:number}} [options]
 * @returns {Array<{index:number,line:number,column:number,char:string,label:string,snippet:string}>}
 */
function findRawControlChars(text, options = {}) {
  const max = options.max || 20;
  const found = [];
  if (typeof text !== 'string') return found;

  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);

    if (!inString) {
      if (code === 34 /* " */) inString = true;
      continue;
    }
    if (escaped) {
      escaped = false;
      continue;
    }
    if (code === 92 /* \ */) {
      escaped = true;
      continue;
    }
    if (code === 34 /* " */) {
      inString = false;
      continue;
    }
    if (code < 0x20) {
      const { line, column } = lineColAt(text, i);
      found.push({
        index: i,
        line,
        column,
        char: text[i],
        label: charLabel(code),
        snippet: text.slice(Math.max(0, i - 60), i + 60).replace(/[\r\n\t]/g, '␊'),
      });
      if (found.length >= max) return found;
    }
  }
  return found;
}

/**
 * 把一段「含真实控制字符的 JSON 文本」修好：只把字符串内部的裸控制字符转义，
 * 字符串外部（缩进/格式用的换行）原样保留。
 * @param {string} text
 * @returns {{text:string, replaced:number}}
 */
function escapeRawControlChars(text) {
  if (typeof text !== 'string') return { text, replaced: 0 };
  let out = '';
  let inString = false;
  let escaped = false;
  let replaced = 0;

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const ch = text[i];

    if (!inString) {
      out += ch;
      if (code === 34) inString = true;
      continue;
    }
    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }
    if (code === 92) {
      out += ch;
      escaped = true;
      continue;
    }
    if (code === 34) {
      out += ch;
      inString = false;
      continue;
    }
    if (code < 0x20) {
      out += ESCAPES[code] || `\\u${code.toString(16).padStart(4, '0')}`;
      replaced++;
      continue;
    }
    out += ch;
  }
  return { text: out, replaced };
}

/**
 * 给定文本与 JSON.parse 的异常，判断成因并给出可操作建议。
 * @param {string} text
 * @param {Error} error
 */
function describeFailure(text, error) {
  const message = (error && error.message) || '未知错误';

  // JSON.parse 在 V8 中会报 "Unexpected token ... in JSON at position N"
  // 或 "Bad control character in string literal in JSON at position N"
  const posMatch = message.match(/at position (\d+)/);
  const position = posMatch ? Number(posMatch[1]) : null;

  const controls = findRawControlChars(text);
  const isControlError = /control character/i.test(message);

  if (controls.length) {
    const first = controls[0];
    return {
      reason: 'raw-control-char',
      position: first.index,
      line: first.line,
      column: first.column,
      count: controls.length,
      label: first.label,
      snippet: first.snippet,
      message: `第 ${first.line} 行第 ${first.column} 列出现裸控制字符 ${first.label}`,
      hint: 'JSON 字符串里的换行/制表符必须写成 \\n、\\t 两字符转义；'
        + '常见原因：把多行 JS 表达式（如 eventPayloadExpression）直接粘进了 value 文本。'
        + '修复：JSON.stringify(内层对象) 后再赋给 value，不要手写拼接。',
    };
  }

  if (isControlError && position !== null) {
    return {
      reason: 'raw-control-char',
      position,
      message: `${message}`,
      hint: '字符串里存在未转义的控制字符，请用 JSON.stringify 重新序列化内层对象。',
    };
  }

  if (position !== null) {
    const { line, column } = lineColAt(text, position);
    return {
      reason: 'syntax',
      position,
      line,
      column,
      message: `第 ${line} 行第 ${column} 列语法错误: ${message}`,
      snippet: text.slice(Math.max(0, position - 80), position + 80).replace(/[\r\n\t]/g, '␊'),
      hint: '多半是手写/拼接 JSON 时漏了括号或引号；建议由生成器序列化而非手写。',
    };
  }

  return { reason: 'unknown', position: null, message, hint: '请检查 value 是否为合法 JSON 文本。' };
}

/**
 * 校验一份 Layout JSON：外层对象 + value 文本两层都要能解析。
 * @param {object} layoutJson
 * @returns {{ok:boolean, stage?:'outer'|'value', doc?:object, error?:Error, analysis?:object}}
 */
function validateLayoutJson(layoutJson) {
  if (!layoutJson || typeof layoutJson !== 'object') {
    return {
      ok: false,
      stage: 'outer',
      error: new Error('Layout JSON 必须是一个对象'),
      analysis: { reason: 'not-object', message: 'Layout JSON 必须是一个对象', hint: '传入设计器导出的对象。' },
    };
  }
  const raw = layoutJson.value;
  if (typeof raw !== 'string') {
    if (raw && typeof raw === 'object') return { ok: true, doc: raw };
    return {
      ok: false,
      stage: 'value',
      error: new Error('value 缺失，或既不是 JSON 字符串也不是对象'),
      analysis: { reason: 'missing-value', message: 'value 缺失', hint: 'Layout JSON 需要 value 字段。' },
    };
  }
  try {
    return { ok: true, doc: JSON.parse(raw) };
  } catch (e) {
    return { ok: false, stage: 'value', error: e, analysis: describeFailure(raw, e) };
  }
}

/**
 * 序列化并自检：一次拿到「文本 + 问题描述」。
 * 所有落盘路径（cli / deploy / batch）都应走这里，避免写出打不开的文件。
 * @param {object} layout
 * @param {number} [space] 缩进，默认 2
 * @returns {{text:string, problem:string|null, analysis?:object}}
 */
function stringifyLayout(layout, space = 2) {
  const text = JSON.stringify(layout, null, space);
  const probe = validateLayoutJson(layout);
  if (!probe.ok) {
    const a = probe.analysis || {};
    return {
      text,
      problem: `value 不是合法 JSON: ${a.message || probe.error.message}`,
      analysis: a,
    };
  }
  let reread;
  try {
    reread = JSON.parse(text);
  } catch (e) {
    return { text, problem: `序列化结果无法反解: ${e.message}` };
  }
  const controls = findRawControlChars(reread.value);
  if (controls.length) {
    const c = controls[0];
    return {
      text,
      problem: `value 文本内存在裸控制字符 ${c.label}（第 ${c.line} 行第 ${c.column} 列，共 ${controls.length} 处）`,
      analysis: { reason: 'raw-control-char', ...c, count: controls.length },
    };
  }
  return { text, problem: null };
}

module.exports = {
  findRawControlChars,
  escapeRawControlChars,
  describeFailure,
  validateLayoutJson,
  stringifyLayout,
  lineColAt,
  charLabel,
};
