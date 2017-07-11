mongoose = require("mongoose")
nconf = require("nconf")
mime = require("mime")
genid = require("genid")
url = require("url")


apiUrl = nconf.get('url:api')
wwwUrl = nconf.get('url:www')
runUrl = nconf.get('url:run')

errorConnecting = ->
  console.error "Error connecting to mongodb"
  process.exit(1)

plunkerDb = mongoose.createConnection nconf.get("mongodb:uri")
plunkerDbTimeout = setTimeout(errorConnecting, 1000 * 30)

plunkerDb.on "open", -> clearTimeout(plunkerDbTimeout)
plunkerDb.on "error", (err) -> console.log "[ERR] Database error:", err
plunkerDb.on "disconnected", (err) -> console.log "[WARN] Database disconnected:", arguments...
plunkerDb.on "reconnected", (err) -> console.log "[WARN] Database reconnected:", arguments...



# Enable Query::paginate
require "./plugins/paginate"



module.exports =
  Session: plunkerDb.model "Session", require("./schema/session").SessionSchema
  User: plunkerDb.model "User", require("./schema/user").UserSchema
  Plunk: plunkerDb.model "Plunk", require("./schema/plunk").PlunkSchema
  Package:plunkerDb.model "Package", require("./schema/package").PackageSchema


