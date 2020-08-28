import fs       from 'fs';
import { join } from 'path';
import { exec } from 'child_process';
import tap      from 'tap';


const read   = fs.readFileSync;
const files  = fs.readdirSync;
const rm     = fs.unlinkSync;

const fixturesDir = 'test/fixtures';
const fixtures = cleanFixtures();


function cleanFixtures () {
  files(fixturesDir).forEach(function(file) {
    if (!/(\.out|\.md)/.test(file))
      rm(join(fixturesDir, file));
  });
  return files(fixturesDir);
}


exec('node writ.js "test/fixtures/*.md"', function () {
  for (let i =0; i < fixtures.length; i += 2) {
    const md = fixtures[i];
    const out = fixtures[i+1];

    const actual = read(join(fixturesDir, out.replace('.out', '')), 'utf8');
    const expected = read(join(fixturesDir, out), 'utf8');
    tap.equal(actual, expected);
  }

  console.log();
  cleanFixtures();
});
