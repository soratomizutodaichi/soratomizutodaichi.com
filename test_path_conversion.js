// パス正規化関数のテスト
const normalizeFarmPhotoPath = (src) => {
  if (!src || typeof src !== 'string') return null;
  
  // Windows ローカルパスを検出（C:\ または ..\ を含む場合）
  if (src.includes(':') || src.includes('\\')) {
    // ファイル名のみを抽出（最後の \ または / の後ろ）
    const fileName = src.split(/[\\\/]/).pop();
    if (fileName) {
      // assets/images/farm/ 配下の相対パスに変換
      return `assets/images/farm/${fileName}`;
    }
    console.warn('Farm photo path contains local path but no filename found:', src);
    return null;
  }
  
  // すでに相対パスの場合はそのまま返す
  return src;
};

// テストケース
const testCases = [
  'C:\\Users\\nanko\\Downloads\\20260501taneue.jpg',
  'assets/images/farm/hana.png',
  'C:\\path\\to\\image.jpg',
  null,
  ''
];

console.log('=== パス正規化テスト ===');
testCases.forEach(testCase => {
  const result = normalizeFarmPhotoPath(testCase);
  console.log(`入力: "${testCase}"`);
  console.log(`出力: "${result}"\n`);
});
