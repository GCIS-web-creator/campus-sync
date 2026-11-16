export type LineShiritoriState = {
  lastWord: string;
  nextKana: string;
  usedWords: string[];
  turns: number;
};

export type LineShiritoriTurnResult = {
  answer: string;
  state: LineShiritoriState | null;
};

export const LINE_GROUP_SHIRITORI_STATE_PREFIX = '__CAMPUSSYNC_LINE_SHIRITORI_STATE__:';

const SMALL_KANA: Record<string, string> = {
  'ぁ': 'あ', 'ぃ': 'い', 'ぅ': 'う', 'ぇ': 'え', 'ぉ': 'お',
  'ゃ': 'や', 'ゅ': 'ゆ', 'ょ': 'よ', 'ゎ': 'わ', 'っ': 'つ',
};

const KANA_VOWEL: Record<string, string> = {};
for (const [vowel, row] of Object.entries({
  'あ': 'あかがさざただなはばぱまやらわぁゃ',
  'い': 'いきぎしじちぢにひびぴみりゐぃ',
  'う': 'うくぐすずつづぬふぶぷむゆるゔぅゅ',
  'え': 'えけげせぜてでねへべぺめれゑぇ',
  'お': 'おこごそぞとどのほぼぽもよろをぉょ',
})) {
  for (const kana of row) KANA_VOWEL[kana] = vowel;
}

const KANJI_READINGS: Record<string, string> = {
  '猫': 'ねこ', '犬': 'いぬ', '鳥': 'とり', '馬': 'うま', '牛': 'うし', '豚': 'ぶた',
  '兎': 'うさぎ', '狐': 'きつね', '猿': 'さる', '熊': 'くま', '亀': 'かめ', '蛇': 'へび',
  '魚': 'さかな', '鮭': 'さけ', '鯛': 'たい', '海': 'うみ', '山': 'やま', '川': 'かわ',
  '空': 'そら', '花': 'はな', '桜': 'さくら', '雪': 'ゆき', '星': 'ほし', '月': 'つき',
  '太陽': 'たいよう', '学校': 'がっこう', '先生': 'せんせい', '机': 'つくえ', '本': 'ほん',
  '電車': 'でんしゃ', '自転車': 'じてんしゃ', '車': 'くるま', '飛行機': 'ひこうき',
  '時計': 'とけい', '林檎': 'りんご', '寿司': 'すし', '大阪': 'おおさか', '東京': 'とうきょう',
  '京都': 'きょうと', '富士山': 'ふじさん', '日本': 'にほん', '世界': 'せかい',
  '朝': 'あさ', '夜': 'よる', '昼': 'ひる', '雨': 'あめ', '風': 'かぜ', '火': 'ひ',
  '水': 'みず', '石': 'いし', '森': 'もり', '島': 'しま', '道': 'みち', '橋': 'はし',
  '時計台': 'とけいだい', '電話': 'でんわ', '写真': 'しゃしん', '音楽': 'おんがく',
};

const BOT_WORDS: Record<string, readonly string[]> = {
  'あ': ['あさがお', 'あひる', 'あめ', 'あんこ'],
  'い': ['いぬ', 'いちご', 'いす', 'いなり'],
  'う': ['うさぎ', 'うちわ', 'うみ', 'うぐいす'],
  'え': ['えんぴつ', 'えだまめ', 'えがお'],
  'お': ['おにぎり', 'おたま', 'おかし'],
  'か': ['かさ', 'かめ', 'からす', 'かがみ'],
  'き': ['きつね', 'きのこ', 'きもの'],
  'く': ['くるま', 'くじら', 'くつ', 'くり'],
  'け': ['けむし', 'けしき', 'けん玉'],
  'こ': ['こあら', 'こま', 'こたつ'],
  'さ': ['さくら', 'さかな', 'さとう'],
  'し': ['しまうま', 'しお', 'しずく', 'しんぶん'],
  'す': ['すいか', 'すずめ', 'すな', 'すみれ'],
  'せ': ['せみ', 'せかい', 'せんす'],
  'そ': ['そら', 'そば', 'そり'],
  'た': ['たぬき', 'たこ', 'たいやき'],
  'ち': ['ちず', 'ちくわ', 'ちょうちょ'],
  'つ': ['つくえ', 'つみき', 'つばめ'],
  'て': ['てがみ', 'てんとうむし', 'てぶくろ'],
  'と': ['とけい', 'とまと', 'とら'],
  'な': ['なす', 'なべ', 'なわとび'],
  'に': ['にわとり', 'にんじん', 'にじ'],
  'ぬ': ['ぬま', 'ぬいぐるみ', 'ぬか'],
  'ね': ['ねこ', 'ねずみ', 'ねぎ'],
  'の': ['のり', 'のこぎり', 'のはら'],
  'は': ['はな', 'はさみ', 'はと'],
  'ひ': ['ひこうき', 'ひつじ', 'ひまわり'],
  'ふ': ['ふね', 'ふくろう', 'ふうせん'],
  'へ': ['へび', 'へいわ', 'へちま'],
  'ほ': ['ほし', 'ほたる', 'ほうき'],
  'ま': ['まくら', 'まつり', 'まめ'],
  'み': ['みず', 'みかづき', 'みみ'],
  'む': ['むし', 'むぎちゃ', 'むらさき'],
  'め': ['めだか', 'めがね', 'めろん'],
  'も': ['もも', 'もみじ', 'もぐら'],
  'や': ['やさい', 'やま', 'やかん'],
  'ゆ': ['ゆき', 'ゆび', 'ゆかた'],
  'よ': ['よる', 'ようかん', 'よっと'],
  'ら': ['らっぱ', 'らくだ', 'らいおん'],
  'り': ['りす', 'りんご', 'りぼん'],
  'る': ['るびー', 'るす', 'るり'],
  'れ': ['れきし', 'れんげ', 'れいぞうこ'],
  'ろ': ['ろうそく', 'ろば', 'ろてん'],
  'わ': ['わに', 'わかめ', 'わらび'],
  'が': ['がっこう', 'がいこく', 'がま'],
  'ぎ': ['ぎょうざ', 'ぎたー', 'ぎんが'],
  'ぐ': ['ぐみ', 'ぐんて', 'ぐらす'],
  'げ': ['げた', 'げんかん', 'げつようび'],
  'ご': ['ごりら', 'ごま', 'ごぼう'],
  'ざ': ['ざる', 'ざぶとん', 'ざっし'],
  'じ': ['じてんしゃ', 'じしゃく', 'じゅうたん'],
  'ず': ['ずこう', 'ずぼん', 'ずけい'],
  'ぜ': ['ぜんまい', 'ぜりー', 'ぜんざい'],
  'ぞ': ['ぞう', 'ぞうり', 'ぞく'],
  'だ': ['だるま', 'だいこん', 'だちょう'],
  'で': ['でんしゃ', 'でんわ', 'でこぼこ'],
  'ど': ['どあ', 'どんぐり', 'どらやき'],
  'ば': ['ばなな', 'ばら', 'ばけつ'],
  'び': ['びわ', 'びーだま', 'びじゅつ'],
  'ぶ': ['ぶどう', 'ぶた', 'ぶらんこ'],
  'べ': ['べんとう', 'べる', 'べにいろ'],
  'ぼ': ['ぼうし', 'ぼたん', 'ぼーる'],
  'ぱ': ['ぱんだ', 'ぱせり', 'ぱずる'],
  'ぴ': ['ぴあの', 'ぴーまん', 'ぴんく'],
  'ぷ': ['ぷーる', 'ぷらすちっく', 'ぷりんたー'],
  'ぺ': ['ぺんき', 'ぺりかん', 'ぺーじ'],
  'ぽ': ['ぽすと', 'ぽてと', 'ぽぷら'],
};

function toHiragana(value: string): string {
  return Array.from(value, character => {
    const code = character.codePointAt(0) || 0;
    return code >= 0x30A1 && code <= 0x30F6
      ? String.fromCodePoint(code - 0x60)
      : character;
  }).join('');
}

function normalizePunctuation(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\s　]+/g, '')
    .replace(/^[「『【（(［\[〈《]+|[」』】）)］\]〉》、。，．.!！?？…]+$/g, '');
}

export function normalizeLineShiritoriWord(input: string): string | null {
  const cleaned = normalizePunctuation(input);
  if (!cleaned) return null;

  const converted = toHiragana(cleaned);
  if (/^[ぁ-ゖー]+$/u.test(converted)) return converted;

  const reading = KANJI_READINGS[cleaned];
  if (reading) return reading;

  return null;
}

function normalizeSmallKana(kana: string): string {
  return SMALL_KANA[kana] || kana;
}

export function getLineShiritoriEndingKana(word: string): string | null {
  if (!word) return null;
  let last = word.slice(-1);
  if (last === 'ー') {
    const previous = Array.from(word).slice(-2, -1)[0];
    if (!previous) return null;
    last = KANA_VOWEL[previous] || normalizeSmallKana(previous);
  } else {
    last = normalizeSmallKana(last);
  }
  return last || null;
}

export function isLineShiritoriStartCommand(input: string): boolean {
  const normalized = input.normalize('NFKC').replace(/[\s　]/g, '').replace(/[!！?？。]+$/g, '');
  return /^(?:しりとり|しりとりしよう|しりとりしよ|しりとりやろう|しりとりやろ|しりとり開始|しりとりスタート|shiritori)$/i.test(normalized);
}

export function isLineShiritoriStopCommand(input: string): boolean {
  const normalized = input.normalize('NFKC').replace(/[\s　]/g, '').replace(/[!！。]+$/g, '');
  return /^(?:しりとり終了|ゲーム終了|やめる|やめよう)$/i.test(normalized);
}

export function isLineShiritoriControlCommand(input: string): boolean {
  return isLineShiritoriStartCommand(input) || isLineShiritoriStopCommand(input);
}

export function startLineShiritori(): LineShiritoriTurnResult {
  const firstWord = 'しりとり';
  return {
    answer: 'しりとり開始！まずは「' + firstWord + '」から。次は「り」ではじまる言葉を送ってね。ひらがな・カタカナで判定するよ（漢字は読みをひらがなにしてね）。',
    state: { lastWord: firstWord, nextKana: 'り', usedWords: [firstWord], turns: 0 },
  };
}

function chooseBotWord(startKana: string, usedWords: Set<string>, turn: number): string | null {
  const candidates = BOT_WORDS[startKana] || [];
  if (candidates.length === 0) return null;
  for (let offset = 0; offset < candidates.length; offset += 1) {
    const index = (turn + offset) % candidates.length;
    const candidate = normalizeLineShiritoriWord(candidates[index]);
    if (!candidate || usedWords.has(candidate) || !candidate.startsWith(startKana)) continue;
    const ending = getLineShiritoriEndingKana(candidate);
    if (!ending || ending === 'ん') continue;
    return candidate;
  }
  return null;
}

export function takeLineShiritoriTurn(input: string, current: LineShiritoriState): LineShiritoriTurnResult {
  if (isLineShiritoriStartCommand(input)) return startLineShiritori();
  if (isLineShiritoriStopCommand(input)) {
    return { answer: 'しりとりを終了したよ！また遊びたくなったら「しりとり」と送ってね。', state: null };
  }

  const word = normalizeLineShiritoriWord(input);
  if (!word) {
    return {
      answer: '単語を1つ送ってね。ひらがな・カタカナで判定するよ。漢字の単語は読みをひらがなで送ってね！今は「' + current.nextKana + '」から始まる言葉だよ。',
      state: current,
    };
  }

  if (current.usedWords.includes(word)) {
    return {
      answer: '「' + word + '」はもう出ているよ！別の「' + current.nextKana + '」から始まる言葉を送ってね。',
      state: current,
    };
  }

  if (!word.startsWith(current.nextKana)) {
    return {
      answer: '「' + word + '」は「' + current.nextKana + '」から始まっていないよ。今は「' + current.nextKana + '」から始まる言葉だよ！',
      state: current,
    };
  }

  const userEnding = getLineShiritoriEndingKana(word);
  if (!userEnding) {
    return {
      answer: '最後の文字を判定できなかったよ。別の単語を送ってね！',
      state: current,
    };
  }
  if (userEnding === 'ん') {
    return {
      answer: '「' + word + '」は「ん」で終わったので、今回はあなたの負け！しりとり終了！もう一回なら「しりとり」と送ってね。',
      state: null,
    };
  }

  const usedWords = new Set([...current.usedWords, word]);
  const botWord = chooseBotWord(userEnding, usedWords, current.turns);
  if (!botWord) {
    return {
      answer: '「' + word + '」！「' + userEnding + '」から始まる言葉が見つからない……今回はあなたの勝ち！もう一回なら「しりとり」と送ってね。',
      state: null,
    };
  }

  const botEnding = getLineShiritoriEndingKana(botWord);
  if (!botEnding || botEnding === 'ん') {
    return {
      answer: '今回はぼくの負け！もう一回なら「しりとり」と送ってね。',
      state: null,
    };
  }

  return {
    answer: '「' + word + '」！じゃあ「' + botWord + '」！次は「' + botEnding + '」から始まる言葉をどうぞ。',
    state: {
      lastWord: botWord,
      nextKana: botEnding,
      usedWords: [...usedWords, botWord],
      turns: current.turns + 1,
    },
  };
}
