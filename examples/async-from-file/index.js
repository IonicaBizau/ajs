const ajs = require('../..');

ajs.renderFile("input.ajs", {
    getFruits (cb) {
    	setTimeout(function () {
    		cb(["Apple", "Pear", "Orange"]);
	}, 100);
    }
}, (err, data) => {
    console.log(err || data);
});
