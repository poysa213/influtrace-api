import fs from 'fs';
import path from 'path';

const resolveStoragePath = (storagePath?: string) => {
  if (storagePath !== undefined) return storagePath;
  return path.resolve(__dirname, '../storage');
};

const resolveFilePath = (filePath: string, storagePath?: string) => {
  storagePath = resolveStoragePath(storagePath);
  return path.join(storagePath, filePath).split('\\').join('/');
};

export const isFileExists = (filePath: string, storagePath?: string) => {
  try {
    filePath = resolveFilePath(filePath, storagePath);
    fs.accessSync(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

export const createFileRecursively = (
  filePath: string,
  storagePath?: string,
): string => {
  try {
    filePath = resolveFilePath(filePath, storagePath);

    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, '');

    return filePath;
  } catch {
    return '';
  }
};

export const createFileIfNotExists = (
  filePath: string,
  storagePath?: string,
): string => {
  try {
    const fileExists = isFileExists(filePath, storagePath);
    if (fileExists) return resolveFilePath(filePath, storagePath);
    return createFileRecursively(filePath, storagePath);
  } catch {
    return '';
  }
};

export const removeFile = (filePath: string, storagePath?: string) => {
  try {
    const deletePath = resolveFilePath(filePath, storagePath);

    const fileExists = isFileExists(deletePath);
    if (!fileExists) return true;

    fs.unlinkSync(deletePath);
    return true;
  } catch {
    return false;
  }
};
