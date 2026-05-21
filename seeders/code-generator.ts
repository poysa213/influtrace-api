import crypto from 'crypto';
import { config } from 'dotenv';

import { logger } from '~/utils/logger';

config();

// Get the desired length from command-line arguments
const length = parseInt(process.argv[2]);

if (isNaN(length) || length <= 0) {
  logger.error('Please provide a valid length.');
  process.exit(1);
}

// Generate a random string of the desired length
const generateHash = () => {
  return crypto
    .randomBytes(Math.ceil(length / 2))
    .toString('hex')
    .slice(0, length);
};

// Output the hashed string
const hashedString = generateHash();
logger.info(hashedString);
