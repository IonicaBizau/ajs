const ajs = require('../..');

ajs.renderFile("input.ajs", {
    fruits: ["Apple", "Pear", "Orange"]
}, (err, data) => {
    console.log(err || data);
});
