var fs     = require('fs');
var join   = require('path').join;
var exec   = require('child_process').exec;
var tap    = require('tap');


var read   = fs.readFileSync;
var files  = fs.readdirSync;
var rm     = fs.unlinkSync;

var fixturesDir = 'test/fixtures';
var fixtures = cleanFixtures();


function cleanFixtures () {
  files(fixturesDir).forEach(function(file) {
    if (!/(\.out|\.md)/.test(file))
      rm(join(fixturesDir, file));
  });
  return files(fixturesDir);
}


exec('node writ.js "test/fixtures/*.md"', function () {

  for (var i =0; i < fixtures.length; i += 2) {
    var md = fixtures[i];
    var out = fixtures[i+1];

    var actual = read(join(fixturesDir, out.replace('.out', '')), 'utf8');
    var expected = read(join(fixturesDir, out), 'utf8');
    tap.equal(actual, expected);
  }

  console.log();
  cleanFixtures();
});
