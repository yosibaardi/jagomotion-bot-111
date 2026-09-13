import chalk from "chalk";

export function showBanner() {
    console.log(chalk.bold.cyan("================================="));
    console.log(chalk.bold.green("        JAGOMOTION BOT WA        "));
    console.log(chalk.bold.cyan("================================="));
}

export function logSuccess(text) {
    console.log(chalk.green("[SUCCESS] " + text));
}

export function logInfo(text) {
    console.log(chalk.blue("[INFO] " + text));
}
