import fs from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { describe, it, before, after } from "node:test";
import { strictEqual } from "node:assert";

const read = fs.readFileSync;
const files = fs.readdirSync;
const rm = fs.unlinkSync;

const fixturesDir = "test/fixtures";

function cleanFixtures() {
  files(fixturesDir).forEach(function (file) {
    if (!/(\.out|\.md)/.test(file)) rm(join(fixturesDir, file));
  });
  return files(fixturesDir);
}

describe("writ", function () {
  let fixtures;

  before(function () {
    fixtures = cleanFixtures();
    execSync('node writ.js "test/fixtures/*.md"');
  });

  after(function () {
    cleanFixtures();
  });

  it("compiles all fixtures correctly", function () {
    for (let i = 0; i < fixtures.length; i += 2) {
      const out = fixtures[i + 1];
      const actual = read(join(fixturesDir, out.replace(".out", "")), "utf8");
      const expected = read(join(fixturesDir, out), "utf8");
      strictEqual(actual, expected, fixtures[i]);
    }
  });
});
