const fs = require('fs');
const iconv = require('iconv-lite');
const Papa = require('papaparse');

const PREAMBLE_LINES = 3;
const REQUIRED_COLUMNS = [
  'Message Subject',
  'Message Body No HTML',
  'Message URL',
  'Author',
  'Time of Post',
  'Replies/Comments',
  'Kudos',
  'Parent Message URL',
  'Root Message URL',
];

const detectEncoding = (buffer) => {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) return 'utf16-le';
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) return 'utf16-be';
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) return 'utf8';
  return 'utf8';
};

const decodeBuffer = (buffer) => {
  const encoding = detectEncoding(buffer);
  if (encoding === 'utf16-le') return iconv.decode(buffer, 'utf16-le');
  if (encoding === 'utf16-be') return iconv.decode(buffer, 'utf16-be');
  return iconv.decode(buffer, 'utf8');
};

const stripPreamble = (text) => {
  const lines = text.split(/\r?\n/);
  if (lines.length <= PREAMBLE_LINES) return text;
  const headerCandidate = lines[PREAMBLE_LINES];
  if (!headerCandidate.includes('Message Subject') && lines[0].includes('Message Subject')) {
    return text;
  }
  return lines.slice(PREAMBLE_LINES).join('\n');
};

const parseCsv = (filePath) => {
  const buffer = fs.readFileSync(filePath);
  const decoded = decodeBuffer(buffer).replace(/^﻿/, '');
  const body = stripPreamble(decoded);

  const result = Papa.parse(body, {
    delimiter: '\t',
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
  });

  const missing = REQUIRED_COLUMNS.filter((c) => !result.meta.fields.includes(c));
  if (missing.length > 0) {
    throw new Error(`CSV missing required columns: ${missing.join(', ')}`);
  }

  const significantErrors = result.errors.filter((e) => e.code !== 'InvalidQuotes');
  return {
    rows: result.data,
    columns: result.meta.fields,
    errors: significantErrors,
  };
};

const parseTimeOfPost = (raw) => {
  if (!raw) return null;
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  const parsed = Date.parse(cleaned);
  if (!Number.isNaN(parsed)) return new Date(parsed);
  const match = cleaned.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s+(\d{1,2}):(\d{2})\s+(AM|PM)$/i);
  if (!match) return null;
  const [, day, monthName, year, hourStr, minute, ampm] = match;
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const monthIdx = months.indexOf(monthName.slice(0, 3).toLowerCase());
  if (monthIdx === -1) return null;
  let hour = parseInt(hourStr, 10) % 12;
  if (ampm.toUpperCase() === 'PM') hour += 12;
  return new Date(Date.UTC(parseInt(year, 10), monthIdx, parseInt(day, 10), hour, parseInt(minute, 10)));
};

const isOriginalThread = (row) => {
  const parent = (row['Parent Message URL'] || '').trim();
  return parent === '';
};

const normalizeRow = (row) => ({
  subject: row['Message Subject'] || '',
  body: row['Message Body No HTML'] || '',
  url: row['Message URL'] || '',
  author: row['Author'] || '',
  postedAt: parseTimeOfPost(row['Time of Post']),
  postedAtRaw: row['Time of Post'] || '',
  replies: parseInt(row['Replies/Comments'] || '0', 10) || 0,
  kudos: parseInt(row['Kudos'] || '0', 10) || 0,
  parentUrl: row['Parent Message URL'] || '',
  rootUrl: row['Root Message URL'] || '',
});

module.exports = { parseCsv, parseTimeOfPost, isOriginalThread, normalizeRow };
