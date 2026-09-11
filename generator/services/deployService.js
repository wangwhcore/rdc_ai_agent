const fs = require('fs');
const path = require('path');
const { deployLayout, createFunctionRecord } = require('../scripts/deploy');

function deployFromRequest(body, cwd = process.cwd()) {
  const {
    layout,
    layoutDir = '../../MdFrontLayout',
    functionDir = '../../MdFunction',
    createFunction = false,
    parentGid,
    code,
    sequence = 0,
  } = body || {};

  if (!layout || typeof layout !== 'object' || !layout.gid) {
    throw new Error('请求体必须包含 layout 对象且 layout.gid 存在');
  }

  const resolvedLayoutDir = path.resolve(cwd, layoutDir);
  const resolvedFunctionDir = path.resolve(cwd, functionDir);

  const layoutFile = deployLayout(layout, resolvedLayoutDir);

  let functionFile;
  if (createFunction) {
    let existingFunction = null;
    if (layout.functionGid) {
      const functionFilePath = path.join(resolvedFunctionDir, `${layout.functionGid}.json`);
      if (fs.existsSync(functionFilePath)) {
        existingFunction = JSON.parse(fs.readFileSync(functionFilePath, 'utf-8'));
      }
    }

    functionFile = createFunctionRecord(layout, {
      parentGid,
      code,
      sequence: Number(sequence),
      functionDir: resolvedFunctionDir,
      existingFunction,
    });
  }

  return { layoutFile, functionFile: functionFile || null };
}

module.exports = { deployFromRequest };
