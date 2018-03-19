// generated on 2018-02-21 using generator-chrome-extension 0.7.0
import gulp from 'gulp';
import gulpLoadPlugins from 'gulp-load-plugins';
import del from 'del';
import runSequence from 'run-sequence';
import {stream as wiredep} from 'wiredep';
import webpackStream from 'webpack-stream';
import webpack from 'webpack';

// Define uglify-es
var uglifyjs = require('uglify-es');
var pump = require('pump');
var composer = require('gulp-uglify/composer');
var minify = composer(uglifyjs, console);


const $ = gulpLoadPlugins();

gulp.task('extras', () => {
  return gulp.src([
    'app/*.*',
    'app/_locales/**',
    '!app/scripts.babel',
    '!app/*.json',
    '!app/*.html',
  ], {
    base: 'app',
    dot: true
  }).pipe(gulp.dest('dist'));
});

function lint(files, options) {
  return () => {
    return gulp.src(files)
      .pipe($.eslint(options))
      .pipe($.eslint.format());
  };
}

gulp.task('lint', lint('app/scripts.babel/**/*.js', {
  env: {
    es6: true
  },
  parserOptions: {
    sourceType: 'module'
  }
}));


gulp.task('html', () => {
  return gulp.src('app/*.html')
    .pipe($.useref({searchPath: ['.tmp', 'app', '.']}))
    //.pipe($.sourcemaps.init())
    .pipe($.if('*.js', $.uglify()))
    .pipe($.if('*.css', $.cleanCss({compatibility: '*'})))
    //.pipe($.sourcemaps.write('maps'))
    .pipe($.if('*.html', $.htmlmin({
      collapseWhitespace: true,
      minifyCSS: true,
      minifyJS: true,
      removeComments: true
    })))
    .pipe(gulp.dest('dist'));
});

gulp.task('javascript', ['babel'], (cb) => {
  var options = {};
  pump([
      gulp.src(['.tmp/*.js', 'app/scripts.babel/lib/sjcl.js']),
      minify(options),
      gulp.dest('dist/scripts')
    ],
    cb
  );
});

gulp.task('chromeManifest', () => {
  return gulp.src('app/manifest.json')
    .pipe($.chromeManifest({
      buildnumber: false,
  }))
  .pipe($.if('*.css', $.cleanCss({compatibility: '*'})))
  .pipe($.if('*.js', $.sourcemaps.init()))
  .pipe($.if('*.js', $.uglify()))
  .pipe($.if('*.js', $.sourcemaps.write('.')))
  .pipe(gulp.dest('dist'));
});

gulp.task('babel', () => {
  return gulp.src('app/scripts.babel')
    .pipe(webpackStream(require('./webpack.config.js'), webpack)
      .on('error', function (err) {
        console.log(err);
        this.emit('end');
      }))
    .pipe(gulp.dest('.tmp/'))
});

gulp.task('clean', del.bind(null, ['.tmp', 'dist', 'package']));

gulp.task('size', () => {
  return gulp.src('dist/**/*').pipe($.size({title: 'build', gzip: true}));
});

gulp.task('wiredep', () => {
  gulp.src('app/*.html')
    .pipe(wiredep({
      ignorePath: /^(\.\.\/)*\.\./
    }))
    .pipe(gulp.dest('app'));
});

// Task to copy fonts to dist.
gulp.task('compile-fonts', function() {
  return gulp.src([
    '.tmp/fonts/*'
  ])
  .pipe(gulp.dest('dist/fonts/'));
});

var svg2png = require('gulp-svg2png');
gulp.task('svg2png', function () {
    // Chrome does not yet support svg logo or default icon from manifest
    gulp.src('app/img_src/{logo,unconfigured}.svg')
        .pipe(svg2png())
        .pipe(gulp.dest('dist/images/'));
});
gulp.task('copy-svg', function() {
  return gulp.src([
    'app/img_src/*.svg'
  ])
  .pipe(gulp.dest('dist/images/'));
});

gulp.task('build', (cb) => {
  runSequence(
    'lint', 'chromeManifest', 'javascript',
    ['svg2png', 'copy-svg'],
    'html', 'compile-fonts','extras',
    'size', cb);
});

gulp.task('default', ['clean'], cb => {
  runSequence('build', cb);
});

gulp.task('package', function () {
  var manifest = require('./dist/manifest.json');
  return gulp.src('dist/**')
      .pipe($.zip('zabbix-vue-' + manifest.version + '.zip'))
      .pipe(gulp.dest('package'));
});
