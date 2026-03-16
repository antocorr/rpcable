import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

async function pathExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

async function findRpcableSourceRoot(startDir = process.cwd()) {
    let currentDir = startDir;

    while (true) {
        const packageJsonPath = path.join(currentDir, 'package.json');
        if (await pathExists(packageJsonPath)) {
            try {
                const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
                const srcIndexPath = path.join(currentDir, 'src', 'index.js');
                if (packageJson?.name === 'rpcable' && await pathExists(srcIndexPath)) {
                    return srcIndexPath;
                }
            } catch {
                // ignore invalid package.json while walking upwards
            }
        }

        const parentDir = path.dirname(currentDir);
        if (parentDir === currentDir) {
            return null;
        }
        currentDir = parentDir;
    }
}

export async function loadRpcable() {
    const sourceIndexPath = await findRpcableSourceRoot();
    if (sourceIndexPath) {
        return import(pathToFileURL(sourceIndexPath).href);
    }

    return import('rpcable');
}
