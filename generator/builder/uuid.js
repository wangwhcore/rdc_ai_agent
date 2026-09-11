const { randomUUID } = require('crypto');

/**
 * 生成 32 位小写十六进制 UUID（去掉连字符）
 * 与现有 MdFrontLayout 文件名、组件 id 格式一致
 */
function uuid() {
  return randomUUID().replace(/-/g, '').toLowerCase();
}

module.exports = { uuid };
