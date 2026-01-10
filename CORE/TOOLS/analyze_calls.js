/**
 * analyze_calls.js - Главный модуль статического анализа
 * 
 * Использование:
 *   node analyze_calls.js [options]
 * 
 * Опции:
 *   --output=FILE      Имя выходного файла (по умолчанию: CALL_TREE.md)
 *   --min-lines=N      Минимум строк для отображения в Large Functions (по умолчанию: 50)
 *   --format=FORMAT    Формат вывода: md, json, или both (по умолчанию: md)
 *   --verbose          Подробный вывод в консоль
 *   --help             Показать справку
 */

const fs = require('fs');
const path = require('path');

// Импорт модулей
const { analyzeJsContent, extractImports, PATTERNS } = require('./parsers');
const { buildCallGraph, buildImportGraph, findRootsAndUnused } = require('./call-graph');
const { generateMarkdownReport, generateJsonReport } = require('./report-generator');

// ─────────────────────────────────────────────────────────────
// Конфигурация
// ─────────────────────────────────────────────────────────────

const projectRoot = 'c:\\0_PROJECTS\\CrazyWalk-Game';

// Директории для исключения из сканирования
const EXCLUDED_DIRS = [
    'node_modules',
    '.git',
    'dist',
    'build',
    'coverage',
    '.agent',
    'CORE/TOOLS'  // Исключаем сам анализатор
];

// Расширения файлов для анализа
const INCLUDED_EXTENSIONS = ['.js', '.html'];

/**
 * Рекурсивно сканирует директорию и возвращает все файлы
 */
function scanDirectory(dir, relativePath = '') {
    const files = [];
    const fullPath = path.join(projectRoot, relativePath, dir);

    if (!fs.existsSync(fullPath)) return files;

    const entries = fs.readdirSync(fullPath, { withFileTypes: true });

    for (const entry of entries) {
        const entryRelativePath = path.join(relativePath, dir, entry.name);

        if (entry.isDirectory()) {
            // Пропускаем исключённые директории
            if (EXCLUDED_DIRS.some(excluded => entryRelativePath.includes(excluded))) {
                continue;
            }
            files.push(...scanDirectory('', entryRelativePath));
        } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (INCLUDED_EXTENSIONS.includes(ext)) {
                files.push(entryRelativePath.replace(/\\/g, '/'));
            }
        }
    }

    return files;
}

/**
 * Получить все файлы проекта для анализа
 */
function getFilesToAnalyze() {
    const files = [];

    // Сканируем основные директории
    const rootEntries = fs.readdirSync(projectRoot, { withFileTypes: true });

    for (const entry of rootEntries) {
        if (entry.isDirectory()) {
            if (EXCLUDED_DIRS.includes(entry.name)) continue;
            files.push(...scanDirectory(entry.name));
        } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (INCLUDED_EXTENSIONS.includes(ext)) {
                files.push(entry.name);
            }
        }
    }

    return files;
}

// Автоматически сканируем проект
const filesToAnalyze = getFilesToAnalyze();


// ─────────────────────────────────────────────────────────────
// CLI Парсинг
// ─────────────────────────────────────────────────────────────

function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        output: 'CALL_TREE.md',
        minLines: 50,
        format: 'md',
        verbose: false,
        help: false
    };

    args.forEach(arg => {
        if (arg.startsWith('--output=')) {
            options.output = arg.split('=')[1];
        } else if (arg.startsWith('--min-lines=')) {
            options.minLines = parseInt(arg.split('=')[1]) || 50;
        } else if (arg.startsWith('--format=')) {
            options.format = arg.split('=')[1];
        } else if (arg === '--verbose') {
            options.verbose = true;
        } else if (arg === '--help') {
            options.help = true;
        }
    });

    return options;
}

function showHelp() {
    console.log(`
Project Function Analyzer
=========================

Использование:
  node analyze_calls.js [options]

Опции:
  --output=FILE      Имя выходного файла (по умолчанию: CALL_TREE.md)
  --min-lines=N      Минимум строк для отображения в Large Functions (по умолчанию: 50)
  --format=FORMAT    Формат вывода: md, json, или both (по умолчанию: md)
  --verbose          Подробный вывод в консоль
  --help             Показать эту справку

Примеры:
  node analyze_calls.js
  node analyze_calls.js --format=json --output=analysis.json
  node analyze_calls.js --min-lines=30 --verbose
  node analyze_calls.js --format=both
`);
}

// ─────────────────────────────────────────────────────────────
// Кэширование файлов
// ─────────────────────────────────────────────────────────────

const fileContentCache = new Map();

function getFileContent(filePath) {
    if (fileContentCache.has(filePath)) {
        return fileContentCache.get(filePath);
    }

    const fullPath = path.join(projectRoot, filePath);
    if (!fs.existsSync(fullPath)) {
        fileContentCache.set(filePath, null);
        return null;
    }

    const content = fs.readFileSync(fullPath, 'utf8');
    fileContentCache.set(filePath, content);
    return content;
}

// ─────────────────────────────────────────────────────────────
// Основные структуры данных
// ─────────────────────────────────────────────────────────────

const functionDefinitions = new Map(); // name -> { file, lineCount, complexity }
const eventUsage = new Set();
const fileStats = new Map(); // filePath -> { lines, bytes, type }

// ─────────────────────────────────────────────────────────────
// Анализ файлов
// ─────────────────────────────────────────────────────────────

function analyzeFile(filePath, options) {
    const content = getFileContent(filePath);
    if (!content) return;

    const fullPath = path.join(projectRoot, filePath);
    const stats = fs.statSync(fullPath);
    const lines = content.split('\n').length;

    fileStats.set(filePath, {
        lines,
        bytes: stats.size,
        type: path.extname(filePath)
    });

    if (options.verbose) {
        console.log(`Analyzing: ${filePath} (${lines} lines)`);
    }

    if (filePath.endsWith('.html')) {
        // Извлечение inline event handlers
        const inlineEventRegex = new RegExp(PATTERNS.inlineEvent.source, 'gi');
        let match;
        while ((match = inlineEventRegex.exec(content)) !== null) {
            eventUsage.add(match[1]);
        }

        // Анализ inline scripts
        const scriptRegex = new RegExp(PATTERNS.scriptTag.source, 'gi');
        while ((match = scriptRegex.exec(content)) !== null) {
            analyzeJsContent(match[1], filePath, functionDefinitions, eventUsage, options);
        }
    } else {
        analyzeJsContent(content, filePath, functionDefinitions, eventUsage, options);
    }
}

// ─────────────────────────────────────────────────────────────
// Главная функция
// ─────────────────────────────────────────────────────────────

function main() {
    const options = parseArgs();

    if (options.help) {
        showHelp();
        return;
    }

    console.log('═══════════════════════════════════════════════════════════');
    console.log('  Project Function Analyzer');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`Options: format=${options.format}, min-lines=${options.minLines}, verbose=${options.verbose}`);
    console.log('');

    // Шаг 1: Анализ файлов
    console.log('📁 Analyzing files...');
    filesToAnalyze.forEach(file => analyzeFile(file, options));
    console.log(`   Found ${functionDefinitions.size} function definitions.`);

    // Шаг 2: Построение графа вызовов
    console.log('🔗 Building call graph...');
    const callGraph = buildCallGraph(filesToAnalyze, projectRoot, functionDefinitions, getFileContent, options);
    console.log(`   Found ${callGraph.size} callers with outgoing calls.`);

    // Шаг 3: Построение графа импортов
    console.log('📦 Building import graph...');
    const { importGraph, allImports } = buildImportGraph(filesToAnalyze, projectRoot, getFileContent, extractImports);
    console.log(`   Found ${allImports.length} imports across ${importGraph.size} files.`);

    // Шаг 4: Поиск корней и неиспользуемых функций
    console.log('🔍 Finding roots and unused functions...');
    const { roots, unused } = findRootsAndUnused(
        functionDefinitions, callGraph, eventUsage,
        filesToAnalyze, projectRoot, getFileContent
    );
    console.log(`   Found ${roots.length} root functions, ${unused.length} potentially unused.`);

    // Шаг 5: Подготовка данных для отчёта
    const reportData = {
        fileStats,
        functionDefinitions,
        callGraph,
        importGraph,
        roots,
        unused,
        projectRoot,
        options
    };

    // Шаг 6: Генерация отчётов
    console.log('');

    if (options.format === 'md' || options.format === 'both') {
        const markdownContent = generateMarkdownReport(reportData);
        const mdOutput = options.format === 'both' ? options.output : options.output;
        fs.writeFileSync(path.join(projectRoot, mdOutput), markdownContent);
        console.log(`📝 Markdown report saved to: ${mdOutput}`);
    }

    if (options.format === 'json' || options.format === 'both') {
        const jsonContent = generateJsonReport(reportData);
        const jsonOutput = options.format === 'both'
            ? options.output.replace(/\.md$/, '.json')
            : options.output.replace(/\.md$/, '.json');
        fs.writeFileSync(path.join(projectRoot, jsonOutput), JSON.stringify(jsonContent, null, 2));
        console.log(`📊 JSON report saved to: ${jsonOutput}`);
    }

    // Шаг 7: Вывод сводки
    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  Summary');
    console.log('═══════════════════════════════════════════════════════════');

    let totalLines = 0, totalBytes = 0;
    for (const stats of fileStats.values()) {
        totalLines += stats.lines;
        totalBytes += stats.bytes;
    }

    const largeFilesCount = [...fileStats.values()].filter(s => s.lines >= 300 || s.bytes >= 10240).length;
    const largeFunctionsCount = [...functionDefinitions.values()].filter(d => d.lineCount >= options.minLines).length;
    const highComplexityCount = [...functionDefinitions.values()].filter(d => d.complexity >= 10).length;

    console.log(`  📁 Files analyzed:        ${fileStats.size}`);
    console.log(`  📝 Total lines:           ${totalLines.toLocaleString()}`);
    console.log(`  💾 Total size:            ${(totalBytes / 1024).toFixed(1)} KB`);
    console.log(`  ⚠️  Large files (300+):    ${largeFilesCount}`);
    console.log(`  📏 Large functions (${options.minLines}+): ${largeFunctionsCount}`);
    console.log(`  🔴 High complexity (10+): ${highComplexityCount}`);
    console.log(`  🔗 Root functions:        ${roots.length}`);
    console.log(`  ❓ Potentially unused:    ${unused.length}`);
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
}

main();