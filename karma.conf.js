const tmp = require('tmp');
tmp.setGracefulCleanup();

const webpack = require('webpack');

const outputDir = tmp.dirSync({ unsafeCleanup: true }).name;

module.exports = function(config) {
    config.set({
        frameworks: ['mocha', 'chai', 'webpack'],
        files: [
            'src/**/*.ts',
            'test/**/*.spec.ts',
            // Required for wasm due to https://github.com/ryanclark/karma-webpack/issues/498. Results
            // in an annoying warning before the webpack build, but then it works fine.
            { pattern: `${outputDir}/**/*`, included: false, served: true }
        ],
        mime: { 'text/x-typescript': ['ts'] },
        webpack: {
            mode: 'development',
            devtool: 'source-map',
            module: {
                rules: [
                    {
                        test: /\.ts$/,
                        loader: 'ts-loader',
                        options: {
                            configFile: 'test/tsconfig.json',
                            compilerOptions: {
                                outDir: tmp.dirSync({ unsafeCleanup: true }).name
                            }
                        },
                        exclude: /node_modules/
                    }
                ]
            },
            resolve: {
                extensions: ['.ts', '.js'],
                fallback: {
                    util: require.resolve('util/'),
                    zlib: require.resolve('browserify-zlib'),
                    assert: require.resolve('assert/'),
                    buffer: require.resolve('buffer/'),
                    stream: require.resolve('stream-browserify'),
                    crypto: require.resolve('crypto-browserify'),
                    path: false,
                    fs: false
                }
            },
            experiments: {
                asyncWebAssembly: true
            },
            plugins: [
                new webpack.ProvidePlugin({
                    Buffer: ['buffer', 'Buffer'],
                    process: 'process/browser'
                })
            ],
            output: {
                path: outputDir
            }
        },
        webpackMiddleware: {
            stats: 'error-only'
        },
        preprocessors: {
            'src/**/*.ts': ['webpack', 'sourcemap'],
            'test/**/*.ts': ['webpack', 'sourcemap']
        },
        reporters: ['spec'],
        port: 9876,
        logLevel: config.LOG_INFO,

        browsers: ['ChromeHeadless'],

        autoWatch: false,
        singleRun: true,
        concurrency: Infinity
    });
};