/**
 * 数据源类规则：接口契约
 *
 * 低代码页面里 dataSource 是唯一和真实后端耦合的地方，
 * 也是「页面能打开但一直是空列表」这类问题的常见根因。
 */

const ALLOWED_METHODS = new Set(['get', 'post', 'put', 'delete', 'patch']);
const PLACEHOLDER_RE = /\$\{[^}]*\}|\bundefined\b|\bnull\b/;

function check(ctx, report) {
  const { ir } = ctx;
  const components = ir.components || {};

  // DS001 列表表格必须有数据源
  // 语料实测 6% 的 TableHook 没有 dataSource，多为子表（数据由主表联动带入），
  // 因此按页面语义区分严重级，而不是一刀切报错
  for (const [id, comp] of Object.entries(components)) {
    if (!comp || comp.type !== 'TableHook') continue;
    const p = comp.property || {};
    // dataSource 存在但为空对象（{}）等价于没配置，语料中有真实案例
    const emptyObject = p.dataSource && typeof p.dataSource === 'object' && Object.keys(p.dataSource).length === 0;
    const absent = p.dataSource === undefined || p.dataSource === null || p.dataSource === '' || emptyObject;
    if (!absent) continue;

    const isDetail = !!(p.isDetailTable || p.secondaryTable);
    const isListPage = ir.kind === 'list' && !isDetail;
    report({
      code: 'DS001',
      severity: isListPage ? 'error' : 'info',
      path: `$.value.desktop.components.${id}.property.dataSource`,
      message: `TableHook(${id}) 没有配置数据源${isDetail ? '（子表，由主表联动提供数据）' : ''}`,
      hint: isListPage
        ? '列表页的主表格必须配置 dataSource，否则永远显示空数据'
        : '确认数据是否由主表或上层容器带入；若是独立表格则需补 dataSource',
      extra: { componentId: id, isDetailTable: isDetail },
    });
  }

  // 逐条校验已抽取出的数据源契约。
  // 关键区分：只有 type=api 的数据源才真正发起后端请求，
  // 静态选项（如下拉的字典、勾选组的固定选项）自带 serverName/url 为空的合理情形。
  for (const q of ir.queries || []) {
    // 空对象已由 DS001 报出，这里不重复报「缺 serverName / 缺 url」
    if (q.isEmpty) continue;
    const at = `${q.owner}.${q.from}`;
    const isApi = q.type === 'api' || q.ownerType === 'TableHook';
    const missingSeverity = isApi ? 'error' : 'info';
    const missingHint = isApi
      ? 'api 类型数据源必须指定后端服务与接口路径'
      : '该数据源未声明 type=api，若为静态选项可忽略';

    if (q.serverName === null || q.serverName === '') {
      report({
        code: 'DS002', severity: missingSeverity, path: at,
        message: `数据源缺少 serverName（来自 ${q.ownerType} ${q.owner}）`,
        hint: missingHint + '；serverName 例如 purchase / vendor',
        extra: { owner: q.owner, ownerType: q.ownerType, type: q.type },
      });
    }

    if (q.url === null || q.url === '') {
      report({
        code: 'DS003', severity: missingSeverity, path: at,
        message: `数据源缺少 url（来自 ${q.ownerType} ${q.owner}）`,
        hint: missingHint,
        extra: { owner: q.owner, ownerType: q.ownerType, type: q.type },
      });
    } else {
      if (typeof q.url === 'string' && !q.url.startsWith('/') && !/^https?:\/\//.test(q.url)) {
        report({
          code: 'DS004', severity: 'warning', path: at,
          message: `数据源 url 未以 / 开头: ${q.url}`,
          hint: '平台按 serverName + url 拼接请求，url 通常需为绝对路径',
          extra: { owner: q.owner, url: q.url },
        });
      }
      if (typeof q.url === 'string' && PLACEHOLDER_RE.test(q.url)) {
        report({
          code: 'DS006', severity: 'warning', path: at,
          message: `数据源 url 含未替换的占位符: ${q.url}`,
          hint: '模板占位符没有被实际值替换，请求会 404',
          extra: { owner: q.owner, url: q.url },
        });
      }
    }

    if (q.method !== null && q.method !== undefined) {
      const m = String(q.method).toLowerCase();
      if (!ALLOWED_METHODS.has(m)) {
        report({
          code: 'DS005', severity: 'warning', path: at,
          message: `数据源 method 非法: ${q.method}`,
          hint: `合法值: ${Array.from(ALLOWED_METHODS).join(' / ')}`,
          extra: { owner: q.owner, method: q.method },
        });
      }
    }

    // DS007 写操作的 body 一定要有实参
    const m = q.method ? String(q.method).toLowerCase() : '';
    if ((m === 'post' || m === 'put' || m === 'patch')
      && q.url && /get|update|save|delete|remove|add/i.test(String(q.url))
      && !q.bodyExpression) {
      report({
        code: 'DS007', severity: 'info', path: at,
        message: `写接口 ${q.url} 没有提供 bodyExpression`,
        hint: '若服务端依赖请求体参数，需显式声明 bodyExpression',
        extra: { owner: q.owner, url: q.url },
      });
    }
  }
}

module.exports = {
  group: 'datasource',
  rules: ['DS001', 'DS002', 'DS003', 'DS004', 'DS005', 'DS006', 'DS007'],
  check,
};
