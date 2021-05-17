module.exports = (wallaby) => {
    return {
        files: [
            'src/**/*.{ts,js}',
            '!test/**/*.spec.ts'
        ],
        tests: [
            'test/**/*.spec.ts'
        ],

        testFramework: 'mocha',
        env: {
            type: 'node'
        },
        debug: true
    };
};