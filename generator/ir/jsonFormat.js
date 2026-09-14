/**
 * JSON 文本「格式检查 + 强制修订」
 *
 * 背景（成本极不对称）：
 *   生成链路里最常见的失败不是「语义错」，而是「文本层就非法」——
 *   尾随逗号、单引号、JSON 注释、未加引号的键、少一个闭合括号、BOM、
 *   字符串里塞了真实换行。这些问题看一眼就能改，却会让平台直接崩，
 *   排查成本远高于修复成本，所以值得在生成期强制拦下并自动修掉。
 *
 * 两个能力：
 *   inspectText(text)   只读体检，产出结构化缺陷清单（不依赖任何第三方库）
 *   repairText(text)    强制修订，返回修订后文本 + 修订手段清单（可审计）
 *   diagnose(text)      体检查 + 可修订性判定，给 check/CLI 直接用
 *
 * ⚠️ 本模块只负责「文本能不能解析」。
 *    修订成功后**必须**再过 ir/jsonGate 的两道门（结构不变量 + check 零 error），
 *    因为「可解析 ≠ 正确」：补错位置的括号能让文件变得可解析，
 *    却会把 phone/pad 塞进 desktop、把 layoutInfo 吞掉，运行时照样抛
 *    `TypeError: Cannot read properties of undefined (reading 'field')`。
 *
 * 修订手段优先级（前面恒安全，后面越来越宽松）：
 *   1. strip-bom        去 BOM / 零宽字符        恒安全
 *   2. escape-control   转义字符串内裸控制字符    恒安全（JSON 字符串内 <0x20 本就非法）
 *   3. jsonrepair       成熟开源库（可选依赖）    覆盖宽松语法 + 截断，首选
 *   4. normalize-loose  内置轻量规范化            jsonrepair 缺失时的兜底
 *   5. closer-patch     括号补齐（记录每处上下文） 最后手段，最需要人工复核
 */

const { escapeRawControlChars, lineColAt, charLabel } = require('./jsonIntegrity');

// ──────────────────────────── 可选依赖：jsonrepair ────────────────────────────
// NOTICE: jsonrepair 是 MIT 协议的开源 JSON 修复库（josdejong/jsonrepair），
// 能处理尾随逗号、单引号、注释、未加引号键、缺括号、被截断等常见宽松写法。
// 它是**可选依赖**：缺失时自动降级到内置的轻量规范化，不影响任何既有能力。
let _jsonrepair;
let _jsonrepairLoaded = false;
function loadJsonRepair() {
  if (_jsonrepairLoaded) return _jsonrepair;
  _jsonrepairLoaded = true;
  try {
    const mod = require('jsonrepair');
    if (typeof mod === 'function') _jsonrepair = mod;
    else if (mod && typeof mod.jsonrepair === 'function') _jsonrepair = mod.jsonrepair;
    else _jsonrepair = null;
  } catch (e) {
    _jsonrepair = null;
  }
  return _jsonrepair;
}
/** 是否可用成熟开源修复库 */
function hasJsonRepair() {
  return typeof loadJsonRepair() === 'function';
}

// ───────────────────────────────── 缺陷词表 ─────────────────────────────────

const REASON = {
  NOT_TEXT: 'not-text',
  EMPTY: 'empty',
  BOM: 'bom',
  RAW_CONTROL_CHAR: 'raw-control-char',
  TRAILING_COMMA: 'trailing-comma',
  SINGLE_QUOTE: 'single-quote',
  COMMENT: 'comment',
  UNQUOTED_KEY: 'unquoted-key',
  DUPLICATE_KEY: 'duplicate-key',
  UNDEFINED_LITERAL: 'undefined-literal',
  MISSING_VALUE: 'missing-value',
  TRUNCATED: 'truncated',
  MISSING_CLOSER: 'missing-closer',
  SYNTAX: 'syntax',
};

/**
 * fatal: 该缺陷本身就能让文本彻底不可用（不含「可修但非法」那一类）
 * fix:   对应的修订手段；null 表示不自动修（必须人工介入）
 * note:  给人看的解释
 */
const REASON_INFO = {
  [REASON.NOT_TEXT]: {
    fatal: true, fix: null, label: '不是文本',
    note: '期望一段 JSON 文本，实际拿到的是其它类型',
  },
  [REASON.EMPTY]: {
    fatal: true, fix: null, label: '空文本',
    note: '空字符串不是合法 JSON',
  },
  [REASON.BOM]: {
    fatal: false, fix: 'strip-bom', label: 'BOM / 零宽字符',
    note: '文件头部的 U+FEFF 会让 JSON.parse 直接失败，去掉即可',
  },
  [REASON.RAW_CONTROL_CHAR]: {
    fatal: false, fix: 'escape-control', label: '字符串内裸控制字符',
    note: 'JSON 字符串里的换行/制表符必须写成 \\n、\\t 两字符转义',
  },
  [REASON.TRAILING_COMMA]: {
    fatal: false, fix: 'jsonrepair', label: '尾随逗号',
    note: 'JSON 不允许 [1,2,] 或 {"a":1,}',
  },
  [REASON.SINGLE_QUOTE]: {
    fatal: false, fix: 'jsonrepair', label: '单引号字符串',
    note: 'JSON 只认双引号，单引号属 JS 字面量写法',
  },
  [REASON.COMMENT]: {
    fatal: false, fix: 'jsonrepair', label: 'JSON 注释',
    note: 'JSON 不支持 // 与 /* */ 注释（那是 JSONC / JSON5）',
  },
  [REASON.UNQUOTED_KEY]: {
    fatal: false, fix: 'jsonrepair', label: '未加引号的键',
    note: '对象的键必须是双引号字符串',
  },
  [REASON.DUPLICATE_KEY]: {
    fatal: false, fix: null, label: '键名重复',
    note: '同一对象里出现重复键，JSON.parse 不报错但后者会静默覆盖前者 —— 配置会无声丢失，必须人工确认留哪个',
  },
  [REASON.UNDEFINED_LITERAL]: {
    fatal: false, fix: 'jsonrepair', label: '字面量 undefined',
    note: '⚠️ 修订会把 undefined 变成 null，属语义改动，落盘前请确认',
  },
  [REASON.MISSING_VALUE]: {
    fatal: false, fix: 'jsonrepair', label: '键缺值',
    note: '⚠️ 形如 {"a":} 的写法，修订会补出一个 null —— 请确认这个默认值是否合理',
  },
  [REASON.TRUNCATED]: {
    fatal: true, fix: 'closer-patch', label: '文本被截断',
    note: '括号没有闭合，多为写入中断或手工删改，补齐后必须人工复核',
  },
  [REASON.MISSING_CLOSER]: {
    fatal: true, fix: 'closer-patch', label: '缺少闭合符',
    note: '同上：补对位置才安全，补错位置会静默改变结构',
  },
  [REASON.SYNTAX]: {
    fatal: true, fix: null, label: '语法错误',
    note: '不属于已知可修类别，需要人工检查',
  },
};

/** 文本片段，控制字符可视化，便于在终端里看清上下文 */
function snippetAt(text, index, radius = 50) {
  const from = Math.max(0, index - radius);
  const to = Math.min(text.length, index + radius);
  return text.slice(from, to).replace(/\r/g, '␍').replace(/\n/g, '␊').replace(/\t/g, '␉');
}

/** 去掉 BOM 与零宽字符（只处理文本首尾，避免动到正文） */
function stripBom(text) {
  if (typeof text !== 'string') return { text, removed: 0 };
  let removed = 0;
  let out = text;
  // U+FEFF(BOM) / U+200B(零宽空格) / U+200C / U+200D / U+2060(词连接符)
  const LEADING = /^[\uFEFF\u200B\u200C\u200D\u2060]+/;
  const m = out.match(LEADING);
  if (m) {
    removed += m[0].length;
    out = out.slice(m[0].length);
  }
  return { text: out, removed };
}

/** 用括号栈算出还需要补的闭合符（用于 Unexpected end of JSON input） */
function pendingClosers(text) {
  const stack = [];
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}' || ch === ']') stack.pop();
  }
  return stack.slice().reverse().map(c => (c === '{' ? '}' : ']')).join('');
}

/** 解析失败时判断该补哪个字符 */
function closerFor(message, text, pos) {
  if (/Expected ',' or '\]' after array element/.test(message)) return ']';
  if (/Expected ',' or '\}' after (last )?property/.test(message)) return '}';
  if (/Expected double-quoted property name/.test(message)) return '}';
  const next = (text.slice(pos).match(/\S/) || [''])[0];
  if (next === '}') return ']';
  if (next === ']') return '}';
  return null;
}

/**
 * 文本是否「至少长得像 JSON」。
 *
 * 为什么必须设这道闸：jsonrepair 非常宽容，能把**任意**文本揉成 JSON ——
 * `'这不是 JSON'` → `'"这不是 JSON"'`、`'<<<<'` → `'[,]'` 之类。
 * 对「文件根本不是 JSON」这种输入，硬修只会把它变成一个更难排查的下游
 * 结构错误（desktop 少一堆字段），还不如直接说「这不是 JSON」。
 *
 * 判据取「首个非空白字符」：JSON 的合法起始字符只有
 * { [ " 数字 - true false null 这几类。
 */
function looksLikeJson(text) {
  if (typeof text !== 'string') return false;
  const first = (text.replace(/^[\s\uFEFF\u200B\u200C\u200D\u2060]+/, '')[0]) || '';
  return '{[",-0123456789tfn'.includes(first);
}

// ───────────────────────────────── 缺陷扫描 ─────────────────────────────────

const WS = /[ \t\r\n]/;
const IDENT_START = /[A-Za-z_$]/;
const IDENT_CHAR = /[A-Za-z0-9_$]/;

/**
 * 一次状态机遍历，同时产出：
 *   defects —— 结构化缺陷（带位置 / 片段），用于体检报告
 *   spans   —— 每个缺陷对应的「可删除/可替换区间」，用于内置轻量修订
 *
 * 状态机必须在字符串/注释内部与外部之间正确切换，否则字符串里的 `//`
 * 会被误判成注释（反面教材：截断 URL 拼接出来的字符串）。
 */
function scan(text) {
  const defects = [];
  const spans = [];
  const add = (reason, index, end, extra) => {
    const { line, column } = lineColAt(text, index);
    defects.push({
      reason, index, end, line, column,
      snippet: snippetAt(text, index),
      label: REASON_INFO[reason] ? REASON_INFO[reason].label : reason,
      ...(extra || {}),
    });
    spans.push({ reason, index, end, ...(extra || {}) });
  };

  let inDouble = false;
  let inSingle = false;
  let escaped = false;
  const stack = [];
  const keyScopes = [];      // 与 stack 平行：对象作用域的 Map<键名, 首次出现下标>，数组作用域为 null
  let keyExpected = false;   // 当前是否处于「对象里该出现键」的位置
  let pendingComma = -1;     // 上一个逗号的位置（用于判定尾随逗号）
  let pendingColon = -1;     // 上一个冒号的位置（用于判定「键缺值」）
  let singleQuoteAt = -1;    // 当前单引号字符串起始下标（-1 表示不在单引号串内）
  let keyStart = -1;         // 当前「键字符串」的起始引号下标（-1 表示不在读键）

  /**
   * 同一个对象里键名重复：JSON.parse 不报错，后出现的值静默覆盖先出现的
   * → 配置无声丢失。这类问题只能靠文本层扫描发现。
   */
  const recordKey = (name, index) => {
    const scope = keyScopes[keyScopes.length - 1];
    if (!scope) return;
    if (scope.has(name)) {
      add(REASON.DUPLICATE_KEY, index, index + name.length + 2, { key: name, firstAt: scope.get(name) });
      return;
    }
    scope.set(name, index);
  };

  /** 单引号字符串闭合时回填右边界，供修订时整体换成双引号 */
  const closeSingleQuote = end => {
    if (singleQuoteAt < 0) return;
    for (let k = spans.length - 1; k >= 0; k--) {
      if (spans[k].reason === REASON.SINGLE_QUOTE && spans[k].index === singleQuoteAt) {
        spans[k].end = end;
        defects[k].end = end;
        break;
      }
    }
    singleQuoteAt = -1;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const code = text.charCodeAt(i);

    if (inDouble || inSingle) {
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === (inDouble ? '"' : "'")) {
        if (inSingle) closeSingleQuote(i);
        else if (keyStart >= 0) recordKey(text.slice(keyStart + 1, i), keyStart);
        keyStart = -1;
        inDouble = false;
        inSingle = false;
        keyExpected = false;
        pendingComma = -1;
        continue;
      }
      if (inDouble && code < 0x20) {
        add(REASON.RAW_CONTROL_CHAR, i, i, { char: ch, charLabel: charLabel(code) });
      }
      continue;
    }

    // ── 字符串外部 ──
    if (ch === '"') {
      inDouble = true;
      escaped = false;
      pendingColon = -1;
      keyStart = keyExpected ? i : -1;
      continue;
    }
    if (ch === "'") {
      add(REASON.SINGLE_QUOTE, i, undefined);
      singleQuoteAt = i;
      inSingle = true;
      escaped = false;
      pendingColon = -1;
      continue;
    }

    if (ch === '/' && text[i + 1] === '/') {
      let j = i;
      while (j < text.length && text[j] !== '\n') j++;
      add(REASON.COMMENT, i, j, { kind: 'line' });
      i = j - 1;
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      const start = i;
      let j = i + 2;
      while (j < text.length && !(text[j] === '*' && text[j + 1] === '/')) j++;
      const end = Math.min(text.length, j + 2);
      add(REASON.COMMENT, start, end, { kind: 'block' });
      i = end - 1;
      continue;
    }

    if (WS.test(ch)) continue;

    if (ch === '{') { stack.push('{'); keyScopes.push(new Map()); keyExpected = true; pendingComma = -1; pendingColon = -1; continue; }
    if (ch === '[') { stack.push('['); keyScopes.push(null); keyExpected = false; pendingComma = -1; pendingColon = -1; continue; }
    if (ch === '}' || ch === ']') {
      if (pendingColon >= 0) add(REASON.MISSING_VALUE, pendingColon, pendingColon + 1, { closer: ch });
      if (pendingComma >= 0) add(REASON.TRAILING_COMMA, pendingComma, pendingComma + 1, { closer: ch });
      stack.pop();
      keyScopes.pop();
      keyExpected = stack[stack.length - 1] === '{';
      pendingComma = -1;
      pendingColon = -1;
      continue;
    }
    if (ch === ',') {
      if (pendingColon >= 0) add(REASON.MISSING_VALUE, pendingColon, pendingColon + 1, { closer: ch });
      pendingComma = i;
      pendingColon = -1;
      keyExpected = stack[stack.length - 1] === '{';
      continue;
    }
    if (ch === ':') { keyExpected = false; pendingComma = -1; pendingColon = i; continue; }

    // 对象里「该出现键」的位置却出现了裸标识符 → 未加引号的键
    if (stack[stack.length - 1] === '{' && keyExpected && IDENT_START.test(ch)) {
      let j = i;
      while (j < text.length && IDENT_CHAR.test(text[j])) j++;
      add(REASON.UNQUOTED_KEY, i, j, { key: text.slice(i, j) });
      i = j - 1;
      pendingColon = -1;
      continue;
    }

    if (/[A-Za-z]/.test(ch)) {
      let j = i;
      while (j < text.length && /[A-Za-z0-9_$.]/.test(text[j])) j++;
      const word = text.slice(i, j);
      if (word === 'undefined') {
        add(REASON.UNDEFINED_LITERAL, i, j, { literal: word });
      }
      i = j - 1;
      keyExpected = false;
      pendingComma = -1;
      pendingColon = -1;
      continue;
    }

    // 数字/其它标量 → 值位置结束
    keyExpected = false;
    pendingComma = -1;
    pendingColon = -1;
  }

  if (stack.length) {
    add(REASON.TRUNCATED, text.length, text.length, { pending: pendingClosers(text) });
  }

  return { defects, spans };
}

// ───────────────────────────────── 体检 ─────────────────────────────────

function tryParse(text) {
  try {
    return { ok: true, value: JSON.parse(text), error: null };
  } catch (e) {
    return { ok: false, value: undefined, error: e };
  }
}

function errorPosition(error) {
  const m = (error && error.message || '').match(/at position (\d+)/);
  return m ? Number(m[1]) : null;
}

/**
 * 只读体检：不做任何修改，只回答「这段文本是不是严格合法的 JSON」。
 *
 * @param {string} text
 * @param {{label?:string}} [options]
 * @returns {{
 *   ok: boolean,            // 严格合法（无需任何修订）
 *   text: string,
 *   parseable: boolean,     // 去掉 BOM 后能否 JSON.parse
 *   value: any,             // parseable 时的解析结果
 *   error: Error|null,      // parse 异常
 *   problems: Array,        // 全部缺陷（含可修的与致命的）
 *   fatal: object|null      // 不可自动修订的致命原因；null 表示「要么合法，要么缺陷都可修」
 * }}
 */
function inspectText(text, options = {}) {
  const label = options.label || 'JSON 文本';

  if (typeof text !== 'string') {
    const p = {
      reason: REASON.NOT_TEXT, label: REASON_INFO[REASON.NOT_TEXT].label,
      message: `${label} 不是字符串（实际 ${Array.isArray(text) ? 'array' : typeof text}）`,
      snippet: '', index: null, line: null, column: null,
    };
    return { ok: false, text, parseable: false, value: undefined, error: null, problems: [p], fatal: { reason: REASON.NOT_TEXT, message: p.message } };
  }

  const problems = [];
  const bom = stripBom(text);
  if (bom.removed) {
    problems.push({
      reason: REASON.BOM, label: REASON_INFO[REASON.BOM].label,
      message: `${label} 头部含 ${bom.removed} 个 BOM / 零宽字符`,
      hint: REASON_INFO[REASON.BOM].note,
      index: 0, line: 1, column: 1, snippet: snippetAt(text, 0, 12),
    });
  }
  const body = bom.text;

  if (!body.trim()) {
    const p = {
      reason: REASON.EMPTY, label: REASON_INFO[REASON.EMPTY].label,
      message: `${label} 为空`,
      index: null, line: null, column: null, snippet: '',
    };
    problems.push(p);
    return { ok: false, text: body, parseable: false, value: undefined, error: null, problems, fatal: p };
  }

  const { defects } = scan(body);
  for (const d of defects) {
    const info = REASON_INFO[d.reason] || {};
    problems.push({
      reason: d.reason,
      label: info.label || d.reason,
      message: `${label} 第 ${d.line} 行第 ${d.column} 列存在${info.label || d.reason}`
        + (d.key ? `: ${d.key}` : '')
        + (d.charLabel ? `: ${d.charLabel}` : ''),
      hint: info.note || '',
      fix: info.fix || null,
      index: d.index,
      line: d.line,
      column: d.column,
      snippet: d.snippet,
      ...(d.key ? { key: d.key } : {}),
      ...(d.charLabel ? { charLabel: d.charLabel } : {}),
      ...(d.pending ? { pending: d.pending } : {}),
    });
  }

  const parsed = tryParse(body);
  if (parsed.ok) {
    // 能解析 ⇒ 上面的宽松语法缺陷必然不存在；剩下的只可能是 BOM 一类「已剥离」的东西
    return { ok: problems.length === 0, text: body, parseable: true, value: parsed.value, error: null, problems, fatal: null };
  }

  // 解析失败：把所有「可修类」缺陷视作解释；无法解释时才认定语法错误。
  // 注意不能只看 fatal 标记 ——「文本被截断」虽 fatal，但它的 fix 是 closer-patch，
  // 恰恰是 Unexpected end of JSON input 的正确解释（早期只看 fatal 会误判成不可修）。
  const pos = errorPosition(parsed.error);
  const hasExplainingDefect = problems.some(p => {
    const info = REASON_INFO[p.reason];
    if (!info || !info.fix) return false;
    if (p.index === null || p.index === undefined) return false;
    if (pos === null) return true;                       // 无位置信息（如输入意外结束）
    return Math.abs(p.index - pos) <= 2 || p.index >= body.length;
  });

  let fatal = null;
  if (!hasExplainingDefect) {
    const { line, column } = pos !== null ? lineColAt(body, pos) : { line: null, column: null };
    fatal = {
      reason: REASON.SYNTAX,
      message: `${label} 第 ${line} 行第 ${column} 列语法错误: ${parsed.error.message}`,
      hint: REASON_INFO[REASON.SYNTAX].note,
      index: pos,
      line,
      column,
      snippet: pos !== null ? snippetAt(body, pos, 60) : '',
    };
    problems.push({ ...fatal, label: REASON_INFO[REASON.SYNTAX].label });
  }

  return { ok: false, text: body, parseable: false, value: undefined, error: parsed.error, problems, fatal };
}

// ───────────────────────────────── 强制修订 ─────────────────────────────────

/** 把一段单引号字符串的「内容」转成双引号字符串的「内容」 */
function requoteSingle(inner) {
  let out = '';
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === '\\') {
      const nx = inner[i + 1];
      if (nx === "'") { out += "'"; i++; }
      else if (nx === '"') { out += '\\"'; i++; }
      else { out += ch + (nx === undefined ? '' : nx); i++; }
      continue;
    }
    if (ch === '"') { out += '\\"'; continue; }
    out += ch;
  }
  return out;
}

/**
 * 内置轻量规范化：本地可定位、可审计，不依赖第三方库。
 * 只处理「有明确位置」的四类宽松写法，改完必须 JSON.parse 通过才被采纳。
 * @returns {{text:string, patches:Array}|null}
 */
function normalizeLoose(text) {
  const { spans } = scan(text);
  if (!spans.length) return null;

  // 从右往左改，保证前面的下标不失效
  const edits = [];
  for (const s of spans) {
    if (s.index === undefined || s.index === null) continue;
    switch (s.reason) {
      case REASON.COMMENT:
        edits.push({ from: s.index, to: s.end, insert: '' });
        break;
      case REASON.TRAILING_COMMA:
        edits.push({ from: s.index, to: s.index + 1, insert: '' });
        break;
      case REASON.UNQUOTED_KEY:
        edits.push({ from: s.index, to: s.end, insert: `"${s.key}"` });
        break;
      case REASON.SINGLE_QUOTE: {
        if (s.end === undefined) break;
        edits.push({ from: s.index, to: s.end + 1, insert: `"${requoteSingle(text.slice(s.index + 1, s.end))}"` });
        break;
      }
      default:
        break;
    }
  }
  if (!edits.length) return null;

  edits.sort((a, b) => b.from - a.from || b.to - a.to);
  let out = text;
  const patches = [];
  for (const e of edits) {
    // 区间重叠时跳过内层编辑，避免互相破坏
    out = out.slice(0, e.from) + e.insert + out.slice(e.to);
    patches.push({ kind: 'loose', at: e.from, to: e.to, insert: e.insert });
  }
  return { text: out, patches };
}

/** 括号补齐（沿用 scripts/repairValueJson.js 验证过的策略） */
function patchClosers(text, maxPatches = 30) {
  const patches = [];
  let cur = text;
  let lastError = null;
  for (let i = 0; i < maxPatches; i++) {
    const p = tryParse(cur);
    if (p.ok) return { ok: true, text: cur, patches };
    lastError = p.error;
    if (/Unexpected end of JSON input/.test(p.error.message)) {
      const closers = pendingClosers(cur);
      if (!closers) return { ok: false, text: cur, patches, error: p.error.message };
      patches.push({ kind: 'closer', at: cur.length, insert: closers, reason: 'Unexpected end of JSON input', context: '(文件结尾)' });
      cur += closers;
      continue;
    }
    const pos = errorPosition(p.error);
    if (pos === null) return { ok: false, text: cur, patches, error: p.error.message };
    const closer = closerFor(p.error.message, cur, pos);
    if (!closer) return { ok: false, text: cur, patches, error: p.error.message };
    patches.push({
      kind: 'closer', at: pos, insert: closer, reason: p.error.message,
      context: cur.slice(Math.max(0, pos - 70), pos + 40),
    });
    cur = cur.slice(0, pos) + closer + cur.slice(pos);
  }
  return { ok: false, text: cur, patches, error: lastError ? lastError.message : '补丁次数超限' };
}

/**
 * 强制修订：把文本修成合法 JSON。
 *
 * @param {string} text
 * @param {{label?:string, allowCloserPatch?:boolean, allowLoose?:boolean}} [options]
 * @returns {{
 *   ok: boolean,
 *   text: string,
 *   value: any,
 *   method: string|null,      // 实际生效的最宽松手段
 *   methods: string[],        // 依次生效的手段
 *   patches: Array,           // 每处修改（可审计）
 *   warnings: string[],       // 需要人工留意的语义改动
 *   problems: Array,          // 原始缺陷清单
 *   error: string|null
 * }}
 */
function repairText(text, options = {}) {
  const label = options.label || 'JSON 文本';
  const allowCloserPatch = options.allowCloserPatch !== false;
  const allowLoose = options.allowLoose !== false;

  const base = {
    ok: false, text, value: undefined, method: null, methods: [], patches: [],
    warnings: [], problems: [], error: null,
  };

  if (typeof text !== 'string') {
    const ins = inspectText(text, { label });
    return { ...base, problems: ins.problems, error: '输入不是字符串' };
  }

  const methods = [];
  const patches = [];
  const warnings = [];

  // ① 去 BOM / 零宽字符（恒安全）
  const bom = stripBom(text);
  let cur = bom.text;
  if (bom.removed) {
    methods.push('strip-bom');
    patches.push({ kind: 'bom', at: 0, length: bom.removed });
  }

  // ② 转义字符串内裸控制字符（恒安全：JSON 字符串内 <0x20 本就非法）
  const esc = escapeRawControlChars(cur);
  if (esc.replaced) {
    cur = esc.text;
    methods.push('escape-control');
    patches.push({ kind: 'control', count: esc.replaced });
  }

  if (!cur.trim()) {
    return { ...base, text: cur, methods, patches, problems: inspectText(cur, { label }).problems, error: '文本为空' };
  }

  // 明显不是 JSON 形态的（中文说明、`gid=abc`、日志行……）不要交给 jsonrepair，
  // 否则「根本不是 JSON」会被揉成一个合法的 JSON 标量，问题被推到更难排查的下游。
  if (!looksLikeJson(cur)) {
    return {
      ...base, text: cur, methods, patches, warnings,
      problems: inspectText(text, { label }).problems,
      error: '文本看不出任何 JSON 结构（首个非空白字符不是 { [ " - 数字 true/false/null）',
    };
  }

  // ③ 已经合法，收工
  if (tryParse(cur).ok) {
    return {
      ok: true, text: cur, value: tryParse(cur).value,
      method: methods.length ? methods[methods.length - 1] : null,
      methods, patches, warnings, problems: inspectText(text, { label }).problems, error: null,
    };
  }

  // ④ 成熟开源库 jsonrepair（首选）
  const jr = loadJsonRepair();
  if (jr) {
    try {
      const fixed = jr(cur);
      if (tryParse(fixed).ok) {
        methods.push('jsonrepair');
        const before = inspectText(cur, { label });
        if (before.problems.some(p => p.reason === REASON.UNDEFINED_LITERAL)) {
          warnings.push('修订把字面量 undefined 变成了 null（语义改动，请确认）');
        }
        if (before.problems.some(p => p.reason === REASON.MISSING_VALUE)) {
          warnings.push('修订为「键缺值」的位置补出了一个 null（请确认这个默认值是否合理）');
        }
        return {
          ok: true, text: fixed, value: tryParse(fixed).value,
          method: 'jsonrepair', methods, patches,
          warnings,
          problems: inspectText(text, { label }).problems,
          error: null,
        };
      }
    } catch (e) {
      // jsonrepair 也修不好 → 继续降级
    }
  }

  // ⑤ 内置轻量规范化（兜底）
  if (allowLoose) {
    const loose = normalizeLoose(cur);
    if (loose && tryParse(loose.text).ok) {
      methods.push('normalize-loose');
      patches.push(...loose.patches);
      return {
        ok: true, text: loose.text, value: tryParse(loose.text).value,
        method: 'normalize-loose', methods, patches, warnings,
        problems: inspectText(text, { label }).problems, error: null,
      };
    }
  }

  // ⑥ 括号补齐（最后手段，最需要人工复核）
  if (allowCloserPatch) {
    const cp = patchClosers(cur);
    if (cp.ok) {
      methods.push('closer-patch');
      patches.push(...cp.patches);
      warnings.push('通过补齐括号才使其可解析：请务必确认 desktop 四件套齐全、设备节点未互相嵌套');
      return {
        ok: true, text: cp.text, value: tryParse(cp.text).value,
        method: 'closer-patch', methods, patches, warnings,
        problems: inspectText(text, { label }).problems, error: null,
      };
    }
    return {
      ...base, text: cp.text, methods, patches, warnings,
      problems: inspectText(text, { label }).problems,
      error: cp.error || '括号补齐失败',
    };
  }

  const ins = inspectText(text, { label });
  return {
    ...base, text: cur, methods, patches, warnings,
    problems: ins.problems,
    error: (ins.fatal && ins.fatal.message) || '无法修订',
  };
}

/**
 * 体检 + 可修订性判定：给 check 规则、CLI 直接用。
 *
 * 注意「能解析 ≠ 没问题」：像「键名重复」这类缺陷文本本身是合法 JSON，
 * repairText 会直接返回 ok=true 但 method=null（我们不动它）。
 * 所以可修订性只认「确实动过手」——method 非空才算真能修。
 *
 * @returns {object} inspectText 的结果，外加 { repairable, repair, howToFix }
 */
function diagnose(text, options = {}) {
  const ins = inspectText(text, options);
  if (ins.ok) return { ...ins, repairable: false, repair: null, howToFix: null, repairError: null };
  const rep = repairText(text, options);
  const fixed = rep.ok && !!rep.method;
  return {
    ...ins,
    repairable: fixed,
    repair: fixed ? rep : null,
    howToFix: fixed ? rep.method : null,
    repairError: rep.ok ? null : rep.error,
  };
}

/** 把缺陷清单压成一句人话，便于塞进诊断 message */
function summarizeProblems(problems, max = 3) {
  const items = problems.slice(0, max).map(p => p.label || p.reason);
  const uniq = [...new Set(items)];
  const more = problems.length > max ? ` 等 ${problems.length} 处` : '';
  return `${uniq.join('、')}${more}`;
}

module.exports = {
  REASON,
  REASON_INFO,
  hasJsonRepair,
  looksLikeJson,
  stripBom,
  pendingClosers,
  closerFor,
  scan,
  inspectText,
  repairText,
  diagnose,
  normalizeLoose,
  patchClosers,
  summarizeProblems,
  tryParse,
  snippetAt,
};
