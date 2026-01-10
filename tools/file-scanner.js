/**
 * file-scanner.js
 * Scans directories to find files for analysis.
 */

const fs = require('fs');
const path = require('path');

// Configuration
const EXCLUDED_DIRS = [
    'node_modules',
    '.git',
    'dist',
    'build',
    'coverage',
    '.agent',
    'CORE/TOOLS'  // Exclude the tool itself
];

const INCLUDED_EXTENSIONS = ['.js', '.html'];

/**
 * Recursively scans a directory and returns all matching files
 * @param {string} projectRoot - The absolute path to the project root
 * @param {string} dir - The directory name to scan (relative to relativePath)
 * @param {string} relativePath - The current relative path from projectRoot
 * @returns {string[]} Array of relative file paths
 */
function scanDirectory(projectRoot, dir, relativePath = '') {
    const files = [];
    const fullPath = path.join(projectRoot, relativePath, dir);

    if (!fs.existsSync(fullPath)) return files;

    const entries = fs.readdirSync(fullPath, { withFileTypes: true });

    for (const entry of entries) {
        const entryRelativePath = path.join(relativePath, dir, entry.name);

        if (entry.isDirectory()) {
            // Skip excluded directories
            if (EXCLUDED_DIRS.some(excluded => entryRelativePath.includes(excluded))) {
                continue;
            }
            files.push(...scanDirectory(projectRoot, '', entryRelativePath));
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
 * Get all project files that should be analyzed
 * @param {string} projectRoot - The absolute path to the project root
 * @returns {string[]} Array of relative file paths
 */
function getFilesToAnalyze(projectRoot) {
    const files = [];

    // Scan root directories
    const rootEntries = fs.readdirSync(projectRoot, { withFileTypes: true });

    for (const entry of rootEntries) {
        if (entry.isDirectory()) {
            if (EXCLUDED_DIRS.includes(entry.name)) continue;
            files.push(...scanDirectory(projectRoot, entry.name));
        } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (INCLUDED_EXTENSIONS.includes(ext)) {
                files.push(entry.name);
            }
        }
    }

    return files;
}

module.exports = {
    getFilesToAnalyze
};
