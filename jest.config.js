module.exports = {
  preset: '@vue/cli-plugin-unit-jest/presets/typescript-and-babel',
  // 仅扫描 tests/unit，排除打包产物 target/（electron-packager 会把测试拷进去）
  testMatch: ['**/tests/unit/**/*.spec.[jt]s?(x)'],
  testPathIgnorePatterns: ['/node_modules/', '/target/', '/docs/']
}
