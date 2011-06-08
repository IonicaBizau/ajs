//     Thanks to mishoo/uglifyjs for most of this!

// [&laquo; Back to Index](index.html)

var util  = require('util')
  , g     = require('./grammar')
  , Token = require('./lexer').Token

// AJS Parser
// -------------

// The parser takes raw token output from the lexer and construct
// an AST (abstract syntax tree) according to Javascript and AJS syntax rules.
var Parser = module.exports = function Parser(lexer, opts) {
  opts = opts || {};
  
  this.lexer = lexer;
  this.tree = [];
  
  this.exigentMode = (opts.exigentMode == true);
  this.embedTokens = (opts.embedTokens == true);
  
  this._token = null;
  this._peeked = null;
  this._prevToken = null;
  this._inFunction = 0;
  this._inLoop = 0;
  this._labels = [];
}


// We use a recursive look-ahead algorithm to build up the AST. Parse a statement
// at a time until we reach the end of the file.
Parser.prototype.parse = function() {
  var self = this

  this._pos = 0;
  
  var self = this;
  this.tree = (function(){
    self._next();
    var statements = [];
    while (!self._tokenIs(Token.EOF))
      statements.push(self._statement());
    return self._node(Node.ROOT, statements);
  })();
  
  return this.tree;
}

Parser.prototype._peek = function() {
  return this._peeked || (this._peeked = this.lexer.nextToken());
};

Parser.prototype._next = function() {
  this._prevToken = this._token;
  if (this._peeked) {
    this._token = this._peeked;
    this._peeked = null;
  } else {
    this._token = this.lexer.nextToken();
  }
  if(!this._token)
    throw new Error('unexpected eof, after:' + this._prev() + this._prev().line);
  return this._token;
};

Parser.prototype._prev = function() {
  return this._prevToken;
};


Parser.prototype._tokenIs = function (type, value) {
  return tokenIs(this._token, type, value);
};

Parser.prototype._tokenIsPunc = function (value) {
  return tokenIs(this._token, Token.PUNCTUATION, value);
};

Parser.prototype._error = function(msg, line, col) {
  throw new Error(msg + " at line " + (line || this.lexer._line) + ", column " + (col || this.lexer._col));
};

Parser.prototype._tokenError = function(token, msg) {
  this._error(msg, token.line, token.col);
};
Parser.prototype._unexpected = function(token) {
  if (token == null) token = this._token;
  this._tokenError(token, "Unexpected token: " + token.type + " (" + token.value + ")");
};

Parser.prototype._expectToken = function(type, val) {
  if (this._tokenIs(type, val)) return this._next();
  this._tokenError(this._token, "Unexpected token " + this._token.type + ", expected " + type);
};

Parser.prototype._expect = function(punc) {
  return this._expectToken(Token.PUNCTUATION, punc);
};

Parser.prototype._canInsertSemicolon = function() {
  return !this.exigentMode && (
    this._token.newLineBefore || this._tokenIs(Token.EOF) || this._tokenIsPunc("}")
  );
};

Parser.prototype._semicolon = function() {
  if (this._tokenIsPunc(";")) this._next();
  else if (!this._canInsertSemicolon() && !this._tokenIs(Token.OUTPUT)) this._unexpected();
};

Parser.prototype._parenthesised = function() {
  this._expect("(");
  var ex = this._expression();
  this._expect(")");
  return ex;
};

Parser.prototype._statement = function() {
  if (this._tokenIs(Token.OPERATOR, "/")) {
    this._peeked = null;
    this._token = this.lexer.nextToken(true); // force regexp
  }
  
  switch (this._token.type) {
    case Token.OUTPUT:
      return this._node(Node.OUTPUT, this._prog1(this._token.value, this._next));
    case Token.EMBED:
      return this._embed();
    case Token.NUMBER:
    case Token.STRING:
    case Token.REGEXP:
    case Token.OPERATOR:
    case Token.ATOM:
      return this._simpleStatement();
    
    case Token.NAME:
      return tokenIs(this._peek(), Token.PUNCTUATION, ":")
              ? this._labeledStatement(this._prog1(this._token.value, this._next, this._next))
              : this._simpleStatement();
    
    case Token.PUNCTUATION:
      switch (this._token.value) {
        case "{":
          return this._node(Node.BLOCK, this._block());
        case "[":
        case "(":
          return this._simpleStatement();
        case ";":
          this._next();
          return this._node(Node.BLOCK);
        default:
          this._unexpected();
      }

    case Token.KEYWORD:
      switch (this._prog1(this._token.value, this._next)) {
        case "break":
          return this._breakCont(Node.BREAK);
        case "continue":
          return this._breakCont(Node.CONTINUE);
        case "debugger":
          this._semicolon();
          return this._node(Node.DEBUGGER);
        case "do":
          var self = this;
          return (function(body){
            self._expectToken(Token.KEYWORD, "while");
            return self._node(Node.DO, self._prog1(self._parenthesised, self._semicolon), body);
          })(this._loop(this._statement));
        case "for":
          return this._for();
        case "function":
          return this._function(true);
        case "if":
          return this._if();
        case "return":
          if (!this._inFunction)
            this._error("'return' outside of function");
          return this._node(Node.RETURN,
                      this._tokenIsPunc(";")
                      ? (this._next(), null)
                      : this._canInsertSemicolon()
                      ? null
                      : this._prog1(this._expression, this._semicolon));
        case "switch":
          return this._node(Node.SWITCH, this._parenthesised(), this._switchBlock());
        case "throw":
          return this._node(Node.THROW, this._prog1(this._expression, this._semicolon));
        case "try":
          return this._try();
        case "var":
          return this._prog1(this._var, this._semicolon);
        case "const":
          return this._prog1(this._const, this._semicolon);
        case "while":
          return this._node(Node.WHILE, this._parenthesised(), this._loop(this._statement));
        case "with":
          return this._node(Node.WITH, this._parenthesised(), this._statement());
        default:
          this._unexpected();
      }
    break;
  }
}

Parser.prototype._embed = function() {
  var type = this._token.value;
  this._next()
  switch (type) {
    case "=":
      return this._node(Node.EMBED, this._statement());
    case "-":
      return this._node(Node.EMBED_RAW, this._statement());
    default: this._unexpected();
  }
}

Parser.prototype._labeledStatement = function(label) {
  this._labels.push(label);
  var start = this._token
    , statNode = this._statement();
  if (this.exigentMode && !g.is_statement_with_label(statNode.type))
    this._unexpected(start);
  this._labels.pop();
  return this._node(Node.LABEL, label, statNode);
};

Parser.prototype._simpleStatement = function() {
  return this._node(Node.STATEMENT, this._prog1(this._expression, this._semicolon));
};

Parser.prototype._breakCont = function(type) {
  var name = this._tokenIs(Token.NAME) ? this._token.value : null;
  if (name != null) {
    this._next();
    if (!member(name, this._labels))
      this._error("Label " + name + " without matching loop or statement");
  } else if (!this._inLoop)
    this._error(type + " not inside a loop or switch");
  this._semicolon();
  return this._node(type, name);
};

Parser.prototype._for = function() {
  this._expect("(");
  var init = null;
  if (!this._tokenIsPunc(";")) {
    init = this._tokenIs(Token.KEYWORD, "var")
            ? (this._next(), this._var(true))
            : this._expression(true, true);
    if (this._tokenIs(Token.OPERATOR, "in"))
      return this._forIn(init);
  }
  return this._regularFor(init);
};

Parser.prototype._regularFor = function(init) {
  this._expect(";");
  var test = this._tokenIsPunc(";") ? null : this._expression();
  this._expect(";");
  var step = this._tokenIsPunc(")") ? null : this._expression();
  this._expect(")");
  return this._node(Node.FOR, init, test, step, this._loop(this._statement));
};

Parser.prototype._forIn = function(init) {
  var lhs = init.type == Node.VAR ? this._node(Node.NAME, init.children[0][0].children[0]) : init;
  this._next();
  var obj = this._expression();
  this._expect(")");
  return this._node(Node.FOR_IN, init, lhs, obj, this._loop(this._statement));
};

Parser.prototype._function = function(inStatement) {
  var name = this._tokenIs(Token.NAME) ? this._prog1(this._token.value, this._next) : null;
  if (inStatement && !name) this._unexpected();
  this._expect("(");
  var self = this;
  return this._node(inStatement ? Node.DEFUN : Node.FUNCTION,
    name,
    (function(first, a){ // arguments
      while (!self._tokenIsPunc(")")) {
        if (first) first = false; else self._expect(",");
        if (!self._tokenIs(Token.NAME)) self._unexpected();
        a.push(self._token.value);
        self._next();
      }
      self._next();
      return a;
    })(true, []),
    (function(){ // body
      ++self._inFunction;
      var loop = self._inLoop;
      self._inLoop = 0;
      var node = self._block();
      --self._inFunction;
      self._inLoop = loop;
      return node;
    })());
};

Parser.prototype._if = function() {
  var cond = this._parenthesised()
    , body = this._statement()
    , belse;
  if (this._tokenIs(Token.KEYWORD, "else")) {
    this._next();
    belse = this._statement();
  }
  return this._node(Node.IF, cond, body, belse);
};

Parser.prototype._block = function() {
  this._expect("{");
  var a = [];
  while (!this._tokenIsPunc("}")) {
    if (this._tokenIs(Token.EOF)) this._unexpected();
    a.push(this._statement());
  }
  this._next();
  return a;
};

Parser.prototype._switchBlock = function() {
  var self = this;
  this._curry(self._loop, function(){
    self._expect("{");
    var node = this._node(Node.BLOCK)
      , cur = null;
    while (!self._tokenIsPunc("}")) {
      if (self._tokenIs(Token.EOF)) self._unexpected();
      if (self._tokenIs(Token.KEYWORD, "case")) {
        self._next();
        cur = this._node(Node.STATEMENT);
        node.push([ self._expression(), cur ]);
        self._expect(":");
      } else if (self._tokenIs(Token.KEYWORD, "default")) {
        self._next();
        self._expect(":");
        cur = this._node(Node.STATEMENT);
        node.push([ null, cur ]);
      } else {
        if (!cur) self._unexpected();
        cur.push(self._statement());
      }
    }
    self._next();
    return node;
  })();
};

Parser.prototype._try = function() {
  var body = this._block()
    , bcatch
    , bfinally;
    
  if (this._tokenIs(Token.KEYWORD, "catch")) {
    this._next();
    this._expect("(");
    if (!this._tokenIs(Token.NAME)) this._error("Name expected");
    var name = this._token.value;
    this._next();
    this._expect(")");
    bcatch = this._node(Node.BLOCK, name, this._block());
  }
  if (this._tokenIs(Token.KEYWORD, "finally")) {
    this._next();
    bfinally = this._block();
  }
  if (!bcatch && !bfinally) this._error("Missing catch/finally blocks");
  return this._node(Node.TRY, body, bcatch, bfinally);
};

Parser.prototype._vardefs = function(noIn) {
  var a = [];
  for (;;) {
    if (!this._tokenIs(Token.NAME)) this._unexpected();
    var name = this._token.value;
    this._next();
    if (this._tokenIs(Token.OPERATOR, "=")) {
      this._next();
      a.push(this._node(Node.VAR_DEF, name, this._expression(false, noIn)));
    } else {
      a.push(this._node(Node.VAR_DEF, name));
    }
    if (!this._tokenIsPunc(","))
      break;
    this._next();
  }
  return a;
};

Parser.prototype._var = function(noIn) {
  return this._node(Node.VAR, this._vardefs(noIn));
};

Parser.prototype._const = function() {
  return this._node(Node.CONST, this._vardefs(noIn));
};

Parser.prototype._new = function() {
  var newexp = this._exprAtom(false)
    , args;
  if (this._tokenIsPunc("(")) {
    this._next();
    args = this._exprList(")");
  } else {
    args = [];
  }
  return this._subscripts(this._node(Node.NEW, newexp, args), true);
};

Parser.prototype._exprAtom = function(allowCalls) {
  if (this._tokenIs(Token.OPERATOR, "new")) {
    this._next();
    return this._new();
  }
  if (this._tokenIs(Token.OPERATOR) && g.is_unary_prefix(this._token.value)) {
    return this._makeUnary(Node.UNARY_PREFIX,
                        this._prog1(this._token.value, this._next),
                        this._exprAtom(allowCalls));
  }
  if (this._tokenIs(Token.PUNCTUATION)) {
    switch (this._token.value) {
      case "(":
        this._next();
        return this._subscripts(this._prog1(this._expression, this._curry(this._expect, ")")), allowCalls);
      case "[":
        this._next();
        return this._subscripts(this._array(), allowCalls);
      case "{":
        this._next();
        return this._subscripts(this._object(), allowCalls);
    }
    return this._unexpected();
  }
  if (this._tokenIs(Token.KEYWORD, "function")) {
    this._next();
    return this._subscripts(this._function(false), allowCalls);
  }
  if (g.is_atomic_start_token(this._token.type)) {
    var atom = this._tokenIs(Token.REGEXP)
            ? this._node(Node.REGEXP, this._token.value[0], this._token.value[1])
            : this._node(Node[this._token.name], this._token.value);
    return this._subscripts(this._prog1(atom, this._next), allowCalls);
  }
  this._unexpected();
};

Parser.prototype._exprList = function(closing, allowTrailingComma, allowEmpty) {
  var first = true
    , a = [];
  while (!this._tokenIsPunc(closing)) {
    if (first) first = false; else this._expect(",");
    if (allowTrailingComma && this._tokenIsPunc(closing)) break;
    if (this._tokenIsPunc(",") && allowEmpty) {
      a.push([ "atom", "undefined" ]);
    } else {
      a.push(this._expression(false));
    }
  }
  this._next();
  return a;
};

Parser.prototype._array = function() {
  return this._node(Node.ARRAY, this._exprList("]", !this._exigentMode, true));
};

Parser.prototype._object = function() {
  var first = true
    , node = this._node(Node.EXPRESSION_LIST);
  while (!this._tokenIsPunc("}")) {
    if (first) first = false; else this._expect(",");
    if (!this._exigentMode && this._tokenIsPunc("}"))
      break; // allow trailing comma
    var type = this._token.type;
    var name = this._propertyName();
    if (type == Token.NAME && (name == "get" || name == "set") && !this._tokenIsPunc(":")) {
      node.push([ this._name(), this._function(false), name ]);
    } else {
      this._expect(":");
      node.push([ name, this._expression(false) ]);
    }
  }
  this._next();
  return this._node(Node.OBJECT, node);
};

Parser.prototype._propertyName = function() {
  switch (this._token.type) {
    case Token.NUMBER:
    case Token.STRING:
      return this._prog1(this._token.value, this._next);
  }
  return this._name();
};

Parser.prototype._name = function() {
  switch (this._token.type) {
    case Token.NAME:
    case Token.OPERATOR:
    case Token.KEYWORD:
    case Token.ATOM:
      return this._prog1(this._token.value, this._next);
    default:
      this._unexpected();
  }
};

Parser.prototype._subscripts = function(expr, allowCalls) {
  
  if (this._tokenIsPunc(".")) {
    this._next();
    return this._subscripts(this._node(Node.DOT, expr, this._name()), allowCalls);
  }
  if (this._tokenIsPunc("[")) {
    this._next();
    return this._subscripts(this._node(Node.SUBSCRIPT, expr, this._prog1(this._expression, this._curry(this._expect, "]"))), allowCalls);
  }
  if (allowCalls && this._tokenIsPunc("(")) {
    this._next();
    return this._subscripts(this._node(Node.CALL, expr, this._exprList(")")), true);
  }
  if (allowCalls && this._tokenIs(Token.OPERATOR) && g.is_unary_postfix(this._token.value)) {
    return this._prog1(this._curry(this._makeUnary, Node.UNARY_POSTFIX, this._token.value, expr),
                 this._next);
  }
  return expr;
};

Parser.prototype._makeUnary = function(name, op, expr) {
  if ((op == "++" || op == "--") && !this._isAssignable(expr))
    this._error("Invalid use of " + op + " operator");
  return this._node(name, op, expr);
};

Parser.prototype._exprOp = function(left, minPrec, noIn) {
  var op = this._tokenIs(Token.OPERATOR) ? this._token.value : null;
  if (op && op == "in" && noIn) op = null;
  var prec = op != null ? g.precedence(op) : null;
  if (prec != null && prec > minPrec) {
    this._next();
    var right = this._exprOp(this._exprAtom(true), prec, noIn);
    return this._exprOp(this._node(Node.BINARY, op, left, right), minPrec, noIn);
  }
  return left;
};

Parser.prototype._exprOps = function(noIn) {
  return this._exprOp(this._exprAtom(true), 0, noIn);
};

Parser.prototype._maybeTernary = function(noIn) {
  var expr = this._exprOps(noIn);
  if (this._tokenIs(Token.OPERATOR, "?")) {
    this._next();
    var yes = this._expression(false);
    this._expect(":");
    return this._node(Node.TERNARY, expr, yes, this._expression(false, noIn));
  }
  return expr;
};

Parser.prototype._isAssignable = function(expr) {
  if (!this.exigentMode) return true;
  switch (expr.type) {
    case Node.DOT:
    case Node.SUBSCRIPT:
    case Node.NEW:
    case Node.CALL:
      return true;
    case Node.NAME:
      return expr.value != "this";
  }
};

Parser.prototype._maybeAssign = function(noIn) {
  var left = this._maybeTernary(noIn)
    , val  = this._token.value;
  if (this._tokenIs(Token.OPERATOR) && g.is_assignment(val)) {
    if (this._isAssignable(left)) {
      this._next();
      return this._node(Node.ASSIGN, g.assignment(val), left, this._maybeAssign(noIn));
    }
    this._error("Invalid assignment");
  }
  return left;
};

Parser.prototype._expression = function(commas, noIn) {
  if (arguments.length == 0)
    commas = true;
  var expr = this._maybeAssign(noIn);
  if (commas && this._tokenIsPunc(",")) {
    this._next();
    return this._node(Node.SEQUENCE, expr, this._expression(true, noIn));
  }
  return expr;
};

Parser.prototype._loop = function(cont) {
  try {
    ++this._inLoop;
    return cont.call(this);
  } finally {
    --this._inLoop;
  }
};

Parser.prototype._curry = function(f) {
  var args = slice(arguments, 1)
    , self = this;
  return function() { return f.apply(self, args.concat(slice(arguments))); };
};

Parser.prototype._prog1 = function(ret) {
  if (ret instanceof Function)
    ret = ret.call(this);
  for (var i = 1, n = arguments.length; --n > 0; ++i)
    arguments[i].call(this);
  return ret;
};

Parser.prototype._node = function(type) {
  var node = new Node(type);
  node.children = Array.prototype.slice.call(arguments, 1);
  node.line = (this._prevToken && this._prevToken.line) || 0;
  return node;
}

var Node = module.exports.Node = function(type) {
  if(typeof type == 'undefined') throw new Error('undefined node type');

  this.type = type;
  this.line = undefined;
  this.children = Array.prototype.slice.call(arguments, 1);
}

Node.prototype.push = function(child) {
  this.children.push(child);
}

Node.prototype.toString = function() {
  return '[' + this.type + ', ' + util.inspect(this.children, false, 10) + ']';
};

var nodeTypes = [
  'arguments'
, 'array'
, 'assign'
, 'atom'
, 'binary'
, 'block'
, 'break'
, 'call'
, 'const'
, 'continue'
, 'debugger'
, 'defun'
, 'do'
, 'dot'
, 'embed'
, 'embed_raw'
, 'escaped'
, 'expression_list'
, 'for'
, 'for_in'
, 'function'
, 'if'
, 'label'
, 'name'
, 'new'
, 'number'
, 'object'
, 'output'
, 'regexp'
, 'return'
, 'root'
, 'sequence'
, 'statement'
, 'string'
, 'switch'
, 'subscript'
, 'ternary'
, 'throw'
, 'try'
, 'unary_postfix'
, 'unary_prefix'
, 'var'
, 'var_def'
, 'while'
, 'with'
];

nodeTypes.forEach(function(name) {
  name = name.toUpperCase()
  Node[name] = 'N_' + name;
});

// utilities

function tokenIs(token, type, value) {
  return token.type == type && (value == null || token.value == value);
}

function slice(a, start) {
  return Array.prototype.slice.call(a, start == null ? 0 : start);
};

function member(name, array) {
  for (var i = array.length; --i >= 0;)
    if (array[i] === name) return true;
  return false;
};

