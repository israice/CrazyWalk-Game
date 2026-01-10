/**
 * parsers.js - Модуль парсинга для analyze_calls.js
 * Извлечение определений функций, подсчёт строк и сложности
 */

/**
 * Подсчёт строк функции начиная с заданной позиции
 * @param {string} content - содержимое файла
 * @param {number} startIndex - начальная позиция
 * @returns {number} количество строк функции
 */
function countFunctionLines(content, startIndex) {
    let braceCount = 0;
    let foundFirstBrace = false;
    let lineCount = 1;

    for (let i = startIndex; i < content.length; i++) {
        const char = content[i];
        if (char === '\n') lineCount++;
        if (char === '{') {
            braceCount++;
            foundFirstBrace = true;
        }
        if (char === '}') {
            braceCount--;
            if (foundFirstBrace && braceCount === 0) {
                return lineCount;
            }
        }
    }
    return lineCount;
}

/**
 * Извлечение тела функции для анализа сложности
 * @param {string} content - содержимое файла
 * @param {number} startIndex - начальная позиция
 * @returns {string} тело функции
 */
function extractFunctionBody(content, startIndex) {
    let braceCount = 0;
    let foundFirstBrace = false;
    let bodyStart = startIndex;

    for (let i = startIndex; i < content.length; i++) {
        const char = content[i];
        if (char === '{') {
            if (!foundFirstBrace) bodyStart = i;
            braceCount++;
            foundFirstBrace = true;
        }
        if (char === '}') {
            braceCount--;
            if (foundFirstBrace && braceCount === 0) {
                return content.substring(bodyStart, i + 1);
            }
        }
    }
    return content.substring(bodyStart);
}

/**
 * Вычисление цикломатической сложности функции
 * @param {string} code - тело функции
 * @returns {number} цикломатическая сложность
 */
function calculateComplexity(code) {
    const complexityPatterns = /\b(if|else\s+if|for|while|do|switch|case|catch|&&|\|\||\?(?!:))/g;
    const matches = code.match(complexityPatterns);
    return matches ? matches.length + 1 : 1;
}

/**
 * Регулярные выражения для парсинга
 */
const PATTERNS = {
    // Стандартные функции: function name() или async function name()
    standardFunction: /(?:async\s+)?function\s+([a-zA-Z0-9_$]+)\s*\(/g,

    // Arrow функции: const name = () => или const name = async () =>
    arrowFunction: /(?:const|let|var|window\.)\s*([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?(?:function|(?:\([^)]*\)|[a-zA-Z_$][a-zA-Z0-9_$]*)\s*=>)/g,

    // Методы класса: name() { или async name() {
    classMethod: /^\s*(?:async\s+)?([a-zA-Z0-9_$]+)\s*\([^)]*\)\s*\{/gm,

    // ES6 named imports: import { a, b } from 'module'
    es6NamedImport: /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g,

    // ES6 default imports: import name from 'module'
    es6DefaultImport: /import\s+([a-zA-Z0-9_$]+)\s+from\s*['"]([^'"]+)['"]/g,

    // CommonJS require: require('module')
    commonJsRequire: /(?:const|let|var)\s*(?:\{([^}]+)\}|([a-zA-Z0-9_$]+))\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,

    // Event listeners: addEventListener('event', handler)
    eventListener: /\.addEventListener\s*\(\s*['"][^'"]+['"]\s*,\s*([a-zA-Z0-9_$]+)/g,

    // DOM event handlers: .onclick = handler
    domEventHandler: /\.on[a-z]+\s*=\s*([a-zA-Z0-9_$]+)/g,

    // Timers: setTimeout(handler) or setInterval(handler)
    timerCallback: /set(?:Timeout|Interval)\s*\(\s*([a-zA-Z0-9_$]+)/g,

    // HTML inline events: onclick="handler()"
    inlineEvent: /\s+on[a-z]+\s*=\s*['"]([a-zA-Z0-9_$]+)\s*(?:\([^'"]*\))?['"]/gi,

    // Script tags in HTML
    scriptTag: /<script[^>]*>([\s\S]*?)<\/script>/gi
};

// Ключевые слова, которые нужно исключить
const EXCLUDED_KEYWORDS = ['if', 'for', 'while', 'switch', 'catch', 'let', 'const', 'var', 'return', 'throw', 'new', 'typeof', 'instanceof'];

/**
 * Анализ JavaScript содержимого файла
 * @param {string} content - содержимое файла
 * @param {string} filePath - путь к файлу
 * @param {Map} functionDefinitions - Map для хранения определений
 * @param {Set} eventUsage - Set для хранения обработчиков событий
 * @param {Object} options - опции анализа
 */
function analyzeJsContent(content, filePath, functionDefinitions, eventUsage, options = {}) {
    const verbose = options.verbose || false;

    // 1. Стандартные функции
    let match;
    const funcRegex = new RegExp(PATTERNS.standardFunction.source, 'g');
    while ((match = funcRegex.exec(content)) !== null) {
        const name = match[1];
        const lineCount = countFunctionLines(content, match.index);
        const body = extractFunctionBody(content, match.index);
        const complexity = calculateComplexity(body);
        functionDefinitions.set(name, { file: filePath, lineCount, complexity });
        if (verbose) console.log(`  Found function: ${name} (${lineCount} lines, complexity: ${complexity})`);
    }

    // 2. Arrow функции
    const arrowRegex = new RegExp(PATTERNS.arrowFunction.source, 'g');
    while ((match = arrowRegex.exec(content)) !== null) {
        const name = match[1];
        if (!EXCLUDED_KEYWORDS.includes(name)) {
            const lineCount = countFunctionLines(content, match.index);
            const body = extractFunctionBody(content, match.index);
            const complexity = calculateComplexity(body);
            functionDefinitions.set(name, { file: filePath, lineCount, complexity });
            if (verbose) console.log(`  Found arrow function: ${name} (${lineCount} lines, complexity: ${complexity})`);
        }
    }

    // 3. Методы класса
    const methodRegex = new RegExp(PATTERNS.classMethod.source, 'gm');
    while ((match = methodRegex.exec(content)) !== null) {
        const name = match[1];
        if (!EXCLUDED_KEYWORDS.includes(name) && !functionDefinitions.has(name)) {
            const lineCount = countFunctionLines(content, match.index);
            const body = extractFunctionBody(content, match.index);
            const complexity = calculateComplexity(body);
            functionDefinitions.set(name, { file: filePath, lineCount, complexity });
            if (verbose) console.log(`  Found method: ${name} (${lineCount} lines, complexity: ${complexity})`);
        }
    }

    // 4. Event listeners & callbacks
    const listenerRegex = new RegExp(PATTERNS.eventListener.source, 'g');
    while ((match = listenerRegex.exec(content)) !== null) {
        eventUsage.add(match[1]);
    }

    const domHandlerRegex = new RegExp(PATTERNS.domEventHandler.source, 'g');
    while ((match = domHandlerRegex.exec(content)) !== null) {
        eventUsage.add(match[1]);
    }

    const timerRegex = new RegExp(PATTERNS.timerCallback.source, 'g');
    while ((match = timerRegex.exec(content)) !== null) {
        eventUsage.add(match[1]);
    }
}

/**
 * Извлечение импортов/зависимостей из файла
 * @param {string} content - содержимое файла
 * @param {string} filePath - путь к файлу
 * @returns {Array} массив импортов {type, names, module}
 */
function extractImports(content, filePath) {
    const imports = [];
    let match;

    // ES6 named imports
    const es6NamedRegex = new RegExp(PATTERNS.es6NamedImport.source, 'g');
    while ((match = es6NamedRegex.exec(content)) !== null) {
        const names = match[1].split(',').map(n => n.trim().split(' as ')[0].trim());
        imports.push({ type: 'es6-named', names, module: match[2], file: filePath });
    }

    // ES6 default imports
    const es6DefaultRegex = new RegExp(PATTERNS.es6DefaultImport.source, 'g');
    while ((match = es6DefaultRegex.exec(content)) !== null) {
        imports.push({ type: 'es6-default', names: [match[1]], module: match[2], file: filePath });
    }

    // CommonJS require
    const cjsRegex = new RegExp(PATTERNS.commonJsRequire.source, 'g');
    while ((match = cjsRegex.exec(content)) !== null) {
        const names = match[1]
            ? match[1].split(',').map(n => n.trim().split(':')[0].trim())
            : [match[2]];
        imports.push({ type: 'commonjs', names, module: match[3], file: filePath });
    }

    return imports;
}

module.exports = {
    countFunctionLines,
    extractFunctionBody,
    calculateComplexity,
    analyzeJsContent,
    extractImports,
    PATTERNS,
    EXCLUDED_KEYWORDS
};
