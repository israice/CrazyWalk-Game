/**
 * json-generator.js
 * Generates JSON reports for code analysis.
 */

/**
 * Generate JSON report
 */
function generateJsonReport(data) {
    const {
        fileStats,
        functionDefinitions,
        callGraph,
        importGraph,
        roots,
        unused,
        options
    } = data;

    // File Statistics
    const files = [];
    let totalLines = 0, totalBytes = 0;

    for (const [filePath, stats] of fileStats) {
        files.push({ path: filePath, ...stats });
        totalLines += stats.lines;
        totalBytes += stats.bytes;
    }

    // Functions
    const functions = [];
    for (const [name, def] of functionDefinitions) {
        functions.push({
            name,
            file: def.file,
            lines: def.lineCount,
            complexity: def.complexity || 1
        });
    }

    // Call Graph
    const calls = {};
    for (const [caller, callees] of callGraph) {
        calls[caller] = [...callees];
    }

    // Import Graph
    const imports = {};
    if (importGraph) {
        for (const [file, imps] of importGraph) {
            imports[file] = imps;
        }
    }

    return {
        meta: {
            generatedAt: new Date().toISOString(),
            options
        },
        summary: {
            totalFiles: files.length,
            totalLines,
            totalBytes,
            totalFunctions: functions.length,
            rootFunctions: roots.length,
            unusedFunctions: unused.length
        },
        files,
        functions,
        callGraph: calls,
        importGraph: imports,
        roots,
        unused
    };
}

module.exports = {
    generateJsonReport
};
