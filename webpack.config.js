var webpack = require('webpack')

module.exports = {
    context: __dirname + '/app/scripts.babel/',
    entry: {
        background: './background.js',
        options: './options.js',
        popup: './popup.js'
    },
    output: { filename: '[name].js' },
    module: {
        rules: [{
            test: /\.js$/,
            exclude: /node_modules/,
            loader: 'babel-loader'
        }, {
            test: /\.vue$/,
            loader: 'vue-loader'
        },{
            test: /\.css$/,
            use: ['style-loader', 'css-loader']
        },{
            test: /\.(jpe?g|png|gif|svg|eot|woff|ttf|svg|woff2)$/,
            loader: "file-loader?name=fonts/[name].[ext]"
        }]
    },
    node: false,
    externals: {
        crypto: 'null'
    },
    plugins: [
        new webpack.DefinePlugin({
            'process.env': {
                NODE_ENV: '"production"'
            }
        })
    ]
}
