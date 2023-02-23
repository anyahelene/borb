const path = require('path');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');

const config = {
  target: 'web',
  context: path.resolve(__dirname, './src'),
  entry: {
    index: './index.ts',
    css: { 
        import: [
                './css/common.scss',
                './css/editor.scss',
                './css/buttons.scss',
                './css/frames.scss',
                './css/markdown.scss',
                './css/terminal.scss',
                './css/grid-display.scss',
        ],
 //       filename: '[path][name].[ext]',
    }
  },
  output: {
    path: path.resolve(__dirname, './dist'),
//    filename: 'index.js',
    library: 'borb',
    libraryTarget: 'umd',
    globalObject: 'this',
    umdNamedDefine: true,
  },
  watchOptions: {
    aggregateTimeout: 600,
    ignored: /node_modules/,
  },
  plugins: [
    new CleanWebpackPlugin({
      cleanStaleWebpackAssets: false,
      cleanOnceBeforeBuildPatterns: [path.resolve(__dirname, './dist')],
    }),
  ],
  module: {
    rules: [
      {
        test: /\.ts(x?)$/,
        exclude: [/node_modules/, /test/],
        use: [
          {
            loader: 'babel-loader',
          },
          {
            loader: 'ts-loader',
          },
        ],
      },
      {
        test: /\.s?css$/,
        type: 'asset/resource',
          generator: {
              filename: '[path][name].css'
          },
        use: [
          {
            loader: 'sass-loader',
            options: { implementation: require('sass') },
          },
        ],
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    fallback: { path: 'path-browserify' },
  },
};

module.exports = (env, argv) => {
  if (argv.mode === 'production') {
      config.mode = 'production';
    // * add some prod rules here
  } else { // mode === 'development'
      config.mode = 'development';
    // * add some development rules here
  }

  return config;
};
