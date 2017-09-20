var badSessions, errors, nconf, sessions;

nconf = require("nconf");

sessions = require("../resources/sessions");

errors = require("../errors");

badSessions = ["52a56d9f1aeed79fe80163ea"];

module.exports.middleware = function(config) {
  if (config == null) {
    config = {};
  }
  return function(req, res, next) {
    var auth, header, ref, sessid;
    if (req.query.sessid) {
      sessid = req.query.sessid;
    } else if (auth = req.get("authorization")) {
      ref = auth.match(/^token (\S+)$/i), header = ref[0], sessid = ref[1];
    }
    if (sessid) {
      return sessions.loadSession(sessid, function(err, session) {
        if (err) {
          return next(err);
        }
        if (!session) {
          return next();
        }
        if (!(0 > badSessions.indexOf(sessid))) {
          console.log("[SPAM] Filtering out spam for sessid: " + sessid);
          return next(new errors.NotFound);
        }
        req.currentSession = session;
        if (session.user) {
          req.currentUser = session.user;
        }
        return next();
      });
    } else {
      return next();
    }
  };
};
