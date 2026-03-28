/**
 * call-graph.js - Модуль построения графа вызовов
 * Анализ зависимостей между функциями и файлами
 */

const path = require('path');

/**
 * Построение графа вызовов функций
 * @param {Array} filesToAnalyze - список файлов для анализа
 * @param {string} projectRoot - корневая директория проекта
 * @param {Map} functionDefinitions - определения функций
 * @param {Function} getFileContent - функция получения содержимого файла
 * @param {Object} options - опции
 * @returns {Map} граф вызовов caller -> Set(callees)
 */
function buildCallGraph(filesToAnalyze, projectRoot, functionDefinitions, getFileContent, options = {}) {
    const callGraph = new Map();
    const verbose = options.verbose || false;

    filesToAnalyze.forEach(filePath => {
        const content = getFileContent(filePath);
        if (!content) return;

        let blocks = filePath.endsWith('.html') ? [] : [content];
        if (filePath.endsWith('.html')) {
            const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
            let m;
            while ((m = scriptRegex.exec(content))) blocks.push(m[1]);
        }

        blocks.forEach(block => {
            const lines = block.split('\n');
            let currentCaller = 'global';
            let braceCount = 0;
            let functionStack = [];

            lines.forEach(line => {
                // Определение функции
                const defMatch = line.match(/(?:async\s+)?function\s+([a-zA-Z0-9_$]+)/) ||
                    line.match(/(?:const|let|var|window\.)\s*([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?(?:function|\([^)]*\)\s*=>)/) ||
                    line.match(/^\s*([a-zA-Z0-9_$]+)\s*\([^)]*\)\s*\{/);

                if (defMatch) {
                    const name = defMatch[1];
                    if (!['if', 'for', 'while', 'switch', 'catch', 'let', 'const', 'var'].includes(name)) {
                        functionStack.push({ name, startBraceCount: braceCount });
                        currentCaller = name;
                    }
                }

                // Подсчёт фигурных скобок
                braceCount += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;

                // Поиск вызовов известных функций
                for (const [knownFunc] of functionDefinitions) {
                    const callRegex = new RegExp(`\\b${knownFunc}\\s*\\(`, 'g');
                    if (callRegex.test(line) && knownFunc !== currentCaller && !line.includes('function ' + knownFunc)) {
                        if (!callGraph.has(currentCaller)) callGraph.set(currentCaller, new Set());
                        callGraph.get(currentCaller).add(knownFunc);
                        if (verbose) console.log(`  ${currentCaller} -> ${knownFunc}`);
                    }
                }

                // Выход из функции
                while (functionStack.length > 0 &&
                    braceCount <= functionStack[functionStack.length - 1].startBraceCount &&
                    !line.includes('{')) {
                    functionStack.pop();
                    currentCaller = functionStack.length > 0 ? functionStack[functionStack.length - 1].name : 'global';
                }
            });
        });
    });

    return callGraph;
}

/**
 * Построение графа зависимостей между файлами
 * @param {Array} filesToAnalyze - список файлов
 * @param {string} projectRoot - корневая директория
 * @param {Function} getFileContent - функция получения содержимого
 * @param {Function} extractImports - функция извлечения импортов
 * @returns {Object} { importGraph: Map, allImports: Array }
 */
function buildImportGraph(filesToAnalyze, projectRoot, getFileContent, extractImports) {
    const importGraph = new Map(); // file -> [{module, type, names}]
    const allImports = [];

    filesToAnalyze.forEach(filePath => {
        const content = getFileContent(filePath);
        if (!content) return;

        const imports = extractImports(content, filePath);
        if (imports.length > 0) {
            importGraph.set(filePath, imports);
            allImports.push(...imports);
        }
    });

    return { importGraph, allImports };
}

/**
 * Поиск корневых функций и неиспользуемых функций
 * @param {Map} functionDefinitions - определения функций
 * @param {Map} callGraph - граф вызовов
 * @param {Set} eventUsage - обработчики событий
 * @param {Array} filesToAnalyze - файлы для анализа
 * @param {string} projectRoot - корень проекта
 * @param {Function} getFileContent - функция получения содержимого
 * @returns {Object} { roots: Array, unused: Array }
 */
function findRootsAndUnused(functionDefinitions, callGraph, eventUsage, filesToAnalyze, projectRoot, getFileContent) {
    const entryPointNames = ['initializeGame', 'loadGameData', 'handle_game_data', 'login', 'main', 'init', 'start'];

    // Все вызываемые функции
    const allCallees = new Set();
    for (const callees of callGraph.values()) {
        for (const callee of callees) allCallees.add(callee);
    }

    const roots = [];
    const unused = [];

    for (const [name, def] of functionDefinitions) {
        const isCalled = allCallees.has(name);
        const isEvent = eventUsage.has(name);
        const isEntryPoint = entryPointNames.includes(name);

        // Проверка использования в других файлах
        let isUsedInOtherFiles = false;
        filesToAnalyze.forEach(filePath => {
            if (filePath === def.file) return;
            const content = getFileContent(filePath);
            if (content && content.includes(name)) {
                isUsedInOtherFiles = true;
            }
        });

        if (!isUsedInOtherFiles && !isCalled && !isEvent && !isEntryPoint) {
            unused.push({ name, file: def.file, lineCount: def.lineCount, complexity: def.complexity });
        } else if (!isCalled) {
            roots.push(name);
        }
    }

    // Сортировка корней по количеству вызовов
    roots.sort((a, b) => (callGraph.get(b)?.size || 0) - (callGraph.get(a)?.size || 0));

    // Сортировка неиспользуемых по файлу
    unused.sort((a, b) => a.file.localeCompare(b.file));

    return { roots, unused };
}

module.exports = {
    buildCallGraph,
    buildImportGraph,
    findRootsAndUnused
};
