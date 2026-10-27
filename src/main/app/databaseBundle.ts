import { crc32, deflateRawSync, inflateRawSync } from "node:zlib";

export interface ZipEntry {
  name: string;
  data: Buffer;
}

function dosDateTime(date: Date): { date: number; time: number } {
  const year = Math.max(1980, date.getFullYear());
  const dosTime =
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    Math.floor(date.getSeconds() / 2);
  const dosDate =
    ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { date: dosDate, time: dosTime };
}

function writeLocalHeader(
  name: Buffer,
  data: Buffer,
  compressedData: Buffer,
  checksum: number,
  modifiedAt: Date
): Buffer {
  const header = Buffer.alloc(30);
  const modified = dosDateTime(modifiedAt);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x0800, 6);
  header.writeUInt16LE(8, 8);
  header.writeUInt16LE(modified.time, 10);
  header.writeUInt16LE(modified.date, 12);
  header.writeUInt32LE(checksum, 14);
  header.writeUInt32LE(compressedData.length, 18);
  header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(name.length, 26);
  header.writeUInt16LE(0, 28);
  return Buffer.concat([header, name, compressedData]);
}

function writeCentralHeader(
  name: Buffer,
  data: Buffer,
  compressedData: Buffer,
  checksum: number,
  modifiedAt: Date,
  offset: number
): Buffer {
  const header = Buffer.alloc(46);
  const modified = dosDateTime(modifiedAt);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0x0800, 8);
  header.writeUInt16LE(8, 10);
  header.writeUInt16LE(modified.time, 12);
  header.writeUInt16LE(modified.date, 14);
  header.writeUInt32LE(checksum, 16);
  header.writeUInt32LE(compressedData.length, 20);
  header.writeUInt32LE(data.length, 24);
  header.writeUInt16LE(name.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(0, 38);
  header.writeUInt32LE(offset, 42);
  return Buffer.concat([header, name]);
}

function writeEndOfCentralDirectory(
  entryCount: number,
  centralSize: number,
  centralOffset: number
): Buffer {
  const footer = Buffer.alloc(22);
  footer.writeUInt32LE(0x06054b50, 0);
  footer.writeUInt16LE(0, 4);
  footer.writeUInt16LE(0, 6);
  footer.writeUInt16LE(entryCount, 8);
  footer.writeUInt16LE(entryCount, 10);
  footer.writeUInt32LE(centralSize, 12);
  footer.writeUInt32LE(centralOffset, 16);
  footer.writeUInt16LE(0, 20);
  return footer;
}

export function createCompressedZip(entries: ZipEntry[]): Buffer {
  const modifiedAt = new Date();
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    if (entry.name.startsWith("/") || entry.name.includes("..")) {
      throw new Error(`Unsafe ZIP entry name: ${entry.name}`);
    }

    const name = Buffer.from(entry.name, "utf8");
    const compressedData = deflateRawSync(entry.data);
    const checksum = crc32(entry.data) >>> 0;
    const local = writeLocalHeader(
      name,
      entry.data,
      compressedData,
      checksum,
      modifiedAt
    );
    const central = writeCentralHeader(
      name,
      entry.data,
      compressedData,
      checksum,
      modifiedAt,
      offset
    );
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }

  const centralOffset = offset;
  const central = Buffer.concat(centrals);
  return Buffer.concat([
    ...locals,
    central,
    writeEndOfCentralDirectory(entries.length, central.length, centralOffset),
  ]);
}

function findEndOfCentralDirectory(zip: Buffer): number {
  const minimumFooterSize = 22;
  const maxCommentSize = 0xffff;
  const start = Math.max(0, zip.length - minimumFooterSize - maxCommentSize);
  for (let offset = zip.length - minimumFooterSize; offset >= start; offset -= 1) {
    if (zip.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error("Invalid ZIP file");
}

export function readZip(zip: Buffer): Map<string, Buffer> {
  const footerOffset = findEndOfCentralDirectory(zip);
  const entryCount = zip.readUInt16LE(footerOffset + 10);
  const centralOffset = zip.readUInt32LE(footerOffset + 16);
  const entries = new Map<string, Buffer>();
  let cursor = centralOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (zip.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error("Invalid ZIP central directory");
    }

    const compressionMethod = zip.readUInt16LE(cursor + 10);
    if (compressionMethod !== 0 && compressionMethod !== 8) {
      throw new Error("Unsupported ZIP compression method");
    }

    const compressedSize = zip.readUInt32LE(cursor + 20);
    const uncompressedSize = zip.readUInt32LE(cursor + 24);
    const nameLength = zip.readUInt16LE(cursor + 28);
    const extraLength = zip.readUInt16LE(cursor + 30);
    const commentLength = zip.readUInt16LE(cursor + 32);
    const localOffset = zip.readUInt32LE(cursor + 42);
    const name = zip
      .subarray(cursor + 46, cursor + 46 + nameLength)
      .toString("utf8");

    if (name.startsWith("/") || name.includes("..")) {
      throw new Error(`Unsafe ZIP entry name: ${name}`);
    }
    if (zip.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error("Invalid ZIP local header");
    }

    const localNameLength = zip.readUInt16LE(localOffset + 26);
    const localExtraLength = zip.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const entryData = zip.subarray(dataOffset, dataOffset + compressedSize);
    const data =
      compressionMethod === 8
        ? inflateRawSync(entryData)
        : Buffer.from(entryData);
    if (data.length !== uncompressedSize) {
      throw new Error("Invalid ZIP entry size");
    }
    entries.set(name, data);

    cursor += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}
