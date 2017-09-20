var Plunk, User, apiErrors, authenticateGithubToken, nconf, ref, request, users, withCurrentUser, withUser;

nconf = require("nconf");

request = require("request");

users = require("./users");

apiErrors = require("../errors");

ref = require("../database"), User = ref.User, Plunk = ref.Plunk;

module.exports.authenticateGithubToken = authenticateGithubToken = function(token, cb) {
  var config;
  if (!token) {
    return cb();
  }
  config = {
    url: "https://api.github.com/user?access_token=" + token,
    json: true,
    timeout: 6000,
    headers: {
      'User-Agent': "plunker-api"
    }
  };
  return request.get(config, function(err, res, body) {
    if (err) {
      return cb(err);
    }
    if (res.status >= 400) {
      return cb(new apiErrors.PermissionDenied);
    }
    return cb(null, body);
  });
};

module.exports.upsert = function(userInfo, cb) {
  var query, update;
  query = {
    service_id: userInfo.service_id
  };
  update = function(user) {
    return user.set(userInfo).save(function(err) {
      return cb(err, user);
    });
  };
  return User.findOne(query, 'gravatar_id login service_id').exec(function(err, user) {
    if (err) {
      return cb(err);
    } else if (user) {
      return update(user);
    } else {
      return update(new User);
    }
  });
};

module.exports.correct = function(invalid_id, correct_id) {
  return User.findOne({
    service_id: invalid_id
  }, 'gravatar_id login service_id', function(err, user) {
    if (err) {
      return console.log("[ERR] Failed to query for " + invalid_id);
    } else if (user) {
      return Plunk.update({
        user: user._id
      }, {
        user: correct_id
      }, {
        multi: true
      }, function(err, numAffected) {
        console.log("[OK] Fixed " + numAffected + " plunks by " + user.login + " incorrectly attributed to " + invalid_id);
        return user.remove(function(err) {
          if (err) {
            return console.log("[ERR] Failed to remove duplicate user " + user.login);
          } else {
            return console.log("[OK] Removed duplicate user " + user.login);
          }
        });
      });
    }
  });
};

module.exports.withUser = withUser = function(req, res, next) {
  return User.findOne({
    login: req.params.login
  }, 'gravatar_id login service_id').exec(function(err, user) {
    if (err) {
      return next(new apiErrors.DatabaseError(err));
    }
    if (!user) {
      return next(new apiErrors.NotFound);
    }
    req.user = user;
    return next();
  });
};

module.exports.withCurrentUser = withCurrentUser = function(req, res, next) {
  if (!req.currentUser) {
    return next(new apiErrors.NotFound);
  }
  return next();
};

module.exports.read = function(req, res, next) {
  return res.json(req.user.toJSON());
};
