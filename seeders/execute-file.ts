import { exec, ExecException } from 'child_process';
import { config } from 'dotenv';
import { prompt } from 'enquirer';

import { logger } from '~/utils/logger';

config();

const executeFile = async () => {
  try {
    const response = (await prompt({
      type: 'input',
      name: 'filename',
      message: 'Enter the seeder file name to execute:',
      required: true,
    })) as { filename: string };

    const { error, stderr, stdout } = await executeChildProcess(
      response.filename,
    );

    if (error || stderr) {
      console.log('error', { error, message: error?.message, stderr });
      if (error) throw error;
      if (stderr) throw stderr;
    }
    logger.info((stdout || '').split(`\n`).join(''));
    process.exit(0);
  } catch (error) {
    logger.error('An error occurred:', error);
    process.exit(1);
  }
};

const executeChildProcess = async (
  filename: string,
): Promise<{ error: ExecException | null; stdout: string; stderr: string }> => {
  const filePath = `./seeders/files/${filename}`;

  return new Promise((resolve) => {
    exec(
      `node -r tsconfig-paths/register -r ts-node/register ${filePath}`,
      (error: ExecException | null, stdout: string, stderr: string) => {
        resolve({ error, stdout, stderr });
      },
    );
  });
};

executeFile();
