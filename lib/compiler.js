// [&laquo; Back to Index](index.html)

var util   = require('util')
  , g      = require('./grammar')
  , Lexer  = require('./lexer')
  , Parser = require('./parser')
  , Node   = Parser.Node
  
var Compiler = module.exports = function Compiler(source, opts) {
  opts = opts || {};

  this._onlyTree     = (typeof opts.tree != 'undefined') ? opts.tree : false;
  this._onlySource   = (typeof opts.source != 'undefined') ? opts.source : false;
  this._bareFunc     = (typeof opts.bare != 'undefined') ? opts.bare : false;
  this._optimize     = false;
  
  this._cbFunc    = "__ajs.cb";
  this._outFunc   = "__ajs.out";
  this._escFunc   = "__ajs.esc";
  this._lineFunc  = "__ajs.ln";
  this._endFunc   = "__ajs.end";
  this._errFunc   = "__ajs.err";

  this.filename   = opts.filename;
  this.source     = source;
  this.line       = 1;
  this.lineCount  = 1;
  this.stack      = [];
  this.compiled   = "";
}

Compiler.prototype.compile = function() {
  var lexer = new Lexer(this.source, {includeComments: false})
    , self = this;
    
  this.tree = new Parser(lexer).parse();
  this.lineCount = lexer._line;
  
  if(this._onlyTree) return this.tree;
  
  this.compiled = "var include = __ajs.inc\n" +
                  "  , render  = __ajs.ren\n" +
                  "  , print   = __ajs.out;\n" +
                  "with(__locals) {\n" + 
                    "try {\n" +
                      this._make(this.tree) + ";\n" + this._endFunc + "();\n" +
                    "} catch(e) { " + this._errFunc +"(e) }\n" +
                  "}";
  
  var fn = new Function('__ajs, __locals', this.compiled);

  if(this._onlySource) return fn.toString();
  
  return fn;
}

Compiler.prototype._make = function(node) {
  var type = node.type;
  var gen = this[type];
  if (!gen) throw new Error("Can't find generator for \"" + type + "\"");
  this.stack.push(node);
  var compiled = this[type].apply(this, node.children.slice());
  this.stack.pop();
  return compiled;
}

var proto = Compiler.prototype;

proto[Node.ROOT] = function(statements) {
  return this._blockStatements(statements).join("; \n");
};

proto[Node.OUTPUT] = function(output) {
  return this._format([this._outFunc + "('" + formatOutput(output).replace(/[\n]+/g, '\\n') + "')"]);
};

proto[Node.ESCAPED] = function(statement) {
  return this._format([this._escFunc + "(" + formatEmbed(this[Node.STATEMENT](statement)) + ")"]);
};

proto[Node.EMBED] = function(statement) {
  return this._format([this._outFunc + "(" + this._escFunc + "(" + formatEmbed(this[Node.STATEMENT](statement)) + "))"]);
};

proto[Node.EMBED_RAW] = function(statement) {
  return this._format([this._outFunc + "(" + formatEmbed(this[Node.STATEMENT](statement)) + ")"]);
};

proto[Node.BLOCK] = function(statements) {
  if (!statements) return ";";
  if (statements.length == 0) return "{}";
  var statements = this._optimize ? this._optimizeOutputNodes(statements) : statements;
  return "{" + this._blockStatements(statements).join('; ') + "}";
};



proto[Node.STRING] = function(str) {
  var dq = 0, sq = 0;
  str = str.replace(/[\\\b\f\n\r\t\x22\x27\u2028\u2029]/g, function(s){
    switch (s) {
      case "\\": return "\\\\";
      case "\b": return "\\b";
      case "\f": return "\\f";
      case "\n": return "\\n";
      case "\r": return "\\r";
      case "\t": return "\\t";
      case "\u2028": return "\\u2028";
      case "\u2029": return "\\u2029";
      case '"': ++dq; return '"';
      case "'": ++sq; return "'";
    }
    return s;
  });
  if (this.asciiOnly) str = toAscii(str);
  if (dq > sq) return "'" + str.replace(/\x27/g, "\\'") + "'";
  else return '"' + str.replace(/\x22/g, '\\"') + '"';
}

proto[Node.NUMBER] = function(num) {
  var str = num.toString(10), a = [ str.replace(/^0\./, ".") ], m;
  if (Math.floor(num) === num) {
    a.push("0x" + num.toString(16).toLowerCase(), // probably pointless
           "0" + num.toString(8)); // same.
    if ((m = /^(.*?)(0+)$/.exec(num))) {
      a.push(m[1] + "e" + m[2].length);
    }
  } else if ((m = /^0?\.(0+)(.*)$/.exec(num))) {
    a.push(m[2] + "e-" + (m[1].length + m[2].length),
           str.substr(str.indexOf(".")));
  }
  return bestOf(a);
}

proto[Node.NAME] = function(name) {
  name = name.toString();
  if (this.asciiOnly) name = toAscii(name);
  return name;
}

proto[Node.VAR] = function(defs) {
  return "var " + addCommas(MAP(defs, this._make.bind(this))) + ";";
}

proto[Node.VAR_DEF] = function(name, val) {
  if (val != null) name = this._format([ this[Node.NAME](name), "=", this._parenthesize(val, Node.SEQUENCE) ]);
  return name;
}

proto[Node.CONST] = function(defs) {
  return "const " + addCommas(MAP(defs, this._make.bind(this))) + ";";
}
  
proto[Node.TRY] = function(tr, ca, fi) {
  var out = [ "try", this[Node.BLOCK](tr) ];
  if (ca) out.push("catch", "(" + ca[0] + ")", this[Node.BLOCK](ca[1]));
  if (fi) out.push("finally", this[Node.BLOCK](fi));
  return this._format(out);
}

proto[Node.THROW] = function(expr) {
  return this._format([ "throw", this._make(expr) ]) + ";";
}
  
proto[Node.NEW] = function(ctor, args) {
  args = args.length > 0 ? "(" + addCommas(MAP(args, this._make.bind(this))) + ")" : "";
  return this._format([ "new", this._parenthesize(ctor, Node.SEQUENCE, Node.BINARY, Node.TERNARY, Node.ASSIGN, function(expr){
    var w = this._astWalker(), has_call = {};
    try {
      w.withWalkers({
        "N_CALL": function() { throw has_call },
        "N_FUNCTION": function() { return this }
      }, function(){ w.walk(expr); });
    } catch(ex) {
      if (ex === has_call)
        return true;
      throw ex;
    }
  }) + args ]);
}

proto[Node.SWITCH] = function(expr, body) {
  return this._format([ "switch", "(" + this._make(expr) + ")", this._switchBlock(body) ]);
}

proto[Node.BREAK] = function(label) {
  var out = "break";
  if (label != null)
    out += " " + this[Node.NAME](label);
  return out + ";";
}

proto[Node.CONTINUE] = function(label) {
  var out = "continue";
  if (label != null)
    out += " " + this[Node.NAME](label);
  return out + ";";
}
  
proto[Node.TERNARY] = function(co, th, el) {
  return this._format([ this._parenthesize(co, Node.ASSIGN, Node.SEQUENCE, Node.TERNARY), "?",
                      this._parenthesize(th, Node.SEQUENCE), ":",
                      this._parenthesize(el, Node.SEQUENCE) ]);
}

proto[Node.ASSIGN] = function(op, lvalue, rvalue) {
  if (op && op !== true) op += "=";
  else op = "=";
  return this._format([ this._make(lvalue), op, this._parenthesize(rvalue, Node.SEQUENCE) ]);
}

proto[Node.DOT] = function(expr) {
  var out = this._make(expr), i = 1;
  if (expr.type == Node.NUMBER) {
    if (!/\./.test(expr.children[0]))
            out += ".";
  } else if (this._needsParens(expr))
    out = "(" + out + ")";
  while (i < arguments.length)
    out += "." + this[Node.NAME](arguments[i++]);
  return out;
}

proto[Node.CALL] = function(func, args, node) {
  var f = this._make(func);
  if (this._needsParens(func))
    f = "(" + f + ")";
  var self = this;
  return f + "(" + addCommas(MAP(args, function(expr){
    var val = self._parenthesize(expr, Node.SEQUENCE);
    if(expr.type == Node.NAME || (expr.type == Node.FUNCTION && needsCbWrap(func))) {
      val = self._wrapCb(val);
    }
    return val;
  })) + ")";
}

proto[Node.FUNCTION] = proto[Node.DEFUN] = function(name, args, body, keyword) {
  var out = keyword || "function";
  if (name) out += " " + this[Node.NAME](name);
  out += "(" + addCommas(MAP(args, this[Node.NAME])) + ")";
  return this._format([ out, this[Node.BLOCK](body) ]);
}

proto[Node.IF] = function(co, th, el) {
  var out = [ "if", "(" + this._make(co) + ")", el ? this._then(th) : this._make(th) ];
  if (el) {
    out.push("else", this._make(el));
  }
  return this._format(out);
}

proto[Node.FOR] = function(init, cond, step, block) {
  var out = [ "for" ];
  init = (init != null ? this._make(init) : "").replace(/;*\s*$/, ";");
  cond = (cond != null ? this._make(cond) : "").replace(/;*\s*$/, ";");
  step = (step != null ? this._make(step) : "").replace(/;*\s*$/, "");
  var args = init + cond + step;
  if (args == "; ; ") args = ";;";
  out.push("(" + args + ")", this._make(block));
  return this._format(out);
}

proto[Node.FOR_IN] = function(vvar, key, hash, block) {
  return this._format([ "for", "(" +
                      (vvar ? this._make(vvar).replace(/;+$/, "") : this._make(key)),
                      "in",
                      this._make(hash) + ")", this._make(block) ]);
}
  
proto[Node.WHILE] = function(condition, block) {
  return this._format([ "while", "(" + this._make(condition) + ")", this._make(block) ]);
}
  
proto[Node.DO] = function(condition, block) {
  return this._format([ "do", this._make(block), "while", "(" + this._make(condition) + ")" ]) + ";";
}
  
proto[Node.RETURN] = function(expr) {
  var out = [ "return" ];
  if (expr != null) out.push(this._make(expr));
  return this._format(out) + ";";
}
  
proto[Node.BINARY] = function(op, lvalue, rvalue) {
  var left = this._make(lvalue), right = this._make(rvalue);
  if (member(lvalue.type, [ Node.ASSIGN, Node.TERNARY, Node.SEQUENCE ]) ||
    lvalue.type == Node.BINARY && g.precedence(op) > g.precedence(lvalue.children[0])) {
        left = "(" + left + ")";
  }
  if (member(rvalue.type, [ Node.ASSIGN, Node.TERNARY, Node.SEQUENCE ]) ||
    rvalue.type == Node.BINARY && g.precedence(op) >= g.precedence(rvalue.children[0]) &&
    !(rvalue.children[0] == op && member(op, [ "&&", "||", "*" ]))) {
      right = "(" + right + ")";
  }
  return this._format([ left, op, right ]);
}
  
proto[Node.UNARY_PREFIX] = function(op, expr) {
  var val = this._make(expr);
  if (!(expr.type == Node.NUMBER || (expr.type == Node.UNARY_PREFIX && !g.is_operator(op + expr.children[0])) || !this._needsParens(expr)))
    val = "(" + val + ")";
  return op + (g.is_alphanumeric(op.charAt(0)) ? " " : "") + val;
}
  
proto[Node.UNARY_POSTFIX] = function(op, expr) {
  var val = this._make(expr);
  if (!(expr.type == Node.NUMBER || (expr.type == Node.UNARY_POSTFIX && !g.is_operator(op + expr.children[0])) || !this._needsParens(expr)))
    val = "(" + val + ")";
  return val + op;
}

proto[Node.SUBSCRIPT] = function(expr, subscript) {
  var hash = this._make(expr);
  if (this._needsParens(expr))
    hash = "(" + hash + ")";
  return hash + "[" + this._make(subscript) + "]";
}
  
proto[Node.OBJECT] = function(exprList) {
  if (exprList.children.length == 0)
    return "{}";
  var self = this;
  return "{" + MAP(exprList.children, function(p){
      if (p.length == 3) {
        // getter/setter.  The name is in p[0], the arg.list in p[1][2], the
        // body in p[1][3] and type ("get" / "set") in p[2].
        return self[Node.FUNCTION](p[0], p[1][2], p[1][3], p[2]);
      }
      var key = p[0], val = self._make(p[1]);
      if ((typeof key == "number" || +key + "" == key)
           && parseFloat(key) >= 0) {
        key = self[Node.NUMBER](+key);
      } else if (!g.is_identifier(key)) {
        key = self[Node.STRING](key);
      }
      return self._format([ key + ":", val ]);
    }).join(",") + "}";
}

proto[Node.REGEXP] = function(rx, mods) {
  return "/" + rx + "/" + mods;
}
  
proto[Node.ARRAY] = function(elements) {
  if (elements.length == 0) return "[]";
  var self = this;
  return "[" + addCommas(MAP(elements, function(expr){
    if (expr.type == Node.ATOM && expr.children[0] == "undefined") return "";
    return self._parenthesize(expr, Node.SEQUENCE);
  })) + "]";
}
proto[Node.STATEMENT] = function(stmt) {
  return this._make(stmt).replace(/;*\s*$/, "");
}
  
proto[Node.SEQUENCE] = function() {
  return addCommas(MAP(slice(arguments), this._make.bind(this)));
}
  
proto[Node.LABEL] = function(name, block) {
  return this._format([ this[Node.NAME](name), ":", this._make(block) ]);
}
  
proto[Node.WITH] = function(expr, block) {
  return this._format([ "with", "(" + this._make(expr) + ")", this._make(block) ]);
}
  
proto[Node.ATOM] = function(name) {
  return this[Node.NAME](name);
}

// other generators not matching a node type

Compiler.prototype._blockStatements = function (statements) {
  for (var a = [], last = statements.length - 1, i = 0; i <= last; ++i) {
    var stat = statements[i];
    var code = this._make(stat);
    
    if(this._lineFunc && stat.line && stat.line != this.line && (!stat.children[0] || !member(stat.children[0].type, [Node.NAME, Node.STRING]))) {
      code = this._lineFunc + "(" + stat.line + "); "  + code;
      this.line = stat.line;
    }
    
    if (code != ";") {
      if (i == last) {
        if ((stat.type == Node.WHILE && emptyBlock(stat.children[1])) ||
            (member(stat.type, [ Node.FOR, Node.FOR_IN] ) && emptyBlock(stat.children[3])) ||
            (stat.type == Node.IF && emptyBlock(stat.children[1]) && !stat.children[2]) ||
            (stat.type == Node.IF && stat.children[2] && emptyBlock(stat.children[2]))) {
                code = code.replace(/;*\s*$/, ";");
        } else {
          code = code.replace(/;+\s*$/, "");
        }
      }
      a.push(code);
    }
  }
  return a;
};

Compiler.prototype._switchBlock = function(body) {
  var n = body.length;
  if (n == 0) return "{}";
  return "{" + MAP(body, function(branch, i){
    var has_body = branch[1].length > 0,
        code = (branch[0]
          ? this._format([ "case", this._make(branch[0]) + ":" ])
          : "default:") + (has_body ? this._blockStatements(branch[1]).join('') : "")
    if (has_body && i < n - 1) code += ";";
    return code;
  }).join('') + "}";
}

Compiler.prototype._then = function(th) {
  if (th.type == Node.DO) {
    return this._make(new Node(Node.BLOCK, th));
  }
  var b = th;
  while (true) {
    var type = b.type;
    if (type == Node.IF) {
      if (!b.children[2])
        // no else, we must add the block
        return this._make(new Node(Node.BLOCK, th));
      b = b.children[2];
    }
    else if (type == Node.WHILE || type == Node.DO) b = b.children[1];
    else if (type == Node.FOR || type == Node.FOR_IN) b = b.children[3];
    else break;
  }
  return this._make(th);
};

Compiler.prototype._parenthesize = function(expr) {
  var gen = this._make(expr);
  for (var i = 1; i < arguments.length; ++i) {
    var el = arguments[i];
    if ((el instanceof Function && el.apply(this, [expr])) || expr.type == el)
      return "(" + gen + ")";
  }
  return gen;
}

Compiler.prototype._needsParens = function(node) {
  if (node.type == Node.FUNCTION || node.type == Node.OBJECT) {
    var a = slice(this.stack), self = a.pop(), p = a.pop();
    while (p) {
      if (p.type == Node.STATEMENT) return true;
      if (
          ((member(p.type, [Node.SEQUENCE, Node.CALL, Node.DOT, Node.SUBSCRIPT, Node.TERNARY])) && p.children[0] === self) ||
          ((member(p.type, [Node.BINARY, Node.ASSIGN, Node.UNARY_POSTFIX])) && p.children[1] === self)
      ) {
        self = p;
        p = a.pop();
      } else {
        return false;
      }
    }
  }
  return needsParens(node.type);
}

Compiler.prototype._optimizeOutputNodes = function(statements) {
  if(statements.length < 2) return statements;

  var newStats = []
    , binStat = new Node(Node.BINARY, '+');
  
  statements.forEach(function(stat, i, list) {
    switch(stat.type) {
      case Node.OUTPUT:
        addStat(new Node(Node.STRING, formatOutput(stat.children[0])));
      break;
      case Node.EMBED:
        addStat(new Node(Node.ESCAPED, stat.children[0]));
      break;
      case Node.EMBED_RAW:
        addStat(stat.children[0]);
      break;
      default:
        if(i < list.length - 1) {
          nextEmbed(stat);
        }
    }
  });
  nextEmbed();
  
  return newStats.length ? newStats : statements;
  
  function addStat(stat) {
    if(binStat.children.length < 3)
      binStat.push(stat);
    else binStat = new Node(Node.BINARY, '+', binStat, stat);
  }
  
  function nextEmbed(stat) {
    if(binStat.children.length < 3) {
      if(stat) newStats.push(stat);
      return;
    }
    var node = new Node(Node.EMBED_RAW, new Node(Node.STATEMENT, binStat));
    if(stat) node.line = stat.line;
    newStats.push(node);
    binStat = new Node(Node.BINARY, '+');
  }
}

Compiler.prototype._wrapCb = function(arg) {
  return this._cbFunc + "(" + arg + ")";
}

Compiler.prototype._format = function(args) {
  return args.join(' ');
}


Compiler.prototype._astWalker = function(ast) {
  var user = {}
    , stack = []
    , self = this
    , walkers = {
      "N_NAME": function(name) {
        return [ this.type, name ]; // maybe needs a new node?
      }
    , "N_DOT": function(expr) {
        return [ this[0], walk(expr) ].concat(slice(arguments, 1));
      }
    };

  function walk(ast) {
    if (ast == null) return null;
    try {
      stack.push(ast);
      var type = ast.type;
      var gen = user[type];
      if (gen) {
        var ret = gen.apply(ast, ast.children);
        if (ret != null) return ret;
      }
      gen = walkers[type];
      return gen.apply(ast, ast.children);
    } finally {
      stack.pop();
    }
  };

  function withWalkers(walkers, cont){
    var save = {}, i;
    for (i in walkers) if (HOP(walkers, i)) {
      save[i] = user[i];
      user[i] = walkers[i];
    }
    var ret = cont.call(self);
    for (i in save) if (HOP(save, i)) {
      if (!save[i]) delete user[i];
      else user[i] = save[i];
    }
    return ret;
  };
  
  return {
    walk: walk,
    withWalkers: withWalkers,
    parent: function() {
      return stack[stack.length - 2]; // last one is current node
    },
    stack: function() {
      return stack;
    }
  };
}

// utilities 

var DOT_CALL_NO_PARENS = g.array_to_hash([
  Node.NAME,
  Node.ARRAY,
  Node.OBJECT,
  Node.STRING,
  Node.DOT,
  Node.SUBSCRIPT,
  Node.CALL,
  Node.REGEXP
]);

function needsCbWrap(func) {
  if(g.is_syncronous_call(func.children.slice(-1)[0]))
    return false;

  if (func.children[0].children && func.children[0].children[0] == '_')
    return false;
  
  return true;
}

function needsParens(type) {
  !HOP(DOT_CALL_NO_PARENS, type);
}

function emptyBlock(b) {
  return !b || (b.type == Node.BLOCK && (!b.children[0] || b.children[0].length == 0));
};

function toAscii(str) {
  return str.replace(/[\u0080-\uffff]/g, function(ch) {
    var code = ch.charCodeAt(0).toString(16);
    while (code.length < 4) code = "0" + code;
    return "\\u" + code;
  });
};

function addCommas(args) {
  return args.join(",");
};

function formatOutput(str) {
  return str.replace(/\'/g, "\\'");
}

function formatEmbed(str) {
  return str.replace(/[\n]+/g, '\\n')
}

function bestOf(a) {
  if (a.length == 1) {
    return a[0];
  }
  if (a.length == 2) {
    var b = a[1];
    a = a[0];
    return a.length <= b.length ? a : b;
  }
  return bestOf([ a[0], bestOf(a.slice(1)) ]);
};

function member(name, array) {
  for (var i = array.length; --i >= 0;)
    if (array[i] === name) return true;
  return false;
};

function HOP(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
};

var MAP;

(function(){
  MAP = function(a, f, o) {
    var ret = [];
    for (var i = 0; i < a.length; ++i) {
      var val = f.call(o, a[i], i);
      if (val instanceof AtTop) ret.unshift(val.v);
      else ret.push(val);
    }
    return ret;
  };
  MAP.at_top = function(val) { return new AtTop(val) };
  function AtTop(val) { this.v = val };
})();

function slice(a, start) {
  return Array.prototype.slice.call(a, start == null ? 0 : start);
};
