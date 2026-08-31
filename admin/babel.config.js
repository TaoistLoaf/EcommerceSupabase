// export default { presets: ['@babel/preset-env', '@babel/preset-react'] };
const replaceImportMeta = ({ types: t }) => ({
  visitor: {
    MetaProperty(path) {
      if (
        path.node.meta.name === "import" &&
        path.node.property.name === "meta"
      ) {
        path.replaceWith(
          t.memberExpression(t.identifier("globalThis"), t.identifier("__IMPORT_META__"))
        );
      }
    },
  },
});

module.exports = {
  presets: [
    '@babel/preset-env',
    '@babel/preset-react'
  ],
  plugins: [replaceImportMeta],
};
