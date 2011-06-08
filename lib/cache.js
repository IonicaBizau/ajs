// [&laquo; Back to Index](index.html)

var fs = require('fs');

// A very simple singleton memory cache to store compiled template functions for
// extremely fast retrieval. We use a file's mtime (modified time) to determine
// when the cache is stale and needs to be refreshed.
module.exports = new (function() {
  this._store = {};
  
  this.get = function(filename, callback) {
    var cached = this._store[filename];
    if(!cached) return callback(null, null);
    
    fs.stat(filename, function(err, stat) {
      if(err) return callback(err);
      if(cached.mtime.toString() != stat.mtime.toString())
        callback(null, null);
      else callback(null, cached.template);
    });
  }

  this.getSync = function(filename) {
    var cached = this._store[filename];
    if(!cached) return null;

    var stat = fs.statSync(filename);
    if(cached.mtime.toString() != stat.mtime.toString())
      return null;
    else return cached.template;
  }

  this.set = function(filename, template) {
    var self = this;
    fs.stat(filename, function(err, stat) {
      if(stat) {
        self._store[filename] = {
          template: template
        , mtime: stat.mtime
        };
      };
    });
  }
})();
