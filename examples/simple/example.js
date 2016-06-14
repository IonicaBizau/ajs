const ajs = require('../..');
var str = `<% posts.forEach(function (c) { %>
    - <%= c -%>
<% }) %>`;

ajs.render(str, {
    filename: "foo.js",
    locals: {
        posts: ["Apple", "Pear", "Orange"]
    }
}, function (err, data) {
    console.log(err || data);
});
