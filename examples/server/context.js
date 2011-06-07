// var mysql = new (require('mysql').Client)
//   , node  = {};
// 
// mysql.user = 'dbuser';
// mysql.password = 'passwd';
// mysql.connect();
// mysql.query('USE blog');
// 
// for(name in process.binding('natives')) {
//   node[name] = require(name);
// }
// 
// module.exports.mysql = mysql;
// module.exports.node = node;

var mysqlMock = {
  query: function(query, viewCallback) {
    setTimeout(function() {
      viewCallback(null, [
        {id: 1, title: '10 Quick Photography Tips', body: '<p>Some Sample Text</p>'}
      , {id: 1, title: 'Some Post Title', body: '<p>With Sample Content</p>'}
      , {id: 1, title: 'Another Interesting Post', body: '<p>Welcome to our blog!</p>'}
      ]);
    }, 10);
  }
}

module.exports.mysqlMock = mysqlMock