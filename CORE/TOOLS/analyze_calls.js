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
    'src/services/mapGenerator.js',
    'src/services/nominatim.service.js',
    'src/services/redis.js',
    'src/services/redis.service.js',
    'src/utils/geometry.js',
    'server.js'
];

const functionDefinitions = new Map(); // name -> { file, type }
const callGraph = new Map(); // callerName -> Set(calleeNames)
const eventUsage = new Set();

function analyzeJsContent(content, filePath) {
    // 1. Find Definitions
    const funcRegex = /(?:async\s+)?function\s+([a-zA-Z0-9_$]+)\s*\(/g;
    let match;
    while ((match = funcRegex.exec(content)) !== null) {
        functionDefinitions.set(match[1], { file: filePath });
    }
    const varFuncRegex = /(?:const|let|var|window\.)\s*([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?(?:function|\([^)]*\)\s*=>)/g;
    while ((match = varFuncRegex.exec(content)) !== null) {
        functionDefinitions.set(match[1], { file: filePath });
    }
    const methodRegex = /^\s*([a-zA-Z0-9_$]+)\s*\([^)]*\)\s*\{/gm;
    while ((match = methodRegex.exec(content)) !== null) {
        if (!['if', 'for', 'while', 'switch', 'catch', 'let', 'const', 'var'].includes(match[1])) {
            functionDefinitions.set(match[1], { file: filePath });
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
    const line = '  '.repeat(depth) + (depth === 0 ? 'root: ' : 'calls: ') + name + (functionDefinitions.has(name) ? ` [${functionDefinitions.get(name).file}]` : '') + (isCircular ? ' (circular)' : '');
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
        unused.push({ name, file: def.file });
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
    finalContent += `- \`${u.name}\` ([${path.basename(u.file)}](file://${path.join(projectRoot, u.file)}))\n`;
});

fs.writeFileSync(path.join(projectRoot, 'CALL_TREE.md'), finalContent);
console.log('Analysis saved to CALL_TREE.md');
