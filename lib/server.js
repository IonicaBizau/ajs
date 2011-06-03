var cluster         = require('cluster')
    , util          = require('util')
    , EventEmitter  = require('events').EventEmitter
    , exec          = require('child_process').exec;

/**
 * Configure a frisbee server from given options
 *
 * @param {Object} options
 * @return {Server}
 * @api public
 */

var Server = module.exports = function(options) {
  EventEmitter.call(this);
  
  var opts = options || {};
  
  this.rootDir      = opts.rootDir || process.cwd();
  this.port         = opts.port || 3000;
  this.host         = opts.host || '127.0.0.1';
  this.workers      = opts.workers || undefined;
  this.environment  = process.env['NODE_ENV'] = opts.environment || process.env['NODE_ENV'];
  
  this.reloadPath   = opts.reloadPath || this.rootDir + '/lib';
  this.logDir       = opts.logDir || (this.rootDir + '/logs');
  this.pidDir       = opts.pidDir || (this.rootDir + '/pids');
  this.socketDir    = opts.socketDir || (this.rootDir + '/tmp');
  
  this.name         = this.rootDir.split('/').pop()
  this.title        = this.name + ' master';
  this.workerTitle  = this.name + ' {n}';
  
  this.requiredDirs = [this.logDir, this.pidDir, this.socketDir];
}

/**
 * Inherit from EventEmitter
 */

util.inherits(Server, EventEmitter);

/**
 * Start listening now, can provide port here
 *
 * @api public
 */

Server.prototype.listen = function(port) {
  this.port = port || this.port;
  self = this;
  this.ensureDirs(this.requiredDirs, function(){
    self.configure();
    self.cluster.on('listening', function(){
      console.log('AJS serving \'' + self.name + '\' at http://' + self.host + ':' + self.port + '/');
      self.emit('listening');
    }).listen(self.port);
  });
}

 /**
  * Configure the cluster
  *
  * @api private
  */
  
Server.prototype.configure = function() {
  require.paths.unshift(this.rootDir);
  this.requiredPaths = [];
  this.cluster = cluster(this.rootDir + '/index')
    .set('working directory', this.rootDir)
    .set('socket path', this.socketDir)
    .set('title', this.title)
    .set('worker title', this.workerTitle)
    .in('development')
      .use(cluster.reload(this.reloadPath))
      .use(cluster.logger(this.logDir, 'info'))
    .in('production')
      .use(cluster.logger(this.logDir, 'warning'))
    .in('all')
      .use(cluster.pidfiles(this.pidDir))
      .use(cluster.cli());

  if(this.workers) this.cluster.set('workers', this.workers);
}

/**
 * Make sure needed dirs are present
 *
 * @api private
 */

Server.prototype.ensureDirs = function(dirs, cb) {
  var count = dirs.length;
  (function ensure(i) {
    if(i >= count)
      cb();
    else {
      var dir = dirs[i];
      exec('mkdir -p -m 0755 ' + dir, function (err, stdout, stderr) {
        if(err) throw err;
        ensure(++i);
      });
    }
  })(0);
}