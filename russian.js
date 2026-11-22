// Contra (USA), mapper 2, JSNES. Install immediately after each loadROM.
// All strings go through the original nametable writers, including the credit roll.
(() => {
  'use strict';

  // Seven rows of five pixels. Each letter occupies one native 8x8 CHR tile.
  const glyphs = {
    А:'0e11111f111111', Б:'1f10101e11111e', В:'1e11111e11111e',
    Г:'1f101010101010', Д:'0e0a0a0a0a1f11', Е:'1f10101e10101f',
    Ё:'0a001f101e101f', Ж:'1515150e151515', З:'0e11010601110e',
    И:'11111315191111', Й:'0a041113151911', К:'11121418141211',
    Л:'0f090909090911', М:'111b1515111111', Н:'1111111f111111',
    О:'0e11111111110e', П:'1f111111111111', Р:'1e11111e101010',
    С:'0e11101010110e', Т:'1f040404040404', У:'1111110f01010e',
    Ф:'040e1515150e04', Х:'11110a040a1111', Ц:'12121212121f01',
    Ч:'1111110f010101', Ш:'1515151515151f', Щ:'15151515151f01',
    Ъ:'1810080e09090e', Ы:'1111111d15151d', Ь:'1010101e11111e',
    Э:'0e11010f01110e', Ю:'1215151d151512', Я:'0f11110f050911',
    '.':'00000000000c0c', '!':'04040404040004',
  };
  const letters = Object.keys(glyphs);
  const firstTile = 0x80;
  const installed = new WeakSet();

  function encode(line) {
    return Array.from(line, ch => {
      if (ch === ' ') return 0;
      if (ch >= '0' && ch <= '9') return ch.charCodeAt(0);
      const index = letters.indexOf(ch);
      if (index < 0) throw new Error('Missing Contra glyph ' + ch);
      return firstTile + index;
    });
  }

  const credits = new Map([
    [0xbd55,'ПОЗДРАВЛЯЕМ!'], [0xbd67,'ВЫ УНИЧТОЖИЛИ КРАСНОГО СОКОЛА'],
    [0xbd86,'И СПАСЛИ ВСЕЛЕННУЮ.'], [0xbda6,'ВЫ НАСТОЯЩИЙ ГЕРОЙ!'],
    [0xbc29,'НАД ИГРОЙ РАБОТАЛИ'], [0xbc34,'ПРОГРАММИСТЫ'],
    [0xbc41,'С. УМЭДЗАКИ'], [0xbc4c,'С. КИСИВАДА'], [0xbc59,'К. ЯМАСИТА'],
    [0xbc66,'Т. ДАНДЗЁ'], [0xbc70,'М. ОГАВА'], [0xbc79,'ХУДОЖНИКИ'],
    [0xbc8c,'Т. УЭЯМА'], [0xbc96,'С. МУРАКИ'], [0xbca0,'М. ФУДЗИВАРА'],
    [0xbcac,'Т. НИСИКАВА'], [0xbcb9,'Т. ОДЗАВА'], [0xbce4,'МУЗЫКА И ЗВУК'],
    [0xbcf4,'Х. МАЭДЗАВА'], [0xbcff,'К. САДА'], [0xbd07,'ОСОБАЯ БЛАГОДАРНОСТЬ'],
    [0xbd1a,'К. СИМОНЭТА'], [0xbd27,'Н. САТО'], [0xbd2f,'КОМАНДЕ АРКАДНОЙ КОНТРЫ'],
    [0xbcc2,'РУКОВОДИТЕЛИ'], [0xbccf,'УМЭТЯН'], [0xbcd8,'С. КИТАМОТО'],
    [0xbd3f,'ИГРУ ПРЕДСТАВИЛА'], [0xbd4d,'КОНАМИ'],
  ]);

  // Shared 8x16 sprites. The two-player death notice uses four adjacent
  // sprites, each holding a column of the two-line message.
  function gameplaySprites(bank) {
    const pixels = [];
    let src = 3; // $8001 is the two-byte destination, followed by RLE.
    while (bank[src] !== 0xff) {
      const command = bank[src++];
      const count = command & 0x7f;
      for (let i = 0; i < count; i++) {
        pixels.push(bank[src + (command & 0x80 ? i : 0)]);
      }
      src += command & 0x80 ? count : 1;
    }
    function pixel(tile, x, y, color) {
      const offset = tile * 16 + (y & 7) + (y >= 8 ? 16 : 0);
      const mask = 0x80 >> x;
      for (let plane = 0; plane < 2; plane++) {
        const i = offset + plane * 8;
        pixels[i] = (pixels[i] & ~mask) | ((color >> plane & 1) ? mask : 0);
      }
    }
    function glyph(ch, draw) {
      glyphs[ch].match(/../g).forEach((row, y) => {
        const bits = parseInt(row, 16);
        for (let x = 0; x < 5; x++) if (bits & (16 >> x)) draw(x, y);
      });
    }

    pixels.fill(0, 2 * 16, 10 * 16);
    ['КОНЕЦ', 'ИГРЫ'].forEach((line, row) => {
      const left = Math.floor((32 - (line.length * 6 - 1)) / 2);
      // Draw the shadow underneath the foreground across sprite boundaries.
      for (const shade of [1, 0]) {
        Array.from(line).forEach((ch, col) => glyph(ch, (x, y) => {
          const xx = left + col * 6 + x + shade;
          pixel(2 + (xx >> 3) * 2, xx & 7, row * 8 + y + shade, shade ? 3 : 2);
        }));
      }
    });

    // Разброс, барьер, огонь, лазер, ускорение, пулемёт.
    Array.from('РБОЛУП').forEach((ch, i) => {
      const tile = 0x1c + 2 * i;
      for (let y = 4; y < 15; y++) {
        for (let x = 0; x < 8; x++) pixel(tile, x, y, 3);
      }
      glyph(ch, (x, y) => pixel(tile, x + 1, y + 6, 2));
    });

    // Move the stream into bank 5 padding. Literal runs preserve every
    // other sprite exactly and the loader still receives the original size.
    const stream = [0, 0];
    for (let offset = 0; offset < pixels.length; offset += 126) {
      const run = pixels.slice(offset, offset + 126);
      stream.push(0x80 | run.length, ...run);
    }
    stream.push(0xff);
    return stream;
  }

  window.applyRussian = function applyRussian(nes) {
    const rom = nes.rom;
    if (installed.has(rom)) return;
    const banks = rom && rom.rom;
    if (!banks || banks.length !== 8 ||
        String.fromCharCode(...banks[6].slice(0x3296, 0x329b)) !== 'STAGE' ||
        String.fromCharCode(...banks[4].slice(0x3d57, 0x3d66)) !== 'CONGRATULATIONS') {
      throw new Error('Russian localization requires Contra (USA).');
    }

    const activeBank = nes.cpu.mem[0x8000]; // Each PRG bank starts with its own ID.
    function write(bank, address, bytes) {
      const offset = address & 0x3fff;
      bytes.forEach((byte, i) => {
        banks[bank][offset + i] = byte;
        if (bank === 7) nes.cpu.mem[0xc000 + offset + i] = byte;
        if (bank === activeBank) nes.cpu.mem[0x8000 + offset + i] = byte;
      });
    }
    function word(address) { return [address & 255, address >> 8]; }

    write(5, 0xb640, gameplaySprites(banks[4]));
    write(7, 0xc959, [0x40, 0xb6, 5]); // Shared gameplay sprite descriptor #3.

    // The translated HUD spans four adjacent 8px sprites.
    write(1, 0xb021, [0x10, 0x18, 0x20, 0x28]);

    // The fixed bank contains padding at $F612..$FBFF. Give the stock RLE
    // decoder a CHR stream at $1800, with the digits in their original slots.
    const stream = [0x00, 0x18];
    for (const rows of Object.values(glyphs)) {
      stream.push(0x87, ...rows.match(/../g).map(row => parseInt(row, 16) << 2), 9, 0);
    }
    stream.push(0xff);
    write(7, 0xf680, stream);
    // Select bank 7 through the game's normal save/restore pair, then enter
    // its decoder after descriptor lookup. The stream lives in the fixed bank.
    write(7, 0xf620, [
      0xa9,0x80,0x85,0x00, 0xa9,0xf6,0x85,0x01, 0xa9,0,0x85,4,
      0xa0,7,0x20,0x39,0xc1, 0x4c,0xc3,0xc9,
    ]);
    // Clear the nametables before cards/credits, or finish loading the
    // game-over graphics, then install the font before any text is queued.
    write(7, 0xf640, [0x20,0xa1,0xc9, 0x4c,0x20,0xf6]);
    write(7, 0xf648, [0x20,0x04,0xc2, 0x4c,0x20,0xf6]);
    write(7, 0xce4e, [0x20,0x40,0xf6]);
    write(7, 0xcf77, [0x20,0x48,0xf6]);
    write(4, 0xbadc, [0x20,0x40,0xf6]);

    let cardAddress = 0xbd30; // Bank 6 padding.
    function card(id, address, line, second) {
      const data = [address >> 8, address & 255, ...encode(line)];
      if (second) data.push(0xfd, 0x22, 0xcc, ...encode(second));
      data.push(0xfe);
      write(6, 0xb262 + id * 2, word(cardAddress));
      write(6, cardAddress, data);
      cardAddress += data.length;
    }
    // The score, lives and stage routines insert numbers relative to the
    // record end. Reserve their writable fields even when they are blank.
    card(7, 0x20c2, 'ЖИЗНИ   ');
    card(8, 0x20d2, 'ЖИЗНИ   ');
    card(9, 0x2128, 'РЕКОРД        ');
    card(10, 0x2081, 'ИГРОК 1       ');
    card(11, 0x2091, 'ИГРОК 2       ');
    card(12, 0x220d, 'ЭТАП  ');
    card(13, 0x222b, 'КОНЕЦ ИГРЫ');
    card(14, 0x228c, 'ПРОДОЛЖИТЬ', 'ВЫХОД');
    card(15, 0x20c2, 'КОНЕЦ ИГРЫ');
    card(16, 0x20d2, 'КОНЕЦ ИГРЫ');
    const stages = ['ДЖУНГЛИ','БАЗА 1','ВОДОПАД','БАЗА 2','СНЕЖНОЕ ПОЛЕ',
      'ЭНЕРГЕТИЧЕСКАЯ ЗОНА','АНГАР','ЛОГОВО ЧУЖИХ'];
    stages.forEach((name, i) => card(17 + i, 0x2240 + Math.floor((32 - name.length) / 2), name));

    let creditAddress = 0xbdc8; // Bank 4 padding.
    for (let slot = 0xbb95; slot < 0xbc25; slot += 2) {
      const offset = slot & 0x3fff;
      const original = banks[4][offset] | (banks[4][offset + 1] << 8);
      const line = credits.get(original);
      if (!line) continue; // The roll includes timed blank lines.
      const data = [line.length, Math.floor((32 - line.length) / 2), ...encode(line)];
      write(4, slot, word(creditAddress));
      write(4, creditAddress, data);
      creditAddress += data.length;
    }
    installed.add(rom);
  };
})();
