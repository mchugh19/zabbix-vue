module.exports = {
    context: __dirname + '/app/scripts.babel/',
    entry: {
        background: './background.js', // remove unused
        chromereload: './chromereload.js',
        options: './options.js',
        popup: './popup.js',
    },
    output: { filename: '[name].js' },
    module: {
        rules: [{
            test: /\.js$/,
            loader: 'babel-loader'
        }, {
            test: /\.vue$/,
            loader: 'vue-loader'
        }]
    }
}
