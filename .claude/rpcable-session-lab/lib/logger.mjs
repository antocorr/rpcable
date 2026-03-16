import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function pad(value) {
    return String(value).padStart(2, '0');
}

function timestampSlug() {
    const now = new Date();
    return [
        now.getUTCFullYear(),
        pad(now.getUTCMonth() + 1),
        pad(now.getUTCDate()),
    ].join('') + '-' + [
        pad(now.getUTCHours()),
        pad(now.getUTCMinutes()),
        pad(now.getUTCSeconds()),
    ].join('');
}

function slugify(value = 'run') {
    return String(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'run';
}

function normalizeValue(value, seen = new WeakSet()) {
    if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }

    if (typeof value === 'bigint') {
        return String(value);
    }

    if (typeof value === 'function') {
        return `[Function ${value.name || 'anonymous'}]`;
    }

    if (value instanceof Error) {
        return {
            name: value.name,
            message: value.message,
            stack: value.stack,
        };
    }

    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
        return value.toString('utf8');
    }

    if (value instanceof Uint8Array) {
        return Buffer.from(value).toString('utf8');
    }

    if (Array.isArray(value)) {
        return value.map((entry) => normalizeValue(entry, seen));
    }

    if (typeof value === 'object') {
        if (seen.has(value)) {
            return '[Circular]';
        }
        seen.add(value);

        const normalized = {};
        for (const [key, entry] of Object.entries(value)) {
            normalized[key] = normalizeValue(entry, seen);
        }

        seen.delete(value);
        return normalized;
    }

    return String(value);
}

export function workspacePath(...segments) {
    return path.join(workspaceRoot, ...segments);
}

export async function createRunLogger({ label = 'run' } = {}) {
    const runId = `${timestampSlug()}-${slugify(label)}`;
    const runDir = workspacePath('logs', runId);
    await fsp.mkdir(runDir, { recursive: true });

    const eventsPath = path.join(runDir, 'events.jsonl');
    const stream = fs.createWriteStream(eventsPath, { flags: 'a' });

    async function write(event, data = {}) {
        const entry = {
            time: new Date().toISOString(),
            event,
            data: normalizeValue(data),
        };

        await new Promise((resolve, reject) => {
            stream.write(`${JSON.stringify(entry)}\n`, (error) => {
                if (error) reject(error);
                else resolve();
            });
        });

        console.log(`[lab:${label}] ${event}`);
        return entry;
    }

    async function writeFile(relativePath, content) {
        const filePath = path.join(runDir, relativePath);
        await fsp.mkdir(path.dirname(filePath), { recursive: true });
        const normalized = typeof content === 'string'
            ? content
            : `${JSON.stringify(normalizeValue(content), null, 2)}\n`;
        await fsp.writeFile(filePath, normalized, 'utf8');
        return filePath;
    }

    async function close() {
        await new Promise((resolve, reject) => {
            stream.end((error) => {
                if (error) reject(error);
                else resolve();
            });
        });
    }

    return {
        label,
        runId,
        runDir,
        eventsPath,
        write,
        writeFile,
        close,
    };
}

function wrapValue(value, pathParts, logger, scope) {
    if (typeof value === 'function') {
        return async function wrappedHandler(...args) {
            const name = pathParts.join('.') || 'anonymous';
            await logger.write(`${scope}:${name}:called`, { args });
            const result = await value.apply(this, args);
            await logger.write(`${scope}:${name}:returned`, { result });
            return result;
        };
    }

    if (Array.isArray(value)) {
        return value.map((entry, index) => wrapValue(entry, pathParts.concat(String(index)), logger, scope));
    }

    if (value && typeof value === 'object') {
        const wrapped = {};
        for (const [key, entry] of Object.entries(value)) {
            wrapped[key] = wrapValue(entry, pathParts.concat(key), logger, scope);
        }
        return wrapped;
    }

    return value;
}

export function wrapHandlers(handlers = {}, logger, scope = 'handler') {
    return wrapValue(handlers, [], logger, scope);
}

export function maybeJson(value) {
    if (typeof value !== 'string') {
        return normalizeValue(value);
    }

    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
}
