const fs = require('fs');
const path = require('path');

const projectRoot = 'c:\\0_PROJECTS\\CrazyWalk-Game';
const filesToAnalyze = [
    'CORE/FRONTEND/A_home_page/index.html',
    'CORE/FRONTEND/A_home_page/login.html',
    'CORE/FRONTEND/B_map_page/components/map_controls.js',
    'CORE/FRONTEND/B_map_page/components/top_bar.html',
    'CORE/FRONTEND/B_map_page/index.html',
    'CORE/FRONTEND/index.html',
    'src/config/constants.js',
    'src/config/index.js',
    'src/controllers/authController.js',
    'src/controllers/gameController.js',
    'src/controllers/index.js',
    'src/controllers/locationController.js',
    'src/controllers/sessionController.js',
    'src/middleware/asyncHandler.js',
    'src/middleware/errorHandler.js',
    'src/middleware/index.js',
    'src/middleware/requestLogger.js',
    'src/public/js/game-api.js',
    'src/public/js/map-logic.js',
    'src/routes/api.js',
    'src/routes/api.routes.js',
    'src/routes/auth.js',
    'src/routes/auth.routes.js',
    'src/routes/index.js',
    'src/services/map/graphBuilder.js',
    'src/services/map/groupCreator.js',
    'src/services/map/index.js',
    'src/services/map/intersectionFinder.js',
    'src/services/map/polygonFinder.js',
    'src/services/map/roadFetcher.js',
    'src/services/nominatim.service.js',
    'src/services/redis.js',
    'src/services/redis.service.js',
    'src/utils/geometry.js',
    'server.js'
];

const functionDefinitions = new Map(); // name -> { file, lineCount }
const callGraph = new Map(); // callerName -> Set(calleeNames)
const eventUsage = new Set();
const fileStats = new Map(); // filePath -> { lines, bytes }

// Helper: count lines of a function starting at given position
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

function analyzeJsContent(content, filePath) {
    // 1. Find Definitions
    const funcRegex = /(?:async\s+)?function\s+([a-zA-Z0-9_$]+)\s*\(/g;
    let match;
    while ((match = funcRegex.exec(content)) !== null) {
        const lineCount = countFunctionLines(content, match.index);
        functionDefinitions.set(match[1], { file: filePath, lineCount });
    }
    // Arrow functions: const name = () => { or const name = async () => {
    const varFuncRegex = /(?:const|let|var|window\.)\s*([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?(?:function|\([^)]*\)\s*=>|\w+\s*=>)/g;
    while ((match = varFuncRegex.exec(content)) !== null) {
        const lineCount = countFunctionLines(content, match.index);
        functionDefinitions.set(match[1], { file: filePath, lineCount });
    }
    const methodRegex = /^\s*([a-zA-Z0-9_$]+)\s*\([^)]*\)\s*\{/gm;
    while ((match = methodRegex.exec(content)) !== null) {
        if (!['if', 'for', 'while', 'switch', 'catch', 'let', 'const', 'var'].includes(match[1])) {
            const lineCount = countFunctionLines(content, match.index);
            functionDefinitions.set(match[1], { file: filePath, lineCount });
        }
    }

    // 2. Find Event Listeners / Callbacks
    const listenerRegex = /\.addEventListener\s*\(\s*['"][^'"]+['"]\s*,\s*([a-zA-Z0-9_$]+)/g;
    while ((match = listenerRegex.exec(content)) !== null) {
        eventUsage.add(match[1]);
    }
    const assignListenerRegex = /\.on[a-z]+\s*=\s*([a-zA-Z0-9_$]+)/g;
    while ((match = assignListenerRegex.exec(content)) !== null) {
        eventUsage.add(match[1]);
    }
    const timerRegex = /set(?:Timeout|Interval)\s*\(\s*([a-zA-Z0-9_$]+)/g;
    while ((match = timerRegex.exec(content)) !== null) {
        eventUsage.add(match[1]);
    }
}

function analyzeFile(filePath) {
    const fullPath = path.join(projectRoot, filePath);
    if (!fs.existsSync(fullPath)) return;
    let content = fs.readFileSync(fullPath, 'utf8');

    // Collect file statistics
    const stats = fs.statSync(fullPath);
    const lines = content.split('\n').length;
    fileStats.set(filePath, {
        lines,
        bytes: stats.size,
        type: path.extname(filePath)
    });

    if (filePath.endsWith('.html')) {
        const inlineEventRegex = /\s+on[a-z]+\s*=\s*['"]\s*([a-zA-Z0-9_$]+)\s*(?:\([^'"]*\))?\s*['"]/gi;
        let match;
        while ((match = inlineEventRegex.exec(content)) !== null) {
            eventUsage.add(match[1]);
        }
        const scriptRegex = /<script.*?>([\s\S]*?)<\/script>/gi;
        while ((match = scriptRegex.exec(content)) !== null) {
            analyzeJsContent(match[1], filePath);
        }
    } else {
        analyzeJsContent(content, filePath);
    }
}

function buildCallGraph() {
    filesToAnalyze.forEach(filePath => {
        const fullPath = path.join(projectRoot, filePath);
        if (!fs.existsSync(fullPath)) return;
        let content = fs.readFileSync(fullPath, 'utf8');
        let blocks = filePath.endsWith('.html') ? [] : [content];
        if (filePath.endsWith('.html')) {
            const scriptRegex = /<script.*?>([\s\S]*?)<\/script>/gi;
            let m; while ((m = scriptRegex.exec(content))) blocks.push(m[1]);
        }
        blocks.forEach(block => {
            const lines = block.split('\n');
            let currentCaller = 'global';
            let braceCount = 0;
            let functionStack = [];
            lines.forEach(line => {
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
                braceCount += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
                for (const [knownFunc] of functionDefinitions) {
                    const callRegex = new RegExp(`\\b${knownFunc}\\s*\\(`, 'g');
                    if (callRegex.test(line) && knownFunc !== currentCaller && !line.includes('function ' + knownFunc)) {
                        if (!callGraph.has(currentCaller)) callGraph.set(currentCaller, new Set());
                        callGraph.get(currentCaller).add(knownFunc);
                    }
                }
                while (functionStack.length > 0 && braceCount <= functionStack[functionStack.length - 1].startBraceCount && !line.includes('{')) {
                    functionStack.pop();
                    currentCaller = functionStack.length > 0 ? functionStack[functionStack.length - 1].name : 'global';
                }
            });
        });
    });
}

let output = '';
function printTreeBuffer(name, depth = 0, visited = new Set()) {
    const isCircular = visited.has(name);
    const def = functionDefinitions.get(name);
    const fileInfo = def ? ` [${def.file}]` : '';
    const lineInfo = def && def.lineCount ? ` (${def.lineCount} lines)` : '';
    const line = '  '.repeat(depth) + (depth === 0 ? 'root: ' : 'calls: ') + name + fileInfo + lineInfo + (isCircular ? ' (circular)' : '');
    output += line + '\n';
    if (isCircular) return;
    visited.add(name);
    const calls = callGraph.get(name);
    if (calls) for (const callee of calls) printTreeBuffer(callee, depth + 1, new Set(visited));
}

console.log('Analyzing files...');
filesToAnalyze.forEach(analyzeFile);
console.log(`Found ${functionDefinitions.size} function definitions.`);
console.log('Building call graph...');
buildCallGraph();

let finalContent = '# Project Function Analysis\n\nGenerated on: ' + new Date().toISOString() + '\n\n';

// Add File Size Statistics section
finalContent += '## File Statistics\n';
finalContent += '> [!INFO]\n> Files with 300+ lines or 10KB+ size may benefit from splitting into smaller modules.\n\n';

const largeFiles = [];
const totalStats = { files: 0, lines: 0, bytes: 0 };

for (const [filePath, stats] of fileStats) {
    totalStats.files++;
    totalStats.lines += stats.lines;
    totalStats.bytes += stats.bytes;

    if (stats.lines >= 300 || stats.bytes >= 10240) {
        largeFiles.push({ path: filePath, ...stats });
    }
}

// Sort by lines descending
largeFiles.sort((a, b) => b.lines - a.lines);

finalContent += `**Total:** ${totalStats.files} files, ${totalStats.lines.toLocaleString()} lines, ${(totalStats.bytes / 1024).toFixed(1)} KB\n\n`;

if (largeFiles.length === 0) {
    finalContent += '_No large files found._\n\n';
} else {
    finalContent += '### Large Files (300+ lines or 10KB+)\n\n';
    finalContent += '| Lines | Size | File |\n';
    finalContent += '|------:|-----:|------|\n';
    largeFiles.forEach(f => {
        const sizeKB = (f.bytes / 1024).toFixed(1);
        const shortPath = f.path.replace(/\\/g, '/');
        finalContent += `| ${f.lines} | ${sizeKB} KB | \`${shortPath}\` |\n`;
    });
    finalContent += '\n';
}

// File type breakdown
const typeStats = new Map();
for (const [filePath, stats] of fileStats) {
    const type = stats.type || 'no extension';
    if (!typeStats.has(type)) {
        typeStats.set(type, { count: 0, lines: 0, bytes: 0 });
    }
    const tStats = typeStats.get(type);
    tStats.count++;
    tStats.lines += stats.lines;
    tStats.bytes += stats.bytes;
}

finalContent += '### Breakdown by File Type\n\n';
finalContent += '| Type | Files | Lines | Size |\n';
finalContent += '|------|------:|------:|-----:|\n';

const sortedTypes = Array.from(typeStats.entries()).sort((a, b) => b[1].lines - a[1].lines);
sortedTypes.forEach(([type, stats]) => {
    const sizeKB = (stats.bytes / 1024).toFixed(1);
    finalContent += `| ${type} | ${stats.count} | ${stats.lines.toLocaleString()} | ${sizeKB} KB |\n`;
});
finalContent += '\n---\n\n';

const allCallees = new Set();
for (const callees of callGraph.values()) for (const callee of callees) allCallees.add(callee);

const roots = [];
const unused = [];
const entryPointNames = ['initializeGame', 'loadGameData', 'handle_game_data', 'login'];

// Find appearances in any file (even as strings or properties)
const allWords = new Set();
filesToAnalyze.forEach(filePath => {
    const fullPath = path.join(projectRoot, filePath);
    if (!fs.existsSync(fullPath)) return;
    const content = fs.readFileSync(fullPath, 'utf8');
    const words = content.match(/\b[a-zA-Z0-9_$]+\b/g);
    if (words) words.forEach(w => allWords.add(w));
});

for (const [name, def] of functionDefinitions) {
    const isCalled = allCallees.has(name);
    const isEvent = eventUsage.has(name);
    const isEntryPoint = entryPointNames.includes(name);

    // Heuristic: if the word appears in ANY file other than its definition file, 
    // it's likely used (even if just in a route or string).
    // This is conservative but safer than pure call-stack.
    let isUsedInStrings = false;
    filesToAnalyze.forEach(filePath => {
        if (filePath === def.file) return;
        const fullPath = path.join(projectRoot, filePath);
        if (!fs.existsSync(fullPath)) return;
        const content = fs.readFileSync(fullPath, 'utf8');
        if (content.includes(name)) isUsedInStrings = true;
    });

    if (!isUsedInStrings && !isCalled && !isEvent && !isEntryPoint) {
        unused.push({ name, file: def.file, lineCount: def.lineCount });
    } else if (!isCalled) {
        roots.push(name);
    }
}

finalContent += '## Entry Points / Root Functions\n';
roots.sort((a, b) => (callGraph.get(b)?.size || 0) - (callGraph.get(a)?.size || 0));
roots.forEach(root => {
    output = '';
    printTreeBuffer(root);
    finalContent += output + '---\n';
});

finalContent += '\n## Potentially Unused Functions\n';
finalContent += '> [!WARNING]\n> These functions are defined but not called within the analyzed files. Verify if they are used dynamically or in external systems before deleting.\n\n';
unused.sort((a, b) => a.file.localeCompare(b.file));
unused.forEach(u => {
    const lineInfo = u.lineCount ? ` (${u.lineCount} lines)` : '';
    finalContent += `- \`${u.name}\`${lineInfo} ([${path.basename(u.file)}](file://${path.join(projectRoot, u.file)}))\n`;
});

// Add Large Functions section (sorted by line count)
finalContent += '\n## Large Functions (50+ lines)\n';
finalContent += '> [!NOTE]\n> Functions with 50+ lines may benefit from refactoring into smaller pieces.\n\n';

const largeFunctions = [];
for (const [name, def] of functionDefinitions) {
    if (def.lineCount && def.lineCount >= 50) {
        largeFunctions.push({ name, file: def.file, lineCount: def.lineCount });
    }
}
largeFunctions.sort((a, b) => b.lineCount - a.lineCount);

if (largeFunctions.length === 0) {
    finalContent += '_No functions with 50+ lines found._\n';
} else {
    finalContent += '| Lines | Function | File |\n';
    finalContent += '|------:|----------|------|\n';
    largeFunctions.forEach(f => {
        const shortFile = f.file.replace(/\\/g, '/').split('/').slice(-2).join('/');
        finalContent += `| ${f.lineCount} | \`${f.name}\` | ${shortFile} |\n`;
    });
}

fs.writeFileSync(path.join(projectRoot, 'CALL_TREE.md'), finalContent);
console.log('Analysis saved to CALL_TREE.md');
console.log(`\nSummary:`);
console.log(`- ${totalStats.files} files analyzed`);
console.log(`- ${totalStats.lines.toLocaleString()} total lines`);
console.log(`- ${(totalStats.bytes / 1024).toFixed(1)} KB total size`);
console.log(`- ${largeFiles.length} large files (300+ lines or 10KB+)`);
console.log(`- ${largeFunctions.length} large functions (50+ lines)`);