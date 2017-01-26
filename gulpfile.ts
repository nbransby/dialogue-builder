const gulp = require('gulp');
const fs = require('fs')

gulp.task('gen-test-index', function() {
    const lineNumber = require('line-number');
    const fixture = fs.readFileSync('tests.ts', 'utf8');
    const re = /it\("(.*)"/g;
    console.log(lineNumber(fixture, re).map((line: any) => {
        return `* [it ${line.match.match(/it\("(.*)"/)[1]}](/tests.ts#L${line.number})`
    }).join('\n'));
});