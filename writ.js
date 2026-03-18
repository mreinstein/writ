#!/usr/bin/env node

import fs            from 'node:fs';
import { parseArgs } from 'node:util';
import path          from 'node:path';
import { marked }    from 'marked';
function writ (file, outputDir) {
  const mdfile = read(file);
  const source = compile(mdfile.src, mdfile.lang);
  fs.writeFileSync(out(file, outputDir), source);
}
function read (file) {
  const parts = file.split('.');

  return {
    src: fs.readFileSync(file, 'utf8'),
    lang: parts[parts.length - 2]
  };
}
function out (file, outputDir) {
  const outname = path.basename(file).replace(/\.md$|\.markdown$/, '');
  const outpath = outputDir || path.dirname(file);
  return path.join(outpath, outname);
}
function normalize (src) {
  return src.replace(/^##(==|!!)/gm, '## $1');
}
function compile (src, lang) {
  const source = new Source(lang);
  marked.lexer(normalize(src)).forEach(function(block) { source.push(block); });
  return source.assemble();
}
function codeblocks (src) {
  return marked.lexer(normalize(src))
    .filter(function(block) { return block.type === 'code'; })
    .map(function(block) { return block.text; });
}
function Source (lang) {
  this.compileRE(lang);
  this.ignore = false;
  this.openSection = this.code = [];
  this.sections = {};
}
Source.prototype.re = {
  section: /^(?:com(==|!!)) *(.*?)(?: *\1com *)?\n\n?([\s\S]*)$/.source,
  ref: /^( *)com:: *(.*?)(?: *::com)? *$/.source,
};
Source.prototype.compileRE = function (lang) {
  const comment = quoteRE(commentSymbol(lang) || '//');

  this.re = {
    section: new RegExp(this.re.section.replace(/com/g, comment)),
    heading: /^(==|!!) *(.*?)(?: *\1)?$/,
    ref: new RegExp(this.re.ref.replace(/com/g, comment), 'mg'),
  };
};
Source.prototype.push = function (block) {
  switch(block.type) {
    case 'heading': if (block.depth === 2) this.heading(block); break;
    case 'code': this.codeblock(block); break;
  }
};
Source.prototype.heading = function (block) {
  const match = block.text.match(this.re.heading);
  this.ignore = false;

  if (!match) {
    this.openSection = this.code;
    return;
  }

  switch(match[1]) {
    case '!!': this.ignore = true; break;
    case '==': this.openSection = this.section(match[2]); break;
  }
};
Source.prototype.codeblock = function (block) {
  if (this.ignore)
    return;

  const match = block.text.match(this.re.section);

  if (!match) {
    this.openSection.push(block.text);
    return;
  }

  if (match[1] === '!!')
    return;

  this.section(match[2]).push(match[3]);
};
Source.prototype.section = function (name) {
  return this.sections[name] || (this.sections[name] = [])
};
Source.prototype.assemble = function () {
  let code = this.code.join('\n');
  let depth = 0;
  let tmp;

  while(depth < 50) {
    tmp = this.resolveReferences(code);
    if (code === tmp) break;
    code = tmp;
    depth++;
  }

  if (depth === 50) error('Recursion limit exceeded');
  if (!/\n$/.test(code)) code += '\n';
  return code;
};
Source.prototype.resolveReferences = function (code) {
  const sections = this.sections;
  return code.replace(this.re.ref, function (match, leading, name) {
    return sections[name]
      ? indent(sections[name].join('\n'), leading)
      : match;
  });
}
const { values: opts, positionals: args } = parseArgs({
  options: {
    dir:  { type: 'string',  short: 'd' },
    help: { type: 'boolean', short: 'h' },
  },
  allowPositionals: true,
  strict: true,
});
if (opts.help || !args.length) {
  console.log('Usage: writ [options] <glob ...>\n\nExample:  writ "src/*.md" --dir build\n\nOptions:\n  -d, --dir <path>  change output directory\n  -h, --help        display this help');
  process.exit(0);
}
const inputs = args.reduce(function (out, fileglob) {
  return out.concat(fs.globSync(fileglob));
}, []);

if (!inputs.length)
  error("Globs didn't match any source files");
if (opts.dir && !fs.existsSync(opts.dir))
  error('Directory does not exist: ' + JSON.stringify(opts.dir));

const outputDir = opts.dir;
inputs.forEach(function (file) {
  writ(file, outputDir);
});
function quoteRE (str) {
  return str.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
}
function commentSymbol (lang) {
  const slash = ['js', 'c', 'h', 'cpp', 'cs', 'php', 'm', 'java', 'scala'];
  const pound = ['coffee', 'litcoffee', 'ls', 'rb', 'py'];
  const dash = ['hs', 'lua'];
  const percent = ['erl', 'hrl'];

  if (slash.indexOf(lang) >= 0) return '//';
  if (pound.indexOf(lang) >= 0) return '#';
  if (dash.indexOf(lang) >= 0) return '--';
  if (percent.indexOf(lang) >= 0) return '%';
}
function indent (text, leading) {
  return text.replace(/^.*\S+.*$/mg, leading + '$&');
}
function error (msg) {
  console.error(msg);
  process.exit(1);
}
