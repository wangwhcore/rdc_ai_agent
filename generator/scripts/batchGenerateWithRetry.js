/**
 * 批量自然语言生成 JSON，支持 LLM 限流时退出并等待重试
 *
 * 用法：
 *   node scripts/batchGenerateWithRetry.js --input tasks.json --out ../../generated
 *
 * tasks.json 格式：
 * [
 *   { "pageName": "采购申请表单", "prompt": "生成一个采购申请表单，包含..." },
 *   { "pageName": "供应商列表", "prompt": "生成一个供应商列表页，包含..." }
 * ]
 *
 * 如果遇到 429 限流，脚本会立即退出并返回 exit code 429，
 * 调用方（如 cron）可以等待 3 小时后再次启动。
 */
const fs = require('fs');
const path = require('path');
const {
  generateConfigFromPrompt,
  mockGenerateConfigFromPrompt,
} = require('../services/naturalLanguageService');
const {
  normalizeListConfig,
  normalizeAddEditConfig,
  normalizeSimpleFormConfig,
} = require('../services/configNormalizer');
const { buildListPage, buildAddEditPage, buildSimpleForm, validate } = require('../index');
const { stringifyLayout } = require('../ir');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, '');
    if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
      args[key] = argv[i + 1];
      i++;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeConfig(type, config) {
  switch (type) {
    case 'list': return normalizeListConfig(config);
    case 'addEdit': return normalizeAddEditConfig(config);
    case 'simpleForm': return normalizeSimpleFormConfig(config);
    default: return config;
  }
}

async function generateLayout(type, config) {
  const normalized = normalizeConfig(type, config);
  switch (type) {
    case 'list': return buildListPage(normalized);
    case 'addEdit': return buildAddEditPage(normalized);
    case 'simpleForm': return buildSimpleForm(normalized);
    default: throw new Error(`不支持的 type: ${type}`);
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const inputPath = args.input;
  const outDir = args.out || path.join(__dirname, '../../generated');

  if (!inputPath || !fs.existsSync(inputPath)) {
    console.error('请指定 --input tasks.json');
    process.exit(1);
  }

  const tasks = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
  if (!Array.isArray(tasks) || tasks.length === 0) {
    console.log('没有待生成任务');
    process.exit(0);
  }

  // 读取进度文件，支持断点续跑
  const progressPath = path.join(outDir, '.batch-progress.json');
  let progress = { completed: [], lastIndex: -1 };
  if (fs.existsSync(progressPath)) {
    progress = JSON.parse(fs.readFileSync(progressPath, 'utf-8'));
  }

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  for (let i = progress.lastIndex + 1; i < tasks.length; i++) {
    const task = tasks[i];
    console.log(`\n[${i + 1}/${tasks.length}] 生成: ${task.pageName}`);

    try {
      const hasApiKey = process.env.OPENAI_API_KEY || process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY;
      let type, config;
      if (!hasApiKey) {
        console.log('  ⚠️ 未检测到 LLM API Key，使用 mock 模式生成');
        ({ type, config } = mockGenerateConfigFromPrompt(task.prompt));
      } else {
        ({ type, config } = await generateConfigFromPrompt(task.prompt, {
          apiKey: process.env.OPENAI_API_KEY,
          baseURL: process.env.OPENAI_BASE_URL,
          model: process.env.OPENAI_MODEL,
        }));
      }

      const layoutJson = await generateLayout(type, config);
      const validation = validate(layoutJson);
      if (!validation.ok) {
        console.error('  校验失败:', validation.errors);
        continue;
      }

      const fileName = `${task.pageName}.json`.replace(/\s+/g, '-');
      const outPath = path.join(outDir, fileName);
      const { text, problem } = stringifyLayout(layoutJson);
      if (problem) {
        console.error(`  ❌ 序列化自检失败，已跳过: ${problem}`);
        continue;
      }
      fs.writeFileSync(outPath, text, 'utf-8');
      console.log(`  ✅ 已生成: ${outPath}`);

      progress.completed.push({ index: i, pageName: task.pageName, fileName });
      progress.lastIndex = i;
      fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2), 'utf-8');
    } catch (err) {
      // 识别限流错误
      const isRateLimited =
        err.status === 429 ||
        err.code === 'rate_limit_exceeded' ||
        /rate.limit|too many requests|429/i.test(err.message);

      if (isRateLimited) {
        console.error(`  ⏸️ 遇到 LLM 限流（429），已处理 ${i} 个任务，建议 3 小时后重试`);
        console.error(`  错误: ${err.message}`);
        process.exit(429);
      }

      console.error(`  ❌ 生成失败: ${err.message}`);
      // 其他错误继续处理下一个
    }
  }

  console.log('\n🎉 全部任务处理完成');
  process.exit(0);
}

main().catch(err => {
  console.error('脚本异常:', err);
  process.exit(1);
});
