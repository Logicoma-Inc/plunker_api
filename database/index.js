var apiUrl, errorConnecting, genid, mime, mongoose, nconf, plunkerDb, plunkerDbTimeout, runUrl, url, wwwUrl,
  slice = [].slice;

mongoose = require("mongoose");

nconf = require("nconf");

mime = require("mime");

genid = require("genid");

url = require("url");

apiUrl = nconf.get('url:api');

wwwUrl = nconf.get('url:www');

runUrl = nconf.get('url:run');

errorConnecting = function() {
  console.error("Error connecting to mongodb");
  return process.exit(1);
};

plunkerDb = mongoose.createConnection(nconf.get("mongodb:uri"));

plunkerDbTimeout = setTimeout(errorConnecting, 1000 * 30);

plunkerDb.on("open", function() {
  return clearTimeout(plunkerDbTimeout);
});

plunkerDb.on("error", function(err) {
  return console.log("[ERR] Database error:", err);
});

plunkerDb.on("disconnected", function(err) {
  return console.log.apply(console, ["[WARN] Database disconnected:"].concat(slice.call(arguments)));
});

plunkerDb.on("reconnected", function(err) {
  return console.log.apply(console, ["[WARN] Database reconnected:"].concat(slice.call(arguments)));
});

require("./plugins/paginate");

module.exports = {
  Session: plunkerDb.model("Session", require("./schema/session").SessionSchema),
  User: plunkerDb.model("User", require("./schema/user").UserSchema),
  Plunk: plunkerDb.model("Plunk", require("./schema/plunk").PlunkSchema),
  Package: plunkerDb.model("Package", require("./schema/package").PackageSchema)
};
