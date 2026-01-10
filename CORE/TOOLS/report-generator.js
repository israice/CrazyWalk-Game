/**
 * report-generator.js - Модуль генерации отчётов
 * Entry point for report generation modules
 */

const { generateMarkdownReport, printTreeBuffer } = require('./markdown-generator');
const { generateJsonReport } = require('./json-generator');

module.exports = {
    printTreeBuffer,
    generateMarkdownReport,
    generateJsonReport
};
