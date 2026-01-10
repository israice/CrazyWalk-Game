/**
 * cli-handler.js
 * Handles command line argument parsing and usage information.
 */

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

module.exports = {
    parseArgs,
    showHelp
};
