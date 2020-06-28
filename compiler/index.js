const { parse: parseHtml, TextNode } = require("node-html-parser");
const fs = require("fs");
const nodepath = require("path");

const jsonify = (current) => {
  if (!current.tagName) return { TextNode: true, rawText: current.rawText };
  return {
    tagName: current.tagName,
    attributes: current.attributes ? current.attributes : {},
    childNodes: current.childNodes.map((n) => jsonify(n)),
    rawText: current.rawText,
    innerHTML: current.innerHTML,
    outerHTML: current.outerHTML,
  };
};

const copy = (object) => JSON.parse(JSON.stringify(object));

const parseFunction = (trace, node, data) => [
  node.rawText
    .split("\n")
    .map((v) => v.trim())
    .join("")
    .replace(/EXTRACT\.(\w+)\.HERE/, (_, m) => {
      if (!data[m]) return JSON.stringify(createError(`Cannot extract inexistant component '${m}'`, trace));
      if (data[m].type === "direct") return JSON.stringify(compile(trace, copy(data[m].node), data, compile(trace, node, data, {}, m), m));
      else if (data[m].type === "file") {
        return JSON.stringify(fromFile(data[m].path, compile(trace, node, data, {}, m), trace.dev_mode));
      }
    }),
];

const firstAttr = (node) => Object.keys(node.attributes)[0];

const shiftAttr = (node) => {
  let name = firstAttr(node);
  delete node.attributes[name];
  return name;
};

const compile = (trace, current, data, caller, isComponent) => {
  let res = {
    tag: current.tagName,
    inner: [],
    attr: current.attributes,
    name: isComponent,
    init: [],
  };

  if (!current.attributes) console.log(current);
  if (res.attr.raw !== undefined) {
    delete res.attr.raw;
    res.inner.push(current.innerHTML);
  } else
    for (let node of current.childNodes) {
      if (node.TextNode) {
        let text = res.attr.notrim !== undefined ? node.rawText : node.rawText.trim();
        if (text) res.inner.push(text);
      } else
        switch (node.tagName) {
          case "use": {
            let key = shiftAttr(node);
            if (key == undefined) return createError("Missing reference name in object utilization or there was a component loop.", { ...trace, node });
            if (!data[key]) return createError(`Component '${key}' does not exist.`, { ...trace, node });
            if (data[key].type === "direct") res.inner.push(compile(trace, copy(data[key].node), data, compile(trace, node, data, caller, key), key));
            else if (data[key].type === "file") {
              res.inner.push(fromFile(data[key].path, compile(trace, node, data, caller, key), trace.dev_mode));
            }
            break;
          }
          case "super": {
            res.inner.push(...caller.inner);
            res.attr = { ...res.attr, ...caller.attr };
            break;
          }
          case "script": {
            if (isComponent && shiftAttr(node) === "init") res.init.push(parseFunction({ ...trace, node }, node, data)[0]);
            else res.inner.push(parseFunction({ ...trace, node }, node, data));
            break;
          }
          default: {
            res.inner.push(compile(trace, node, data, caller));
            break;
          }
        }
    }
  if (caller.init && isComponent) res.init.push(...caller.init);
  if (!res.init[0]) delete res.init;
  if (Object.keys(res.attr).length === 0) delete res.attr;
  return res;
};

const createError = (message, trace) => {
  console.log(trace);
  console.log(`\x1b[31mInassembly Compile Error: \n${message} \nat ${nodepath.join(__dirname, trace.path)}\n\x1b[36m${trace.node.outerHTML}\x1b[0m\n`);
  return trace.dev_mode
    ? {
        tag: "div",
        attr: { style: "font-family: monospace; color: red; " },
        inner: [
          "Inassembly Compile Error:",
          { tag: "br" },
          message,
          { tag: "br" },
          `at ${nodepath.join(__dirname, trace.path)}`,
          { tag: "br" },
          { tag: "span", attr: { style: "color: dodgerblue;" }, inner: [trace.node.outerHTML] },
        ],
      }
    : { tag: "span", inner: ["An error occured while creating this view. Sorry."] };
};

const fromFile = (path, caller = {}, dev_mode = false) => {
  let content;
  path = path.endsWith(".html") ? path : path + ".html";
  try {
    content = fs.readFileSync(path);
  } catch {
    console.log(`\x1b[31mInassembly Compile Error: \nFailed to parse content from an inexistant file\npath: ${nodepath.join(__dirname, path)}\x1b[0m`);
  }
  let root = parseHtml(content, { script: true, pre: true, style: true });
  let data = {},
    exported,
    export_node;

  for (let node of root.childNodes) {
    if (!(node instanceof TextNode))
      switch (node.tagName) {
        case "import": {
          if (firstAttr(node) == undefined) return createError("Missing reference name in component importation", { node, path, dev_mode });
          if (!node.rawText) return createError("Missing file path in component importation", { node, path, dev_mode });
          data[shiftAttr(node)] = { type: "file", path: node.rawText };
          break;
        }
        case "export": {
          if (firstAttr(node) == undefined) return createError("Missing reference name in component exportation", { node, path, dev_mode });
          exported = shiftAttr(node);
          export_node = node;
          break;
        }
        default: {
          if (firstAttr(node) == undefined) return createError("Missing reference name in component declaration", { node, path, dev_mode });
          data[shiftAttr(node)] = { type: "direct", node: jsonify(node) };
        }
      }
  }
  if (!exported) {
    console.log(`\x1b[33mMissing component exportation\nat ${nodepath.join(__dirname, path)}\x1b[0m\n`);
    return {};
  }

  if (!data[exported]) return createError(`Component '${exported}' does not exist.`, { node: export_node, path, dev_mode });
  if (data[exported].type !== "direct") return createError(`Cannot export directly imported component`, { node: export_node, path, dev_mode });
  return compile({ path, dev_mode }, data[exported].node, data, caller, exported);
};

function byteLength(str) {
  var s = str.length;
  for (var i = str.length - 1; i >= 0; i--) {
    var code = str.charCodeAt(i);
    if (code > 0x7f && code <= 0x7ff) s++;
    else if (code > 0x7ff && code <= 0xffff) s += 2;
    if (code >= 0xdc00 && code <= 0xdfff) i--;
  }
  return s;
}

const v2Adapter = (object) => {
  if (typeof object == "string") return object;
  if (object instanceof Array) return object;
  let res = [];
  if (object.name) res.push(...(object.init ? object.init : []));
  res.push(object.tag || "div");
  if (object.attr) res.push(object.attr);
  for (let node of object.inner) res.push(v2Adapter(node));
  return res;
};

module.exports = {
  devassemble: (path) => {
    let prev = Date.now();
    let res = v2Adapter(fromFile(path, {}, true));
    let after = Date.now();
    let size = byteLength(JSON.stringify(res));
    console.log(`\x1b[32mCompiled ${path}\x1b[36m\nwith size of ${size / 1000}kB in ${after - prev}ms\x1b[0m\n`);
    return res;
  },
  assemble: (path) => v2Adapter(fromFile(path)),
};
