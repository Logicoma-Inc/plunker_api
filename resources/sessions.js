var LRU, MAX_AGE, Session, _, analytics, apiErrors, createSession, loadSession, nconf, request, sessionCache, users,
  slice = [].slice;

nconf = require("nconf");

analytics = require("analytics-node");

request = require("request");

users = require("./users");

apiErrors = require("../errors");

_ = require("underscore")._;

LRU = require("lru-cache");

sessionCache = LRU({
  max: 400,
  maxAge: 1000 * 60 * 60 * 24 * 7
});

Session = require("../database").Session;

MAX_AGE = 1000 * 60 * 60 * 24 * 7 * 2;

module.exports.prune = function(cb) {
  if (cb == null) {
    cb = function() {};
  }
  return Session.remove({
    last_access: {
      $lt: Date.now() - MAX_AGE
    }
  }).exec(cb);
};

module.exports.createSession = createSession = function(user, cb) {
  var session;
  session = {
    last_access: new Date,
    keychain: {}
  };
  if (user) {
    session.user = user._id;
  }
  return Session.create(session, cb);
};

module.exports.loadSession = loadSession = function(sessid, cb) {
  var query, sessionData;
  if (!(sessid && sessid.length)) {
    return cb();
  }
  if (sessionData = sessionCache.get(sessid)) {
    return cb(null, sessionData);
  }
  sessionData = {
    last_access: Date.now(),
    expires_at: Date.now() + 1000 * 60 * 60 * 24 * 7 * 2
  };
  query = Session.findByIdAndUpdate(sessid, sessionData);
  query.populate("user", 'gravatar_id login service_id');
  return query.exec(function(err, session) {
    if (err) {
      return cb(err);
    } else {
      sessionCache.set(sessid, session);
      return cb(null, session);
    }
  });
};

module.exports.withSession = function(req, res, next) {
  return loadSession(req.params.id, function(err, session) {
    if (err) {
      return next(new apiErrors.DatabaseError(err));
    } else if (!session) {
      return next(new apiErrors.NotFound);
    } else {
      req.session = session;
      return next();
    }
  });
};

module.exports.withCurrentSession = function(req, res, next) {
  if (req.currentSession) {
    return next();
  } else {
    return next(new apiErrors.NotFound);
  }
};

module.exports.findOrCreate = function(req, res, next) {
  if (req.session) {
    return res.json(req.session.toJSON());
  } else {
    return createSession(null, function(err, session) {
      if (err) {
        return next(new apiErrors.DatabaseError(err));
      } else if (session) {
        return res.json(session.toJSON());
      } else {
        console.log("[ERR] findOrCreate");
        return next(new apiErrors.ImpossibleError);
      }
    });
  }
};

module.exports.read = function(req, res, next) {
  return loadSession(req.params.id, function(err, session) {
    if (err) {
      return next(new apiErrors.DatabaseError(err));
    } else if (session) {
      return res.json(session.toJSON());
    } else {
      return next(new apiErrors.NotFound);
    }
  });
};

module.exports.create = function(req, res, next) {
  return createSession(null, function(err, session) {
    if (err) {
      return next(new apiErrors.DatabaseError(err));
    } else if (session) {
      return res.json(session.toJSON());
    } else {
      console.log("[ERR] createSession");
      return next(new apiErrors.ImpossibleError);
    }
  });
};

module.exports.setUser = function(req, res, next) {
  var token;
  token = req.param("token");
  return users.authenticateGithubToken(token, function(err, ghuser) {
    var userInfo;
    if (err) {
      return next(new apiErrors.DatabaseError(err));
    }
    if (!ghuser) {
      return next(new apiErrors.NotFound);
    }
    userInfo = {
      login: ghuser.login,
      gravatar_id: ghuser.gravatar_id,
      service_id: "github:" + ghuser.id
    };
    return users.upsert(userInfo, function(err, user) {
      if (err) {
        return next(new apiErrors.DatabaseError(err));
      }
      if (!user) {
        return next(new apiErrors.NotFound);
      }
      users.correct("github:" + ghuser.login, user._id);
      req.session.user = user._id;
      req.session.auth = {
        service_name: "github",
        service_token: token
      };
      return req.session.save(function(err, session) {
        if (err) {
          return next(new apiErrors.DatabaseError(err));
        } else if (session) {
          sessionCache.del(req.session._id);
          return res.json(201, _.extend(session.toJSON(), {
            user: user.toJSON()
          }));
        } else {
          console.log.apply(console, ["[ERR] setUser->session.save"].concat(slice.call(arguments)));
          return next(new apiErrors.ImpossibleError);
        }
      });
    });
  });
};

module.exports.unsetUser = function(req, res, next) {
  req.session.user = null;
  req.session.auth = null;
  return req.session.save(function(err, session) {
    if (err) {
      return next(apiErrors.DatabaseError(err));
    } else if (session) {
      sessionCache.set(req.session._id, req.session);
      return res.json(session.toJSON());
    } else {
      console.log.apply(console, ["[ERR] unsetUser->session.save"].concat(slice.call(arguments)));
      return next(new apiErrors.ImpossibleError);
    }
  });
};
