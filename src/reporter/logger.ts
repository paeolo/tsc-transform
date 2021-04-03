import chalk from 'chalk';
import dateFormat from 'dateformat';

const LogLevel = {
  INFO: 'Info',
  WARNING: 'Warning',
  ERROR: 'Error',
  SUCCESS: 'Success'
};

export class ConsoleLogger {
  getDate() {
    return dateFormat(new Date(), 'HH:MM:ss');
  }

  print(prefix: string, message: string) {
    console.log(
      `${prefix} ${chalk.gray(this.getDate())} ${message}`
    );
  }

  info(message: string) {
    this.print(
      chalk.blue(LogLevel.INFO.concat(':')), message
    );
  }

  warn(message: string) {
    this.print(
      chalk.yellow(LogLevel.WARNING.concat(':')), message
    );
  }

  error(message: string) {
    this.print(
      chalk.red(LogLevel.ERROR.concat(':')), message
    );
  }

  success(message: string) {
    this.print(
      chalk.green(LogLevel.SUCCESS.concat(':')), message
    );
  }
}
