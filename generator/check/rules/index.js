/**
 * 规则注册表
 *
 * 按组注册。新增一组规则只需要在这里加一行，
 * engine 会依次执行，彼此之间不共享状态。
 */

const structural = require('./structural');
const identity = require('./identity');
const references = require('./references');
const properties = require('./properties');
const datasource = require('./datasource');
const semantics = require('./semantics');

const GROUPS = [structural, identity, references, properties, datasource, semantics];

const ALL_CODES = GROUPS.flatMap(g => g.rules);

module.exports = GROUPS;
module.exports.GROUPS = GROUPS;
module.exports.ALL_CODES = ALL_CODES;
module.exports.byGroup = Object.fromEntries(GROUPS.map(g => [g.group, g]));
