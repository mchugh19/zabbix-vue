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
        },{
            test: /\.css$/,
            use: ['style-loader', 'css-loader']
        },{
            test: /\.(jpe?g|png|gif|svg|eot|woff|ttf|svg|woff2)$/,
            loader: "file-loader?name=fonts/[name].[ext]"
        }]
    },
    externals: {
        //'sjcl': 'sjcl'
        //'zabbix-promise': 'zabbix-promise',
        //'crypt.io': 'crypt.io'
    },
    node: {
        console: true,
        fs: 'empty',
        net: 'empty',
        tls: 'empty',
        child_process: 'empty'
    }
}
