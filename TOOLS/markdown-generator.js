/**
 * markdown-generator.js
 * Generates Markdown reports for code analysis.
 */

const path = require('path');

/**
 * Recursively prints the call tree buffer
 */
function printTreeBuffer(name, callGraph, functionDefinitions, depth = 0, visited = new Set()) {
    let output = '';
    const isCircular = visited.has(name);
    const def = functionDefinitions.get(name);
    const fileInfo = def ? ` [${def.file}]` : '';
    const lineInfo = def?.lineCount ? ` (${def.lineCount} lines)` : '';
    const complexityInfo = def?.complexity ? ` [C:${def.complexity}]` : '';

    const prefix = '  '.repeat(depth) + (depth === 0 ? 'root: ' : 'calls: ');
    const suffix = isCircular ? ' (circular)' : '';

    output += prefix + name + fileInfo + lineInfo + complexityInfo + suffix + '\n';

    if (isCircular) return output;
    visited.add(name);

    const calls = callGraph.get(name);
    if (calls) {
        for (const callee of calls) {
            output += printTreeBuffer(callee, callGraph, functionDefinitions, depth + 1, new Set(visited));
        }
    }

    return output;
}

/**
 * Generate Markdown report
 */
function generateMarkdownReport(data) {
    const {
        fileStats,
        functionDefinitions,
        callGraph,
        importGraph,
        roots,
        unused,
        projectRoot,
        options
    } = data;

    const minLines = options.minLines || 50;

    let content = '# Project Function Analysis\n\n';
    content += `Generated on: ${new Date().toISOString()}\n\n`;

    // File Statistics
    content += '## File Statistics\n';
    content += '> [!NOTE]\n> Files with 300+ lines or 10KB+ size may benefit from splitting into smaller modules.\n\n';

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

    largeFiles.sort((a, b) => b.lines - a.lines);

    content += `**Total:** ${totalStats.files} files, ${totalStats.lines.toLocaleString()} lines, ${(totalStats.bytes / 1024).toFixed(1)} KB\n\n`;

    if (largeFiles.length > 0) {
        content += '### Large Files (300+ lines or 10KB+)\n\n';
        content += '| Lines | Size | File |\n';
        content += '|------:|-----:|------|\n';
        largeFiles.forEach(f => {
            const sizeKB = (f.bytes / 1024).toFixed(1);
            const shortPath = f.path.replace(/\\/g, '/');
            content += `| ${f.lines} | ${sizeKB} KB | \`${shortPath}\` |\n`;
        });
        content += '\n';
    }

    // Breakdown by File Type
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

    content += '### Breakdown by File Type\n\n';
    content += '| Type | Files | Lines | Size |\n';
    content += '|------|------:|------:|-----:|\n';

    const sortedTypes = Array.from(typeStats.entries()).sort((a, b) => b[1].lines - a[1].lines);
    sortedTypes.forEach(([type, stats]) => {
        const sizeKB = (stats.bytes / 1024).toFixed(1);
        content += `| ${type} | ${stats.count} | ${stats.lines.toLocaleString()} | ${sizeKB} KB |\n`;
    });
    content += '\n---\n\n';

    // Import Graph
    if (importGraph && importGraph.size > 0) {
        content += '## Import Graph\n';
        content += '> [!TIP]\n> Shows dependencies between files. Useful for understanding module coupling.\n\n';

        for (const [file, imports] of importGraph) {
            if (imports.length === 0) continue;
            const shortFile = file.replace(/\\/g, '/').split('/').slice(-2).join('/');
            content += `### ${shortFile}\n`;

            imports.forEach(imp => {
                const typeIcon = imp.type === 'commonjs' ? '📦' : '🔷';
                content += `- ${typeIcon} \`${imp.module}\` → ${imp.names.map(n => `\`${n}\``).join(', ')}\n`;
            });
            content += '\n';
        }
        content += '---\n\n';
    }

    // Entry Points
    content += '## Entry Points / Root Functions\n';
    roots.forEach(root => {
        content += printTreeBuffer(root, callGraph, functionDefinitions);
        content += '---\n';
    });

    // Unused Functions
    content += '\n## Potentially Unused Functions\n';
    content += '> [!WARNING]\n> These functions are defined but not called within the analyzed files. Verify if they are used dynamically or in external systems before deleting.\n\n';

    unused.forEach(u => {
        const lineInfo = u.lineCount ? ` (${u.lineCount} lines)` : '';
        const complexityInfo = u.complexity ? ` [C:${u.complexity}]` : '';
        content += `- \`${u.name}\`${lineInfo}${complexityInfo} ([${path.basename(u.file)}](file://${path.join(projectRoot, u.file)}))\n`;
    });

    // Large Functions
    content += `\n## Large Functions (${minLines}+ lines)\n`;
    content += '> [!NOTE]\n> Functions with high line counts may benefit from refactoring into smaller pieces.\n\n';

    const largeFunctions = [];
    for (const [name, def] of functionDefinitions) {
        if (def.lineCount && def.lineCount >= minLines) {
            largeFunctions.push({ name, file: def.file, lineCount: def.lineCount, complexity: def.complexity });
        }
    }
    largeFunctions.sort((a, b) => b.lineCount - a.lineCount);

    if (largeFunctions.length === 0) {
        content += `_No functions with ${minLines}+ lines found._\n`;
    } else {
        content += '| Lines | Complexity | Function | File |\n';
        content += '|------:|-----------:|----------|------|\n';
        largeFunctions.forEach(f => {
            const shortFile = f.file.replace(/\\/g, '/').split('/').slice(-2).join('/');
            const complexity = f.complexity || '-';
            content += `| ${f.lineCount} | ${complexity} | \`${f.name}\` | ${shortFile} |\n`;
        });
    }

    // High Complexity Functions
    const highComplexity = [];
    for (const [name, def] of functionDefinitions) {
        if (def.complexity && def.complexity >= 10) {
            highComplexity.push({ name, file: def.file, lineCount: def.lineCount, complexity: def.complexity });
        }
    }

    if (highComplexity.length > 0) {
        highComplexity.sort((a, b) => b.complexity - a.complexity);

        content += '\n## High Complexity Functions (10+)\n';
        content += '> [!CAUTION]\n> Functions with cyclomatic complexity ≥10 are harder to test and maintain.\n\n';
        content += '| Complexity | Lines | Function | File |\n';
        content += '|-----------:|------:|----------|------|\n';
        highComplexity.forEach(f => {
            const shortFile = f.file.replace(/\\/g, '/').split('/').slice(-2).join('/');
            content += `| ${f.complexity} | ${f.lineCount || '-'} | \`${f.name}\` | ${shortFile} |\n`;
        });
    }

    return content;
}

module.exports = {
    printTreeBuffer,
    generateMarkdownReport
};
