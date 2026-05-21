import path from 'path';
import fs from 'fs-extra';

type CopyableDirectory = { src: string; target: string };

const copyableDirectories: CopyableDirectory[] = [
  { src: 'src/storage/app', target: 'dist/src/storage/app' },
  { src: 'src/data', target: 'dist/src/data' },
];

const copyDirectories = async () => {
  try {
    for (const dir of copyableDirectories) {
      const src = path.join(__dirname, dir.src);
      const target = path.join(__dirname, dir.target);

      if (fs.existsSync(src)) {
        await fs.copy(src, target, { overwrite: true });
      }
    }
    console.log('Files copied successfully.');
  } catch (error) {
    console.error('Error during file copying:', error);
  }
};
copyDirectories();
