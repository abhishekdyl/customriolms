// @ts-nocheck
// Self-contained QR code encoder — byte mode only, versions 1-10, based on
// the well-known public-domain algorithm structure (Reed-Solomon GF(256)
// ECC). No external dependencies, so the invite QR on Users & Access
// doesn't need a new npm package. Ported as-is from the approved prototype
// (lms_screens_demo.jsx) — deliberately left untyped (ts-nocheck) since
// this is a verbatim port of a working, self-contained algorithm rather
// than app logic, and adding types here would be pure busywork.

const QRMath = (() => {
  const EXP_TABLE = new Array(256);
  const LOG_TABLE = new Array(256);
  for (let i = 0; i < 8; i++) EXP_TABLE[i] = 1 << i;
  for (let i = 8; i < 256; i++) {
    EXP_TABLE[i] = EXP_TABLE[i - 4] ^ EXP_TABLE[i - 5] ^ EXP_TABLE[i - 6] ^ EXP_TABLE[i - 8];
  }
  for (let i = 0; i < 255; i++) LOG_TABLE[EXP_TABLE[i]] = i;
  return {
    glog(n) { if (n < 1) throw new Error("glog(" + n + ")"); return LOG_TABLE[n]; },
    gexp(n) { while (n < 0) n += 255; while (n >= 256) n -= 255; return EXP_TABLE[n]; },
  };
})();

class QRPolynomial {
  constructor(num, shift) {
    let offset = 0;
    while (offset < num.length && num[offset] === 0) offset++;
    this.num = new Array(num.length - offset + shift).fill(0);
    for (let i = 0; i < num.length - offset; i++) this.num[i] = num[i + offset];
  }
  get(i) { return this.num[i]; }
  getLength() { return this.num.length; }
  multiply(e) {
    const num = new Array(this.getLength() + e.getLength() - 1).fill(0);
    for (let i = 0; i < this.getLength(); i++)
      for (let j = 0; j < e.getLength(); j++)
        num[i + j] ^= QRMath.gexp(QRMath.glog(this.get(i)) + QRMath.glog(e.get(j)));
    return new QRPolynomial(num, 0);
  }
  mod(e) {
    if (this.getLength() - e.getLength() < 0) return this;
    const ratio = QRMath.glog(this.get(0)) - QRMath.glog(e.get(0));
    const num = this.num.slice();
    for (let i = 0; i < e.getLength(); i++) num[i] ^= QRMath.gexp(QRMath.glog(e.get(i)) + ratio);
    return new QRPolynomial(num, 0).mod(e);
  }
}

function getErrorCorrectPolynomial(errorCorrectLength) {
  let a = new QRPolynomial([1], 0);
  for (let i = 0; i < errorCorrectLength; i++) a = a.multiply(new QRPolynomial([1, QRMath.gexp(i)], 0));
  return a;
}

// [numBlocks, totalCodewords, dataCodewords] per group; some rows have 2 groups (4 numbers repeated)
const RS_BLOCK_TABLE = {
  1: { L: [[1, 26, 19]], M: [[1, 26, 16]], Q: [[1, 26, 13]], H: [[1, 26, 9]] },
  2: { L: [[1, 44, 34]], M: [[1, 44, 28]], Q: [[1, 44, 22]], H: [[1, 44, 16]] },
  3: { L: [[1, 70, 55]], M: [[1, 70, 44]], Q: [[2, 35, 17]], H: [[2, 35, 13]] },
  4: { L: [[1, 100, 80]], M: [[2, 50, 32]], Q: [[2, 50, 24]], H: [[4, 25, 9]] },
  5: { L: [[1, 134, 108]], M: [[2, 67, 43]], Q: [[2, 33, 15], [2, 34, 16]], H: [[2, 33, 11], [2, 34, 12]] },
  6: { L: [[2, 86, 68]], M: [[4, 43, 27]], Q: [[4, 43, 19]], H: [[4, 43, 15]] },
  7: { L: [[2, 98, 78]], M: [[4, 49, 31]], Q: [[2, 32, 14], [4, 33, 15]], H: [[4, 39, 13], [1, 40, 14]] },
  8: { L: [[2, 121, 97]], M: [[2, 60, 38], [2, 61, 39]], Q: [[4, 40, 18], [2, 41, 19]], H: [[4, 40, 14], [2, 41, 15]] },
  9: { L: [[2, 146, 116]], M: [[3, 58, 36], [2, 59, 37]], Q: [[4, 36, 16], [4, 37, 17]], H: [[4, 36, 12], [4, 37, 13]] },
  10: { L: [[2, 86, 68], [2, 87, 69]], M: [[4, 69, 43], [1, 70, 44]], Q: [[6, 43, 19], [2, 44, 20]], H: [[6, 43, 15], [2, 44, 16]] },
};

function getRSBlocks(typeNumber, errorCorrectLevel) {
  const groups = RS_BLOCK_TABLE[typeNumber][errorCorrectLevel];
  const list = [];
  for (const [count, total, data] of groups) for (let i = 0; i < count; i++) list.push({ totalCount: total, dataCount: data });
  return list;
}

class QRBitBuffer {
  constructor() { this.buffer = []; this.length = 0; }
  get(index) { return ((this.buffer[Math.floor(index / 8)] >>> (7 - index % 8)) & 1) === 1; }
  put(num, length) { for (let i = 0; i < length; i++) this.putBit(((num >>> (length - i - 1)) & 1) === 1); }
  putBit(bit) {
    const bufIndex = Math.floor(this.length / 8);
    if (this.buffer.length <= bufIndex) this.buffer.push(0);
    if (bit) this.buffer[bufIndex] |= (0x80 >>> (this.length % 8));
    this.length++;
  }
}

const PATTERN_POSITION_TABLE = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34],
  7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
};
const G15 = (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0);
const G18 = (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | (1 << 0);
const G15_MASK = (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1);

function getBCHDigit(data) { let digit = 0; while (data !== 0) { digit++; data >>>= 1; } return digit; }
function getBCHTypeInfo(data) {
  let d = data << 10;
  while (getBCHDigit(d) - getBCHDigit(G15) >= 0) d ^= (G15 << (getBCHDigit(d) - getBCHDigit(G15)));
  return ((data << 10) | d) ^ G15_MASK;
}
function getBCHTypeNumber(data) {
  let d = data << 12;
  while (getBCHDigit(d) - getBCHDigit(G18) >= 0) d ^= (G18 << (getBCHDigit(d) - getBCHDigit(G18)));
  return (data << 12) | d;
}
const MASK_FUNCS = [
  (i, j) => (i + j) % 2 === 0,
  (i) => i % 2 === 0,
  (i, j) => j % 3 === 0,
  (i, j) => (i + j) % 3 === 0,
  (i, j) => (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0,
  (i, j) => (i * j) % 2 + (i * j) % 3 === 0,
  (i, j) => ((i * j) % 2 + (i * j) % 3) % 2 === 0,
  (i, j) => ((i * j) % 3 + (i + j) % 2) % 2 === 0,
];

class QRCode {
  constructor(typeNumber, errorCorrectLevel) {
    this.typeNumber = typeNumber;
    this.errorCorrectLevel = errorCorrectLevel;
    this.modules = null;
    this.moduleCount = 0;
    this.dataList = [];
  }
  addData(text) { this.dataList.push(text); }
  isDark(row, col) { return this.modules[row][col]; }
  getModuleCount() { return this.moduleCount; }

  make() {
    this.moduleCount = this.typeNumber * 4 + 17;
    this.modules = Array.from({ length: this.moduleCount }, () => new Array(this.moduleCount).fill(null));
    this.setupPositionProbePattern(0, 0);
    this.setupPositionProbePattern(this.moduleCount - 7, 0);
    this.setupPositionProbePattern(0, this.moduleCount - 7);
    this.setupPositionAdjustPattern();
    this.setupTimingPattern();
    this.setupTypeInfo(false, 0);
    if (this.typeNumber >= 7) this.setupTypeNumber(false);

    const dataArray = this.createData();
    this.mapData(dataArray, 0);
    const maskPattern = this.bestMask(dataArray);
    this.modules = Array.from({ length: this.moduleCount }, () => new Array(this.moduleCount).fill(null));
    this.setupPositionProbePattern(0, 0);
    this.setupPositionProbePattern(this.moduleCount - 7, 0);
    this.setupPositionProbePattern(0, this.moduleCount - 7);
    this.setupPositionAdjustPattern();
    this.setupTimingPattern();
    this.setupTypeInfo(false, maskPattern);
    if (this.typeNumber >= 7) this.setupTypeNumber(false);
    this.mapData(dataArray, maskPattern);
  }

  bestMask(dataArray) {
    let best = 0, bestPenalty = Infinity;
    for (let m = 0; m < 8; m++) {
      const modules = Array.from({ length: this.moduleCount }, () => new Array(this.moduleCount).fill(null));
      const saved = this.modules;
      this.modules = modules;
      this.setupPositionProbePattern(0, 0);
      this.setupPositionProbePattern(this.moduleCount - 7, 0);
      this.setupPositionProbePattern(0, this.moduleCount - 7);
      this.setupPositionAdjustPattern();
      this.setupTimingPattern();
      this.setupTypeInfo(false, m);
      if (this.typeNumber >= 7) this.setupTypeNumber(false);
      this.mapData(dataArray, m);
      const penalty = this.penaltyScore();
      this.modules = saved;
      if (penalty < bestPenalty) { bestPenalty = penalty; best = m; }
    }
    return best;
  }

  penaltyScore() {
    const n = this.moduleCount, m = this.modules;
    let score = 0;
    for (let r = 0; r < n; r++) for (let c = 0; c <= n - 5; c++) {
      let run = 1; const v = m[r][c];
      for (let k = 1; k < 5; k++) if (m[r][c + k] === v) run++; else break;
    }
    let dark = 0;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (m[r][c]) dark++;
    const ratio = Math.abs(100 * dark / (n * n) - 50);
    score += Math.floor(ratio / 5) * 10;
    return score;
  }

  setupPositionProbePattern(row, col) {
    for (let r = -1; r <= 7; r++) {
      if (row + r <= -1 || this.moduleCount <= row + r) continue;
      for (let c = -1; c <= 7; c++) {
        if (col + c <= -1 || this.moduleCount <= col + c) continue;
        const dark = (0 <= r && r <= 6 && (c === 0 || c === 6)) || (0 <= c && c <= 6 && (r === 0 || r === 6)) || (2 <= r && r <= 4 && 2 <= c && c <= 4);
        this.modules[row + r][col + c] = dark;
      }
    }
  }
  setupTimingPattern() {
    for (let r = 8; r < this.moduleCount - 8; r++) if (this.modules[r][6] === null) this.modules[r][6] = r % 2 === 0;
    for (let c = 8; c < this.moduleCount - 8; c++) if (this.modules[6][c] === null) this.modules[6][c] = c % 2 === 0;
  }
  setupPositionAdjustPattern() {
    const pos = PATTERN_POSITION_TABLE[this.typeNumber] || [];
    for (const row of pos) for (const col of pos) {
      if (this.modules[row][col] !== null) continue;
      for (let r = -2; r <= 2; r++) for (let c = -2; c <= 2; c++) {
        const dark = r === -2 || r === 2 || c === -2 || c === 2 || (r === 0 && c === 0);
        this.modules[row + r][col + c] = dark;
      }
    }
  }
  setupTypeNumber(test) {
    const bits = getBCHTypeNumber(this.typeNumber);
    for (let i = 0; i < 18; i++) {
      const mod = (!test && ((bits >> i) & 1) === 1);
      this.modules[Math.floor(i / 3)][i % 3 + this.moduleCount - 8 - 3] = mod;
      this.modules[i % 3 + this.moduleCount - 8 - 3][Math.floor(i / 3)] = mod;
    }
  }
  setupTypeInfo(test, maskPattern) {
    const ECC_INDEX = { L: 1, M: 0, Q: 3, H: 2 };
    const data = (ECC_INDEX[this.errorCorrectLevel] << 3) | maskPattern;
    const bits = getBCHTypeInfo(data);
    for (let i = 0; i < 15; i++) {
      const mod = (!test && ((bits >> i) & 1) === 1);
      if (i < 6) this.modules[i][8] = mod;
      else if (i < 8) this.modules[i + 1][8] = mod;
      else this.modules[this.moduleCount - 15 + i][8] = mod;
      if (i < 8) this.modules[8][this.moduleCount - i - 1] = mod;
      else if (i < 9) this.modules[8][15 - i - 1 + 1] = mod;
      else this.modules[8][15 - i - 1] = mod;
    }
    this.modules[this.moduleCount - 8][8] = (!test);
  }
  createData() {
    const buffer = new QRBitBuffer();
    for (const text of this.dataList) {
      const bytes = Array.from(new TextEncoder().encode(text));
      buffer.put(4, 4);
      buffer.put(bytes.length, 8);
      for (const b of bytes) buffer.put(b, 8);
    }
    const rsBlocks = getRSBlocks(this.typeNumber, this.errorCorrectLevel);
    const totalDataCount = rsBlocks.reduce((s, b) => s + b.dataCount, 0);
    if (buffer.length > totalDataCount * 8) throw new Error("data too long for this version");
    if (buffer.length + 4 <= totalDataCount * 8) buffer.put(0, 4);
    while (buffer.length % 8 !== 0) buffer.putBit(false);
    const PAD0 = 0xEC, PAD1 = 0x11;
    while (true) {
      if (buffer.length >= totalDataCount * 8) break;
      buffer.put(PAD0, 8);
      if (buffer.length >= totalDataCount * 8) break;
      buffer.put(PAD1, 8);
    }
    return this.createBytes(buffer, rsBlocks);
  }
  createBytes(buffer, rsBlocks) {
    let offset = 0;
    const maxDcCount = Math.max(...rsBlocks.map((b) => b.dataCount));
    const maxEcCount = Math.max(...rsBlocks.map((b) => b.totalCount - b.dataCount));
    const dcdata = new Array(rsBlocks.length);
    const ecdata = new Array(rsBlocks.length);
    for (let r = 0; r < rsBlocks.length; r++) {
      const dcCount = rsBlocks[r].dataCount;
      const ecCount = rsBlocks[r].totalCount - dcCount;
      dcdata[r] = new Array(dcCount);
      for (let i = 0; i < dcCount; i++) dcdata[r][i] = 0xff & buffer.buffer[i + offset];
      offset += dcCount;
      const rsPoly = getErrorCorrectPolynomial(ecCount);
      const rawPoly = new QRPolynomial(dcdata[r], rsPoly.getLength() - 1);
      const modPoly = rawPoly.mod(rsPoly);
      ecdata[r] = new Array(rsPoly.getLength() - 1);
      for (let i = 0; i < ecdata[r].length; i++) {
        const modIndex = i + modPoly.getLength() - ecdata[r].length;
        ecdata[r][i] = modIndex >= 0 ? modPoly.get(modIndex) : 0;
      }
    }
    const data = [];
    for (let i = 0; i < maxDcCount; i++) for (const block of dcdata) if (i < block.length) data.push(block[i]);
    for (let i = 0; i < maxEcCount; i++) for (const block of ecdata) if (i < block.length) data.push(block[i]);
    return data;
  }
  mapData(data, maskPattern) {
    let inc = -1, row = this.moduleCount - 1, bitIndex = 7, byteIndex = 0;
    const maskFunc = MASK_FUNCS[maskPattern];
    for (let col = this.moduleCount - 1; col > 0; col -= 2) {
      if (col === 6) col--;
      while (true) {
        for (let c = 0; c < 2; c++) {
          if (this.modules[row][col - c] === null) {
            let dark = false;
            if (byteIndex < data.length) dark = ((data[byteIndex] >>> bitIndex) & 1) === 1;
            const mask = maskFunc(row, col - c);
            if (mask) dark = !dark;
            this.modules[row][col - c] = dark;
            bitIndex--;
            if (bitIndex === -1) { byteIndex++; bitIndex = 7; }
          }
        }
        row += inc;
        if (row < 0 || this.moduleCount <= row) { row -= inc; inc = -inc; break; }
      }
    }
  }
}

export function generateQR(text, errorCorrectLevel = "M") {
  for (let typeNumber = 1; typeNumber <= 10; typeNumber++) {
    try {
      const qr = new QRCode(typeNumber, errorCorrectLevel);
      qr.addData(text);
      qr.make();
      const n = qr.getModuleCount();
      const matrix = [];
      for (let r = 0; r < n; r++) { const row = []; for (let c = 0; c < n; c++) row.push(qr.isDark(r, c)); matrix.push(row); }
      return { typeNumber, moduleCount: n, matrix };
    } catch (e) {
      continue; // data doesn't fit at this version, try next
    }
  }
  throw new Error("Data too long for versions 1-10");
}
