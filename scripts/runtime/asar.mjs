import { closeSync, copyFileSync, mkdirSync, openSync, readSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, normalize, relative, sep } from 'node:path';

/** Read an installed Electron archive without running application code. */
export function openAsar(path) {
  const fd = openSync(path, 'r');
  const prefix = Buffer.alloc(16);
  readSync(fd, prefix, 0, prefix.length, 0);
  const headerSize = prefix.readUInt32LE(12);
  if (headerSize > 32 * 1024 * 1024 || headerSize === 0) throw new Error('Invalid ASAR header size');
  const bytes = Buffer.alloc(headerSize);
  readSync(fd, bytes, 0, bytes.length, 16);
  const tree = JSON.parse(bytes.toString('utf8'));
  const dataOffset = 8 + prefix.readUInt32LE(4);
  const lookup = (name) => {
    let node = tree;
    for (const part of name.split('/')) {
      if (!part || part === '.' || part === '..') throw new Error('Invalid ASAR path');
      node = node.files?.[part];
      if (node === undefined) throw new Error(`ASAR entry missing: ${name}`);
    }
    return node;
  };
  return {
    tree,
    read(name) {
      const node = lookup(name);
      if (node.files || node.link || node.unpacked) throw new Error(`ASAR entry is not packed: ${name}`);
      const value = Buffer.alloc(node.size);
      readSync(fd, value, 0, value.length, dataOffset + Number(node.offset));
      return value;
    },
    extract(name, target) {
      const root = normalize(target);
      const extract = (entry, destination, seen = new Set()) => {
        const local = relative(root, destination);
        if (isAbsolute(local) || local === '..' || local.startsWith(`..${sep}`)) throw new Error('ASAR extraction escaped target');
        const node = lookup(entry);
        if (node.link) {
          if (seen.has(entry)) throw new Error('Cyclic ASAR link');
          const next = new Set(seen).add(entry);
          return extract(node.link, destination, next);
        }
        if (node.files) {
          mkdirSync(destination, { recursive: true });
          for (const child of Object.keys(node.files)) {
            if (child.includes('/') || child === '.' || child === '..') throw new Error('Invalid ASAR filename');
            extract(`${entry}/${child}`, join(destination, child), seen);
          }
        } else {
          mkdirSync(dirname(destination), { recursive: true });
          if (node.unpacked) copyFileSync(`${path}.unpacked/${entry}`, destination);
          else writeFileSync(destination, this.read(entry), { mode: node.executable ? 0o755 : 0o644 });
        }
      };
      extract(name, root);
    },
    close() { closeSync(fd); },
  };
}
