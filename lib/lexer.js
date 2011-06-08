//     Thanks to mishoo/uglifyjs for most of this!

// [&laquo; Back to Index](index.html)

var g          = require('./grammar')
  , util       = require('util');

// AJS Lexer
// -------------

// The lexer accepts raw AJS source and processes it character-by-character,
// creating token objects that can be interpreted by the parser to
// form an AST (abstract syntax tree).
var Lexer = module.exports = function Lexer(source, opts) {
  opts = opts || {};
  
  this.source = source;
  this.length = source.length;
  
  this.tokens = [];

  this._curToken = null;
  this._line = 1;
  this._col = 1;
  this._pos = 0;
  
  this._embedChar = opts.embedChar || "%";
  this._includeComments = opts.includeComments == true;
  this._newLineBefore = false;
  this._commentsBefore = [];
  this._regexpAllowed = false;
}

Lexer.prototype.tokenize = function() {
  this.tokens = [];

  this._curToken = null;
  this._line = 1;
  this._col = 1;
  this._pos = 0;
  
  this._inEmbed = false;

  this.nextToken();
  while(this._curToken.type != Token.EOF) {
    this.nextToken();
  }
  return this.tokens;
}

Lexer.prototype.nextToken = function() {
  if(this._inEmbed) this._skipWhitespace();

  var ch = this._peek();
  if (!ch) return this._token(Token.EOF);
  
  if(ch == '<' && this._peek(1) == this._embedChar)
    return this._embed();
  else if(this._inEmbed) {
    if (g.is_digit(ch))
      return this._number();
    if (ch == '"' || ch == "'")
      return this._string();
    if (g.is_punctuation(ch))
      return this._punctuation();
    if (ch == ".")
      return this._dot();
    if (ch == "/")
      return this._slash();
    if (g.is_operator(ch)) {
      if (ch == this._embedChar && this._peek(1) == ">")
        return this._embed();
      else
        return this._operator();
    }
    if (ch == "\\" || g.is_identifier_start(ch))
      return this._word();

    this._error("Unexpected character '" + ch + "'");
  } else {
    return this._output();
  }
}

Lexer.prototype._peek = function(i) {
  i = i || 0;
  return this.source.charAt(this._pos + i);
}

Lexer.prototype._next = function(throwEof) {
  var ch = this.source.charAt(this._pos++);
  if (throwEof && !ch) throw EX_EOF;
  if (ch == "\n") {
    this._newLineBefore = true;
    this._line++;
    this._col = 0;
  } else {
    this._col++;
  }
  return ch;
}

Lexer.prototype._skipWhitespace = function() {
  while (g.is_whitespace(this._peek())) this._next();
}

Lexer.prototype._readWhile = function(pred) {
  var ret = "", ch = this._peek(), i = 0;
  while (ch && pred(ch, i++)) {
    ret += this._next();
    ch = this._peek();
  }
  return ret;
};


Lexer.prototype._eof = function() {
  return !this._peek();
};

Lexer.prototype._find = function(ch, throwEof) {
  var pos = this.source.indexOf(ch, this._pos);
  if (throwEof && pos == -1) throw EX_EOF;
  return pos;
};

Lexer.prototype._output = function() {
  var i = this._find("<" + this._embedChar), text;
  if (i == -1) {
    text = this.source.substr(this._pos);
    this._pos = this.source.length;
  } else {
    text = this.source.substring(this._pos, i);
    this._pos = i;
  }
  
  this._line += text.split("\n").length - 1;
  this._newlineBefore = text.indexOf("\n") >= 0;
  return this._token(Token.OUTPUT, text, true);
}

Lexer.prototype._embed = function() {
  var tag = this._next() + this._next()
    , ch = this._peek();
  if(tag == '<' + this._embedChar) {
    this._inEmbed = true;
    if(ch == '=' || ch == '-') return this._token(Token.EMBED, this._next());
    else return this.nextToken();
  } else if(tag == this._embedChar + '>') {
    this._inEmbed = false;
    return this.nextToken();
  }
  else this._error('invalid embed token "'+ word + '"');
}

Lexer.prototype._punctuation = function() {
  return this._token(Token.PUNCTUATION, this._next());
}

Lexer.prototype._number = function(prefix) {
  var hasE = false, afterE = false, hasX = false, hasDot = (prefix == ".");
  var num = this._readWhile(function(ch, i){
    
    if (ch == "x" || ch == "X") {
            if (hasX) return false;
            return hasX = true;
    }
    
    if (!hasX && (ch == "E" || ch == "e")) {
            if (hasE) return false;
            return hasE = afterE = true;
    }
    
    if (ch == "-") {
            if (afterE || (i == 0 && !prefix)) return true;
            return false;
    }
    
    if (ch == "+") return afterE;
    
    afterE = false;
    if (ch == ".") {
            if (!hasDot && !hasX)
                    return hasDot = true;
            return false;
    }
    
    return g.is_alphanumeric(ch);
  });
  
  if (prefix) num = prefix + num;
  
  var valid = parseJSNumber(num);
  if (!isNaN(valid)) return this._token(Token.NUMBER, valid);
  else this._error("Invalid syntax: " + num);
}

Lexer.prototype._escapedChar = function() {
  var ch = this._next(true);
  switch (ch) {
    case "n" : return "\n";
    case "r" : return "\r";
    case "t" : return "\t";
    case "b" : return "\b";
    case "v" : return "\v";
    case "f" : return "\f";
    case "0" : return "\0";
    case "x" : return String.fromCharCode(this._hexBytes(2));
    case "u" : return String.fromCharCode(this._hexBytes(4));
    default  : return ch;
  }
};

Lexer.prototype._hexBytes = function(n) {
  var num = 0;
  for (; n > 0; --n) {
    var digit = parseInt(this._next(true), 16);
    if (isNaN(digit))
      this._error("Invalid hex-character pattern in string");
    num = (num << 4) | digit;
  }
  return num;
}

Lexer.prototype._string = function() {
  var self = this;
  return this._withEofError("Unterminated string constant", function(){
    var quote = self._next(), ret = "";
    for (;;) {
      var ch = self._next(true);
      if (ch == "\\") ch = self._escapedChar();
      else if (ch == quote) break;
      ret += ch;
    }
    return self._token(Token.STRING, ret);
  });
}

Lexer.prototype._comment = function() {
  this._next();

  var i = this._find("\n"), ret;
  if (i == -1) {
    ret = this.source.substr(this._pos);
    this._pos = this.source.length;
  } else {
    var j = this._find(this._embedChar + ">");
    if (j > -1 && j < i) i = j;
    ret = this.source.substring(this._pos, i);
    this._pos = i;
  }
  return this._token(Token.COMMENT, ret, true);
};

Lexer.prototype._commentBlock = function() {
  this._next();
  
  var self = this;
  return this._withEofError("Unterminated multiline comment", function() {
    var i = self._find("*/", true)
      , text = self.source.substring(self._pos, i)
      , tok = self._token(Token.COMMENT_BLOCK, text, true);
    self._pos = i + 2;
    self._line += text.split("\n").length - 1;
    self._newlineBefore = text.indexOf("\n") >= 0;
    return tok;
  });
};

Lexer.prototype._name = function() {
  var backslash = false
    , name = ""
    , ch;
  
  while ((ch = this._peek()) != null) {
    if (!backslash) {
      if (ch == "\\") backslash = true, this._next();
      else if (g.is_identifier_char(ch)) name += this._next();
      else break;
    } else {
      if (ch != "u") this._error("Expecting UnicodeEscapeSequence -- uXXXX");
      ch = this._escapedChar();
      if (!g.is_identifier_char(ch)) this._error("Unicode char: " + ch.charCodeAt(0) + " is not valid in identifier");
      name += ch;
      backslash = false;
    }
  }
  return name;
};

Lexer.prototype._regexp = function() {
  var self = this;
  return this._withEofError("Unterminated regular expression", function() {
    var ch
      , regexp = ""
      , inClass = false
      , prevBackslash = false;
      
    while ((ch = self._next(true))) if (prevBackslash) {
      regexp += "\\" + ch;
      prevBackslash = false;
    } else if (ch == "[") {
      inClass = true;
      regexp += ch;
    } else if (ch == "]" && inClass) {
      inClass = false;
      regexp += ch;
    } else if (ch == "/" && !inClass) {
      break;
    } else if (ch == "\\") {
      prevBackslash = true;
    } else {
      regexp += ch;
    }
    var mods = self._name();
    return self._token(Token.REGEXP, [ regexp, mods ]);
  });
};

Lexer.prototype._operator = function(prefix) {
  var self = this;
  function grow(op) {
    if (!self._peek()) return op;
    var bigger = op + self._peek();
    if (g.is_operator(bigger)) {
      self._next();
      return grow(bigger);
    } else return op;
  };
  return this._token(Token.OPERATOR, grow(prefix || this._next()));
};

Lexer.prototype._slash = function() {
  this._next();
  var regexpAllowed = this._regexpAllowed;
  switch (this._peek()) {
      case "/":
          var comment = this._comment();
          if(comment) this._commentsBefore.push(comment);
          this._regexpAllowed = regexpAllowed;
          return this.nextToken();
      case "*":
          var comment = this._commentBlock();
          if(comment) this._commentsBefore.push(comment);
          this._regexpAllowed = regexpAllowed;
          return this.nextToken();
  }
  return this._regexpAllowed ? this._regexp() : this._operator("/");
};

Lexer.prototype._dot = function() {
  this._next();
  return g.is_digit(this._peek()) ? this._number(".") : this._token(Token.PUNCTUATION, ".");
};

Lexer.prototype._word = function() {
  var word = this._name();
  if(g.is_keyword(word)) {
    if(g.is_operator(word))
      return this._token(Token.OPERATOR, word)
    else if (g.is_keyword_atom(word))
        return this._token(Token.ATOM, word)
    else
        return this._token(Token.KEYWORD, word);
  } else return this._token(Token.NAME, word);
};

Lexer.prototype._withEofError = function(message, cont) {
  try {
    return cont();
  } catch(ex) {
    if (ex === EX_EOF) this._error(message);
    else throw ex;
  }
};

Lexer.prototype._token = function(type, value, isComment) {
  this._regexpAllowed = ((type == Token.OPERATOR && !g.is_unary_postfix(value)) ||
                        (type == Token.KEYWORD && g.is_keyword_before_expression(value)) ||
                        (type == Token.PUNCTUATION && g.is_punctuation_before_expression(value)));
  
  this._curToken = new Token(type, value, this._line, this._col, this._pos);
  
  if (!isComment && this._commentsBefore.length) {
    this._curToken.commentsBefore = this._commentsBefore;
    this._commentsBefore = [];
  }
  
  if(this._newLineBefore) {
    this._curToken.newLineBefore = this._newLineBefore;
    this._newLineBefore = false;
  }
  
  if(!this._curToken.isComment() || this._includeComments)
    this.tokens.push(this._curToken);
  
  return this._curToken;
};

Lexer.prototype._error = function(message) {
  throw new Error(message); // should be ParseError
};

var Token = module.exports.Token = function(type, value, line, col, pos) {
  if(typeof type == 'undefined') throw new Error('undefined token type');

  this.type = type;
  this.name = Token[type];
  this.value = value;
  this.line = line;
  this.col = col;
  this.pos = pos;
};

Token.prototype.isComment = function() {
  return this.type == Token.COMMENT || this.type == Token.COMMENT_BLOCK;
}

Token.prototype.toString = function() {
  return '[' + this.type + ', ' + this.value + ']';
};

var tokenTypes = [
  'output'
, 'embed'
, 'operator'
, 'keyword'
, 'atom'
, 'name'
, 'punctuation'
, 'string'
, 'number'
, 'regexp'
, 'comment'
, 'comment_block'
, 'eof'
];

tokenTypes.forEach(function(name) {
  name = name.toUpperCase()
  Token[name] = 'T_' + name;
  Token[Token[name]] = name;
});

var ParseError = module.exports.ParseError = function(message, line, col, pos) {
  this.message = message;
  this.line = line;
  this.col = col;
  this.pos = pos;
  try {
          ({})();
  } catch(ex) {
          this.stack = ex.stack;
  };
};

/* utilities */

var EX_EOF = {};

var RE_HEX_NUMBER = /^0x[0-9a-f]+$/i;
var RE_OCT_NUMBER = /^0[0-7]+$/;
var RE_DEC_NUMBER = /^\d*\.?\d*(?:e[+-]?\d*(?:\d\.?|\.?\d)\d*)?$/i;

function parseJSNumber(num) {
  if (RE_HEX_NUMBER.test(num)) {
    return parseInt(num.substr(2), 16);
  } else if (RE_OCT_NUMBER.test(num)) {
    return parseInt(num.substr(1), 8);
  } else if (RE_DEC_NUMBER.test(num)) {
    return parseFloat(num);
  }
};