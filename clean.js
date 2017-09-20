var config, db, slice = [].slice;
  
config = require("./configure");
db = require("./database");

db.Plunk.count({
    _id: {
        $in: []
    }
}, function (err) {
    return console.log.apply(console, ["DONE"].concat(slice.call(arguments)));
});
