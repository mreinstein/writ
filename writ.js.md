writ · source
=============

**Writ** is a command-line tool for enabling a Markdown-based literate
programming workflow.

The main idea is that you write your source code in Markdown and use the `writ`
CLI to compile your Markdown files to your target language of choice.

```javascript
#!/usr/bin/env node

import fs     from 'fs';
import cli    from 'commander';
import path   from 'path';
import glob   from 'glob';
import marked from 'marked';
```


Processing Files
----------------

The `writ` function is the IO sandwich around the compilation process. It reads
an input file, calls the `compile` function for the actual work, and writes the
result to the correct destination.

```javascript
function writ (file, outputDir) {
  const mdfile = read(file);
  const source = compile(mdfile.src, mdfile.lang);
  fs.writeFileSync(out(file, outputDir), source);
}
```

The `read` function is a helper that reads a file and extracts the language
from the extension. For example, `foo.c.md` would yield `c` as the language.

```javascript
function read (file) {
  const parts = file.split('.');

  return {
    src: fs.readFileSync(file, 'utf8'),
    lang: parts[parts.length - 2]
  };
}
```

The `out` function calculates the file name of the target file. The file's name
is determined by stripping off the `.md` or `.markdown` extension, and the path
is `outputDir` if specified, or the path to the Markdown source if not.

```javascript
function out (file, outputDir) {
  const outname = path.basename(file).replace(/\.md$|\.markdown$/, '');
  const outpath = outputDir || path.dirname(file);
  return path.join(outpath, outname);
}
```


Compilation
-----------

The `compile` function is the entry point to the actual compilation work.

```javascript
function compile (src, lang) {
  const source = new Source(lang);
  marked.lexer(src).forEach(function(block) { source.push(block); });
  return source.assemble();
}
```

The `codeblocks` function takes advantage of the Markdown lexer that the
[marked][marked] library exposes to return an Array of just the code blocks
from the given `src`.

```javascript
function codeblocks (src) {
  return marked.lexer(src)
    .filter(function(block) { return block.type === 'code'; })
    .map(function(block) { return block.text; });
}
```

The `Source` object is the compilation engine.

```javascript 
function Source (lang) {
  this.compileRE(lang);
  this.ignore = false;
  this.openSection = this.code = [];
  this.sections = {};
}
```

The first thing we do is compile the regexen we'll need to parse out the
comment directives. We store templates for the regular expressions on the
prototype. The `com` strings are placeholders to be filled in when we know the
language we're compiling to.

```javascript
Source.prototype.re = {
  section: /^(?:com(==|!!)) *(.*?)(?: *\1com *)?\n\n?([\s\S]*)$/.source,
  ref: /^( *)com:: *(.*?)(?: *::com)? *$/.source,
};
```

The `compileRE` method does the work of building the regexen for `lang`.

```javascript
Source.prototype.compileRE = function (lang) {
  const comment = quoteRE(commentSymbol(lang) || '//');

  this.re = {
    section: new RegExp(this.re.section.replace(/com/g, comment)),
    heading: /^(==|!!) *(.*?)(?: *\1)?$/,
    ref: new RegExp(this.re.ref.replace(/com/g, comment), 'mg'),
  };
};
```

Credit to [Simon Willison and Colin Snover][escapere] for this little function
which escapes special characters for inclusion in regular expressions.

```javascript
//== utilities ==//

function quoteRE (str) {
  return str.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
}
```

We also now need a function from common language extensions to their respective
single-line comment symbols.

```javascript
//== utilities ==//

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
```

The `push` method accepts the incoming stream of blocks and dispatches them
according to their type. Everything but H2s and code blocks are ignored.

```javascript
Source.prototype.push = function (block) {
  switch(block.type) {
    case 'heading': if (block.depth === 2) this.heading(block); break;
    case 'code': this.codeblock(block); break;
  }
};
```

The `heading` method handles named sections by header.

```javascript
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
```

The `codeblock` method collects code blocks, putting them in the appropriate places
(or ignoring them) depending on their comment directive.

```javascript
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
```

A little helper method for getting a section by name. If the section name
doesn't exist already, initialize it with an empty array.

```javascript
Source.prototype.section = function (name) {
  return this.sections[name] || (this.sections[name] = [])
};
```

The `assemble` method resolves any references via a recursive substitution
process. The recursion bottoms out when resolving the reference doesn't change
the code anymore, or if it hits 50 iterations, at which point we complain and
then die.

```javascript
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
```

To resolve a reference, look it up in `this.sections`. If it doesn't exist,
just pass through the reference comment directive as-is.

```javascript
Source.prototype.resolveReferences = function (code) {
  const sections = this.sections;
  return code.replace(this.re.ref, function (match, leading, name) {
    return sections[name]
      ? indent(sections[name].join('\n'), leading)
      : match;
  });
}
```


The CLI
-------

The CLI is very straightforward. It accepts globs for the Markdown source files
and a `--dir` option to change the compilation output directory.

By default, **writ** writes generates compiled source files alongside their
respective Markdown progenitors.

**Writ** uses [commander][commander] for options parsing.

```javascript
cli.usage('[options] <glob ...>')
   .option('-d, --dir <path>', 'change output directory')
   .parse(process.argv);
```

We can't do anything if no files are specified, so just print the usage and
exit.

```javascript
if (!cli.args.length)
  cli.help();
```

[node-glob][glob] helps us grab all the specified files. If none match the
glob, print an error and exit.


```javascript
const inputs = cli.args.reduce(function (out, fileglob) {
  return out.concat(glob.sync(fileglob));
}, []);

if (!inputs.length)
  error("Globs didn't match any source files");
```

If an output directory was specified but doesn't exist, print an error and
exit.

```javascript
if (cli.dir && !fs.existsSync(cli.dir))
  error('Directory does not exist: ' + JSON.stringify(cli.dir));

const outputDir = cli.dir;
```

Finally, process all the files

```javascript
inputs.forEach(function (file) {
  writ(file, outputDir);
});
```

Utilities
---------

Make sure utilities defined elsewhere get into the compiled file.

```javascript
//:: utilities :://
```

Prefixes each line of `text` with `leading`.

```javascript
function indent (text, leading) {
  return text.replace(/^.*\S+.*$/mg, leading + '$&');
}
```

Print an error message and die.

```javascript
function error (msg) {
  console.error(msg);
  process.exit(1);
}
```


[marked]: https://github.com/chjj/marked
[glob]: https://github.com/isaacs/node-glob
[commander]: https://github.com/visionmedia/commander.js
[escapere]: http://simonwillison.net/2006/Jan/20/escape/
